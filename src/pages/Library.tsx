import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { gradientOf } from '../lib/format';
import { isPlayable } from '../lib/tracks';
import TrackRow from '../components/TrackRow';
import { ArtistCard, Shelf } from '../components/Cards';
import Icons from '../components/icons';

/**
 * Bibliothèque locale : titres likés, historique, artistes suivis et playlists.
 * Tout est persisté dans le navigateur (localStorage).
 */
export default function Library() {
  const nav = useNavigate();
  const playlists = useStore((s) => s.playlists);
  const liked = useStore((s) => s.liked);
  const history = useStore((s) => s.history);
  const followed = useStore((s) => s.followed);
  const createPlaylist = useStore((s) => s.createPlaylist);
  const deletePlaylist = useStore((s) => s.deletePlaylist);
  const clearHistory = useStore((s) => s.clearHistory);
  const play = useStore((s) => s.play);
  const [name, setName] = useState('');

  function add() {
    const id = createPlaylist(name);
    setName('');
    nav(`/playlist/${id}`);
  }

  const recent = history.slice(0, 6);
  const empty =
    playlists.length === 0 && liked.length === 0 && history.length === 0 && followed.length === 0;

  return (
    <div className="library">
      <div className="library-head">
        <div>
          <h1>Bibliothèque</h1>
          <p className="muted library-sub">
            {empty
              ? 'Vos likes, votre historique, vos artistes et vos playlists, gardés dans ce navigateur.'
              : `${liked.length} titre${liked.length > 1 ? 's' : ''} liké${liked.length > 1 ? 's' : ''} · ${playlists.length} playlist${playlists.length > 1 ? 's' : ''} · ${followed.length} artiste${followed.length > 1 ? 's' : ''} suivi${followed.length > 1 ? 's' : ''}`}
          </p>
        </div>
      </div>

      {empty ? (
        <div className="onboard-grid">
          <Link className="onboard-card" to="/search">
            <span className="onboard-icon">{Icons.search(22)}</span>
            <strong>Explorer le catalogue</strong>
            <span className="muted">
              Des millions de titres et d’albums iTunes, avec leurs extraits officiels de 30 s.
            </span>
            <span className="onboard-cta">Rechercher {Icons.chevronRight(14)}</span>
          </Link>

          <Link className="onboard-card" to="/local">
            <span className="onboard-icon">{Icons.upload(22)}</span>
            <strong>Importer ma musique</strong>
            <span className="muted">
              Vos MP3, FLAC ou WAV, lus en entier et conservés sur cet appareil, sans envoi.
            </span>
            <span className="onboard-cta">Ma musique locale {Icons.chevronRight(14)}</span>
          </Link>

          <form
            className="onboard-card onboard-form"
            onSubmit={(e) => {
              e.preventDefault();
              add();
            }}
          >
            <span className="onboard-icon">{Icons.plus(22)}</span>
            <strong>Créer une playlist</strong>
            <span className="muted">
              Donnez-lui un nom, puis ajoutez des titres depuis n’importe quelle liste.
            </span>
            <div className="onboard-row">
              <input
                className="text-input"
                placeholder="Ma playlist…"
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-label="Nom de la playlist"
              />
              <button className="btn accent" type="submit" disabled={!name.trim()}>
                Créer
              </button>
            </div>
          </form>
        </div>
      ) : (
        <>
          <section className="section">
            <div className="section-title">
              <h2>Titres likés</h2>
              {liked.length > 0 && (
                <Link className="link-btn" to="/playlist/liked">
                  Tout afficher
                </Link>
              )}
            </div>
            {liked.length === 0 ? (
              <p className="muted empty-inline">
                Aucun titre liké — cliquez sur ♡ dans la barre de lecture ou sur une ligne de
                résultats.
              </p>
            ) : (
              <div className="liked-strip">
                <button
                  className="btn accent"
                  onClick={() => {
                    const playable = liked.filter(isPlayable);
                    if (playable.length > 0) play(playable, 0, 'Titres likés');
                  }}
                >
                  {Icons.play(16)} Tout lire ({liked.length})
                </button>
                <Link className="text-link" to="/playlist/liked">
                  Voir la sélection complète
                </Link>
              </div>
            )}
          </section>

          <section className="section">
            <div className="section-title">
              <h2>Écoutés récemment</h2>
              <Link className="link-btn" to="/history">
                Tout afficher
              </Link>
            </div>
            {recent.length === 0 ? (
              <p className="muted empty-inline">
                Lancez un titre : votre historique se remplit automatiquement.
              </p>
            ) : (
              <>
                <div className="track-list">
                  {recent.map((t, i) => (
                    <TrackRow
                      key={t.id}
                      track={t}
                      context={history}
                      index={i}
                      contextName="Écoutés récemment"
                    />
                  ))}
                </div>
                <button className="link-btn history-clear" onClick={clearHistory}>
                  Effacer l’historique
                </button>
              </>
            )}
          </section>

          {followed.length > 0 && (
            <Shelf title="Artistes suivis">
              {followed.map((a) => (
                <ArtistCard key={a.id} artist={a} />
              ))}
            </Shelf>
          )}

          <section className="section">
            <div className="section-title">
              <h2>Playlists</h2>
              <form
                className="pl-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  add();
                }}
              >
                <input
                  className="text-input"
                  placeholder="Nouvelle playlist…"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  aria-label="Nom de la playlist"
                />
                <button className="btn" type="submit" disabled={!name.trim()}>
                  {Icons.plus(16)} Créer
                </button>
              </form>
            </div>
            {playlists.length === 0 && (
              <p className="muted empty-inline">
                Aucune playlist. Créez-en une ci-dessus, ou ajoutez des titres depuis la recherche
                ou un album.
              </p>
            )}
            <div className="pl-grid">
              {playlists.map((p) => (
                <article className="card playlist-card" key={p.id}>
                  <button
                    className="pl-media"
                    style={{ background: gradientOf(p.id) }}
                    onClick={() => nav(`/playlist/${p.id}`)}
                    title={p.name}
                    aria-label={`Ouvrir la playlist ${p.name}`}
                  >
                    {p.tracks[0]?.cover ? (
                      <img src={p.tracks[0].cover} alt="" />
                    ) : (
                      <span className="pl-note">{Icons.note(40)}</span>
                    )}
                  </button>
                  <Link className="card-title" to={`/playlist/${p.id}`} title={p.name}>
                    {p.name}
                  </Link>
                  <span className="pl-count muted">
                    {p.tracks.length} titre{p.tracks.length > 1 ? 's' : ''}
                  </span>
                  <div className="pl-tools">
                    <button
                      className="icon-btn small"
                      title="Lire la playlist"
                      aria-label={`Lire la playlist ${p.name}`}
                      onClick={() => {
                        const playable = p.tracks.filter(isPlayable);
                        if (playable.length > 0) play(playable, 0, p.name);
                      }}
                    >
                      {Icons.play(16)}
                    </button>
                    <button
                      className="icon-btn small danger"
                      title="Supprimer la playlist"
                      aria-label={`Supprimer la playlist ${p.name}`}
                      onClick={() => {
                        if (window.confirm(`Supprimer la playlist « ${p.name} » ?`))
                          deletePlaylist(p.id);
                      }}
                    >
                      {Icons.trash(16)}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
