# Inventaire CSS backglass — classification pour extraction du thème ST

> Fichier de travail (commit 1, aucun changement de style). Pilote les commits
> 2 (thème par tokens) et 3 (contenu ST → CSS Modules map). **À supprimer au
> commit 3.** Source : `globals.css` (784 lignes).

## A. STRUCTUREL — reste dans l'app (`globals.css`)

Layout, grilles, composants d'app (HallOfFame, StatsBanner, AttractScene,
Recap/HighScore, ReactorFx, VhsGlitch), effets réactor pilotés par l'app.

| Lignes | Classes | Note |
|---|---|---|
| 1 | `@import 'tailwindcss'` | build |
| 12-18 | `body` | font system-ui générique |
| 20-44 | `stage-fit`, `stage` | grille ; **bg gradient = token** (cf. C) |
| 46-62 | `vignette`, `zone-*` | consomme `var(--vignette)` (token) |
| 64-72 | `disconnected` | |
| 150-261 | `hof-*` (title/list/row/rank/name/score/date/ghost/gold/silver/bronze/hot/shimmer) | HallOfFame ; `hof-title` consomme `--glow`/`--st-font` |
| 263-296 | `stats-banner`, `stats-carousel`, `stats-slide` | StatsBanner ; `--st-font` |
| 297-327 | `qr-*` | |
| 343-348 | `takeover-layer` | layout |
| 349-358 | `tk-center` | **partagé** (app + map) |
| 359-378 | `tk-kicker`, `tk-invite` | **partagé** ; `--glow`/`--st-font` |
| 380-384 | `tk-highscore`, `tk-rank`, `tk-player`, `tk-score` | HighScore ; `tk-score` partagé |
| 386-402 | `tk-confetti`, `confetti-dot`, `confetti-fall` | **partagé** (HighScore + map fireworks) ; couleur ST |
| 404-421 | `tk-recap`, `tk-recap-score`, `recap-*` | Recap ; `--glow`/`--st-font` |
| 439-446 | `tk-attract`, `attract-*` | AttractScene ; `--glow`/`--st-font` |
| 448-481 | `vhs`, `vhs-content`, `vhs-enter`, `vhs-rgb`, `vhs-scanlines`, `vhs-track`, `glitch-text`, `glitch-x` | **partagé** — transition VHS + RGB-split génériques |
| 483-504 | `vignette-heat`, heat sur `hof-shimmer` | réactor app ; consomme `--heat` |
| 506-547 | `hof-shake`, `banner-gold` (+keyframes) | réactor app |
| 549-594 | `portal-wave`, `stage-waking`, `stage-dimmed`, `wake`, `stage-dim` | réactor app |
| 687-709 | `gold-wave` (+keyframe) | milestone app |

**Classes PARTAGÉES** (app + composants map) → restent globales app, les
composants map les référencent comme chaînes globales : `tk-center`,
`tk-kicker`, `tk-score`, `tk-confetti`, `confetti-dot`, `vhs*`, `glitch-text`,
`tabular-nums`. Génériques, pas ST.

## B. CONTENU ST — part dans la map (CSS Modules `packages/maps/strangerthings/backglass/`)

Classes utilisées UNIQUEMENT par les composants map (JoyceWall, SideArt,
DemogorgonTakeover, takeover.tsx).

| Lignes | Classes | Composant |
|---|---|---|
| 74-110 | `joyce-wall`, `joyce-row`, `joyce-cell`, `joyce-bulb`, `joyce-letter` | JoyceWall |
| 112-148 | `side-art`, `side-art-svg`, `demo-body`, `demo-petal`, `vine` + keyframes `vine-sway`/`petal-flex`/`demo-breathe` | SideArt |
| 422-424 | `hetic-slots`, `hetic-on`, `hetic-off` | **MORT** (Recap génériqué) → supprimer |
| 426-437 | `tk-demogorgon`, `demo-flash`, `demo-giant`, `demo-text`, `demo-points` + `demo-flash`/`demo-loom` | DemogorgonTakeover |
| 506-527 | `ramp-beam`, `ramp-beam-on` (+keyframe) | SideArt (seul user) |
| 596-683 | `cine-blackout`, `tk-cine-rises`, `cine-giant-side`, `cine-run`, `tk-cine-portal`, `cine-portal-wave`, `cine-demo-count`, `tk-cine-last`, `cine-last-vignette`, `cine-last-text` + keyframes | takeover.tsx |
| 711-761 | `tk-cine-rocket`, `cine-rocket`, `tk-cine-fireworks`, `tk-cine-hetic`, `cine-hetic-letters`, `cine-fever-text` + keyframes | takeover.tsx |

> Les modules ST consomment les tokens (var(--glow), var(--st-font), var(--heat),
> var(--sway-dur)…) + référencent les classes structurelles partagées en global.

## C. THÈME — tokens exposés par la map, posés par l'app (custom properties)

L'app pose ces variables sur le conteneur racine (style inline via ref, pas de
re-render) depuis `BackglassMapContent.theme`. Défauts neutres si pas de thème.
Le structurel ET les modules ST consomment `var(--token, défaut)`.

| Token | Valeur ST actuelle | Lieux |
|---|---|---|
| `--glow` | `#ff2d2d` (normal) / `#b14dff` (alternate) | 13 usages (hof-title, tk-*, attract, stats) |
| `--vignette` | `#2a0606` / `#1a0640` | vignette |
| `--foreground` | `#ede4d3` | texte |
| `--st-font` | `'Times New Roman', Georgia, serif` | 14 usages (titres) |
| `--stage-bg` (NOUVEAU) | gradient `#160a10…` / alternate `#1a0a2a…` | `.stage` bg (ex-`.alternate-world .stage`) |
| `--joyce-bg` (NOUVEAU) | gradient `#1c1209…` / alternate `#150a22…` | joyce-wall (ex-`.alternate-world .joyce-wall`) |
| `--fever-a` / `--fever-b` | `#ff7700` / `#00c7ff` | bordure fever |

**Règles transverses à convertir en tokens** (sinon un sélecteur app ciblerait
une classe module map — cassé) :
- `:root` (3-10) → défauts des tokens.
- `.alternate-world` (329-341) → l'app, sur changement de monde, bascule
  `--glow`/`--vignette`/`--stage-bg`/`--joyce-bg` (les 2 derniers nouveaux).
  Plus de sélecteur `.alternate-world .joyce-wall` (joyce-wall devient module).
- `.vine { animation-duration: calc(var(--heat)…) }` (498-500) → déplacé dans le
  module SideArt, lit `var(--heat)` (posé par l'app sur `.stage`).
- `.fever .stage::before` / `.fever .vignette-heat` (763-784) → restent app
  (`.fever`/`.stage` structurels) ; couleurs via `--fever-a/b`.

## État cible
`grep -E 'cine-|demo-|joyce-' apps/backglass/src` → **zéro**. L'app ne contient
plus aucun style ST (seulement structurel + tokens à défauts neutres).
