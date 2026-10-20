import { useRef, type ReactNode } from 'react';
import { useStore } from '../store';
import type { ThemeMode } from '../lib/useAutoTheme';
import Icons from './icons';

/**
 * Menu de préférences du pied de sidebar : choix du thème.
 *
 * Il n'y a **pas** de bascule dans la barre du haut : le thème se règle ici,
 * avec « Suivre le système » comme défaut. Le choix est mémorisé (store
 * persistant) et appliqué avant la peinture par `index.html`, donc sans flash.
 */

const OPTIONS: ReadonlyArray<{ value: ThemeMode; label: string; hint: string; icon: ReactNode }> = [
  { value: 'auto', label: 'Suivre le système', hint: 'Jour ou nuit selon l’appareil', icon: Icons.monitor(16) },
  { value: 'light', label: 'Clair', hint: 'Toujours clair', icon: Icons.sun(16) },
  { value: 'dark', label: 'Sombre', hint: 'Toujours sombre', icon: Icons.moon(16) },
];

export default function PreferencesMenu() {
  const themeMode = useStore((s) => s.themeMode);
  const setThemeMode = useStore((s) => s.setThemeMode);
  const menu = useRef<HTMLDetailsElement>(null);

  const choose = (mode: ThemeMode) => {
    setThemeMode(mode);
    // Un choix fait, on referme : le changement de thème est déjà visible.
    menu.current?.removeAttribute('open');
  };

  return (
    <details className="menu prefs-menu" ref={menu}>
      <summary className="side-link prefs-summary" aria-label="Préférences" title="Préférences">
        {Icons.settings(20)} <span>Préférences</span>
      </summary>

      <div className="menu-body prefs-body">
        <div className="prefs-title">Thème</div>
        <div role="radiogroup" aria-label="Thème" className="prefs-options">
          {OPTIONS.map((option) => (
            <label key={option.value} className="menu-item prefs-radio">
              <input
                type="radio"
                name="theme-mode"
                value={option.value}
                checked={themeMode === option.value}
                onChange={() => choose(option.value)}
              />
              <span className="prefs-icon" aria-hidden>
                {option.icon}
              </span>
              <span className="prefs-label">
                {option.label}
                <small>{option.hint}</small>
              </span>
            </label>
          ))}
        </div>
      </div>
    </details>
  );
}
