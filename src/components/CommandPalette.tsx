import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { unifiedSearch } from '../api/search';
import { useLocalTracks } from '../lib/useLocalTracks';
import { gradientOf } from '../lib/format';
import { commandScore, rankEntries, type CommandEntry } from '../lib/commandPalette';
import { isPlayable } from '../lib/tracks';
import type { Album, Artist, Track } from '../types';
import Icons from './icons';

/**
 * Palette de commandes (⌘K / Ctrl+K).
 *
 * Un seul champ pour tout faire au clavier : lancer un titre du catalogue ou
 * un fichier local, ouvrir un album, un artiste, une playlist, et naviguer.
 * Le filtrage local (raccourcis, playlists, fichiers importés) est instantané ;
 * le catalogue est interrogé après une courte attente et seulement au-delà de
 * deux caractères, avec annulation de la requête précédente.
 *
 * Le composant n'est monté que lorsque la palette est ouverte : la lecture
 * d'IndexedDB et les requêtes réseau n'ont lieu qu'à ce moment-là.
 */
export default function CommandPalette({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const play = useStore((s) => s.play);
  const playlists = useStore((s) => s.playlists);
  const { tracks: localTracks } = useLocalTracks();

  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const [remote, setRemote] = useState<{
    q: string;
    tracks: Track[];
    albums: Album[];
    artists: Artist[];
    failed: boolean;
  } | null>(null);
  const [searching, setSearching] = useState(false);

  const term = query.trim();

  // Sur téléphone, le champ n'a pas la place d'annoncer les cinq types de
  // résultats : on garde les quatre qui tiennent sans troncature.
  const [compact, setCompact] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    const onChange = () => setCompact(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Une palette ouverte doit être utilisable tout de suite : le champ a le focus.
  // À la fermeture, on rend le focus à l'élément qui l'avait ouverte (bouton ou
  // champ de recherche), sinon le clavier repart de zéro.
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    inputRef.current?.focus();
    return () => previous?.focus?.();
  }, []);

  // Catalogue : debounce + annulation, jamais sous deux caractères.
  useEffect(() => {
    if (term.length < 2) {
      setRemote(null);
      setSearching(false);
      return;
    }
    const ctrl = new AbortController();
    setSearching(true);
    const timer = window.setTimeout(() => {
      unifiedSearch(term, ctrl.signal)
        .then((res) => {
          if (ctrl.signal.aborted) return;
          setRemote({
            q: term,
            tracks: res.tracks,
            albums: res.albums.slice(0, 4),
            artists: res.artists.slice(0, 4),
            failed: false,
          });
        })
        .catch(() => {
          if (ctrl.signal.aborted) return;
          setRemote({ q: term, tracks: [], albums: [], artists: [], failed: true });
        })
        .finally(() => {
          if (!ctrl.signal.aborted) setSearching(false);
        });
    }, 220);

    return () => {
      window.clearTimeout(timer);
      ctrl.abort();
    };
  }, [term]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  const close = useCallback(() => onClose(), [onClose]);
  const go = useCallback(
    (to: string) => {
      onClose();
      navigate(to);
    },
    [navigate, onClose]
  );

  const items = useMemo<PaletteItem[]>(() => {
    // Deux familles : ce que l'utilisateur possède déjà (raccourcis, playlists,
    // fichiers locaux) passe avant le catalogue distant, dont les résultats
    // arrivent après une requête réseau.
    const own: PaletteSection[] = [];
    const catalogue: PaletteSection[] = [];

    const shortcuts: PaletteItem[] = SHORTCUTS.map((s) => ({
      id: s.id,
      group: 'Raccourcis',
      label: s.label,
      detail: s.detail,
      keywords: s.keywords,
      icon: s.icon,
      run: () => go(s.to),
    }));

    const playlistItems: PaletteItem[] = playlists.map((p) => ({
      id: `playlist-${p.id}`,
      group: 'Playlists',
      label: p.name,
      detail: `${p.tracks.length} titre${p.tracks.length > 1 ? 's' : ''}`,
      cover: p.tracks[0]?.cover,
      icon: Icons.note(18),
      // Une playlist contient déjà ses titres : Entrée la lance directement.
      // Une playlist vide (ou sans extrait lisible) ouvre sa page, où le
      // bouton de lecture explique ce qui manque.
      run: () => {
        if (p.tracks.some(isPlayable)) {
          close();
          play(p.tracks, 0, p.name);
        } else {
          go(`/playlist/${p.id}`);
        }
      },
    }));

    const localItems: PaletteItem[] = localTracks.map((t) => ({
      id: `local-${t.localId}`,
      group: 'Ma musique locale',
      label: t.title,
      detail: [t.artist, t.album].filter(Boolean).join(' · '),
      cover: t.cover,
      icon: Icons.disc(18),
      tag: 'Local',
      run: () => go('/local'),
    }));

    const localRanked = cap(rankEntries(localItems, term), term ? 8 : 5);
    // Le contexte de lecture suit l'ordre affiché : on enchaîne sur le titre
    // suivant de la liste filtrée, pas de la bibliothèque entière.
    const localById = new Map(localTracks.map((t) => [`local-${t.localId}`, t]));
    const localContext = localRanked
      .map((item) => localById.get(item.id))
      .filter((t): t is NonNullable<typeof t> => Boolean(t));
    localRanked.forEach((item, index) => {
      const track = localById.get(item.id);
      if (!track) return;
      item.run = () => {
        close();
        play(localContext, index, 'Ma musique locale');
      };
    });

    addSection(own, rankEntries(shortcuts, term), term ? 4 : SHORTCUTS.length, term);
    addSection(own, rankEntries(playlistItems, term), 6, term);
    addSection(own, localRanked, localRanked.length, term);

    const fresh = remote && remote.q === term ? remote : null;
    if (fresh) {
      const trackItems: PaletteItem[] = fresh.tracks.slice(0, 8).map((track, index) => {
        // Un titre sans extrait ni fichier local resterait silencieux : on le
        // signale et on explique, comme une ligne de résultat grisée.
        const playable = isPlayable(track);
        return {
          id: `track-${track.id}`,
          group: 'Titres',
          label: track.title,
          detail: `${track.artist}${track.album ? ` · ${track.album}` : ''}`,
          cover: track.cover,
          icon: Icons.note(18),
          tag: playable ? undefined : 'Sans extrait',
          mutedTag: !playable,
          unplayable: !playable,
          run: () => {
            close();
            if (!playable) {
              useStore.setState({
                audioError: `« ${track.title} » n’a pas d’extrait audio lisible.`,
              });
              return;
            }
            play(fresh.tracks, Math.max(0, index), `Recherche : ${fresh.q}`);
          },
        };
      });

      const albumItems: PaletteItem[] = fresh.albums.map((album) => ({
        id: `album-${album.id}`,
        group: 'Albums',
        label: album.title,
        detail: [album.artist, album.year].filter(Boolean).join(' · '),
        cover: album.cover,
        icon: Icons.disc(18),
        run: () => go(`/album/${album.id}`),
      }));

      const artistItems: PaletteItem[] = fresh.artists.map((artist) => ({
        id: `artist-${artist.id}`,
        group: 'Artistes',
        label: artist.name,
        detail: artist.genre ?? 'Artiste',
        cover: artist.cover,
        icon: Icons.person(18),
        initial: artist.name.trim().charAt(0).toUpperCase(),
        seed: artist.id,
        round: true,
        run: () => go(`/artist/${artist.id}`),
      }));

      addSection(catalogue, trackItems, 8, term);
      addSection(catalogue, albumItems, 4, term);
      addSection(catalogue, artistItems, 4, term);
    }

    // Chaque famille est ordonnée par sa meilleure correspondance : une
    // playlist dont le nom colle à la saisie passe devant un raccourci qui ne
    // correspond que par sa description.
    const byScore = (sections: PaletteSection[]) =>
      sections
        .map((section, index) => ({ section, index }))
        .sort((a, b) => b.section.best - a.section.best || a.index - b.index)
        .map(({ section }) => section);

    const flat = [...byScore(own), ...byScore(catalogue)].flatMap(
      (section) => section.items
    );

    if (term) {
      flat.push({
        id: 'catalogue-search',
        group: 'Catalogue',
        label: `Voir tous les résultats pour « ${term} »`,
        detail: 'Ouvrir la page de recherche',
        icon: Icons.search(18),
        run: () => go(`/search?q=${encodeURIComponent(term)}`),
      });
    }

    return flat;
  }, [term, playlists, localTracks, remote, play, go, close]);

  const activeIndex = items.length ? Math.min(active, items.length - 1) : -1;

  // L'élément actif reste visible dans la liste, même au clavier.
  useEffect(() => {
    if (activeIndex < 0) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  function onKeyDown(e: ReactKeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
      return;
    }
    // Palette : le champ garde le focus, les options se parcourent aux flèches
    // (tabindex -1 + aria-activedescendant). La tabulation ne doit pas
    // s'échapper du dialogue.
    if (e.key === 'Tab') {
      e.preventDefault();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (items.length ? (i + 1) % items.length : 0));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (items.length ? (i - 1 + items.length) % items.length : 0));
      return;
    }
    if (e.key === 'Home') {
      e.preventDefault();
      setActive(0);
      return;
    }
    if (e.key === 'End') {
      e.preventDefault();
      setActive(Math.max(0, items.length - 1));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      items[activeIndex]?.run();
    }
  }

  const fresh = remote && remote.q === term ? remote : null;
  const loading = term.length >= 2 && (searching || !fresh);
  let lastGroup = '';

  return (
    <>
      <button
        className="palette-backdrop"
        aria-label="Fermer la palette de commandes"
        onClick={close}
        tabIndex={-1}
      />
      <div
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label="Palette de commandes"
        onKeyDown={onKeyDown}
      >
        <div className="palette-field">
          <span className="palette-field-icon" aria-hidden>
            {Icons.search(18)}
          </span>
          <input
            ref={inputRef}
            className="palette-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              compact
                ? 'Titres, artistes, albums, fichiers…'
                : 'Chercher un titre, un album, un artiste, une playlist, un fichier…'
            }
            aria-label="Rechercher et lancer"
            role="combobox"
            aria-expanded={items.length > 0}
            aria-controls="palette-list"
            aria-autocomplete="list"
            aria-activedescendant={activeIndex >= 0 ? `palette-item-${activeIndex}` : undefined}
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="kbd">esc</kbd>
          <button
            className="icon-btn small palette-close"
            onClick={close}
            aria-label="Fermer la palette de commandes"
          >
            {Icons.close(16)}
          </button>
        </div>

        <div className="palette-list" ref={listRef} id="palette-list" role="listbox" aria-label="Résultats">
          {loading && (
            <div className="palette-status" role="status">
              <span className="spinner" aria-hidden /> Recherche dans le catalogue…
            </div>
          )}

          {!loading && items.length === 0 && (
            <div className="palette-empty">
              <p>Aucun résultat pour « {term} ».</p>
              <p className="muted">
                Essayez le nom d’un artiste, d’un album, ou le titre d’un fichier importé.
              </p>
            </div>
          )}

          {items.map((item, index) => {
            const header = item.group !== lastGroup ? item.group : null;
            lastGroup = item.group;
            return (
              <div key={item.id} role="presentation">
                {header && <div className="palette-group">{header}</div>}
                <button
                  type="button"
                  id={`palette-item-${index}`}
                  data-index={index}
                  role="option"
                  tabIndex={-1}
                  aria-selected={index === activeIndex}
                  className={`palette-item ${index === activeIndex ? 'active' : ''} ${
                    item.unplayable ? 'unplayable' : ''
                  }`}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => item.run()}
                >
                  <span
                    className={`palette-thumb ${item.round ? 'round' : ''}${!item.cover && item.seed ? ' palette-initial' : ''}`}
                    style={!item.cover && item.seed ? { background: gradientOf(item.seed) } : undefined}
                    aria-hidden
                  >
                    {item.cover ? <img src={item.cover} alt="" loading="lazy" /> : item.initial ?? item.icon}
                  </span>
                  <span className="palette-copy">
                    <span className="palette-label">{item.label}</span>
                    {item.detail && <span className="palette-detail">{item.detail}</span>}
                  </span>
                  {item.tag && (
                    <span className={`palette-tag ${item.mutedTag ? 'muted' : ''}`}>{item.tag}</span>
                  )}
                </button>
              </div>
            );
          })}

          {!loading && fresh?.failed && (
            <p className="palette-note">
              Catalogue injoignable — les raccourcis, playlists et fichiers locaux restent
              disponibles.
            </p>
          )}
        </div>

        <div className="palette-foot">
          <span>
            <kbd className="kbd">↑</kbd> <kbd className="kbd">↓</kbd> naviguer
          </span>
          <span>
            <kbd className="kbd">↵</kbd> ouvrir
          </span>
          <span>
            <kbd className="kbd">esc</kbd> fermer
          </span>
        </div>
      </div>
    </>
  );
}

/* --------------------------------- modèle ---------------------------------- */

interface PaletteSection {
  items: PaletteItem[];
  /** meilleur score de correspondance de la section (1 sans requête) */
  best: number;
}

interface PaletteItem extends CommandEntry {
  group: string;
  cover?: string;
  icon?: ReactNode;
  round?: boolean;
  /** initiale affichée quand l'API ne fournit pas d'image (artistes) */
  initial?: string;
  /** graine du dégradé de repli */
  seed?: string;
  /** étiquette à droite (« Local », « Sans extrait ») */
  tag?: string;
  /** étiquette discrète (information, pas un atout) */
  mutedTag?: boolean;
  /** titre sans extrait lisible : la ligne est grisée */
  unplayable?: boolean;
  run: () => void;
}

interface Shortcut {
  id: string;
  label: string;
  detail?: string;
  keywords?: string;
  to: string;
  icon: ReactNode;
}

const SHORTCUTS: Shortcut[] = [
  { id: 'go-home', label: 'Accueil', detail: 'Écoutés récemment, Daily Mix', keywords: 'home accueil', to: '/', icon: Icons.home(18) },
  { id: 'go-search', label: 'Recherche', detail: 'Explorer le catalogue', keywords: 'search chercher', to: '/search', icon: Icons.search(18) },
  { id: 'go-library', label: 'Bibliothèque', detail: 'Playlists et titres likés', keywords: 'library biblio', to: '/library', icon: Icons.library(18) },
  { id: 'go-local', label: 'Ma musique locale', detail: 'Fichiers importés sur cet appareil', keywords: 'local fichiers mp3 import', to: '/local', icon: Icons.disc(18) },
  { id: 'go-daily', label: 'Daily Mix', detail: 'Sélections calculées pour aujourd’hui', keywords: 'mix quotidien', to: '/daily', icon: Icons.spark(18) },
  { id: 'go-liked', label: 'Titres likés', detail: 'Votre sélection de favoris', keywords: 'likes favoris coeur', to: '/playlist/liked', icon: Icons.heart() },
  { id: 'go-history', label: 'Historique', detail: 'Ce que vous avez écouté', keywords: 'history récent', to: '/history', icon: Icons.clock(18) },
];

/** Garde les `max` premiers éléments d'une liste déjà classée. */
function cap<T>(list: T[], max: number): T[] {
  return max >= list.length ? list : list.slice(0, max);
}

/** Ajoute une section si elle a du contenu, avec son meilleur score. */
function addSection(
  sections: PaletteSection[],
  entries: PaletteItem[],
  max: number,
  term: string
): void {
  if (entries.length === 0) return;
  const items = cap(entries, max);
  const best = term
    ? items.reduce((score, item) => Math.max(score, commandScore(item, term)), 0)
    : 1;
  sections.push({ items, best });
}
