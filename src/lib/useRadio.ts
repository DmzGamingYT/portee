import { useEffect, useRef } from 'react';
import type { Track } from '../types';
import { useStore } from '../store';
import { artistTopSongs } from '../api/itunes';
import { unifiedSearchTracks } from '../api/search';
import { RADIO_MAX_QUEUE, radioCandidates, radioSources, type RadioSource } from './radio';

/**
 * Radio continue : prolonge la file avant qu'elle ne s'arrête.
 *
 * Le déclenchement se fait **deux titres avant la fin** : un extrait dure
 * ~30 s, la requête a donc largement le temps d'aboutir sans coupure. On
 * interroge les titres populaires du même artiste (lookup iTunes) et, si le
 * genre est connu, ceux de sa famille musicale. Tout est filtré par
 * `radioCandidates` : aucune reprise en double, aucun doublon d'édition.
 *
 * Le mode est désactivé quand « répéter tout/ce titre » est actif (la file se
 * suffit à elle-même) et respecte un plafond de file pour ne pas croître sans
 * fin. Une tentative ratée par morceau n'est pas rejouée en boucle.
 */

/** Nombre de titres restants qui déclenche la prolongation. */
const AHEAD = 2;
/** Titres ajoutés à chaque prolongation. */
const BATCH = 10;
/** Historique récent écarté de la radio (on ne rejoue pas ce qu'on vient d'écouter). */
const HISTORY_EXCLUDE = 20;
/** Plafond de tentatives mémorisées (évite une croissance sans borne). */
const ATTEMPTS_MAX = 200;
/**
 * Requêtes successives autorisées pour un même titre en cours. Un catalogue
 * pauvre peut ne renvoyer qu'un titre à la fois : sans ce garde-fou, la radio
 * enchaînerait les requêtes sans jamais vraiment remplir la file.
 */
const BURST_MAX = 3;

async function fetchSource(source: RadioSource): Promise<Track[]> {
  if (source.kind === 'artist' && 'artistId' in source) {
    return artistTopSongs(source.artistId, 40);
  }
  const result = await unifiedSearchTracks(source.term);
  return result.tracks;
}

export interface RadioRequest {
  queue: Track[];
  excludeIds: string[];
}

/**
 * Récupère les prochains titres de la radio pour `seed` (le dernier morceau de
 * la file). Une source injoignable ne bloque pas l'autre.
 */
export async function loadRadioTracks(seed: Track, request: RadioRequest): Promise<Track[]> {
  const sources = radioSources(seed);
  if (sources.length === 0) return [];

  const results = await Promise.allSettled(sources.map((source) => fetchSource(source)));
  const lists = results
    .filter((result): result is PromiseFulfilledResult<Track[]> => result.status === 'fulfilled')
    .map((result) => result.value);

  return radioCandidates(lists, {
    queue: request.queue,
    excludeIds: request.excludeIds,
    limit: BATCH,
  });
}

/** À monter une seule fois (dans le gabarit) : surveille la fin de file. */
export function useRadio(): void {
  const enabled = useStore((s) => s.radio);
  const repeat = useStore((s) => s.repeat);
  const queue = useStore((s) => s.queue);
  const index = useStore((s) => s.index);
  const appendToQueue = useStore((s) => s.appendToQueue);

  const inFlight = useRef(false);
  const attempted = useRef(new Set<string>());
  // Compteur de requêtes enchaînées sans changement de piste.
  const burst = useRef({ index: -1, count: 0 });

  // Le dernier morceau de la file est celui auquel la suite doit ressembler :
  // c'est lui qui sera en cours quand les titres ajoutés commenceront.
  const seed = queue.length > 0 ? queue[queue.length - 1] : null;
  const remaining = index >= 0 ? queue.length - 1 - index : queue.length;
  const active =
    enabled &&
    repeat === 'off' &&
    seed !== null &&
    queue.length < RADIO_MAX_QUEUE &&
    remaining <= AHEAD;

  // Réactiver la radio après un échec réseau doit retenter tout de suite.
  useEffect(() => {
    if (!enabled) {
      attempted.current.clear();
      burst.current = { index: -1, count: 0 };
    }
  }, [enabled]);

  useEffect(() => {
    if (!active || !seed) return;

    if (burst.current.index !== index) burst.current = { index, count: 0 };
    if (burst.current.count >= BURST_MAX) return;

    // Une seule tentative par (morceau, longueur de file) : si le catalogue ne
    // renvoie rien, on ne relance pas la requête à chaque rendu.
    const key = `${seed.id}:${queue.length}`;
    if (inFlight.current || attempted.current.has(key)) return;
    if (attempted.current.size >= ATTEMPTS_MAX) attempted.current.clear();
    attempted.current.add(key);
    burst.current.count += 1;

    inFlight.current = true;
    const state = useStore.getState();

    loadRadioTracks(seed, {
      queue: state.queue,
      excludeIds: state.history.slice(0, HISTORY_EXCLUDE).map((t) => t.id),
    })
      .then((tracks) => {
        if (tracks.length === 0) return;
        // La radio a pu être coupée pendant la requête : on respecte le choix.
        if (!useStore.getState().radio) return;
        appendToQueue(tracks);
      })
      .catch(() => {
        // Réseau indisponible : la file s'arrêtera simplement à la fin,
        // comme avant, et une prochaine lecture retentera.
      })
      .finally(() => {
        inFlight.current = false;
      });
  }, [active, seed, queue.length, index, appendToQueue]);
}
