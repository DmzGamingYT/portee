import type { Track } from '../types';
import { familyOf, mainArtistOf } from './dailyMix';
import { normalizeText } from './previewMatch';
import { isPlayable } from './tracks';

/**
 * Radio continue : logique pure de prolongation de la file.
 *
 * Principe : quand il ne reste presque plus rien à jouer, on demande au
 * catalogue des titres **proches du dernier morceau de la file** — les plus
 * populaires du même artiste, puis ceux de la même famille de genres — et on
 * les ajoute à la fin. Rien n'est jamais dupliqué : ni un identifiant déjà
 * présent, ni le même titre du même artiste sous une autre édition
 * (« Get Lucky », « Get Lucky - Single », « Get Lucky (feat. …) »).
 *
 * Ce module ne fait aucun appel réseau : la récupération est dans `useRadio`.
 */

/** Longueur maximale de la file, radio comprise. */
export const RADIO_MAX_QUEUE = 300;

/** Source interrogée pour un morceau donné. */
export type RadioSource =
  | { kind: 'artist'; artistId: number }
  | { kind: 'artist'; term: string }
  | { kind: 'genre'; term: string };

/** Clé de titre : accents, casse, pondération et suffixes d'édition ignorés. */
export function radioTitleKey(title: string): string {
  return normalizeText(title);
}

/** Clé d'artiste : seul l'artiste principal compte (« A feat. B » → « a »). */
export function radioArtistKey(artist: string): string {
  return normalizeText(mainArtistOf(artist));
}

/**
 * Clé d'unicité d'un morceau. Deux éditions du même titre par le même artiste
 * partagent la clé ; deux reprises par des artistes différents restent
 * distinctes, ce qui est bien le comportement attendu.
 */
export function radioTrackKey(track: Track): string {
  const artist = radioArtistKey(track.artist);
  const title = radioTitleKey(track.title);
  // Titre illisible (« ??? ») : on retombe sur le titre brut plutôt que de
  // fusionner tous les morceaux de l'artiste en une seule clé.
  return `${artist}::${title || track.title.trim().toLowerCase()}`;
}

/**
 * Sources à interroger pour prolonger la file à partir de `seed` :
 * l'artiste (par son identifiant quand on l'a, sinon par son nom) et, si le
 * genre est reconnu, sa famille musicale pour ne pas tourner en boucle sur un
 * seul artiste.
 */
export function radioSources(seed: Track): RadioSource[] {
  const sources: RadioSource[] = [];
  const artist = mainArtistOf(seed.artist).trim();

  if (typeof seed.artistId === 'number' && Number.isFinite(seed.artistId) && seed.artistId > 0) {
    sources.push({ kind: 'artist', artistId: seed.artistId });
  } else if (artist) {
    sources.push({ kind: 'artist', term: artist });
  }

  const family = familyOf(seed.genre);
  if (family) sources.push({ kind: 'genre', term: family.searchTerm });

  return sources;
}

/** Alterne les listes : le 1er de chacune, puis le 2e, etc. */
export function interleave<T>(lists: ReadonlyArray<readonly T[]>): T[] {
  const out: T[] = [];
  const longest = lists.reduce((max, list) => Math.max(max, list.length), 0);
  for (let i = 0; i < longest; i++) {
    for (const list of lists) {
      if (i < list.length) out.push(list[i]);
    }
  }
  return out;
}

export interface RadioOptions {
  /** file actuelle : tout ce qui s'y trouve déjà est écarté */
  queue?: readonly Track[];
  /** identifiants à ne pas proposer (historique récent, par exemple) */
  excludeIds?: Iterable<string>;
  /** nombre de titres à ajouter (10 par défaut) */
  limit?: number;
  /** plafond par artiste, pour éviter une radio mono-artiste (2 par défaut) */
  maxPerArtist?: number;
}

/**
 * Sélectionne les meilleurs candidats de `sources` (listes ordonnées par
 * pertinence), sans doublon avec la file, l'historique fourni, ni entre eux.
 *
 * Les listes sont alternées avant filtrage : un titre de genre peut donc
 * passer devant le 3e titre du même artiste, et la radio reste variée.
 */
export function radioCandidates(
  sources: ReadonlyArray<readonly Track[]>,
  options: RadioOptions = {}
): Track[] {
  const limit = Math.max(0, options.limit ?? 10);
  const maxPerArtist = Math.max(1, options.maxPerArtist ?? 2);
  if (limit === 0) return [];

  const seenIds = new Set<string>(options.excludeIds ?? []);
  const seenKeys = new Set<string>();
  for (const track of options.queue ?? []) {
    seenIds.add(track.id);
    seenKeys.add(radioTrackKey(track));
  }

  const perArtist = new Map<string, number>();
  const picked: Track[] = [];

  for (const track of interleave(sources)) {
    if (picked.length >= limit) break;
    if (!isPlayable(track) || seenIds.has(track.id)) continue;

    const key = radioTrackKey(track);
    if (seenKeys.has(key)) continue;

    const artist = radioArtistKey(track.artist) || normalizeText(track.artist);
    const count = perArtist.get(artist) ?? 0;
    if (count >= maxPerArtist) continue;

    perArtist.set(artist, count + 1);
    seenIds.add(track.id);
    seenKeys.add(key);
    picked.push(track);
  }

  return picked;
}
