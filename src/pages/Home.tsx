import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { DEFAULT_ARTISTS, DEFAULT_GENRE, GENRES, useStore } from '../store';
import { unifiedSearchTracks } from '../api/search';
import type { Track } from '../types';
import { ChipBar, Shelf, Skeleton, TrackCard } from '../components/Cards';
import DailyMixShelf from '../components/DailyMixShelf';
import { gradientOf } from '../lib/format';
import { diversifyTracks } from '../lib/tracks';

interface ShelfItem {
  title: string;
  tracks: Track[];
  live: boolean;
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
  const [genreShelf, setGenreShelf] = useState<ShelfItem | null>(null);
  const [genreBusy, setGenreBusy] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    SHELF_TERMS.forEach((def, i) => {
      unifiedSearchTracks(def.term, ctrl.signal)
        .then((res) => {
          if (ctrl.signal.aborted) return;
          setShelves((s) => s.map((x, j) => (j === i ? { title: def.title, tracks: diversifyTracks(res.tracks, 2, 20), live: res.live } : x)));
        })
        .catch(() => {
          if (ctrl.signal.aborted) return;
          setShelves((s) => s.map((x, j) => (j === i ? { title: def.title, tracks: [], live: false } : x)));
        });
    });
    return () => ctrl.abort();
  }, []);

  // Les chips de genres pilotent une étagère dédiée en tête de page.
  // « Tous » n'appelle rien : les étagères thématiques suffisent.
  useEffect(() => {
    if (genre === DEFAULT_GENRE) {
      setGenreShelf(null);
      setGenreBusy(false);
      return;
    }
    const ctrl = new AbortController();
    setGenreBusy(true);
    setGenreShelf(null);
    unifiedSearchTracks(genre, ctrl.signal)
      .then((res) => {
        if (ctrl.signal.aborted) return;
        setGenreShelf({ title: `Sélection ${genre}`, tracks: diversifyTracks(res.tracks, 2, 20), live: res.live });
      })
      .catch(() => {
        if (ctrl.signal.aborted) return;
        setGenreShelf({ title: `Sélection ${genre}`, tracks: [], live: false });
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setGenreBusy(false);
      });
    return () => ctrl.abort();
  }, [genre]);

  return (
    <div className="home">
      <div className="home-head">
        <h1>{greeting()}</h1>
        <p className="muted home-sub">
          Recherche, albums, playlists et extraits officiels de 30 s — et vos propres
          fichiers audio, lus en entier. iTunes sans compte, Spotify (métadonnées) si vous le connectez.
        </p>
      </div>

      <QuickPlaylists />

      <RecentlyPlayed />

      <DailyMixShelf />

      <ChipBar chips={GENRES} active={genre} onPick={setGenre} />

      {genre !== DEFAULT_GENRE && (
        genreBusy ? (
          <ShelfSkeleton />
        ) : genreShelf && genreShelf.tracks.length > 0 ? (
          <Shelf title={genreShelf.title}>
            {genreShelf.tracks.map((t, j) => (
              <TrackCard key={t.id} track={t} context={genreShelf.tracks} index={j} contextName={genreShelf.title} />
            ))}
          </Shelf>
        ) : genreShelf && !genreShelf.live ? (
          <p className="muted empty-inline">Sélection indisponible pour le moment.</p>
        ) : null
      )}

      {shelves.map((s, i) =>
        s ? (
          s.tracks.length > 0 ? (
            <Shelf key={i} title={s.title}>
              {s.tracks.map((t, j) => (
                <TrackCard key={t.id} track={t} context={s.tracks} index={j} contextName={s.title} />
              ))}
            </Shelf>
          ) : s.live ? null : (
            <p key={i} className="muted empty-inline">{s.title} : indisponible pour le moment.</p>
          )
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

/** Derniers titres réellement écoutés (alimenté par le moteur audio). */
function RecentlyPlayed() {
  const history = useStore((s) => s.history);
  const nav = useNavigate();
  if (history.length === 0) return null;

  return (
    <Shelf title="Écoutés récemment" onMore={() => nav('/history')}>
      {history.slice(0, 12).map((t, i) => (
        <TrackCard
          key={t.id}
          track={t}
          context={history}
          index={i}
          contextName="Écoutés récemment"
        />
      ))}
    </Shelf>
  );
}

/** « À découvrir aujourd'hui » : les titres réels d'un artiste du jour. */
function ArtistSpotlight() {
  const [artist] = useState<string>(
    () => DEFAULT_ARTISTS[new Date().getDate() % DEFAULT_ARTISTS.length]
  );
  const [tracks, setTracks] = useState<Track[] | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    setTracks(null);
    unifiedSearchTracks(artist, ctrl.signal)
      .then((res) => {
        if (!ctrl.signal.aborted) setTracks(diversifyTracks(res.tracks, 2, 12));
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setTracks([]);
      });
    return () => ctrl.abort();
  }, [artist]);

  return (
    <Shelf title={`À retrouver ce jour : ${artist}`}>
      {tracks ? (
        tracks.length > 0 ? (
          tracks.map((t, i) => (
            <TrackCard
              key={t.id}
              track={t}
              context={tracks}
              index={i}
              contextName={`Artiste : ${artist}`}
            />
          ))
        ) : (
          <p className="muted">Sélection indisponible pour le moment.</p>
        )
      ) : (
        Array.from({ length: 6 }).map((_, i) => (
          <div className="card card-skeleton" key={i}>
            <Skeleton />
            <Skeleton className="line" />
            <Skeleton className="line short" />
          </div>
        ))
      )}
    </Shelf>
  );
}
