import { normalizeImageMime, parseId3v2Picture, type EmbeddedPicture } from './id3';
import { loadAudioCore, type AudioCore } from './audioCore';

/**
 * Pochettes intégrées aux fichiers audio.
 *
 * - MP3 : frame ID3v2 `APIC` (v2.3/v2.4), lue après l'en-tête du tag.
 * - FLAC : bloc de métadonnées `PICTURE` (type 6) de l'en-tête `fLaC`.
 *
 * Seuls les octets nécessaires sont lus (en-tête, blocs, image) : un import de
 * dossier ne charge pas chaque fichier entier en mémoire. L'image est ensuite
 * réduite en vignette JPEG carrée, pour ne pas gonfler IndexedDB ni les listes.
 */

export interface FlacPicture extends EmbeddedPicture {
  /** type FLAC de l'image (3 = pochette recto) */
  type: number;
}

/** Garde-fou : une pochette plus lourde que 8 Mo est ignorée. */
export const MAX_EMBEDDED_COVER_BYTES = 8 * 1024 * 1024;

/** Côté de la vignette stockée (suffisant pour les plus grands affichages). */
const THUMB_SIZE = 240;
const JPEG_QUALITY = 0.82;

/** Au-delà, on refuse de stocker l'original en data URL faute de vignette. */
const RAW_FALLBACK_LIMIT = 600_000;

function uint32be(bytes: Uint8Array, offset: number): number {
  return (
    (((bytes[offset] ?? 0) << 24) |
      ((bytes[offset + 1] ?? 0) << 16) |
      ((bytes[offset + 2] ?? 0) << 8) |
      (bytes[offset + 3] ?? 0)) >>>
    0
  );
}

/**
 * Parse le contenu d'un bloc FLAC PICTURE (sans l'en-tête de bloc) :
 * type, MIME, description, dimensions, puis les octets de l'image.
 */
export function parseFlacPictureBlock(block: Uint8Array): FlacPicture | null {
  if (block.length < 8) return null;

  let offset = 0;
  const type = uint32be(block, offset);
  offset += 4;

  const mimeLength = uint32be(block, offset);
  offset += 4;
  if (mimeLength === 0 || mimeLength > block.length - offset) return null;
  const mime = new TextDecoder('iso-8859-1').decode(block.subarray(offset, offset + mimeLength));
  offset += mimeLength;

  if (offset + 4 > block.length) return null;
  const descriptionLength = uint32be(block, offset);
  offset += 4;
  if (descriptionLength > block.length - offset) return null;
  offset += descriptionLength;

  // width, height, depth, colors
  if (offset + 20 > block.length) return null;
  offset += 16;

  const dataLength = uint32be(block, offset);
  offset += 4;
  if (dataLength === 0 || dataLength > block.length - offset) return null;

  return {
    mime: normalizeImageMime(mime),
    data: block.subarray(offset, offset + dataLength),
    type,
  };
}

async function readBytes(blob: Blob, start: number, end: number): Promise<Uint8Array> {
  const stop = Math.min(end, blob.size);
  if (stop <= start) return new Uint8Array(0);
  return new Uint8Array(await blob.slice(start, stop).arrayBuffer());
}

function tagSizeFromHeader(header: Uint8Array): number {
  return (
    (((header[6] ?? 0) & 0x7f) << 21) |
    (((header[7] ?? 0) & 0x7f) << 14) |
    (((header[8] ?? 0) & 0x7f) << 7) |
    ((header[9] ?? 0) & 0x7f)
  );
}

async function id3Picture(blob: Blob, core: AudioCore | null): Promise<EmbeddedPicture | null> {
  if (blob.size < 10) return null;
  const header = await readBytes(blob, 0, 10);
  if (header[0] !== 0x49 || header[1] !== 0x44 || header[2] !== 0x33) return null; // "ID3"

  const tagSize = tagSizeFromHeader(header);
  if (tagSize <= 0 || tagSize > MAX_EMBEDDED_COVER_BYTES) return null;

  const tag = await readBytes(blob, 0, 10 + tagSize);
  if (core) {
    const parsed = core.parseCover(tag);
    if (parsed.picture && parsed.pictureMime) {
      return { mime: parsed.pictureMime, data: parsed.picture };
    }
  }
  return parseId3v2Picture(tag);
}

async function flacPicture(blob: Blob, core: AudioCore | null): Promise<EmbeddedPicture | null> {
  if (blob.size < 8) return null;
  const marker = await readBytes(blob, 0, 4);
  if (String.fromCharCode(...marker) !== 'fLaC') return null;

  let offset = 4;
  for (let index = 0; index < 256 && offset + 4 <= blob.size; index++) {
    const header = await readBytes(blob, offset, offset + 4);
    if (header.length < 4) break;

    const last = ((header[0] ?? 0) & 0x80) !== 0;
    const type = (header[0] ?? 0) & 0x7f;
    const length = (((header[1] ?? 0) << 16) | ((header[2] ?? 0) << 8) | (header[3] ?? 0)) >>> 0;
    const start = offset + 4;

    if (type === 6 && length > 0 && length <= MAX_EMBEDDED_COVER_BYTES) {
      const payload = await readBytes(blob, start, start + length);
      if (core) {
        const parsed = core.parseFlacPicture(payload);
        if (parsed.picture && parsed.pictureMime) {
          return { mime: parsed.pictureMime, data: parsed.picture };
        }
      }
      const picture = parseFlacPictureBlock(payload);
      if (picture) return picture;
    }

    offset = start + length;
    if (last) break;
  }

  return null;
}

/** Extrait la pochette intégrée d'un MP3 (APIC) ou d'un FLAC (PICTURE). */
export async function extractEmbeddedPicture(blob: Blob): Promise<EmbeddedPicture | null> {
  try {
    const core = await loadAudioCore();
    return (await id3Picture(blob, core)) ?? (await flacPicture(blob, core));
  } catch {
    return null;
  }
}

function rawDataUrl(picture: EmbeddedPicture): string | null {
  try {
    let binary = '';
    const chunk = 0x8000;
    for (let index = 0; index < picture.data.length; index += chunk) {
      binary += String.fromCharCode(...picture.data.subarray(index, index + chunk));
    }
    return `data:${picture.mime};base64,${btoa(binary)}`;
  } catch {
    return null;
  }
}

/**
 * Réduit la pochette en vignette carrée 240 px (JPEG), recadrée au centre.
 * Sans canvas (tests, vieux navigateurs), renvoie l'image d'origine en data URL
 * si elle reste raisonnable.
 */
export async function pictureToCoverDataUrl(picture: EmbeddedPicture): Promise<string | null> {
  if (picture.data.length === 0) return null;
  const fallback = picture.data.length <= RAW_FALLBACK_LIMIT ? rawDataUrl(picture) : null;

  if (typeof document === 'undefined' || typeof createImageBitmap !== 'function') return fallback;

  try {
    // Copie dans un ArrayBuffer dédié : `BlobPart` n'accepte pas les vues
    // typées adossées à un `SharedArrayBuffer` potentiel.
    const buffer = new ArrayBuffer(picture.data.byteLength);
    new Uint8Array(buffer).set(picture.data);
    const bitmap = await createImageBitmap(new Blob([buffer], { type: picture.mime }));
    if (bitmap.width <= 0 || bitmap.height <= 0) {
      bitmap.close?.();
      return fallback;
    }

    const canvas = document.createElement('canvas');
    canvas.width = THUMB_SIZE;
    canvas.height = THUMB_SIZE;
    const context = canvas.getContext('2d');
    if (!context) {
      bitmap.close?.();
      return fallback;
    }

    const scale = Math.max(THUMB_SIZE / bitmap.width, THUMB_SIZE / bitmap.height);
    const width = bitmap.width * scale;
    const height = bitmap.height * scale;
    context.drawImage(bitmap, (THUMB_SIZE - width) / 2, (THUMB_SIZE - height) / 2, width, height);
    bitmap.close?.();

    const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
    return dataUrl.startsWith('data:image/jpeg') ? dataUrl : fallback;
  } catch {
    return fallback;
  }
}

/** Pochette de remplacement (dégradé SVG) générée quand aucun visuel n'existe. */
export function isGeneratedCover(cover: string | undefined): boolean {
  return typeof cover === 'string' && cover.startsWith('data:image/svg');
}
