import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { searchAlbums, searchArtists, searchTracks } from '../api/itunes';
import type { Album, Artist, Track } from '../types';
import TrackRow from '../components/TrackRow';
import { ArtistCard, AlbumCard, Shelf } from '../components/Cards';
import Icons from '../components/icons';

interface Results {
  tracks: Track[];
  albums: Album[];
  artists: Artist[];
  live: boolean;
}

const SUGGESTIONS = [
  'Daft Punk', 'Stromae', 'Angèle', 'Orelsan', 'Coldplay', 'Miles Davis',
  'Boogie', 'Jazz', 'Classique', 'Rock français',
];

export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const [pending, setPending] = useState(q);
  const [data, setData] = useState<Results | null>(
    q ? null : { tracks: [], albums: [], artists: [], live: true }
  );
  const [busy, setBusy] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastFetched = useRef<string>('');

  useEffect(() => setPending(q), [q]);

  // Debounce et association URL <-> champs
  useEffect(() => {
    const t = setTimeout(() => {
      const trimmed = pending.trim();
      if (trimmed !== q) setParams(trimmed ? { q: trimmed } : {});
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  useEffect(() => {
    if (!q) {
      setData({ tracks: [], albums: [], artists: [], live: true });
      return;
    }
    if (lastFetched.current === q && data) return;
    lastFetched.current = q;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setBusy(true);
    Promise.all([searchTracks(q, ctrl.signal), searchAlbums(q, ctrl.signal), searchArtists(q, ctrl.signal)])
      .then(([t, a, r]) => {
        if (ctrl.signal.aborted) return;
        setData({ tracks: t.tracks, albums: a.albums, artists: r, live: t.live });
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setBusy(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const results = useMemo(() => data, [data]);

  return (
    <div className="search-page">
      <div className="search-page-field">
        <input
          ref={inputRef}
          className="search-big"
          placeholder="Titre, artiste, album…"
          value={pending}
          onChange={(e) => setPending(e.target.value)}
          aria-label="Rechercher"
        />
        {busy && <span className="spinner" aria-hidden />}
      </div>

      {q && results && results.tracks.length === 0 && results.albums.length === 0 && results.artists.length === 0 && !busy && (
        <div className="empty-note">
          Aucun résultat pour « {q} ». {results.live ? '' : 'Le service de recherche est injoignable — réessayez.'}
        </div>
      )}

      {!q && <Suggestions onPick={(s) => { setPending(s); setParams({ q: s }); }} />}

      {results && results.artists.length > 0 && (
        <Shelf title="Artistes">
          {results.artists.map((a) => (
            <ArtistCard key={a.id} artist={a} />
          ))}
        </Shelf>
      )}

      {results && results.tracks.length > 0 && (
        <section className="section">
          <div className="section-title"><h2>Titres</h2></div>
          <div className="track-list">
            {results.tracks.slice(0, 20).map((t, i) => (
              <TrackRow key={t.id} track={t} context={results.tracks} index={i} />
            ))}
          </div>
        </section>
      )}

      {results && results.albums.length > 0 && (
        <Shelf title="Albums">
          {results.albums.map((a) => (
            <AlbumCard key={a.id} album={a} />
          ))}
        </Shelf>
      )}
    </div>
  );
}

function Suggestions({ onPick }: { onPick: (s: string) => void }) {
  return (
    <div className="suggestions">
      <div className="section-title"><h2>Suggestions</h2></div>
      <div className="chipbar">
        {SUGGESTIONS.map((s) => (
          <button key={s} className="chip" onClick={() => onPick(s)}>
            {Icons.search(16)} {s}
          </button>
        ))}
      </div>
    </div>
  );
}
