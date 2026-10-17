import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../store';
import { fmtDuration } from '../../lib/format';
import Icons from '../icons';

/**
 * Panneau « File d'attente » façon Spotify : glisse depuis la droite,
 * liste la piste courante + les titres à venir, permet de les réordonner par
 * glisser-déposer et de retirer une piste.
 *
 * Ne s'abonne qu'à la file (pas à la position de lecture) et n'est monté que
 * lorsqu'il est ouvert : les mises à jour `timeupdate` ne le rendent pas.
 */
export default function QueuePanel({ onClose }: { onClose: () => void }) {
  const queue = useStore((s) => s.queue);
  const index = useStore((s) => s.index);
  const playing = useStore((s) => s.playing);
  const moveQueue = useStore((s) => s.moveQueue);
  const removeFromQueue = useStore((s) => s.removeFromQueue);
  const playTrack = useStore((s) => s.playTrack);
  const togglePlay = useStore((s) => s.togglePlay);

  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const panelRef = useRef<HTMLElement>(null);

  // Focus à l'ouverture pour que Échap fonctionne immédiatement.
  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  const current = index >= 0 && index < queue.length ? queue[index] : null;
  const upcoming = index >= 0 ? queue.slice(index + 1) : queue;
  const base = index >= 0 ? index + 1 : 0; // index absolu du 1er « à venir »

  function handleDrop(target: number) {
    if (dragFrom === null) return;
    moveQueue(dragFrom, target);
    setDragFrom(null);
    setDragOver(null);
  }

  return (
    <>
      <button
        className="queue-backdrop"
        aria-label="Fermer la file d'attente"
        onClick={onClose}
        tabIndex={-1}
      />
      <aside
        ref={panelRef}
        className="queue-panel"
        role="dialog"
        aria-modal="true"
        aria-label="File d'attente"
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            onClose();
            return;
          }
          // Piège à focus : le panneau est modal, la tabulation reste dedans.
          if (e.key === 'Tab') {
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
          }
        }}
      >
        <header className="queue-head">
          <div>
            <h2>File d’attente</h2>
            <span className="queue-count">
              {queue.length} titre{queue.length > 1 ? 's' : ''}
              {upcoming.length > 0 ? ` · ${upcoming.length} à venir` : ''}
            </span>
          </div>
          <button className="icon-btn" onClick={onClose} title="Fermer" aria-label="Fermer">
            {Icons.close(20)}
          </button>
        </header>

        {!current && upcoming.length === 0 ? (
          <p className="queue-empty muted">La file est vide — lancez un titre.</p>
        ) : (
          <div className="queue-body">
            {current && (
              <section className="queue-section">
                <div className="queue-label">En cours</div>
                <div
                  className="queue-item current"
                  onClick={togglePlay}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') togglePlay();
                  }}
                  title={playing ? 'Mettre en pause' : 'Reprendre'}
                >
                  <span className="queue-thumb">
                    {current.cover ? <img src={current.cover} alt="" /> : Icons.note(16)}
                  </span>
                  <span className="queue-meta">
                    <span className="queue-title">{current.title}</span>
                    <span className="queue-artist">{current.artist}</span>
                  </span>
                  <span className="queue-dur">{playing ? '♪' : 'Pause'}</span>
                </div>
              </section>
            )}

            <section className="queue-section">
              <div className="queue-label">À venir ({upcoming.length})</div>
              {upcoming.length === 0 && (
                <p className="queue-empty muted">
                  Rien après ce titre — utilisez « Lire ensuite » dans le menu d’un titre.
                </p>
              )}
              {upcoming.map((t, i) => {
                const abs = base + i;
                return (
                  <div
                    key={`${t.id}-${abs}`}
                    className={`queue-item ${dragOver === abs ? 'drag-over' : ''} ${dragFrom === abs ? 'dragging' : ''}`}
                    draggable
                    onDragStart={() => setDragFrom(abs)}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOver(abs);
                    }}
                    onDragLeave={() => setDragOver(null)}
                    onDragEnd={() => {
                      setDragFrom(null);
                      setDragOver(null);
                    }}
                    onDrop={() => handleDrop(abs)}
                    onClick={() => playTrack(t)}
                    title="Cliquez pour lire, glissez pour réordonner"
                  >
                    <span className="queue-grip" aria-hidden>
                      {Icons.list(16)}
                    </span>
                    <span className="queue-thumb">
                      {t.cover ? <img src={t.cover} alt="" /> : Icons.note(16)}
                    </span>
                    <span className="queue-meta">
                      <span className="queue-title">{t.title}</span>
                      <span className="queue-artist">{t.artist}</span>
                    </span>
                    <span className="queue-dur">{fmtDuration(t.durationMs)}</span>
                    <button
                      className="icon-btn small queue-remove"
                      title="Retirer de la file"
                      aria-label={`Retirer ${t.title} de la file`}
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFromQueue(abs);
                      }}
                    >
                      {Icons.close(14)}
                    </button>
                  </div>
                );
              })}
            </section>
          </div>
        )}
      </aside>
    </>
  );
}
