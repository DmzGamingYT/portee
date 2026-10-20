import { describe, expect, it } from 'vitest';
import { m3uFileName, playlistToM3u } from './m3u';
import type { Track } from '../types';

function track(partial: Partial<Track> & Pick<Track, 'title' | 'artist'>): Track {
  return { id: partial.title, album: 'Album', cover: '', ...partial } as Track;
}

describe('playlistToM3u', () => {
  it('écrit l’en-tête, la durée en secondes et le libellé', () => {
    const m3u = playlistToM3u('Mes classiques', [
      track({ title: 'One More Time', artist: 'Daft Punk', durationMs: 320_400 }),
    ]);
    expect(m3u.startsWith('#EXTM3U\n#PLAYLIST:Mes classiques\n')).toBe(true);
    expect(m3u).toContain('#EXTINF:320,Daft Punk - One More Time');
  });

  it('privilégie le fichier local, sinon l’extrait', () => {
    const local = playlistToM3u('x', [
      track({ title: 'Local', artist: 'A', localFileName: '01 - Local.mp3', preview: 'https://p' }),
    ]);
    expect(local).toContain('\n01 - Local.mp3\n');

    const distant = playlistToM3u('x', [
      track({ title: 'Distant', artist: 'B', preview: 'https://cdn/extrait.m4a' }),
    ]);
    expect(distant).toContain('\nhttps://cdn/extrait.m4a\n');
  });

  it('commente un titre sans fichier ni extrait au lieu de casser la liste', () => {
    const m3u = playlistToM3u('x', [track({ title: 'Nu', artist: 'C' })]);
    expect(m3u).toContain('# Sans fichier local ni extrait : C - Nu');
  });

  it('neutralise les retours à la ligne et les durées absentes', () => {
    const m3u = playlistToM3u('nom\nbizarre', [
      track({ title: 'Titre\ncoupé', artist: 'A\rB', localFileName: 'fichier\n.mp3' }),
    ]);
    expect(m3u).toContain('#PLAYLIST:nom bizarre');
    expect(m3u).toContain('#EXTINF:0,A B - Titre coupé');
    expect(m3u).toContain('\nfichier .mp3\n');
    expect(m3u.endsWith('\n')).toBe(true);
    expect(m3u.split('\n').filter((line) => line === '')).toHaveLength(1);
  });

  it('produit une playlist vide valide', () => {
    expect(playlistToM3u('Vide', [])).toBe('#EXTM3U\n#PLAYLIST:Vide\n');
  });
});

describe('m3uFileName', () => {
  it('translittère le nom en fichier sûr', () => {
    expect(m3uFileName('Découvertes — Été 2026')).toBe('decouvertes-ete-2026.m3u');
    expect(m3uFileName('  !!!  ')).toBe('playlist.m3u');
  });
});
