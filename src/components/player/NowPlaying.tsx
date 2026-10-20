/**
 * Vue « grand format » de la lecture en cours, façon Spotify : panneau qui
 * glisse depuis la droite, avec la pochette en grand, le titre, l'artiste, la
 * progression, les commandes et les prochains titres de la file.
 *
 * Comme `QueuePanel`, il n'est monté que lorsqu'il est ouvert : les mises à
 * jour de position (`timeupdate`) ne re-rendent que lui, jamais la page.
 */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { currentTrack, useStore } from '../../store';
import { fmtClock } from '../../lib/format';
import Icons from '../icons';
import LyricsPane from './LyricsPane';

export default function NowPlaying({ onClose }: { onClose: () => void }) {
  const track = useStore(currentTrack);
  const playing = useStore((s) => s.playing);
  const position = useStore((s) => s.position);
  const duration = useStore((s) => s.duration) || 30;
  const volume = useStore((s) => s.volume);
  const muted = useStore((s) => s.muted);
  const shuffle = useStore((s) => s.shuffle);
  const repeat = useStore((s) => s.repeat);
  const liked = useStore((s) => s.liked);
  const queue = useStore((s) => s.queue);
  const index = useStore((s) => s.index);
  const ctxName = useStore((s) => s.lastContextName);

  const togglePlay = useStore((s) => s.togglePlay);
  const next = useStore((s) => s.next);
  const prev = useStore((s) => s.prev);
  const seek = useStore((s) => s.seek);
  const setVolume = useStore((s) => s.setVolume);
  const toggleMute = useStore((s) => s.toggleMute);
  const toggleShuffle = useStore((s) => s.toggleShuffle);
  const cycleRepeat = useStore((s) => s.cycleRepeat);
  const toggleLike = useStore((s) => s.toggleLike);
  const playTrack = useStore((s) => s.playTrack);

  const panelRef = useRef<HTMLElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  // Glissement vers le bas pour fermer (tactile et souris).
  const [drag, setDrag] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ id: number; startY: number; startAt: number } | null>(null);

  // À l'ouverture on prend le focus (Échap et Tab fonctionnent tout de suite) ;
  // à la fermeture on le rend à l'élément qui avait ouvert le panneau.
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.focus();
    return () => previous?.focus?.();
  }, []);

  function startDrag(e: React.PointerEvent) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // Un bouton dans la zone (fermer, par exemple) garde son rôle de clic.
    if ((e.target as HTMLElement).closest('button')) return;
    dragRef.current = { id: e.pointerId, startY: e.clientY, startAt: performance.now() };
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // Pointeur déjà relâché (ou capture refusée) : le glissement reste suivi
      // par les événements qui remontent normalement.
    }
    setDragging(true);
  }

  function moveDrag(e: React.PointerEvent) {
    const state = dragRef.current;
    if (!state || state.id !== e.pointerId) return;
    setDrag(Math.max(0, e.clientY - state.startY));
  }

  function endDrag(e: React.PointerEvent) {
    const state = dragRef.current;
    if (!state || state.id !== e.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    const distance = Math.max(0, e.clientY - state.startY);
    const velocity = distance / Math.max(1, performance.now() - state.startAt); // px/ms
    // Soit on a assez tiré, soit on a jeté le panneau d'un geste bref.
    if (distance > 110 || (distance > 36 && velocity > 0.55)) {
      onClose();
      return;
    }
    setDrag(0);
  }

  const dragProps = {
    onPointerDown: startDrag,
    onPointerMove: moveDrag,
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
  };

  const isLiked = track ? liked.some((t) => t.id === track.id) : false;
  const pct = duration > 0 ? Math.min(100, (position / duration) * 100) : 0;
  const upcoming = index >= 0 ? queue.slice(index + 1, index + 4) : [];
  const remaining = Math.max(0, Math.round(duration - position));

  function seekFromEvent(e: React.MouseEvent) {
    const el = barRef.current;
    if (!el || !track) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    seek(ratio * duration);
  }

  return (
    <>
      <button
        className="now-backdrop"
        aria-label="Fermer la vue de lecture"
        onClick={onClose}
        tabIndex={-1}
      />
      <aside
        ref={panelRef}
        className={`now-panel ${dragging ? 'dragging' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Lecture en cours"
        tabIndex={-1}
        style={drag > 0 ? { transform: `translateY(${drag}px)` } : undefined}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            onClose();
            return;
          }
          // Piège à focus : le panneau est modal, la tabulation reste dedans.
          if (e.key !== 'Tab') return;
          const panel = panelRef.current;
          if (!panel) return;
          const focusables = Array.from(
            panel.querySelectorAll<HTMLElement>('button, [href], input, [tabindex]:not([tabindex="-1"])')
          ).filter((el) => !el.hasAttribute('disabled') && el.offsetParent !== null);
          if (focusables.length === 0) return;
          const first = focusables[0];
          const last = focusables[focusables.length - 1];
          if (e.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }}
      >
        {track?.cover && (
          <div
            className="now-blur"
            style={{ backgroundImage: `url("${track.cover}")` }}
            aria-hidden
          />
        )}

        {/* Seul ce conteneur défile : le halo flouté et la main qui l'assombrit
            restent posés sur le panneau, sinon ils glissent avec le contenu et
            laissent apparaître une bande crue en bas. */}
        <div className="now-scroll">
          <div className="now-grab" aria-hidden {...dragProps}>
            <span />
          </div>

          <header className="now-head" {...dragProps}>
            <div className="now-head-text">
              <span className="now-kicker">Lecture en cours</span>
              {ctxName && <span className="now-context" title={ctxName}>{ctxName}</span>}
            </div>
            <button className="icon-btn" onClick={onClose} title="Fermer (Échap)" aria-label="Fermer">
              {Icons.close(20)}
            </button>
          </header>

          {!track ? (
            <p className="now-empty muted">
              Aucune lecture — choisissez un titre, un album ou une playlist.
            </p>
          ) : (
            <div className="now-body">
              <div className="now-art">
                {track.cover ? (
                  <img src={track.cover} alt="" />
                ) : (
                  <span className="now-art-empty" aria-hidden>
                    {Icons.note(72)}
                  </span>
                )}
              </div>

              <div className="now-titles">
                <h2 className="now-title" title={track.title}>
                  {track.title}
                </h2>
                <div className="now-artist">
                  {track.spotifyArtistId || track.artistId ? (
                    <Link to={`/artist/${track.spotifyArtistId ?? track.artistId}`} onClick={onClose}>
                      {track.artist}
                    </Link>
                  ) : (
                    <span>{track.artist}</span>
                  )}
                  {track.localId ? (
                    <span className="player-badge">Local</span>
                  ) : track.preview ? (
                    <span className="player-badge" title="Extrait officiel de 30 secondes fourni par le catalogue">
                      Extrait 30 s
                    </span>
                  ) : null}
                </div>
                {track.album && (
                  <div className="now-album">
                    {track.spotifyAlbumId || track.collectionId ? (
                      <Link to={`/album/${track.spotifyAlbumId ?? track.collectionId}`} onClick={onClose}>
                        {track.album}
                      </Link>
                    ) : (
                      <span>{track.album}</span>
                    )}
                  </div>
                )}
              </div>

              <LyricsPane track={track} position={position} duration={duration} />

              <div className="now-progress">
                <div
                  className="progress-bar big"
                  ref={barRef}
                  onClick={seekFromEvent}
                  role="slider"
                  tabIndex={0}
                  aria-label="Progression de la lecture"
                  aria-valuemin={0}
                  aria-valuemax={Math.round(duration)}
                  aria-valuenow={Math.round(position)}
                  aria-valuetext={`${fmtClock(position)} sur ${fmtClock(duration)}`}
                  onKeyDown={(e) => {
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
                <div className="now-times">
                  <span className="time">{fmtClock(position)}</span>
                  <span className="time muted">−{fmtClock(remaining)}</span>
                </div>
              </div>

              <div className="now-controls">
                <button
                  className={`icon-btn ${shuffle ? 'accent' : ''}`}
                  onClick={toggleShuffle}
                  title="Lecture aléatoire"
                  aria-label="Aléatoire"
                  aria-pressed={shuffle}
                >
                  {Icons.shuffle(20)}
                </button>
                <button className="icon-btn" onClick={prev} title="Précédent" aria-label="Précédent">
                  {Icons.prev(24)}
                </button>
                <button
                  className="play-btn big"
                  onClick={togglePlay}
                  title={playing ? 'Pause' : 'Lecture'}
                  aria-label={playing ? 'Pause' : 'Lecture'}
                >
                  {playing ? Icons.pause(26) : Icons.play(26)}
                </button>
                <button className="icon-btn" onClick={next} title="Suivant" aria-label="Suivant">
                  {Icons.next(24)}
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

              <div className="now-secondary">
                <button
                  className={`icon-btn ${isLiked ? 'accent' : ''}`}
                  onClick={() => toggleLike(track)}
                  title={isLiked ? 'Retirer des titres likés' : 'Ajouter aux titres likés'}
                  aria-pressed={isLiked}
                  aria-label="Like"
                >
                  {Icons.heart(isLiked)}
                </button>

                <div className="now-volume">
                  <button
                    className="icon-btn"
                    onClick={toggleMute}
                    title={muted ? 'Rétablir le son' : 'Couper le son'}
                    aria-label={muted ? 'Rétablir le son' : 'Couper le son'}
                  >
                    {muted || volume === 0
                      ? Icons.mute(18)
                      : volume < 0.5
                        ? Icons.volLow(18)
                        : Icons.volHigh(18)}
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
              </div>

              {upcoming.length > 0 && (
                <section className="now-up-next">
                  <div className="queue-label">À suivre</div>
                  {upcoming.map((t) => (
                    <button key={t.id} className="now-next-item" onClick={() => playTrack(t)}>
                      <span className="now-next-thumb">
                        {t.cover ? <img src={t.cover} alt="" /> : Icons.note(16)}
                      </span>
                      <span className="queue-meta">
                        <span className="queue-title">{t.title}</span>
                        <span className="queue-artist">{t.artist}</span>
                      </span>
                      <span className="now-next-play" aria-hidden>
                        {Icons.play(16)}
                      </span>
                    </button>
                  ))}
                </section>
              )}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
