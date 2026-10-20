import { useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { gradientOf } from '../lib/format';
import { useDailyMixes } from '../lib/useDailyMixes';
import type { DailyMix } from '../lib/dailyMix';
import { PlayFAB, Shelf, Skeleton } from './Cards';
import Icons from './icons';

/**
 * Pochette d'un Daily Mix : mosaïque des pochettes de ses titres (1 à 4),
 * avec un petit badge Daily Mix. Sans artwork disponible, repli sur le dégradé
 * stable dérivé de la graine et l'icône générative.
 */
export function DailyMixCover({ mix }: { mix: DailyMix }) {
  // Pochettes distinctes (plusieurs titres d'un même album partagent la même
  // URL) : sinon React reçoit deux fois la même clé et la mosaïque se répète.
  const covers: Array<{ id: string; cover: string }> = [];
  const seenCovers = new Set<string>();
  for (const track of mix.tracks) {
    if (!track.cover || seenCovers.has(track.cover)) continue;
    seenCovers.add(track.cover);
    covers.push({ id: track.id, cover: track.cover });
    if (covers.length === 4) break;
  }

  return (
    <div
      className={`mix-cover${covers.length > 0 ? ' has-art' : ''}`}
      style={covers.length > 0 ? undefined : { background: gradientOf(mix.coverSeed) }}
      aria-hidden
    >
      {covers.length > 0 ? (
        <>
          <span className={`mix-cover-grid size-${covers.length}`}>
            {covers.map(({ id, cover }) => (
              <img key={id} src={cover} alt="" loading="lazy" />
            ))}
          </span>
          <span className="mix-cover-badge">{Icons.spark(13)}</span>
        </>
      ) : (
        <span className="mix-cover-icon">{Icons.spark(34)}</span>
      )}
    </div>
  );
}

/** Carte d'un mix (rangée horizontale) : clic sur ▶ lance tout le mix. */
export function DailyMixCard({ mix }: { mix: DailyMix }) {
  const play = useStore((s) => s.play);
  const playing = useStore((s) => s.playing);
  const currentId = useStore((s) =>
    s.index >= 0 && s.index < s.queue.length ? s.queue[s.index].id : null
  );
  const active = playing && mix.tracks.length > 0 && currentId === mix.tracks[0].id;

  return (
    <article className={`card mix-card ${active ? 'active' : ''}`}>
      <div className="card-media">
        <DailyMixCover mix={mix} />
        <PlayFAB playing={active} onClick={() => play(mix.tracks, 0, mix.title)} />
      </div>
      <span className="card-title" title={mix.title}>
        {mix.title}
      </span>
      <span className="card-sub" title={`${mix.reason} · ${mix.tracks.length} titres`}>
        {mix.tracks.length} titre{mix.tracks.length > 1 ? 's' : ''} · {mix.reason}
      </span>
    </article>
  );
}

/** Étagère « Vos Daily Mix » sur l'accueil. */
export default function DailyMixShelf() {
  const navigate = useNavigate();
  const { mixes, loading } = useDailyMixes();
  const playable = mixes.filter((mix) => mix.tracks.length > 0);

  if (!loading && playable.length === 0) return null;

  return (
    <Shelf title="Vos Daily Mix" onMore={() => navigate('/daily')}>
      {loading
        ? Array.from({ length: 3 }).map((_, i) => (
            <div className="card card-skeleton" key={i}>
              <Skeleton />
              <Skeleton className="line" />
              <Skeleton className="line short" />
            </div>
          ))
        : playable.map((mix) => <DailyMixCard key={mix.id} mix={mix} />)}
    </Shelf>
  );
}
