/**
 * Icônes SVG inline (aucune dépendance) — tracés Material (Apache 2.0),
 * le jeu d'icônes utilisé par YouTube, Google Play Music et la plupart
 * des lecteurs modernes.
 */
import type { JSX } from 'react';

type IconFn = (size?: number) => JSX.Element;

function svg(path: string): IconFn {
  return (size = 24) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d={path} />
    </svg>
  );
}

function stroke(inner: string, strokeWidth = 1.8): IconFn {
  return (size = 24) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={inner} />
    </svg>
  );
}

/* --------------------------- cœur (contour / plein) ------------------------ */

const HEART_OUTLINE =
  'M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55l-.1.1-.1-.1C7.14 14.27 4 11.16 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.66-3.14 5.77-7.9 10.05z';

const HEART_FILLED =
  'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z';

/* ----------------------------- marque Spotify ----------------------------- */

/** Logo Spotify (trois ondes) — usage décoratif dans la sidebar. */
function spotify(size = 24): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm4.57 14.43a.62.62 0 0 1-.86.21c-2.35-1.44-5.3-1.76-8.79-.96a.62.62 0 1 1-.28-1.21c3.8-.87 7.07-.5 9.71 1.11.29.18.38.56.22.85zm1.22-2.72a.78.78 0 0 1-1.07.26c-2.69-1.65-6.79-2.13-9.97-1.17a.78.78 0 1 1-.45-1.49c3.63-1.1 8.15-.56 11.23 1.33.37.23.49.71.26 1.07zm.11-2.84C14.8 8.96 9.4 8.78 6.3 9.72a.94.94 0 1 1-.54-1.8c3.56-1.08 9.52-.87 13.28 1.36a.94.94 0 0 1-.96 1.61z" />
    </svg>
  );
}

export const Icons = {
  /* ------------------------------ transport -------------------------------- */
  play: svg('M8 5v14l11-7z'),
  pause: svg('M6 19h4V5H6v14zm8-14v14h4V5h-4z'),
  next: svg('M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z'),
  prev: svg('M6 6h2v12H6zm3.5 6l8.5 6V6l-8.5 6z'),
  shuffle: stroke('M16 4h4v4M20 4l-6.5 6.5M4 20l6-6M16 20h4v-4M20 20l-5-5M4 4l4.5 4.5'),
  repeat: (one: boolean = false) => (one ? Icons.repeatOne() : Icons.repeatAll()),
  repeatAll: stroke(
    'M17 2.5l3 3-3 3M20 5.5H7a3 3 0 0 0-3 3V11M7 21.5l-3-3 3-3M4 18.5h13a3 3 0 0 0 3-3V13'
  ),
  repeatOne: stroke(
    'M17 2.5l3 3-3 3M20 5.5H7a3 3 0 0 0-3 3V11M7 21.5l-3-3 3-3M4 18.5h13a3 3 0 0 0 3-3V13M12 9.5v5M12 9.5h1.5L12 11'
  ),

  /* ------------------------------ navigation ------------------------------- */
  home: stroke('M3.5 10.5 12 3.5l8.5 7M6 9.5V20h4.5v-5.5h3V20H18V9.5'),
  search: stroke('M20.5 20.5l-4.4-4.4M17 11a6 6 0 1 1-12 0 6 6 0 0 1 12 0z'),
  library: stroke('M4.5 4v16M9 4v16M13.5 4.6l4.3 15.1M4.5 4h9M4.5 20h9'),
  grid: stroke('M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z'),
  list: stroke('M4 6h11M4 12h11M4 18h7M18.5 11v6M21.5 13l-3-2-3 2'),
  plus: stroke('M12 5v14M5 12h14', 2),
  minus: stroke('M5 12h14', 2),
  close: stroke('M6 6l12 12M18 6L6 18', 2),
  trash: stroke(
    'M4 7h16M9.5 7V4.5h5V7M6.5 7l.8 12.5h9.4L17.5 7M10 10.5v6M14 10.5v6'
  ),
  queue: stroke('M4 6.5h10M4 11.5h10M4 16.5h6M15.5 11.5v7M18.5 15l3-1.5-3-1.5'),
  addQueue: stroke('M4 6.5h9M4 11.5h9M4 16.5h6M17 12v7M20.5 15.5h-7'),
  download: stroke('M12 3.5v11m0 0 4-4m-4 4-4-4M4.5 17v2.5h15V17'),
  upload: stroke('M12 16.5v-13m0 0-4 4m4-4 4 4M4.5 17v2.5h15V17'),
  folder: stroke('M3.5 7a2 2 0 0 1 2-2h3.1a2 2 0 0 1 1.6.8l1.1 1.4h8.2a2 2 0 0 1 2 2v9.3a2 2 0 0 1-2 2H5.5a2 2 0 0 1-2-2z'),
  image: stroke('M4 5.5h16v13H4zM4 15.5l4.5-4.5 3.5 3.5 3-3 5 4M8.8 8a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6'),
  lock: stroke('M6.5 10.5h11a1.5 1.5 0 0 1 1.5 1.5v7a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19v-7a1.5 1.5 0 0 1 1.5-1.5zM8 10.5V7a4 4 0 0 1 8 0v3.5'),
  share: stroke(
    'M17 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM7 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM17 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM9.2 10.9l5.6-3.3M9.2 13.1l5.6 3.3'
  ),
  moon: stroke('M20.5 14.4A8.5 8.5 0 1 1 9.6 3.5a7 7 0 0 0 10.9 10.9z'),
  sun: stroke(
    'M12 7.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9zM12 2v2.5M12 19.5V22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M2 12h2.5M19.5 12H22M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8'
  ),

  /* -------------------------------- volume --------------------------------- */
  volHigh: stroke(
    'M4 9.5h3l4.5-4v13L7 14.5H4v-5zM16 9.5a3.5 3.5 0 0 1 0 5M18.8 7a7 7 0 0 1 0 10'
  ),
  volLow: stroke('M4 9.5h3l4.5-4v13L7 14.5H4v-5zM15.5 10a3.5 3.5 0 0 1 0 4'),
  mute: stroke('M4 9.5h3l4.5-4v13L7 14.5H4v-5zM16 10l4.5 4.5M20.5 10L16 14.5'),

  /* ------------------------------- actions --------------------------------- */
  heart: (filled: boolean = false) => svg(filled ? HEART_FILLED : HEART_OUTLINE)(),
  chevronLeft: stroke('M15 5.5 8.5 12l6.5 6.5', 2),
  chevronRight: stroke('M9 5.5 15.5 12 9 18.5', 2),
  chevronDown: stroke('M5.5 9 12 15.5 18.5 9', 2),
  pen: stroke('M4 20l.9-4 11-11 3.1 3.1-11 11-4 .9zM14.5 5.5l3.1 3.1M4 20l4-.9'),
  person: stroke(
    'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20.5c0-3.6 3.4-5.5 7.5-5.5s7.5 1.9 7.5 5.5'
  ),
  users: stroke(
    'M9 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c0-3.2 2.9-4.8 6.5-4.8s6.5 1.6 6.5 4.8M16.5 5.2a3.5 3.5 0 0 1 0 6.6M18.5 15.6c1.9.7 3 1.9 3 4.4'
  ),
  login: stroke(
    'M14 3.5h4.5A1.5 1.5 0 0 1 20 5v14a1.5 1.5 0 0 1-1.5 1.5H14M10 8l4 4-4 4M14 12H4'
  ),
  logout: stroke(
    'M10 3.5H5.5A1.5 1.5 0 0 0 4 5v14a1.5 1.5 0 0 0 1.5 1.5H10M16 8l4 4-4 4M20 12H9'
  ),
  note: svg(
    'M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z'
  ),
  clock: stroke('M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3.5 2'),
  dots: svg(
    'M6 10c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm12 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm-6 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z'
  ),
  check: stroke('M5 12.5l4.5 4.5L19 7.5', 2.2),
  star: stroke(
    'M12 3.5l2.7 5.5 6 .9-4.35 4.24 1.03 6-5.38-2.83L6.62 20.14l1.03-6L3.3 9.9l6-.9L12 3.5z'
  ),
  mic: stroke(
    'M12 3.5a2.75 2.75 0 0 0-2.75 2.75v5a2.75 2.75 0 1 0 5.5 0v-5A2.75 2.75 0 0 0 12 3.5zM5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M9 21h6'
  ),
  radio: stroke(
    'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM5.6 5.6a9 9 0 0 0 0 12.8M18.4 5.6a9 9 0 0 1 0 12.8M8.3 8.3a5.2 5.2 0 0 0 0 7.4M15.7 8.3a5.2 5.2 0 0 1 0 7.4'
  ),
  spark: stroke(
    'M12 3.5l1.7 4.8L18.5 10l-4.8 1.7L12 16.5l-1.7-4.8L5.5 10l4.8-1.7L12 3.5zM18.5 16l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2z'
  ),
  music: stroke(
    'M9 17.5V6l11-2v11.5M9 17.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0zM20 15.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z'
  ),
  disc: stroke(
    'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z'
  ),
  spotify,
};

export default Icons;
