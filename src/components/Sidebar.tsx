import { NavLink } from 'react-router-dom';
import { useStore } from '../store';
import { gradientOf } from '../lib/format';
import Icons from './icons';

/**
 * Barre latérale : navigation principale (avec état actif), accès direct aux
 * titres likés et à l'historique, puis playlists récentes.
 */
export default function Sidebar() {
  const playlists = useStore((s) => s.playlists);
  const likedCount = useStore((s) => s.liked.length);
  const historyCount = useStore((s) => s.history.length);

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `side-link ${isActive ? 'active' : ''}`;

  return (
    <aside className="sidebar">
      <NavLink className="brand" to="/">
        <span className="brand-dot" aria-hidden>{Icons.spotify(24)}</span>
        <span>SpotifyCraft</span>
      </NavLink>

      <nav className="side-nav">
        <NavLink to="/" end className={linkClass}>
          {Icons.home(20)} <span>Accueil</span>
        </NavLink>
        <NavLink to="/search" className={linkClass}>
          {Icons.search(20)} <span>Recherche</span>
        </NavLink>
        <NavLink to="/library" className={linkClass}>
          {Icons.library(20)} <span>Bibliothèque</span>
        </NavLink>
        <NavLink to="/local" className={linkClass}>
          {Icons.disc(20)} <span>Ma musique locale</span>
        </NavLink>
        <NavLink to="/daily" className={linkClass}>
          {Icons.spark(20)} <span>Daily Mix</span>
        </NavLink>
        <NavLink to="/playlist/liked" className={linkClass}>
          {Icons.heart()} <span>Titres likés</span>
          {likedCount > 0 && <span className="side-badge">{likedCount}</span>}
        </NavLink>
        <NavLink to="/history" className={linkClass}>
          {Icons.clock(20)} <span>Historique</span>
          {historyCount > 0 && <span className="side-badge">{historyCount}</span>}
        </NavLink>
      </nav>

      <div className="side-scroll">
        <div className="side-title">Ma bibliothèque</div>
        {playlists.map((p) => (
          <NavLink key={p.id} className="side-playlist" to={`/playlist/${p.id}`}>
            <span className="side-cover" style={{ background: gradientOf(p.id) }}>
              {p.tracks[0]?.cover ? <img src={p.tracks[0].cover} alt="" /> : Icons.note(16)}
            </span>
            <span className="side-pl-name">{p.name}</span>
            <span className="side-pl-count">{p.tracks.length} titre{p.tracks.length > 1 ? 's' : ''}</span>
          </NavLink>
        ))}
        {playlists.length === 0 && <div className="side-empty">Aucune playlist créée.</div>}
      </div>

      <div className="side-hint">Morceaux locaux · extraits 30 s</div>
    </aside>
  );
}
