import { describe, expect, it } from 'vitest';
import { activeLyricIndex, parseLrc } from './lyrics';

const LRC = [
  '[ar:Eminem]',
  '[ti:Without Me]',
  '[00:00.46] Obie Trice, real name no gimmicks',
  '[00:04.52] Two trailer park girls go round the outside',
  '[00:07.36] Round the outside, round the outside',
].join('\n');

describe('parseLrc', () => {
  it('lit les horodatages et ignore les balises d’en-tête', () => {
    const lines = parseLrc(LRC);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toEqual({ at: 0.46, text: 'Obie Trice, real name no gimmicks' });
    expect(lines[2].at).toBeCloseTo(7.36, 3);
  });

  it('accepte les centièmes à un, deux ou trois chiffres, et le séparateur « : »', () => {
    const lines = parseLrc('[00:01.5]a\n[00:02.25]b\n[00:03.125]c\n[00:04:50]d');
    expect(lines.map((l) => l.at)).toEqual([1.5, 2.25, 3.125, 4.5]);
  });

  it('duplique une ligne portant plusieurs horodatages et trie le résultat', () => {
    const lines = parseLrc('[00:10.00][00:02.00]Refrain\n[00:05.00]Couplet');
    expect(lines.map((l) => [l.at, l.text])).toEqual([
      [2, 'Refrain'],
      [5, 'Couplet'],
      [10, 'Refrain'],
    ]);
  });

  it('applique la balise offset (millisecondes)', () => {
    const lines = parseLrc('[offset:-500]\n[00:02.00]Tard');
    expect(lines[0].at).toBe(1.5);
  });

  it('ignore les lignes sans texte exploitable et un texte vide', () => {
    expect(parseLrc('')).toEqual([]);
    expect(parseLrc('[00:01.00]\n[00:02.00]   \nparoles à plat')).toEqual([]);
  });

  it('ne descend jamais sous zéro', () => {
    expect(parseLrc('[offset:-2000]\n[00:00.50]Intro')[0].at).toBe(0);
  });
});

describe('activeLyricIndex', () => {
  const lines = parseLrc('[00:00.46]a\n[00:04.52]b\n[00:07.36]c');

  it('renvoie -1 avant la première ligne', () => {
    expect(activeLyricIndex(lines, 0)).toBe(-1);
    expect(activeLyricIndex([], 12)).toBe(-1);
  });

  it('suit la dernière ligne commencée', () => {
    expect(activeLyricIndex(lines, 0.46)).toBe(0);
    expect(activeLyricIndex(lines, 4)).toBe(0);
    expect(activeLyricIndex(lines, 4.52)).toBe(1);
    expect(activeLyricIndex(lines, 30)).toBe(2);
  });
});
