import { describe, expect, it } from 'vitest';
import { diversifyTracks } from './tracks';
import type { Track } from '../types';

function track(id: string, artist: string): Track {
  return { id, title: `Titre ${id}`, artist, album: '', cover: '', preview: `https://cdn/${id}` };
}

describe('diversifyTracks', () => {
  it('limite un même artiste à deux titres avant de compléter', () => {
    const tracks = [
      track('1', 'Aya Nakamura'),
      track('2', 'Aya Nakamura'),
      track('3', 'Aya Nakamura'),
      track('4', 'Daft Punk'),
      track('5', 'Aya Nakamura'),
    ];
    const result = diversifyTracks(tracks, 2, 4);
    expect(result.map((t) => t.id)).toEqual(['1', '2', '4', '3']);
  });

  it('rapproche les listes d’artistes de leur artiste principal', () => {
    const tracks = [
      track('1', 'Daft Punk, Pharrell Williams'),
      track('2', 'Daft Punk'),
      track('3', 'Daft Punk & Nile Rodgers'),
    ];
    const result = diversifyTracks(tracks, 2, 10);
    expect(result.slice(0, 2).map((t) => t.id)).toEqual(['1', '2']);
  });

  it('respecte la limite et renvoie tout si elle suffit', () => {
    const tracks = [track('1', 'A'), track('2', 'B'), track('3', 'C')];
    expect(diversifyTracks(tracks, 2, 10)).toHaveLength(3);
    expect(diversifyTracks(tracks, 2, 2)).toHaveLength(2);
  });
});
