import type { Track } from '../types';
import { parseLrc, type LyricLine } from '../lib/lyrics';

/**
 * Paroles officielles via l'API publique **LRCLIB** (lrclib.net), sans clé.
 *
 * Deux temps : `/api/get` avec les noms exacts (le plus précis), puis
 * `/api/search` si la fiche exacte n'existe pas — les titres iTunes et Spotify
 * portent souvent des suffixes (« Remastered 2011 », « - Live ») que la base
 * n'utilise pas.
 *
 * Le service autorise CORS (`Access-Control-Allow-Origin: *`) : l'appel part
 * donc directement du navigateur, sans proxy. Les réponses sont mises en cache
 * en mémoire (une heure, 120 titres) pour ne pas marteler l'API en passant
 * d'un titre à l'autre.
 */

const BASE = 'https://lrclib.net/api';
const FETCH_TIMEOUT_MS = 12_000;
const CACHE_TTL_MS = 60 * 60 * 1000;
const MAX_ENTRIES = 120;

export type Lyrics =
  /** Paroles horodatées, prêtes pour le défilement. */
  | { kind: 'synced'; lines: LyricLine[] }
  /** Paroles en texte simple (aucun horodatage fourni). */
  | { kind: 'plain'; text: string }
  /** Le morceau est instrumental. */
  | { kind: 'instrumental' }
  /** Rien trouvé dans la base. */
  | { kind: 'none' };

interface CacheEntry {
  at: number;
  value: Lyrics;
}

const cache = new Map<string, CacheEntry>();

function cacheKey(track: Track): string {
  return [track.artist, track.title, track.album ?? '', Math.round((track.durationMs ?? 0) / 1000)].join('|');
}

function readCache(key: string): Lyrics | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

function writeCache(key: string, value: Lyrics): void {
  if (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { at: Date.now(), value });
}

/** Combine le signal de l'appelant avec un timeout de sécurité. */
function combinedSignal(signal?: AbortSignal): { signal: AbortSignal; cleanup: () => void } {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new DOMException('timeout', 'AbortError')), FETCH_TIMEOUT_MS);
  const cleanup = () => clearTimeout(timer);
  if (!signal) return { signal: ctrl.signal, cleanup };
  if (signal.aborted) {
    cleanup();
    return { signal, cleanup: () => {} };
  }
  const onAbort = () => ctrl.abort(signal.reason ?? new DOMException('aborted', 'AbortError'));
  signal.addEventListener('abort', onAbort, { once: true });
  return {
    signal: ctrl.signal,
    cleanup: () => {
      cleanup();
      signal.removeEventListener('abort', onAbort);
    },
  };
}

/** `null` si LRCLIB ne connaît pas la fiche (404), lève pour les autres codes. */
async function getJson(url: string, signal: AbortSignal): Promise<any | null> {
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** « Titre (Remastered 2011) » → « titre » : pour comparer des libellés. */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\[[^\]]*]/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+-\s+.*$/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Convertit une fiche LRCLIB en `Lyrics`, ou `null` si elle est inutilisable. */
function toLyrics(record: any): Lyrics | null {
  if (!record) return null;
  if (record.instrumental === true) return { kind: 'instrumental' };
  if (typeof record.syncedLyrics === 'string' && record.syncedLyrics.trim()) {
    const lines = parseLrc(record.syncedLyrics as string);
    if (lines.length > 0) return { kind: 'synced', lines };
  }
  if (typeof record.plainLyrics === 'string' && record.plainLyrics.trim()) {
    return { kind: 'plain', text: (record.plainLyrics as string).trim() };
  }
  return null;
}

/** Parmi des résultats de recherche, garde celui qui ressemble le plus au titre joué. */
function pickBest(records: any[], track: Track): Lyrics | null {
  const wanted = {
    title: normalize(track.title),
    artist: normalize(track.artist),
    seconds: track.durationMs ? Math.round(track.durationMs / 1000) : null,
  };

  const scored = records
    .map((record) => {
      const title = normalize(String(record?.trackName ?? ''));
      const artist = normalize(String(record?.artistName ?? ''));
      let score = 0;
      if (title === wanted.title) score += 6;
      else if (title.includes(wanted.title) || wanted.title.includes(title)) score += 3;
      if (artist === wanted.artist) score += 4;
      else if (artist.includes(wanted.artist) || wanted.artist.includes(artist)) score += 2;
      const seconds = Number(record?.duration);
      if (wanted.seconds && Number.isFinite(seconds) && seconds > 0) {
        if (Math.abs(seconds - wanted.seconds) <= 3) score += 3;
        else if (Math.abs(seconds - wanted.seconds) <= 10) score += 1;
      }
      if (typeof record?.syncedLyrics === 'string' && record.syncedLyrics) score += 2;
      return { record, score };
    })
    .sort((a, b) => b.score - a.score);

  // En dessous de 6, seul le titre correspond vraiment : on préfère « rien »
  // à des paroles d'un autre morceau.
  for (const candidate of scored) {
    if (candidate.score < 6) break;
    const lyrics = toLyrics(candidate.record);
    if (lyrics && lyrics.kind !== 'none') return lyrics;
  }
  return null;
}

/**
 * Cherche les paroles d'un titre. Lève une erreur réseau (ou d'abandon) ;
 * renvoie `{ kind: 'none' }` quand la base ne connaît pas le morceau.
 */
export async function fetchLyrics(track: Track, signal?: AbortSignal): Promise<Lyrics> {
  const title = track.title.trim();
  const artist = track.artist.trim();
  if (!title || !artist) return { kind: 'none' };

  const key = cacheKey(track);
  const cached = readCache(key);
  if (cached) return cached;

  if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
  const { signal: sig, cleanup } = combinedSignal(signal);

  try {
    const exact = new URLSearchParams({ artist_name: artist, track_name: title });
    if (track.album) exact.set('album_name', track.album);
    if (track.durationMs) exact.set('duration', String(Math.round(track.durationMs / 1000)));

    const byId = toLyrics(await getJson(`${BASE}/get?${exact}`, sig));
    if (byId) {
      writeCache(key, byId);
      return byId;
    }

    const search = await getJson(
      `${BASE}/search?${new URLSearchParams({ q: `${artist} ${title}` })}`,
      sig
    );
    const found = Array.isArray(search) ? pickBest(search, track) : null;
    const result: Lyrics = found ?? { kind: 'none' };
    // Un « rien trouvé » n'est pas mis en cache durablement : la base évolue.
    if (result.kind !== 'none') writeCache(key, result);
    return result;
  } finally {
    cleanup();
  }
}
