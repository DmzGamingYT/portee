import { Link } from 'react-router-dom';
import { useStore } from '../store';
import { fmtDuration } from '../lib/format';
import type { Track } from '../types';
import { Cover } from './Cards';
import Icons from './icons';

/**
 * Ligne d'un titre façon Spotify : pochette, titre + artiste, album, durée,
 * like, menu d'ajout à une playlist. Un clic sur la ligne lance la lecture.
 */
export default function TrackRow({
  track,
  context,
  index,
  showAlbum = true,
  onRemove,
}: {
  track: Track;
  context: Track[];
  index: number;
  showAlbum?: boolean;
  onRemove?: () => void;
}) {
  const play = useStore((s) => s.play);
  const playTrack = useStore((s) => s.playTrack);
  const currentId = useStore((s) => (s.index >= 0 && s.index < s.queue.length ? s.queue[s.index].id : null));
  const playing = useStore((s) => s.playing);
  const liked = useStore((s) => s.liked);
  const toggleLike = useStore((s) => s.toggleLike);
  const playlists = useStore((s) => s.playlists);
  const addToPlaylist = useStore((s) => s.addToPlaylist);
  const createPlaylist = useStore((s) => s.createPlaylist);

  const active = currentId === track.id;
  const isLiked = liked.some((t) => t.id === track.id);

  function onRowClick() {
    if (!track.preview) return;
    if (context.length > 0) play(context, index < 0 ? 0 : index, context[0]?.album || 'Sélection');
    else playTrack(track);
  }

  return (
    <div
      className={`track-row ${active ? 'active' : ''} ${track.preview ? '' : 'unplayable'}`}
      onClick={onRowClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onRowClick();
        }
      }}
    >
      <span className="row-index" aria-hidden>
        {active && playing ? Icons.pause(14) : active ? Icons.play(14) : ''}
      </span>

      <div className="row-cover">
        <Cover src={track.cover} alt="" />
      </div>

      <div className="row-main">
        <span className="row-title" title={track.title}>
          {track.title}
        </span>
        <span className="row-artist">
          {track.artistId ? (
            <Link to={`/artist/${track.artistId}`} onClick={(e) => e.stopPropagation()}>
              {track.artist}
            </Link>
          ) : (
            track.artist
          )}
        </span>
      </div>

      {showAlbum && (
        <div className="row-album">
          {track.collectionId ? (
            <Link to={`/album/${track.collectionId}`} onClick={(e) => e.stopPropagation()}>
              {track.album}
            </Link>
          ) : (
            track.album
          )}
        </div>
      )}

      <div className="row-actions" onClick={(e) => e.stopPropagation()}>
        <button
          className={`icon-btn small ${isLiked ? 'accent' : ''}`}
          onClick={() => toggleLike(track)}
          title={isLiked ? 'Retirer des likés' : 'Liker'}
          aria-label="Like"
        >
          {Icons.heart(isLiked)}
        </button>

        <details className="menu">
          <summary className="icon-btn small" title="Ajouter à une playlist" aria-label="Menu du titre">
            {Icons.plus(16)}
          </summary>
          <div className="menu-body" onClick={(e) => e.stopPropagation()}>
            <button
              className="menu-item"
              onClick={() => {
                const id = createPlaylist(`Playlist ${playlists.length + 1}`);
                addToPlaylist(id, track);
              }}
            >
              {Icons.plus(14)} Nouvelle playlist
            </button>
            {playlists.length > 0 && <div className="menu-sep" />}
            {playlists.map((p) => (
              <button key={p.id} className="menu-item" onClick={() => addToPlaylist(p.id, track)}>
                {Icons.note(14)} {p.name}
              </button>
            ))}
            {onRemove && (
              <>
                <div className="menu-sep" />
                <button className="menu-item danger" onClick={onRemove}>
                  {Icons.trash(14)} Retirer de la playlist
                </button>
              </>
            )}
          </div>
        </details>

        <span className="row-duration">{fmtDuration(track.durationMs)}</span>
      </div>
    </div>
  );
}
