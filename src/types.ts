/** Une piste telle que renvoyée par l'API publique (instantané et autonome). */
export interface Track {
  id: string;
  title: string;
  artist: string;
  artistId?: number;
  album: string;
  collectionId?: number;
  /** pochette 600×600 (chaîne vide : pochette de repli CSS) */
  cover: string;
  /** URL de l'extrait audio (~30 s) — le lecteur du projet ne lit que des extraits officiels */
  preview?: string;
  /** durée complète de la piste */
  durationMs?: number;
  genre?: string;
}

export interface Album {
  id: number;
  title: string;
  artist: string;
  artistId?: number;
  cover: string;
  trackCount: number;
  year?: string;
  genre?: string;
}

export interface Artist {
  id: number;
  name: string;
  genre?: string;
}

export interface Playlist {
  id: string;
  name: string;
  tracks: Track[];
  createdAt: number;
}