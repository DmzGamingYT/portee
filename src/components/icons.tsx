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

const HEART_OUTLINE =
  'M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55l-.1.1-.1-.1C7.14 14.27 4 11.16 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.66-3.14 5.77-7.9 10.05z';

const HEART_FILLED =
  'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z';

export const Icons = {
  play: svg('M8 5v14l11-7z'),
  pause: svg('M6 19h4V5H6v14zm8-14v14h4V5h-4z'),
  next: svg('M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z'),
  prev: svg('M6 6h2v12H6zm3.5 6l8.5 6V6l-8.5 6z'),
  shuffle: svg(
    'M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z'
  ),
  repeat: (one: boolean = false) =>
    (
      svg(
        one
          ? 'M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v5zm-4-2V9h-1l-2 2h1v4h2z'
          : 'M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v5z'
      )
    )(),
  home: svg('M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z'),
  search: stroke('M20.5 20.5l-4.2-4.2M16.3 13.1A6.5 6.5 0 1 1 13.1 16.3 6.5 6.5 0 0 1 16.3 13.1z'),
  library: svg('M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z'),
  plus: svg('M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z'),
  minus: svg('M19 13H5v-2h14v2z'),
  close: svg('M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z'),
  trash: svg('M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zm8-14h8l-1-2H9L8 5zM9 5h6l-.5 11h-5L9 7z'),
  queue: svg('M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zm14-6v6.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V12h3v-2h-5z'),
  moon: svg('M12.34 2.02C6.59 1.82 2 6.42 2 12c0 5.52 4.48 10 10 10 5.58 0 10.18-4.59 9.98-10.34-.17-4.87-4.15-8.85-9.02-9.02z'),
  sun: svg(
    'M6.76 4.84l-1.8-1.79-1.41 1.41 1.79 1.79 1.42-1.41zM4 10.5H1v2h3v-2zm9-9.95h-2V3.5h2V.55zm7.45 3.91l-1.41-1.41-1.79 1.79 1.41 1.41 1.79-1.79zm-3.21 13.61l1.79 1.8 1.41-1.41-1.8-1.79-1.4 1.4zM20 10.5v2h3v-2h-3zm-8-5c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm-1 16.95h2V19.5h-2v2.95zm-7.45-3.91l1.41 1.41 1.79-1.8-1.41-1.41-1.79 1.8z'
  ),
  volHigh: svg('M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05A4.47 4.47 0 0 0 16.5 12zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z'),
  volLow: svg('M5 9v6h4l5 5V4L9 9H5zm10.5 3A4.5 4.5 0 0 0 13 7.97v8.05A4.47 4.47 0 0 0 15.5 12z'),
  mute: svg('M16.5 12A4.5 4.5 0 0 0 14 7.97v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.8 8.8 0 0 0 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.99 8.99 0 0 0 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z'),
  heart: (filled: boolean = false) => svg(filled ? HEART_FILLED : HEART_OUTLINE)(),
  chevronLeft: svg('M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12l4.58-4.59z'),
  chevronRight: svg('M8.59 16.59L10 18l6-6-6-6-1.41 1.41L13.17 12l-4.58 4.59z'),
  pen: svg('M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z'),
  person: svg('M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'),
  login: svg('M11 7L9.6 8.4l2.6 2.6H2v2h10.2l-2.6 2.6L11 17l5-5-5-5zm9-5h-8v2h8v14h-8v2h8c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z'),
  logout: svg('M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5-5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z'),
  note: svg('M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z'),
  clock: svg('M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z'),
  dots: svg('M6 10c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm12 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm-6 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z'),
};

export default Icons;
