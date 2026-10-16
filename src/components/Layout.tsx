import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { useStore } from '../store';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import PlayerBar from './player/PlayerBar';
import AudioEngine from './player/AudioEngine';

/** Gabarit global : sidebar + (barre du haut / contenu) + barre de lecture + moteur audio. */
export default function Layout() {
  const theme = useStore((s) => s.theme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return (
    <div className="app">
      <Sidebar />
      <div className="main-col">
        <TopBar />
        <main className="content">
          <Outlet />
        </main>
      </div>
      <PlayerBar />
      <AudioEngine />
    </div>
  );
}
