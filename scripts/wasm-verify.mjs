#!/usr/bin/env node
/**
 * Vérifie que le paquet WASM versionné (`src/wasm/import-core`) correspond
 * encore au crate Rust : le crate est **reconstruit avec wasm-pack** dans un
 * dossier temporaire, puis comparé au paquet versionné.
 *
 * Trois contrôles, dans cet ordre :
 * 1. cachet des entrées du crate (`scripts/wasm-stamp.mjs --check`) — détecte
 *    une source modifiée sans reconstruction, même sans changement d'API ;
 * 2. fichiers générés (colle JS, `.d.ts`, `package.json`) comparés **octet par
 *    octet** — ils ne dépendent que de wasm-bindgen et de l'interface, donc ils
 *    sont reproductibles d'une machine à l'autre (vérifié) ;
 * 3. binaire `.wasm` comparé **par interface** (liste des exports) et par
 *    taille — pas octet par octet, car le binaire embarque les chemins absolus
 *    du registre Cargo et de la toolchain, qui diffèrent d'un environnement à
 *    l'autre.
 *
 *   npm run wasm:verify
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGE_DIR = join(ROOT, 'src/wasm/import-core');
/** wasm-pack attend le dossier du crate (pas le chemin du manifeste). */
const CRATE_DIR = 'crates/import-core';

/** Fichiers générés dont le contenu doit être identique au paquet versionné. */
const REPRODUCIBLE = [
  'spotifycraft_import_core.js',
  'spotifycraft_import_core.d.ts',
  'spotifycraft_import_core_bg.wasm.d.ts',
  'package.json',
];
const BINARY = 'spotifycraft_import_core_bg.wasm';

const failures = [];
const outDir = mkdtempSync(join(tmpdir(), 'wasm-verify-'));
let rebuilt = false;

const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const sizeOf = (path) => readFileSync(path).length;

function exportsOf(path) {
  const module = new WebAssembly.Module(readFileSync(path));
  return WebAssembly.Module.exports(module)
    .map((entry) => `${entry.kind}:${entry.name}`)
    .sort();
}

try {
  /* 0. reconstruction --------------------------------------------------------- */
  console.log(`Reconstruction du crate avec wasm-pack → ${outDir}`);
  try {
    execFileSync(
      'wasm-pack',
      ['build', CRATE_DIR, '--release', '--target', 'web', '--out-dir', outDir],
      { cwd: ROOT, stdio: 'inherit' }
    );
    rebuilt = true;
  } catch {
    failures.push('reconstruction avec wasm-pack impossible');
    console.error('\n✗ wasm-pack a échoué : le paquet versionné n’a pas pu être comparé.');
  }

  /* 1. cachet des entrées ---------------------------------------------------- */
  console.log('\n— Cachet des entrées du crate');
  try {
    execFileSync(process.execPath, ['scripts/wasm-stamp.mjs', '--check'], {
      cwd: ROOT,
      stdio: 'inherit',
    });
  } catch {
    failures.push('cachet des entrées du crate périmé');
  }

  /* 2. fichiers générés, octet par octet ------------------------------------- */
  if (rebuilt) {
    console.log('\n— Fichiers générés (octet par octet)');
    for (const name of REPRODUCIBLE) {
      const committed = join(PACKAGE_DIR, name);
      if (!existsSync(committed)) {
        failures.push(`${name} manquant dans le paquet versionné`);
        console.log(`  ✗ ${name} : absent du paquet versionné`);
        continue;
      }
      const same = sha256(committed) === sha256(join(outDir, name));
      console.log(`  ${same ? '✓' : '✗'} ${name}`);
      if (!same) failures.push(`${name} diffère du paquet versionné`);
    }

    /* 3. binaire : interface et taille ---------------------------------------- */
    console.log('\n— Binaire WebAssembly (interface et taille)');
    const committedBinary = join(PACKAGE_DIR, BINARY);
    if (!existsSync(committedBinary)) {
      failures.push(`${BINARY} manquant dans le paquet versionné`);
    } else {
      const committedExports = exportsOf(committedBinary);
      const rebuiltExports = exportsOf(join(outDir, BINARY));
      const sameExports = committedExports.join('|') === rebuiltExports.join('|');
      console.log(
        `  ${sameExports ? '✓' : '✗'} exports identiques (${committedExports.length} symboles)`
      );
      console.log(
        `  · taille : ${sizeOf(committedBinary)} o versionné / ${sizeOf(join(outDir, BINARY))} o reconstruit`
      );
      if (!sameExports) {
        failures.push('les exports du binaire versionné diffèrent de la reconstruction');
        console.log(`    versionné   : ${committedExports.join(', ')}`);
        console.log(`    reconstruit : ${rebuiltExports.join(', ')}`);
      }
      if (sha256(committedBinary) !== sha256(join(outDir, BINARY))) {
        console.log(
          '  · octets différents : attendu d’une machine à l’autre (chemins du registre Cargo inscrits dans le binaire)'
        );
      }
    }
  }
} finally {
  rmSync(outDir, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error(
    `\nPaquet WASM non conforme (${relative(ROOT, PACKAGE_DIR)}) :\n` +
      failures.map((failure) => `  - ${failure}`).join('\n') +
      '\nLancez `npm run wasm:build` pour reconstruire le paquet, puis committez-le.'
  );
  process.exit(1);
}

console.log('\nPaquet WASM à jour par rapport au crate.');
