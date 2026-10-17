/**
 * Barre de lecture en bas de page (façon Spotify) : pochette + titre/artiste,
 * contrôles (prev/next, shuffle, repeat, like), barre de progression
 * cliquable, contrôle du volume.
 */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore, currentTrack } from '../../store';
import { fmtClock } from '../../lib/format';
import Icons from '../icons';
import QueuePanel from './QueuePanel';

export default function PlayerBar() {
  const track = useStore(currentTrack);
  const playing = useStore((s) => s.playing);
  const position = useStore((s) => s.position);
  const duration = useStore((s) => s.duration) || 30;
  const volume = useStore((s) => s.volume);
  const muted = useStore((s) => s.muted);
  const shuffle = useStore((s) => s.shuffle);
  const repeat = useStore((s) => s.repeat);
  const liked = useStore((s) => s.liked);
  const queueLen = useStore((s) => s.queue.length);
  const ctxName = useStore((s) => s.lastContextName);
  const audioError = useStore((s) => s.audioError);
  const dismissAudioError = useStore((s) => s.dismissAudioError);

  const togglePlay = useStore((s) => s.togglePlay);
  const next = useStore((s) => s.next);
  const prev = useStore((s) => s.prev);
  const seek = useStore((s) => s.seek);
  const setVolume = useStore((s) => s.setVolume);
  const toggleMute = useStore((s) => s.toggleMute);
  const toggleShuffle = useStore((s) => s.toggleShuffle);
  const cycleRepeat = useStore((s) => s.cycleRepeat);
  const toggleLike = useStore((s) => s.toggleLike);
  const crossfade = useStore((s) => s.crossfade);
  const setCrossfade = useStore((s) => s.setCrossfade);
  const hoverPreview = useStore((s) => s.hoverPreview);
  const toggleHoverPreview = useStore((s) => s.toggleHoverPreview);

  const [queueOpen, setQueueOpen] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);

  // Raccourci clavier : Échap ferme la file d'attente.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setQueueOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const isLiked = track ? liked.some((t) => t.id === track.id) : false;
  const pct = duration > 0 ? Math.min(100, (position / duration) * 100) : 0;

  function seekFromEvent(e: React.MouseEvent) {
    const el = barRef.current;
    if (!el || !track) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    seek(ratio * duration);
  }

  return (
    <>
      <footer className="player">
      {audioError && (
        <div className="player-error" role="alert">
          <span>{audioError}</span>
          <button className="link-btn" onClick={dismissAudioError} aria-label="Fermer le message">
            ✕
          </button>
        </div>
      )}
      <div className="player-left">
        {track ? (
          <>
            {track.cover ? (
              <img className="player-cover" src={track.cover} alt="" />
            ) : (
              <div className="player-cover player-cover-fallback" aria-hidden />
            )}
            <figure className="player-meta">
              <figcaption className="player-title" title={track.title}>{track.title}</figcaption>
              <div className="player-artist-link">
                {track.spotifyArtistId || track.artistId ? (
                  <Link to={`/artist/${track.spotifyArtistId ?? track.artistId}`} title={track.artist}>{track.artist}</Link>
                ) : (
                  <span title={track.artist}>{track.artist}</span>
                )}
                {track.localId && <span className="player-badge">Local</span>}
              </div>
              <button
                className={`icon-btn small ${isLiked ? 'accent' : ''}`}
                onClick={() => toggleLike(track)}
                title={isLiked ? 'Retirer des titres likés' : 'Ajouter aux titres likés'}
                aria-label="Like"
              >
                {Icons.heart(isLiked)}
              </button>
            </figure>
          </>
        ) : (
          <div className="player-meta muted">
            <span>Aucune lecture — choisissez un titre ou une playlist.</span>
          </div>
        )}
        <button
          className={`icon-btn mobile-only ${queueOpen ? 'accent' : ''}`}
          onClick={() => setQueueOpen((o) => !o)}
          title="File d'attente"
          aria-label="File d'attente"
          aria-expanded={queueOpen}
        >
          {Icons.queue(20)}
        </button>
      </div>

      <div className="player-center">
        <div className="player-btns">
          <button
            className={`icon-btn ${shuffle ? 'accent' : ''}`}
            onClick={toggleShuffle}
            title="Lecture aléatoire"
            aria-label="Aléatoire"
          >
            {Icons.shuffle()}
          </button>
          <button className="icon-btn" onClick={prev} title="Précédent" aria-label="Précédent" disabled={!track}>
            {Icons.prev()}
          </button>
          <button
            className="play-btn"
            onClick={togglePlay}
            title={playing ? 'Pause' : 'Lecture'}
            aria-label={playing ? 'Pause' : 'Lecture'}
            disabled={!track}
          >
            {playing ? Icons.pause() : Icons.play()}
          </button>
          <button className="icon-btn" onClick={next} title="Suivant" aria-label="Suivant" disabled={!track}>
            {Icons.next()}
          </button>
          <button
            className={`icon-btn ${repeat !== 'off' ? 'accent' : ''}`}
            onClick={cycleRepeat}
            title={repeat === 'one' ? 'Répéter ce titre' : 'Répéter la file'}
            aria-label="Répéter"
          >
            {Icons.repeat(repeat === 'one')}
          </button>
        </div>

        <div className="progress-row">
          <span className="time">{fmtClock(position)}</span>
          <div
            className="progress-bar"
            ref={barRef}
            onClick={seekFromEvent}
            role="slider"
            tabIndex={track ? 0 : -1}
            aria-label="Progression de la lecture"
            aria-valuemin={0}
            aria-valuemax={Math.round(duration)}
            aria-valuenow={Math.round(position)}
            aria-valuetext={`${fmtClock(position)} sur ${fmtClock(duration || 30)}`}
            onKeyDown={(e) => {
              if (!track) return;
              if (e.key === 'ArrowRight') {
                e.preventDefault();
                seek(position + 5);
              } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                seek(Math.max(0, position - 5));
              } else if (e.key === 'Home') {
                e.preventDefault();
                seek(0);
              } else if (e.key === 'End') {
                e.preventDefault();
                seek(Math.max(0, duration - 1));
              }
            }}
          >
            <div className="progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <span className="time">{fmtClock(duration || 30)}</span>
        </div>

        <div className="player-context muted">
          {queueLen > 0 ? `File : ${ctxName || 'Lecture en cours'} · ${queueLen} titre${queueLen > 1 ? 's' : ''}` : 'File vide'}
        </div>
      </div>

      <div className="player-right">
        {/* aperçu au survol (opt-in) */}
        <button
          className={`icon-btn ${hoverPreview ? 'accent' : ''}`}
          onClick={toggleHoverPreview}
          title={hoverPreview ? 'Désactiver l’aperçu au survol' : 'Activer l’aperçu au survol'}
          aria-label="Aperçu au survol"
          aria-pressed={hoverPreview}
        >
          {Icons.radio(20)}
        </button>

        {/* fondu de début / fin d'extrait (0–8 s) */}
        <label className="crossfade" title="Fondu en début et fin de chaque extrait">
          <span className="crossfade-label">Fondu</span>
          <input
            type="range"
            min={0}
            max={8}
            step={1}
            value={crossfade}
            onChange={(e) => setCrossfade(Number(e.target.value))}
            aria-label="Fondu en début et fin d'extrait (secondes)"
          />
          <span className="crossfade-val">{crossfade}s</span>
        </label>

        {/* file d'attente */}
        <button
          className={`icon-btn ${queueOpen ? 'accent' : ''}`}
          onClick={() => setQueueOpen((o) => !o)}
          title="File d'attente"
          aria-label="File d'attente"
          aria-expanded={queueOpen}
        >
          {Icons.queue(20)}
        </button>

        <button className="icon-btn" onClick={toggleMute} title={muted ? 'Rétablir le son' : 'Couper le son'} aria-label="Son">
          {muted || volume === 0 ? Icons.mute() : volume < 0.5 ? Icons.volLow() : Icons.volHigh()}
        </button>
        <input
          className="volume"
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={muted ? 0 : volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          aria-label="Volume"
        />
      </div>

      </footer>
      {queueOpen && <QueuePanel onClose={() => setQueueOpen(false)} />}
    </>
  );
}
