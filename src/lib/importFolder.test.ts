import { describe, expect, it } from 'vitest';
import { collectDroppedFiles } from './importFolder';

function audioFile(name: string): File {
  return new File(['x'], name, { type: 'audio/mpeg' });
}

function fileEntry(fullPath: string, file: File): FileSystemEntry {
  return {
    isFile: true,
    isDirectory: false,
    name: file.name,
    fullPath,
    file: (ok: (file: File) => void) => ok(file),
  } as unknown as FileSystemEntry;
}

function directoryEntry(fullPath: string, batches: FileSystemEntry[][]): FileSystemEntry {
  let index = 0;
  return {
    isFile: false,
    isDirectory: true,
    name: fullPath.split('/').pop() ?? fullPath,
    fullPath,
    createReader: () => ({
      // Comme l'API réelle : les entrées arrivent par lots, puis un lot vide.
      readEntries: (ok: (entries: FileSystemEntry[]) => void) => {
        const batch = batches[index] ?? [];
        index += 1;
        ok(batch);
      },
    }),
  } as unknown as FileSystemEntry;
}

function dropOf(entries: FileSystemEntry[], files: File[] = []): DataTransfer {
  return {
    items: entries.map((entry) => ({
      kind: 'file',
      webkitGetAsEntry: () => entry,
    })),
    files,
  } as unknown as DataTransfer;
}

describe('collectDroppedFiles', () => {
  it('explore les dossiers récursivement et ignore les fichiers non audio', async () => {
    const album = directoryEntry('/Album', [
      [
        fileEntry('/Album/01 - Un.mp3', audioFile('01 - Un.mp3')),
        fileEntry('/Album/cover.jpg', new File(['x'], 'cover.jpg', { type: 'image/jpeg' })),
        directoryEntry('/Album/Bonus', [
          [fileEntry('/Album/Bonus/02 - Deux.flac', audioFile('02 - Deux.flac'))],
        ]),
      ],
    ]);

    const found = await collectDroppedFiles(dropOf([album]));

    expect(found.map((entry) => entry.path)).toEqual([
      'Album/01 - Un.mp3',
      'Album/Bonus/02 - Deux.flac',
    ]);
  });

  it('rassemble plusieurs lots du lecteur de dossier', async () => {
    const folder = directoryEntry('/Lot', [
      [fileEntry('/Lot/a.mp3', audioFile('a.mp3'))],
      [fileEntry('/Lot/b.mp3', audioFile('b.mp3'))],
      [],
    ]);

    const found = await collectDroppedFiles(dropOf([folder]));

    expect(found.map((entry) => entry.file.name)).toEqual(['a.mp3', 'b.mp3']);
  });

  it('signale chaque fichier audio découvert', async () => {
    const folder = directoryEntry('/Lot', [
      [
        fileEntry('/Lot/a.mp3', audioFile('a.mp3')),
        fileEntry('/Lot/b.mp3', audioFile('b.mp3')),
      ],
    ]);
    const seen: number[] = [];

    await collectDroppedFiles(dropOf([folder]), (count) => seen.push(count));

    expect(seen).toEqual([1, 2]);
  });

  it('retombe sur les fichiers du dépôt sans entrées de dossier', async () => {
    const found = await collectDroppedFiles(dropOf([], [audioFile('seul.mp3')]));

    expect(found).toHaveLength(1);
    expect(found[0].file.name).toBe('seul.mp3');
    expect(found[0].path).toBeUndefined();
  });
});
