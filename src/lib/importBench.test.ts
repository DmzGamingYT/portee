import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { initSync, parse_tags } from '../wasm/import-core/spotifycraft_import_core.js';
import { parseId3v2 } from './id3';
import { tagReadPlan } from './localLibrary';
import type { CoreParsed } from './audioCore';

/**
 * Benchmark du noyau d'import Rust/WASM.
 *
 * Objectif : **échouer** si le coût d'import d'un fichier remonte, pour que les
 * performances acquises (lecture ciblée du tag + décodage WASM) ne puissent pas
 * régresser silencieusement.
 *
 * Trois garde-fous complémentaires :
 * 1. **Plan de lecture** — déterministe, insensible à la machine : un fichier de
 *    1,5 Mo ne doit jamais être lu en entier. C'est le gain principal.
 * 2. **Seuils de temps par fichier** — médiane mesurée × 10 environ : ils
 *    attrapent un parseur redevenu coûteux ou un repli JavaScript généralisé.
 * 3. **Garde-fou relatif** — le noyau doit rester très au-dessus du parseur
 *    JavaScript sur le même tampon ; le rapport est indépendant de la vitesse
 *    de la machine et tombe à ~1 si le WASM n'est plus utilisé.
 *
 * Valeurs de référence relevées sur la machine de développement (Node 20,
 * tag de 120 Ko) : 0,0035 ms/fichier pour le noyau, 5,3 ms pour le repli JS.
 */

/** Chemin du binaire WASM, résolu depuis ce fichier (indépendant du cwd). */
const WASM_FILE = fileURLToPath(
  new URL('../wasm/import-core/spotifycraft_import_core_bg.wasm', import.meta.url)
);

/** Fichier audio simulé : 1,5 Mo, tags en tête. */
const FILE_BYTES = 1_500_000;

/* ------------------------------- fixtures ID3 ------------------------------- */

function syncsafe(value: number): number[] {
  return [(value >> 21) & 0x7f, (value >> 14) & 0x7f, (value >> 7) & 0x7f, value & 0x7f];
}

function frameHeader(id: string, size: number): Uint8Array {
  const header = new Uint8Array(10);
  header.set([...id].map((c) => c.charCodeAt(0)), 0);
  header.set([(size >>> 24) & 0xff, (size >>> 16) & 0xff, (size >>> 8) & 0xff, size & 0xff], 4);
  return header;
}

function textFrame(id: string, text: string): Uint8Array {
  const body = new TextEncoder().encode(text);
  const payload = new Uint8Array(1 + body.length);
  payload[0] = 3; // UTF-8
  payload.set(body, 1);
  const header = frameHeader(id, payload.length);
  const out = new Uint8Array(header.length + payload.length);
  out.set(header, 0);
  out.set(payload, header.length);
  return out;
}

/** Frame APIC (pochette) de la taille demandée, comme en produit un encodeur. */
function apicFrame(payloadBytes: number): Uint8Array {
  const body = new Uint8Array(payloadBytes);
  body[0] = 3; // encodage
  body.set(new TextEncoder().encode('image/jpeg\0'), 1);
  body[body.length - 1] = 0xff; // marqueur JPEG final
  const header = frameHeader('APIC', body.length);
  const out = new Uint8Array(header.length + body.length);
  out.set(header, 0);
  out.set(body, header.length);
  return out;
}

function id3v23(frames: Uint8Array[]): Uint8Array {
  const bodyLength = frames.reduce((n, f) => n + f.length, 0);
  const out = new Uint8Array(10 + bodyLength);
  out.set([0x49, 0x44, 0x33, 3, 0, 0], 0);
  out.set(syncsafe(bodyLength), 6);
  let offset = 10;
  for (const frame of frames) {
    out.set(frame, offset);
    offset += frame.length;
  }
  return out;
}

const TEXT = [
  textFrame('TIT2', 'One More Time'),
  textFrame('TPE1', 'Daft Punk'),
  textFrame('TALB', 'Discovery'),
];

/** Tag sans pochette (~74 o), puis avec pochette de 5 Ko et de 120 Ko. */
const SMALL_TAG = id3v23(TEXT);
const MEDIUM_TAG = id3v23([...TEXT, apicFrame(5 * 1024)]);
const LARGE_TAG = id3v23([...TEXT, apicFrame(120 * 1024)]);

function fileWith(tag: Uint8Array): Uint8Array {
  const file = new Uint8Array(FILE_BYTES);
  file.set(tag, 0);
  return file;
}

const SMALL_FILE = fileWith(SMALL_TAG);
const MEDIUM_FILE = fileWith(MEDIUM_TAG);
const LARGE_FILE = fileWith(LARGE_TAG);

/* --------------------------------- mesure ---------------------------------- */

/**
 * Médiane du temps **par appel**, mesurée par lots : un appel isolé de quelques
 * microsecondes serait noyé dans le bruit du chronomètre.
 */
function medianPerCallMs(fn: () => void, batch = 200, samples = 25, warmup = 100): number {
  for (let i = 0; i < warmup; i++) fn();
  const times: number[] = [];
  for (let s = 0; s < samples; s++) {
    const start = performance.now();
    for (let i = 0; i < batch; i++) fn();
    times.push((performance.now() - start) / batch);
  }
  times.sort((a, b) => a - b);
  return times[times.length >> 1];
}

/** Coût réel par fichier : découpe du tag dans le fichier, puis décodage. */
function importCost(file: Uint8Array): number {
  const plan = tagReadPlan(file.subarray(0, 10), file.length);
  return medianPerCallMs(() => parse_tags(file.subarray(0, plan.bytes)));
}

/**
 * Seuils en ms/fichier : ~10× la médiane mesurée à la mise en place, donc
 * stables sur une machine plus lente, mais toujours bien en dessous du repli
 * JavaScript (~5 ms pour un tag de 120 Ko).
 */
const BUDGET_MS = {
  small: 0.02,
  medium: 0.02,
  large: 0.05,
};

/** Analyse de 300 fichiers (médiane mesurée : ~1 ms au total). */
const BATCH_BUDGET_MS = 100;

/** Facteur minimal face au repli JavaScript (mesuré : ×1500). */
const MIN_SPEEDUP = 20;

beforeAll(() => {
  // Chargement direct depuis le disque : ni fetch, ni serveur HTTP.
  initSync({ module: readFileSync(WASM_FILE) });
});

describe('noyau WASM — plan de lecture', () => {
  it('ne lit que le tag ID3, jamais le fichier entier', () => {
    const plan = tagReadPlan(LARGE_TAG.subarray(0, 10), FILE_BYTES);
    expect(plan.format).toBe('id3v2');
    // en-tête (10 o) + corps du tag, soit exactement le tag
    expect(plan.bytes).toBe(LARGE_TAG.length);
    expect(plan.bytes).toBeLessThan(FILE_BYTES / 10);
  });

  it('se contente de 64 Ko pour un FLAC', () => {
    const flac = new Uint8Array(FILE_BYTES);
    flac.set([0x66, 0x4c, 0x61, 0x43], 0);
    expect(tagReadPlan(flac.subarray(0, 10), FILE_BYTES)).toEqual({
      format: 'flac',
      bytes: 64 * 1024,
    });
  });

  it('se contente des 128 derniers octets pour ID3v1', () => {
    const mp3 = new Uint8Array(FILE_BYTES);
    expect(tagReadPlan(mp3.subarray(0, 10), FILE_BYTES)).toEqual({ format: 'id3v1', bytes: 128 });
  });

  it('ne lit rien plutôt que de suivre un tag absurde', () => {
    const huge = new Uint8Array(10);
    huge.set([0x49, 0x44, 0x33], 0);
    huge.set(syncsafe(9 * 1024 * 1024), 6); // au-delà du plafond de 8 Mo
    expect(tagReadPlan(huge, 12 * 1024 * 1024)).toEqual({ format: 'none', bytes: 0 });
  });
});

describe('noyau WASM — import d’un fichier', () => {
  it('décode bien les tags du tampon (le noyau est réellement utilisé)', () => {
    const parsed = parse_tags(SMALL_TAG) as CoreParsed;
    expect(parsed.title).toBe('One More Time');
    expect(parsed.artist).toBe('Daft Punk');
    expect(parsed.complete).toBe(true);
  });

  it(`importe un tag de ${SMALL_TAG.length} o en moins de ${BUDGET_MS.small} ms`, () => {
    const perFile = importCost(SMALL_FILE);
    expect(perFile, `médiane ${perFile.toFixed(4)} ms/fichier`).toBeLessThan(BUDGET_MS.small);
  });

  it(`importe un tag de ${Math.round(MEDIUM_TAG.length / 1024)} Ko en moins de ${BUDGET_MS.medium} ms`, () => {
    const perFile = importCost(MEDIUM_FILE);
    expect(perFile, `médiane ${perFile.toFixed(4)} ms/fichier`).toBeLessThan(BUDGET_MS.medium);
  });

  it(`importe un tag de ${Math.round(LARGE_TAG.length / 1024)} Ko en moins de ${BUDGET_MS.large} ms`, () => {
    const perFile = importCost(LARGE_FILE);
    expect(perFile, `médiane ${perFile.toFixed(4)} ms/fichier`).toBeLessThan(BUDGET_MS.large);
  });

  it(`analyse 300 fichiers en moins de ${BATCH_BUDGET_MS} ms`, () => {
    const files = [LARGE_FILE, MEDIUM_FILE, SMALL_FILE];
    const start = performance.now();
    for (let i = 0; i < 300; i++) {
      const file = files[i % files.length];
      const plan = tagReadPlan(file.subarray(0, 10), file.length);
      parse_tags(file.subarray(0, plan.bytes));
    }
    const total = performance.now() - start;
    expect(total, `${total.toFixed(1)} ms pour 300 fichiers`).toBeLessThan(BATCH_BUDGET_MS);
  });

  it(`reste au moins ${MIN_SPEEDUP}× plus rapide que le repli JavaScript`, () => {
    // Le repli JS n'est un point de comparaison valable que s'il décode le tag.
    expect(parseId3v2(LARGE_TAG)).not.toBeNull();
    const wasm = importCost(LARGE_FILE);
    const js = medianPerCallMs(() => parseId3v2(LARGE_TAG), 10, 5, 3);
    const speedup = js / wasm;
    expect(
      speedup,
      `WASM ${wasm.toFixed(4)} ms vs JS ${js.toFixed(4)} ms (×${speedup.toFixed(1)})`
    ).toBeGreaterThanOrEqual(MIN_SPEEDUP);
  });
});
