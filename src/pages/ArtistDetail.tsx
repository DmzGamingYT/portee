import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { artistAlbums as itArtistAlbums, artistTopSongs as itArtistTopSongs } from '../api/itunes';
import {
  artistAlbums as spArtistAlbums,
  artistDetails as spArtistDetails,
  artistTopTracks as spArtistTopTracks,
} from '../api/spotify';
import { withItunesPreviews } from '../api/search';
import { isPlayable } from '../lib/tracks';
import type { Album, Artist, Track } from '../types';
import { useStore } from '../store';
import TrackRow from '../components/TrackRow';
import { AlbumCard, SectionTitle, Shelf } from '../components/Cards';
import { gradientOf } from '../lib/format';
import Icons from '../components/icons';

/** Page artiste : titres populaires + albums (iTunes ou Spotify). */
export default function ArtistDetail() {
  const { id } = useParams<{ id: string }>();
  const isSpotify = id !== undefined && !/^\d+$/.test(id);
  const [artist, setArtist] = useState<Artist | null>(null);
  const [top, setTop] = useState<Track[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const play = useStore((s) => s.play);
  const followed = useStore((s) => s.followed);
  const toggleFollow = useStore((s) => s.toggleFollow);

  useEffect(() => {
    if (!id) return;
    const ctrl = new AbortController();
    let dead = false;
    setLoading(true);
    setError(false);

    (async () => {
      if (isSpotify) {
        const results = await Promise.allSettled([
          spArtistDetails(id, ctrl.signal),
          spArtistTopTracks(id, ctrl.signal),
          spArtistAlbums(id, ctrl.signal),
        ]);
        if (dead || ctrl.signal.aborted) return;

        const details = results[0].status === 'fulfilled' ? results[0].value : null;
        let tracks = results[1].status === 'fulfilled' ? results[1].value : [];
        const list = results[2].status === 'fulfilled' ? results[2].value : [];

        // Extraits iTunes quand Spotify n'en fournit pas.
        if (tracks.length > 0 && tracks.some((t) => !t.preview)) {
          try {
            tracks = await withItunesPreviews(tracks, details?.name ?? id, ctrl.signal);
          } catch {
            if (dead || ctrl.signal.aborted) return;
          }
        }
        if (dead || ctrl.signal.aborted) return;

        setArtist(details);
        setTop(tracks);
        setAlbums(list);
        setError(!details && tracks.length === 0 && list.length === 0);
      } else {
        const artistId = Number(id);
        if (!Number.isFinite(artistId) || artistId <= 0) {
          setLoading(false);
          return;
        }
        const results = await Promise.allSettled([
          itArtistTopSongs(artistId, 25, ctrl.signal),
          itArtistAlbums(artistId, 18, ctrl.signal),
        ]);
        if (dead || ctrl.signal.aborted) return;

        const tracks = results[0].status === 'fulfilled' ? results[0].value : [];
        const list = results[1].status === 'fulfilled' ? results[1].value : [];
        setTop(tracks);
        setAlbums(list);
        // Le nom d'artiste d'un album est plus fiable que celui d'un titre
        // (un titre peut lister « Daft Punk, Pharrell Williams… »).
        // iTunes ne fournit pas de photo d'artiste : la pochette du premier
        // album fait un visuel de bannière crédible (et reste une vraie image
        // de l'artiste, pas un avatar génériqué).
        setArtist({
          id: String(artistId),
          name: list[0]?.artist || tracks[0]?.artist || '',
          genre: list[0]?.genre || tracks[0]?.genre || undefined,
          cover: list[0]?.cover ?? tracks[0]?.cover,
        });
        setError(tracks.length === 0 && list.length === 0);
      }
    })().catch(() => {
      if (!dead && !ctrl.signal.aborted) setError(true);
    }).finally(() => {
      if (!dead && !ctrl.signal.aborted) setLoading(false);
    });

    return () => {
      dead = true;
      ctrl.abort();
    };
  }, [id, isSpotify]);

  if (!id) return <div className="empty-note">Artiste inconnu.</div>;
  if (!isSpotify && (!Number.isFinite(Number(id)) || Number(id) <= 0)) {
    return <div className="empty-note">Artiste inconnu.</div>;
  }
  if (error) {
    return (
      <div className="empty-note">
        Impossible de charger cet artiste — vérifiez votre connexion puis{' '}
        <Link className="text-link" to="/search">réessayez via la recherche</Link>.
      </div>
    );
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

  const name = artist?.name || top[0]?.artist || 'Métadonnées indisponibles';
  const genre = artist?.genre;
  const seed = id;
  const isFollowed = followed.some((a) => a.id === String(id));
  const cover = artist?.cover;

  // Objet complet conservé dans la bibliothèque (nom, photo, lien).
  const followTarget: Artist = artist ?? {
    id: String(id),
    name,
    cover,
    spotifyId: isSpotify ? String(id) : undefined,
  };

  return (
    <div className="artist-page">
      <div className="detail-head banner" style={{ background: gradientOf(seed) }}>
        {cover && <img className="artist-photo" src={cover} alt="" />}
        <div className="banner-inner">
          <span className="detail-kind">Artiste</span>
          <h1 className="detail-title big">{name}</h1>
          {genre && <div className="detail-meta muted">{genre}</div>}
          <div className="detail-actions">
            <button
              className="btn accent"
              disabled={top.filter(isPlayable).length === 0}
              onClick={() => play(top, 0, name)}
            >
              {Icons.play(18)} Lecture
            </button>
            <button
              className={`btn ghost ${isFollowed ? 'following' : ''}`}
              onClick={() => toggleFollow(followTarget)}
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
              <TrackRow key={t.id} track={t} context={top} index={i} contextName={name} />
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

      {name && (
        <p className="muted more-hint">
          <Link to={`/search?q=${encodeURIComponent(name)}`}>Tout afficher</Link>
        </p>
      )}
    </div>
  );
}
