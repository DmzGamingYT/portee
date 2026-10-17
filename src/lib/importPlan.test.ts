import { describe, expect, it } from 'vitest';
import {
  albumKey,
  albumLabel,
  baseName,
  createDuplicateIndex,
  fileFingerprint,
  folderOf,
  normalizeKey,
  trackKey,
} from './importPlan';

describe('normalizeKey', () => {
  it('ignore casse, accents et ponctuation', () => {
    expect(normalizeKey('Beyoncé — Déjà Vu')).toBe('beyonce deja vu');
    expect(normalizeKey('  DÉJÀ   VU ')).toBe('deja vu');
  });
});

describe('chemins', () => {
  it('extrait le nom et le dossier', () => {
    expect(baseName('Artiste/Album/01 - Titre.mp3')).toBe('01 - Titre.mp3');
    expect(folderOf('Artiste/Album/01 - Titre.mp3')).toBe('Artiste/Album');
    expect(folderOf('Titre.mp3')).toBe('');
    expect(folderOf('/Album/Titre.mp3')).toBe('/Album');
  });
});

describe('fileFingerprint', () => {
  it('ignore le dossier et la casse, mais pas la taille', () => {
    const a = fileFingerprint('Artiste/Album/01. Titre.mp3', 4_200_000);
    const b = fileFingerprint('Copie/01. TITRE.MP3', 4_200_000);
    const c = fileFingerprint('Artiste/Album/01. Titre.mp3', 4_200_001);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

describe('albumKey / albumLabel', () => {
  it('sépare deux albums homonymes de dossiers différents', () => {
    const a = albumKey('Artiste A/Greatest Hits/01.mp3', 'Greatest Hits');
    const b = albumKey('Artiste B/Greatest Hits/01.mp3', 'Greatest Hits');
    expect(a).not.toBe(b);
  });

  it('sépare deux albums rangés dans le même dossier', () => {
    const a = albumKey('Compil/01.mp3', 'Album un');
    const b = albumKey('Compil/02.mp3', 'Album deux');
    expect(a).not.toBe(b);
  });

  it('groupe les fichiers d’un même album', () => {
    const a = albumKey('Artiste/Album/01.mp3', 'Album');
    const b = albumKey('Artiste/Album/02.mp3', 'Album');
    expect(a).toBe(b);
  });

  it('privilégie le tag album pour le libellé', () => {
    expect(albumLabel('Artiste/Album (Deluxe)/01.mp3', 'Album')).toBe('Album');
    expect(albumLabel('Artiste/Album (Deluxe)/01.mp3', '  ')).toBe('Album (Deluxe)');
    expect(albumLabel(undefined, undefined)).toBe('Ma musique locale');
  });
});

describe('trackKey', () => {
  it('reconnaît le même titre malgré la typographie', () => {
    expect(trackKey('Déjà Vu', 'Beyoncé', 'B’Day')).toBe(trackKey('deja  vu', 'BEYONCE', 'b day'));
  });
});

describe('createDuplicateIndex', () => {
  const existing = [
    {
      title: 'Titre',
      artist: 'Artiste',
      album: 'Album',
      durationMs: 210_000,
      fileName: '01 - Titre.mp3',
      size: 5_000_000,
    },
  ];

  it('reconnaît un fichier déjà importé, même renommé ou déplacé', () => {
    const index = createDuplicateIndex(existing);
    expect(index.hasFile('01 - Titre.mp3', 5_000_000)).toBe(true);
    expect(index.hasFile('Autre dossier/01 - TITRE.mp3', 5_000_000)).toBe(true);
    expect(index.hasFile('01 - Titre.mp3', 4_999_999)).toBe(false);
  });

  it('reconnaît le même titre sous un autre nom de fichier', () => {
    const index = createDuplicateIndex(existing);
    expect(index.hasTrack('Titre', 'Artiste', 'Album', 210_400)).toBe(true);
    expect(index.hasTrack('Titre', 'Artiste', 'Album', 245_000)).toBe(false);
    expect(index.hasTrack('Titre', 'Autre artiste', 'Album', 210_000)).toBe(false);
  });

  it('mémorise les fichiers et titres importés pendant la session', () => {
    const index = createDuplicateIndex();
    expect(index.hasFile('a.mp3', 10)).toBe(false);
    index.rememberFile('a.mp3', 10);
    expect(index.hasFile('a.mp3', 10)).toBe(true);

    expect(index.hasTrack('T', 'A', 'B', 1000)).toBe(false);
    index.rememberTrack('T', 'A', 'B', 1000);
    expect(index.hasTrack('T', 'A', 'B', 1500)).toBe(true);
    expect(index.hasTrack('T', 'A', 'B', 4000)).toBe(false);
  });
});
