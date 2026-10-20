import type { Track } from '../types';

/**
 * Export d'une playlist au format **M3U étendu**, lisible par VLC, foobar2000,
 * Winamp, Rekordbox… — sans serveur : le fichier est fabriqué dans le
 * navigateur puis téléchargé.
 *
 * Les morceaux importés localement pointent vers leur nom de fichier ; ceux du
 * catalogue (extraits de 30 s) pointent vers l'extrait, seul flux audio
 * disponible. Un titre sans fichier ni extrait laisse une ligne de commentaire :
 * les lecteurs l'ignorent au lieu d'afficher une entrée cassée.
 */

const M3U_MIME = 'audio/x-mpegurl';

/** Secondes entières, jamais négatives (format `#EXTINF`). */
function seconds(durationMs: number | undefined): number {
  return Math.max(0, Math.round((durationMs ?? 0) / 1000));
}

/** Un nom M3U ne doit jamais contenir de retour à la ligne. */
function flat(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

export function playlistToM3u(name: string, tracks: readonly Track[]): string {
  const lines = ['#EXTM3U', `#PLAYLIST:${flat(name)}`];

  for (const track of tracks) {
    const label = `${flat(track.artist)} - ${flat(track.title)}`;
    lines.push(`#EXTINF:${seconds(track.durationMs)},${label}`);

    const target = track.localFileName || track.preview || '';
    if (target) lines.push(flat(target));
    else lines.push(`# Sans fichier local ni extrait : ${label}`);
  }

  return `${lines.join('\n')}\n`;
}

/** Nom de fichier sûr et lisible pour le téléchargement. */
export function m3uFileName(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return `${slug || 'playlist'}.m3u`;
}

/** Déclenche le téléchargement de la playlist (aucune donnée n'est envoyée). */
export function downloadPlaylist(name: string, tracks: readonly Track[]): void {
  const blob = new Blob([playlistToM3u(name, tracks)], { type: M3U_MIME });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = m3uFileName(name);
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
  // Laisse au navigateur le temps de démarrer le téléchargement.
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}
