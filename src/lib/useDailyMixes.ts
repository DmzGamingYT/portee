import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_ARTISTS, useStore } from '../store';
import { unifiedSearchTracks } from '../api/search';
import type { Track } from '../types';
import {
  buildFavoritesMix,
  buildSeedTracks,
  mixDayKey,
  planDailyMixes,
  type DailyMix,
  type DailyMixSeed,
  type TasteInput,
  type TasteProfile,
} from './dailyMix';

/**
 * Chargement des Daily Mix : plan stable pour la journée, résolution des
 * graines via le catalogue existant (iTunes, ou Spotify si connecté), puis
 * mise en cache locale pour la journée.
 *
 * Le cache évite de refaire les requêtes à chaque navigation et garantit un
 * mix identique toute la journée. « Recalculer » purge le cache et reprend le
 * profil le plus récent.
 */

const CACHE_KEY = 'spotifycraft-daily-mixes';
// Toute évolution du plan ou du classement doit invalider le cache du jour.
const CACHE_VERSION = 2;
const TRACK_LIMIT = 24;

interface CachedMixes {
  version: number;
  day: string;
  mixes: DailyMix[];
}

let memory: CachedMixes | null = null;

function isAbort(err: unknown): boolean {
  if (err instanceof DOMException) return err.name === 'AbortError';
  if (typeof err === 'object' && err !== null && 'name' in err) {
    return (err as { name?: string }).name === 'AbortError';
  }
  return String(err).toLowerCase().includes('abort');
}

/* --------------------------------- le stockage ------------------------------ */

function isTrackLike(value: unknown): value is Track {
  if (typeof value !== 'object' || value === null) return false;
  const t = value as Partial<Track>;
  return typeof t.id === 'string' && typeof t.title === 'string' && typeof t.artist === 'string';
}

function isMixLike(value: unknown): value is DailyMix {
  if (typeof value !== 'object' || value === null) return false;
  const mix = value as Partial<DailyMix>;
  return (
    typeof mix.id === 'string' &&
    typeof mix.title === 'string' &&
    Array.isArray(mix.tracks) &&
    mix.tracks.every(isTrackLike)
  );
}

function readCached(day: string): DailyMix[] | null {
  if (memory && memory.day === day) return memory.mixes;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedMixes>;
    if (
      parsed.version !== CACHE_VERSION ||
      parsed.day !== day ||
      !Array.isArray(parsed.mixes) ||
      !parsed.mixes.every(isMixLike)
    ) {
      return null;
    }
    memory = { version: CACHE_VERSION, day, mixes: parsed.mixes };
    return parsed.mixes;
  } catch {
    return null;
  }
}

function writeCached(day: string, mixes: DailyMix[]): void {
  memory = { version: CACHE_VERSION, day, mixes };
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ version: CACHE_VERSION, day, mixes } satisfies CachedMixes)
    );
  } catch {
    // quota plein ou stockage refusé : le cache mémoire suffit pour la session
  }
}

/** Purge le cache du jour (mémoire + stockage) — utilisé par « Recalculer ». */
export function clearDailyMixCache(): void {
  memory = null;
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    // rien à faire
  }
}

/* --------------------------------- chargement ------------------------------- */

interface SeedContext {
  day: string;
  signal: AbortSignal;
  profile: TasteProfile;
  exclude: Set<string>;
  liked: Track[];
}

async function fetchSeedTracks(seed: DailyMixSeed, ctx: SeedContext): Promise<DailyMix> {
  if (seed.kind === 'favorites') {
    return { ...seed, tracks: buildFavoritesMix(ctx.liked, ctx.day, TRACK_LIMIT) };
  }

  try {
    const result = await unifiedSearchTracks(seed.term, ctx.signal);
    const tracks = buildSeedTracks(result.tracks, seed, {
      limit: TRACK_LIMIT,
      seedKey: `${ctx.day}|${seed.id}`,
      profile: ctx.profile,
      exclude: ctx.exclude,
    });
    return { ...seed, tracks, failed: tracks.length === 0 && !result.live };
  } catch (err) {
    if (isAbort(err) || ctx.signal.aborted) throw err;
    return { ...seed, tracks: [], failed: true };
  }
}

/** Construit tous les mix du jour (un appel catalogue par graine). */
export async function loadDailyMixes(
  input: TasteInput,
  day: string,
  signal: AbortSignal
): Promise<DailyMix[]> {
  const plan = planDailyMixes(input, { day, starters: DEFAULT_ARTISTS });
  const exclude = new Set<string>();
  for (const track of input.liked) exclude.add(track.id);
  for (const track of input.history.slice(0, 80)) exclude.add(track.id);

  const ctx: SeedContext = {
    day,
    signal,
    profile: plan.profile,
    exclude,
    liked: input.liked,
  };

  const mixes = await Promise.all(plan.seeds.map((seed) => fetchSeedTracks(seed, ctx)));
  if (signal.aborted) throw new DOMException('aborted', 'AbortError');
  return mixes;
}

/* ------------------------------------ hook ---------------------------------- */

export interface DailyMixesState {
  day: string;
  mixes: DailyMix[];
  loading: boolean;
  error: string | null;
  /** true si au moins un mix contient des titres lisibles */
  ready: boolean;
  refresh: () => void;
}

export function useDailyMixes(): DailyMixesState {
  const liked = useStore((s) => s.liked);
  const history = useStore((s) => s.history);
  const playlists = useStore((s) => s.playlists);
  const followed = useStore((s) => s.followed);

  const input = useMemo<TasteInput>(
    () => ({ liked, history, playlists, followed }),
    [liked, history, playlists, followed]
  );

  // Instantané du profil : les mix restent stables même si l'utilisateur
  // like un titre ou écoute un morceau pendant la session.
  const latestInput = useRef(input);
  useEffect(() => {
    latestInput.current = input;
  }, [input]);

  const dayKey = mixDayKey();
  const [nonce, setNonce] = useState(0);
  const [state, setState] = useState<{ day: string; mixes: DailyMix[]; loading: boolean; error: string | null }>(
    () => ({ day: dayKey, mixes: [], loading: true, error: null })
  );

  useEffect(() => {
    const controller = new AbortController();
    const snapshot = latestInput.current;
    const cached = readCached(dayKey);

    if (cached) {
      setState({ day: dayKey, mixes: cached, loading: false, error: null });
      return () => controller.abort();
    }

    setState((s) => ({ day: dayKey, mixes: s.day === dayKey ? s.mixes : [], loading: true, error: null }));

    loadDailyMixes(snapshot, dayKey, controller.signal)
      .then((mixes) => {
        if (controller.signal.aborted) return;
        if (mixes.some((mix) => mix.tracks.length > 0)) writeCached(dayKey, mixes);
        setState({
          day: dayKey,
          mixes,
          loading: false,
          error: mixes.every((mix) => mix.tracks.length === 0)
            ? 'Impossible de générer les mix pour le moment.'
            : null,
        });
      })
      .catch((err) => {
        if (controller.signal.aborted || isAbort(err)) return;
        setState({
          day: dayKey,
          mixes: [],
          loading: false,
          error: 'Impossible de générer les mix pour le moment.',
        });
      });

    return () => controller.abort();
  }, [dayKey, nonce]);

  const refresh = useCallback(() => {
    clearDailyMixCache();
    setNonce((n) => n + 1);
  }, []);

  return {
    ...state,
    ready: state.mixes.some((mix) => mix.tracks.length > 0),
    refresh,
  };
}
