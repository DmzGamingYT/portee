import type { Track } from '../types';
import { isPlayable } from './tracks';

/**
 * Logique pure de la file de lecture.
 *
 * Extraite du store pour être testable sans navigateur : le store ne fait
 * plus qu'appliquer ces résultats à son état.
 */

export type RepeatMode = 'off' | 'one' | 'all';

export interface QueueState {
  queue: Track[];
  index: number;
  shuffle: boolean;
  repeat: RepeatMode;
}

/**
 * Index de la prochaine piste, ou -1 si la file est terminée.
 * `random` est injectable pour rendre le mode aléatoire testable.
 */
export function nextIndex(state: QueueState, random: () => number = Math.random): number {
  const { queue, index, shuffle, repeat } = state;
  if (queue.length === 0) return -1;
  if (index < 0 || index >= queue.length) return 0;
  if (shuffle) {
    if (queue.length === 1) return index;
    let n = index;
    // Évite de retomber sur la piste courante (et les boucles infinies
    // si `random` renvoie une valeur constante).
    for (let tries = 0; tries < 32 && n === index; tries++) {
      n = Math.floor(random() * queue.length);
    }
    return n === index ? (index + 1) % queue.length : Math.min(queue.length - 1, Math.max(0, n));
  }
  if (index + 1 < queue.length) return index + 1;
  if (repeat === 'all') return 0;
  return -1;
}

export interface PlayableSelection {
  /** Pistes réellement lisibles (extrait présent). */
  queue: Track[];
  /** Index de départ dans `queue`, -1 si aucune piste lisible. */
  index: number;
}

/**
 * Filtre une sélection sur les pistes audibles et trouve la première piste
 * lisible à partir de l'index demandé (puis en repartant du début).
 */
export function resolvePlayable(tracks: Track[], requested = 0): PlayableSelection {
  const queue = tracks.filter(isPlayable);
  if (queue.length === 0) return { queue, index: -1 };

  const length = tracks.length;
  const from = length === 0 ? 0 : Math.min(Math.max(0, Math.trunc(requested) || 0), length - 1);
  const positionInQueue = (track: Track) => queue.indexOf(track);

  for (let i = from; i < length; i++) {
    const at = positionInQueue(tracks[i]);
    if (at >= 0) return { queue, index: at };
  }
  for (let i = 0; i < from; i++) {
    const at = positionInQueue(tracks[i]);
    if (at >= 0) return { queue, index: at };
  }
  return { queue, index: 0 };
}

/**
 * Index de la piste courante après un déplacement `from` → `to` dans la file.
 * Retourne l'index inchangé si le déplacement est invalide.
 */
export function moveIndex(index: number, from: number, to: number, length: number): number {
  if (from === to || from < 0 || to < 0 || from >= length || to >= length) return index;
  if (index === from) return to;
  if (from < index && to >= index) return index - 1;
  if (from > index && to <= index) return index + 1;
  return index;
}
