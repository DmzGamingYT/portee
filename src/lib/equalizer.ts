/**
 * Égaliseur graphique 10 bandes : bandes, presets et petits utilitaires.
 *
 * Les fréquences suivent les octaves ISO (31 Hz → 16 kHz) ; chaque bande est un
 * filtre `peaking` de gain réglable entre −12 et +12 dB, ce que le Web Audio
 * traduit directement. Tout est ici pur et testable : le graphe audio vit dans
 * `src/lib/audioGraph.ts`, l'interface dans `EqPanel`.
 */

export const EQ_BANDS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const;

export const EQ_GAIN_MIN = -12;
export const EQ_GAIN_MAX = 12;

/** Réglage neutre : 10 bandes à 0 dB. */
export const FLAT_GAINS: readonly number[] = EQ_BANDS.map(() => 0);

export interface EqPreset {
  id: string;
  label: string;
  /** gains en dB, un par bande, dans l'ordre de `EQ_BANDS` */
  gains: readonly number[];
}

/**
 * Presets volontairement doux (±6 dB) : au-delà, les extraits compressés
 * saturent vite et l'égaliseur sonne comme un défaut plutôt qu'un réglage.
 */
export const EQ_PRESETS: readonly EqPreset[] = [
  { id: 'flat', label: 'Plat', gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { id: 'bass', label: 'Basse', gains: [6, 5, 4, 2, 0, 0, 0, 0, 0, 0] },
  { id: 'voice', label: 'Voix', gains: [-3, -2, 0, 2, 3, 3, 2, 1, 0, 0] },
  { id: 'rock', label: 'Rock', gains: [4, 3, 1, -1, -2, -1, 1, 3, 4, 3] },
  { id: 'pop', label: 'Pop', gains: [-1, 1, 3, 4, 3, 1, -1, -1, 0, 1] },
  { id: 'jazz', label: 'Jazz', gains: [3, 2, 1, 2, -1, -1, 0, 1, 2, 3] },
  { id: 'electro', label: 'Électro', gains: [5, 4, 2, 0, -1, 1, 2, 3, 4, 4] },
  { id: 'classical', label: 'Classique', gains: [3, 2, 1, 0, 0, 0, -1, -2, -2, -3] },
];

/** Ramène un gain dans les bornes, en arrondissant au demi-décibel. */
export function clampGain(db: number): number {
  if (!Number.isFinite(db)) return 0;
  const bounded = Math.min(EQ_GAIN_MAX, Math.max(EQ_GAIN_MIN, db));
  return Math.round(bounded * 2) / 2;
}

/** Copie sûre d'un jeu de gains : 10 valeurs bornées, 0 ailleurs. */
export function normalizeGains(gains: unknown): number[] {
  const source = Array.isArray(gains) ? gains : [];
  return EQ_BANDS.map((_, i) => clampGain(Number(source[i] ?? 0)));
}

/** Preset par identifiant, ou le réglage plat. */
export function presetGains(id: string): number[] {
  const preset = EQ_PRESETS.find((p) => p.id === id);
  return normalizeGains(preset ? preset.gains : FLAT_GAINS);
}

/** Identifiant du preset correspondant exactement à ces gains, sinon `custom`. */
export function matchPreset(gains: readonly number[]): string {
  const normalized = normalizeGains(gains);
  const found = EQ_PRESETS.find((p) => p.gains.every((g, i) => clampGain(g) === normalized[i]));
  return found ? found.id : 'custom';
}

/** « 31 », « 250 », « 16 k » — étiquette courte sous un curseur. */
export function bandLabel(hz: number): string {
  return hz >= 1000 ? `${hz / 1000} k` : String(hz);
}

/** « +3 », « 0 », « −2,5 » — valeur affichée à côté du curseur. */
export function formatGain(db: number): string {
  const value = clampGain(db);
  if (value === 0) return '0';
  const text = String(Math.abs(value)).replace('.', ',');
  return `${value > 0 ? '+' : '−'}${text}`;
}
