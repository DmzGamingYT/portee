import { Outlet } from 'react-router-dom';
import { useAutoTheme } from '../lib/useAutoTheme';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import PlayerBar from './player/PlayerBar';
import AudioEngine from './player/AudioEngine';
import GlobalDropTarget from './GlobalDropTarget';
import { useKeyboardShortcuts } from '../lib/useKeyboardShortcuts';

/** Gabarit global : sidebar + (barre du haut / contenu) + barre de lecture + moteur audio. */
export default function Layout() {
  // Thème automatique jour/nuit : aucune bascule, tout suit le système.
  useAutoTheme();
  useKeyboardShortcuts();

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
      <GlobalDropTarget />
    </div>
  );
}
