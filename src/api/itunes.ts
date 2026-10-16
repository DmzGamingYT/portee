import type { Album, Artist, Track } from '../types';

/**
 * Client de l'API publique iTunes via le proxy local /it/api/*.
 * Métadonnées réelles + extraits officiels ~30 s, sans clé API.
 */

export interface SearchSongsResponse {
  tracks: Track[];
  live: boolean;
}

export interface SearchAlbumsResponse {
  albums: Album[];
  live: boolean;
}

/* ---------------------------------- mapper --------------------------------- */

function coverOf(url: string | undefined, size: number): string {
  if (!url) return '';
  return url.replace(/\/\d+x\d+bb\./, `/${size}x${size}bb.`);
}

function mapTrack(r: any): Track {
  return {
    id: `t${r.trackId}`,
    title: r.trackName ?? 'Titre inconnu',
    artist: r.artistName ?? 'Artiste inconnu',
    artistId: r.collectionArtistId ?? r.artistId,
    album: r.collectionName ?? '',
    collectionId: r.collectionId,
    cover: coverOf(r.artworkUrl100, 600),
    preview: r.previewUrl ?? undefined,
    durationMs: r.trackTimeMillis ?? undefined,
    genre: r.primaryGenreName ?? undefined,
  };
}

function mapAlbum(r: any): Album {
  return {
    id: r.collectionId,
    title: r.collectionName ?? 'Album',
    artist: r.artistName ?? '',
    artistId: r.artistId,
    cover: coverOf(r.artworkUrl100, 600),
    trackCount: r.trackCount ?? 0,
    year: (r.releaseDate ?? '').slice(0, 4) || undefined,
    genre: r.primaryGenreName ?? undefined,
  };
}

/* ---------------------------------- fetch ---------------------------------- */

async function itFetch(path: string): Promise<any> {
  const res = await fetch(`/it/api/${path}`); // proxy local (vite dev/preview)
  if (!res.ok) throw new Error(`API iTunes HTTP ${res.status}`);
  return res.json();
}

/* ---------------------------------- search --------------------------------- */

export async function searchTracks(
  term: string,
  signal?: AbortSignal,
): Promise<SearchSongsResponse> {
  try {
    const qs = new URLSearchParams({ term, entity: 'song', limit: '50' });
    const data = await itFetch(`search?${qs}`);
    if (signal?.aborted) throw new Error('aborted');
    const tracks = (data.results ?? []).filter((r: any) => r.trackName).map(mapTrack);
    if (tracks.length === 0) throw new Error('aucun résultat');
    return { tracks, live: true };
  } catch (err) {
    if (signal?.aborted) throw err;
    return { tracks: [], live: false };
  }
}

export async function searchAlbums(
  term: string,
  signal?: AbortSignal,
): Promise<SearchAlbumsResponse> {
  try {
    const qs = new URLSearchParams({ term, entity: 'album', limit: '24' });
    const data = await itFetch(`search?${qs}`);
    if (signal?.aborted) throw new Error('aborted');
    const albums = (data.results ?? []).filter((r: any) => r.collectionName).map(mapAlbum);
    if (albums.length === 0) throw new Error('aucun résultat');
    return { albums, live: true };
  } catch (err) {
    if (signal?.aborted) throw err;
    return { albums: [], live: false };
  }
}

export async function searchArtists(term: string, signal?: AbortSignal): Promise<Artist[]> {
  try {
    const qs = new URLSearchParams({ term, entity: 'musicArtist', limit: '8' });
    const data = await itFetch(`search?${qs}`);
    if (signal?.aborted) throw new Error('aborted');
    return (data.results ?? []).map((r: any) => ({
      id: r.artistId,
      name: r.artistName ?? '',
      genre: r.primaryGenreName ?? undefined,
    }));
  } catch (err) {
    if (signal?.aborted) throw err;
    return [];
  }
}

/* --------------------------------- lookup ---------------------------------- */

export async function albumTracks(albumId: number): Promise<Track[]> {
  const qs = new URLSearchParams({ id: String(albumId), entity: 'song', limit: '100' });
  const data = await itFetch(`lookup?${qs}`);
  return (data.results ?? [])
    .filter((r: any) => r.wrapperType === 'track' && r.trackName)
    .map(mapTrack);
}

export async function artistTopSongs(artistId: number, limit = 20): Promise<Track[]> {
  const qs = new URLSearchParams({ id: String(artistId), entity: 'song', limit: String(limit) });
  const data = await itFetch(`lookup?${qs}`);
  return (data.results ?? [])
    .filter((r: any) => r.wrapperType === 'track' && r.trackName)
    .map(mapTrack);
}

export async function artistAlbums(artistId: number, limit = 12): Promise<Album[]> {
  const qs = new URLSearchParams({ id: String(artistId), entity: 'album', limit: String(limit) });
  const data = await itFetch(`lookup?${qs}`);
  return (data.results ?? [])
    .filter((r: any) => r.wrapperType === 'collection' && r.collectionName)
    .map(mapAlbum);
}
