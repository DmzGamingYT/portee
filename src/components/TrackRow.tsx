import { Link } from 'react-router-dom';
import { useStore } from '../store';
import { fmtDuration } from '../lib/format';
import { useHoverPreview } from '../lib/useHoverPreview';
import { isPlayable } from '../lib/tracks';
import type { Track } from '../types';
import { Cover } from './Cards';
import Icons from './icons';

/**
 * Ligne d'un titre façon Spotify : pochette, titre + artiste, album, durée,
 * like, menu (playlists, lire ensuite, file d'attente). Un clic sur la ligne
 * lance la lecture dans son contexte.
 */
export default function TrackRow({
  track,
  context,
  index,
  showAlbum = true,
  onRemove,
  removeLabel = 'Retirer de la playlist',
  contextName,
}: {
  track: Track;
  context: Track[];
  index: number;
  showAlbum?: boolean;
  onRemove?: () => void;
  /** libellé de l'action de retrait (playlist, bibliothèque locale…) */
  removeLabel?: string;
  /** nom du contexte affiché dans la barre de lecture (« Album X »…) */
  contextName?: string;
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
  const enqueue = useStore((s) => s.enqueue);

  const hoverEnabled = useStore((s) => s.hoverPreview);
  const hover = useHoverPreview(track, hoverEnabled);

  const active = currentId === track.id;
  const isLiked = liked.some((t) => t.id === track.id);

  function onRowClick() {
    const state = useStore.getState();
    if (state.queue[state.index]?.id === track.id) {
      // Re-cliquer sur le titre en cours = pause / reprise, pas restart.
      state.togglePlay();
      return;
    }
    if (!isPlayable(track)) {
      useStore.setState({ audioError: `« ${track.title} » n'a pas de fichier audio lisible.` });
      return;
    }
    if (context.length > 0) {
      play(context, Math.max(0, index), contextName ?? (track.album || 'Sélection'));
    } else {
      playTrack(track);
    }
  }

  function closeMenu() {
    // Referme le <details> après une action, sans fermer les autres menus.
    document.querySelectorAll('details.menu[open]').forEach((el) => el.removeAttribute('open'));
  }

  return (
    <div
      className={`track-row ${active ? 'active' : ''} ${isPlayable(track) ? '' : 'unplayable'} ${hover.hovering ? 'hovering' : ''}`}
      onClick={onRowClick}
      role="button"
      tabIndex={0}
      aria-label={`Lire ${track.title} de ${track.artist}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onRowClick();
        }
      }}
      {...hover.bind()}
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
          {track.spotifyArtistId || track.artistId ? (
            <Link to={`/artist/${track.spotifyArtistId ?? track.artistId}`} onClick={(e) => e.stopPropagation()}>
              {track.artist}
            </Link>
          ) : (
            track.artist
          )}
        </span>
      </div>

      {showAlbum && (
        <div className="row-album">
          {track.spotifyAlbumId || track.collectionId ? (
            <Link to={`/album/${track.spotifyAlbumId ?? track.collectionId}`} onClick={(e) => e.stopPropagation()}>
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

        <details
          className="menu"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <summary className="icon-btn small" title="Actions du titre" aria-label="Actions du titre">
            {Icons.plus(16)}
          </summary>
          <div
            className="menu-body"
            onClick={(e) => {
              e.stopPropagation();
              closeMenu();
            }}
          >
            <button
              className="menu-item"
              disabled={!isPlayable(track)}
              onClick={() => enqueue(track, 'next')}
            >
              {Icons.next(14)} Lire ensuite
            </button>
            <button
              className="menu-item"
              disabled={!isPlayable(track)}
              onClick={() => enqueue(track, 'end')}
            >
              {Icons.queue(14)} Ajouter à la file
            </button>
            <div className="menu-sep" />
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
                  {Icons.trash(14)} {removeLabel}
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
