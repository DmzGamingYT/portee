import { useEffect, useRef } from 'react';
import { useStore } from '../../store';

/**
 * Moteur audio unique : un élément <audio> piloté par le store.
 * Charge l'extrait officiel (~30 s) de la piste courante, Lance/pause,
 * applique les demandes de seek, gère le volume/mute et les événements média.
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
  const track = index >= 0 && index < queue.length ? queue[index] : null;

  // 1) Nouvelle piste : charge l'extrait et repart à zéro.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (track?.preview) {
      if (!audio.src || !audio.src.includes(track.preview)) {
        audio.src = track.preview;
        audio.load();
      }
      audio.currentTime = 0;
    }
  }, [track?.preview]);

  // 2) Lecture / pause à chaud (reprise à l'endroit exact, pas au début).
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing && track?.preview) {
      void audio.play().catch(() => useStore.getState().setPlaying(false));
    } else {
      audio.pause();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, track?.preview]);

  // 3) Volume / mute à chaud.
  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.volume = muted ? 0 : volume;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [volume, muted]);

  // 4) Seek demandé par la barre de progression.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || pendingSeek <= 0) return;
    try {
      audio.currentTime = pendingSeek;
      useStore.setState({ pendingSeek: 0 });
    } catch {
      useStore.setState({ pendingSeek: 0 });
    }
  }, [pendingSeek]);

  // 5) Événements média (progression, fin, erreurs).
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTime = () => useStore.setState({ position: audio.currentTime });
    const onMeta = () => useStore.setState({ duration: audio.duration || 30 });
    const onEnded = () => {
      const s = useStore.getState();
      if (s.repeat === 'one') {
        audio.currentTime = 0;
        void audio.play().catch(() => useStore.setState({ playing: false }));
      } else {
        s.next();
      }
    };
    const onError = () => useStore.setState({ playing: false });
    const onPause = () => {
      if (!audio.ended) useStore.setState({ playing: false });
    };
    const onPlay = () => useStore.setState({ playing: true });

    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('play', onPlay);
    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('play', onPlay);
    };
  }, []);

  return audioRef;
}
