import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { unifiedSearch, type PreviewSource, type SearchSource } from '../api/search';
import type { Album, Artist, Track } from '../types';
import TrackRow from '../components/TrackRow';
import { ArtistCard, AlbumCard, Shelf } from '../components/Cards';
import Icons from '../components/icons';

interface Results {
  tracks: Track[];
  albums: Album[];
  artists: Artist[];
  live: boolean;
  source: SearchSource;
  previewSource: PreviewSource;
}

const SUGGESTIONS = [
  'Daft Punk', 'Stromae', 'Angèle', 'Orelsan', 'Coldplay', 'Miles Davis',
  'Boogie', 'Jazz', 'Classique', 'Rock français',
];

function isAbort(err: unknown): boolean {
  if (err instanceof DOMException) return err.name === 'AbortError';
  if (typeof err === 'object' && err !== null && 'name' in err) {
    return (err as { name?: string }).name === 'AbortError';
  }
  return String(err).toLowerCase().includes('abort');
}

export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const [pending, setPending] = useState(q);
  const [data, setData] = useState<Results | null>(
    q ? null : { tracks: [], albums: [], artists: [], live: true, source: 'itunes', previewSource: 'none' }
  );
  const [busy, setBusy] = useState(false);
  const [nonce, setNonce] = useState(0); // « réessayer »
  const [showAllTracks, setShowAllTracks] = useState(false);

  useEffect(() => setShowAllTracks(false), [q]);

  const fetchedKey = useRef('');

  useEffect(() => setPending(q), [q]);

  // Debounce : l'URL suit la saisie sans empiler des entrées d'historique.
  useEffect(() => {
    const timer = setTimeout(() => {
      const trimmed = pending.trim();
      if (trimmed !== q) setParams(trimmed ? { q: trimmed } : {}, { replace: true });
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  useEffect(() => {
    const term = q.trim();
    if (!term) {
      fetchedKey.current = '';
      setData({ tracks: [], albums: [], artists: [], live: true, source: 'itunes', previewSource: 'none' });
      setBusy(false);
      return;
    }

    const key = `${term}#${nonce}`;
    // StrictMode / navigation : évite le double appel, sauf après annulation.
    if (fetchedKey.current === key) return;
    fetchedKey.current = key;

    const ctrl = new AbortController();
    setBusy(true);

    unifiedSearch(term, ctrl.signal)
      .then((res) => {
        if (ctrl.signal.aborted) return;
        setData({
          tracks: res.tracks,
          albums: res.albums,
          artists: res.artists,
          live: res.live,
          source: res.source,
          previewSource: res.previewSource,
        });
      })
      .catch((err) => {
        if (isAbort(err) || ctrl.signal.aborted) return;
        setData({
          tracks: [],
          albums: [],
          artists: [],
          live: false,
          source: 'itunes',
          previewSource: 'none',
        });
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setBusy(false);
      });

    return () => {
      ctrl.abort();
      // Autorise un nouveau montage (StrictMode) à relancer la requête.
      if (fetchedKey.current === key) fetchedKey.current = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, nonce]);

  const total = data ? data.tracks.length + data.albums.length + data.artists.length : 0;
  const visibleTracks = data
    ? data.tracks.slice(0, showAllTracks ? data.tracks.length : 20)
    : [];
  const initialLoading = busy && data === null;
  const failed = !!data && !busy && !data.live && total === 0;
  const empty = !!data && !busy && data.live && total === 0;
  const partial = !!data && !busy && !data.live && total > 0;

  const retry = () => setNonce((n) => n + 1);

  return (
    <div className="search-page">
      {/* Sans requête : le grand champ est le point d'entrée. Avec une requête,
          le champ de la barre du haut fait déjà le travail — on affiche à la
          place un en-tête de résultats, plus lisible qu'un doublon. */}
      {q ? (
        <div className="search-head">
          <span className="search-kicker">Résultats pour</span>
          <h1 className="search-term">« {q} »</h1>
          {busy && <span className="spinner" aria-hidden />}
        </div>
      ) : (
        <div className="search-page-field">
          <input
            className="search-big"
            placeholder="Titre, artiste, album…"
            value={pending}
            onChange={(e) => setPending(e.target.value)}
            aria-label="Rechercher"
            autoComplete="off"
          />
          {busy && <span className="spinner" aria-hidden />}
        </div>
      )}

      {data && q && total > 0 && (
        <div className="source-badge" title="Provenance des métadonnées et des extraits audio">
          {data.source === 'spotify' ? 'Métadonnées Spotify' : 'Catalogue iTunes'}
          <span className="source-badge__detail">
            {data.previewSource === 'itunes' && ' · extraits officiels 30 s'}
            {data.previewSource === 'mixed' && ' · extraits mixtes'}
            {data.previewSource === 'none' && ' · sans extrait'}
          </span>
        </div>
      )}

      {initialLoading && <SearchSkeleton />}

      {failed && (
        <div className="empty-note">
          Le service de recherche est injoignable — vérifiez votre connexion puis{' '}
          <button className="link-btn" onClick={retry}>réessayez</button>.
        </div>
      )}

      {empty && (
        <div className="empty-note">
          Aucun résultat pour « {q} ». Essayez un autre titre, un artiste ou un album.
        </div>
      )}

      {partial && (
        <div className="empty-note">
          Résultats partiels : une partie du service ne répond pas —{' '}
          <button className="link-btn" onClick={retry}>réessayer</button>.
        </div>
      )}

      {!q && <Suggestions onPick={(s) => { setPending(s); setParams({ q: s }, { replace: true }); }} />}

      {data && data.artists.length > 0 && (
        <Shelf title={`Artistes (${data.artists.length})`}>
          {data.artists.map((a) => (
            <ArtistCard key={a.id} artist={a} />
          ))}
        </Shelf>
      )}

      {data && data.tracks.length > 0 && (
        <section className="section">
          <div className="section-title">
            <h2>Titres ({data.tracks.length})</h2>
            {data.tracks.length > 20 && (
              <button className="link-btn" onClick={() => setShowAllTracks((v) => !v)}>
                {showAllTracks ? 'Réduire' : 'Tout afficher'}
              </button>
            )}
          </div>
          <div className="track-list">
            {visibleTracks.map((t, i) => (
              <TrackRow
                key={t.id}
                track={t}
                context={visibleTracks}
                index={i}
                contextName={`Recherche : ${q}`}
              />
            ))}
          </div>
        </section>
      )}

      {data && data.albums.length > 0 && (
        <Shelf title={`Albums (${data.albums.length})`}>
          {data.albums.map((a) => (
            <AlbumCard key={a.id} album={a} />
          ))}
        </Shelf>
      )}
    </div>
  );
}

function SearchSkeleton() {
  return (
    <div className="track-list" aria-hidden>
      {Array.from({ length: 8 }).map((_, i) => (
        <div className="track-row" key={i}>
          <span className="row-play" />
          <div className="skeleton" style={{ width: 40, height: 40 }} />
          <div className="skeleton line" style={{ margin: 0 }} />
          <div className="skeleton line" style={{ margin: 0 }} />
          <div className="skeleton line" style={{ width: 40, margin: 0 }} />
        </div>
      ))}
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
