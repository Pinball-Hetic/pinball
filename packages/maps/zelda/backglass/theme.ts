export type ThemeTokens = Record<`--${string}`, string>

export const backglassTheme: ThemeTokens = {
  '--foreground': '#dff5c8',
  '--glow': '#22cc44',
  '--vignette': '#020b03',
  '--st-font': "'Georgia', 'Times New Roman', serif",
  '--stage-bg': 'radial-gradient(ellipse at 50% 38%, #071408 0%, #030804 60%, #000 100%)',
  '--stage-filter': 'none',
  '--header-bg': 'linear-gradient(180deg, #0a1908 0%, #060e04 100%)',
  '--fever-a': '#FFD700',
  '--fever-b': '#22cc44',
}

// Partial overrides merged over backglassTheme when alternateWorld is active.
export const backglassThemeAlternate: ThemeTokens = {
  '--glow': '#FFD700',
  '--vignette': '#150f00',
  '--stage-bg': 'radial-gradient(ellipse at 50% 38%, #1c1400 0%, #0d0900 60%, #000 100%)',
  '--stage-filter': 'sepia(0.2) saturate(1.15)',
  '--header-bg': 'linear-gradient(180deg, #1c1900 0%, #0d1000 100%)',
}
