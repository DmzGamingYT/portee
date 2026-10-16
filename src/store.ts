import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Track } from './types';

export interface User {
  name: string;
  email: string;
  photo?: string;
  provider?: string;
}

/** Genres proposés sur l'accueil (chips) — comme les catégories YouTube de TubeCraft. */
export const GENRES = [
  'Pop', 'Rock', 'Hip-Hop/Rap', 'R&B/Soul', 'Electronic', 'Jazz', 'Classique',
  'Français', 'Reggae', 'Métal', 'Country', 'Latino',
] as const;

export const DEFAULT_ARTISTS = [
  'Daft Punk', 'Stromae', 'Angèle', 'Orelsan', 'Coldplay', 'Lorde', 'Miles Davis', 'Eminem',
];

export const DEFAULT_GENRE = 'Pop';

export interface PlayerState {
  queue: Track[];
  index: number;
  playing: boolean;
  /** position de lecture dans l'extrait (0–30 s) */
  position: number;
  duration: number;
  /** position demandée par un clic sur la barre de progression, à appliquer par l'AudioEngine */
  pendingSeek: number;
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeat: 'off' | 'one' | 'all';
}

export interface AppState extends PlayerState {
  theme: 'dark' | 'light';
  toggleTheme: () => void;

  user: User | null;
  accounts: User[];
  signIn: (user: User) => void;
  signOut: () => void;

  liked: Track[];
  toggleLike: (track: Track) => void;

  followed: string[];
  toggleFollow: (artistId: string) => void;

  /** ids de pistes écoutées (les plus récentes en premier) + horodatage */
  history: string[];
  historyDates: Record<string, number>;
  addToHistory: (trackId: string) => void;
  clearHistory: () => void;

  playlists: PlaylistLite[];
  createPlaylist: (name: string) => string;
  deletePlaylist: (id: string) => void;
  renamePlaylist: (id: string, name: string) => void;
  addToPlaylist: (playlistId: string, track: Track) => void;
  removeFromPlaylist: (playlistId: string, trackId: string) => void;

  /** pile « en cours » conservée pour reprendre la lecture au rechargement */
  lastContextName: string;
  setContextName: (name: string) => void;

  play: (tracks: Track[], index?: number, contextName?: string) => void;
  playTrack: (track: Track) => void;
  togglePlay: () => void;
  next: () => void;
  prev: () => void;
  seek: (seconds: number) => void;
  setPosition: (seconds: number) => void;
  setDuration: (seconds: number) => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  setPlaying: (playing: boolean) => void;
}

/** Playlist persistée : on ne stocke que des tracks complètes (auto-contenues). */
export interface PlaylistLite {
  id: string;
  name: string;
  tracks: Track[];
  createdAt: number;
}

const MAX_HISTORY = 100;

function nextIndex(state: AppState): number {
  const { queue, index, shuffle, repeat } = state;
  if (shuffle && queue.length > 0) {
    if (queue.length === 1) return index;
    let n = index;
    while (n === index) n = Math.floor(Math.random() * queue.length);
    return n;
  }
  if (index + 1 < queue.length) return index + 1;
  if (repeat === 'all') return 0;
  return -1;
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      theme: 'dark',
      toggleTheme: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),

      user: null,
      accounts: [],
      signIn: (user) =>
        set((s) => ({
          user,
          accounts: [user, ...s.accounts.filter((a) => a.email !== user.email)].slice(0, 6),
        })),
      signOut: () => set({ user: null }),

      liked: [],
      toggleLike: (track) =>
        set((s) => ({
          liked: s.liked.some((x) => x.id === track.id)
            ? s.liked.filter((x) => x.id !== track.id)
            : [track, ...s.liked].slice(0, 1000),
        })),

      followed: [],
      toggleFollow: (artistId) =>
        set((s) => ({
          followed: s.followed.includes(artistId)
            ? s.followed.filter((x) => x !== artistId)
            : [artistId, ...s.followed],
        })),

      history: [],
      historyDates: {},
      addToHistory: (trackId) =>
        set((s) => ({
          history: [trackId, ...s.history.filter((x) => x !== trackId)].slice(0, MAX_HISTORY),
          historyDates: { ...s.historyDates, [trackId]: Date.now() },
        })),
      clearHistory: () => set({ history: [], historyDates: {} }),

      playlists: [],
      createPlaylist: (name) => {
        const pl: PlaylistLite = {
          id: crypto.randomUUID(),
          name: name.trim() || 'Nouvelle playlist',
          tracks: [],
          createdAt: Date.now(),
        };
        set((s) => ({ playlists: [pl, ...s.playlists] }));
        return pl.id;
      },
      deletePlaylist: (id) => set((s) => ({ playlists: s.playlists.filter((p) => p.id !== id) })),
      renamePlaylist: (id, name) =>
        set((s) => ({
          playlists: s.playlists.map((p) => (p.id === id ? { ...p, name } : p)),
        })),
      addToPlaylist: (playlistId, track) =>
        set((s) => ({
          playlists: s.playlists.map((p) =>
            p.id === playlistId && !p.tracks.some((t) => t.id === track.id)
              ? { ...p, tracks: [track, ...p.tracks] }
              : p
          ),
        })),
      removeFromPlaylist: (playlistId, trackId) =>
        set((s) => ({
          playlists: s.playlists.map((p) =>
            p.id === playlistId ? { ...p, tracks: p.tracks.filter((t) => t.id !== trackId) } : p
          ),
        })),

      lastContextName: '',
      setContextName: (name) => set({ lastContextName: name }),

      /* ------------------------------- lecteur ------------------------------- */

      queue: [],
      index: -1,
      playing: false,
      position: 0,
      duration: 0,
      pendingSeek: 0,
      volume: 0.9,
      muted: false,
      shuffle: false,
      repeat: 'off',

      play: (tracks, index = 0, contextName = '') =>
        set((s) => ({
          queue: tracks,
          index: tracks.length ? Math.min(Math.max(0, index), tracks.length - 1) : -1,
          playing: tracks.length > 0,
          position: 0,
          pendingSeek: 0,
          lastContextName: contextName || s.lastContextName,
        })),
      playTrack: (track) =>
        set((s) => {
          const idx = s.queue.findIndex((t) => t.id === track.id);
          if (idx >= 0) return { index: idx, playing: true, position: 0, pendingSeek: 0 };
          return {
            queue: [...s.queue, track],
            index: s.queue.length,
            playing: true,
            position: 0,
            pendingSeek: 0,
          };
        }),
      togglePlay: () => set((s) => ({ playing: s.queue.length > 0 ? !s.playing : false })),
      next: () =>
        set((s) => {
          const n = nextIndex(s);
          return n === -1 ? { playing: false, position: 0, pendingSeek: 0 } : { index: n, position: 0, pendingSeek: 0 };
        }),
      prev: () =>
        set((s) => {
          if (s.position > 3) {
            const t = 0;
            return { position: t, pendingSeek: t };
          }
          if (s.index - 1 >= 0) return { index: s.index - 1, position: 0, pendingSeek: 0 };
          return { position: 0, pendingSeek: 0 };
        }),
      seek: (seconds) => {
        const t = Math.max(0, seconds);
        return set(() => ({ position: t, pendingSeek: t }));
      },
      setPosition: (seconds) => set({ position: Math.max(0, seconds) }),
      setDuration: (seconds) => set({ duration: Math.max(0, seconds) }),
      setVolume: (v) =>
        set((_c) => ({ volume: Math.min(1, Math.max(0, v)), muted: v <= 0 ? true : false })),
      toggleMute: () => set((s) => ({ muted: !s.muted })),
      toggleShuffle: () => set((s) => ({ shuffle: !s.shuffle })),
      cycleRepeat: () =>
        set((s) => ({
          repeat: s.repeat === 'off' ? 'all' : s.repeat === 'all' ? 'one' : 'off',
        })),
      setPlaying: (playing) => set((s) => ({ playing: s.queue.length > 0 ? playing : false })),
    }),
    {
      name: 'spotifycraft-store',
      version: 1,
      partialize: (s) => {
        const { position: _position, duration: _duration, playing: _playing, ...rest } = s;
        _position; _duration; _playing; // parti délibérément non persisté
        return rest as AppState;
      },
    }
  )
);

/** Piste actuellement lue (ou null). */
export function currentTrack(s: AppState): Track | null {
  return s.index >= 0 && s.index < s.queue.length ? s.queue[s.index] : null;
}
