import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store';
import { fmtBytes } from '../lib/format';
import { isPlayable } from '../lib/tracks';
import {
  clearLocalTracks,
  deleteLocalTrack,
  importAudioFiles,
  type ImportFailure,
  type ImportProgress,
  type LocalTrack,
} from '../lib/localLibrary';
import { useLocalTracks } from '../lib/useLocalTracks';
import TrackRow from '../components/TrackRow';
import Icons from '../components/icons';

/**
 * Bibliothèque audio locale (IndexedDB) : import par dépôt ou sélection de
 * fichiers, lecture de morceaux complets, filtrage et suppression.
 * Aucun fichier ne quitte l'appareil.
 */
export default function LocalLibrary() {
  const { tracks, loading, error, refresh } = useLocalTracks();
  const play = useStore((s) => s.play);
  const forgetTrack = useStore((s) => s.forgetTrack);

  const inputRef = useRef<HTMLInputElement>(null);
  const [filter, setFilter] = useState('');
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [failures, setFailures] = useState<ImportFailure[]>([]);
  const [importError, setImportError] = useState<string | null>(null);

  const totalSize = tracks.reduce((sum, track) => sum + (track.localSize ?? 0), 0);
  const query = filter.trim().toLowerCase();
  const visible = query
    ? tracks.filter((track) =>
        `${track.title} ${track.artist} ${track.album}`.toLowerCase().includes(query)
      )
    : tracks;
  const playable = visible.filter(isPlayable);

  async function handleFiles(fileList: FileList | null) {
    const files = Array.from(fileList ?? []).filter((file) => file.size > 0);
    if (files.length === 0) return;

    setFailures([]);
    setImportError(null);
    setProgress({ done: 0, total: files.length });

    try {
      const result = await importAudioFiles(files, (next) => setProgress({ ...next }));
      setFailures(result.failures);
      await refresh();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Import impossible.');
    } finally {
      setProgress(null);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function removeTrack(track: LocalTrack) {
    if (progress) return;
    if (!window.confirm(`Supprimer « ${track.title} » de la bibliothèque locale ?`)) return;
    try {
      await deleteLocalTrack(track.localId);
      // Retire aussi la piste des likes, de l'historique, des playlists et de la file.
      forgetTrack(track.id);
      await refresh();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Suppression impossible.');
    }
  }

  async function removeAll() {
    if (progress) return;
    if (!window.confirm(`Supprimer les ${tracks.length} fichiers importés ? Cette action est définitive.`)) {
      return;
    }
    try {
      await clearLocalTracks();
      for (const track of tracks) forgetTrack(track.id);
      setFailures([]);
      await refresh();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Suppression impossible.');
    }
  }

  return (
    <div className="local-page">
      <div className="library-head">
        <div>
          <h1>Ma musique locale</h1>
          <p className="muted local-sub">
            {tracks.length} titre{tracks.length > 1 ? 's' : ''}
            {totalSize > 0 ? ` · ${fmtBytes(totalSize)}` : ''} · stocké dans ce navigateur
          </p>
        </div>
        {tracks.length > 0 && (
          <button className="btn ghost danger" onClick={removeAll} disabled={!!progress}>
            {Icons.trash(16)} Tout supprimer
          </button>
        )}
      </div>

      <section className="dropzone" aria-labelledby="dropzone-title">
        <span className="dropzone-icon" aria-hidden>{Icons.upload(36)}</span>
        <div className="dropzone-copy">
          <h2 id="dropzone-title">Glissez vos fichiers audio ici</h2>
          <p className="muted">
            Ou déposez-les n’importe où dans l’application. MP3, M4A, FLAC, WAV, OGG, OPUS…
          </p>
        </div>
        <button className="btn accent" onClick={() => inputRef.current?.click()} disabled={!!progress}>
          {Icons.plus(16)} Choisir des fichiers
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="audio/*,.mp3,.m4a,.m4b,.aac,.wav,.ogg,.oga,.opus,.flac,.webm,.aiff,.aif"
          onChange={(e) => void handleFiles(e.target.files)}
          style={{ display: 'none' }}
          aria-label="Fichiers audio à importer"
        />
      </section>

      <p className="local-privacy muted">
        {Icons.lock(14)} Les fichiers restent dans IndexedDB, sur cet appareil. Aucun envoi vers un serveur.
      </p>

      {progress && (
        <div className="import-progress" role="status" aria-live="polite">
          <div className="import-progress-head">
            <span>Import {progress.done}/{progress.total}…</span>
            {progress.current && <span className="muted import-current" title={progress.current}>{progress.current}</span>}
          </div>
          <div className="import-progress-track">
            <span style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
          </div>
        </div>
      )}

      {importError && (
        <div className="local-errors" role="alert">
          <strong>Import / stockage</strong>
          <span>{importError}</span>
          <button className="link-btn" onClick={() => setImportError(null)}>Fermer</button>
        </div>
      )}

      {failures.length > 0 && (
        <div className="local-errors" role="alert">
          <strong>
            {failures.length} fichier{failures.length > 1 ? 's' : ''} ignoré{failures.length > 1 ? 's' : ''}
          </strong>
          <ul>
            {failures.slice(0, 5).map((failure) => (
              <li key={failure.name}>
                <span>{failure.name}</span> — {failure.reason}
              </li>
            ))}
          </ul>
          {failures.length > 5 && <span className="muted">… et {failures.length - 5} autre(s).</span>}
          <button className="link-btn" onClick={() => setFailures([])}>Fermer</button>
        </div>
      )}

      {error && (
        <div className="empty-note">
          Bibliothèque locale indisponible : {error}
        </div>
      )}

      {loading && !error && (
        <p className="muted empty-inline">Chargement de la bibliothèque locale…</p>
      )}

      {!loading && !error && tracks.length === 0 && (
        <div className="empty-note local-empty">
          <p>Aucun fichier local pour le moment.</p>
          <p className="muted">
            Importez quelques MP3 ou FLAC pour les écouter en entier, les liker et les ajouter à vos
            playlists. Vous pouvez aussi garder iTunes pour la découverte.
          </p>
          <button className="btn" onClick={() => inputRef.current?.click()}>
            {Icons.upload(16)} Importer de la musique
          </button>
          <Link className="text-link" to="/">Retour à l’accueil</Link>
        </div>
      )}

      {!loading && !error && tracks.length > 0 && (
        <section className="section local-tracks">
          <div className="section-title">
            <h2>Titres importés ({tracks.length})</h2>
          </div>

          <div className="local-toolbar">
            <input
              className="text-input"
              placeholder="Filtrer par titre, artiste ou album…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              aria-label="Filtrer la bibliothèque locale"
            />
            <button
              className="btn accent"
              disabled={playable.length === 0}
              onClick={() => play(visible, 0, 'Ma musique locale')}
            >
              {Icons.play(16)} Tout lire
            </button>
          </div>

          {visible.length === 0 ? (
            <p className="muted empty-inline">Aucun titre ne correspond à « {filter} ».</p>
          ) : (
            <div className="track-list">
              {visible.map((track, index) => (
                <TrackRow
                  key={track.id}
                  track={track}
                  context={visible}
                  index={index}
                  contextName="Ma musique locale"
                  onRemove={() => void removeTrack(track)}
                  removeLabel="Supprimer de la bibliothèque locale"
                />
              ))}
            </div>
          )}

          <p className="muted local-hint">
            Astuce : les fichiers importés peuvent être likés, ajoutés à une playlist et lus depuis
            l’historique comme n’importe quel autre titre.
          </p>
        </section>
      )}
    </div>
  );
}
