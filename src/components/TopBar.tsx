import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useStore } from '../store';
import Icons from './icons';

/** Barre du haut : navigation retour, recherche, thème. */
export default function TopBar() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [q, setQ] = useState(params.get('q') ?? '');
  const theme = useStore((s) => s.theme);
  const toggleTheme = useStore((s) => s.toggleTheme);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    nav(q.trim() ? `/search?q=${encodeURIComponent(q.trim())}` : '/search');
  }

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
        <button
          className="icon-btn"
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Thème clair' : 'Thème sombre'}
          aria-label="Basculer le thème"
        >
          {theme === 'dark' ? Icons.sun(20) : Icons.moon(20)}
        </button>
      </div>
    </header>
  );
}
