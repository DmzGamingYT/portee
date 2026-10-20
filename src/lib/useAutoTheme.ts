import { useEffect } from 'react';

/**
 * Thème de l'application.
 *
 * - `auto` (défaut) : suit la préférence jour/nuit du système ;
 * - `light` / `dark` : choisis dans le menu de préférences.
 *
 * Le premier rendu est déjà correct — `index.html` applique le choix mémorisé
 * avant la peinture, ce qui évite tout flash clair/sombre — et ce hook ne fait
 * que suivre les changements de réglage pendant la session.
 */

export type ThemeMode = 'auto' | 'dark' | 'light';
export type ThemeName = 'dark' | 'light';

const LIGHT_QUERY = '(prefers-color-scheme: light)';

/** Couleur de la barre système (`theme-color`) associée à chaque thème. */
const THEME_COLOR: Record<ThemeName, string> = { dark: '#121212', light: '#f6f6f6' };

/** Résout le thème affiché à partir du mode choisi (pur, donc testable). */
export function resolveTheme(mode: ThemeMode, prefersLight: boolean): ThemeName {
  if (mode === 'auto') return prefersLight ? 'light' : 'dark';
  return mode;
}

/** Applique un thème au document : attribut `data-theme` + couleur système. */
export function applyTheme(theme: ThemeName): void {
  document.documentElement.dataset.theme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', THEME_COLOR[theme]);
}

/**
 * Applique le thème choisi et le maintient à jour : en mode `auto`, il suit
 * les changements du système ; en mode forcé, il les ignore.
 */
export function useAutoTheme(mode: ThemeMode = 'auto'): void {
  useEffect(() => {
    const media = window.matchMedia(LIGHT_QUERY);
    const sync = () => applyTheme(resolveTheme(mode, media.matches));
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, [mode]);
}
