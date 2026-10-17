import type { AudioTags } from './id3';

/**
 * Façade typée du noyau Rust compilé en WebAssembly
 * (`crates/import-core`, sortie dans `src/wasm/import-core`).
 *
 * Le module est chargé à la demande, une seule fois. En cas d'échec (navigateur
 * sans WASM, fichier absent), `loadAudioCore()` renvoie null et les appelants
 * utilisent le repli JavaScript existant.
 */

export interface CoreParsed {
  title?: string;
  artist?: string;
  album?: string;
  genre?: string;
  picture?: Uint8Array;
  pictureMime?: string;
  /** toute la zone de métadonnées tenait dans le tampon fourni */
  complete: boolean;
}

export interface AudioCore {
  parseTags: (bytes: Uint8Array) => CoreParsed;
  parseCover: (bytes: Uint8Array) => CoreParsed;
  parseFlacPicture: (bytes: Uint8Array) => CoreParsed;
}

let corePromise: Promise<AudioCore | null> | null = null;

export function loadAudioCore(): Promise<AudioCore | null> {
  if (!corePromise) {
    corePromise = (async () => {
      try {
        const module = await import('../wasm/import-core/spotifycraft_import_core.js');
        await module.default();
        return {
          parseTags: (bytes) => module.parse_tags(bytes) as CoreParsed,
          parseCover: (bytes) => module.parse_cover(bytes) as CoreParsed,
          parseFlacPicture: (bytes) => module.parse_flac_picture(bytes) as CoreParsed,
        };
      } catch (error) {
        console.warn('Noyau WASM indisponible : repli sur le lecteur JavaScript.', error);
        return null;
      }
    })();
  }
  return corePromise;
}

/** Ne conserve que les champs texte attendus par `AudioTags`. */
export function tagsFromCore(parsed: CoreParsed): AudioTags {
  return {
    title: parsed.title,
    artist: parsed.artist,
    album: parsed.album,
    genre: parsed.genre,
  };
}
