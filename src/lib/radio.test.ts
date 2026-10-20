import { describe, expect, it } from 'vitest';
import type { Track } from '../types';
import {
  interleave,
  radioCandidates,
  radioSources,
  radioTrackKey,
} from './radio';

function track(
  id: string,
  title: string,
  artist: string,
  extra: Partial<Track> = {}
): Track {
  return {
    id,
    title,
    artist,
    album: 'Album',
    cover: '',
    preview: `https://cdn/${id}.m4a`,
    ...extra,
  };
}

describe('radioTrackKey', () => {
  it('reconnaît le même titre sous plusieurs éditions', () => {
    const base = radioTrackKey(track('a', 'Get Lucky', 'Daft Punk'));
    expect(radioTrackKey(track('b', 'Get Lucky - Single', 'Daft Punk'))).toBe(base);
    expect(
      radioTrackKey(track('c', 'Get Lucky (feat. Pharrell Williams)', 'Daft Punk'))
    ).toBe(base);
    expect(radioTrackKey(track('d', 'Get Lucky - 2013 Remaster', 'Daft Punk'))).toBe(base);
  });

  it('ignore accents et casse', () => {
    expect(radioTrackKey(track('a', 'Lumière', 'Angèle'))).toBe(
      radioTrackKey(track('b', 'LUMIERE', 'ANGELE'))
    );
  });

  it('ne compare que l’artiste principal', () => {
    expect(radioTrackKey(track('a', 'Instant Crush', 'Daft Punk & Julian Casablancas'))).toBe(
      radioTrackKey(track('b', 'Instant Crush', 'Daft Punk feat. Julian Casablancas'))
    );
  });

  it('garde deux reprises du même titre par des artistes différents', () => {
    expect(radioTrackKey(track('a', 'Get Lucky', 'Daft Punk'))).not.toBe(
      radioTrackKey(track('b', 'Get Lucky', 'Thomas Dutronc'))
    );
  });

  it('reste stable sur un titre vide de sens', () => {
    expect(radioTrackKey(track('a', '???', 'Artiste'))).toBe('artiste::???');
  });
});

describe('interleave', () => {
  it('alterne les listes et garde la fin de la plus longue', () => {
    expect(interleave([['a1', 'a2', 'a3'], ['b1']])).toEqual(['a1', 'b1', 'a2', 'a3']);
  });

  it('accepte une liste vide', () => {
    expect(interleave([[], ['b1', 'b2']])).toEqual(['b1', 'b2']);
    expect(interleave([])).toEqual([]);
  });
});

describe('radioSources', () => {
  it('interroge l’artiste par son identifiant quand il existe', () => {
    expect(radioSources(track('a', 'One More Time', 'Daft Punk', { artistId: 5468295 }))).toEqual([
      { kind: 'artist', artistId: 5468295 },
    ]);
  });

  it('replie sur le nom de l’artiste principal', () => {
    expect(
      radioSources(track('a', 'One More Time', 'Daft Punk, Pharrell Williams', { genre: 'Electronic' }))
    ).toEqual([
      { kind: 'artist', term: 'Daft Punk' },
      { kind: 'genre', term: 'electronic' },
    ]);
  });

  it('ajoute la famille de genres quand elle est reconnue', () => {
    const sources = radioSources(track('a', 'Brol', 'Angèle', { genre: 'Chanson française' }));
    expect(sources).toEqual([
      { kind: 'artist', term: 'Angèle' },
      { kind: 'genre', term: 'chanson française' },
    ]);
  });

  it('ne propose rien sans artiste', () => {
    expect(radioSources(track('a', 'Sans nom', '   '))).toEqual([]);
  });
});

describe('radioCandidates', () => {
  it('écarte les titres déjà dans la file', () => {
    const queue = [track('t1', 'Get Lucky', 'Daft Punk')];
    const picked = radioCandidates(
      [[track('t2', 'One More Time', 'Daft Punk'), track('t1', 'Get Lucky', 'Daft Punk')]],
      { queue }
    );
    expect(picked.map((t) => t.id)).toEqual(['t2']);
  });

  it('écarte les autres éditions d’un titre déjà présent', () => {
    const queue = [track('t1', 'Get Lucky', 'Daft Punk')];
    const picked = radioCandidates(
      [[track('t9', 'Get Lucky - Single', 'Daft Punk')]],
      { queue }
    );
    expect(picked).toEqual([]);
  });

  it('écarte les identifiants de l’historique', () => {
    const picked = radioCandidates(
      [[track('t1', 'A', 'X'), track('t2', 'B', 'X')]],
      { excludeIds: ['t1'] }
    );
    expect(picked.map((t) => t.id)).toEqual(['t2']);
  });

  it('dédoublonne entre les sources', () => {
    const picked = radioCandidates([
      [track('t1', 'One More Time', 'Daft Punk')],
      [track('t1', 'One More Time', 'Daft Punk'), track('t2', 'Around the World', 'Daft Punk')],
    ]);
    expect(picked.map((t) => t.id)).toEqual(['t1', 't2']);
  });

  it('écarte les titres sans extrait lisible', () => {
    const picked = radioCandidates([
      [track('t1', 'Muet', 'X', { preview: '' }), track('t2', 'Local', 'X', { localId: 'l1' })],
    ]);
    expect(picked.map((t) => t.id)).toEqual(['t2']);
  });

  it('plafonne chaque artiste à deux titres', () => {
    const picked = radioCandidates(
      [
        [
          track('t1', 'A', 'Daft Punk'),
          track('t2', 'B', 'Daft Punk'),
          track('t3', 'C', 'Daft Punk'),
          track('t4', 'D', 'Justice'),
        ],
      ],
      { maxPerArtist: 2 }
    );
    expect(picked.map((t) => t.id)).toEqual(['t1', 't2', 't4']);
  });

  it('respecte la limite demandée', () => {
    const many = Array.from({ length: 30 }, (_, i) => track(`t${i}`, `Titre ${i}`, `Artiste ${i}`));
    expect(radioCandidates([many], { limit: 10 })).toHaveLength(10);
    expect(radioCandidates([many], { limit: 0 })).toEqual([]);
  });

  it('alterne artiste et genre au lieu d’épuiser le même artiste', () => {
    const picked = radioCandidates(
      [
        [
          track('a1', 'A1', 'Daft Punk'),
          track('a2', 'A2', 'Daft Punk'),
          track('a3', 'A3', 'Daft Punk'),
        ],
        [track('g1', 'G1', 'Justice'), track('g2', 'G2', 'Kavinsky')],
      ],
      { limit: 4, maxPerArtist: 2 }
    );
    expect(picked.map((t) => t.id)).toEqual(['a1', 'g1', 'a2', 'g2']);
  });

  it('ne renvoie rien sans source', () => {
    expect(radioCandidates([], {})).toEqual([]);
  });
});
