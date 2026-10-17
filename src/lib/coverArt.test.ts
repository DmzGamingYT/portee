import { describe, expect, it } from 'vitest';
import {
  extractEmbeddedPicture,
  isGeneratedCover,
  parseFlacPictureBlock,
  pictureToCoverDataUrl,
} from './coverArt';
import { parseApicFrame, parseId3v2Picture } from './id3';

function cat(...parts: Array<Uint8Array | number[]>): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part instanceof Uint8Array ? part : new Uint8Array(part), offset);
    offset += part.length;
  }
  return out;
}

function ascii(value: string): number[] {
  return [...value].map((char) => char.charCodeAt(0));
}

function blobOf(bytes: Uint8Array | number[], type = 'application/octet-stream'): Blob {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const buffer = new ArrayBuffer(data.byteLength);
  new Uint8Array(buffer).set(data);
  return new Blob([buffer], { type });
}

function be32(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

function syncsafe(value: number): number[] {
  return [(value >>> 21) & 0x7f, (value >>> 14) & 0x7f, (value >>> 7) & 0x7f, value & 0x7f];
}

const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0x01, 0x02, 0xff, 0xd9];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a];

interface ApicOptions {
  mime?: string;
  type?: number;
  description?: string;
  encoding?: 0 | 1;
  data?: number[];
}

function apicPayload({
  mime = 'image/jpeg',
  type = 3,
  description = 'cover',
  encoding = 0,
  data = JPEG,
}: ApicOptions = {}): Uint8Array {
  const desc =
    encoding === 1
      ? cat([0xff, 0xfe], [...description].flatMap((char) => [char.charCodeAt(0), 0]), [0, 0])
      : cat(ascii(description), [0]);
  return cat([encoding], ascii(mime), [0], [type], desc, data);
}

function apicTag(payloads: ApicOptions[], version = 3): Uint8Array {
  const frames = payloads.map((options) => {
    const payload = apicPayload(options);
    return cat(ascii('APIC'), be32(payload.length), [0, 0], payload);
  });
  const body = cat(...frames);
  return cat(ascii('ID3'), [version, 0, 0], syncsafe(body.length), body);
}

function flacPictureBlock({
  mime = 'image/png',
  data = PNG,
  type = 3,
  declaredLength = data.length,
}: {
  mime?: string;
  data?: number[];
  type?: number;
  declaredLength?: number;
} = {}): Uint8Array {
  return cat(
    be32(type),
    be32(mime.length),
    ascii(mime),
    be32(0), // description vide
    be32(600),
    be32(600),
    be32(24),
    be32(0),
    be32(declaredLength),
    data
  );
}

describe('parseApicFrame', () => {
  it('lit le MIME, le type et l’image', () => {
    const picture = parseApicFrame(apicPayload());
    expect(picture?.mime).toBe('image/jpeg');
    expect(picture?.type).toBe(3);
    expect([...(picture?.data ?? [])]).toEqual(JPEG);
  });

  it('saute une description UTF-16', () => {
    const picture = parseApicFrame(apicPayload({ encoding: 1, description: 'Pochette' }));
    expect([...(picture?.data ?? [])]).toEqual(JPEG);
  });

  it('normalise image/jpg et les MIME absents', () => {
    expect(parseApicFrame(apicPayload({ mime: 'image/jpg' }))?.mime).toBe('image/jpeg');
    expect(parseApicFrame(apicPayload({ mime: '' }))?.mime).toBe('image/jpeg');
  });
});

describe('parseId3v2Picture', () => {
  it('extrait l’APIC du tag', () => {
    const picture = parseId3v2Picture(apicTag([{}]));
    expect([...(picture?.data ?? [])]).toEqual(JPEG);
  });

  it('privilégie la pochette recto (type 3)', () => {
    const picture = parseId3v2Picture(
      apicTag([{ type: 0, data: [1, 1, 1] }, { type: 3, data: PNG }], 4)
    );
    expect([...(picture?.data ?? [])]).toEqual(PNG);
  });

  it('renvoie null sans tag ID3', () => {
    expect(parseId3v2Picture(new Uint8Array(32))).toBeNull();
  });
});

describe('parseFlacPictureBlock', () => {
  it('lit le bloc PICTURE', () => {
    const picture = parseFlacPictureBlock(flacPictureBlock());
    expect(picture?.mime).toBe('image/png');
    expect(picture?.type).toBe(3);
    expect([...(picture?.data ?? [])]).toEqual(PNG);
  });

  it('refuse une longueur d’image incohérente', () => {
    expect(parseFlacPictureBlock(flacPictureBlock({ declaredLength: 999 }))).toBeNull();
  });
});

describe('extractEmbeddedPicture', () => {
  it('reconnaît un tag ID3v2 dans un Blob', async () => {
    const picture = await extractEmbeddedPicture(blobOf(apicTag([{}])));
    expect([...(picture?.data ?? [])]).toEqual(JPEG);
  });

  it('reconnaît un fichier FLAC', async () => {
    const block = flacPictureBlock();
    const header = [0x80 | 6, (block.length >>> 16) & 0xff, (block.length >>> 8) & 0xff, block.length & 0xff];
    const file = blobOf(cat(ascii('fLaC'), header, block));
    const picture = await extractEmbeddedPicture(file);
    expect([...(picture?.data ?? [])]).toEqual(PNG);
  });

  it('renvoie null pour un fichier sans pochette', async () => {
    expect(await extractEmbeddedPicture(blobOf(ascii('RIFF....')))).toBeNull();
  });
});

describe('pictureToCoverDataUrl', () => {
  it('produit une data URL utilisable sans canvas', async () => {
    const url = await pictureToCoverDataUrl({ mime: 'image/png', data: new Uint8Array(PNG) });
    expect(url?.startsWith('data:image/png;base64,')).toBe(true);
  });
});

describe('isGeneratedCover', () => {
  it('distingue le visuel généré d’une vraie pochette', () => {
    expect(isGeneratedCover('data:image/svg+xml;charset=utf-8,%3Csvg')).toBe(true);
    expect(isGeneratedCover('data:image/jpeg;base64,abc')).toBe(false);
    expect(isGeneratedCover(undefined)).toBe(false);
  });
});
