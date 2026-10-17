/**
 * Lecture des tags audio, sans dépendance.
 *
 * - ID3v2.3 / ID3v2.4 (MP3) : titre, artiste, album, genre, année.
 * - ID3v1 (128 derniers octets) en secours.
 * - Sinon, déduction depuis le nom de fichier (« Artiste - Titre.mp3 »).
 *
 * Les formats conteneurs (M4A, FLAC, OGG…) ne sont pas parsés : le nom de
 * fichier sert de métadonnée de secours, et la durée est lue par le navigateur.
 */

export interface AudioTags {
  title?: string;
  artist?: string;
  album?: string;
  genre?: string;
  year?: string;
}

function toBytes(input: ArrayBuffer | Uint8Array): Uint8Array {
  return input instanceof Uint8Array ? input : new Uint8Array(input);
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    const code = bytes[start + i];
    if (code === undefined) break;
    out += String.fromCharCode(code);
  }
  return out;
}

function uint32(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] ?? 0) << 24) |
    ((bytes[offset + 1] ?? 0) << 16) |
    ((bytes[offset + 2] ?? 0) << 8) |
    (bytes[offset + 3] ?? 0)
  ) >>> 0;
}

/** Taille ID3v2.4 : 4 octets à 7 bits, bit de poids fort ignoré. */
function syncsafe(bytes: Uint8Array, offset: number): number {
  return (
    (((bytes[offset] ?? 0) & 0x7f) << 21) |
    (((bytes[offset + 1] ?? 0) & 0x7f) << 14) |
    (((bytes[offset + 2] ?? 0) & 0x7f) << 7) |
    ((bytes[offset + 3] ?? 0) & 0x7f)
  ) >>> 0;
}

function clean(value: string): string {
  return value
    .replace(/\u0000/g, '')
    .replace(/[\u0001-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .trim();
}

function decodeTextPayload(payload: Uint8Array): string {
  if (payload.length < 2) return '';
  const encoding = payload[0];
  let bytes = payload.subarray(1);
  let label = 'iso-8859-1';

  if (encoding === 1) {
    if (bytes[0] === 0xff && bytes[1] === 0xfe) {
      label = 'utf-16le';
      bytes = bytes.subarray(2);
    } else if (bytes[0] === 0xfe && bytes[1] === 0xff) {
      label = 'utf-16be';
      bytes = bytes.subarray(2);
    } else {
      label = 'utf-16le';
    }
  } else if (encoding === 2) {
    label = 'utf-16be';
  } else if (encoding === 3) {
    label = 'utf-8';
  }

  let text = '';
  try {
    text = new TextDecoder(label, { fatal: false }).decode(bytes);
  } catch {
    text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  }

  // Certains fichiers séparent plusieurs valeurs par un octet nul.
  return text
    .split('\u0000')
    .map(clean)
    .filter(Boolean)
    .join(', ');
}

function cleanGenre(value: string): string {
  return value
    .replace(/^\(\d+\)\s*/, '')
    .replace(/^\d+\s*$/, '')
    .trim();
}

/**
 * Parse un tag ID3v2.3/v2.4 en tête de fichier.
 * Retourne `null` si aucun tag exploitable (unsync/extended header inclus).
 */
export function parseId3v2(input: ArrayBuffer | Uint8Array): AudioTags | null {
  const data = toBytes(input);
  if (data.length < 10 || ascii(data, 0, 3) !== 'ID3') return null;

  const version = data[3];
  if (version !== 3 && version !== 4) return null;

  const flags = data[5] ?? 0;
  // Les tags « unsynchronisés » réécrivent les octets : on préfère ignorer
  // plutôt que produire des tailles de frames fausses.
  if (flags & 0x80) return null;

  const tagSize = syncsafe(data, 6);
  let offset = 10;

  if (flags & 0x40) {
    // En-tête étendu : sa taille inclut l'en-tête lui-même.
    const extended = version === 4 ? syncsafe(data, offset) : uint32(data, offset);
    if (extended < 6) return null;
    offset += extended;
  }

  const end = Math.min(data.length, 10 + tagSize);
  const tags: AudioTags = {};
  let albumArtist: string | undefined;

  while (offset + 10 <= end) {
    const id = ascii(data, offset, 4);
    if (!/^[A-Z0-9]{4}$/.test(id)) break;

    const size = version === 4 ? syncsafe(data, offset + 4) : uint32(data, offset + 4);
    if (size <= 0 || offset + 10 + size > end) break;

    const payload = data.subarray(offset + 10, offset + 10 + size);
    const value = decodeTextPayload(payload);

    switch (id) {
      case 'TIT2':
        tags.title = value || undefined;
        break;
      case 'TPE1':
        tags.artist = value || undefined;
        break;
      case 'TPE2':
        albumArtist = value || undefined;
        break;
      case 'TALB':
        tags.album = value || undefined;
        break;
      case 'TCON':
        tags.genre = cleanGenre(value) || undefined;
        break;
      case 'TDRC':
      case 'TYER': {
        const year = value.slice(0, 4);
        if (/^\d{4}$/.test(year)) tags.year = year;
        break;
      }
      default:
        break;
    }

    offset += 10 + size;
  }

  // Artiste d'album en secours (compilations, tags incomplets).
  if (!tags.artist && albumArtist) tags.artist = albumArtist;

  return Object.keys(tags).length > 0 ? tags : null;
}

/** Parse le bloc ID3v1 de 128 octets en fin de fichier. */
export function parseId3v1(input: ArrayBuffer | Uint8Array): AudioTags | null {
  const data = toBytes(input);
  if (data.length < 128) return null;
  const offset = data.length - 128;
  if (ascii(data, offset, 3) !== 'TAG') return null;

  const field = (start: number, length: number): string => {
    const raw = data.subarray(offset + start, offset + start + length);
    let text = '';
    for (const byte of raw) {
      if (byte === 0) break;
      text += String.fromCharCode(byte);
    }
    return clean(text);
  };

  const title = field(3, 30);
  const artist = field(33, 30);
  const album = field(63, 30);
  const year = field(93, 4);

  if (!title && !artist && !album) return null;
  return {
    title: title || undefined,
    artist: artist || undefined,
    album: album || undefined,
    year: /^\d{4}$/.test(year) ? year : undefined,
  };
}

/** Déduit artiste/titre d'un nom de fichier quand les tags sont absents. */
export function tagsFromFileName(fileName: string): {
  title: string;
  artist?: string;
  album?: string;
} {
  const base = fileName
    .replace(/\.[a-z0-9]{2,6}$/i, '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const withoutTrack = base.replace(/^\d{1,3}\s*[-.)]\s*/, '').trim() || base;
  const match = withoutTrack.match(/^(.+?)\s+[-–—]\s+(.+)$/);

  if (match) {
    const artist = clean(match[1]);
    const title = clean(match[2]);
    if (artist && title) return { artist, title };
  }
  return { title: withoutTrack || 'Titre sans nom' };
}
