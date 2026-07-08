// Defaults used when manifest.rendering is absent. Do NOT tune these for a
// specific map — maps declare their own MapRenderingConfig in manifest.rendering.
export const DEFAULT_TONE_MAPPING_EXPOSURE = 1.3;
export const DEFAULT_MAP_COLOR_DARKEN = 0.9;
export const DEFAULT_ENVIRONMENT_BLUR = 0.04;

export const DEFAULT_ENV_METALLIC = 1.0;
export const DEFAULT_ENV_SEMI     = 1.0;
export const DEFAULT_ENV_BASE     = 1.0;

// TODO: remove these aliases once all consumers migrate to manifest.rendering.
/** @deprecated use manifest.rendering.toneMappingExposure */
export const PLAYFIELD_TONE_MAPPING_EXPOSURE = DEFAULT_TONE_MAPPING_EXPOSURE;
/** @deprecated use manifest.rendering.colorDarken */
export const PLAYFIELD_MAP_COLOR_DARKEN = DEFAULT_MAP_COLOR_DARKEN;
