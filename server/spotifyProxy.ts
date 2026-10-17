import { createHash } from 'node:crypto';
import type { Connect, Plugin } from 'vite';

/**
 * Proxy local vers l'API Spotify (api.spotify.com) : métadonnées réelles.
 *
 * Rôle : le navigateur appelle `/sp/api/*` ; le proxy transmet la requête
 * **avec l'en-tête `Authorization` du client** vers `api.spotify.com` et
 * renvoie la réponse en ajoutant `Access-Control-Allow-Origin: *`. Cela
 * garantit un CORS prévisible et masque les appels derrière une seule origine.
 *
 * Sécurité : route préfixée (pas de proxy ouvert), GET uniquement, et on ne
 * relaie que le chemin demandé (aucune construction d'URL côté serveur).
 *
 * Routes (transparence) :
 *   /sp/api/me
 *   /sp/api/search?…&market=FR
 *   /sp/api/albums/{id}/tracks?…&market=FR
 *   /sp/api/artists/{id}/top-tracks?market=FR
 *   /sp/api/artists/{id}/albums?…&market=FR
 */

const BASE = 'https://api.spotify.com/v1';
const TTL = 2 * 60 * 1000; // 2 min : assez court pour des données musicales fraîches
const UPSTREAM_TIMEOUT_MS = 10_000;
const MAX_ENTRIES = 200; // borne la mémoire du serveur de dev

interface Entry {
  at: number;
  status: number;
  body: string;
}

const cache = new Map<string, Entry>();

/** Empreinte non réversible : le token ne traîne pas dans les clés du cache. */
function tokenFingerprint(auth: string): string {
  return createHash('sha256').update(auth).digest('base64url').slice(0, 24);
}

function cacheSet(key: string, entry: Entry): void {
  if (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, entry);
}

function middleware(): Connect.NextHandleFunction {
  return async (req, res, next) => {
    const url = req.url ?? '';
    if (!url.startsWith('/sp/api/')) {
      next();
      return;
    }

    // Pré-vol CORS.
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Accept, Authorization, Content-Type');
      res.setHeader('Access-Control-Max-Age', '86400');
      res.end();
      return;
    }

    if (req.method !== 'GET') {
      res.statusCode = 405;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'GET uniquement' }));
      return;
    }

    const rest = url.slice('/sp/api'.length).replace(/^\/+/, '');
    // Routes autorisées (1er segment) : pas de proxy ouvert vers Spotify.
    const allowed = new Set(['me', 'search', 'albums', 'artists', 'browse', 'playlists']);
    const firstSegment = rest.split('?')[0].split('/')[0];
    if (!firstSegment || !allowed.has(firstSegment)) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Route inconnue (me, search, albums, artists…)' }));
      return;
    }

    // L'en-tête Authorization arrive depuis le navigateur (token utilisateur) ;
    // on le relaie tel quel. Sans token, Spotify répond 401 — proprement.
    const auth = req.headers.authorization;
    const cacheKey = `${auth ? tokenFingerprint(auth) : 'anon'}|GET ${rest}`;
    const hit = cache.get(cacheKey);
    if (hit && Date.now() - hit.at < TTL) {
      res.statusCode = hit.status;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Access-Control-Allow-Origin', '*');
      // Réponses liées à un compte : jamais dans le cache du navigateur.
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Vary', 'Authorization');
      res.setHeader('X-Cache', 'hit');
      res.end(hit.body);
      return;
    }

    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), UPSTREAM_TIMEOUT_MS);
      try {
        const headers: Record<string, string> = { Accept: 'application/json' };
        if (auth) headers.Authorization = auth;
        const upstream = await fetch(`${BASE}/${rest}`, { signal: ctrl.signal, headers });
        const body = await upstream.text();
        // On ne met en cache que les succès (les 4xx/5xx ne doivent pas coller).
        if (upstream.ok) cacheSet(cacheKey, { at: Date.now(), status: upstream.status, body });
        res.statusCode = upstream.status;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Vary', 'Authorization');
        res.end(body);
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        res.statusCode = 504;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'api.spotify.com : délai dépassé' }));
        return;
      }
      res.statusCode = 502;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'api.spotify.com injoignable', detail: String(err) }));
    }
  };
}

export function spotifyProxyPlugin(): Plugin {
  return {
    name: 'spotify-proxy',
    configureServer(server) {
      server.middlewares.use(middleware());
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware());
    },
  };
}
