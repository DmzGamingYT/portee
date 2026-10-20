#!/usr/bin/env node
/**
 * Cachet des entrées du crate Rust → paquet WASM versionné.
 *
 * Le binaire `.wasm` n'est **pas** comparable d'une machine à l'autre : les
 * chemins absolus de la toolchain et du registre Cargo y sont inscrits
 * (vérifié : le même crate compilé avec un autre `CARGO_HOME` produit un
 * binaire d'une autre empreinte). Ce cachet, lui, est stable et machine
 * indépendant : il porte sur les **entrées** du crate, et répond donc à la
 * question « le paquet versionné est-il à jour par rapport aux sources ? ».
 *
 * Le cachet vit dans le crate (`crates/import-core/wasm-package.stamp.json`) et
 * non dans le dossier du paquet : wasm-pack régénère un `.gitignore` qui y masque
 * les fichiers, et le dossier de sortie lui-même ne survit pas toujours à une
 * reconstruction. Il n'est pas haché lui-même (le hachage ne couvre que
 * `Cargo.toml`, `Cargo.lock` et `src/**`).
 *
 *   node scripts/wasm-stamp.mjs           # écrit le cachet des entrées du crate
 *   node scripts/wasm-stamp.mjs --check   # échoue si le cachet versionné est périmé
 */

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CRATE_DIR = join(ROOT, 'crates/import-core');
const STAMP_FILE = join(CRATE_DIR, 'wasm-package.stamp.json');

/**
 * Fichiers du crate qui déterminent le paquet, triés pour un hachage stable.
 * Sont exclus les artefacts de compilation (`target/`) et le cachet lui-même,
 * qui n'est pas une entrée mais le résultat de la construction.
 */
function crateInputs(dir = CRATE_DIR) {
  const files = [];
  const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  for (const entry of entries) {
    if (entry.name === 'target') continue;
    const path = join(dir, entry.name);
    if (path === STAMP_FILE) continue;
    if (entry.isDirectory()) files.push(...crateInputs(path));
    else files.push(path);
  }
  return files;
}

function inputsDigest() {
  const files = crateInputs();
  const hash = createHash('sha256');
  for (const file of files) {
    // Le chemin relatif fait partie de l'empreinte : renommer un module compte
    // comme une modification du crate.
    hash.update(relative(ROOT, file).replace(/\\/g, '/')).update('\0');
    hash.update(readFileSync(file)).update('\0');
  }
  return { digest: hash.digest('hex'), files: files.length };
}

const { digest, files } = inputsDigest();

if (process.argv.includes('--check')) {
  let committed = null;
  try {
    committed = JSON.parse(readFileSync(STAMP_FILE, 'utf8'));
  } catch {
    committed = null;
  }

  if (!committed) {
    console.error(
      `Paquet WASM sans cachet : ${relative(ROOT, STAMP_FILE)} est absent.\n` +
        'Lancez `npm run wasm:build` (nécessite wasm-pack) pour reconstruire le paquet et son cachet.'
    );
    process.exit(1);
  }

  if (committed.inputs !== digest) {
    console.error(
      'Paquet WASM périmé : le crate a changé depuis la dernière construction.\n' +
        `  cachet versionné : ${committed.inputs} (${committed.files} fichier(s))\n` +
        `  crate actuel     : ${digest} (${files} fichier(s))\n` +
        'Lancez `npm run wasm:build` pour reconstruire `src/wasm/import-core` et mettre le cachet à jour.'
    );
    process.exit(1);
  }

  console.log(`Cachet à jour : ${files} fichier(s) du crate, empreinte ${digest.slice(0, 12)}…`);
} else {
  const stamp = {
    crate: 'spotifycraft-import-core',
    // empreinte des entrées (Cargo.toml, Cargo.lock, src/**) au moment de la
    // dernière construction du paquet — régénérée par `npm run wasm:build`
    inputs: digest,
    files,
    package: 'src/wasm/import-core',
  };
  writeFileSync(STAMP_FILE, `${JSON.stringify(stamp, null, 2)}\n`);
  console.log(`Cachet écrit : ${files} fichier(s), empreinte ${digest.slice(0, 12)}…`);
}
