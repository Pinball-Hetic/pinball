import type { CinematicClip } from '@pinball/shared-types'

// Fichiers d'overlay présents dans public/overlays/ (sondage statique, PAS
// de probe réseau au runtime). Déposer un fichier puis l'ajouter ici :
// l'overlay animé remplace le fallback CSS générique, sans autre code.
// Formats supportés : .webm (video) > .webp / .gif (img). Premier listé gagne.
//
// Exemple une fois un asset déposé :
//   demogorgon_rises: 'demogorgon_rises.webm',
export const OVERLAY_FILES: Partial<Record<CinematicClip, string>> = {}
