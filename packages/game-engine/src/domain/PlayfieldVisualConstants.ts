// Valeurs de rendu par défaut — utilisées si manifest.rendering est absent.
// Les maps DOIVENT déclarer leur propre MapRenderingConfig dans manifest.rendering
// pour personnaliser leur rendu. Ces constantes ne doivent PAS être tuned pour
// une map spécifique.

export const DEFAULT_TONE_MAPPING_EXPOSURE = 1.3;
export const DEFAULT_MAP_COLOR_DARKEN = 0.9;
export const DEFAULT_ENVIRONMENT_BLUR = 0.04;

export const DEFAULT_ENV_METALLIC = 1.0;
export const DEFAULT_ENV_SEMI     = 1.0;
export const DEFAULT_ENV_BASE     = 1.0;

// Aliases legacy (certains fichiers importent encore les anciens noms).
// À supprimer quand tous les consommateurs migrent vers manifest.rendering.
/** @deprecated utiliser manifest.rendering.toneMappingExposure */
export const PLAYFIELD_TONE_MAPPING_EXPOSURE = DEFAULT_TONE_MAPPING_EXPOSURE;
/** @deprecated utiliser manifest.rendering.colorDarken */
export const PLAYFIELD_MAP_COLOR_DARKEN = DEFAULT_MAP_COLOR_DARKEN;
