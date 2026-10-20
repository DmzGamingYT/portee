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

/** « 12,4 Mo » à partir d'un nombre d'octets. */
export function fmtBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 octet';
  const units = ['octet', 'Ko', 'Mo', 'Go', 'To'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = unit === 0 || value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  const label = `${String(rounded).replace('.', ',')} ${units[unit]}`;
  return unit === 0 && rounded > 1 ? `${label}s` : label;
}

/**
 * Dégradé CSS stable dérivé d'une chaîne (id ou nom), esthétique Spotify.
 *
 * Les teintes restent volontairement sombres et peu saturées : le titre de la
 * bannière est écrit en blanc, il doit rester lisible, et un aplat clair jure
 * avec le fond sombre du reste de l'application.
 */
export function gradientOf(seed: string): string {
  const hue = [...seed].reduce((acc, c) => (acc * 31 + c.charCodeAt(0)) % 360, 7);
  return `linear-gradient(135deg, hsl(${hue} 56% 34%), hsl(${(hue + 22) % 360} 60% 21%))`;
}
