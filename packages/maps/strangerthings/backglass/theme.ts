// Map backglass theme tokens (CSS custom properties). The app sets them as
// inline style on the root container (see apps/backglass pages/index).
// The app's structural CSS + the map's ST modules consume these var().
// A map without a theme → the app keeps its neutral defaults (no hardcoded ST).
export type ThemeTokens = Record<`--${string}`, string>

// Normal palette (real world).
export const backglassTheme: ThemeTokens = {
  '--foreground': '#ede4d3',
  '--glow': '#ff2d2d',
  '--vignette': '#2a0606',
  '--st-font': "'Times New Roman', Georgia, serif",
  '--stage-bg': 'radial-gradient(ellipse at 50% 38%, #160a10 0%, #060406 60%, #000 100%)',
  '--stage-filter': 'none',
  '--header-bg': 'linear-gradient(180deg, #1c1209 0%, #120b06 100%)',
  '--fever-a': '#ff7700',
  '--fever-b': '#00c7ff',
}

// Alternate world (Upside Down) overrides — merged over the base when
// alternateWorld is active.
export const backglassThemeAlternate: ThemeTokens = {
  '--glow': '#b14dff',
  '--vignette': '#1a0640',
  '--stage-bg': 'radial-gradient(ellipse at 50% 38%, #1a0a2a 0%, #06040c 60%, #000 100%)',
  '--stage-filter': 'hue-rotate(8deg) saturate(1.1)',
  '--header-bg': 'linear-gradient(180deg, #150a22 0%, #0b0614 100%)',
}
