import { describe, expect, it } from 'vitest';
import { commandScore, normalizeCommandText, rankEntries, type CommandEntry } from './commandPalette';

function entry(label: string, detail?: string, keywords?: string): CommandEntry {
  return { id: label, group: 'Test', label, detail, keywords };
}

describe('normalizeCommandText', () => {
  it('ignore accents, casse et ponctuation', () => {
    expect(normalizeCommandText('Angèle — Brol (Deluxe)')).toBe('angele brol deluxe');
    expect(normalizeCommandText("Daft Punk, Pharrell Williams & Nile Rodgers")).toBe(
      'daft punk pharrell williams nile rodgers'
    );
  });

  it('réduit les séparateurs à une espace', () => {
    expect(normalizeCommandText('  Hip-Hop//Rap  ')).toBe('hip hop rap');
  });
});

describe('commandScore', () => {
  it('accepte une entrée sans requête', () => {
    expect(commandScore(entry('Accueil'), '   ')).toBeGreaterThan(0);
  });

  it('trouve un libellé accentué depuis une saisie sans accent', () => {
    expect(commandScore(entry('Angèle'), 'angele')).toBeGreaterThan(0);
  });

  it('exige que chaque mot de la requête apparaisse', () => {
    expect(commandScore(entry('Get Lucky', 'Daft Punk'), 'daft luck')).toBeGreaterThan(0);
    expect(commandScore(entry('Get Lucky', 'Daft Punk'), 'daft zzz')).toBe(0);
  });

  it('pèse plus lourd dans le libellé que dans la précision', () => {
    const labelMatch = commandScore(entry('Daft Punk', 'Dance'), 'daft');
    const detailMatch = commandScore(entry('Musique populaire', 'Daft Punk'), 'daft');
    expect(labelMatch).toBeGreaterThan(detailMatch);
  });

  it('trouve un mot-clé invisible', () => {
    expect(commandScore(entry('Titres likés', undefined, 'favoris coeur'), 'favoris')).toBeGreaterThan(0);
  });
});

describe('rankEntries', () => {
  it('renvoie toutes les entrées dans l’ordre sans requête', () => {
    const entries = [entry('B'), entry('A'), entry('C')];
    expect(rankEntries(entries, '').map((e) => e.label)).toEqual(['B', 'A', 'C']);
  });

  it('classe les correspondances de libellé devant celles de précision', () => {
    const entries = [
      entry('Musique populaire', 'Daft Punk'),
      entry('Daft Punk', 'Dance'),
      entry('Autour de Angèle', 'Daft Punk'),
    ];
    expect(rankEntries(entries, 'daft punk')[0].label).toBe('Daft Punk');
  });

  it('garde l’ordre d’origine à score égal', () => {
    const entries = [entry('Titre un', 'Angèle'), entry('Titre deux', 'Angèle')];
    expect(rankEntries(entries, 'angele').map((e) => e.label)).toEqual(['Titre un', 'Titre deux']);
  });

  it('écarte les entrées sans correspondance', () => {
    expect(rankEntries([entry('Accueil'), entry('Recherche')], 'zzz')).toEqual([]);
  });
});
