import { describe, expect, it } from 'vitest';
import { applyPreviews, normalizeText } from './previewMatch';
import type { Track } from '../types';

function spotifyTrack(id: string, title: string, artist: string, preview?: string): Track {
  return { id: `s${id}`, title, artist, album: '', cover: '', preview };
}

function itunesTrack(id: string, title: string, artist: string, preview = `https://cdn/t${id}.m4a`): Track {
  return { id: `t${id}`, title, artist, album: '', cover: '', preview };
}

describe('normalizeText', () => {
  it('ignore accents, casse et ponctuation', () => {
    expect(normalizeText('Été — DÉJÀ-VU !')).toBe('ete deja vu');
  });

  it('retire les mentions feat. et les suffixes de version', () => {
    expect(normalizeText('Song (feat. Someone) - Remastered 2011')).toBe('song');
  });

  it('normalise les esperluettes', () => {
    expect(normalizeText('Simon & Garfunkel')).toBe('simon and garfunkel');
  });
});

describe('applyPreviews', () => {
  it('complète un titre sans extrait', () => {
    const spotify = [spotifyTrack('1', 'Get Lucky', 'Daft Punk')];
    const itunes = [itunesTrack('1', 'Get Lucky', 'Daft Punk')];
    const result = applyPreviews(spotify, itunes);
    expect(result[0].preview).toBe('https://cdn/t1.m4a');
  });

  it('ne remplace jamais un extrait Spotify existant', () => {
    const spotify = [spotifyTrack('1', 'Get Lucky', 'Daft Punk', 'https://spotify/preview')];
    const result = applyPreviews(spotify, [itunesTrack('1', 'Get Lucky', 'Daft Punk')]);
    expect(result[0].preview).toBe('https://spotify/preview');
  });

  it('rapproche malgré les accents et la casse', () => {
    const result = applyPreviews(
      [spotifyTrack('1', 'Déjà Vu', 'Beyoncé')],
      [itunesTrack('1', 'Deja Vu', 'BEYONCE')]
    );
    expect(result[0].preview).toBe('https://cdn/t1.m4a');
  });

  it('rapproche un artiste principal face à une liste d’artistes', () => {
    const result = applyPreviews(
      [spotifyTrack('1', 'Starboy', 'The Weeknd')],
      [itunesTrack('1', 'Starboy', 'The Weeknd, Daft Punk')]
    );
    expect(result[0].preview).toBe('https://cdn/t1.m4a');
  });

  it('ne réutilise pas le même extrait pour deux titres', () => {
    const targets = [
      spotifyTrack('1', 'Intro', 'Artiste'),
      spotifyTrack('2', 'Intro', 'Artiste'),
    ];
    const result = applyPreviews(targets, [itunesTrack('1', 'Intro', 'Artiste')]);
    expect(result[0].preview).toBe('https://cdn/t1.m4a');
    expect(result[1].preview).toBeUndefined();
  });

  it('laisse intact un titre sans correspondance', () => {
    const result = applyPreviews(
      [spotifyTrack('1', 'Inconnu', 'Personne')],
      [itunesTrack('1', 'Autre chose', 'Quelqu’un')]
    );
    expect(result[0].preview).toBeUndefined();
  });

  it('renvoie la liste d’origine si les donneurs n’ont aucun extrait', () => {
    const targets = [spotifyTrack('1', 'Titre', 'Artiste')];
    const result = applyPreviews(targets, [itunesTrack('1', 'Titre', 'Artiste', '')]);
    expect(result[0]).toEqual(targets[0]);
  });
});
