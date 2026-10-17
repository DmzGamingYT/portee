/**
 * Authentification Spotify — **Authorization Code with PKCE** (sans secret).
 *
 * Pourquoi PKCE et pas « Client Credentials » ? Le projet tourne dans un
 * navigateur : un `client_secret` y serait visible publiquement. PKCE évite
 * tout secret : `code_verifier` aléatoire haché en `code_challenge` (S256)
 * envoyé à Spotify, puis échange du code retour en prouvant qu'on détient
 * le verifier.
 *
 * Parcours (tutorial doc Spotify « code-pkce-flow ») :
 *  1. `beginLogin()` : génère verifier+challenge, stocke le verifier,
 *     redirige vers `accounts.spotify.com/authorize`.
 *  2. Retour sur `/callback?code=…` : `handleCallback()` échange code+verifier
 *     contre access/refresh token (POST https://accounts.spotify.com/api/token).
 *  3. `getToken()` : renvoie un access valide, rafraîchi via refresh_token.
 *
 * Stockage : `localStorage` (recommandé par Spotify pour ce flux). Tokens en
 * scopes lecture seule uniquement. Sans `VITE_SPOTIFY_CLIENT_ID`, l'app ne
 * contacte jamais Spotify (`isConfigured()` contrôle le repli iTunes).
 */

const AUTH_URL = 'https://accounts.spotify.com/authorize';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';

/** URL de retour : doit être identique à celle déclarée dans le dashboard. */
export const redirectUri = `${window.location.origin}/callback`;

/** Scopes lecture seule : profil + bibliothèque + playlists. */
export const SCOPES = [
  'user-read-private',
  'user-read-email',
  'user-library-read',
  'user-follow-read',
  'playlist-read-private',
  'playlist-read-collaborative',
].join(' ');

const LS_KEY = 'spotifycraft-tokens';
const VERIFIER_KEY = 'spotifycraft-pkce-verifier';
const STATE_KEY = 'spotifycraft-oauth-state';

export interface SpotifyTokens {
  access_token: string;
  token_type: string;
  scope: string;
  expires_in: number;
  refresh_token?: string;
  /** horodatage local (ms) à la réception */
  obtained_at: number;
}

/** Profil de l'utilisateur connecté (champs utiles de `GET /me`). */
export interface SpotifyProfile {
  id: string;
  display_name: string;
  email?: string;
  images?: Array<{ url: string }>;
  country?: string;
  product?: string;
}

export function clientId(): string {
  return (import.meta.env.VITE_SPOTIFY_CLIENT_ID as string | undefined)?.trim() || '';
}

/** L'app Spotify est-elle branchée (variable d'env présente) ? */
export function isConfigured(): boolean {
  return clientId().length > 0;
}

/* ------------------------------- stockage --------------------------------- */

function saveTokens(t: SpotifyTokens): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(t));
  } catch {
    // stockage plein/privé : on continue sans persistance
  }
}

export function getStoredTokens(): SpotifyTokens | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SpotifyTokens;
    return parsed && typeof parsed.access_token === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

export function clearTokens(): void {
  try {
    localStorage.removeItem(LS_KEY);
    localStorage.removeItem(VERIFIER_KEY);
  } catch {
    // ignoré
  }
  try {
    sessionStorage.removeItem(STATE_KEY);
  } catch {
    // ignoré
  }
}

/* --------------------------------- PKCE ----------------------------------- */

/** Encode des bytes en base64url (URL-safe, sans padding). */
function base64url(bytes: Uint8Array): string {
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** SHA-256 + base64url via `crypto.subtle`. */
async function sha256base64url(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64url(new Uint8Array(digest));
}

/** Chaîne aléatoire bornée (RFC 7636 : charset dédié). */
function randomString(length = 64): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  let out = '';
  for (let i = 0; i < length; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

/* ------------------------------- login flow ------------------------------- */

/** Redirige l'utilisateur vers Spotify pour autoriser l'app. */
export async function beginLogin(): Promise<void> {
  const cid = clientId();
  if (!cid) throw new Error('VITE_SPOTIFY_CLIENT_ID manquante');

  const verifier = randomString(64);
  const challenge = await sha256base64url(verifier);
  const state = randomString(32);
  try {
    localStorage.setItem(VERIFIER_KEY, verifier);
    // `state` vérifié au retour : protège contre un callback forgé (CSRF).
    sessionStorage.setItem(STATE_KEY, state);
  } catch {
    throw new Error('Stockage indisponible pour le flux PKCE');
  }

  const params = new URLSearchParams({
    client_id: cid,
    response_type: 'code',
    code_challenge_method: 'S256',
    code_challenge: challenge,
    redirect_uri: redirectUri,
    scope: SCOPES,
    state,
  });
  window.location.assign(`${AUTH_URL}?${params}`);
}

/**
 * À appeler sur `/callback` : échange le `code` reçu contre les tokens.
 * Renvoie true si un code était présent et a été traité (nettoyez alors l'URL).
 * Lève en cas d'erreur bloquante (refus, verifier manquant…).
 */
export async function handleCallback(): Promise<boolean> {
  const url = new URL(window.location.href);
  const error = url.searchParams.get('error');
  if (error) {
    clearTokens();
    throw new Error(
      error === 'access_denied'
        ? 'Autorisation refusée sur Spotify.'
        : `Erreur Spotify : ${error}`
    );
  }
  const code = url.searchParams.get('code');
  if (!code) return false;

  // Vérification du `state` (protection CSRF du callback OAuth).
  let expectedState = '';
  try {
    expectedState = sessionStorage.getItem(STATE_KEY) || '';
  } catch {
    expectedState = '';
  }
  try {
    sessionStorage.removeItem(STATE_KEY);
  } catch {
    // ignoré
  }
  if (!expectedState || url.searchParams.get('state') !== expectedState) {
    clearTokens();
    throw new Error('Réponse OAuth invalide (state) — relancez la connexion Spotify.');
  }

  let verifier = '';
  try {
    verifier = localStorage.getItem(VERIFIER_KEY) || '';
  } catch {
    verifier = '';
  }
  if (!verifier) throw new Error('Verifier PKCE manquant — relancez la connexion.');

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId(),
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    }),
  });
  const json = await res.json();
  if (!res.ok) {
    clearTokens();
    throw new Error(json?.error_description || `Échange de code impossible (${res.status})`);
  }

  saveTokens({ ...json, obtained_at: Date.now() } as SpotifyTokens);
  try {
    localStorage.removeItem(VERIFIER_KEY);
  } catch {
    // ignoré
  }
  return true;
}

/** Rafraîchit l'access token (grant_type=refresh_token). */
async function refresh(refreshToken: string): Promise<SpotifyTokens> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId(),
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });
  const json = await res.json();
  if (!res.ok) {
    clearTokens();
    throw new Error(json?.error_description || `Rafraîchissement impossible (${res.status})`);
  }
  // Spotify peut omettre le refresh_token : on conserve alors l'ancien.
  const tokens: SpotifyTokens = {
    ...json,
    refresh_token: json.refresh_token ?? refreshToken,
    obtained_at: Date.now(),
  };
  saveTokens(tokens);
  return tokens;
}

/**
 * Rafraîchissement en cours, partagé entre appels concurrents : Spotify peut
 * faire tourner le refresh token, deux refresh parallèles en perdraient un.
 */
let refreshInFlight: Promise<string | null> | null = null;

/** Access token valide (rafraîchi si périmé), ou null si non connecté. */
export async function getToken(): Promise<string | null> {
  if (!isConfigured()) return null;
  const tokens = getStoredTokens();
  if (!tokens) return null;
  const expiry = tokens.obtained_at + tokens.expires_in * 1000;
  if (Date.now() < expiry - 60_000) return tokens.access_token; // marge 60 s
  if (!tokens.refresh_token) {
    clearTokens();
    return null;
  }

  if (!refreshInFlight) {
    const refreshToken = tokens.refresh_token;
    refreshInFlight = refresh(refreshToken)
      .then((fresh) => fresh.access_token)
      .catch(() => null)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

/** Connecté (et client configuré) ? */
export function isConnected(): boolean {
  return isConfigured() && getStoredTokens() !== null;
}

/** Déconnexion locale (scopes lecture seule : pas de révocation serveur). */
export function logout(): void {
  clearTokens();
}

