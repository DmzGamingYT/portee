/**
 * Panneau « Égaliseur » : visualiseur de spectre + 10 curseurs verticaux,
 * presets et marche/arrêt.
 *
 * Les gains vivent dans le store (persistés) ; `AudioEngine` les applique aux
 * filtres du graphe Web Audio, donc les réglages suivent d'un titre à l'autre
 * et d'une session à l'autre. Comme les autres panneaux, il n'est monté que
 * lorsqu'il est ouvert : le visualiseur ne tourne pas en arrière-plan.
 */
import { useEffect, useRef, type CSSProperties } from 'react';
import { useStore, currentTrack } from '../../store';
import {
  EQ_BANDS,
  EQ_GAIN_MAX,
  EQ_GAIN_MIN,
  EQ_PRESETS,
  bandLabel,
  formatGain,
} from '../../lib/equalizer';
import Icons from '../icons';
import Visualizer from './Visualizer';

export default function EqPanel({ onClose }: { onClose: () => void }) {
  const gains = useStore((s) => s.eqGains);
  const enabled = useStore((s) => s.eqEnabled);
  const preset = useStore((s) => s.eqPreset);
  const playing = useStore((s) => s.playing);
  const track = useStore(currentTrack);
  const toggleEq = useStore((s) => s.toggleEq);
  const setEqGain = useStore((s) => s.setEqGain);
  const setEqPreset = useStore((s) => s.setEqPreset);
  const resetEq = useStore((s) => s.resetEq);

  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.focus();
    return () => previous?.focus?.();
  }, []);

  return (
    <>
      <button className="queue-backdrop" aria-label="Fermer l’égaliseur" onClick={onClose} tabIndex={-1} />
      <aside
        ref={panelRef}
        className="eq-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Égaliseur"
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            onClose();
            return;
          }
          if (e.key !== 'Tab') return;
          const panel = panelRef.current;
          if (!panel) return;
          const focusables = Array.from(
            panel.querySelectorAll<HTMLElement>('button, [href], input, [tabindex]:not([tabindex="-1"])')
          ).filter((el) => !el.hasAttribute('disabled') && el.offsetParent !== null);
          if (focusables.length === 0) return;
          const first = focusables[0];
          const last = focusables[focusables.length - 1];
          if (e.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }}
      >
        <header className="eq-head">
          <div className="eq-head-text">
            <h2>Égaliseur</h2>
            <span className="eq-sub">
              {track ? track.title : 'Aucune lecture'}
              {enabled ? ' · courbe appliquée' : ' · neutre'}
            </span>
          </div>
          <button className="icon-btn" onClick={onClose} title="Fermer (Échap)" aria-label="Fermer">
            {Icons.close(20)}
          </button>
        </header>

        <div className="eq-viz-wrap">
          <Visualizer playing={playing} />
        </div>

        <div className="eq-toolbar">
          <button
            className={`eq-switch ${enabled ? 'on' : ''}`}
            role="switch"
            aria-checked={enabled}
            onClick={toggleEq}
            title={enabled ? 'Désactiver l’égaliseur' : 'Activer l’égaliseur'}
          >
            <span className="eq-switch-track" aria-hidden>
              <span className="eq-switch-thumb" />
            </span>
            {enabled ? 'Actif' : 'Inactif'}
          </button>

          <button className="btn ghost small" onClick={resetEq} title="Remettre toutes les bandes à 0 dB">
            {Icons.repeatAll(14)} Réinitialiser
          </button>
        </div>

        <div className="chipbar eq-presets" role="group" aria-label="Presets d’égalisation">
          {EQ_PRESETS.map((option) => (
            <button
              key={option.id}
              className={`chip ${preset === option.id ? 'chip-active' : ''}`}
              aria-pressed={preset === option.id}
              onClick={() => setEqPreset(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className={`eq-bands ${enabled ? '' : 'is-off'}`}>
          {EQ_BANDS.map((hz, i) => {
            const gain = gains[i];
            // Curseur bipolaire : le remplissage part du centre (0 dB).
            const position = ((gain - EQ_GAIN_MIN) / (EQ_GAIN_MAX - EQ_GAIN_MIN)) * 100;
            const style = {
              '--eq-a': `${Math.min(50, position)}%`,
              '--eq-b': `${Math.max(50, position)}%`,
            } as CSSProperties;
            return (
              <label className="eq-band" key={hz}>
                <span className="eq-db">{formatGain(gain)}</span>
                <span className="eq-rail">
                  <input
                    className="eq-slider"
                    type="range"
                    min={EQ_GAIN_MIN}
                    max={EQ_GAIN_MAX}
                    step={0.5}
                    value={gain}
                    style={style}
                    onChange={(e) => setEqGain(i, Number(e.target.value))}
                    aria-label={`${bandLabel(hz)} hertz`}
                    aria-valuetext={`${formatGain(gain)} décibels`}
                  />
                </span>
                <span className="eq-hz">{bandLabel(hz)}</span>
              </label>
            );
          })}
        </div>

        <p className="eq-note muted">
          {enabled
            ? 'Réglage appliqué en direct au moteur audio, mémorisé sur cet appareil.'
            : 'Courbe neutre : le son n’est pas modifié. Bougez un curseur ou activez pour écouter.'}
        </p>
      </aside>
    </>
  );
}
