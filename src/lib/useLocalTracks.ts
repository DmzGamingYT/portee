import { useCallback, useEffect, useState } from 'react';
import { listLocalTracks, LOCAL_CHANGED_EVENT, type LocalTrack } from './localLibrary';

/** Charge la bibliothèque locale et se rafraîchit après chaque import/suppression. */
export function useLocalTracks() {
  const [tracks, setTracks] = useState<LocalTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const list = await listLocalTracks();
      setTracks(list);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Bibliothèque locale indisponible dans ce navigateur.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onChange = () => void refresh();
    window.addEventListener(LOCAL_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(LOCAL_CHANGED_EVENT, onChange);
  }, [refresh]);

  return { tracks, loading, error, refresh };
}
