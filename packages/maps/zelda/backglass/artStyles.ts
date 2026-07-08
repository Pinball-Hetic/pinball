import styles from './art.module.css'

// Scoped name if defined in art.module.css, else returned as-is (global
// structural app class). Importing this module also loads the map's CSS.
export const cx = (...names: string[]): string =>
  names.map((n) => styles[n] ?? n).join(' ')
