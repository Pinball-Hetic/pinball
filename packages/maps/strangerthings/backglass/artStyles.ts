import styles from './art.module.css'

// Résout un nom de classe : scopé s'il est défini dans art.module.css (contenu
// ST), sinon renvoyé tel quel (classe structurelle globale de l'app :
// tk-center, glitch-text, vhs*, tk-confetti…). Importer ce module charge aussi
// le CSS du contenu ST.
export const cx = (...names: string[]): string =>
  names.map((n) => styles[n] ?? n).join(' ')
