// Default rendering values — used when manifest.rendering is absent. Maps
// MUST declare their own MapRenderingConfig in manifest.rendering to customize
// rendering. These constants must NOT be tuned for a specific map.

export const DEFAULT_TONE_MAPPING_EXPOSURE = 1.3;
export const DEFAULT_MAP_COLOR_DARKEN = 0.9;
export const DEFAULT_ENVIRONMENT_BLUR = 0.04;

export const DEFAULT_ENV_METALLIC = 1.0;
export const DEFAULT_ENV_SEMI     = 1.0;
export const DEFAULT_ENV_BASE     = 1.0;

// Legacy aliases (some files still import the old names). Remove once all
// consumers migrate to manifest.rendering.
/** @deprecated use manifest.rendering.toneMappingExposure */
export const PLAYFIELD_TONE_MAPPING_EXPOSURE = DEFAULT_TONE_MAPPING_EXPOSURE;
/** @deprecated use manifest.rendering.colorDarken */
export const PLAYFIELD_MAP_COLOR_DARKEN = DEFAULT_MAP_COLOR_DARKEN;
