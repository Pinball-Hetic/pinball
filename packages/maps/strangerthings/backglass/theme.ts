// Tokens de thème backglass de la map (CSS custom properties). L'app les pose
// en style inline sur le conteneur racine (cf. apps/backglass pages/index).
// Le CSS structurel de l'app + les modules ST de la map consomment ces var().
// Une map sans thème → l'app garde ses défauts neutres (rien de ST en dur).
export type ThemeTokens = Record<`--${string}`, string>

// Palette normale (monde réel).
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

// Surcharges du monde alternatif (Upside Down) — fusionnées par-dessus la base
// quand alternateWorld est actif.
export const backglassThemeAlternate: ThemeTokens = {
  '--glow': '#b14dff',
  '--vignette': '#1a0640',
  '--stage-bg': 'radial-gradient(ellipse at 50% 38%, #1a0a2a 0%, #06040c 60%, #000 100%)',
  '--stage-filter': 'hue-rotate(8deg) saturate(1.1)',
  '--header-bg': 'linear-gradient(180deg, #150a22 0%, #0b0614 100%)',
}
