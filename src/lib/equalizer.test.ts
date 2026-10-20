import { describe, expect, it } from 'vitest';
import {
  EQ_BANDS,
  EQ_GAIN_MAX,
  EQ_GAIN_MIN,
  EQ_PRESETS,
  FLAT_GAINS,
  bandLabel,
  clampGain,
  formatGain,
  matchPreset,
  normalizeGains,
  presetGains,
} from './equalizer';

describe('EQ_BANDS', () => {
  it('couvre 10 octaves ISO de 31 Hz à 16 kHz', () => {
    expect(EQ_BANDS).toHaveLength(10);
    expect(EQ_BANDS[0]).toBe(31);
    expect(EQ_BANDS[EQ_BANDS.length - 1]).toBe(16000);
    expect([...EQ_BANDS]).toEqual([...EQ_BANDS].sort((a, b) => a - b));
  });
});

describe('presets', () => {
  it('donne 10 gains bornés pour chaque preset', () => {
    for (const preset of EQ_PRESETS) {
      expect(preset.gains).toHaveLength(10);
      for (const gain of preset.gains) {
        expect(gain).toBeGreaterThanOrEqual(EQ_GAIN_MIN);
        expect(gain).toBeLessThanOrEqual(EQ_GAIN_MAX);
      }
    }
  });

  it('garde un identifiant unique et un preset plat à zéro', () => {
    expect(new Set(EQ_PRESETS.map((p) => p.id)).size).toBe(EQ_PRESETS.length);
    expect(presetGains('flat')).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('retombe sur le plat pour un identifiant inconnu', () => {
    expect(presetGains('inconnu')).toEqual([...FLAT_GAINS]);
  });
});

describe('clampGain', () => {
  it('borne à ±12 dB et arrondit au demi-décibel', () => {
    expect(clampGain(30)).toBe(EQ_GAIN_MAX);
    expect(clampGain(-30)).toBe(EQ_GAIN_MIN);
    expect(clampGain(2.3)).toBe(2.5);
    expect(clampGain(2.2)).toBe(2);
  });

  it('traite une valeur non numérique comme neutre', () => {
    expect(clampGain(Number.NaN)).toBe(0);
    expect(clampGain(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('normalizeGains', () => {
  it('complète à 10 bandes et ignore les valeurs invalides', () => {
    expect(normalizeGains([1, 2])).toEqual([1, 2, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(normalizeGains(null)).toEqual([...FLAT_GAINS]);
    expect(normalizeGains(['3', 'x', 99])[0]).toBe(3);
    expect(normalizeGains(['3', 'x', 99])[1]).toBe(0);
    expect(normalizeGains(['3', 'x', 99])[2]).toBe(EQ_GAIN_MAX);
  });
});

describe('matchPreset', () => {
  it('reconnaît un preset exact et signale un réglage manuel', () => {
    expect(matchPreset(EQ_PRESETS[1].gains)).toBe(EQ_PRESETS[1].id);
    const custom = [...EQ_PRESETS[1].gains];
    custom[4] = 5;
    expect(matchPreset(custom)).toBe('custom');
  });
});

describe('libellés', () => {
  it('abrège les fréquences en kilohertz', () => {
    expect(bandLabel(31)).toBe('31');
    expect(bandLabel(500)).toBe('500');
    expect(bandLabel(1000)).toBe('1 k');
    expect(bandLabel(16000)).toBe('16 k');
  });

  it('affiche les gains avec leur signe, en virgule française', () => {
    expect(formatGain(0)).toBe('0');
    expect(formatGain(3)).toBe('+3');
    expect(formatGain(-2.5)).toBe('−2,5');
    expect(formatGain(0.2)).toBe('0');
  });
});
