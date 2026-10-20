import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { albumTracks as itAlbumTracks } from '../api/itunes';
import { albumTracks as spAlbumTracks, albumDetails as spAlbum } from '../api/spotify';
import { withItunesPreviews } from '../api/search';
import { useStore } from '../store';
import { fmtTotal } from '../lib/format';
import { isPlayable } from '../lib/tracks';
import TrackRow from '../components/TrackRow';
import { Cover } from '../components/Cards';
import { gradientOf } from '../lib/format';
import Icons from '../components/icons';
import type { Track, Album } from '../types';

/** Page album : pochette + liste de pistes réelles (iTunes ou Spotify). */
export default function AlbumDetail() {
  const { id } = useParams<{ id: string }>();
  const isSpotify = id !== undefined && !/^\d+$/.test(id);
  const [tracks, setTracks] = useState<Track[] | null>(null);
  const [album, setAlbum] = useState<Album | null>(null);
  const [error, setError] = useState(false);
  const play = useStore((s) => s.play);

  useEffect(() => {
    if (!id) return;
    const ctrl = new AbortController();
    let dead = false;
    setTracks(null);
    setAlbum(null);
    setError(false);

    (async () => {
      if (isSpotify) {
        const [albumResult, tracksResult] = await Promise.allSettled([
          spAlbum(id, ctrl.signal),
          spAlbumTracks(id, ctrl.signal),
        ]);
        if (dead || ctrl.signal.aborted) return;

        const details = albumResult.status === 'fulfilled' ? albumResult.value : null;
        let list = tracksResult.status === 'fulfilled' ? tracksResult.value : [];

        if (!details && list.length === 0) {
          setError(true);
          setTracks([]);
          return;
        }

        // Les pistes d'un album Spotify n'embarquent ni la pochette ni le nom
        // de l'album : on les complète avec les détails de l'album.
        if (details) {
          list = list.map((t) => ({
            ...t,
            album: t.album || details.title,
            cover: t.cover || details.cover,
            spotifyAlbumId: t.spotifyAlbumId ?? details.spotifyId,
          }));
        }

        // Extraits : Spotify ne les fournit plus aux nouvelles apps.
        if (list.length > 0 && list.some((t) => !t.preview)) {
          const term = `${details?.artist ?? list[0]?.artist ?? ''} ${details?.title ?? ''}`.trim();
          try {
            list = await withItunesPreviews(list, term, ctrl.signal);
          } catch {
            if (ctrl.signal.aborted || dead) return;
            // on garde les métadonnées, même sans extrait
          }
        }

        if (dead || ctrl.signal.aborted) return;
        setAlbum(details);
        setTracks(list);
      } else {
        const albumId = Number(id);
        if (!Number.isFinite(albumId) || albumId <= 0) {
          setError(true);
          return;
        }
        try {
          const list = await itAlbumTracks(albumId, ctrl.signal);
          if (dead || ctrl.signal.aborted) return;
          setTracks(list);
        } catch {
          if (dead || ctrl.signal.aborted) return;
          setError(true);
        }
      }
    })();

    return () => {
      dead = true;
      ctrl.abort();
    };
  }, [id, isSpotify]);

  if (!id || (!isSpotify && (!Number.isFinite(Number(id)) || Number(id) <= 0))) {
    return (
      <div className="empty-note">
        <p>Album inconnu.</p>
        <Link className="btn" to="/search">
          {Icons.search(16)} Chercher un album
        </Link>
      </div>
    );
  }
  if (error) {
    return (
      <div className="empty-note">
        <p>Album inaccessible — vérifiez votre connexion puis réessayez.</p>
        <Link className="btn" to="/search">
          {Icons.search(16)} Retour à la recherche
        </Link>
      </div>
    );
  }

  if (!tracks) {
    return (
      <div className="track-list">
        {Array.from({ length: 8 }).map((_, i) => (
          <SkeletonRow key={i} />
        ))}
      </div>
    );
  }

  if (tracks.length === 0) {
    return (
      <div className="empty-note">
        <p>Aucune piste trouvée pour cet album.</p>
        <p className="muted">
          Le catalogue ne renvoie rien pour cet identifiant — il a peut-être été retiré.
        </p>
        <Link className="btn" to="/search">
          {Icons.search(16)} Chercher un autre album
        </Link>
      </div>
    );
  }

  const first = tracks[0];
  const total = tracks.reduce((acc, t) => acc + (t.durationMs ?? 0), 0);
  const playable = tracks.filter(isPlayable);
  const title = isSpotify && album ? album.title : first.album;
  const artist = isSpotify && album ? album.artist : first.artist;
  const artistId = isSpotify && album ? album.spotifyArtistId ?? album.artistId : first.artistId;
  const cover = isSpotify && album ? album.cover : first.cover;
  const seed = isSpotify ? id : String(first.collectionId ?? id);

  return (
    <div className="detail-page">
      <div className="detail-head" style={{ background: gradientOf(seed) }}>
        <Cover src={cover} alt={title} className="detail-cover" />
        <div>
          <span className="detail-kind">Album</span>
          <h1 className="detail-title">{title}</h1>
          <div className="detail-meta">
            {artistId ? (
              <Link className="text-link" to={`/artist/${artistId}`}>
                {artist}
              </Link>
            ) : (
              artist
            )}{' '}
            · {tracks.length} titre{tracks.length > 1 ? 's' : ''}
            {total > 0 ? ` · ${fmtTotal(total)}` : ''}
            {tracks.some((t) => t.preview && !t.localId) ? ' · extraits 30 s' : ''}
            {playable.length < tracks.length ? ` · ${playable.length} lisible${playable.length > 1 ? 's' : ''}` : ''}
          </div>
          <div className="detail-actions">
            <button
              className="btn accent"
              disabled={playable.length === 0}
              onClick={() => play(tracks, 0, title)}
            >
              {Icons.play(18)} Lecture
            </button>
          </div>
        </div>
      </div>

      <div className="track-list">
        {tracks.map((t, i) => (
          <TrackRow key={t.id} track={t} context={tracks} index={i} contextName={title} />
        ))}
      </div>
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="track-row" aria-hidden>
      <span className="row-play" />
      <div className="skeleton" style={{ width: 40, height: 40 }} />
      <div className="skeleton line" style={{ margin: 0 }} />
      <div className="skeleton line" style={{ margin: 0 }} />
      <div className="skeleton line" style={{ width: 40, margin: 0 }} />
    </div>
  );
}
