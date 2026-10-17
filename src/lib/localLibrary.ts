import type { Track } from '../types';
import { parseId3v1, parseId3v2, tagsFromFileName, type AudioTags } from './id3';

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
const MAX_TAG_BYTES = 2 * 1024 * 1024;

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

export interface ImportProgress {
  done: number;
  total: number;
  current?: string;
}

export interface ImportFailure {
  name: string;
  reason: string;
}

export interface ImportResult {
  tracks: LocalTrack[];
  failures: ImportFailure[];
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

async function readAudioTags(file: File): Promise<AudioTags> {
  try {
    const head = new Uint8Array(
      await file.slice(0, Math.min(file.size, MAX_TAG_BYTES)).arrayBuffer()
    );
    const v2 = parseId3v2(head);
    if (v2) return v2;
    if (file.size > 128) {
      const tail = new Uint8Array(await file.slice(file.size - 128).arrayBuffer());
      return parseId3v1(tail) ?? {};
    }
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

/* ----------------------------- API publique ------------------------------- */

/** Liste de la bibliothèque (métadonnées uniquement). */
export async function listLocalTracks(): Promise<LocalTrack[]> {
  const db = await openDb();
  const transaction = db.transaction(META_STORE, 'readonly');
  const metas = await requestResult(
    transaction.objectStore(META_STORE).getAll() as IDBRequest<LocalTrackMeta[]>
  );
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

/**
 * Importe des fichiers : tags (MP3), durée réelle, métadonnées, puis stockage
 * du blob. Les erreurs sont renvoyées fichier par fichier.
 */
export async function importAudioFiles(
  files: File[],
  onProgress?: (progress: ImportProgress) => void
): Promise<ImportResult> {
  const list = files.filter((file) => file.size > 0);
  const result: ImportResult = { tracks: [], failures: [] };
  const total = list.length;
  if (total === 0) return result;

  // Demande une persistance durable (best-effort, sans dialogue bloquant).
  try {
    await navigator.storage?.persist?.();
  } catch {
    // non supporté ou refusé : le stockage reste « best-effort »
  }

  let done = 0;
  const startedAt = Date.now();

  for (let index = 0; index < list.length; index++) {
    const file = list[index];
    onProgress?.({ done, total, current: file.name });

    if (!isAudioFile(file)) {
      result.failures.push({ name: file.name, reason: 'Format non reconnu (fichier audio attendu).' });
      done += 1;
      onProgress?.({ done, total, current: file.name });
      continue;
    }

    try {
      const tags = await readAudioTags(file);
      const fallback = tagsFromFileName(file.name);
      const durationMs = await readAudioDuration(file);

      if (!durationMs) {
        result.failures.push({
          name: file.name,
          reason: 'Impossible de lire ce format audio dans ce navigateur.',
        });
        done += 1;
        onProgress?.({ done, total, current: file.name });
        continue;
      }

      const title = clean(tags.title || fallback.title) || 'Titre sans nom';
      const artist = clean(tags.artist || fallback.artist || '') || 'Artiste inconnu';
      const album = clean(tags.album || fallback.album || '') || 'Ma musique locale';
      const id = newId();

      const meta: LocalTrackMeta = {
        id,
        title,
        artist,
        album,
        cover: coverDataUrl(id, title),
        durationMs: Math.max(1000, durationMs),
        genre: tags.genre ? clean(tags.genre, 60) : undefined,
        fileName: file.name,
        mime: mimeOf(file),
        size: file.size,
        // Conserve l'ordre d'import même si les fichiers sont traités dans la même ms.
        addedAt: startedAt + index,
      };

      await putLocalRecord(meta, file);
      result.tracks.push(toLocalTrack(meta));
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
      if (quota) break;
    }

    done += 1;
    onProgress?.({ done, total, current: file.name });
  }

  if (result.tracks.length > 0) notifyLocalChanged();
  return result;
}
