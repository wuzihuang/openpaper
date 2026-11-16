interface IconProps {
  name: keyof typeof paths
  size?: number
}

const paths = {
  cursor: 'M4 3l6.5 15 2.2-6.3L19 9.5 4 3z',
  menu: 'M4 7h16M4 12h16M4 17h16',
  'chevron-right': 'M9 6l6 6-6 6',
  'chevron-left': 'M15 6l-6 6 6 6',
  'chevron-down': 'M6 9l6 6 6-6',
  share: 'M12 3v10m0-10L8 7m4-4l4 4M5 11v9h14v-9',
  shader: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 3c2.5 2.6 4 5.6 4 9s-1.5 6.4-4 9c-2.5-2.6-4-5.6-4-9s1.5-6.4 4-9zM3.5 9h17M3.5 15h17',
  wand: 'M15 4V2m0 8V8m0 0h-2m2 0h2M6.5 11L4 13.5 10.5 20 13 17.5 6.5 11zM13 6l7 7-3 3-7-7 3-3z',
  divider: 'M4 12h16',
  expand: 'M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5',
  hand: 'M7 11V6.5a1.5 1.5 0 013 0V11m0-1V5.5a1.5 1.5 0 013 0V11m0-.5V7a1.5 1.5 0 013 0v6.5c0 3.6-2.4 6.5-6 6.5s-6-2.6-6-6V10a1.4 1.4 0 012.8 0V13',
  artboard: 'M4 4h16v12H4zM4 8h16M8 4v12',
  square: 'M4 4h16v16H4z',
  circle: 'M12 3a9 9 0 100 18 9 9 0 000-18z',
  text: 'M5 5h14M12 5v14M9 19h6',
  undo: 'M8 6L4 10l4 4M4 10h9a5 5 0 010 10h-2',
  redo: 'M16 6l4 4-4 4M20 10h-9a5 5 0 000 10h2',
  eye: 'M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z M12 9.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5z',
  eyeOff: 'M4 4l16 16M9.9 5.2A11 11 0 0112 5c6 0 9.5 7 9.5 7a17 17 0 01-3.2 4M6.3 7.2A17 17 0 002.5 12S6 19 12 19c1.4 0 2.6-.3 3.8-.8',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  fit: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  chevron: 'M9 6l6 6-6 6',
  frame: 'M6 3v18M18 3v18M3 6h18M3 18h18',
  search: 'M10.5 4a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM15.4 15.4L20 20',
  more: 'M6 12h.01M12 12h.01M18 12h.01',
  layers: 'M12 3l8 4.5-8 4.5-8-4.5L12 3zM4 12.5l8 4.5 8-4.5M4 17l8 4.5 8-4.5',
  pages: 'M6 4h9l4 4v12H6zM14 4v4h5',
  link: 'M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71',
  image: 'M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5M16 9h.01',
  pen: 'M12 19l7-7a3.5 3.5 0 00-5-5l-7 7-2 7 7-2zM15 6l3 3M5 21l1.5-5',
  lock: 'M6 10h12v10H6zM8 10V7a4 4 0 018 0v3M12 14v2',
  unlock: 'M6 10h12v10H6zM8 10V7a4 4 0 017.5-2M12 14v2',
  download: 'M12 3v12m-5-5l5 5 5-5M4 19h16',
  component: 'M12 3l7 7-7 11L5 10l7-7zM5 10h14',
  instance: 'M12 3l7 7-7 11L5 10l7-7z',
  comment: 'M4 4h16v12H8l-4 4V4zM8 9h8M8 12h5',
  corners: 'M9 4H5a1 1 0 00-1 1v4m11-5h4a1 1 0 011 1v4m0 6v4a1 1 0 01-1 1h-4m-6 0H5a1 1 0 01-1-1v-4',
  palette: 'M12 3C8 7 5 10 5 13.5a7 7 0 0014 0C19 10 16 7 12 3z',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14',
  import: 'M12 15V3m-5 7l5 5 5-5M4 19h16',
  close: 'M6 6l12 12M18 6L6 18',
  doc: 'M7 3h7l4 4v14H7zM14 3v4h4M10 12h5M10 16h5',
  duplicate: 'M8 8h12v12H8zM4 4h12v3M4 4v12h3',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  list: 'M8 6h13M8 12h13M8 18h13M4 6h1M4 12h1M4 18h1',
} as const

export function Icon({ name, size = 16 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  )
}
