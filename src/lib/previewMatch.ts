import type { Track } from '../types';

/**
 * Rapprochement des métadonnées Spotify et des extraits iTunes.
 *
 * Depuis fin 2024, Spotify ne garantit plus de `preview_url` aux nouvelles
 * applications. On garde donc les métadonnées Spotify (pochettes, ids, liens)
 * et on complète les extraits manquants avec les 30 s officiels d'iTunes.
 */

/** Clé de comparaison tolérante : accents, casse, ponctuation, suffixes. */
export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\((?:feat|ft|with)[^)]*\)/g, ' ')
    .replace(/\[(?:feat|ft|with)[^\]]*\]/g, ' ')
    .replace(/\s+(?:feat\.?|ft\.?|featuring)\s+.*$/g, ' ')
    // « Remastered 2011 » / « 2011 Remaster » : le millésime accompagne le
    // suffixe, on retire les deux sans toucher aux titres qui sont des années.
    .replace(
      /\b(?:remaster(?:ed)?|deluxe|expanded|anniversary|edition|version)\b\s*(?:19|20)\d{2}\b/g,
      ' '
    )
    .replace(
      /\b(?:19|20)\d{2}\b\s*(?:remaster(?:ed)?|deluxe|expanded|anniversary|edition|version)\b/g,
      ' '
    )
    .replace(
      /\b(?:remaster(?:ed)?|deluxe|expanded|anniversary|edition|version|explicit|clean|radio edit|single)\b/g,
      ' '
    )
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Artiste principal d'une chaîne « A, B & C » ou « A feat. B ». */
function principalArtist(value: string): string {
  return normalizeText(value.split(/[,&]|\s+(?:feat\.?|ft\.?|featuring)\s+/i)[0] ?? '');
}

/**
 * Complète les pistes sans extrait à partir de pistes donneuses (iTunes).
 * Retourne un nouveau tableau ; les pistes déjà lisibles ne sont pas touchées.
 */
export function applyPreviews<T extends Track>(targets: T[], donors: Track[]): T[] {
  const byTitle = new Map<string, Track[]>();
  for (const donor of donors) {
    if (!donor.preview) continue;
    const key = normalizeText(donor.title);
    if (!key) continue;
    const bucket = byTitle.get(key);
    if (bucket) bucket.push(donor);
    else byTitle.set(key, [donor]);
  }
  if (byTitle.size === 0) return targets;

  const used = new Set<string>();
  return targets.map((track) => {
    if (track.preview) return track;
    const candidates = byTitle.get(normalizeText(track.title));
    if (!candidates || candidates.length === 0) return track;

    const artist = principalArtist(track.artist);
    const match =
      candidates.find((c) => !used.has(c.id) && artist && principalArtist(c.artist) === artist) ??
      candidates.find((c) => !used.has(c.id) && artist && normalizeText(c.artist).includes(artist)) ??
      candidates.find((c) => !used.has(c.id));

    if (!match?.preview) return track;
    used.add(match.id);
    return { ...track, preview: match.preview };
  });
}

