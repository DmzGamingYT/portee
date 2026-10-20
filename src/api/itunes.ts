import type { Album, Artist, Track } from '../types';
import { normalizeText } from '../lib/previewMatch';

/**
 * Client de l'API publique iTunes.
 *
 * Stratégie :
 *  1. Essaie d'abord le proxy local `/it/api/*` (Vite dev/preview) — évite
 *     tout souci de CORS et profite du cache serveur.
 *  2. En cas d'échec (404 = hébergement statique sans proxy, réseau, etc.),
 *     bascule sur un appel direct à `https://itunes.apple.com` qui renvoie
 *     `Access-Control-Allow-Origin: *` et fonctionne donc depuis un navigateur.
 *
 * Aucune clé API requise. Métadonnées réelles + extraits officiels ~30 s.
 */

const PROXY_PREFIX = '/it/api/';
const ITUNES_BASE = 'https://itunes.apple.com';
const COUNTRY = 'FR';
const LANG = 'fr_fr';
const FETCH_TIMEOUT_MS = 15_000;

export interface SearchSongsResponse {
  tracks: Track[];
  live: boolean;
}

export interface SearchAlbumsResponse {
  albums: Album[];
  live: boolean;
}

export interface SearchArtistsResponse {
  artists: Artist[];
  live: boolean;
}

/* ---------------------------------- mapper --------------------------------- */

function coverOf(url: string | undefined, size: number): string {
  if (!url) return '';
  // iTunes renvoie du 60x60 / 100x100 : on demande du 600x600.
  if (/\d+x\d+bb\./.test(url)) return url.replace(/\/\d+x\d+bb\./, `/${size}x${size}bb.`);
  return url;
}

function toNumber(v: unknown): number | undefined {
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return Number.isFinite(n) && (n as number) > 0 ? (n as number) : undefined;
}

function mapTrack(r: any): Track | null {
  const trackId = toNumber(r.trackId);
  if (!trackId || !r.trackName) return null;
  const artistId = toNumber(r.artistId);
  return {
    id: `t${trackId}`,
    title: String(r.trackName ?? 'Titre inconnu'),
    artist: String(r.artistName ?? 'Artiste inconnu'),
    artistId,
    album: String(r.collectionName ?? ''),
    collectionId: toNumber(r.collectionId),
    cover: coverOf(typeof r.artworkUrl100 === 'string' ? r.artworkUrl100 : undefined, 600),
    preview: typeof r.previewUrl === 'string' ? r.previewUrl : undefined,
    durationMs: toNumber(r.trackTimeMillis) ?? undefined,
    genre: typeof r.primaryGenreName === 'string' ? r.primaryGenreName : undefined,
  };
}

function mapAlbum(r: any): Album | null {
  const collectionId = toNumber(r.collectionId);
  if (!collectionId || !r.collectionName) return null;
  return {
    id: String(collectionId),
    title: String(r.collectionName ?? 'Album'),
    artist: String(r.artistName ?? ''),
    artistId: toNumber(r.artistId),
    cover: coverOf(typeof r.artworkUrl100 === 'string' ? r.artworkUrl100 : undefined, 600),
    trackCount: toNumber(r.trackCount) ?? 0,
    year: typeof r.releaseDate === 'string' ? r.releaseDate.slice(0, 4) || undefined : undefined,
    genre: typeof r.primaryGenreName === 'string' ? r.primaryGenreName : undefined,
  };
}

/* ---------------------------------- fetch ---------------------------------- */

function isAbort(err: unknown): boolean {
  return (
    err instanceof DOMException ? err.name === 'AbortError' :
    typeof err === 'object' && err !== null && 'name' in err
      ? (err as { name?: string }).name === 'AbortError'
      : String(err).toLowerCase().includes('abort')
  );
}

/** Combine le signal de l'appelant avec un timeout de sécurité. */
function combinedSignal(signal?: AbortSignal): { signal: AbortSignal; cleanup: () => void } {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new DOMException('timeout', 'AbortError')), FETCH_TIMEOUT_MS);
  const cleanup = () => clearTimeout(timer);
  if (!signal) return { signal: ctrl.signal, cleanup };
  if (signal.aborted) {
    cleanup();
    return { signal: signal, cleanup: () => {} };
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

async function fetchJson(url: string, signal: AbortSignal): Promise<any> {
  const res = await fetch(url, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} pour ${url}`);
  return res.json();
}

/**
 * iTunes renvoie des artistes « proches » même quand le nom ne correspond pas
 * à la recherche (« daft punk » → blink-182, Lil Nas X…). On garde donc les
 * correspondances de nom en priorité et on écarte le bruit dès qu'au moins
 * une correspondance existe ; sans aucune correspondance (recherche par
 * titre, par genre…), on conserve la liste d'Apple telle quelle.
 */
function rankArtists(artists: Artist[], term: string): Artist[] {
  const q = normalizeText(term);
  const tokens = q.split(/[^a-z0-9]+/).filter((token) => token.length > 1);
  if (!q || tokens.length === 0) return artists;

  const score = (name: string): number => {
    const n = normalizeText(name);
    if (n === q || n.includes(q)) return 0;
    if (tokens.some((token) => n.includes(token))) return 1;
    return 2;
  };

  const scored = artists.map((artist, index) => ({ artist, index, rank: score(artist.name) }));
  if (!scored.some((entry) => entry.rank < 2)) return artists;

  return scored
    .filter((entry) => entry.rank < 2)
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.artist);
}

/**
 * Le proxy n'existe qu'en développement (plugin Vite) ou derrière un petit
 * relais. On le sonde **une seule fois** : sur un hébergement statique, les
 * écrans qui chargent plusieurs étagères en parallèle ne doivent pas produire
 * un 404 par requête dans la console. Tous les appels attendent la même sonde.
 */
const PROXY_ENABLED =
  import.meta.env.DEV || import.meta.env.VITE_ITUNES_PROXY === '1';

let proxyProbe: Promise<boolean> | null = PROXY_ENABLED ? null : Promise.resolve(false);

function probeProxy(): Promise<boolean> {
  if (!proxyProbe) {
    proxyProbe = (async () => {
      try {
        const res = await fetch(`${PROXY_PREFIX}search?term=probe&entity=song&limit=1`, {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(4000),
        });
        const type = res.headers.get('content-type') ?? '';
        // Une page HTML (fallback SPA) ou un 404 = pas de proxy ici.
        return res.ok && type.includes('application/json');
      } catch {
        return false;
      }
    })();
  }
  return proxyProbe;
}

/**
 * Interroge `search` ou `lookup` via le proxy local puis en direct.
 * Lève `AbortError` si `signal` est annulé, sinon lève l'erreur réseau/HTTP.
 */
async function itFetch(path: string, signal?: AbortSignal): Promise<any> {
  if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
  const { signal: sig, cleanup } = combinedSignal(signal);
  try {
    // 1) Proxy local (dev / preview Vite, ou relais auto-hébergé).
    if (await probeProxy()) {
      try {
        return await fetchJson(`${PROXY_PREFIX}${path}`, sig);
      } catch (proxyErr) {
        if (isAbort(proxyErr)) throw proxyErr;
        // Le proxy a disparu : on repasse en direct pour les appels suivants.
        proxyProbe = Promise.resolve(false);
      }
    }
    // 2) Repli direct : iTunes renvoie ACAO:* donc le navigateur l'accepte.
    return await fetchJson(`${ITUNES_BASE}/${path}`, sig);
  } finally {
    cleanup();
  }
}

function baseParams(term: string): URLSearchParams {
  return new URLSearchParams({
    term: term.trim(),
    media: 'music',
    country: COUNTRY,
    lang: LANG,
  });
}

/* ---------------------------------- search --------------------------------- */

export async function searchTracks(
  term: string,
  signal?: AbortSignal,
): Promise<SearchSongsResponse> {
  const q = term.trim();
  if (!q) return { tracks: [], live: true };
  try {
    const qs = baseParams(q);
    qs.set('entity', 'song');
    qs.set('limit', '50');
    qs.set('attribute', 'mixTerm');
    const data = await itFetch(`search?${qs}`, signal);
    if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
    const tracks = ((data?.results ?? []) as any[])
      .map(mapTrack)
      .filter((t): t is Track => t !== null);
    return { tracks, live: true };
  } catch (err) {
    if (isAbort(err) || signal?.aborted) throw err;
    return { tracks: [], live: false };
  }
}

export async function searchAlbums(
  term: string,
  signal?: AbortSignal,
): Promise<SearchAlbumsResponse> {
  const q = term.trim();
  if (!q) return { albums: [], live: true };
  try {
    const qs = baseParams(q);
    qs.set('entity', 'album');
    qs.set('limit', '24');
    qs.set('attribute', 'albumTerm');
    const data = await itFetch(`search?${qs}`, signal);
    if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
    const albums = ((data?.results ?? []) as any[])
      .map(mapAlbum)
      .filter((a): a is Album => a !== null);
    return { albums, live: true };
  } catch (err) {
    if (isAbort(err) || signal?.aborted) throw err;
    return { albums: [], live: false };
  }
}

export async function searchArtists(
  term: string,
  signal?: AbortSignal,
): Promise<SearchArtistsResponse> {
  const q = term.trim();
  if (!q) return { artists: [], live: true };
  try {
    const qs = baseParams(q);
    qs.set('entity', 'musicArtist');
    qs.set('limit', '8');
    qs.set('attribute', 'artistTerm');
    const data = await itFetch(`search?${qs}`, signal);
    if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
    const artists: Artist[] = ((data?.results ?? []) as any[])
      .filter((r) => toNumber(r.artistId) !== undefined && typeof r.artistName === 'string')
      .map((r) => ({
        id: String(r.artistId),
        name: String(r.artistName ?? ''),
        genre: typeof r.primaryGenreName === 'string' ? r.primaryGenreName : undefined,
      }));
    return { artists: rankArtists(artists, q), live: true };
  } catch (err) {
    if (isAbort(err) || signal?.aborted) throw err;
    return { artists: [], live: false };
  }
}

/* --------------------------------- lookup ---------------------------------- */

function lookupParams(id: number, entity: 'song' | 'album', limit: number): URLSearchParams {
  return new URLSearchParams({
    id: String(id),
    country: COUNTRY,
    lang: LANG,
    entity,
    limit: String(limit),
  });
}

function assertId(id: number): void {
  if (!Number.isFinite(id) || id <= 0) throw new Error(`identifiant invalide : ${id}`);
}

export async function albumTracks(albumId: number, signal?: AbortSignal): Promise<Track[]> {
  assertId(albumId);
  const qs = lookupParams(albumId, 'song', 200);
  const data = await itFetch(`lookup?${qs}`, signal);
  return ((data?.results ?? []) as any[])
    .filter((r: any) => r.wrapperType === 'track' && r.trackId && r.trackName)
    .map(mapTrack)
    .filter((t): t is Track => t !== null);
}

export async function artistTopSongs(artistId: number, limit = 20, signal?: AbortSignal): Promise<Track[]> {
  assertId(artistId);
  const qs = lookupParams(artistId, 'song', Math.min(Math.max(limit, 1), 200));
  qs.set('sort', 'popular');
  const data = await itFetch(`lookup?${qs}`, signal);
  return ((data?.results ?? []) as any[])
    .filter((r: any) => r.wrapperType === 'track' && r.trackId && r.trackName)
    .map(mapTrack)
    .filter((t): t is Track => t !== null);
}

export async function artistAlbums(artistId: number, limit = 12, signal?: AbortSignal): Promise<Album[]> {
  assertId(artistId);
  const qs = lookupParams(artistId, 'album', Math.min(Math.max(limit, 1), 200));
  const data = await itFetch(`lookup?${qs}`, signal);
  return ((data?.results ?? []) as any[])
    .filter((r: any) => r.wrapperType === 'collection' && r.collectionId && r.collectionName)
    .map(mapAlbum)
    .filter((a): a is Album => a !== null);
}
