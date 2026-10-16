import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { albumTracks } from '../api/itunes';
import { useStore } from '../store';
import { fmtTotal } from '../lib/format';
import TrackRow from '../components/TrackRow';
import { Cover } from '../components/Cards';
import { gradientOf } from '../lib/format';
import Icons from '../components/icons';
import type { Track } from '../types';

/** Page album : pochette + liste de pistes réelles (API publique). */
export default function AlbumDetail() {
  const { id } = useParams<{ id: string }>();
  const albumId = Number(id);
  const [tracks, setTracks] = useState<Track[] | null>(null);
  const [error, setError] = useState(false);
  const play = useStore((s) => s.play);

  useEffect(() => {
    if (!Number.isFinite(albumId)) return;
    let dead = false;
    setTracks(null);
    setError(false);
    albumTracks(albumId)
      .then((list) => {
        if (!dead) setTracks(list);
      })
      .catch(() => {
        if (!dead) setError(true);
      });
    return () => {
      dead = true;
    };
  }, [albumId]);

  if (!Number.isFinite(albumId)) return <div className="empty-note">Album inconnu.</div>;
  if (error) return <div className="empty-note">Album inaccessible — vérifiez votre connexion puis réessayez.</div>;

  if (!tracks) {
    return (
      <div className="track-list">
        {Array.from({ length: 8 }).map((_, i) => (
          <SkeletonRow key={i} />
        ))}
      </div>
    );
  }

  if (tracks.length === 0) return <div className="empty-note">Aucune piste trouvée pour cet album.</div>;

  const first = tracks[0];
  const total = tracks.reduce((acc, t) => acc + (t.durationMs ?? 0), 0);

  return (
    <div className="detail-page">
      <div className="detail-head" style={{ background: gradientOf(String(albumId)) }}>
        <Cover src={first.cover} alt={first.album} className="detail-cover" />
        <div>
          <span className="detail-kind">Album</span>
          <h1 className="detail-title">{first.album}</h1>
          <div className="detail-meta">
            {first.artistId ? (
              <Link className="text-link" to={`/artist/${first.artistId}`}>
                {first.artist}
              </Link>
            ) : (
              first.artist
            )}{' '}
            · {tracks.length} titre{tracks.length > 1 ? 's' : ''}
            {total > 0 ? ` · ${fmtTotal(total)}` : ''}
          </div>
          <div className="detail-actions">
            <button className="btn accent" onClick={() => play(tracks, 0, first.album)}>
              {Icons.play(18)} Lecture
            </button>
          </div>
        </div>
      </div>

      <div className="track-list">
        {tracks.map((t, i) => (
          <TrackRow key={t.id} track={t} context={tracks} index={i} />
        ))}
      </div>
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="track-row" aria-hidden>
      <span className="row-index" />
      <div className="skeleton" style={{ width: 40, height: 40 }} />
      <div className="skeleton line" style={{ margin: 0 }} />
      <div className="skeleton line" style={{ margin: 0 }} />
      <div className="skeleton line" style={{ width: 40, margin: 0 }} />
    </div>
  );
}
