import styles from './art.module.css'

export const cx = (...names: string[]): string =>
  names.map((n) => styles[n] ?? n).join(' ')
