import type { Album, Artist, Track } from '../types';
import {
  getToken,
  isConfigured,
  isConnected,
  logout,
  beginLogin,
  handleCallback,
} from './spotifyAuth';

/** Profil de l'utilisateur Spotify (re-export depuis le module d'auth). */
export type { SpotifyProfile } from './spotifyAuth';
// Re-export des symboles d'auth pour l'UI (un seul point d'entrée « spotify »).
export { isConnected, logout, beginLogin, handleCallback, isConfigured };

/**
 * Client de l'API Spotify (Web API v1) — métadonnées réelles.
 *
 * - Appels via le proxy local `/sp/api/*` (évite CORS/rate-limit et garde le
 *   token côté serveur), avec repli direct sur `api.spotify.com` si le proxy
 *   est absent (hébergement statique).
 * - `market=FR` est transmis partout : c'est ce paramètre qui fait renvoyer
 *   `preview_url` (extraits ~30 s) par Spotify.
 * - Toutes les fonctions échouent proprement (elles lèvent), le parcours les
 *   appelle via `Promise.allSettled` avec repli iTunes.
 *
 * NOTE : Spotify ne fournit que des extraits (pas de morceaux complets) au
 * SDK/API hors compte Premium — le lecteur local reste le moteur de son.
 */

const PROXY_PREFIX = '/sp/api/';
const API_BASE = 'https://api.spotify.com/v1';
const MARKET = 'FR';
const FETCH_TIMEOUT_MS = 15_000;

/* --------------------------------- fetch ---------------------------------- */

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

/** GET JSON avec Authorization Bearer (proxy local, direct, puis repli iTunes). */
async function spGet(path: string, signal?: AbortSignal): Promise<any> {
  if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
  const token = await getToken();
  if (!token) throw new Error('Non connecté à Spotify');
  const { signal: sig, cleanup } = combinedSignal(signal);
  try {
    const res = await fetch(`${PROXY_PREFIX}${path}`, {
      signal: sig,
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    if (res.ok) return res.json();
    // 404 = pas de proxy (statique) : on retente en direct (CORS OK vérifié).
    if (res.status === 404) {
      const direct = await fetch(`${API_BASE}/${path}`, {
        signal: sig,
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      });
      if (direct.ok) return direct.json();
      if (direct.status === 401 || direct.status === 403) {
        // token expiré/refusé : on retente une fois avec un refresh éventuel
        const fresh = await getToken();
        if (fresh && fresh !== token) {
          const retry = await fetch(`${API_BASE}/${path}`, {
            signal: sig,
            headers: { Authorization: `Bearer ${fresh}`, Accept: 'application/json' },
          });
          if (retry.ok) return retry.json();
        }
        throw new Error(`Spotify ${direct.status} — reconnexion requise`);
      }
      throw new Error(`Spotify ${direct.status}`);
    }
    throw new Error(`Spotify ${res.status}`);
  } finally {
    cleanup();
  }
}

/** Profil de l'utilisateur connecté. */
export async function fetchProfile(signal?: AbortSignal): Promise<import('./spotifyAuth').SpotifyProfile> {
  const data = await spGet('me', signal);
  return {
    id: String(data.id),
    display_name: String(data.display_name || data.id),
    email: typeof data.email === 'string' ? data.email : undefined,
    images: Array.isArray(data.images) ? data.images : undefined,
    country: typeof data.country === 'string' ? data.country : undefined,
    product: typeof data.product === 'string' ? data.product : undefined,
  };
}

/* -------------------------------- mappers --------------------------------- */

/** Pochette la plus grande disponible (l'ordre décroît chez Spotify). */
function imageOf(images: Array<{ url: string }> | undefined): string {
  return images && images.length > 0 ? images[0].url : '';
}

function spTrack(r: any): Track | null {
  if (!r || typeof r.id !== 'string' || !r.name) return null;
  const album = r.album ?? {};
  return {
    id: `s${r.id}`, // préfixe : ne collisionne pas avec les ids iTunes (`t…`)
    title: String(r.name),
    artist: (r.artists ?? []).map((a: any) => a.name).join(', ') || 'Artiste inconnu',
    artistId: undefined, // ids Spotify = chaînes (gérées par spotifyArtistId)
    album: String(album.name ?? ''),
    cover: imageOf(album.images),
    preview: typeof r.preview_url === 'string' ? r.preview_url : undefined,
    durationMs: typeof r.duration_ms === 'number' ? r.duration_ms : undefined,
    genre: undefined,
    // enrichissement Spotify (non utilisé par le moteur, utile à l'UI) :
    spotifyId: r.id,
    spotifyUrl: r.external_urls?.spotify,
    spotifyArtistId: r.artists?.[0]?.id,
    spotifyAlbumId: album.id,
    explicit: r.explicit === true,
  } as Track;
}

function spAlbum(r: any): Album | null {
  if (!r || typeof r.id !== 'string' || !r.name) return null;
  return {
    id: r.id, // id Spotify (chaîne) — Album.id est désormais string (types.ts)
    title: String(r.name),
    artist: (r.artists ?? []).map((a: any) => a.name).join(', '),
    spotifyArtistId: r.artists?.[0]?.id,
    cover: imageOf(r.images),
    trackCount: typeof r.total_tracks === 'number' ? r.total_tracks : 0,
    year: typeof r.release_date === 'string' ? r.release_date.slice(0, 4) : undefined,
    genre: undefined,
    spotifyId: r.id,
    spotifyUrl: r.external_urls?.spotify,
  } as Album;
}

function spArtist(r: any): Artist | null {
  if (!r || typeof r.id !== 'string' || !r.name) return null;
  return {
    id: r.id, // id Spotify (chaîne)
    name: String(r.name),
    genre: Array.isArray(r.genres) && r.genres.length > 0 ? String(r.genres[0]) : undefined,
    cover: imageOf(r.images),
    spotifyId: r.id,
    spotifyUrl: r.external_urls?.spotify,
  } as Artist;
}

/* --------------------------------- search --------------------------------- */

export interface SpSearchResult {
  tracks: Track[];
  albums: Album[];
  artists: Artist[];
}

/**
 * Recherche unifiée Spotify (titres + albums + artistes).
 * `market=FR` active le renvoi de `preview_url`.
 */
export async function searchAll(term: string, signal?: AbortSignal): Promise<SpSearchResult> {
  const q = term.trim();
  if (!q) return { tracks: [], albums: [], artists: [] };
  const qs = new URLSearchParams({
    q,
    type: 'track,album,artist',
    limit: '30',
    market: MARKET,
  });
  const data = await spGet(`search?${qs}`, signal);
  const tracks = (data?.tracks?.items ?? []).map(spTrack).filter((t: Track | null): t is Track => t !== null);
  const albums = (data?.albums?.items ?? []).map(spAlbum).filter((a: Album | null): a is Album => a !== null);
  const artists = (data?.artists?.items ?? []).map(spArtist).filter((a: Artist | null): a is Artist => a !== null);
  return { tracks, albums, artists };
}

/**
 * Recherche de titres uniquement (accueil, étagères) : bien plus léger que
 * `searchAll` qui interroge aussi albums et artistes.
 */
export async function searchTracksOnly(term: string, signal?: AbortSignal): Promise<Track[]> {
  const q = term.trim();
  if (!q) return [];
  const qs = new URLSearchParams({ q, type: 'track', limit: '20', market: MARKET });
  const data = await spGet(`search?${qs}`, signal);
  return (data?.tracks?.items ?? [])
    .map(spTrack)
    .filter((t: Track | null): t is Track => t !== null);
}

/** Pistes d'un album Spotify (par album id). */
export async function albumTracks(spotifyAlbumId: string, signal?: AbortSignal): Promise<Track[]> {
  const qs = new URLSearchParams({ market: MARKET, limit: '50' });
  const data = await spGet(`albums/${encodeURIComponent(spotifyAlbumId)}/tracks?${qs}`, signal);
  return (data?.items ?? [])
    .map((t: any) => spTrack(t))
    .filter((t: Track | null): t is Track => t !== null);
}

/** Infos d'un album Spotify (par album id). */
export async function albumDetails(spotifyAlbumId: string, signal?: AbortSignal): Promise<Album | null> {
  const data = await spGet(`albums/${encodeURIComponent(spotifyAlbumId)}?market=${MARKET}`, signal);
  return spAlbum(data ?? null);
}

/** Titres populaires d'un artiste Spotify. */
export async function artistTopTracks(spotifyArtistId: string, signal?: AbortSignal): Promise<Track[]> {
  const qs = new URLSearchParams({ market: MARKET });
  const data = await spGet(
    `artists/${encodeURIComponent(spotifyArtistId)}/top-tracks?${qs}`,
    signal
  );
  return (data?.tracks ?? [])
    .map(spTrack)
    .filter((t: Track | null): t is Track => t !== null);
}

/** Albums d'un artiste Spotify. */
export async function artistAlbums(spotifyArtistId: string, signal?: AbortSignal): Promise<Album[]> {
  const qs = new URLSearchParams({ market: MARKET, limit: '20', include_groups: 'album,single' });
  const data = await spGet(
    `artists/${encodeURIComponent(spotifyArtistId)}/albums?${qs}`,
    signal
  );
  return (data?.items ?? [])
    .map(spAlbum)
    .filter((a: Album | null): a is Album => a !== null);
}

/** Infos d'un artiste Spotify (par artiste id). */
export async function artistDetails(spotifyArtistId: string, signal?: AbortSignal): Promise<Artist | null> {
  const data = await spGet(`artists/${encodeURIComponent(spotifyArtistId)}?market=${MARKET}`, signal);
  return spArtist(data ?? null);
}

/** Indique si le module Spotify est utilisable (client configuré). */
export { isConfigured as isSpotifyConfigured };

/* -------------------------------- helpers --------------------------------- */

/**
 * Version « safe » de `fetchProfile` : renvoie null au lieu de lever
 * (utilisée par la top bar au démarrage, où une erreur ne doit pas bloquer).
 */
export async function fetchProfileSafe(signal?: AbortSignal): Promise<import('./spotifyAuth').SpotifyProfile | null> {
  try {
    return await fetchProfile(signal);
  } catch {
    return null;
  }
}
