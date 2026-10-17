/**
 * Logique pure de préparation d'un import dans la bibliothèque locale.
 *
 * Un import de dossier doit :
 * - reconnaître un fichier déjà importé, même déplacé ou renommé ;
 * - regrouper les titres **par album** (dossier ou tag) pour la progression ;
 * - rester testable sans navigateur ni IndexedDB.
 */

/** Métadonnées minimales d'un titre déjà présent (ou à importer). */
export interface TrackLike {
  title: string;
  artist: string;
  album: string;
  durationMs: number;
  fileName: string;
  size: number;
}

/** Écart de durée toléré pour considérer deux fichiers comme le même titre. */
export const DURATION_TOLERANCE_MS = 2000;

/**
 * Clé de comparaison : minuscules, accents retirés, ponctuation réduite.
 * « Beyoncé — Déjà Vu » et « beyonce deja vu » donnent la même clé.
 */
export function normalizeKey(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function toPosix(path: string): string {
  return path.replace(/\\/g, '/');
}

/** Nom du fichier sans son chemin. */
export function baseName(path: string): string {
  const clean = toPosix(path);
  const slash = clean.lastIndexOf('/');
  return slash >= 0 ? clean.slice(slash + 1) : clean;
}

/** Dossier parent (chaîne vide si le chemin ne contient pas de dossier). */
export function folderOf(path: string): string {
  const clean = toPosix(path);
  const slash = clean.lastIndexOf('/');
  return slash > 0 ? clean.slice(0, slash) : '';
}

/**
 * Empreinte d'un fichier : nom (insensible à la casse) + taille.
 * Deux copies du même fichier partagent cette empreinte, même après
 * déplacement ; deux morceaux différents ne la partagent quasiment jamais.
 */
export function fileFingerprint(pathOrName: string, size: number): string {
  return `${normalizeKey(baseName(pathOrName))}|${size}`;
}

/**
 * Identifiant de regroupement d'album.
 *
 * Le dossier est privilégié (deux « Greatest Hits » d'artistes différents
 * restent séparés) et le tag album distingue plusieurs albums rangés dans un
 * même dossier (compilations). Sans chemin, seul le tag compte.
 */
export function albumKey(path: string | undefined, albumTag: string | undefined): string {
  const folder = path ? folderOf(path) : '';
  const album = normalizeKey(albumTag ?? '');
  if (folder) return `folder:${folder.toLowerCase()}|${album}`;
  return album ? `album:${album}` : 'album:inconnu';
}

/** Libellé affiché : tag album, sinon nom du dossier, sinon valeur de repli. */
export function albumLabel(path: string | undefined, albumTag: string | undefined): string {
  const tag = (albumTag ?? '').trim();
  if (tag) return tag;
  const folder = path ? folderOf(path) : '';
  if (folder) return baseName(folder) || folder;
  return 'Ma musique locale';
}

/** Identité musicale d'un titre (indépendante du nom de fichier). */
export function trackKey(title: string, artist: string, album: string): string {
  return [title, artist, album].map(normalizeKey).join('|');
}

/**
 * Index de dédoublonnage, alimenté par la bibliothèque existante puis par les
 * fichiers importés pendant la session.
 */
export interface DuplicateIndex {
  /** Un fichier de mêmes nom et taille a-t-il déjà été vu ? */
  hasFile: (pathOrName: string, size: number) => boolean;
  /** Un titre de même identité et de durée proche existe-t-il déjà ? */
  hasTrack: (title: string, artist: string, album: string, durationMs: number) => boolean;
  rememberFile: (pathOrName: string, size: number) => void;
  rememberTrack: (title: string, artist: string, album: string, durationMs: number) => void;
}

export function createDuplicateIndex(existing: readonly TrackLike[] = []): DuplicateIndex {
  const files = new Set<string>();
  const durations = new Map<string, number[]>();

  const rememberFile = (pathOrName: string, size: number) => {
    files.add(fileFingerprint(pathOrName, size));
  };

  const rememberTrack = (title: string, artist: string, album: string, durationMs: number) => {
    const key = trackKey(title, artist, album);
    const list = durations.get(key);
    if (list) list.push(durationMs);
    else durations.set(key, [durationMs]);
  };

  for (const track of existing) {
    rememberFile(track.fileName, track.size);
    rememberTrack(track.title, track.artist, track.album, track.durationMs);
  }

  return {
    hasFile: (pathOrName, size) => files.has(fileFingerprint(pathOrName, size)),
    hasTrack: (title, artist, album, durationMs) => {
      const list = durations.get(trackKey(title, artist, album));
      if (!list) return false;
      return list.some((known) => Math.abs(known - durationMs) <= DURATION_TOLERANCE_MS);
    },
    rememberFile,
    rememberTrack,
  };
}
