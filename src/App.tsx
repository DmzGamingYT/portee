import { Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import SearchPage from './pages/SearchPage';
import Library from './pages/Library';
import PlaylistDetail from './pages/PlaylistDetail';
import AlbumDetail from './pages/AlbumDetail';
import ArtistDetail from './pages/ArtistDetail';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/library" element={<Library />} />
        <Route path="/playlist/:id" element={<PlaylistDetail />} />
        <Route path="/album/:id" element={<AlbumDetail />} />
        <Route path="/artist/:id" element={<ArtistDetail />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

function NotFound() {
  return <div className="empty-note">Page introuvable — retournez à l'accueil.</div>;
}
