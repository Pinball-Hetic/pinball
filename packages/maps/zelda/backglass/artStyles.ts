import styles from './art.module.css'

// Résout un nom de classe : scopé s'il est défini dans art.module.css (contenu
// Zelda), sinon renvoyé tel quel (classe structurelle globale de l'app :
// tk-center, glitch-text, vhs*, tk-confetti…). Importer ce module charge aussi
// le CSS du contenu Zelda.
export const cx = (...names: string[]): string =>
  names.map((n) => styles[n] ?? n).join(' ')
