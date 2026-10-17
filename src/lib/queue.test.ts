import { describe, expect, it } from 'vitest';
import { moveIndex, nextIndex, resolvePlayable, type QueueState } from './queue';
import type { Track } from '../types';

function track(id: string, preview = `https://cdn/${id}.m4a`): Track {
  return { id, title: `Titre ${id}`, artist: 'Artiste', album: 'Album', cover: '', preview };
}

function state(overrides: Partial<QueueState> = {}): QueueState {
  return {
    queue: [track('a'), track('b'), track('c')],
    index: 0,
    shuffle: false,
    repeat: 'off',
    ...overrides,
  };
}

describe('nextIndex', () => {
  it('avance séquentiellement', () => {
    expect(nextIndex(state({ index: 0 }))).toBe(1);
    expect(nextIndex(state({ index: 1 }))).toBe(2);
  });

  it('s’arrête à la fin sans répétition', () => {
    expect(nextIndex(state({ index: 2 }))).toBe(-1);
  });

  it('revient au début avec repeat all', () => {
    expect(nextIndex(state({ index: 2, repeat: 'all' }))).toBe(0);
  });

  it('renvoie -1 sur une file vide', () => {
    expect(nextIndex(state({ queue: [], index: -1 }))).toBe(-1);
  });

  it('démarre au premier titre si l’index est invalide', () => {
    expect(nextIndex(state({ index: -1 }))).toBe(0);
  });

  it('ne retombe pas sur la piste courante en aléatoire', () => {
    // random constant à 0 retomberait toujours sur l'index 0.
    expect(nextIndex(state({ index: 0, shuffle: true }), () => 0)).toBe(1);
  });

  it('reste sur la piste avec un seul titre en aléatoire', () => {
    expect(nextIndex(state({ queue: [track('a')], index: 0, shuffle: true }), () => 0)).toBe(0);
  });
});

describe('resolvePlayable', () => {
  it('filtre les titres sans extrait', () => {
    const tracks = [track('a'), track('b', ''), track('c')];
    const result = resolvePlayable(tracks, 0);
    expect(result.queue.map((t) => t.id)).toEqual(['a', 'c']);
    expect(result.index).toBe(0);
  });

  it('démarre sur la première piste lisible après l’index demandé', () => {
    const tracks = [track('a', ''), track('b', ''), track('c')];
    const result = resolvePlayable(tracks, 0);
    expect(result.queue.map((t) => t.id)).toEqual(['c']);
    expect(result.index).toBe(0);
  });

  it('revient au début si la fin ne contient rien de lisible', () => {
    const tracks = [track('a'), track('b', ''), track('c', '')];
    const result = resolvePlayable(tracks, 1);
    expect(result.queue.map((t) => t.id)).toEqual(['a']);
    expect(result.index).toBe(0);
  });

  it('renvoie index -1 si rien n’est lisible', () => {
    const result = resolvePlayable([track('a', ''), track('b', '')], 0);
    expect(result.queue).toEqual([]);
    expect(result.index).toBe(-1);
  });

  it('borne un index hors limites', () => {
    const result = resolvePlayable([track('a'), track('b')], 99);
    expect(result.index).toBe(1);
  });
});

describe('moveIndex', () => {
  it('suit la piste courante déplacée', () => {
    expect(moveIndex(1, 1, 3, 5)).toBe(3);
  });

  it('décale l’index quand une piste antérieure passe après', () => {
    expect(moveIndex(2, 0, 3, 5)).toBe(1);
  });

  it('décale l’index quand une piste postérieure passe avant', () => {
    expect(moveIndex(1, 4, 0, 5)).toBe(2);
  });

  it('ignore un déplacement invalide', () => {
    expect(moveIndex(1, 2, 2, 5)).toBe(1);
    expect(moveIndex(1, -1, 2, 5)).toBe(1);
    expect(moveIndex(1, 2, 8, 5)).toBe(1);
  });
});
