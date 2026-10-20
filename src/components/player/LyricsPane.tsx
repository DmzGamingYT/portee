/**
 * Paroles du titre en cours, sous la pochette de la vue grand format.
 *
 * - Paroles horodatées (LRC) : la ligne courante s'allume et la liste défile
 *   pour la garder au centre. Un clic sur une ligne déplace la lecture.
 * - La synchronisation n'est proposée que pour un fichier **local complet** :
 *   les extraits de 30 s commencent au milieu du morceau, les horodatages LRC
 *   ne correspondraient donc à rien. Dans ce cas les paroles restent lisibles,
 *   simplement sans surlignage — mieux vaut ça qu'un défilement faux.
 * - Paroles sans horodatage : affichage en texte, défilable.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Track } from '../../types';
import { fetchLyrics, type Lyrics } from '../../api/lyrics';
import { activeLyricIndex } from '../../lib/lyrics';
import { useStore } from '../../store';
import Icons from '../icons';

type Status = 'loading' | 'ready' | 'error';

export default function LyricsPane({
  track,
  position,
  duration,
}: {
  track: Track;
  position: number;
  /** durée réellement lue (30 s pour un extrait, davantage pour un fichier local) */
  duration: number;
}) {
  const [data, setData] = useState<Lyrics | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [nonce, setNonce] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const seek = useStore((s) => s.seek);

  // Les horodatages ne collent à la lecture que sur un fichier entier : un
  // extrait de 30 s démarre au milieu du morceau, pas à 0:00.
  const aligned = Boolean(track.localId) || duration > 60;

  useEffect(() => {
    const ctrl = new AbortController();
    let alive = true;
    setStatus('loading');
    setData(null);
    lineRefs.current = [];

    fetchLyrics(track, ctrl.signal)
      .then((result) => {
        if (!alive) return;
        setData(result);
        setStatus('ready');
      })
      .catch(() => {
        if (!alive || ctrl.signal.aborted) return;
        setStatus('error');
      });

    return () => {
      alive = false;
      ctrl.abort();
    };
    // `track.id` suffit : titre/artiste/album ne changent pas pour un même id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track.id, nonce]);

  const lines = data?.kind === 'synced' ? data.lines : null;
  const active = aligned && lines ? activeLyricIndex(lines, position) : -1;

  // Centrage de la ligne courante, sans jamais faire défiler la page.
  useEffect(() => {
    if (active < 0) return;
    const box = boxRef.current;
    const line = lineRefs.current[active];
    if (!box || !line) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const top = line.offsetTop - box.clientHeight / 2 + line.clientHeight / 2;
    box.scrollTo({ top: Math.max(0, top), behavior: reduced ? 'auto' : 'smooth' });
  }, [active]);

  const rendered = useMemo(() => {
    if (!lines) return null;
    return lines.map((line, i) => (
      <span
        key={`${line.at}-${i}`}
        ref={(el) => {
          lineRefs.current[i] = el;
        }}
        className={`lyrics-line ${i === active ? 'active' : ''} ${i < active ? 'past' : ''}`}
        onClick={aligned ? () => seek(line.at) : undefined}
        role={aligned ? 'button' : undefined}
        tabIndex={aligned ? 0 : undefined}
        onKeyDown={
          aligned
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  seek(line.at);
                }
              }
            : undefined
        }
        title={aligned ? 'Aller à ce passage' : undefined}
      >
        {line.text}
      </span>
    ));
  }, [lines, active, aligned, seek]);

  return (
    <section className="lyrics" aria-label="Paroles">
      <div className="lyrics-head">
        <span className="queue-label">Paroles</span>
        {lines && !aligned && <span className="lyrics-hint">extrait 30 s — sans synchro</span>}
      </div>

      {status === 'loading' && (
        <div className="lyrics-box" aria-busy="true">
          <span className="skeleton lyrics-skeleton" />
          <span className="skeleton lyrics-skeleton short" />
          <span className="skeleton lyrics-skeleton" />
        </div>
      )}

      {status === 'error' && (
        <div className="lyrics-box lyrics-message">
          <span>Paroles indisponibles — vérifiez votre connexion.</span>
          <button className="link-btn" onClick={() => setNonce((n) => n + 1)}>
            Réessayer
          </button>
        </div>
      )}

      {status === 'ready' && data?.kind === 'none' && (
        <div className="lyrics-box lyrics-message">
          <span>Aucune parole trouvée pour ce titre.</span>
        </div>
      )}

      {status === 'ready' && data?.kind === 'instrumental' && (
        <div className="lyrics-box lyrics-message">
          <span>{Icons.disc(18)} Morceau instrumental.</span>
        </div>
      )}

      {status === 'ready' && data?.kind === 'plain' && (
        <div className="lyrics-box">
          <p className="lyrics-plain">{data.text}</p>
        </div>
      )}

      {status === 'ready' && lines && (
        <div className="lyrics-box" ref={boxRef} tabIndex={0} aria-label="Paroles défilantes">
          {rendered}
        </div>
      )}
    </section>
  );
}
