import { describe, expect, it } from 'vitest';
import type { Track } from '../types';
import {
  artistKeyOf,
  buildFavoritesMix,
  buildSeedTracks,
  buildTasteProfile,
  familyOf,
  hashSeed,
  mainArtistOf,
  mixDayKey,
  planDailyMixes,
  seededShuffle,
  type DailyMixSeed,
  type TasteInput,
} from './dailyMix';

function track(
  id: string,
  title: string,
  artist: string,
  genre: string,
  preview = `https://example.test/${id}.m4a`
): Track {
  return {
    id,
    title,
    artist,
    album: `${artist} — album`,
    cover: '',
    preview,
    durationMs: 200_000,
    genre,
  };
}

const emptyInput: TasteInput = { liked: [], history: [], playlists: [], followed: [] };

describe('familyOf', () => {
  it('reconnaît les genres simples et composés', () => {
    expect(familyOf('Pop')?.id).toBe('pop');
    expect(familyOf('Hip-Hop/Rap')?.id).toBe('rap');
    expect(familyOf('Électro')?.id).toBe('electro');
    expect(familyOf('Variété française')?.id).toBe('chanson');
    expect(familyOf('R&B/Soul')?.id).toBe('rnb');
    expect(familyOf('Rock')?.id).toBe('rock');
  });

  it('ignore les genres inconnus', () => {
    expect(familyOf('Musique pour enfants')).toBeNull();
    expect(familyOf('')).toBeNull();
    expect(familyOf(undefined)).toBeNull();
  });
});

describe('artistKeyOf / mainArtistOf', () => {
  it('ne garde que l’artiste principal', () => {
    expect(mainArtistOf('Daft Punk feat. Pharrell Williams')).toBe('Daft Punk');
    expect(mainArtistOf('A, B & C')).toBe('A');
    expect(artistKeyOf('Angèle')).toBe('angele');
    expect(artistKeyOf('Daft Punk feat. Pharrell')).toBe('daft punk');
  });
});

describe('buildTasteProfile', () => {
  it('agrège likes, historique, playlists et abonnements', () => {
    const input: TasteInput = {
      liked: [
        track('t1', 'One More Time', 'Daft Punk', 'Pop'),
        track('t2', 'Get Lucky', 'Daft Punk feat. Pharrell Williams', 'Pop'),
        track('t3', 'Instant Crush', 'Daft Punk', 'Pop'),
      ],
      history: [track('t4', 'Everlong', 'Foo Fighters', 'Rock')],
      playlists: [{ tracks: [track('t5', 'Bruxelles', 'Angèle', 'Chanson française')] }],
      followed: [{ id: 'a1', name: 'Miles Davis', genre: 'Jazz' }],
    };
    const profile = buildTasteProfile(input);

    expect(profile.signal).toBe(3 + 1 + 1 + 1);
    expect(profile.artists[0]).toMatchObject({ key: 'daft punk', name: 'Daft Punk' });
    expect(profile.genres[0]).toMatchObject({ key: 'pop', familyId: 'pop' });
    expect(profile.genres.some((g) => g.key === 'jazz')).toBe(true);
  });

  it('ne produit aucun signal sur une bibliothèque vide', () => {
    const profile = buildTasteProfile(emptyInput);
    expect(profile.signal).toBe(0);
    expect(profile.artists).toHaveLength(0);
    expect(profile.genres).toHaveLength(0);
  });
});

describe('mixDayKey', () => {
  it('formate la date locale', () => {
    expect(mixDayKey(new Date(2026, 9, 17))).toBe('2026-10-17');
    expect(mixDayKey(new Date(2026, 0, 3))).toBe('2026-01-03');
  });
});

describe('seededShuffle', () => {
  it('est stable pour une même graine et varie avec la graine', () => {
    const items = Array.from({ length: 10 }, (_, i) => i);
    expect(seededShuffle(items, 'jour-1')).toEqual(seededShuffle(items, 'jour-1'));
    expect(seededShuffle(items, 'jour-1')).not.toEqual(seededShuffle(items, 'jour-2'));
    expect(seededShuffle(items, 'jour-1')).toHaveLength(items.length);
  });

  it('utilise toutes les valeurs', () => {
    const items = ['a', 'b', 'c', 'd', 'e'];
    expect([...seededShuffle(items, 'x')].sort()).toEqual([...items].sort());
    expect(hashSeed('x')).toBe(hashSeed('x'));
    expect(hashSeed('x')).not.toBe(hashSeed('y'));
  });
});

describe('planDailyMixes', () => {
  it('produit un plan de démarrage sans donnée utilisateur', () => {
    const plan = planDailyMixes(emptyInput, { day: '2026-10-17' });
    expect(plan.seeds).toHaveLength(3);
    expect(plan.seeds[0].kind).toBe('starter');
    expect(plan.seeds.map((s) => s.id)).toContain('genre-pop');
    expect(plan.seeds.map((s) => s.id)).toContain('genre-electro');
    expect(new Set(plan.seeds.map((s) => s.id)).size).toBe(plan.seeds.length);
  });

  it('reste stable pour le même jour', () => {
    const first = planDailyMixes(emptyInput, { day: '2026-10-17' });
    const second = planDailyMixes(emptyInput, { day: '2026-10-17' });
    expect(second.seeds).toEqual(first.seeds);
  });

  it('priorise favoris, genres et artistes selon le profil', () => {
    const input: TasteInput = {
      liked: [
        track('t1', 'One More Time', 'Daft Punk', 'Pop'),
        track('t2', 'Get Lucky', 'Daft Punk', 'Pop'),
        track('t3', 'Instant Crush', 'Daft Punk', 'Pop'),
        track('t4', 'Digital Love', 'Daft Punk', 'Pop'),
        track('t5', 'Something About Us', 'Daft Punk', 'Pop'),
      ],
      history: Array.from({ length: 6 }, (_, i) =>
        track(`h${i}`, `Rock ${i}`, 'Foo Fighters', 'Rock')
      ),
      playlists: [],
      followed: [],
    };
    const plan = planDailyMixes(input, { day: '2026-10-17' });
    const ids = plan.seeds.map((s) => s.id);

    expect(ids[0]).toBe('favorites');
    expect(ids).toContain('genre-pop');
    expect(ids).toContain('genre-rock');
    expect(ids).toContain('artist-daft punk');
    expect(plan.seeds.length).toBeLessThanOrEqual(4);
  });
});

describe('buildSeedTracks', () => {
  const seed: DailyMixSeed = {
    id: 'genre-pop',
    kind: 'genre',
    title: 'Mix Pop',
    reason: 'test',
    term: 'pop',
    coverSeed: 'x',
    matchFamily: 'pop',
  };

  it('déduplique et limite à 2 titres par artiste quand la variété suffit', () => {
    const candidates = [
      ...Array.from({ length: 5 }, (_, i) => track(`d${i}`, `Daft ${i}`, 'Daft Punk', 'Pop')),
      ...Array.from({ length: 12 }, (_, i) => track(`v${i}`, `Autre ${i}`, `Artiste ${i}`, 'Pop')),
    ];
    const tracks = buildSeedTracks(candidates, seed, { seedKey: 'day', limit: 10 });
    expect(tracks).toHaveLength(10);
    const daft = tracks.filter((t) => artistKeyOf(t.artist) === 'daft punk');
    expect(daft.length).toBeLessThanOrEqual(2);
  });

  it('déduplique les doublons titre + artiste', () => {
    const candidates = [
      track('x1', 'Même Titre', 'Artiste', 'Pop'),
      track('x2', 'Même Titre', 'Artiste', 'Pop'),
      track('x3', 'Autre', 'Artiste 2', 'Pop'),
    ];
    const tracks = buildSeedTracks(candidates, seed, { seedKey: 'day', limit: 10 });
    expect(tracks.map((t) => t.id).sort()).toEqual(['x1', 'x3']);
  });

  it('écarte les titres déjà connus quand le choix est suffisant', () => {
    const candidates = Array.from({ length: 10 }, (_, i) =>
      track(`c${i}`, `Titre ${i}`, `Artiste ${i}`, 'Pop')
    );
    candidates.push(track('excluded', 'Deja Vu', 'Artiste X', 'Pop'));
    const tracks = buildSeedTracks(candidates, seed, {
      seedKey: 'day',
      limit: 5,
      exclude: new Set(['excluded']),
    });
    expect(tracks).toHaveLength(5);
    expect(tracks.some((t) => t.id === 'excluded')).toBe(false);
  });

  it('favorise fortement l’artiste visé', () => {
    const candidates = [
      ...Array.from({ length: 5 }, (_, i) => track(`n${i}`, `Autre ${i}`, `Artiste ${i}`, 'Pop')),
      ...Array.from({ length: 10 }, (_, i) => track(`a${i}`, `Daft ${i}`, 'Daft Punk', 'Pop')),
    ];
    const artistSeed: DailyMixSeed = { ...seed, id: 'artist-daft punk', matchFamily: undefined, matchArtist: 'daft punk' };
    const tracks = buildSeedTracks(candidates, artistSeed, { seedKey: 'day', limit: 2 });
    expect(tracks).toHaveLength(2);
    expect(tracks.every((t) => artistKeyOf(t.artist) === 'daft punk')).toBe(true);
  });

  it('ignore les titres non lisibles', () => {
    const candidates = [
      track('p1', 'Lisible', 'Artiste', 'Pop'),
      { ...track('p2', 'Muet', 'Artiste', 'Pop'), preview: undefined },
    ];
    const tracks = buildSeedTracks(candidates, seed, { seedKey: 'day', limit: 10 });
    expect(tracks.map((t) => t.id)).toEqual(['p1']);
  });
});

describe('buildFavoritesMix', () => {
  it('mélange les likes de façon stable et filtre les non lisibles', () => {
    const liked = Array.from({ length: 6 }, (_, i) => track(`f${i}`, `Liké ${i}`, 'A', 'Pop'));
    liked.push({ ...track('mute', 'Muet', 'A', 'Pop'), preview: undefined });
    const mix = buildFavoritesMix(liked, '2026-10-17');
    expect(mix).toHaveLength(6);
    expect(mix.some((t) => t.id === 'mute')).toBe(false);
    expect(buildFavoritesMix(liked, '2026-10-17').map((t) => t.id)).toEqual(mix.map((t) => t.id));
  });
});
