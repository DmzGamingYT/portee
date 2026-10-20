/**
 * Classement des entrées de la palette de commandes (⌘K).
 *
 * Le filtrage est volontairement simple et local : chaque mot de la requête
 * doit apparaître dans l'entrée (libellé, précision ou mots-clés), les accents
 * et la ponctuation sont ignorés, et une correspondance dans le libellé pèse
 * plus lourd que dans la précision. Les entrées de même score gardent l'ordre
 * fourni par l'appelant — c'est lui qui décide de la priorité des sections.
 */
export interface CommandEntry {
  id: string;
  group: string;
  label: string;
  /** ligne secondaire : artiste, album, nombre de titres… */
  detail?: string;
  /** termes de recherche supplémentaires, jamais affichés */
  keywords?: string;
}

/** « Angèle — Brol » → « angele brol » : comparaison sans accents ni ponctuation. */
export function normalizeCommandText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Score d'un mot dans un texte normalisé (0 = absent). */
function tokenScore(haystack: string, token: string): number {
  if (!haystack || !token) return 0;
  const at = haystack.indexOf(token);
  if (at === -1) return 0;
  if (haystack === token) return 40;
  if (at === 0) return 24;
  // Début de mot (« punk » dans « daft punk ») : plus pertinent qu'au milieu.
  if (haystack[at - 1] === ' ') return 18;
  return 8;
}

/** Score global d'une entrée pour une requête (0 = à écarter). */
export function commandScore(entry: CommandEntry, query: string): number {
  const tokens = normalizeCommandText(query).split(' ').filter(Boolean);
  if (tokens.length === 0) return 1;

  const label = normalizeCommandText(entry.label);
  const detail = normalizeCommandText(entry.detail ?? '');
  const keywords = normalizeCommandText(entry.keywords ?? '');

  let total = 0;
  for (const token of tokens) {
    const score =
      tokenScore(label, token) * 3 + tokenScore(detail, token) * 2 + tokenScore(keywords, token);
    // Tous les mots doivent apparaître : « daft luck » ne doit pas remonter
    // « Get Lucky » parce que « daft » est dans la précision.
    if (score === 0) return 0;
    total += score;
  }
  return total;
}

/** Entrées correspondant à la requête, de la plus pertinente à la moins. */
export function rankEntries<T extends CommandEntry>(entries: readonly T[], query: string): T[] {
  const trimmed = query.trim();
  if (!trimmed) return entries.slice();

  return entries
    .map((entry, index) => ({ entry, index, score: commandScore(entry, trimmed) }))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((candidate) => candidate.entry);
}
