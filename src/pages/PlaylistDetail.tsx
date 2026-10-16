import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../store';
import { fmtTotal } from '../lib/format';
import TrackRow from '../components/TrackRow';
import { gradientOf } from '../lib/format';
import Icons from '../components/icons';

/** Page détaillée d'une playlist locale — « liked » est une pseudo-playlist en lecture seule. */
export default function PlaylistDetail() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const playlists = useStore((s) => s.playlists);
  const liked = useStore((s) => s.liked);
  const play = useStore((s) => s.play);
  const rename = useStore((s) => s.renamePlaylist);
  const del = useStore((s) => s.deletePlaylist);
  const removeFromPlaylist = useStore((s) => s.removeFromPlaylist);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const isLiked = id === 'liked';
  const playlist = playlists.find((p) => p.id === id);

  if (!isLiked && !playlist) {
    return (
      <div className="empty-note">
        Playlist introuvable ou supprimée.
        <br />
        <button className="btn" onClick={() => nav('/library')}>Retour à la bibliothèque</button>
      </div>
    );
  }

  const name = isLiked ? 'Titres likés' : playlist!.name;
  const cover = isLiked ? undefined : playlist!.tracks[0]?.cover;
  const tracks = isLiked ? liked : playlist!.tracks;
  const playable = tracks.filter((t) => t.preview);
  const total = tracks.reduce((acc, t) => acc + (t.durationMs ?? 0), 0);

  return (
    <div className="detail-page">
      <div className="detail-head" style={{ background: gradientOf(name) }}>
        {cover ? (
          <img src={cover} alt="" className="detail-cover" />
        ) : (
          <span className="detail-cover detail-cover-empty">{Icons.note(64)}</span>
        )}
        <div>
          <span className="detail-kind">{isLiked ? 'Sélection automatique' : 'Playlist'}</span>
          {editing ? (
            <form
              className="rename-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (draft.trim()) rename(playlist!.id, draft.trim());
                setEditing(false);
              }}
            >
              <input
                autoFocus
                className="text-input"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                aria-label="Nouveau nom"
              />
              <button className="btn" type="submit">OK</button>
              <button className="icon-btn" type="button" onClick={() => setEditing(false)} aria-label="Annuler">
                {Icons.close(18)}
              </button>
            </form>
          ) : (
            <h1 className="detail-title">{name}</h1>
          )}
          <div className="detail-meta muted">
            {tracks.length} titre{tracks.length > 1 ? 's' : ''}{total > 0 ? ` · ${fmtTotal(total)}` : ''}
          </div>
          <div className="detail-actions">
            <button
              className="btn accent"
              disabled={playable.length === 0}
              onClick={() => play(playable, 0, name)}
            >
              {Icons.play(18)} Lecture
            </button>
            {!isLiked && (
              <>
                <button
                  className="icon-btn"
                  title="Renommer"
                  onClick={() => {
                    setDraft(playlist!.name);
                    setEditing(true);
                  }}
                >
                  {Icons.pen(18)}
                </button>
                <button
                  className="icon-btn danger"
                  title="Supprimer la playlist"
                  onClick={() => {
                    if (window.confirm('Supprimer cette playlist ?')) {
                      del(playlist!.id);
                      nav('/library');
                    }
                  }}
                >
                  {Icons.trash(18)}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="track-list">
        {tracks.length === 0 && (
          <p className="empty-note">
            {isLiked
              ? 'Aucun titre liké pour le moment — cliquez sur ♡ dans la barre de lecture ou sur une ligne.'
              : 'Playlist vide. Ajoutez des titres via le ⊕ des lignes (recherche, albums…).'}
          </p>
        )}
        {tracks.map((t) => (
          <TrackRow
            key={t.id}
            track={t}
            context={playable}
            index={playable.findIndex((x) => x.id === t.id)}
            onRemove={
              isLiked
                ? undefined
                : () => removeFromPlaylist(playlist!.id, t.id)
            }
          />
        ))}
      </div>
    </div>
  );
}
