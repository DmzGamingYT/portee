import { useCallback, useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { currentTrack, useStore } from '../store';
import { useAutoTheme } from '../lib/useAutoTheme';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import PlayerBar from './player/PlayerBar';
import AudioEngine from './player/AudioEngine';
import GlobalDropTarget from './GlobalDropTarget';
import CommandPalette from './CommandPalette';
import { useKeyboardShortcuts } from '../lib/useKeyboardShortcuts';
import { useRadio } from '../lib/useRadio';

/** Gabarit global : sidebar + (barre du haut / contenu) + barre de lecture + moteur audio. */
export default function Layout() {
  // Thème : « suivre le système » par défaut, forçable dans les préférences.
  const themeMode = useStore((s) => s.themeMode);
  useAutoTheme(themeMode);
  useKeyboardShortcuts();
  // Radio continue : prolonge la file avant qu'elle ne s'arrête.
  useRadio();

  // Onglet : le titre en cours, pour retrouver l'app parmi d'autres onglets.
  const track = useStore(currentTrack);
  useEffect(() => {
    document.title = track ? `${track.title} · ${track.artist} — SpotifyCraft` : 'SpotifyCraft';
  }, [track]);

  // Palette de commandes : ⌘K / Ctrl+K depuis n'importe où dans l'app.
  const [paletteOpen, setPaletteOpen] = useState(false);
  const closePalette = useCallback(() => setPaletteOpen(false), []);

  // Chaque nouvelle page repart du haut : le conteneur défile, pas la fenêtre,
  // donc le navigateur ne le fait pas tout seul (contrairement à un site
  // classique). Sans ça, ouvrir un album depuis une étagère basse affichait
  // la page déjà défilée.
  const contentRef = useRef<HTMLElement>(null);
  const { pathname } = useLocation();
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
  }, [pathname]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return;
      if (e.key.toLowerCase() !== 'k') return;
      e.preventDefault();
      setPaletteOpen((open) => !open);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="app">
      <a className="skip-link" href="#main-content">Aller au contenu</a>
      <Sidebar />
      <div className="main-col">
        <TopBar onOpenPalette={() => setPaletteOpen(true)} />
        <main className="content" id="main-content" ref={contentRef} tabIndex={-1}>
          <Outlet />
        </main>
      </div>
      <PlayerBar />
      <AudioEngine />
      <GlobalDropTarget />
      {paletteOpen && <CommandPalette onClose={closePalette} />}
    </div>
  );
}
