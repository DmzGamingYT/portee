import { NavLink } from 'react-router-dom';
import { useStore } from '../store';
import { gradientOf } from '../lib/format';
import Icons from './icons';
import PreferencesMenu from './PreferencesMenu';

/**
 * Barre latérale : navigation principale (avec état actif), accès direct aux
 * titres likés et à l'historique, playlists récentes, puis préférences de
 * thème en pied de colonne.
 */
export default function Sidebar() {
  const playlists = useStore((s) => s.playlists);
  const likedCount = useStore((s) => s.liked.length);
  const historyCount = useStore((s) => s.history.length);

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `side-link ${isActive ? 'active' : ''}`;

  return (
    <aside className="sidebar">
      <NavLink className="brand" to="/" aria-label="Portée — accueil" title="Portée — accueil">
        <span className="brand-dot" aria-hidden>{Icons.note(24)}</span>
        <span>Portée</span>
      </NavLink>

      {/* En dessous de 960 px la colonne se réduit aux icônes : chaque lien
          garde donc un nom accessible explicite et une info-bulle. */}
      <nav className="side-nav" aria-label="Navigation principale">
        <NavLink to="/" end className={linkClass} aria-label="Accueil" title="Accueil">
          {Icons.home(20)} <span>Accueil</span>
        </NavLink>
        <NavLink to="/search" className={linkClass} aria-label="Recherche" title="Recherche">
          {Icons.search(20)} <span>Recherche</span>
        </NavLink>
        <NavLink to="/library" className={linkClass} aria-label="Bibliothèque" title="Bibliothèque">
          {Icons.library(20)} <span>Bibliothèque</span>
        </NavLink>
        <NavLink to="/local" className={linkClass} aria-label="Ma musique locale" title="Ma musique locale">
          {Icons.disc(20)} <span>Ma musique locale</span>
        </NavLink>
        <NavLink to="/daily" className={linkClass} aria-label="Daily Mix" title="Daily Mix">
          {Icons.spark(20)} <span>Daily Mix</span>
        </NavLink>
        <NavLink
          to="/playlist/liked"
          className={linkClass}
          aria-label={`Titres likés${likedCount > 0 ? ` ${likedCount}` : ''}`}
          title="Titres likés"
        >
          {Icons.heart()} <span>Titres likés</span>
          {likedCount > 0 && <>{' '}<span className="side-badge">{likedCount}</span></>}
        </NavLink>
        <NavLink
          to="/history"
          className={linkClass}
          aria-label={`Historique${historyCount > 0 ? ` ${historyCount}` : ''}`}
          title="Historique"
        >
          {Icons.clock(20)} <span>Historique</span>
          {historyCount > 0 && <>{' '}<span className="side-badge">{historyCount}</span></>}
        </NavLink>
      </nav>

      <div className="side-scroll">
        <div className="side-title">Ma bibliothèque</div>
        {playlists.map((p) => (
          <NavLink
            key={p.id}
            className="side-playlist"
            to={`/playlist/${p.id}`}
            aria-label={`${p.name} — ${p.tracks.length} titre${p.tracks.length > 1 ? 's' : ''}`}
            title={p.name}
          >
            <span className="side-cover" style={{ background: gradientOf(p.id) }}>
              {p.tracks[0]?.cover ? <img src={p.tracks[0].cover} alt="" /> : Icons.note(16)}
            </span>
            <span className="side-pl-text">
              <span className="side-pl-name">{p.name}</span>
              <span className="side-pl-count">
                {p.tracks.length} titre{p.tracks.length > 1 ? 's' : ''}
              </span>
            </span>
          </NavLink>
        ))}
        {playlists.length === 0 && <div className="side-empty">Aucune playlist créée.</div>}
      </div>

      <div className="side-footer">
        <PreferencesMenu />
        <div className="side-hint">Morceaux locaux · extraits 30 s</div>
      </div>
    </aside>
  );
}
