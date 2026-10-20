import type { Track } from '../types';
import { parseId3v1, parseId3v2, tagsFromFileName, type AudioTags } from './id3';
import { albumKey, albumLabel, createDuplicateIndex, fileFingerprint } from './importPlan';
import {
  extractEmbeddedPicture,
  isGeneratedCover,
  pictureToCoverDataUrl,
} from './coverArt';
import { loadAudioCore, tagsFromCore } from './audioCore';

/**
 * Bibliothèque audio locale — 100 % navigateur.
 *
 * Les métadonnées et les fichiers sont stockés dans **deux object stores**
 * IndexedDB distincts : lister la bibliothèque ne charge ainsi jamais les
 * blobs audio en mémoire. Les fichiers ne quittent jamais l'appareil.
 *
 * Un `localId` est ajouté aux pistes : le lecteur résout le blob à la demande
 * et le transforme en object URL éphémère (jamais persistée).
 */

export const LOCAL_CHANGED_EVENT = 'spotifycraft:local-changed';

const DB_NAME = 'spotifycraft-local';
const DB_VERSION = 1;
const META_STORE = 'tracks';
const BLOB_STORE = 'blobs';
/** Plafond du tag ID3 lu pour les métadonnées (les pochettes ont le leur). */
const MAX_ID3_TAG_BYTES = 8 * 1024 * 1024;
/** Les commentaires Vorbis d'un FLAC tiennent largement dans 64 Ko. */
const FLAC_SCAN_BYTES = 64 * 1024;

const AUDIO_EXTENSION = /\.(mp3|m4a|m4b|aac|wav|wave|ogg|oga|opus|flac|webm|aiff|aif)$/i;

const MIME_BY_EXTENSION: Record<string, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  m4b: 'audio/mp4',
  aac: 'audio/aac',
  wav: 'audio/wav',
  wave: 'audio/wav',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg',
  flac: 'audio/flac',
  webm: 'audio/webm',
  aiff: 'audio/aiff',
  aif: 'audio/aiff',
};

export interface LocalTrackMeta {
  id: string;
  title: string;
  artist: string;
  album: string;
  /** petite pochette SVG auto-générée (data URL, quelques centaines d'octets) */
  cover: string;
  durationMs: number;
  genre?: string;
  fileName: string;
  mime: string;
  size: number;
  addedAt: number;
}

export interface LocalTrack extends Track {
  localId: string;
  localFileName: string;
  localSize: number;
  addedAt: number;
}

export interface ImportEntry {
  file: File;
  /** chemin relatif au dossier importé, ex. « Artiste/Album/01.mp3 » */
  path?: string;
}

/** Fichier simple ou fichier accompagné de son chemin relatif. */
export type ImportInput = File | ImportEntry;

export interface AlbumProgress {
  name: string;
  /** album courant (1-based) et nombre total d'albums */
  index: number;
  total: number;
  /** titres déjà traités dans cet album */
  done: number;
  /** titres de cet album */
  tracks: number;
}

export interface ImportProgress {
  /** `scan` : lecture des tags ; `import` : écriture album par album. */
  phase: 'scan' | 'import';
  done: number;
  total: number;
  current?: string;
  album?: AlbumProgress;
}

export interface ImportFailure {
  name: string;
  reason: string;
}

export interface ImportDuplicate {
  name: string;
  reason: string;
}

export interface AlbumImportSummary {
  name: string;
  imported: number;
  duplicates: number;
  failed: number;
}

export interface ImportResult {
  tracks: LocalTrack[];
  failures: ImportFailure[];
  duplicates: ImportDuplicate[];
  /** fichiers non audio écartés sans erreur (pochettes, fichiers système…) */
  ignored: number;
  albums: AlbumImportSummary[];
}

interface BlobRecord {
  id: string;
  blob: Blob;
}

/* ------------------------------- IndexedDB -------------------------------- */

let dbPromise: Promise<IDBDatabase> | null = null;
const urlCache = new Map<string, string>();

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  const promise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB n’est pas disponible dans ce navigateur.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(BLOB_STORE)) {
        db.createObjectStore(BLOB_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Ouverture d’IndexedDB impossible.'));
    request.onblocked = () =>
      reject(new Error('IndexedDB est bloquée par un autre onglet de l’application.'));
  });

  dbPromise = promise;
  // Autorise une nouvelle tentative après un échec (mode privé, blocage…).
  promise.catch(() => {
    if (dbPromise === promise) dbPromise = null;
  });
  return promise;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Requête IndexedDB échouée.'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Transaction IndexedDB échouée.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Transaction annulée.'));
  });
}

function notifyLocalChanged(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(LOCAL_CHANGED_EVENT));
}

/* -------------------------------- helpers --------------------------------- */

function newId(): string {
  const uuid =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `local-${uuid}`;
}

function clean(value: string, max = 200): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : '';
}

function mimeOf(file: File): string {
  return file.type || MIME_BY_EXTENSION[extensionOf(file.name)] || 'audio/mpeg';
}

/** Fichier audio probable (type MIME ou extension connue). */
export function isAudioFile(file: File): boolean {
  return file.size > 0 && (file.type.startsWith('audio/') || AUDIO_EXTENSION.test(file.name));
}

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (char) => {
    switch (char) {
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '&':
        return '&amp;';
      case "'":
        return '&apos;';
      default:
        return '&quot;';
    }
  });
}

/** Pochette SVG stable et minuscule (aucune image à extraire pour l'instant). */
function coverDataUrl(seed: string, title: string): string {
  const hue = [...seed].reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) % 360, 7);
  const label = Array.from(title.trim())[0]?.toUpperCase() ?? '♪';
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="hsl(${hue}, 65%, 45%)"/>` +
    `<stop offset="1" stop-color="hsl(${(hue + 55) % 360}, 60%, 26%)"/>` +
    `</linearGradient></defs>` +
    `<rect width="300" height="300" fill="url(#g)"/>` +
    `<text x="150" y="178" text-anchor="middle" font-family="system-ui, sans-serif" ` +
    `font-size="108" font-weight="700" fill="rgba(255,255,255,0.88)">${escapeXml(label)}</text>` +
    `</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function toLocalTrack(meta: LocalTrackMeta): LocalTrack {
  return {
    id: meta.id,
    title: meta.title,
    artist: meta.artist,
    album: meta.album,
    cover: meta.cover,
    durationMs: meta.durationMs,
    genre: meta.genre,
    localId: meta.id,
    localFileName: meta.fileName,
    localSize: meta.size,
    addedAt: meta.addedAt,
  };
}

function id3TagSize(header: Uint8Array): number {
  return (
    (((header[6] ?? 0) & 0x7f) << 21) |
    (((header[7] ?? 0) & 0x7f) << 14) |
    (((header[8] ?? 0) & 0x7f) << 7) |
    ((header[9] ?? 0) & 0x7f)
  );
}

/**
 * Plan de lecture des tags : combien d'octets lire, et où.
 *
 * C'est ce plan — et non une heuristique au moment de l'import — qui garantit
 * qu'un fichier de 1,5 Mo ne coûte pas 1,5 Mo de lecture : en-tête ID3 de
 * 10 octets pour connaître la taille exacte du tag, 64 Ko pour un FLAC,
 * 128 derniers octets pour ID3v1.
 */
export interface TagReadPlan {
  format: 'id3v2' | 'flac' | 'id3v1' | 'none';
  /** octets à lire (depuis le début, ou depuis la fin pour `id3v1`) */
  bytes: number;
}

export function tagReadPlan(header: Uint8Array, fileSize: number): TagReadPlan {
  // ID3v2 : « ID3 » + taille du tag (7 bits par octet) dans l'en-tête.
  if (header[0] === 0x49 && header[1] === 0x44 && header[2] === 0x33) {
    const size = id3TagSize(header);
    if (size <= 0 || size > MAX_ID3_TAG_BYTES) return { format: 'none', bytes: 0 };
    return { format: 'id3v2', bytes: Math.min(fileSize, 10 + size) };
  }

  if (header[0] === 0x66 && header[1] === 0x4c && header[2] === 0x61 && header[3] === 0x43) {
    return { format: 'flac', bytes: Math.min(fileSize, FLAC_SCAN_BYTES) };
  }

  if (fileSize > 128) return { format: 'id3v1', bytes: 128 };
  return { format: 'none', bytes: 0 };
}

/**
 * Tags d'un fichier, sans lire plus que nécessaire — voir `tagReadPlan`. Le
 * décodage est confié au noyau Rust/WASM quand il est disponible, sinon aux
 * parseurs JavaScript.
 */
async function readAudioTags(file: File): Promise<AudioTags> {
  try {
    const core = await loadAudioCore();
    const header = new Uint8Array(
      await file.slice(0, Math.min(file.size, 10)).arrayBuffer()
    );
    const plan = tagReadPlan(header, file.size);

    // FLAC : commentaires Vorbis (le noyau Rust est seul à les lire).
    if (plan.format === 'flac' && !core) return {};
    if (plan.format === 'none') return {};

    const buffer =
      plan.format === 'id3v1'
        ? new Uint8Array(await file.slice(file.size - 128).arrayBuffer())
        : new Uint8Array(await file.slice(0, plan.bytes).arrayBuffer());

    if (core) return tagsFromCore(core.parseTags(buffer));
    if (plan.format === 'id3v2') return parseId3v2(buffer) ?? {};
    return parseId3v1(buffer) ?? {};
  } catch {
    // fichier illisible : on retombe sur le nom
  }
  return {};
}

/** Lit la durée réelle via un élément audio, sans charger tout le fichier en JS. */
async function readAudioDuration(blob: Blob): Promise<number | null> {
  if (typeof Audio === 'undefined') return null;
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio();
    let settled = false;

    const finish = (value: number | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      audio.onloadedmetadata = null;
      audio.onerror = null;
      audio.removeAttribute('src');
      try {
        audio.load();
      } catch {
        // on libère simplement l'élément
      }
      URL.revokeObjectURL(url);
      resolve(value);
    };

    const timer = window.setTimeout(() => finish(null), 12_000);
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      const seconds = audio.duration;
      finish(Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 1000) : null);
    };
    audio.onerror = () => finish(null);
    audio.src = url;
    audio.load();
  });
}

/** Pochette intégrée (APIC / FLAC PICTURE) réduite en vignette, ou null. */
async function coverFromBlob(blob: Blob): Promise<string | null> {
  const picture = await extractEmbeddedPicture(blob);
  return picture ? pictureToCoverDataUrl(picture) : null;
}

/* ----------------------------- API publique ------------------------------- */

/** Métadonnées brutes (aucun blob chargé). */
async function readMetas(): Promise<LocalTrackMeta[]> {
  const db = await openDb();
  const transaction = db.transaction(META_STORE, 'readonly');
  return requestResult(
    transaction.objectStore(META_STORE).getAll() as IDBRequest<LocalTrackMeta[]>
  );
}

/** Liste de la bibliothèque (métadonnées uniquement). */
export async function listLocalTracks(): Promise<LocalTrack[]> {
  const metas = await readMetas();
  return metas.map(toLocalTrack).sort((a, b) => b.addedAt - a.addedAt);
}

/** Blob audio brut d'une piste locale. */
export async function getLocalBlob(id: string): Promise<Blob | null> {
  const db = await openDb();
  const transaction = db.transaction(BLOB_STORE, 'readonly');
  const record = await requestResult(
    transaction.objectStore(BLOB_STORE).get(id) as IDBRequest<BlobRecord | undefined>
  );
  return record?.blob ?? null;
}

/**
 * Object URL du fichier local, mise en cache pour la session.
 * Retourne null si le fichier a été supprimé.
 */
export async function getLocalAudioUrl(id: string): Promise<string | null> {
  const cached = urlCache.get(id);
  if (cached) return cached;

  const blob = await getLocalBlob(id);
  if (!blob) return null;

  const url = URL.createObjectURL(blob);
  urlCache.set(id, url);
  return url;
}

async function putLocalRecord(meta: LocalTrackMeta, blob: Blob): Promise<void> {
  const db = await openDb();
  const transaction = db.transaction([META_STORE, BLOB_STORE], 'readwrite');
  transaction.objectStore(META_STORE).put(meta);
  transaction.objectStore(BLOB_STORE).put({ id: meta.id, blob } satisfies BlobRecord);
  await transactionDone(transaction);
}

/** Supprime une piste (métadonnées + fichier) et libère son object URL. */
export async function deleteLocalTrack(id: string): Promise<void> {
  const db = await openDb();
  const transaction = db.transaction([META_STORE, BLOB_STORE], 'readwrite');
  transaction.objectStore(META_STORE).delete(id);
  transaction.objectStore(BLOB_STORE).delete(id);
  await transactionDone(transaction);

  const url = urlCache.get(id);
  if (url) {
    URL.revokeObjectURL(url);
    urlCache.delete(id);
  }
  notifyLocalChanged();
}

/** Vide toute la bibliothèque locale. */
export async function clearLocalTracks(): Promise<void> {
  const db = await openDb();
  const transaction = db.transaction([META_STORE, BLOB_STORE], 'readwrite');
  transaction.objectStore(META_STORE).clear();
  transaction.objectStore(BLOB_STORE).clear();
  await transactionDone(transaction);

  for (const url of urlCache.values()) URL.revokeObjectURL(url);
  urlCache.clear();
  notifyLocalChanged();
}

function toEntry(input: ImportInput): ImportEntry {
  if ('file' in input) return input;
  return { file: input, path: input.webkitRelativePath || undefined };
}

/** Chemin servant au tri et au regroupement (dossier relatif quand on en a un). */
function entryPath(entry: ImportEntry): string {
  return entry.path || entry.file.webkitRelativePath || entry.file.name;
}

interface ScannedEntry {
  entry: ImportEntry;
  tags: AudioTags;
}

/**
 * Importe des fichiers ou un dossier entier dans IndexedDB.
 *
 * 1. `scan` : lecture des tags de chaque fichier pour connaître son album ;
 *    les doublons évidents (même nom + même taille) sont écartés.
 * 2. `import` : écriture **album par album**, avec une progression détaillée
 *    (album courant, titres traités dans l'album, total).
 *
 * Sont ignorés : un fichier déjà importé, une copie présente deux fois dans la
 * sélection, et un même titre (artiste + album + durée proche) déjà stocké,
 * même sous un autre nom de fichier. Les fichiers non audio sont écartés
 * silencieusement (pochettes, fichiers système d'un dossier).
 */
export async function importAudioFiles(
  inputs: ImportInput[],
  onProgress?: (progress: ImportProgress) => void
): Promise<ImportResult> {
  const entries = inputs.map(toEntry).filter((entry) => entry.file.size > 0);
  const result: ImportResult = {
    tracks: [],
    failures: [],
    duplicates: [],
    ignored: 0,
    albums: [],
  };

  const audio = entries.filter((entry) => isAudioFile(entry.file));
  result.ignored = entries.length - audio.length;
  if (audio.length === 0) return result;

  // Ordre naturel des pistes (« 02 » avant « 10 ») pour un import album par album.
  audio.sort((a, b) =>
    entryPath(a).localeCompare(entryPath(b), 'fr', { numeric: true, sensitivity: 'base' })
  );

  // Demande une persistance durable (best-effort, sans dialogue bloquant).
  try {
    await navigator.storage?.persist?.();
  } catch {
    // non supporté ou refusé : le stockage reste « best-effort »
  }

  const index = createDuplicateIndex(await readMetas());
  const batch = new Set<string>();
  const scanned: ScannedEntry[] = [];

  /* --- phase 1 : tags + doublons de fichiers ----------------------------- */
  for (let position = 0; position < audio.length; position++) {
    const entry = audio[position];
    const name = entry.file.name;
    onProgress?.({ phase: 'scan', done: position, total: audio.length, current: name });

    if (index.hasFile(name, entry.file.size)) {
      result.duplicates.push({ name, reason: 'Fichier déjà importé' });
      continue;
    }

    const fingerprint = fileFingerprint(name, entry.file.size);
    if (batch.has(fingerprint)) {
      result.duplicates.push({ name, reason: 'Copie dans la sélection' });
      continue;
    }
    batch.add(fingerprint);

    scanned.push({ entry, tags: await readAudioTags(entry.file) });
  }
  onProgress?.({ phase: 'scan', done: audio.length, total: audio.length });

  /* --- regroupement par album ------------------------------------------- */
  const groups = new Map<string, { key: string; name: string; items: ScannedEntry[] }>();
  for (const item of scanned) {
    const key = albumKey(item.entry.path, item.tags.album);
    const group = groups.get(key);
    if (group) {
      group.items.push(item);
    } else {
      groups.set(key, {
        key,
        name: albumLabel(item.entry.path, item.tags.album),
        items: [item],
      });
    }
  }
  const albums = [...groups.values()];

  /* --- phase 2 : écriture album par album -------------------------------- */
  const total = scanned.length;
  const startedAt = Date.now();
  const albumCovers = new Map<string, string>();
  let done = 0;
  let aborted = false;

  for (let albumIndex = 0; albumIndex < albums.length && !aborted; albumIndex++) {
    const group = albums[albumIndex];
    const summary: AlbumImportSummary = {
      name: group.name,
      imported: 0,
      duplicates: 0,
      failed: 0,
    };
    const album: AlbumProgress = {
      name: group.name,
      index: albumIndex + 1,
      total: albums.length,
      done: 0,
      tracks: group.items.length,
    };

    for (const { entry, tags } of group.items) {
      const file = entry.file;
      onProgress?.({ phase: 'import', done, total, current: file.name, album: { ...album } });

      const fallback = tagsFromFileName(file.name);
      const title = clean(tags.title || fallback.title) || 'Titre sans nom';
      const artist = clean(tags.artist || fallback.artist || '') || 'Artiste inconnu';
      const albumName =
        clean(tags.album || fallback.album || '') || albumLabel(entry.path, undefined);
      const durationMs = await readAudioDuration(file);

      if (!durationMs) {
        result.failures.push({
          name: file.name,
          reason: 'Impossible de lire ce format audio dans ce navigateur.',
        });
        summary.failed += 1;
      } else {
        const duration = Math.max(1000, durationMs);
        if (index.hasTrack(title, artist, albumName, duration)) {
          result.duplicates.push({ name: file.name, reason: 'Même titre déjà présent' });
          summary.duplicates += 1;
        } else {
          // Une seule extraction par album : les pistes partagent la pochette.
          let cover = albumCovers.get(group.key);
          if (!cover) {
            cover = (await coverFromBlob(file)) ?? undefined;
            if (cover) albumCovers.set(group.key, cover);
          }

          const id = newId();
          const meta: LocalTrackMeta = {
            id,
            title,
            artist,
            album: albumName,
            cover: cover ?? coverDataUrl(id, title),
            durationMs: duration,
            genre: tags.genre ? clean(tags.genre, 60) : undefined,
            fileName: file.name,
            mime: mimeOf(file),
            size: file.size,
            // Conserve l'ordre d'import même pour des fichiers traités dans la même ms.
            addedAt: startedAt + done,
          };

          try {
            await putLocalRecord(meta, file);
            index.rememberTrack(title, artist, albumName, duration);
            result.tracks.push(toLocalTrack(meta));
            summary.imported += 1;
          } catch (err) {
            const quota =
              err instanceof DOMException &&
              (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED');
            result.failures.push({
              name: file.name,
              reason: quota
                ? 'Espace de stockage du navigateur insuffisant.'
                : 'Échec de l’enregistrement du fichier.',
            });
            summary.failed += 1;
            if (quota) aborted = true;
          }
        }
      }

      done += 1;
      album.done += 1;
      onProgress?.({ phase: 'import', done, total, current: file.name, album: { ...album } });
      if (aborted) break;
    }

    result.albums.push(summary);
  }

  if (result.tracks.length > 0) notifyLocalChanged();
  return result;
}

export interface CoverRefreshProgress {
  done: number;
  total: number;
}

export interface CoverRefreshResult {
  /** fichiers dont la pochette est encore générée */
  total: number;
  /** fichiers dont la pochette a été remplacée par l'image intégrée */
  updated: number;
}

/**
 * Remplace les visuels générés des fichiers déjà importés par la pochette
 * intégrée (MP3 APIC / FLAC PICTURE). Les fichiers sans image sont laissés
 * tels quels ; une pochette trouvée pour un album est réutilisée par ses
 * autres pistes sans relire leur contenu.
 */
export async function refreshLocalCovers(
  onProgress?: (progress: CoverRefreshProgress) => void
): Promise<CoverRefreshResult> {
  const metas = await readMetas();
  const targets = metas.filter((meta) => isGeneratedCover(meta.cover));
  if (targets.length === 0) return { total: 0, updated: 0 };

  const db = await openDb();
  const covers = new Map<string, string>();
  let updated = 0;

  for (let index = 0; index < targets.length; index++) {
    const meta = targets[index];
    onProgress?.({ done: index, total: targets.length });

    const key = `${meta.artist.toLowerCase()}|${meta.album.toLowerCase()}`;
    let cover = covers.get(key);

    if (!cover) {
      const blob = await getLocalBlob(meta.id);
      if (!blob) continue;
      const found = await coverFromBlob(blob);
      if (!found) continue;
      cover = found;
      covers.set(key, cover);
    }

    const transaction = db.transaction(META_STORE, 'readwrite');
    transaction.objectStore(META_STORE).put({ ...meta, cover });
    await transactionDone(transaction);
    updated += 1;
  }

  onProgress?.({ done: targets.length, total: targets.length });
  if (updated > 0) notifyLocalChanged();
  return { total: targets.length, updated };
}
