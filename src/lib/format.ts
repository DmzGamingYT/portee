/** « 3:45 » à partir de millisecondes (durée complète de la piste). */
export function fmtDuration(ms?: number): string {
  if (!ms || ms <= 0) return '—';
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** « 0:07 » à partir de secondes (position dans l'extrait). */
export function fmtClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** « 1 h 12 min » à partir de millisecondes (durée d'une playlist). */
export function fmtTotal(ms: number): string {
  if (ms <= 0) return '0 min';
  const min = Math.round(ms / 60000);
  if (min >= 60) {
    const h = Math.floor(min / 60);
    const rest = min % 60;
    return rest ? `${h} h ${rest} min` : `${h} h`;
  }
  return `${min} min`;
}

/** Dégradé CSS stable dérivé d'une chaîne (id ou nom), esthétique Spotify. */
export function gradientOf(seed: string): string {
  const hue = [...seed].reduce((acc, c) => (acc * 31 + c.charCodeAt(0)) % 360, 7);
  return `linear-gradient(135deg, hsl(${hue} 70% 45%), hsl(${(hue + 60) % 360} 70% 30%))`;
}
