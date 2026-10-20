/**
 * Paroles au format LRC : analyse et repérage de la ligne courante.
 *
 * Le format LRC est celui qu'utilisent les lecteurs de paroles (et l'API
 * LRCLIB) : une ligne par phrase, préfixée d'un ou plusieurs horodatages
 * `[mm:ss.xx]`, plus quelques balises d'en-tête (`[ar:…]`, `[offset:…]`).
 *
 * Ces fonctions sont pures — l'accès réseau vit dans `src/api/lyrics.ts` —
 * ce qui permet de les tester sans navigateur ni connexion.
 */

export interface LyricLine {
  /** Instant de la ligne, en secondes depuis le début du morceau. */
  at: number;
  text: string;
}

/** `[01:23.45]`, `[1:03]`, `[00:13.5]`… (certains fichiers utilisent `:` avant les centièmes). */
const STAMP = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
const OFFSET = /\[offset:\s*([+-]?\d+)\s*\]/i;

/** Convertit un horodatage capturé en secondes (les centièmes sont facultatifs). */
function toSeconds(minutes: string, seconds: string, fraction?: string): number {
  const ms = fraction ? Number(`0.${fraction}`) : 0;
  return Number(minutes) * 60 + Number(seconds) + ms;
}

/**
 * Analyse un texte LRC. Les lignes sans horodatage (titres, crédits, paroles
 * « à plat ») sont ignorées, les lignes à plusieurs horodatages sont dupliquées
 * à chaque instant, et le résultat est trié. `[offset:500]` (millisecondes,
 * positif = paroles en avance) est appliqué à toutes les lignes.
 */
export function parseLrc(lrc: string): LyricLine[] {
  if (!lrc) return [];
  const offsetMatch = OFFSET.exec(lrc);
  const offset = offsetMatch ? Number(offsetMatch[1]) / 1000 : 0;

  const lines: LyricLine[] = [];
  for (const raw of lrc.split(/\r?\n/)) {
    const text = raw.replace(STAMP, '').trim();
    // Un horodatage sans texte n'apporte rien à l'affichage.
    if (!text) continue;
    STAMP.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = STAMP.exec(raw)) !== null) {
      const at = Math.max(0, toSeconds(match[1], match[2], match[3]) + offset);
      lines.push({ at, text });
    }
  }

  return lines.sort((a, b) => a.at - b.at);
}

/**
 * Index de la ligne affichée à `position` (secondes), ou -1 avant la première.
 * Recherche dichotomique : la position est relue plusieurs fois par seconde.
 */
export function activeLyricIndex(lines: readonly LyricLine[], position: number): number {
  let low = 0;
  let high = lines.length - 1;
  let found = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (lines[mid].at <= position) {
      found = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return found;
}
