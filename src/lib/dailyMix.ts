import type { Artist, Track } from '../types';
import { normalizeText } from './previewMatch';
import { diversifyTracks, isPlayable } from './tracks';

/**
 * Daily Mix — **100 % côté navigateur**, sans backend ni service externe.
 *
 * Principe :
 *  1. On construit un **profil de goût** à partir des signaux déjà stockés
 *     localement : titres likés, historique d'écoute, playlists et artistes
 *     suivis (poids décroissant).
 *  2. On en déduit des **graines de mix** (genres dominants, artistes
 *     dominants, titres likés) — le plan est stable pour la journée.
 *  3. Les graines de genre/artiste sont résolues via le catalogue existant
 *     (iTunes, ou Spotify si connecté), puis classées par affinité avec un
 *     tirage **déterministe** (même jour = même mix, sans figer les extraits
 *     plus longtemps qu'un jour).
 *
 * Ce module ne fait volontairement aucun appel réseau : il ne contient que de
 * la logique pure (testable sans navigateur).
 */

/* ------------------------------ familles de genres -------------------------- */

export interface GenreFamily {
  id: string;
  label: string;
  /** terme envoyé au catalogue */
  searchTerm: string;
  /** mots-clés reconnus dans un genre brut (comparés en minuscules sans accents) */
  keywords: string[];
}

/**
 * L'ordre compte : les familles sont testées de haut en bas, donc les genres
 * composés (« Pop/Rock », « Metal ») tombent dans la bonne famille.
 */
export const GENRE_FAMILIES: GenreFamily[] = [
  { id: 'metal', label: 'Métal', searchTerm: 'metal', keywords: ['metal', 'metall', 'hardcore'] },
  { id: 'rock', label: 'Rock', searchTerm: 'rock', keywords: ['rock', 'punk', 'indie', 'alternati', 'grunge'] },
  { id: 'rap', label: 'Hip-Hop / Rap', searchTerm: 'hip hop', keywords: ['rap', 'hip hop', 'hip-hop', 'trap', 'drill', 'urban'] },
  { id: 'rnb', label: 'R&B / Soul', searchTerm: 'r&b soul', keywords: ['r b', 'rnb', 'soul', 'funk', 'motown'] },
  {
    id: 'electro',
    label: 'Électro & dance',
    searchTerm: 'electronic',
    keywords: ['electro', 'electron', 'dance', 'house', 'techno', 'edm', 'trance', 'club'],
  },
  { id: 'jazz', label: 'Jazz', searchTerm: 'jazz', keywords: ['jazz', 'blues', 'swing', 'bebop'] },
  {
    id: 'classique',
    label: 'Classique',
    searchTerm: 'classical',
    keywords: ['classique', 'classical', 'opera', 'opéra', 'baroque', 'orchestr', 'piano'],
  },
  {
    id: 'chanson',
    label: 'Chanson française',
    searchTerm: 'chanson française',
    keywords: ['chanson', 'variete', 'francais', 'francaise', 'french'],
  },
  { id: 'reggae', label: 'Reggae', searchTerm: 'reggae', keywords: ['reggae', 'ska', 'dancehall', 'ragga'] },
  { id: 'country', label: 'Country', searchTerm: 'country', keywords: ['country', 'folk', 'americana'] },
  { id: 'latino', label: 'Latino', searchTerm: 'latin', keywords: ['latino', 'latin', 'reggaeton', 'salsa', 'bachata'] },
  { id: 'pop', label: 'Pop', searchTerm: 'pop', keywords: ['pop'] },
];

/** Famille correspondant à un genre brut du catalogue, ou `null` si inconnu. */
export function familyOf(rawGenre?: string): GenreFamily | null {
  if (!rawGenre) return null;
  const normalized = normalizeText(rawGenre);
  if (!normalized) return null;
  for (const family of GENRE_FAMILIES) {
    if (family.keywords.some((keyword) => normalized.includes(keyword))) return family;
  }
  return null;
}

/* -------------------------------- profil de goût ---------------------------- */

export interface TasteArtist {
  /** clé normalisée (« daft punk ») */
  key: string;
  /** nom affiché (« Daft Punk ») */
  name: string;
  weight: number;
  genre?: string;
}

export interface TasteGenre {
  /** id de famille si reconnue, sinon genre normalisé */
  key: string;
  label: string;
  weight: number;
  familyId?: string;
}

export interface TasteProfile {
  artists: TasteArtist[];
  genres: TasteGenre[];
  /** volume de signal utilisateur (likes + écoutes + playlists + abonnements) */
  signal: number;
}

export interface TasteInput {
  liked: Track[];
  history: Track[];
  playlists: Array<{ tracks: Track[] }>;
  followed: Artist[];
}

/** Artiste principal d'une chaîne « A, B », « A feat. B » ou « A avec B ». */
export function mainArtistOf(value: string): string {
  const part = value
    .split(/[,&]|\s+(?:feat\.?|ft\.?|featuring|avec|with)\s+/i)[0]
    ?.trim();
  return part || value.trim();
}

/** Clé d'agrégation d'un artiste (minuscules, sans accents). */
export function artistKeyOf(value: string): string {
  return normalizeText(mainArtistOf(value));
}

const LIKED_BASE = 3;
const LIKED_RECENT_BONUS = 1.5;
const HISTORY_BASE = 2;
const PLAYLIST_WEIGHT = 0.8;
const FOLLOWED_WEIGHT = 2;

function addArtist(
  artists: Map<string, TasteArtist>,
  name: string,
  weight: number,
  genre?: string
): void {
  const key = artistKeyOf(name);
  if (!key) return;
  const current = artists.get(key);
  if (current) current.weight += weight;
  else artists.set(key, { key, name: mainArtistOf(name), weight, genre });
}

function addGenre(genres: Map<string, TasteGenre>, rawGenre: string, weight: number): void {
  const trimmed = rawGenre.trim();
  if (!trimmed) return;
  const family = familyOf(trimmed);
  const key = family?.id ?? normalizeText(trimmed);
  if (!key) return;
  const label = family?.label ?? trimmed;
  const current = genres.get(key);
  if (current) current.weight += weight;
  else genres.set(key, { key, label, weight, familyId: family?.id });
}

/**
 * Agrège les signaux locaux en un profil de goût trié.
 * Les likes pèsent le plus, puis l'historique (avec décroissance), les
 * playlists et enfin les artistes suivis.
 */
export function buildTasteProfile(input: TasteInput): TasteProfile {
  const artists = new Map<string, TasteArtist>();
  const genres = new Map<string, TasteGenre>();
  let signal = 0;

  const addTrack = (track: Track, weight: number) => {
    if (track.artist) addArtist(artists, track.artist, weight, track.genre);
    if (track.genre) addGenre(genres, track.genre, weight);
  };

  input.liked.forEach((track, index) => {
    addTrack(track, LIKED_BASE + (index < 10 ? LIKED_RECENT_BONUS : 0));
  });
  signal += input.liked.length;

  input.history.slice(0, 40).forEach((track, index) => {
    addTrack(track, HISTORY_BASE * Math.max(0.3, 1 - index / 50));
  });
  signal += Math.min(input.history.length, 40);

  for (const playlist of input.playlists) {
    const tracks = playlist.tracks.slice(0, 60);
    for (const track of tracks) addTrack(track, PLAYLIST_WEIGHT);
    signal += tracks.length;
  }

  for (const artist of input.followed) {
    addArtist(artists, artist.name, FOLLOWED_WEIGHT, artist.genre);
    if (artist.genre) addGenre(genres, artist.genre, FOLLOWED_WEIGHT / 2);
    signal += 1;
  }

  const sortedArtists = [...artists.values()]
    .sort((a, b) => b.weight - a.weight || a.name.localeCompare(b.name))
    .slice(0, 12);
  const sortedGenres = [...genres.values()]
    .sort((a, b) => b.weight - a.weight || a.label.localeCompare(b.label))
    .slice(0, 12);

  return { artists: sortedArtists, genres: sortedGenres, signal };
}

/* -------------------------------- aléa stable ------------------------------- */

/** Graine FNV-1a 32 bits. */
export function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Générateur pseudo-aléatoire déterministe (mulberry32). */
export function rngFrom(seed: string): () => number {
  let state = hashSeed(seed);
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Mélange stable : même graine = même ordre, tout en restant varié. */
export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  const rng = rngFrom(seed);
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/* --------------------------------- planification ---------------------------- */

export type MixKind = 'favorites' | 'genre' | 'artist' | 'starter';

export interface DailyMixSeed {
  id: string;
  kind: MixKind;
  title: string;
  /** explication affichée (« D'après vos écoutes ») */
  reason: string;
  /** terme de recherche catalogue ('' pour les favoris, qui sont locaux) */
  term: string;
  coverSeed: string;
  /** famille de genres attendue dans les résultats */
  matchFamily?: string;
  /** clé d'artiste attendue dans les résultats */
  matchArtist?: string;
}

export interface DailyMix extends DailyMixSeed {
  tracks: Track[];
  /** vrai si le catalogue n'a rien renvoyé (hors ligne, erreur… ) */
  failed?: boolean;
}

export interface DailyPlan {
  day: string;
  profile: TasteProfile;
  seeds: DailyMixSeed[];
}

export interface PlanOptions {
  /** clé de jour (`AAAA-MM-JJ`) — passée explicitement pour rester testable */
  day: string;
  /** artistes de secours quand aucun signal utilisateur n'existe */
  starters?: string[];
}

/** Artistes utilisés pour le mix de démarrage à froid. */
export const STARTER_ARTISTS = [
  'Daft Punk',
  'Stromae',
  'Angèle',
  'Orelsan',
  'Coldplay',
  'Lorde',
  'Miles Davis',
  'Eminem',
];

const pad = (value: number) => String(value).padStart(2, '0');

/** Clé de jour locale : « 2026-10-17 ». */
export function mixDayKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function dayOrdinal(day: string): number {
  const [year, month, date] = day.split('-').map(Number);
  if (!year || !month || !date) return 0;
  return Math.floor(Date.UTC(year, month - 1, date) / 86_400_000);
}

function genreSeed(family: GenreFamily, reason: string): DailyMixSeed {
  return {
    id: `genre-${family.id}`,
    kind: 'genre',
    title: `Mix ${family.label}`,
    reason,
    term: family.searchTerm,
    coverSeed: `daily-${family.id}`,
    matchFamily: family.id,
  };
}

function artistSeed(artist: TasteArtist, reason: string): DailyMixSeed {
  return {
    id: `artist-${artist.key}`,
    kind: 'artist',
    title: `Autour de ${artist.name}`,
    reason,
    term: artist.name,
    coverSeed: `daily-artist-${artist.key}`,
    matchArtist: artist.key,
  };
}

function starterSeed(artist: string): DailyMixSeed {
  const key = artistKeyOf(artist);
  return {
    id: `starter-${key}`,
    kind: 'starter',
    title: 'Mix de démarrage',
    reason: `Pour découvrir · ${artist}`,
    term: artist,
    coverSeed: `daily-starter-${key}`,
    matchArtist: key,
  };
}

/**
 * Construit le plan du jour : au plus 4 graines, dédupliquées par genre et
 * artiste. Sans aucune donnée utilisateur, produit un plan de démarrage stable
 * pour la journée (artist du jour + deux genres populaires).
 */
export function planDailyMixes(input: TasteInput, options: PlanOptions): DailyPlan {
  const starters = options.starters && options.starters.length > 0 ? options.starters : STARTER_ARTISTS;
  const profile = buildTasteProfile(input);
  const seeds: DailyMixSeed[] = [];
  const usedGenres = new Set<string>();
  const usedArtists = new Set<string>();

  const pushGenre = (genre: TasteGenre, reason: string): void => {
    if (usedGenres.has(genre.key) || seeds.length >= 4) return;
    usedGenres.add(genre.key);
    const family = genre.familyId
      ? GENRE_FAMILIES.find((f) => f.id === genre.familyId)
      : familyOf(genre.label);
    seeds.push(
      family
        ? genreSeed(family, reason)
        : {
            id: `genre-${genre.key}`,
            kind: 'genre',
            title: `Mix ${genre.label}`,
            reason,
            term: genre.label,
            coverSeed: `daily-genre-${genre.key}`,
          }
    );
  };

  const pushArtist = (artist: TasteArtist, reason: string): void => {
    if (usedArtists.has(artist.key) || seeds.length >= 4) return;
    usedArtists.add(artist.key);
    seeds.push(artistSeed(artist, reason));
  };

  /* ------------------------------ démarrage à froid ------------------------ */

  if (profile.signal === 0) {
    const starter = starters[dayOrdinal(options.day) % starters.length];
    seeds.push(starterSeed(starter));
    const pop = GENRE_FAMILIES.find((f) => f.id === 'pop');
    const electro = GENRE_FAMILIES.find((f) => f.id === 'electro');
    if (pop) seeds.push(genreSeed(pop, 'Pour découvrir'));
    if (electro) seeds.push(genreSeed(electro, 'Pour découvrir'));
    return { day: options.day, profile, seeds };
  }

  /* --------------------------------- mix réels ----------------------------- */

  const likedPlayable = input.liked.filter(isPlayable);
  if (likedPlayable.length >= 4) {
    seeds.push({
      id: 'favorites',
      kind: 'favorites',
      title: 'Vos favoris',
      reason: 'Vos titres likés',
      term: '',
      coverSeed: 'daily-favorites',
    });
  }

  const [topGenre, secondGenre] = profile.genres;
  const [topArtist, secondArtist] = profile.artists;

  if (topGenre) pushGenre(topGenre, 'D’après vos écoutes');
  if (topArtist) pushArtist(topArtist, 'D’après vos artistes');

  // Le deuxième genre n'est ajouté que s'il pèse vraiment quelque chose.
  if (secondGenre && secondGenre.weight >= Math.max(1, (topGenre?.weight ?? 0) * 0.35)) {
    pushGenre(secondGenre, 'D’après vos genres');
  }
  if (secondArtist) pushArtist(secondArtist, 'D’après vos artistes');

  // Signal présent mais aucun genre/artiste exploitable (titres sans tags) :
  // on retombe sur une découverte.
  if (seeds.length === 0) {
    const starter = starters[dayOrdinal(options.day) % starters.length];
    seeds.push(starterSeed(starter));
    const pop = GENRE_FAMILIES.find((f) => f.id === 'pop');
    if (pop) seeds.push(genreSeed(pop, 'Pour découvrir'));
  }

  return { day: options.day, profile, seeds };
}

/* --------------------------------- classement ------------------------------- */

export interface BuildMixOptions {
  limit?: number;
  /** clé de graine (jour + graine) pour un tirage stable */
  seedKey: string;
  profile?: TasteProfile;
  /** ids à déprioriser (déjà likés, déjà écoutés) */
  exclude?: Set<string>;
}

/**
 * Classe des candidats pour une graine : priorité aux correspondances
 * artiste/genre, à l'affinité avec le profil, avec un aléa déterministe et
 * une déduplication (id + titre/artiste). Limite de 2 titres par artiste.
 */
export function buildSeedTracks(
  candidates: Track[],
  seed: DailyMixSeed,
  options: BuildMixOptions
): Track[] {
  const limit = options.limit ?? 24;
  const rng = rngFrom(`mix|${options.seedKey}|${seed.id}`);
  const family = seed.matchFamily
    ? GENRE_FAMILIES.find((f) => f.id === seed.matchFamily)
    : undefined;

  const seenIds = new Set<string>();
  const seenKeys = new Set<string>();
  const unique: Track[] = [];
  for (const track of candidates) {
    if (!isPlayable(track)) continue;
    const key = `${normalizeText(track.title)}|${artistKeyOf(track.artist)}`;
    if (seenIds.has(track.id) || seenKeys.has(key)) continue;
    seenIds.add(track.id);
    seenKeys.add(key);
    unique.push(track);
  }

  const core = unique.filter((track) => {
    if (seed.matchArtist && artistKeyOf(track.artist).includes(seed.matchArtist)) return true;
    if (family && familyOf(track.genre)?.id === family.id) return true;
    return false;
  });
  // Si le catalogue répond à côté, on élargit plutôt que de rendre un mix vide.
  const pool = core.length >= 8 ? core : unique;

  const affinity = new Map<string, number>();
  for (const artist of options.profile?.artists ?? []) affinity.set(artist.key, artist.weight);

  const scored = pool.map((track) => {
    const key = artistKeyOf(track.artist);
    let score = 1 + rng() * 1.2;
    if (family && familyOf(track.genre)?.id === family.id) score += 2.2;
    if (seed.matchArtist) {
      if (key === seed.matchArtist) score += 2.6;
      else if (key.includes(seed.matchArtist)) score += 1.2;
    }
    score += Math.min(1.5, (affinity.get(key) ?? 0) / 6);
    if (options.exclude?.has(track.id)) score -= 2.5;
    // Évite les versions instrumentales/karaoké/tribute qui polluent les mixes.
    if (/instrumental|karaoke|tribute|made famous|originally performed/i.test(track.title)) {
      score -= 0.7;
    }
    if (track.preview) score += 0.3;
    return { track, score };
  });

  scored.sort((a, b) => b.score - a.score || a.track.title.localeCompare(b.track.title));
  return diversifyTracks(
    scored.map((x) => x.track),
    2,
    limit
  );
}

/** Mélange stable des titres likés, limité aux pistes lisibles. */
export function buildFavoritesMix(
  liked: Track[],
  seedKey: string,
  limit = 30
): Track[] {
  return seededShuffle(liked.filter(isPlayable), `favorites|${seedKey}`).slice(0, limit);
}

/** Somme des durées d'un mix (0 si les durées manquent). */
export function totalDurationMs(tracks: Track[]): number {
  return tracks.reduce((sum, track) => sum + (track.durationMs ?? 0), 0);
}
