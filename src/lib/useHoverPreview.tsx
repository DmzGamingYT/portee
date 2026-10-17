import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import type { Track } from '../types';

/**
 * Aperçu audio au survol (« hover preview ») :
 *  - joue l'extrait quand l'utilisateur survole une ligne, **seulement si
 *    aucun titre principal ne joue déjà** et si l'option est activée ;
 *  - coupe dès la sortie du survol ; ne touche jamais au `<audio>` principal ;
 *  - crée un seul élément audio à la demande (pas un par ligne affichée).
 *
 * Retourne `{ hovering, bind }` à accrocher sur la ligne.
 */
export function useHoverPreview(track: Track, enabled = true) {
  const [hovering, setHovering] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timer = useRef<number | null>(null);
  const playing = useStore((s) => s.playing);

  const stop = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    audioRef.current?.pause();
    setHovering(false);
  }, []);

  // Coupe l'aperçu si une vraie lecture démarre par ailleurs ou si
  // l'utilisateur désactive l'option pendant le survol.
  useEffect(() => {
    if (playing || !enabled) stop();
  }, [playing, enabled, stop]);

  // Nettoyage au démontage.
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        audio.removeAttribute('src');
        audioRef.current = null;
      }
    },
    []
  );

  const start = useCallback(() => {
    if (!enabled || !track.preview || useStore.getState().playing) return;
    if (timer.current !== null) window.clearTimeout(timer.current);
    // Petit délai : évite de déclencher à chaque micro-mouvement de souris.
    timer.current = window.setTimeout(() => {
      if (!track.preview || useStore.getState().playing) return;
      let audio = audioRef.current;
      if (!audio) {
        audio = new Audio();
        audio.preload = 'none';
        audio.volume = 0.45;
        audio.loop = true;
        audioRef.current = audio;
      }
      if (audio.src !== track.preview) audio.src = track.preview;
      void audio.play().catch(() => {
        // autoplay refusé ou flux injoignable : on ignore silencieusement
      });
    }, 350);
  }, [enabled, track.preview]);

  function bind() {
    return {
      onMouseEnter: () => {
        if (!enabled || !track.preview) return;
        setHovering(true);
        start();
      },
      onMouseLeave: stop,
      onFocus: () => {
        if (!enabled || !track.preview) return;
        setHovering(true);
        start();
      },
      onBlur: stop,
    };
  }

  return { hovering, bind };
}
