import { Link } from 'react-router-dom';
import { useStore } from '../store';
import { fmtTotal } from '../lib/format';
import { totalDurationMs, type DailyMix } from '../lib/dailyMix';
import { useDailyMixes } from '../lib/useDailyMixes';
import { DailyMixCover } from '../components/DailyMixShelf';
import TrackRow from '../components/TrackRow';
import { Skeleton } from '../components/Cards';
import Icons from '../components/icons';

/**
 * Page des Daily Mix : sélections personnelles calculées localement à partir
 * des likes, de l'historique, des playlists et des genres. Stable pour la
 * journée, recalculable à la demande.
 */
export default function DailyMixPage() {
  const { mixes, loading, error, ready, refresh, day } = useDailyMixes();

  return (
    <div className="daily-page">
      <div className="library-head">
        <div>
          <h1>Vos Daily Mix</h1>
          <p className="muted daily-sub">
            Recalculés chaque jour à partir de vos likes, de votre historique et de vos genres,
            entièrement dans ce navigateur. Mix du {formatDay(day)}.
          </p>
        </div>
        <button className="btn ghost" onClick={refresh} disabled={loading}>
          {Icons.spark(16)} Recalculer
        </button>
      </div>

      {loading && <MixSkeleton />}

      {!loading && error && (
        <div className="empty-note">
          <p>{error}</p>
          <p className="muted">
            Vérifiez votre connexion au catalogue, puis réessayez. Vos données locales, elles,
            restent intactes.
          </p>
          <button className="btn accent" onClick={refresh}>
            {Icons.repeatAll(16)} Réessayer
          </button>
        </div>
      )}

      {!loading && !error && !ready && (
        <div className="empty-note">
          <p>Aucun mix n’a pu être rempli pour le moment.</p>
          <p className="muted">
            Likez quelques titres, écoutez de la musique ou suivez un artiste : vos mix
            s’enrichiront dès le prochain chargement.
          </p>
          <Link className="btn accent" to="/search">
            {Icons.search(16)} Explorer le catalogue
          </Link>
        </div>
      )}

      {!loading &&
        !error &&
        mixes.map((mix) => <MixSection key={mix.id} mix={mix} />)}
    </div>
  );
}

function MixSection({ mix }: { mix: DailyMix }) {
  const play = useStore((s) => s.play);
  const total = totalDurationMs(mix.tracks);
  const headingId = `mix-${mix.id}`;

  return (
    <section className="daily-mix" aria-labelledby={headingId}>
      <header className="daily-mix-head">
        <DailyMixCover mix={mix} />
        <div className="daily-mix-copy">
          <span className="daily-kind">Daily Mix · {mix.reason}</span>
          <h2 id={headingId}>{mix.title}</h2>
          <p className="muted daily-mix-meta">
            {mix.tracks.length} titre{mix.tracks.length > 1 ? 's' : ''}
            {total > 0 ? ` · ${fmtTotal(total)}` : ''} · même sélection toute la journée
          </p>
          <div className="daily-mix-actions">
            <button
              className="btn accent"
              disabled={mix.tracks.length === 0}
              onClick={() => play(mix.tracks, 0, mix.title)}
            >
              {Icons.play(16)} Lire tout
            </button>
          </div>
        </div>
      </header>

      {mix.tracks.length > 0 ? (
        <div className="track-list">
          {mix.tracks.map((track, index) => (
            <TrackRow
              key={track.id}
              track={track}
              context={mix.tracks}
              index={index}
              contextName={mix.title}
            />
          ))}
        </div>
      ) : (
        <p className="muted empty-inline">
          {mix.failed
            ? 'Sélection indisponible pour le moment.'
            : 'Aucun titre trouvé pour ce mix aujourd’hui.'}
        </p>
      )}
    </section>
  );
}

function MixSkeleton() {
  return (
    <div className="daily-mix">
      <div className="daily-mix-head">
        <Skeleton className="daily-cover-skel" />
        <div className="daily-mix-copy">
          <Skeleton className="line short" />
          <Skeleton className="line" />
          <Skeleton className="line short" />
        </div>
      </div>
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton className="line" key={i} />
      ))}
    </div>
  );
}

/** « vendredi 17 octobre 2026 » depuis une clé AAAA-MM-JJ. */
function formatDay(day: string): string {
  const [year, month, date] = day.split('-').map(Number);
  if (!year || !month || !date) return day;
  try {
    return new Date(year, month - 1, date).toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  } catch {
    return day;
  }
}
