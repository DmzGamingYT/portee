import { Link } from 'react-router-dom';
import { useStore } from '../store';
import { gradientOf } from '../lib/format';
import Icons from './icons';

/**
 * Barre latérale : navigation principale, puis raccourcis de playlists
 * ( rappel de l'interface Spotify ).
 */
export default function Sidebar() {
  const playlists = useStore((s) => s.playlists);
  void Icons;

  return (
    <aside className="sidebar">
      <Link className="brand" to="/">
        <span className="brand-dot" aria-hidden>♫</span>
        <span>SpotifyCraft</span>
      </Link>

      <nav className="side-nav">
        <Link to="/" className="side-link">{Icons.home(20)} Accueil</Link>
        <Link to="/search" className="side-link">{Icons.search(20)} Recherche</Link>
        <Link to="/library" className="side-link">{Icons.library(20)} Bibliothèque</Link>
      </nav>

      <div className="side-scroll">
        <div className="side-title">Ma bibliothèque</div>
        {playlists.map((p) => (
          <Link key={p.id} className="side-playlist" to={`/playlist/${p.id}`}>
            <span className="side-cover" style={{ background: gradientOf(p.id) }}>
              {p.tracks[0]?.cover ? <img src={p.tracks[0].cover} alt="" /> : Icons.note(16)}
            </span>
            <span className="side-pl-name">{p.name}</span>
            <span className="side-pl-count">{p.tracks.length} titre{p.tracks.length > 1 ? 's' : ''}</span>
          </Link>
        ))}
        {playlists.length === 0 && <div className="side-empty">Aucune playlist créée.</div>}
      </div>

      <div className="side-hint">Extraits officiels ~30 s</div>
    </aside>
  );
}
