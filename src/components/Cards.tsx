import type { MouseEvent, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store';
import type { Album, Artist, Track } from '../types';
import Icons from './icons';

/* ------------------------------- primitives -------------------------------- */

/** Pochette avec repli « ♪ » quand l'API ne fournit pas d'image. */
export function Cover({
  src,
  alt,
  className = '',
}: {
  src?: string;
  alt?: string;
  className?: string;
}) {
  if (src) {
    return <img className={`cover ${className}`} src={src} alt={alt ?? ''} loading="lazy" />;
  }
  return (
    <div className={`cover cover-empty ${className}`} role="img" aria-label={alt ?? 'Pochette indisponible'}>
      {Icons.note(28)}
    </div>
  );
}

/** Squelette de chargement. */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden />;
}

export function SectionTitle({ children, onMore }: { children: ReactNode; onMore?: () => void }) {
  return (
    <div className="section-title">
      <h2>{children}</h2>
      {onMore && (
        <button className="link-btn" onClick={onMore}>
          Tout afficher
        </button>
      )}
    </div>
  );
}

/** Rangée horizontale défilante (étagère). */
export function Shelf({
  title,
  onMore,
  children,
}: {
  title?: string;
  onMore?: () => void;
  children: ReactNode;
}) {
  return (
    <section className="shelf">
      {title && <SectionTitle onMore={onMore}>{title}</SectionTitle>}
      <div className="shelf-row">{children}</div>
    </section>
  );
}

/* --------------------------- puce de lecture -------------------------------- */

export function PlayFAB({
  onClick,
  playing,
}: {
  onClick: () => void;
  playing?: boolean;
}) {
  return (
    <button
      className="play-fab"
      onClick={(e: MouseEvent) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={playing ? 'Mettre en pause' : 'Lancer la lecture'}
    >
      {playing ? Icons.pause(20) : Icons.play(20)}
    </button>
  );
}

/* ---------------------------------- cartes ---------------------------------- */

export function TrackCard({
  track,
  context,
  index,
  contextName,
}: {
  track: Track;
  context: Track[];
  index: number;
  contextName?: string;
}) {
  const play = useStore((s) => s.play);
  const currentId = useStore((s) => (s.index >= 0 && s.index < s.queue.length ? s.queue[s.index].id : null));
  const playing = useStore((s) => s.playing);
  const active = currentId === track.id && playing;

  return (
    <article className={`card track-card ${active ? 'active' : ''}`}>
      <div className="card-media">
        <Cover src={track.cover} alt={track.album} />
        <PlayFAB
          playing={active}
          onClick={() => play(context, index, contextName ?? (context[0]?.album || 'Accueil'))}
        />
      </div>
      <Link
        className="card-title"
        to={(track.spotifyAlbumId ?? track.collectionId) ? `/album/${track.spotifyAlbumId ?? track.collectionId}` : '#'}
        title={track.title}
        onClick={(e) => {
          if (!track.spotifyAlbumId && !track.collectionId) e.preventDefault();
        }}
      >
        {track.title}
      </Link>
      <span className="card-sub">
        {track.spotifyArtistId || track.artistId ? (
          <Link to={`/artist/${track.spotifyArtistId ?? track.artistId}`}>{track.artist}</Link>
        ) : (
          track.artist
        )}
      </span>
    </article>
  );
}

export function AlbumCard({ album }: { album: Album }) {
  return (
    <Link className="card album-card" to={`/album/${album.id}`}>
      <div className="card-media">
        <Cover src={album.cover} alt={album.title} />
      </div>
      <span className="card-title" title={album.title}>
        {album.title}
      </span>
      <span className="card-sub">
        {album.year ? `${album.year} · ` : ''}
        {album.artist}
      </span>
    </Link>
  );
}

export function ArtistCard({ artist }: { artist: Artist }) {
  return (
    <Link className="card artist-card" to={`/artist/${artist.id}`}>
      <div className="card-media">
        {artist.cover ? (
          <Cover src={artist.cover} alt={artist.name} className="round" />
        ) : (
          <span className="cover cover-empty round" style={{ aspectRatio: '1/1' }}>
            {Icons.person(34)}
          </span>
        )}
      </div>
      <span className="card-title" title={artist.name}>
        {artist.name}
      </span>
      <span className="card-sub">{artist.genre ?? 'Artiste'}</span>
    </Link>
  );
}

/* ------------------------------- chips de genres ---------------------------- */

export function ChipBar({
  chips,
  active,
  onPick,
}: {
  chips: readonly string[];
  active?: string;
  onPick: (c: string) => void;
}) {
  return (
    <div className="chipbar" role="tablist">
      {chips.map((c) => (
        <button
          key={c}
          className={`chip ${c === active ? 'chip-active' : ''}`}
          onClick={() => onPick(c)}
          role="tab"
          aria-selected={c === active}
        >
          {c}
        </button>
      ))}
    </div>
  );
}
