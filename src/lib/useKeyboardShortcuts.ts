import { useEffect } from 'react';
import { useStore } from '../store';

/**
 * Raccourcis clavier globaux du lecteur (façon Spotify) :
 *   Espace        lecture / pause
 *   ← / →         reculer / avancer de 5 s
 *   Maj + ← / →   piste précédente / suivante
 *   M             couper le son
 *   S             lecture aléatoire
 *   R             mode de répétition
 *
 * Les champs de saisie et les éléments interactifs focalisés gardent la main
 * (sinon Espace activerait deux fois un bouton).
 */
export function useKeyboardShortcuts(): void {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const target = event.target as HTMLElement | null;
      if (
        target?.closest(
          'input, textarea, select, [contenteditable="true"], [role="slider"], [role="textbox"]'
        )
      ) {
        return;
      }

      const state = useStore.getState();

      switch (event.key) {
        case ' ': {
          // Un bouton/lien focalisé doit recevoir Espace normalement.
          if (target?.closest('button, a, summary, [role="button"]')) return;
          if (state.queue.length === 0) return;
          event.preventDefault();
          state.togglePlay();
          break;
        }
        case 'ArrowRight': {
          if (!state.queue.length) return;
          event.preventDefault();
          if (event.shiftKey) state.next();
          else state.seek(state.position + 5);
          break;
        }
        case 'ArrowLeft': {
          if (!state.queue.length) return;
          event.preventDefault();
          if (event.shiftKey) state.prev();
          else state.seek(Math.max(0, state.position - 5));
          break;
        }
        case 'm':
        case 'M':
          state.toggleMute();
          break;
        case 's':
        case 'S':
          state.toggleShuffle();
          break;
        case 'r':
        case 'R':
          state.cycleRepeat();
          break;
        default:
          break;
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
