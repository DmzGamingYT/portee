import type { Track } from '../types';
import { normalizeText } from './previewMatch';

/** Une piste est lisible si elle a un extrait distant ou un fichier local. */
export function isPlayable(track: Track): boolean {
  return Boolean(track.preview || track.localId);
}

/** Artiste principal d'une liste « A, B & C » ou « A feat. B ». */
function mainArtist(value: string): string {
  return normalizeText(value.split(/[,&]|\s+(?:feat\.?|ft\.?|featuring)\s+/i)[0] ?? '');
}

/**
 * Évite qu'une étagère d'accueil soit remplie par un seul album : on limite
 * d'abord chaque artiste à `maxPerArtist` titres, puis on complète avec les
 * titres écartés si la rangée n'est pas pleine.
 */
export function diversifyTracks(tracks: Track[], maxPerArtist = 2, limit = 20): Track[] {
  const out: Track[] = [];
  const skipped: Track[] = [];
  const counts = new Map<string, number>();

  for (const track of tracks) {
    if (out.length >= limit) break;
    const key = mainArtist(track.artist) || track.artist;
    const seen = counts.get(key) ?? 0;
    if (seen >= maxPerArtist) {
      skipped.push(track);
      continue;
    }
    counts.set(key, seen + 1);
    out.push(track);
  }

  if (out.length < limit && skipped.length > 0) {
    out.push(...skipped.slice(0, limit - out.length));
  }
  return out;
}
