import { isAudioFile, type ImportEntry } from './localLibrary';

/**
 * Exploration des dossiers déposés dans la fenêtre.
 *
 * L'API de dépôt expose des entrées de système de fichiers (dossiers inclus) ;
 * on les parcourt pour récupérer les fichiers audio avec leur chemin relatif,
 * ce qui permet de les regrouper album par album. Un dépôt de simples fichiers
 * reste pris en charge.
 */

/** Garde-fou : évite d'explorer un dossier gigantesque par accident. */
export const MAX_DROPPED_FILES = 5000;
const MAX_DEPTH = 12;

function fileOf(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

function childrenOf(directory: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
  const reader = directory.createReader();
  const all: FileSystemEntry[] = [];

  return new Promise((resolve, reject) => {
    const read = () => {
      reader.readEntries((batch) => {
        if (batch.length === 0) {
          resolve(all);
          return;
        }
        all.push(...batch);
        read();
      }, reject);
    };
    read();
  });
}

/**
 * Rassemble les fichiers audio d'un dépôt (fichiers et/ou dossiers).
 * `onFound` est appelé à chaque fichier audio découvert pour afficher
 * l'avancement pendant l'exploration.
 */
export async function collectDroppedFiles(
  transfer: DataTransfer,
  onFound?: (count: number, name: string) => void
): Promise<ImportEntry[]> {
  // `webkitGetAsEntry` doit être appelé de façon synchrone, avant tout await.
  const roots: FileSystemEntry[] = [];
  for (const item of Array.from(transfer.items ?? [])) {
    if (item.kind !== 'file') continue;
    const entry = item.webkitGetAsEntry?.();
    if (entry) roots.push(entry);
  }

  if (roots.length === 0) {
    return Array.from(transfer.files ?? [])
      .filter(isAudioFile)
      .map((file) => ({ file, path: file.webkitRelativePath || undefined }));
  }

  const found: ImportEntry[] = [];

  const walk = async (entry: FileSystemEntry, depth: number): Promise<void> => {
    if (found.length >= MAX_DROPPED_FILES) return;

    if (entry.isFile) {
      try {
        const file = await fileOf(entry as FileSystemFileEntry);
        if (!isAudioFile(file)) return;
        found.push({ file, path: entry.fullPath.replace(/^\//, '') || undefined });
        onFound?.(found.length, file.name);
      } catch {
        // fichier inaccessible (permissions, I/O) : ignoré
      }
      return;
    }

    if (!entry.isDirectory || depth > MAX_DEPTH) return;
    const children = await childrenOf(entry as FileSystemDirectoryEntry);
    for (const child of children) {
      if (found.length >= MAX_DROPPED_FILES) return;
      await walk(child, depth + 1);
    }
  };

  for (const root of roots) {
    if (found.length >= MAX_DROPPED_FILES) break;
    await walk(root, 0);
  }

  return found;
}
