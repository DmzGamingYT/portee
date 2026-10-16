import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { artistAlbums, artistTopSongs } from '../api/itunes';
import type { Album, Track } from '../types';
import { useStore } from '../store';
import TrackRow from '../components/TrackRow';
import { AlbumCard, SectionTitle, Shelf } from '../components/Cards';
import { gradientOf } from '../lib/format';
import Icons from '../components/icons';

/** Page artiste : titre Principal, musiques populaires, albums. */
export default function ArtistDetail() {
  const { id } = useParams<{ id: string }>();
  const artistId = Number(id);
  const [name, setName] = useState<string>('');
  const [genre, setGenre] = useState<string>('');
  const [top, setTop] = useState<Track[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const play = useStore((s) => s.play);
  const followed = useStore((s) => s.followed);
  const toggleFollow = useStore((s) => s.toggleFollow);

  useEffect(() => {
    if (!Number.isFinite(artistId)) return;
    let dead = false;
    setLoading(true);
    setError(false);
    Promise.all([artistTopSongs(artistId, 25), artistAlbums(artistId, 18)])
      .then(([tracks, als]) => {
        if (dead) return;
        setTop(tracks);
        setAlbums(als);
        const n = tracks[0]?.artist ?? '';
        setName(n);
        setGenre(tracks[0]?.genre ?? '');
      })
      .catch(() => !dead && setError(true))
      .finally(() => !dead && setLoading(false));
    return () => {
      dead = true;
    };
  }, [artistId]);

  if (!Number.isFinite(artistId)) {
    return <div className="empty-note">Artiste inconnu.</div>;
  }
  if (error) {
    return <div className="empty-note">Impossible de charger cet artiste — réessayez plus tard.</div>;
  }
  if (loading) {
    return (
      <div className="shelves-loading">
        <div className="skeleton banner-skel" />
        <div className="skeleton-grid">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="skeleton line" />
          ))}
        </div>
      </div>
    );
  }

  const isFollowed = followed.includes(String(artistId));

  return (
    <div className="artist-page">
      <div className="detail-head banner" style={{ background: gradientOf(String(artistId)) }}>
        <div className="banner-inner">
          <span className="detail-kind">Artiste</span>
          <h1 className="detail-title big">{name || 'Métadonnées indisponibles'}</h1>
          {genre && <div className="detail-meta muted">{genre}</div>}
          <div className="detail-actions">
            <button className="btn accent" disabled={top.length === 0} onClick={() => play(top, 0, name)}>
              {Icons.play(18)} Lecture
            </button>
            <button
              className={`btn ghost ${isFollowed ? 'following' : ''}`}
              onClick={() => toggleFollow(String(artistId))}
            >
              {isFollowed ? 'Abonné ✓' : "S'abonner"}
            </button>
          </div>
        </div>
      </div>

      {top.length > 0 && (
        <section className="section">
          <SectionTitle>Musiques populaires</SectionTitle>
          <div className="track-list">
            {top.map((t, i) => (
              <TrackRow key={t.id} track={t} context={top} index={i} />
            ))}
          </div>
        </section>
      )}

      {albums.length > 0 && (
        <Shelf title="Albums">
          {albums.map((al) => (
            <AlbumCard key={al.id} album={al} />
          ))}
        </Shelf>
      )}

      {top.length === 0 && albums.length === 0 && (
        <div className="empty-note">Aucune donnée trouvée pour cet artiste.</div>
      )}

      {top[0]?.artistId && (
        <p className="muted more-hint">
          <Link to={`/search?q=${encodeURIComponent(name)}`}>Tout afficher</Link>
        </p>
      )}
    </div>
  );
}
