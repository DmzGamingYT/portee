export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  coverUrl?: string;
  previewUrl?: string;
  durationMs?: number;
}

export interface Playlist {
  id: string;
  name: string;
  trackIds: string[];
}