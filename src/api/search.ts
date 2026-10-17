import type { Album, Artist, Track } from '../types';
import { searchTracks as itSearchTracks, searchAlbums, searchArtists } from './itunes';
import { searchAll, searchTracksOnly, isConnected } from './spotify';
import { applyPreviews } from '../lib/previewMatch';

/**
 * Recherche unifiée : **Spotify** si connecté (métadonnées réelles), sinon
 * repli **iTunes** (public, sans clé). Même format pour les deux sources :
 * les pages ignorent d'où viennent les données.
 *
 * Depuis fin 2024, Spotify ne fournit plus de `preview_url` aux nouvelles
 * applications. On complète donc les titres Spotify avec les extraits 30 s
 * d'iTunes (`previewSource`) : métadonnées Spotify + audio lisible.
 */

export type SearchSource = 'spotify' | 'itunes';
export type PreviewSource = 'spotify' | 'itunes' | 'mixed' | 'none';

export interface UnifiedSearch {
  tracks: Track[];
  albums: Album[];
  artists: Artist[];
  live: boolean;
  source: SearchSource;
  /** provenance des extraits audio des titres renvoyés */
  previewSource: PreviewSource;
}

export interface UnifiedTrackSearch {
  tracks: Track[];
  live: boolean;
  source: SearchSource;
  previewSource: PreviewSource;
}

/* ---------------------------------- cache ---------------------------------- */

const CACHE_TTL = 5 * 60 * 1000; // 5 min : assez frais, zéro requête en navigation
const CACHE_MAX = 60;

interface CacheEntry<T> {
  at: number;
  value: T;
}

const fullCache = new Map<string, CacheEntry<UnifiedSearch>>();
const trackCache = new Map<string, CacheEntry<UnifiedTrackSearch>>();
let cacheSource: SearchSource | null = null;

function currentSource(): SearchSource {
  return isConnected() ? 'spotify' : 'itunes';
}

/** Vide les caches si l'utilisateur se connecte/déconnecte de Spotify. */
function syncSource(): SearchSource {
  const source = currentSource();
  if (cacheSource !== source) {
    fullCache.clear();
    trackCache.clear();
    cacheSource = source;
  }
  return source;
}

function readCache<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

function writeCache<T>(cache: Map<string, CacheEntry<T>>, key: string, value: T): void {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { at: Date.now(), value });
}

/* --------------------------------- erreurs --------------------------------- */

function isAbort(err: unknown): boolean {
  if (err instanceof DOMException) return err.name === 'AbortError';
  if (typeof err === 'object' && err !== null && 'name' in err) {
    return (err as { name?: string }).name === 'AbortError';
  }
  return String(err).toLowerCase().includes('abort');
}

/* ------------------------------- enrichissement ---------------------------- */

/**
 * Complète les extraits manquants d'une liste de titres via une recherche
 * iTunes (une requête), en rapprochant titre + artiste. Les erreurs non
 * bloquantes renvoient la liste d'origine.
 */
export async function withItunesPreviews(
  tracks: Track[],
  term: string,
  signal?: AbortSignal
): Promise<Track[]> {
  if (tracks.length === 0 || !tracks.some((t) => !t.preview) || !term.trim()) return tracks;
  try {
    const donors = await itSearchTracks(term, signal);
    return applyPreviews(tracks, donors.tracks);
  } catch (err) {
    if (isAbort(err) || signal?.aborted) throw err;
    return tracks;
  }
}

function previewSourceOf(before: Track[], after: Track[]): PreviewSource {
  const had = before.some((t) => t.preview);
  const filled = before.some((t, i) => !t.preview && after[i]?.preview);
  if (filled && had) return 'mixed';
  if (filled) return 'itunes';
  if (had) return 'spotify';
  return 'none';
}

/* --------------------------------- Spotify --------------------------------- */

async function spotifySearch(term: string, signal?: AbortSignal): Promise<UnifiedSearch> {
  const sp = await searchAll(term, signal);
  const before = sp.tracks;

  let tracks = await withItunesPreviews(before, term, signal);
  let previewSource = previewSourceOf(before, tracks);

  // Si vraiment aucun extrait n'est disponible, la lecture passe avant la
  // beauté des métadonnées : on reprend les titres iTunes (lisibles).
  if (tracks.length > 0 && !tracks.some((t) => t.preview)) {
    const fallback = await itSearchTracks(term, signal);
    if (fallback.tracks.length > 0) {
      tracks = fallback.tracks;
      previewSource = 'itunes';
    }
  }

  return { ...sp, tracks, live: true, source: 'spotify', previewSource };
}

/* ---------------------------------- iTunes --------------------------------- */

async function itunesSearch(term: string, signal?: AbortSignal): Promise<UnifiedSearch> {
  const [t, a, r] = await Promise.all([
    itSearchTracks(term, signal),
    searchAlbums(term, signal),
    searchArtists(term, signal),
  ]);
  return {
    tracks: t.tracks,
    albums: a.albums,
    artists: r.artists,
    live: t.live || a.live || r.live,
    source: 'itunes',
    previewSource: t.tracks.some((x) => x.preview) ? 'itunes' : 'none',
  };
}

/* ---------------------------------- public --------------------------------- */

/** Recherche complète (titres + albums + artistes). */
export async function unifiedSearch(
  term: string,
  signal?: AbortSignal
): Promise<UnifiedSearch> {
  const q = term.trim();
  if (!q) {
    return { tracks: [], albums: [], artists: [], live: true, source: 'itunes', previewSource: 'none' };
  }

  const source = syncSource();
  const key = `${source}|${q}`;
  const cached = readCache(fullCache, key);
  if (cached) return cached;

  if (source === 'spotify') {
    try {
      const result = await spotifySearch(q, signal);
      // On ne mémorise que les succès : un échec réseau transitoire ne doit
      // pas coller 5 min et neutraliser le bouton « réessayer ».
      if (!signal?.aborted && result.live) writeCache(fullCache, key, result);
      return result;
    } catch (err) {
      if (isAbort(err) || signal?.aborted) throw err;
      // Spotify indisponible (token expiré, réseau) : repli iTunes silencieux.
    }
  }

  const result = await itunesSearch(q, signal);
  if (!signal?.aborted && result.live) writeCache(fullCache, key, result);
  return result;
}

/**
 * Recherche de **titres** uniquement (accueil, étagères, spotlight) :
 * Spotify si connecté avec extraits complétés, sinon iTunes.
 */
export async function unifiedSearchTracks(
  term: string,
  signal?: AbortSignal
): Promise<UnifiedTrackSearch> {
  const q = term.trim();
  if (!q) return { tracks: [], live: true, source: 'itunes', previewSource: 'none' };

  const source = syncSource();
  const key = `${source}|tracks|${q}`;
  const cached = readCache(trackCache, key);
  if (cached) return cached;

  if (source === 'spotify') {
    try {
      const before = await searchTracksOnly(q, signal);
      const tracks = await withItunesPreviews(before, q, signal);
      const previewSource = previewSourceOf(before, tracks);
      // Filet de sécurité : aucun extrait → titres iTunes.
      if (tracks.length > 0 && !tracks.some((t) => t.preview)) {
        const fallback = await itSearchTracks(q, signal);
        if (fallback.tracks.length > 0) {
          const value: UnifiedTrackSearch = {
            tracks: fallback.tracks,
            live: true,
            source: 'spotify',
            previewSource: 'itunes',
          };
          if (!signal?.aborted && value.live) writeCache(trackCache, key, value);
          return value;
        }
      }
      const value: UnifiedTrackSearch = {
        tracks,
        live: true,
        source: 'spotify',
        previewSource,
      };
      if (!signal?.aborted && value.live) writeCache(trackCache, key, value);
      return value;
    } catch (err) {
      if (isAbort(err) || signal?.aborted) throw err;
    }
  }

  const it = await itSearchTracks(q, signal);
  const value: UnifiedTrackSearch = {
    tracks: it.tracks,
    live: it.live,
    source: 'itunes',
    previewSource: it.tracks.some((t) => t.preview) ? 'itunes' : 'none',
  };
  if (!signal?.aborted && value.live) writeCache(trackCache, key, value);
  return value;
}
