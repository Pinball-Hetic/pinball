import styles from './art.module.css'

// Resolves a class name: scoped if defined in art.module.css (ST content),
// otherwise returned as-is (global structural app class: tk-center,
// glitch-text, vhs*, tk-confetti…). Importing this module also loads the ST
// content CSS.
export const cx = (...names: string[]): string =>
  names.map((n) => styles[n] ?? n).join(' ')
