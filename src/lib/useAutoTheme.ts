import { useEffect } from 'react';

/**
 * Thème **automatique** : l'application suit la préférence jour/nuit du
 * système (`prefers-color-scheme`) et n'expose aucune bascule manuelle.
 *
 * Le premier rendu est déjà correct — `index.html` applique le même choix
 * avant la peinture, ce qui évite tout flash clair/sombre — et ce hook ne fait
 * que suivre les changements de réglage pendant la session.
 */

export type ThemeName = 'dark' | 'light';

const LIGHT_QUERY = '(prefers-color-scheme: light)';

/** Couleur de la barre système (`theme-color`) associée à chaque thème. */
const THEME_COLOR: Record<ThemeName, string> = { dark: '#121212', light: '#f6f6f6' };

/** Résout le thème depuis la préférence système (pur, donc testable). */
export function themeFromMatches(prefersLight: boolean): ThemeName {
  return prefersLight ? 'light' : 'dark';
}

/** Applique un thème au document : attribut `data-theme` + couleur système. */
export function applyTheme(theme: ThemeName): void {
  document.documentElement.dataset.theme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', THEME_COLOR[theme]);
}

/** Installe le thème automatique et le maintient synchronisé au système. */
export function useAutoTheme(): void {
  useEffect(() => {
    const media = window.matchMedia(LIGHT_QUERY);
    const sync = () => applyTheme(themeFromMatches(media.matches));
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);
}
