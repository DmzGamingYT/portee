import { describe, expect, it } from 'vitest';
import { parseId3v1, parseId3v2, tagsFromFileName } from './id3';

function syncsafe(value: number): number[] {
  return [
    (value >> 21) & 0x7f,
    (value >> 14) & 0x7f,
    (value >> 7) & 0x7f,
    value & 0x7f,
  ];
}

function frame(id: string, text: string, encoding = 3): Uint8Array {
  const body = encoding === 3 ? new TextEncoder().encode(text) : new Uint8Array();
  const payload = new Uint8Array(1 + body.length);
  payload[0] = encoding;
  payload.set(body, 1);
  const header = new Uint8Array(10);
  header.set([...id].map((c) => c.charCodeAt(0)), 0);
  const size = payload.length;
  header.set([(size >>> 24) & 0xff, (size >>> 16) & 0xff, (size >>> 8) & 0xff, size & 0xff], 4);
  const out = new Uint8Array(header.length + payload.length);
  out.set(header, 0);
  out.set(payload, header.length);
  return out;
}

function id3v23(frames: Uint8Array[]): Uint8Array {
  const bodyLength = frames.reduce((n, f) => n + f.length, 0);
  const header = new Uint8Array(10);
  header.set([0x49, 0x44, 0x33, 3, 0, 0], 0); // ID3 v2.3.0, pas de flags
  header.set(syncsafe(bodyLength), 6);
  const out = new Uint8Array(10 + bodyLength);
  out.set(header, 0);
  let offset = 10;
  for (const f of frames) {
    out.set(f, offset);
    offset += f.length;
  }
  return out;
}

describe('parseId3v2', () => {
  it('lit titre, artiste, album, genre et année', () => {
    const tag = id3v23([
      frame('TIT2', 'One More Time'),
      frame('TPE1', 'Daft Punk'),
      frame('TALB', 'Discovery'),
      frame('TCON', '(17)Electronic'),
      frame('TYER', '2001'),
    ]);
    expect(parseId3v2(tag)).toEqual({
      title: 'One More Time',
      artist: 'Daft Punk',
      album: 'Discovery',
      genre: 'Electronic',
      year: '2001',
    });
  });

  it('ignore un fichier sans tag', () => {
    expect(parseId3v2(new TextEncoder().encode('pas un tag'))).toBeNull();
  });

  it('renvoie null si aucun frame texte', () => {
    expect(parseId3v2(id3v23([]))).toBeNull();
  });
});

describe('parseId3v1', () => {
  it('lit les champs fixes du bloc TAG', () => {
    const tag = new Uint8Array(128);
    const write = (offset: number, text: string) => {
      for (let i = 0; i < text.length; i++) tag[offset + i] = text.charCodeAt(i);
    };
    write(0, 'TAG');
    write(3, 'Around the World');
    write(33, 'Daft Punk');
    write(63, 'Homework');
    write(93, '1997');
    expect(parseId3v1(tag)).toEqual({
      title: 'Around the World',
      artist: 'Daft Punk',
      album: 'Homework',
      year: '1997',
    });
  });

  it('ignore un bloc absent', () => {
    expect(parseId3v1(new Uint8Array(128))).toBeNull();
  });
});

describe('tagsFromFileName', () => {
  it('sépare artiste et titre', () => {
    expect(tagsFromFileName('Daft Punk - Get Lucky.mp3')).toEqual({
      artist: 'Daft Punk',
      title: 'Get Lucky',
    });
  });

  it('retire le numéro de piste et les underscores', () => {
    expect(tagsFromFileName('01_-_Daft_Punk_-_One_More_Time.flac')).toEqual({
      artist: 'Daft Punk',
      title: 'One More Time',
    });
  });

  it('accepte le tiret cadratin', () => {
    expect(tagsFromFileName('Angèle – Bruxelles je t’aime.m4a')).toEqual({
      artist: 'Angèle',
      title: 'Bruxelles je t’aime',
    });
  });

  it('garde un titre seul', () => {
    expect(tagsFromFileName('Untitled.wav')).toEqual({ title: 'Untitled' });
  });
});
