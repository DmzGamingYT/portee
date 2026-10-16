import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { DEFAULT_ARTISTS, DEFAULT_GENRE, GENRES, useStore } from '../store';
import { searchTracks } from '../api/itunes';
import type { Track } from '../types';
import { ChipBar, Shelf, Skeleton, TrackCard } from '../components/Cards';
import { gradientOf } from '../lib/format';

interface ShelfItem {
  title: string;
  tracks: Track[];
}

const SHELF_TERMS: Array<{ title: string; term: string }> = [
  { title: 'Pop du moment', term: 'pop' },
  { title: 'Rock essentiel', term: 'rock' },
  { title: 'Hip-Hop & Rap', term: 'hip hop' },
  { title: 'Électro & dance', term: 'electronic' },
  { title: 'Jazz classique', term: 'jazz' },
  { title: 'Musique française', term: 'chanson française' },
];

export default function Home() {
  const [genre, setGenre] = useState<string>(DEFAULT_GENRE);
  const [shelves, setShelves] = useState<(ShelfItem | null)[]>(() => SHELF_TERMS.map(() => null));

  useEffect(() => {
    let dead = false;
    SHELF_TERMS.forEach((def, i) => {
      searchTracks(def.term).then((res) => {
        if (!dead) {
          setShelves((s) => s.map((x, j) => (j === i ? { title: def.title, tracks: res.tracks } : x)));
        }
      });
    });
    return () => {
      dead = true;
    };
  }, []);

  return (
    <div className="home">
      <div className="home-head">
        <h1>{greeting()}</h1>
        <p className="muted home-sub">
          Recherche, albums, playlists et extraits de 30 s officiels — aucune clé API requise.
        </p>
      </div>

      <QuickPlaylists />

      <ChipBar chips={GENRES} active={genre} onPick={setGenre} />

      {shelves.map((s, i) =>
        s ? (
          <Shelf key={i} title={s.title}>
            {s.tracks.map((t, j) => (
              <TrackCard key={t.id} track={t} context={s.tracks} index={j} />
            ))}
          </Shelf>
        ) : (
          <ShelfSkeleton key={`sk${i}`} />
        )
      )}

      <ArtistSpotlight />
    </div>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Bonjour';
  if (h < 18) return 'Bon après-midi';
  return 'Bonsoir';
}

function ShelfSkeleton() {
  return (
    <Shelf>
      {Array.from({ length: 6 }).map((_, i) => (
        <div className="card card-skeleton" key={i}>
          <Skeleton />
          <Skeleton className="line" />
          <Skeleton className="line short" />
        </div>
      ))}
    </Shelf>
  );
}

/** Raccourcis vers les playlists récentes (façon accueil Spotify). */
function QuickPlaylists() {
  const playlists = useStore((s) => s.playlists);
  if (playlists.length === 0) return null;

  return (
    <div className="quick-grid">
      {playlists.slice(0, 4).map((p) => (
        <Link key={p.id} className="shortcut shortcut-block" style={{ background: gradientOf(p.id) }} to={`/playlist/${p.id}`}>
          {p.tracks[0]?.cover ? (
            <img className="shortcut-cover" src={p.tracks[0].cover} alt="" />
          ) : (
            <span className="shortcut-cover shortcut-cover-empty">{p.name.slice(0, 1).toUpperCase()}</span>
          )}
          <span className="shortcut-name">{p.name}</span>
          <span className="shortcut-count">
            {p.tracks.length} titre{p.tracks.length > 1 ? 's' : ''}
          </span>
        </Link>
      ))}
    </div>
  );
}

/** « À découvrir aujourd'hui » : les titres réels d'un artiste du jour. */
function ArtistSpotlight() {
  const [artist, ] = useState<string>(
    () => DEFAULT_ARTISTS[new Date().getDate() % DEFAULT_ARTISTS.length]
  );
  const [tracks, setTracks] = useState<Track[] | null>(null);

  useEffect(() => {
    let dead = false;
    setTracks(null);
    searchTracks(artist).then((res) => {
      if (!dead) setTracks(res.tracks.slice(0, 12));
    });
    return () => {
      dead = true;
    };
  }, [artist]);

  return (
    <Shelf title={`À retrouver ce jour : ${artist}`}>
      {tracks ? (
        tracks.length > 0 ? (
          tracks.map((t, i) => <TrackCard key={t.id} track={t} context={tracks} index={i} />)
        ) : (
          <p className="muted">Sélection indisponible pour le moment.</p>
        )
      ) : (
        Array.from({ length: 6 }).map((_, i) => (
          <div className="card card-skeleton" key={i}>
            <Skeleton />
            <Skeleton className="line" />
          </div>
        ))
      )}
    </Shelf>
  );
}
