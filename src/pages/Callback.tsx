import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { beginLogin, handleCallback, isConfigured } from '../api/spotifyAuth';
import { useSpotify } from '../spotifyStore';
import Icons from '../components/icons';

/**
 * Fin du flux OAuth Spotify (PKCE) : la page reçoit `?code=…` (ou `?error=`),
 * échange le code contre les tokens, nettoie l'URL et redirige vers l'accueil.
 */
export default function Callback() {
  const nav = useNavigate();
  const [message, setMessage] = useState('Connexion à Spotify en cours…');
  const [failed, setFailed] = useState(false);
  const done = useRef(false);
  const setSpotify = useSpotify((s) => s.set);

  useEffect(() => {
    // Sous StrictMode, les effets sont montés deux fois : sans ce verrou le
    // premier passage consommerait `state`/le verifier PKCE et le second
    // échouerait. On ne protège pas non plus les mises à jour par un drapeau
    // « cancelled » : le remontage StrictMode les annulerait et la page
    // resterait bloquée sur « Connexion en cours… ».
    if (done.current) return;
    done.current = true;

    handleCallback()
      .then((handled) => {
        if (handled) {
          setSpotify({ connected: true, error: null, busy: false });
          setMessage('Connecté ! Retour à l’accueil…');
        }
        nav('/', { replace: true });
      })
      .catch((err: unknown) => {
        const text = err instanceof Error ? err.message : 'Échec de la connexion Spotify.';
        setMessage(text);
        setFailed(true);
        setSpotify({ connected: false, profile: null, error: text, busy: false });
      });
  }, [nav, setSpotify]);

  if (!failed) {
    return (
      <div className="empty-note" style={{ display: 'grid', placeItems: 'center', gap: 12 }}>
        <span className="spinner" aria-hidden />
        <span>{message}</span>
      </div>
    );
  }

  return (
    <div className="empty-note callback-error">
      <h1>Connexion Spotify impossible</h1>
      <p>{message}</p>
      <div className="error-actions">
        {isConfigured() && (
          <button
            className="btn accent"
            onClick={() => {
              void beginLogin().catch((err: unknown) =>
                setMessage(err instanceof Error ? err.message : 'Connexion impossible.')
              );
            }}
          >
            {Icons.spotify(18)} Réessayer
          </button>
        )}
        <Link className="btn ghost" to="/">Continuer avec iTunes</Link>
      </div>
    </div>
  );
}
