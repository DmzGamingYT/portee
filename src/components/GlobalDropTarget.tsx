import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { importAudioFiles, type ImportProgress } from '../lib/localLibrary';
import Icons from './icons';

interface ToastMessage {
  text: string;
  kind: 'success' | 'error';
}

/**
 * Dépôt de fichiers audio **n'importe où dans l'application** : les fichiers
 * sont importés dans IndexedDB, puis on ouvre la bibliothèque locale.
 * Les drags internes (file d'attente) ne sont pas concernés : seuls les
 * transferts contenant des fichiers sont interceptés.
 */
export default function GlobalDropTarget() {
  const navigate = useNavigate();
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [message, setMessage] = useState<ToastMessage | null>(null);

  const depth = useRef(0);
  const busy = useRef(false);
  const toastTimer = useRef<number | null>(null);

  useEffect(() => {
    const hasFiles = (event: DragEvent) =>
      Array.from(event.dataTransfer?.types ?? []).includes('Files');

    const resetDrag = () => {
      depth.current = 0;
      setDragging(false);
    };

    const onDragEnter = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth.current += 1;
      setDragging(true);
    };

    const onDragOver = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    };

    const onDragLeave = (event: DragEvent) => {
      // Ne pas exiger `dataTransfer.types` ici : selon les navigateurs, un
      // `dragleave` peut arriver sans types, et l'overlay resterait collé.
      if (depth.current === 0) return;
      // Sortie réelle de la fenêtre : on nettoie sans attendre les compteurs.
      if (event.relatedTarget === null) {
        resetDrag();
        return;
      }
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDragging(false);
    };

    const onDrop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      resetDrag();
      if (busy.current) return;

      const files = Array.from(event.dataTransfer?.files ?? []).filter((file) => file.size > 0);
      if (files.length === 0) return;

      busy.current = true;
      setMessage(null);
      setProgress({ done: 0, total: files.length });

      void (async () => {
        try {
          const result = await importAudioFiles(files, (next) => setProgress({ ...next }));
          const imported = result.tracks.length;
          const failed = result.failures.length;

          setMessage({
            kind: imported > 0 ? 'success' : 'error',
            text:
              imported > 0
                ? `${imported} titre${imported > 1 ? 's' : ''} importé${imported > 1 ? 's' : ''}${
                    failed > 0 ? ` · ${failed} fichier${failed > 1 ? 's' : ''} ignoré${failed > 1 ? 's' : ''}` : ''
                  }`
                : failed > 0
                  ? `Aucun fichier importé · ${result.failures[0]?.reason ?? 'format non reconnu'}`
                  : 'Aucun fichier audio détecté.',
          });

          if (imported > 0) navigate('/local');
        } catch (err) {
          setMessage({
            kind: 'error',
            text: err instanceof Error ? err.message : 'Import impossible.',
          });
        } finally {
          busy.current = false;
          setProgress(null);
          if (toastTimer.current) window.clearTimeout(toastTimer.current);
          toastTimer.current = window.setTimeout(() => setMessage(null), 5000);
        }
      })();
    };

    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    window.addEventListener('dragend', resetDrag);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
      window.removeEventListener('dragend', resetDrag);
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, [navigate]);

  if (!dragging && !progress && !message) return null;

  return (
    <>
      {dragging && (
        <div className="drop-overlay" aria-hidden>
          <div className="drop-overlay-card">
            {Icons.upload(42)}
            <strong>Déposez vos fichiers audio</strong>
            <span>MP3 · M4A · FLAC · WAV · OGG · OPUS</span>
            <small>Les fichiers restent sur cet appareil.</small>
          </div>
        </div>
      )}

      {progress && (
        <div className="import-toast" role="status" aria-live="polite">
          <span className="spinner" aria-hidden />
          <span className="import-toast-text">
            Import {progress.done}/{progress.total}…
            {progress.current && <small title={progress.current}>{progress.current}</small>}
          </span>
        </div>
      )}

      {message && !progress && (
        <div className={`import-toast ${message.kind}`} role="status" aria-live="polite">
          <span className="import-toast-text">{message.text}</span>
          <button
            className="icon-btn small"
            onClick={() => setMessage(null)}
            aria-label="Fermer le message"
          >
            {Icons.close(14)}
          </button>
        </div>
      )}
    </>
  );
}
