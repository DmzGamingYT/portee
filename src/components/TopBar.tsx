import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useStore } from '../store';
import { useSpotify } from '../spotifyStore';
import { beginLogin, fetchProfileSafe, isConfigured, logout } from '../api/spotify';
import { isConnected } from '../api/spotifyAuth';
import Icons from './icons';

/**
 * Barre du haut : navigation, recherche, thème et **connexion Spotify**.
 *
 * L'application ne connaît aucune autre identité : il n'y a pas de compte
 * local, pas de mot de passe stocké. Un clic sur « Se connecter avec Spotify »
 * redirige vers la page officielle de Spotify, où l'utilisateur choisit la
 * méthode qu'il préfère (e-mail/mot de passe, Google, Apple, Facebook, code
 * par SMS…) — le retour se fait sur `/callback` (OAuth PKCE, sans secret).
 *
 * Si `VITE_SPOTIFY_CLIENT_ID` n'est pas configurée, le bouton reste visible
 * mais explique la configuration manquante au lieu d'échouer silencieusement.
 */
export default function TopBar() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const qParam = params.get('q') ?? '';
  const [q, setQ] = useState(qParam);
  const theme = useStore((s) => s.theme);
  const toggleTheme = useStore((s) => s.toggleTheme);

  const spConnected = useSpotify((s) => s.connected);
  const spProfile = useSpotify((s) => s.profile);
  const spError = useSpotify((s) => s.error);
  const spBusy = useSpotify((s) => s.busy);
  const spSet = useSpotify((s) => s.set);

  const configured = isConfigured();
  const menuRef = useRef<HTMLDetailsElement>(null);

  // Reste synchronisé avec l'URL (recherche depuis la page /search,
  // suggestions, navigation avant/arrière…).
  useEffect(() => {
    setQ(qParam);
  }, [qParam]);

  const loadProfile = useCallback(async () => {
    const profile = await fetchProfileSafe();
    if (profile) spSet({ profile: profile, connected: true, error: null });
    // Token présent mais refusé par Spotify (révoqué, expiré…) : on repart
    // déconnecté plutôt que d'afficher un compte fantôme.
    else spSet({ connected: false, profile: null });
  }, [spSet]);

  // État initial : connexion déduite du token stocké, puis profil.
  useEffect(() => {
    if (!configured) {
      spSet({ connected: false, profile: null });
      return;
    }
    const connected = isConnected();
    spSet({ connected });
    if (connected) void loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Retour du callback Spotify : la connexion peut apparaître sans rechargement.
  useEffect(() => {
    if (spConnected && !spProfile) void loadProfile();
  }, [spConnected, spProfile, loadProfile]);

  function closeMenu() {
    if (menuRef.current) menuRef.current.removeAttribute('open');
  }

  function onSpotifyClick() {
    if (!configured) {
      spSet({
        error:
          'La connexion Spotify n’est pas configurée sur cette installation : ajoutez ' +
          'VITE_SPOTIFY_CLIENT_ID dans .env (voir README → Connexion Spotify), puis relancez l’application. ' +
          'L’URL de redirection à déclarer est ' +
          `${window.location.origin}/callback.`,
      });
      return;
    }
    spSet({ error: null, busy: true });
    beginLogin().catch((err: unknown) => {
      spSet({
        busy: false,
        error: err instanceof Error ? err.message : 'Connexion Spotify impossible.',
      });
    });
  }

  function onDisconnect() {
    closeMenu();
    logout();
    spSet({ connected: false, profile: null, error: null, busy: false });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    nav(q.trim() ? `/search?q=${encodeURIComponent(q.trim())}` : '/search');
  }

  const displayName = spProfile?.display_name || 'Compte Spotify';
  const avatar = spProfile?.images?.[0]?.url;
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button className="icon-btn" onClick={() => nav(-1)} title="Retour" aria-label="Retour">
          {Icons.chevronLeft(20)}
        </button>
        <button className="icon-btn" onClick={() => nav(1)} title="Avancer" aria-label="Avancer">
          {Icons.chevronRight(20)}
        </button>
      </div>

      <form className="search-pill" onSubmit={submit}>
        <input
          className="search-input"
          placeholder="Titre, artiste, album…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Rechercher"
        />
        <button className="icon-btn" type="submit" aria-label="Lancer la recherche">
          {Icons.search(20)}
        </button>
      </form>

      <div className="topbar-right">
        {spConnected ? (
          <details className="menu account-menu" ref={menuRef}>
            <summary
              className="account-summary"
              title={spProfile?.email ? `${displayName} · ${spProfile.email}` : displayName}
              aria-label={`Compte Spotify : ${displayName}`}
            >
              {avatar ? (
                <img className="account-avatar" src={avatar} alt="" />
              ) : (
                <span className="account-avatar account-avatar-fallback" aria-hidden>
                  {initials || Icons.spotify(14)}
                </span>
              )}
              <span className="account-name">{displayName}</span>
              {Icons.chevronDown(14)}
            </summary>
            <div className="menu-body">
              <div className="account-head">
                <strong>{displayName}</strong>
                {spProfile?.email && <span className="account-email">{spProfile.email}</span>}
                <span className="account-plan">
                  {spProfile?.product === 'premium'
                    ? 'Spotify Premium'
                    : spProfile?.product
                      ? `Spotify ${spProfile.product}`
                      : 'Connecté via Spotify'}
                </span>
              </div>
              <div className="menu-sep" />
              <button className="menu-item danger" onClick={onDisconnect}>
                {Icons.logout(14)} Déconnexion
              </button>
            </div>
          </details>
        ) : (
          <button
            className={`btn sp-pill ${configured ? 'accent' : 'ghost'}`}
            onClick={onSpotifyClick}
            disabled={spBusy}
            title={
              configured
                ? 'Se connecter avec Spotify (e-mail, Google, Apple, Facebook…)'
                : 'Connexion Spotify : VITE_SPOTIFY_CLIENT_ID manquante'
            }
            aria-label="Se connecter avec Spotify"
          >
            {Icons.spotify(18)}
            <span className="sp-label">
              {spBusy ? 'Redirection vers Spotify…' : configured ? 'Se connecter avec Spotify' : 'Connexion Spotify'}
            </span>
          </button>
        )}

        <button
          className="icon-btn"
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Thème clair' : 'Thème sombre'}
          aria-label="Basculer le thème"
        >
          {theme === 'dark' ? Icons.sun(20) : Icons.moon(20)}
        </button>
      </div>

      {spError && (
        <div className="spotify-error" role="alert">
          <span>{spError}</span>
          <button
            className="icon-btn small"
            onClick={() => spSet({ error: null })}
            aria-label="Fermer le message"
          >
            {Icons.close(14)}
          </button>
        </div>
      )}
    </header>
  );
}
