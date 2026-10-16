import { Routes, Route, Link } from 'react-router-dom';

export default function App() {
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="logo">SpotifyCraft</div>
        <nav className="nav">
          <Link to="/">Accueil</Link>
          <Link to="/search">Recherche</Link>
          <Link to="/library">Bibliothèque</Link>
        </nav>
      </aside>
      <main className="main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/search" element={<Search />} />
          <Route path="/library" element={<Library />} />
        </Routes>
      </main>
      <footer className="player">
        <span className="muted">Lecteur — sélectionnez une piste pour commencer.</span>
      </footer>
    </div>
  );
}

function Home() {
  return (
    <>
      <h1>Bienvenue sur SpotifyCraft</h1>
      <p className="muted">
        Clone open-source d'interface musicale. Remplacez ce contenu par votre catalogue,
        vos playlists et votre lecteur audio.
      </p>
      <div className="card">
        <strong>Prochaines étapes</strong>
        <ul>
          <li>Brancher une source de métadonnées (Deezer / Spotify Web API).</li>
          <li>Implémenter la lecture d'extraits audio.</li>
          <li>Ajouter playlists, likes et historique persistants.</li>
        </ul>
      </div>
    </>
  );
}

function Search() {
  return (
    <>
      <h1>Recherche</h1>
      <p className="muted">La recherche connectée sera ajoutée ici.</p>
    </>
  );
}

function Library() {
  return (
    <>
      <h1>Bibliothèque</h1>
      <p className="muted">Vos playlists et pistes likées apparaîtront ici.</p>
    </>
  );
}