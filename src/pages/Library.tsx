import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { gradientOf } from '../lib/format';
import Icons from '../components/icons';

/**
 * Bibliothèque locale : playlists personnelles (création, lecture,
 * suppression). Tout est persisté dans le navigateur (localStorage).
 */
export default function Library() {
  const nav = useNavigate();
  const playlists = useStore((s) => s.playlists);
  const liked = useStore((s) => s.liked);
  const createPlaylist = useStore((s) => s.createPlaylist);
  const deletePlaylist = useStore((s) => s.deletePlaylist);
  const play = useStore((s) => s.play);
  const [name, setName] = useState('');

  function add() {
    const id = createPlaylist(name);
    setName('');
    nav(`/playlist/${id}`);
  }

  return (
    <div className="library">
      <div className="library-head">
        <h1>Bibliothèque</h1>
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

      <section className="section">
        <div className="section-title"><h2>Titres likés</h2></div>
        {liked.length === 0 ? (
          <p className="muted empty-inline">
            Aucun titre liké — cliquez sur ♡ dans la barre de lecture ou sur une ligne de résultats.
          </p>
        ) : (
          <div className="liked-strip">
            <button
              className="btn accent"
              onClick={() => {
                const playable = liked.filter((t) => t.preview);
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
        <div className="section-title"><h2>Playlists</h2></div>
        {playlists.length === 0 && (
          <p className="muted empty-inline">
            Aucune playlist. Créez-en une ci-dessus, ou ajoutez des titres depuis la recherche ou un album.
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
                  onClick={() => {
                    const playable = p.tracks.filter((t) => t.preview);
                    if (playable.length > 0) play(playable, 0, p.name);
                  }}
                >
                  {Icons.play(16)}
                </button>
                <button
                  className="icon-btn small danger"
                  title="Supprimer la playlist"
                  onClick={() => deletePlaylist(p.id)}
                >
                  {Icons.trash(16)}
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
