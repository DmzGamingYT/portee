import { describe, expect, it } from 'vitest';
import { fmtBytes, fmtClock, fmtDuration, fmtTotal, gradientOf } from './format';

describe('fmtDuration', () => {
  it('formate les millisecondes en m:ss', () => {
    expect(fmtDuration(225_000)).toBe('3:45');
    expect(fmtDuration(61_000)).toBe('1:01');
  });

  it('affiche un tiret sans durée', () => {
    expect(fmtDuration(undefined)).toBe('—');
    expect(fmtDuration(0)).toBe('—');
  });
});

describe('fmtClock', () => {
  it('arrondit vers le bas et borne à zéro', () => {
    expect(fmtClock(7.9)).toBe('0:07');
    expect(fmtClock(-3)).toBe('0:00');
    expect(fmtClock(125)).toBe('2:05');
  });
});

describe('fmtTotal', () => {
  it('choisit minutes ou heures', () => {
    expect(fmtTotal(0)).toBe('0 min');
    expect(fmtTotal(12 * 60_000)).toBe('12 min');
    expect(fmtTotal(72 * 60_000)).toBe('1 h 12 min');
    expect(fmtTotal(120 * 60_000)).toBe('2 h');
  });
});

describe('fmtBytes', () => {
  it('choisit l’unité et la virgule française', () => {
    expect(fmtBytes(0)).toBe('0 octet');
    expect(fmtBytes(512)).toBe('512 octets');
    expect(fmtBytes(1536)).toBe('1,5 Ko');
    expect(fmtBytes(12.4 * 1024 * 1024)).toBe('12 Mo');
  });

  it('borne les valeurs invalides', () => {
    expect(fmtBytes(-1)).toBe('0 octet');
    expect(fmtBytes(Number.NaN)).toBe('0 octet');
  });
});

describe('gradientOf', () => {
  it('est déterministe pour une même graine', () => {
    expect(gradientOf('playlist-1')).toBe(gradientOf('playlist-1'));
  });

  it('produit un dégradé CSS valide et distinct', () => {
    expect(gradientOf('a')).toMatch(/^linear-gradient\(135deg, hsl\(\d+ 70% 45%\), hsl\(\d+ 70% 30%\)\)$/);
    expect(gradientOf('a')).not.toBe(gradientOf('b'));
  });
});
