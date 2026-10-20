/**
 * Graphe Web Audio unique, branché sur la balise `<audio>` du lecteur.
 *
 *   <audio> → 10 filtres peaking → gain maître → analyseur → sortie
 *
 * Pourquoi un seul graphe : `createMediaElementSource` ne peut être appelé
 * qu'une fois par élément — un second appel lève `InvalidStateError`. Le graphe
 * est donc créé à la demande puis réutilisé, et l'analyseur exposé aux
 * composants (visualiseur) via `currentAnalyser()`.
 *
 * L'élément doit être chargé en CORS (`crossOrigin="anonymous"`) : sans cela le
 * navigateur coupe le son dès qu'un média distant passe dans le Web Audio. Le
 * CDN des extraits iTunes renvoie `Access-Control-Allow-Origin: *`, et les
 * fichiers locaux sont des blobs de même origine : les deux sont sûr.
 */
import { EQ_BANDS, normalizeGains } from './equalizer';

export interface AudioGraph {
  context: AudioContext;
  analyser: AnalyserNode;
  /** Applique les gains (dB) — `enabled: false` remet tout à plat. */
  applyEq: (gains: readonly number[], enabled: boolean) => void;
}

let graph: AudioGraph | null = null;
/** Échec définitif (Web Audio indisponible) : on n'essaie pas à chaque rendu. */
let failed = false;

type AudioContextCtor = typeof AudioContext;

function contextCtor(): AudioContextCtor | null {
  const w = window as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/** Crée le graphe au premier besoin, ou renvoie celui déjà en place. */
export function ensureAudioGraph(media: HTMLAudioElement): AudioGraph | null {
  if (graph) return graph;
  if (failed) return null;

  const Ctor = contextCtor();
  if (!Ctor) {
    failed = true;
    return null;
  }

  try {
    const context = new Ctor();
    const source = context.createMediaElementSource(media);

    // Chaîne de filtres : chaque bande reste active à 0 dB, ce qui laisse le
    // son strictement identique quand l'égaliseur est « plat ».
    const filters = EQ_BANDS.map((frequency) => {
      const node = context.createBiquadFilter();
      node.type = 'peaking';
      node.frequency.value = frequency;
      // Q ≈ 1,1 : bandes d'une octave, sans trou entre deux réglages voisins.
      node.Q.value = 1.1;
      node.gain.value = 0;
      return node;
    });

    const master = context.createGain();
    master.gain.value = 1;

    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.78;
    analyser.minDecibels = -88;
    analyser.maxDecibels = -12;

    source.connect(filters[0]);
    for (let i = 0; i < filters.length - 1; i++) filters[i].connect(filters[i + 1]);
    filters[filters.length - 1].connect(master);
    master.connect(analyser);
    analyser.connect(context.destination);

    graph = {
      context,
      analyser,
      applyEq: (gains, enabled) => {
        const values = normalizeGains(gains);
        filters.forEach((node, i) => {
          const target = enabled ? values[i] : 0;
          // Rampe courte : un curseur déplacé ne fait pas « claquer » le son.
          node.gain.setTargetAtTime(target, context.currentTime, 0.02);
        });
      },
    };
    return graph;
  } catch {
    failed = true;
    return null;
  }
}

/** Analyseur actif, ou `null` tant qu'aucun son n'a été joué. */
export function currentAnalyser(): AnalyserNode | null {
  return graph?.analyser ?? null;
}

/**
 * Réveille le contexte. À appeler sur un geste utilisateur : les navigateurs
 * créent l'AudioContext en `suspended`, et un contexte suspendu rendrait le son
 * muet alors que la balise, elle, joue.
 */
export function resumeAudioGraph(): void {
  const context = graph?.context;
  if (!context || context.state === 'running') return;
  void context.resume().catch(() => {
    // refus (politique d'autoplay) : le prochain clic réessaiera
  });
}

/** État lisible du contexte, pour l'interface (« son traité » / « non traité »). */
export function audioGraphState(): 'running' | 'suspended' | 'absent' {
  if (!graph) return 'absent';
  return graph.context.state === 'running' ? 'running' : 'suspended';
}
