import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../store';
import { getLocalAudioUrl } from '../../lib/localLibrary';
import { ensureAudioGraph, resumeAudioGraph } from '../../lib/audioGraph';

/**
 * Moteur audio unique : un élément <audio> piloté par le store.
 *
 * - fondu de début / fin d'extrait (le réglage « Fondu »),
 * - historique alimenté uniquement quand un titre est réellement audible,
 * - MediaSession (touches média, écran verrouillé, casque),
 * - erreurs visibles et passage automatique au titre suivant.
 * - fichiers locaux : le blob IndexedDB est résolu à la demande en object URL.
 *
 * `crossOrigin="anonymous"` est indispensable : sans lui, un extrait distant
 * passé dans le Web Audio (égaliseur, analyseur) serait rendu muet par le
 * navigateur. Le CDN d'extraits iTunes autorise le CORS, et les fichiers
 * locaux sont des blobs de même origine.
 */
export default function AudioEngine() {
  const ref = useAudioEngine();
  return <audio ref={ref} hidden />;
}

function useAudioEngine(): React.RefObject<HTMLAudioElement> {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const queue = useStore((s) => s.queue);
  const index = useStore((s) => s.index);
  const playing = useStore((s) => s.playing);
  const volume = useStore((s) => s.volume);
  const muted = useStore((s) => s.muted);
  const pendingSeek = useStore((s) => s.pendingSeek);
  const crossfade = useStore((s) => s.crossfade);
  const eqGains = useStore((s) => s.eqGains);
  const eqEnabled = useStore((s) => s.eqEnabled);
  const track = index >= 0 && index < queue.length ? queue[index] : null;
  const trackId = track?.id ?? null;
  const preview = track?.preview ?? null;
  const localId = track?.localId ?? null;
  const fallbackDuration = track?.durationMs
    ? Math.max(1, Math.round(track.durationMs / 1000))
    : 30;

  // Source réellement jouable : URL distante ou object URL d'un fichier local.
  // La résolution est étiquetée par piste : une source de la piste précédente
  // ne peut jamais être utilisée (ni jouée) pour la piste suivante.
  interface ResolvedSource {
    trackId: string;
    src: string | null;
    unavailable?: boolean;
  }
  const [source, setSource] = useState<ResolvedSource | null>(null);
  const currentSource = source && source.trackId === trackId ? source : null;
  const resolvedSrc = currentSource?.src ?? null;
  const sourceUnavailable = currentSource?.unavailable ?? false;

  // 0) Réglages de base.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.preload = 'auto';
    // Doit être posé avant toute affectation de `src`.
    audio.crossOrigin = 'anonymous';
    const s = useStore.getState();
    audio.volume = s.muted ? 0 : s.volume;
    audio.muted = s.muted;
  }, []);

  // 0 bis) Graphe Web Audio : égaliseur 10 bandes + analyseur, créés une fois.
  // Le graphe est partagé (un seul `createMediaElementSource` possible) et
  // reste neutre tant que l'égaliseur est plat ou désactivé.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    ensureAudioGraph(audio)?.applyEq(eqGains, eqEnabled);
  }, [eqGains, eqEnabled]);

  // 1) Résolution de la source : extrait distant ou blob local (asynchrone).
  // On coupe immédiatement l'ancienne source dès le changement de piste pour
  // ne jamais laisser jouer (ni échouer) le titre précédent pendant la
  // lecture IndexedDB.
  useEffect(() => {
    let cancelled = false;
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      try {
        audio.load();
      } catch {
        // lecteur vidé
      }
    }

    if (!trackId) {
      setSource(null);
      return;
    }
    if (preview) {
      setSource({ trackId, src: preview });
      return;
    }
    if (!localId) {
      setSource({ trackId, src: null, unavailable: true });
      return;
    }

    setSource({ trackId, src: null });
    getLocalAudioUrl(localId)
      .then((url) => {
        if (cancelled) return;
        if (!url) {
          setSource({ trackId, src: null, unavailable: true });
          useStore.getState().setPlaying(false);
          useStore.setState({
            audioError: 'Fichier local introuvable — il a peut-être été supprimé de la bibliothèque.',
          });
          return;
        }
        setSource({ trackId, src: url });
      })
      .catch(() => {
        if (cancelled) return;
        setSource({ trackId, src: null, unavailable: true });
        useStore.getState().setPlaying(false);
        useStore.setState({
          audioError: 'Impossible d’ouvrir ce fichier local (stockage indisponible).',
        });
      });

    return () => {
      cancelled = true;
    };
  }, [trackId, preview, localId]);

  // 2) Nouvelle source : charge l'audio et repart à zéro.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!trackId) {
      audio.pause();
      audio.removeAttribute('src');
      try {
        audio.load();
      } catch {
        // on voulait juste vider le lecteur
      }
      useStore.setState({ position: 0, duration: 0 });
      return;
    }

    if (!resolvedSrc) {
      if (sourceUnavailable) {
        audio.pause();
        audio.removeAttribute('src');
        try {
          audio.load();
        } catch {
          // lecteur vidé
        }
        useStore.setState({ position: 0, duration: 0, pendingSeek: null });
      }
      return;
    }

    if (audio.getAttribute('src') !== resolvedSrc) {
      audio.src = resolvedSrc;
      audio.load();
      useStore.setState({
        position: 0,
        duration: fallbackDuration,
        pendingSeek: null,
        audioError: null,
      });
    }
  }, [trackId, resolvedSrc, sourceUnavailable, fallbackDuration]);

  // 3) Lecture / pause à chaud (+ historique et erreurs explicites).
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!playing || !resolvedSrc) {
      audio.pause();
      return;
    }

    if (audio.getAttribute('src') !== resolvedSrc) {
      audio.src = resolvedSrc;
      audio.load();
      useStore.setState({ position: 0, duration: fallbackDuration });
    }

    const expectedTrackId = trackId;
    // Le contexte naît suspendu : un geste (ce clic de lecture) le réveille.
    resumeAudioGraph();
    void audio
      .play()
      .then(() => {
        const cur = useStore.getState();
        const i = cur.index;
        const t = i >= 0 && i < cur.queue.length ? cur.queue[i] : null;
        if (!t || t.id !== expectedTrackId) return;
        if (!cur.playing) {
          audio.pause();
          return;
        }
        // Titre réellement lancé : on l'ajoute à l'historique.
        cur.addToHistory(t);
      })
      .catch((err) => {
        const cur = useStore.getState();
        const i = cur.index;
        const t = i >= 0 && i < cur.queue.length ? cur.queue[i] : null;
        if (!t || t.id !== expectedTrackId) return;
        const name = err instanceof DOMException ? err.name : '';
        // `load()`/changement de source interrompt un play() en attente :
        // ce n'est pas une erreur de lecture, la nouvelle source va démarrer.
        if (name === 'AbortError') return;
        cur.setPlaying(false);
        useStore.setState({
          audioError:
            name === 'NotAllowedError'
              ? 'Lecture bloquée par le navigateur : cliquez une fois sur Lecture pour activer le son.'
              : t.localId
                ? 'Impossible de lire ce fichier local — format non pris en charge.'
                : 'Impossible de lire cet extrait — passez au titre suivant.',
        });
      });
  }, [playing, trackId, resolvedSrc, fallbackDuration]);

  // 3) Volume / mute à chaud.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = muted ? 0 : volume;
    audio.muted = muted;
  }, [volume, muted]);

  // 4) Fondu : enveloppe calculée à chaque image (début et fin d'extrait).
  // Sans chevauchement entre deux titres (une seule balise audio), mais le
  // réglage n'est plus décoratif : plus de coupure sèche.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    let raf = 0;

    const apply = () => {
      const a = audioRef.current;
      if (!a) return;
      const { volume: base, muted: isMuted, crossfade: fade } = useStore.getState();
      if (!fade) {
        a.volume = isMuted ? 0 : base;
        return;
      }
      const duration = Number.isFinite(a.duration) ? a.duration : 0;
      if (duration <= 0) {
        a.volume = isMuted ? 0 : base;
        return;
      }
      const fadeOut = Math.min(fade, duration / 3);
      const fadeIn = Math.min(1.5, duration / 3);
      const remaining = duration - a.currentTime;
      let gain = 1;
      if (fadeOut > 0 && remaining < fadeOut) {
        gain = Math.min(gain, Math.max(0, remaining / fadeOut));
      }
      if (fadeIn > 0 && a.currentTime < fadeIn) {
        gain = Math.min(gain, Math.max(0, a.currentTime / fadeIn));
      }
      a.volume = isMuted ? 0 : base * gain;
    };

    if (playing) {
      const tick = () => {
        apply();
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    } else {
      apply();
    }
    return () => cancelAnimationFrame(raf);
  }, [playing, crossfade]);

  // 5) Seek demandé par la barre (null = rien à faire).
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || pendingSeek === null || pendingSeek === undefined) return;
    if (!audio.getAttribute('src') && !audio.src) {
      useStore.setState({ pendingSeek: null });
      return;
    }
    const target = pendingSeek;
    const apply = () => {
      try {
        const max = Number.isFinite(audio.duration) ? audio.duration : target;
        audio.currentTime = Math.min(target, Math.max(0, max));
        useStore.setState({ position: audio.currentTime, pendingSeek: null });
      } catch {
        useStore.setState({ pendingSeek: null });
      }
    };
    if (audio.readyState >= 1) {
      apply();
      return;
    }
    const onMeta = () => apply();
    audio.addEventListener('loadedmetadata', onMeta, { once: true });
    const timer = setTimeout(() => {
      audio.removeEventListener('loadedmetadata', onMeta);
      apply();
    }, 1500);
    return () => {
      clearTimeout(timer);
      audio.removeEventListener('loadedmetadata', onMeta);
    };
  }, [pendingSeek]);

  // 6) Événements média (progression, fin, erreurs).
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTime = () => {
      useStore.setState({ position: audio.currentTime });
      const ms = navigator.mediaSession;
      if (ms && 'setPositionState' in ms && Number.isFinite(audio.duration) && audio.duration > 0) {
        try {
          ms.setPositionState({
            duration: audio.duration,
            position: Math.min(audio.currentTime, audio.duration),
            playbackRate: 1,
          });
        } catch {
          // certaines plateformes refusent l'appel : sans gravité
        }
      }
    };
    const onMeta = () =>
      useStore.setState({
        duration: Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 30,
      });
    const onEnded = () => {
      const s = useStore.getState();
      if (s.repeat === 'one') {
        audio.currentTime = 0;
        void audio.play().catch(() => useStore.setState({ playing: false }));
      } else {
        s.next();
      }
    };
    const onError = () => {
      const s = useStore.getState();
      if (!s.playing || !audio.getAttribute('src')) return;
      const current =
        s.index >= 0 && s.index < s.queue.length ? s.queue[s.index] : null;
      const code = audio.error?.code ?? 0;
      const msg = current?.localId
        ? 'Fichier local illisible — titre suivant.'
        : code === 4
          ? 'Format audio non pris en charge pour ce titre — titre suivant.'
          : 'Extrait injoignable — titre suivant.';
      if (s.queue.length > 1) {
        useStore.setState({ audioError: msg });
        s.next();
      } else {
        s.setPlaying(false);
        useStore.setState({ audioError: msg });
      }
    };

    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);
    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
    };
  }, []);

  // 7) MediaSession : métadonnées + actions système (touches média, casque).
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    if (!track) {
      navigator.mediaSession.metadata = null;
      return;
    }
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist,
      album: track.album || 'Portée',
      artwork: track.cover ? [{ src: track.cover, sizes: '600x600' }] : [],
    });
  }, [track]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
  }, [playing]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    const handlers: Array<[MediaSessionAction, MediaSessionActionHandler]> = [
      ['play', () => useStore.getState().setPlaying(true)],
      ['pause', () => useStore.getState().setPlaying(false)],
      ['previoustrack', () => useStore.getState().prev()],
      ['nexttrack', () => useStore.getState().next()],
      [
        'seekbackward',
        (details) => {
          const s = useStore.getState();
          s.seek(Math.max(0, s.position - (details.seekOffset ?? 10)));
        },
      ],
      [
        'seekforward',
        (details) => {
          const s = useStore.getState();
          s.seek(s.position + (details.seekOffset ?? 10));
        },
      ],
      [
        'seekto',
        (details) => {
          if (typeof details.seekTime === 'number') useStore.getState().seek(details.seekTime);
        },
      ],
    ];

    for (const [action, handler] of handlers) {
      try {
        ms.setActionHandler(action, handler);
      } catch {
        // action non supportée par la plateforme
      }
    }
    return () => {
      for (const [action] of handlers) {
        try {
          ms.setActionHandler(action, null);
        } catch {
          // ignoré
        }
      }
    };
  }, []);

  return audioRef;
}
