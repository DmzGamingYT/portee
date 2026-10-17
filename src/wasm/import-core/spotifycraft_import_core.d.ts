/* tslint:disable */
/* eslint-disable */

/**
 * Décode les tags **et** la pochette intégrée du tampon fourni.
 */
export function parse_cover(bytes: Uint8Array): any;

/**
 * Décode un bloc FLAC `PICTURE` seul (sans l'en-tête `fLaC`).
 */
export function parse_flac_picture(bytes: Uint8Array): any;

/**
 * Décode les tags d'un tampon audio (ID3v2, ID3v1 ou FLAC/Vorbis).
 */
export function parse_tags(bytes: Uint8Array): any;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly parse_cover: (a: number, b: number) => any;
    readonly parse_flac_picture: (a: number, b: number) => any;
    readonly parse_tags: (a: number, b: number) => any;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
