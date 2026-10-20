/**
 * Visualiseur de spectre : lit l'analyseur du graphe Web Audio et dessine des
 * barres sur un canvas.
 *
 * - Repos tant qu'aucun son n'a été joué (`currentAnalyser()` renvoie null).
 * - Un seul `requestAnimationFrame`, coupé quand l'onglet est masqué ou quand
 *   le panneau est fermé (le composant est alors démonté).
 * - `prefers-reduced-motion` : même rendu, mais rafraîchi 4 fois par seconde
 *   au lieu de 60, sans interpolation.
 */
import { useEffect, useRef } from 'react';
import { currentAnalyser } from '../../lib/audioGraph';

const BARS = 44;
const F_MIN = 40;
const F_MAX = 16000;

export default function Visualizer({ playing }: { playing: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let width = 0;
    let height = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, Math.round(rect.width));
      height = Math.max(1, Math.round(rect.height));
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const color = getComputedStyle(canvas).color || '#1ed760';
    const levels = new Float32Array(BARS);
    // Bornes de bins par barre : échelle logarithmique, comme l'oreille.
    const ranges: Array<[number, number]> = [];
    const analyser = currentAnalyser();
    const binCount = analyser?.frequencyBinCount ?? 512;
    const sampleRate = analyser?.context.sampleRate ?? 44100;
    const hzPerBin = sampleRate / 2 / binCount;
    for (let i = 0; i < BARS; i++) {
      const lo = F_MIN * Math.pow(F_MAX / F_MIN, i / BARS);
      const hi = F_MIN * Math.pow(F_MAX / F_MIN, (i + 1) / BARS);
      const from = Math.max(1, Math.floor(lo / hzPerBin));
      const to = Math.max(from + 1, Math.min(binCount - 1, Math.ceil(hi / hzPerBin)));
      ranges.push([from, to]);
    }

    const data = new Uint8Array(binCount);

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      const live = currentAnalyser();

      if (live) {
        live.getByteFrequencyData(data);
        for (let i = 0; i < BARS; i++) {
          const [from, to] = ranges[i];
          let peak = 0;
          for (let b = from; b < to && b < data.length; b++) {
            if (data[b] > peak) peak = data[b];
          }
          const target = Math.pow(peak / 255, 1.35);
          levels[i] = reduced ? target : Math.max(target, levels[i] * 0.82);
        }
      } else {
        for (let i = 0; i < BARS; i++) levels[i] *= 0.9;
      }

      const gap = 2;
      const barWidth = Math.max(1, (width - gap * (BARS - 1)) / BARS);
      ctx.fillStyle = color;
      for (let i = 0; i < BARS; i++) {
        const h = Math.max(1.5, levels[i] * (height - 6));
        const x = i * (barWidth + gap);
        const y = height - h;
        ctx.globalAlpha = playing ? 0.35 + levels[i] * 0.65 : 0.28;
        if (typeof ctx.roundRect === 'function') {
          ctx.beginPath();
          ctx.roundRect(x, y, barWidth, h, Math.min(2, barWidth / 2));
          ctx.fill();
        } else {
          ctx.fillRect(x, y, barWidth, h);
        }
      }
      ctx.globalAlpha = 1;
    };

    let raf = 0;
    let timer = 0;

    const loop = () => {
      draw();
      raf = requestAnimationFrame(loop);
    };

    const start = () => {
      if (reduced) {
        draw();
        timer = window.setInterval(draw, 250);
      } else {
        raf = requestAnimationFrame(loop);
      }
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      window.clearInterval(timer);
      raf = 0;
      timer = 0;
    };

    start();
    const onVisibility = () => {
      if (document.hidden) stop();
      else if (!raf && !timer) start();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stop();
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [playing]);

  return <canvas className="eq-viz" ref={canvasRef} aria-hidden />;
}
