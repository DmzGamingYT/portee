import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store';
import { fmtBytes } from '../lib/format';
import { isPlayable } from '../lib/tracks';
import {
  clearLocalTracks,
  deleteLocalTrack,
  importAudioFiles,
  refreshLocalCovers,
  type AlbumImportSummary,
  type CoverRefreshProgress,
  type ImportEntry,
  type ImportFailure,
  type ImportProgress,
  type LocalTrack,
} from '../lib/localLibrary';
import { isGeneratedCover } from '../lib/coverArt';
import { useLocalTracks } from '../lib/useLocalTracks';
import TrackRow from '../components/TrackRow';
import Icons from '../components/icons';

interface ImportSummary {
  imported: number;
  duplicates: number;
  ignored: number;
  albums: AlbumImportSummary[];
}

/**
 * Bibliothèque audio locale (IndexedDB) : import par dépôt, sélection de
 * fichiers ou dossier entier, lecture de morceaux complets, filtrage et
 * suppression. Aucun fichier ne quitte l'appareil.
 */
export default function LocalLibrary() {
  const { tracks, loading, error, refresh } = useLocalTracks();
  const play = useStore((s) => s.play);
  const forgetTrack = useStore((s) => s.forgetTrack);

  const inputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const progressClock = useRef({ at: 0, phase: '', album: -1 });
  const coverClock = useRef(0);
  const [filter, setFilter] = useState('');
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [failures, setFailures] = useState<ImportFailure[]>([]);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [coverProgress, setCoverProgress] = useState<CoverRefreshProgress | null>(null);
  const [coverNotice, setCoverNotice] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  // `webkitdirectory` n'est pas exposé par les types React : attribut posé
  // directement sur l'input caché (Chrome, Edge, Firefox, Safari).
  useEffect(() => {
    const input = folderInputRef.current;
    if (!input) return;
    input.setAttribute('webkitdirectory', '');
    input.setAttribute('directory', '');
  }, []);

  const totalSize = tracks.reduce((sum, track) => sum + (track.localSize ?? 0), 0);
  const query = filter.trim().toLowerCase();
  const visible = query
    ? tracks.filter((track) =>
        `${track.title} ${track.artist} ${track.album}`.toLowerCase().includes(query)
      )
    : tracks;
  const playable = visible.filter(isPlayable);
  const missingCovers = tracks.filter((track) => isGeneratedCover(track.cover)).length;

  /**
   * Limite les rendus de la page à ~5 par seconde pendant l'import : sans ce
   * garde-fou, chaque fichier d'un dossier re-rend toute la liste des titres.
   * Un changement de phase ou d'album est toujours affiché immédiatement.
   */
  function paintProgress(next: ImportProgress) {
    const clock = progressClock.current;
    const now = performance.now();
    const album = next.album?.index ?? -1;
    if (next.phase === clock.phase && album === clock.album && now - clock.at < 200) return;
    clock.at = now;
    clock.phase = next.phase;
    clock.album = album;
    setProgress({ ...next });
  }

  async function fetchCovers() {
    if (progress || coverProgress || missingCovers === 0) return;
    setCoverNotice(null);
    setImportError(null);
    coverClock.current = 0;
    setCoverProgress({ done: 0, total: missingCovers });

    try {
      const result = await refreshLocalCovers((next) => {
        const now = performance.now();
        if (now - coverClock.current < 200 && next.done < next.total) return;
        coverClock.current = now;
        setCoverProgress({ ...next });
      });
      setCoverNotice(
        result.updated > 0
          ? `${result.updated} pochette${result.updated > 1 ? 's' : ''} récupérée${
              result.updated > 1 ? 's' : ''
            } sur ${result.total} fichier${result.total > 1 ? 's' : ''}.`
          : `Aucune pochette intégrée trouvée dans ${result.total} fichier${
              result.total > 1 ? 's' : ''
            }.`
      );
      await refresh();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Extraction des pochettes impossible.');
    } finally {
      setCoverProgress(null);
    }
  }

  async function handleFiles(fileList: FileList | null) {
    const entries: ImportEntry[] = Array.from(fileList ?? []).map((file) => ({
      file,
      path: file.webkitRelativePath || undefined,
    }));
    if (entries.every((entry) => entry.file.size === 0)) return;

    setFailures([]);
    setSummary(null);
    setCoverNotice(null);
    setImportError(null);
    progressClock.current = { at: 0, phase: '', album: -1 };
    setProgress({ phase: 'scan', done: 0, total: 0 });

    try {
      const result = await importAudioFiles(entries, paintProgress);
      setFailures(result.failures);
      setSummary({
        imported: result.tracks.length,
        duplicates: result.duplicates.length,
        ignored: result.ignored,
        albums: result.albums.filter(
          (album) => album.imported > 0 || album.duplicates > 0 || album.failed > 0
        ),
      });
      await refresh();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Import impossible.');
    } finally {
      setProgress(null);
      if (inputRef.current) inputRef.current.value = '';
      if (folderInputRef.current) folderInputRef.current.value = '';
    }
  }

  async function removeTrack(track: LocalTrack) {
    if (progress || coverProgress) return;
    if (!window.confirm(`Supprimer « ${track.title} » de la bibliothèque locale ?`)) return;
    try {
      await deleteLocalTrack(track.localId);
      // Retire aussi la piste des likes, de l'historique, des playlists et de la file.
      forgetTrack(track.id);
      setSummary(null);
      await refresh();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Suppression impossible.');
    }
  }

  async function removeAll() {
    if (progress || coverProgress) return;
    if (!window.confirm(`Supprimer les ${tracks.length} fichiers importés ? Cette action est définitive.`)) {
      return;
    }
    try {
      await clearLocalTracks();
      for (const track of tracks) forgetTrack(track.id);
      setFailures([]);
      setSummary(null);
      setCoverNotice(null);
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
          <div className="library-actions">
            {missingCovers > 0 && (
              <button
                className="btn ghost"
                onClick={() => void fetchCovers()}
                disabled={!!progress || !!coverProgress}
              >
                {Icons.image(16)} Récupérer les pochettes ({missingCovers})
              </button>
            )}
            <button
              className="btn ghost danger"
              onClick={removeAll}
              disabled={!!progress || !!coverProgress}
            >
              {Icons.trash(16)} Tout supprimer
            </button>
          </div>
        )}
      </div>

      <section className="dropzone" aria-labelledby="dropzone-title">
        <span className="dropzone-icon" aria-hidden>{Icons.upload(36)}</span>
        <div className="dropzone-copy">
          <h2 id="dropzone-title">Glissez un dossier ou des fichiers audio</h2>
          <p className="muted">
            Un dossier entier est importé album par album ; les fichiers déjà présents sont
            ignorés. MP3, M4A, FLAC, WAV, OGG, OPUS…
          </p>
        </div>
        <div className="dropzone-actions">
          <button
            className="btn accent"
            onClick={() => folderInputRef.current?.click()}
            disabled={!!progress}
          >
            {Icons.folder(16)} Importer un dossier
          </button>
          <button
            className="btn ghost"
            onClick={() => inputRef.current?.click()}
            disabled={!!progress}
          >
            {Icons.plus(16)} Choisir des fichiers
          </button>
        </div>
        <input
          ref={folderInputRef}
          type="file"
          multiple
          onChange={(e) => void handleFiles(e.target.files)}
          style={{ display: 'none' }}
          aria-label="Dossier à importer"
          tabIndex={-1}
        />
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
            <span>
              {progress.phase === 'scan'
                ? progress.total > 0
                  ? `Analyse ${progress.done}/${progress.total}…`
                  : `Analyse du dossier… ${progress.done} fichier${progress.done > 1 ? 's' : ''}`
                : progress.album
                  ? `Album ${progress.album.index}/${progress.album.total}`
                  : `Import ${progress.done}/${progress.total}…`}
            </span>
            <span
              className="muted import-current"
              title={progress.phase === 'import' ? progress.album?.name : progress.current}
            >
              {progress.phase === 'import' ? progress.album?.name : progress.current}
            </span>
          </div>
          <div className={`import-progress-track${progress.total === 0 ? ' indeterminate' : ''}`}>
            <span style={{ width: progress.total ? `${(progress.done / progress.total) * 100}%` : undefined }} />
          </div>
          {progress.phase === 'import' && progress.album && (
            <p className="import-album muted">
              {progress.album.done}/{progress.album.tracks} titre
              {progress.album.tracks > 1 ? 's' : ''} de cet album · {progress.done}/{progress.total} au total
            </p>
          )}
        </div>
      )}

      {coverProgress && (
        <div className="import-progress" role="status" aria-live="polite">
          <div className="import-progress-head">
            <span>
              Pochettes {coverProgress.done}/{coverProgress.total}…
            </span>
            <span className="muted import-current">ID3 APIC · FLAC PICTURE</span>
          </div>
          <div className="import-progress-track">
            <span
              style={{
                width: coverProgress.total
                  ? `${(coverProgress.done / coverProgress.total) * 100}%`
                  : '0%',
              }}
            />
          </div>
        </div>
      )}

      {coverNotice && (
        <div className="import-summary" role="status">
          <div className="import-summary-head">
            <strong>Pochettes intégrées</strong>
            <button className="link-btn" onClick={() => setCoverNotice(null)}>Fermer</button>
          </div>
          <span>{coverNotice}</span>
        </div>
      )}

      {summary && (
        <div className="import-summary" role="status">
          <div className="import-summary-head">
            <strong>Import terminé</strong>
            <button className="link-btn" onClick={() => setSummary(null)}>Fermer</button>
          </div>
          <span>
            {summary.imported} titre{summary.imported > 1 ? 's' : ''} ajouté
            {summary.imported > 1 ? 's' : ''}
            {summary.duplicates > 0 &&
              ` · ${summary.duplicates} doublon${summary.duplicates > 1 ? 's' : ''} ignoré${
                summary.duplicates > 1 ? 's' : ''
              }`}
            {summary.ignored > 0 &&
              ` · ${summary.ignored} fichier${summary.ignored > 1 ? 's' : ''} non audio écarté${
                summary.ignored > 1 ? 's' : ''
              }`}
          </span>
          {summary.albums.length > 1 && (
            <details>
              <summary>Détail par album ({summary.albums.length})</summary>
              <ul>
                {summary.albums.map((album, index) => (
                  <li key={`${album.name}-${index}`}>
                    <span>{album.name}</span> — {album.imported} titre
                    {album.imported > 1 ? 's' : ''}
                    {album.duplicates > 0 && ` · ${album.duplicates} doublon${album.duplicates > 1 ? 's' : ''}`}
                    {album.failed > 0 && ` · ${album.failed} erreur${album.failed > 1 ? 's' : ''}`}
                  </li>
                ))}
              </ul>
            </details>
          )}
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
          <div className="dropzone-actions local-empty-actions">
            <button className="btn accent" onClick={() => folderInputRef.current?.click()}>
              {Icons.folder(16)} Importer un dossier
            </button>
            <button className="btn" onClick={() => inputRef.current?.click()}>
              {Icons.upload(16)} Importer des fichiers
            </button>
          </div>
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
