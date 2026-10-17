import { create } from 'zustand';
import type { SpotifyProfile } from './api/spotifyAuth';

/**
 * État de la connexion Spotify (hors store persistant principal) :
 * connexion, profil, erreurs. Éphémère (rechargé au démarrage) — les tokens
 * sont gérés par `spotifyAuth` (localStorage), pas ici.
 */

export interface SpotifyState {
  /** true si configuré + connecté (token présent) */
  connected: boolean;
  profile: SpotifyProfile | null;
  /** message d'erreur utilisateur (connexion refusée, etc.) */
  error: string | null;
  busy: boolean;
  set: (partial: Partial<SpotifyState>) => void;
}

export const useSpotify = create<SpotifyState>((set) => ({
  connected: false,
  profile: null,
  error: null,
  busy: false,
  set: (partial) => set(partial),
}));
