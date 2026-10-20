#!/usr/bin/env node
/**
 * Régénère les captures du README à partir de l'application réelle.
 *
 *   npm run shots
 *
 * Le script démarre `npm run dev` s'il ne tourne pas déjà, ouvre Chromium
 * (Playwright), parcourt les écrans documentés puis écrit :
 *   - docs/screenshots/*.jpg  (1440 × 1000, thème sombre ou clair)
 *   - docs/screenshots/mobile.png  (390 × 844)
 *
 * Prérequis unique, une fois par machine :
 *   npx playwright install chromium
 *
 * Variables :
 *   BASE_URL   URL de l'app déjà lancée (par défaut http://127.0.0.1:5184)
 *   ONLY       liste d'écrans à refaire, séparés par des virgules
 *              (home,search,album,nowplaying,queue,palette,daily,liked,light,mobile)
 *
 * Les données viennent du catalogue iTunes en direct : le contenu des
 * étagères évolue, mais la marque et l'interface restent à jour.
 */

import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT_DIR = path.join(ROOT, 'docs/screenshots');
const BASE = (process.env.BASE_URL ?? 'http://127.0.0.1:5184').replace(/\/$/, '');
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',').map((s) => s.trim())) : null;

/** Random Access Memories — album stable, utilisé pour les écrans de lecture. */
const ALBUM_ID = '617154241';
const DESKTOP = { width: 1440, height: 1000 };
const MOBILE = { width: 390, height: 844 };
const JPEG_QUALITY = 84;
const WAIT_MS = Number(process.env.SHOTS_WAIT ?? 1500);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function isUp(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

/** Démarre le serveur de dev au besoin ; renvoie le process à arrêter. */
async function ensureServer() {
  if (await isUp(BASE)) return null;
  if (process.env.BASE_URL) {
    throw new Error(`Aucune application ne répond sur ${BASE} (BASE_URL est défini).`);
  }

  console.log('↻ démarrage de npm run dev…');
  const child = spawn('npm', ['run', 'dev'], { cwd: ROOT, stdio: 'ignore' });
  for (let i = 0; i < 120; i += 1) {
    await sleep(500);
    if (await isUp(BASE)) return child;
  }
  child.kill();
  throw new Error(`Le serveur de développement n'a pas répondu sur ${BASE}.`);
}

async function newPage(browser, { colorScheme = 'dark', viewport = DESKTOP, storage } = {}) {
  const context = await browser.newContext({ viewport, colorScheme, deviceScaleFactor: 1 });
  if (storage) {
    await context.addInitScript((value) => {
      localStorage.setItem('spotifycraft-store', value);
    }, storage);
  }
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  // Pas d'animation en cours de capture (halos, transitions de panneaux…).
  await page.emulateMedia({ reducedMotion: 'reduce' });
  return { context, page };
}

async function settle(page, ms = WAIT_MS) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(ms);
}

/**
 * File d'attente réelle (album RAM) récupérée depuis le store persistant,
 * sans dépendre de la lecture audio (impossible sans geste utilisateur).
 */
let seededState = null;
async function seedState(browser) {
  if (seededState) return seededState;
  const { context, page } = await newPage(browser);
  await page.goto(`${BASE}/album/${ALBUM_ID}`);
  await page.getByRole('heading', { name: 'Random Access Memories' }).waitFor();
  await settle(page, 600);
  await page.locator('.track-row').first().click();
  await page.waitForTimeout(500);
  const raw = await page.evaluate(() => localStorage.getItem('spotifycraft-store'));
  await context.close();

  const parsed = JSON.parse(raw);
  parsed.state.playing = false;
  parsed.state.position = 0;
  parsed.state.audioError = null;
  seededState = JSON.stringify(parsed);
  return seededState;
}

const SCREENS = {
  // Accueil : étagères, Daily Mix, genres.
  home: {
    file: 'home.jpg',
    async run(page) {
      await page.goto(`${BASE}/`);
      await page.getByText('Pop du moment').waitFor();
      await settle(page);
    },
  },

  // Recherche : artistes et titres pour une requête stable.
  search: {
    file: 'search.jpg',
    async run(page) {
      await page.goto(`${BASE}/search?q=daft%20punk`);
      await page.getByText(/Résultats pour/i).waitFor();
      await settle(page);
    },
  },

  // Album : en-tête dégradé et liste des pistes.
  album: {
    file: 'album.jpg',
    async run(page) {
      await page.goto(`${BASE}/album/${ALBUM_ID}`);
      await page.getByRole('heading', { name: 'Random Access Memories' }).waitFor();
      await settle(page);
    },
  },

  // Vue grand format : panneau latéral, paroles, « À suivre ».
  nowplaying: {
    file: 'nowplaying.jpg',
    seeded: true,
    async run(page) {
      await page.goto(`${BASE}/`);
      await page.getByText('Pop du moment').waitFor();
      await settle(page, 900);
      await page.locator('button[aria-label^="Vue grand format"]').first().click();
      await page.waitForTimeout(2200);
    },
  },

  // File d'attente ouverte sur l'accueil.
  queue: {
    file: 'queue.jpg',
    seeded: true,
    async run(page) {
      await page.goto(`${BASE}/`);
      await page.getByText('Pop du moment').waitFor();
      await settle(page, 900);
      await page.locator('button[aria-label="File d\'attente"]:visible').last().click();
      await page.waitForTimeout(700);
    },
  },

  // Palette de commandes avec une requête (artistes + titres).
  palette: {
    file: 'palette.jpg',
    async run(page) {
      await page.goto(`${BASE}/`);
      await page.getByText('Pop du moment').waitFor();
      await settle(page);
      await page.keyboard.press(process.platform === 'darwin' ? 'Meta+k' : 'Control+k');
      await page.waitForTimeout(400);
      await page.keyboard.type('daft');
      await page.waitForTimeout(2400);
    },
  },

  // Daily Mix du jour.
  daily: {
    file: 'daily.jpg',
    async run(page) {
      await page.goto(`${BASE}/daily`);
      await settle(page, 1800);
    },
  },

  // Titres likés : quelques likes puis la sélection.
  liked: {
    file: 'liked.jpg',
    async run(page) {
      await page.goto(`${BASE}/search?q=ninao`);
      await page.getByText(/Résultats pour/i).waitFor();
      await settle(page, 900);
      const hearts = page.locator('button[aria-label^="Aimer"]');
      for (let i = 0; i < 4; i += 1) await hearts.nth(i).click();
      await page.locator('.track-row').first().click();
      await page.waitForTimeout(2500);
      await page.goto(`${BASE}/playlist/liked`);
      await settle(page, 1200);
    },
  },

  // Thème clair (l'app suit la préférence système).
  light: {
    file: 'light.jpg',
    colorScheme: 'light',
    async run(page) {
      await page.goto(`${BASE}/`);
      await page.getByText('Pop du moment').waitFor();
      await settle(page);
    },
  },

  // Mobile : colonne d'icônes et barre de lecture compacte.
  mobile: {
    file: 'mobile.png',
    viewport: MOBILE,
    format: 'png',
    async run(page) {
      await page.goto(`${BASE}/`);
      await page.getByText('Pop du moment').waitFor();
      await settle(page);
    },
  },
};

async function capture(browser, name) {
  const screen = SCREENS[name];
  const { context, page } = await newPage(browser, {
    colorScheme: screen.colorScheme,
    viewport: screen.viewport,
    storage: screen.seeded ? await seedState(browser) : undefined,
  });

  try {
    await screen.run(page);
    const target = path.join(OUT_DIR, screen.file);
    const isPng = screen.format === 'png' || screen.file.endsWith('.png');
    await page.screenshot({
      path: target,
      animations: 'disabled',
      ...(isPng ? { type: 'png' } : { type: 'jpeg', quality: JPEG_QUALITY }),
    });
    console.log(`✓ ${name} → docs/screenshots/${screen.file}`);
  } finally {
    await context.close();
  }
}

async function main() {
  const names = Object.keys(SCREENS).filter((name) => !ONLY || ONLY.has(name));
  if (names.length === 0) {
    console.error(`Aucun écran ne correspond à ONLY="${process.env.ONLY}".`);
    process.exit(1);
  }

  await mkdir(OUT_DIR, { recursive: true });
  const server = await ensureServer();
  let browser = null;

  const stop = () => {
    browser?.close().catch(() => {});
    server?.kill();
  };
  process.once('SIGINT', () => {
    stop();
    process.exit(130);
  });

  try {
    browser = await chromium.launch();
    for (const name of names) await capture(browser, name);
    console.log(`\n${names.length} capture(s) à jour dans docs/screenshots/`);
  } finally {
    await browser?.close().catch(() => {});
    server?.kill();
  }
}

main().catch((error) => {
  console.error(`\n✗ ${error instanceof Error ? error.message : error}`);
  console.error('Astuce : npx playwright install chromium');
  process.exit(1);
});
