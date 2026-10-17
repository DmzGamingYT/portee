import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Artist, Track } from './types';
import { moveIndex, nextIndex, resolvePlayable } from './lib/queue';
import { isPlayable } from './lib/tracks';

/**
 * Genres proposés sur l'accueil (chips) — « Tous » retire le filtre.
 *
 * L'application n'a **aucun compte local** : l'identité vient exclusivement de
 * Spotify (OAuth PKCE, voir `src/api/spotifyAuth.ts`). Rien d'autre n'est
 * stocké ici.
 */
export const GENRES = [
  'Tous', 'Pop', 'Rock', 'Hip-Hop/Rap', 'R&B/Soul', 'Electronic', 'Jazz', 'Classique',
  'Français', 'Reggae', 'Métal', 'Country', 'Latino',
] as const;

export const DEFAULT_ARTISTS = [
  'Daft Punk', 'Stromae', 'Angèle', 'Orelsan', 'Coldplay', 'Lorde', 'Miles Davis', 'Eminem',
];

export const DEFAULT_GENRE = 'Tous';

export interface PlayerState {
  queue: Track[];
  index: number;
  playing: boolean;
  /** position de lecture dans l'extrait (0–30 s) */
  position: number;
  duration: number;
  /** position demandée par un clic sur la barre de progression (null = rien à faire).
   *  `null` permet de distinguer "aucun seek" d'un seek vers 0 s (restart). */
  pendingSeek: number | null;
  /** dernier message d'erreur audio à afficher (extrait injoignable, autoplay bloqué…) */
  audioError: string | null;
  dismissAudioError: () => void;
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeat: 'off' | 'one' | 'all';
  /** fondu appliqué en début et fin de chaque extrait (0 = coupé, max 8 s) */
  crossfade: number;
  setCrossfade: (seconds: number) => void;
  /** ordonnancer manuellement la file (glisser-déposer dans le panneau) */
  moveQueue: (from: number, to: number) => void;
  /** ajouter un titre à la file : juste après la piste courante, ou à la fin */
  enqueue: (track: Track, mode?: 'next' | 'end') => void;
  /** retirer une piste de la file par son index absolu */
  removeFromQueue: (index: number) => void;
  /** retirer une piste de partout (likes, historique, playlists, file) */
  forgetTrack: (trackId: string) => void;
}

export interface AppState extends PlayerState {
  theme: 'dark' | 'light';
  toggleTheme: () => void;

  liked: Track[];
  toggleLike: (track: Track) => void;

  /** artistes suivis (objet complet : nom, photo, lien) */
  followed: Artist[];
  toggleFollow: (artist: Artist) => void;

  /** titres écoutés, les plus récents en premier */
  history: Track[];
  addToHistory: (track: Track) => void;
  clearHistory: () => void;

  playlists: PlaylistLite[];
  createPlaylist: (name: string) => string;
  deletePlaylist: (id: string) => void;
  renamePlaylist: (id: string, name: string) => void;
  addToPlaylist: (playlistId: string, track: Track) => void;
  removeFromPlaylist: (playlistId: string, trackId: string) => void;

  /** aperçu audio au survol des lignes (désactivé par défaut) */
  hoverPreview: boolean;
  toggleHoverPreview: () => void;

  /** nom du contexte de lecture (« Album X », « Playlist Y »…) */
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

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      theme: 'dark',
      toggleTheme: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),

      liked: [],
      toggleLike: (track) =>
        set((s) => ({
          liked: s.liked.some((x) => x.id === track.id)
            ? s.liked.filter((x) => x.id !== track.id)
            : [track, ...s.liked].slice(0, 1000),
        })),

      followed: [],
      toggleFollow: (artist) =>
        set((s) => ({
          followed: s.followed.some((a) => a.id === artist.id)
            ? s.followed.filter((a) => a.id !== artist.id)
            : [artist, ...s.followed],
        })),

      history: [],
      addToHistory: (track) =>
        set((s) => ({
          history: [track, ...s.history.filter((x) => x.id !== track.id)].slice(0, MAX_HISTORY),
        })),
      clearHistory: () => set({ history: [] }),

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

      hoverPreview: false,
      toggleHoverPreview: () => set((s) => ({ hoverPreview: !s.hoverPreview })),

      lastContextName: '',
      setContextName: (name) => set({ lastContextName: name }),

      /* ------------------------------- lecteur ------------------------------- */

      queue: [],
      index: -1,
      playing: false,
      position: 0,
      duration: 0,
      pendingSeek: null,
      audioError: null,
      volume: 0.9,
      muted: false,
      shuffle: false,
      repeat: 'off',
      crossfade: 0,
      dismissAudioError: () => set({ audioError: null }),

      play: (tracks, index = 0, contextName = '') =>
        set((s) => {
          const { queue: playable, index: start } = resolvePlayable(tracks, index);
          if (playable.length === 0) {
            return {
              audioError: 'Aucun titre lisible sur cette sélection — essayez un autre titre ou album.',
            };
          }
          const target = playable[start];
          const current = s.index >= 0 && s.index < s.queue.length ? s.queue[s.index] : null;
          // Re-cliquer sur le titre en cours = restart audible à 0 s
          // (la balise <audio> garde sinon l'ancienne position).
          const sameTrack = current !== null && target !== undefined && current.id === target.id;
          return {
            queue: playable,
            index: start,
            playing: true,
            position: 0,
            pendingSeek: sameTrack ? 0 : null,
            audioError: null,
            lastContextName: contextName || s.lastContextName,
          };
        }),
      playTrack: (track) =>
        set((s) => {
          if (!isPlayable(track)) {
            return { audioError: `« ${track.title} » n'a pas de fichier audio lisible.` };
          }
          const idx = s.queue.findIndex((t) => t.id === track.id);
          if (idx >= 0) {
            // Re-cliquer sur le même titre = restart audible à 0 s.
            if (idx === s.index) {
              return { playing: true, position: 0, pendingSeek: 0, audioError: null };
            }
            return { index: idx, playing: true, position: 0, pendingSeek: null, audioError: null };
          }
          return {
            queue: [...s.queue, track],
            index: s.queue.length,
            playing: true,
            position: 0,
            pendingSeek: null,
            audioError: null,
          };
        }),
      togglePlay: () => set((s) => ({ playing: s.queue.length > 0 ? !s.playing : false, audioError: null })),
      next: () =>
        set((s) => {
          const n = nextIndex(s);
          return n === -1
            ? { playing: false, position: 0, pendingSeek: null }
            : { index: n, position: 0, pendingSeek: null, audioError: null };
        }),
      prev: () =>
        set((s) => {
          if (s.position > 3) {
            return { position: 0, pendingSeek: 0 };
          }
          if (s.index - 1 >= 0) return { index: s.index - 1, position: 0, pendingSeek: null, audioError: null };
          return { position: 0, pendingSeek: 0 };
        }),
      seek: (seconds) => {
        const t = Math.max(0, seconds);
        return set(() => ({ position: t, pendingSeek: t }));
      },
      setPosition: (seconds) => set({ position: Math.max(0, seconds) }),
      setDuration: (seconds) => set({ duration: Math.max(0, seconds) }),
      setVolume: (v) =>
        set(() => ({ volume: Math.min(1, Math.max(0, v)), muted: v <= 0 })),
      toggleMute: () => set((s) => ({ muted: !s.muted })),
      toggleShuffle: () => set((s) => ({ shuffle: !s.shuffle })),
      cycleRepeat: () =>
        set((s) => ({
          repeat: s.repeat === 'off' ? 'all' : s.repeat === 'all' ? 'one' : 'off',
        })),
      setCrossfade: (seconds: number) =>
        set({ crossfade: Math.min(8, Math.max(0, Math.round(seconds))) }),

      moveQueue: (from, to) =>
        set((s) => {
          const length = s.queue.length;
          if (from === to || from < 0 || to < 0 || from >= length || to >= length) return {};
          const queue = s.queue.slice();
          const [moved] = queue.splice(from, 1);
          queue.splice(to, 0, moved);
          return { queue, index: moveIndex(s.index, from, to, length) };
        }),

      enqueue: (track, mode = 'end') =>
        set((s) => {
          if (!isPlayable(track)) {
            return { audioError: `« ${track.title} » n'a pas de fichier audio à mettre dans la file.` };
          }
          const queue = s.queue.slice();
          let at = queue.length;
          if (mode === 'next' && s.index >= 0) at = s.index + 1;
          // Évite un doublon collé à la piste courante.
          if (at > 0 && queue[at - 1]?.id === track.id) return {};
          queue.splice(at, 0, track);
          return { queue, audioError: null };
        }),

      removeFromQueue: (position) =>
        set((s) => {
          if (position < 0 || position >= s.queue.length) return {};
          const queue = s.queue.filter((_, i) => i !== position);
          if (position === s.index) {
            if (queue.length === 0) {
              return { queue, index: -1, playing: false, position: 0, duration: 0, pendingSeek: null };
            }
            const index = Math.min(position, queue.length - 1);
            return { queue, index, position: 0, pendingSeek: null };
          }
          return { queue, index: position < s.index ? s.index - 1 : s.index };
        }),

      forgetTrack: (trackId) =>
        set((s) => {
          const without = (list: Track[]) => list.filter((t) => t.id !== trackId);
          const queue = without(s.queue);
          const currentId = s.index >= 0 && s.index < s.queue.length ? s.queue[s.index].id : null;
          let index = s.index;
          let position = s.position;
          let playing = s.playing;
          let duration = s.duration;

          if (currentId === trackId) {
            index = queue.length > 0 ? Math.min(s.index, queue.length - 1) : -1;
            position = 0;
            playing = queue.length > 0 ? s.playing : false;
            if (queue.length === 0) duration = 0;
          } else if (queue.length !== s.queue.length) {
            index = currentId ? queue.findIndex((t) => t.id === currentId) : -1;
          }

          return {
            liked: without(s.liked),
            history: without(s.history),
            playlists: s.playlists.map((p) => ({ ...p, tracks: without(p.tracks) })),
            queue,
            index,
            position,
            playing,
            duration,
            pendingSeek: null,
          };
        }),

      setPlaying: (playing) => set((s) => ({ playing: s.queue.length > 0 ? playing : false })),
    }),
    {
      name: 'spotifycraft-store',
      version: 5,
      partialize: (s) => {
        const {
          position: _position,
          duration: _duration,
          playing: _playing,
          pendingSeek: _pendingSeek,
          audioError: _audioError,
          ...rest
        } = s;
        _position; _duration; _playing; _pendingSeek; _audioError; // état éphémère
        return rest as AppState;
      },
      // v1 -> v2 : `liked` stockait des ids, désormais des pistes complètes.
      // v2 -> v3 : `pendingSeek` devient `number | null`, `audioError` apparaît.
      // v3 -> v4 : `history` (ids) et `followed` (ids) deviennent des objets
      //            complets — les anciennes entrées ne peuvent pas être
      //            reconstruites et sont ignorées.
      // v4 -> v5 : les comptes locaux (`user`, `accounts`, `signIn`, `signOut`)
      //            sont supprimés : l'authentification passe uniquement par
      //            Spotify (OAuth PKCE).
      migrate: (persisted) => {
        const {
          user: _user,
          accounts: _accounts,
          signIn: _signIn,
          signOut: _signOut,
          ...state
        } = (persisted ?? {}) as Record<string, unknown>;
        void _user;
        void _accounts;
        void _signIn;
        void _signOut;
        const isTrack = (x: unknown): x is Track =>
          typeof x === 'object' && x !== null && typeof (x as Track).id === 'string' && !!(x as Track).title;
        const isArtist = (x: unknown): x is Artist =>
          typeof x === 'object' && x !== null && typeof (x as Artist).id === 'string' && !!(x as Artist).name;

        return {
          ...state,
          liked: Array.isArray(state.liked) ? state.liked.filter(isTrack) : [],
          history: Array.isArray(state.history) ? state.history.filter(isTrack) : [],
          followed: Array.isArray(state.followed) ? state.followed.filter(isArtist) : [],
          hoverPreview: false,
          pendingSeek: null,
          audioError: null,
        } as AppState;
      },
    }
  )
);

/** Piste actuellement lue (ou null). */
export function currentTrack(s: AppState): Track | null {
  return s.index >= 0 && s.index < s.queue.length ? s.queue[s.index] : null;
}

/** File d'attente « à venir » : tout ce qui suit la piste courante. */
export function upcomingTracks(s: AppState): Track[] {
  return s.index >= 0 ? s.queue.slice(s.index + 1) : s.queue.slice();
}
