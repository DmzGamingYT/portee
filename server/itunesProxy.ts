import type { Connect, Plugin } from 'vite';

/**
 * Proxy local vers l'API publique iTunes (itunes.apple.com) : métadonnées réelles
 * + extraits officiels de 30 s. Aucune clé, aucun secret.
 *
 * Le front appelle `/it/api/search` et `/it/api/lookup`. Le plugin transmet
 * la query telle quelle à `https://itunes.apple.com` (dev et preview).
 *
 * Note : iTunes renvoie `Access-Control-Allow-Origin: *`, le client sait donc
 * aussi appeler iTunes en direct si ce proxy est absent (hébergement statique).
 *
 * Routes :
 *   /it/api/search?term=…&entity=song|album|musicArtist&limit=25
 *   /it/api/lookup?id=…&entity=song|album&limit=100
 */

const BASE = 'https://itunes.apple.com';
const TTL = 10 * 60 * 1000; // 10 min de cache mémoire
const MAX_ENTRIES = 300; // borne la mémoire du serveur de dev
const UPSTREAM_TIMEOUT_MS = 10_000;

interface Entry {
  at: number;
  status: number;
  body: string;
}

const cache = new Map<string, Entry>();

function middleware(): Connect.NextHandleFunction {
  return async (req, res, next) => {
    const url = req.url ?? '';
    if (!url.startsWith('/it/api/')) {
      next();
      return;
    }

    // Pré-vol CORS (au cas où un client envoie des en-têtes personnalisés).
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Accept, Content-Type');
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

    // Autorise uniquement search / lookup : pas de proxy ouvert.
    const rest = url.slice('/it/api'.length).replace(/^\/+/, '');
    const [path] = rest.split('?');
    if ((path !== 'search' && path !== 'lookup') || !rest.includes('?')) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Route inconnue (search ou lookup uniquement)' }));
      return;
    }

    const key = `GET ${rest}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL) {
      res.statusCode = hit.status;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('X-Cache', 'hit');
      res.end(hit.body);
      return;
    }

    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), UPSTREAM_TIMEOUT_MS);
      try {
        const upstream = await fetch(`${BASE}/${rest}`, {
          signal: ctrl.signal,
          headers: {
            Accept: 'application/json',
            'User-Agent': 'Portee/0.1 (lecteur open source; +local)',
          },
        });
        const body = await upstream.text();
        if (upstream.ok) {
          if (cache.size >= MAX_ENTRIES) {
            const oldest = cache.keys().next().value;
            if (oldest !== undefined) cache.delete(oldest);
          }
          cache.set(key, { at: Date.now(), status: upstream.status, body });
        }
        res.statusCode = upstream.status;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.end(body);
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        res.statusCode = 504;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'itunes.apple.com : délai dépassé' }));
        return;
      }
      res.statusCode = 502;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'itunes.apple.com injoignable', detail: String(err) }));
    }
  };
}

export function itunesProxyPlugin(): Plugin {
  return {
    name: 'itunes-proxy',
    configureServer(server) {
      server.middlewares.use(middleware());
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware());
    },
  };
}
