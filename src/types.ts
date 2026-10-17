/// <reference types="vite/client" />

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
  /** URL de l'extrait audio (~30 s) ; absente pour les fichiers locaux (voir `localId`) */
  preview?: string;
  /** durée complète de la piste */
  durationMs?: number;
  genre?: string;
  /* --- enrichissements Spotify (optionnels, ignorés par le moteur) --- */
  /** id Spotify réel (chaîne) — absent pour les pistes iTunes */
  spotifyId?: string;
  /** lien public Spotify (« Écouter sur Spotify ») */
  spotifyUrl?: string;
  /** id artiste Spotify (chaîne) */
  spotifyArtistId?: string;
  /** id album Spotify (chaîne) */
  spotifyAlbumId?: string;
  /** contenu explicite signalé par Spotify */
  explicit?: boolean;
  /* --- fichiers importés dans la bibliothèque locale (IndexedDB) --- */
  /** identifiant du blob local ; sa présence rend la piste lisible sans `preview` */
  localId?: string;
  /** nom du fichier d'origine (affichage / débogage) */
  localFileName?: string;
  /** taille du fichier en octets */
  localSize?: number;
}

export interface Album {
  id: string; // id iTunes (numérique) ou id Spotify (chaîne) — voir spotifyId pour l'original
  title: string;
  artist: string;
  artistId?: number;
  /** équivalent Spotify de `artistId` (ids Spotify = chaînes) */
  spotifyArtistId?: string;
  cover: string;
  trackCount: number;
  year?: string;
  genre?: string;
  spotifyId?: string;
  spotifyUrl?: string;
}

export interface Artist {
  id: string; // id iTunes (numérique) ou id Spotify (chaîne) — voir spotifyId pour l'original
  name: string;
  genre?: string;
  /** photo/visuel de l'artiste (Spotify `images`) — chaîne vide si indisponible */
  cover?: string;
  spotifyId?: string;
  spotifyUrl?: string;
}

export interface Playlist {
  id: string;
  name: string;
  tracks: Track[];
  createdAt: number;
}