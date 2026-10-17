import { Link } from 'react-router-dom';
import { useStore } from '../store';
import { fmtTotal, gradientOf } from '../lib/format';
import { isPlayable } from '../lib/tracks';
import TrackRow from '../components/TrackRow';
import Icons from '../components/icons';

/** Historique d'écoute : titres réellement lancés, du plus récent au plus ancien. */
export default function History() {
  const history = useStore((s) => s.history);
  const clearHistory = useStore((s) => s.clearHistory);
  const play = useStore((s) => s.play);

  const playable = history.filter(isPlayable);
  const total = history.reduce((acc, t) => acc + (t.durationMs ?? 0), 0);

  return (
    <div className="detail-page">
      <div className="detail-head" style={{ background: gradientOf('historique') }}>
        <span className="detail-cover detail-cover-empty">{Icons.clock(64)}</span>
        <div>
          <span className="detail-kind">Activité</span>
          <h1 className="detail-title">Historique d’écoute</h1>
          <div className="detail-meta">
            {history.length} titre{history.length > 1 ? 's' : ''}
            {total > 0 ? ` · ${fmtTotal(total)}` : ''}
          </div>
          <div className="detail-actions">
            <button
              className="btn accent"
              disabled={playable.length === 0}
              onClick={() => play(playable, 0, 'Historique')}
            >
              {Icons.play(18)} Tout lire
            </button>
            {history.length > 0 && (
              <button
                className="btn ghost"
                onClick={() => {
                  if (window.confirm('Effacer tout l’historique d’écoute ?')) clearHistory();
                }}
              >
                {Icons.trash(18)} Effacer
              </button>
            )}
          </div>
        </div>
      </div>

      {history.length === 0 ? (
        <div className="empty-note">
          Aucun titre écouté pour l’instant.{' '}
          <Link className="text-link" to="/search">Lancer une recherche</Link>.
        </div>
      ) : (
        <div className="track-list">
          {history.map((t, i) => (
            <TrackRow
              key={t.id}
              track={t}
              context={history}
              index={i}
              contextName="Historique"
            />
          ))}
        </div>
      )}
    </div>
  );
}
