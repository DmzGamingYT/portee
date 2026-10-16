import type { Connect, Plugin } from 'vite';

/**
 * Proxy local vers l'API publique iTunes (itunes.apple.com) : métadonnées réelles
 * + extraits officiels de 30 s. Aucune clé, aucun secret. L'API ne renvoie pas
 * d'en-têtes CORS fiables depuis un navigateur : le plugin expose donc les mêmes
 * routes en local, sous /it/api/* (dev et preview).
 *
 * Routes :
 *   /it/api/search?term=…&entity=song|album|musicArtist&limit=25
 *   /it/api/lookup?id=…&entity=song|album&limit=100
 */

const BASE = 'https://itunes.apple.com';
const TTL = 10 * 60 * 1000; // 10 min de cache mémoire

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

    // Autorise uniquement search / lookup : pas de proxy ouvert.
    const rest = url.slice('/it/api'.length).replace(/^\/+/, '');
    const [path] = rest.split('?');
    if ((path !== 'search' && path !== 'lookup') || !rest.includes('?')) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Route inconnue (search ou lookup uniquement)' }));
      return;
    }

    const key = rest;
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
      const upstream = await fetch(`${BASE}/${rest}`, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'SpotifyCraft/0.1 (clone open-source; +local)',
        },
      });
      const body = await upstream.text();
      if (upstream.ok) cache.set(key, { at: Date.now(), status: upstream.status, body });
      res.statusCode = upstream.status;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.end(body);
    } catch (err) {
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
