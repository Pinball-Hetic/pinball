// Règle d'affichage des vies sur le DMD (pure, testée).
//
// Jusqu'à 3 vies : rangée de pastilles ● (comptage visuel direct). Au-delà
// (vies bonus / rescue), les pastilles ne passent pas à l'échelle → on bascule
// sur un compteur compact "N ●". Piloté par le VRAI nombre de vies, jamais
// plafonné à 3 (sinon désync DMD ↔ jeu). Partagé par le rendu canvas
// (drawLivesRow) et le rendu JSX plat (apps/dmd ?flat).

export const DOTS_MAX_LIVES = 3;

export type LivesDisplay =
  | { kind: 'dots'; total: number; filled: number }
  | { kind: 'count'; value: number };

export function livesDisplay(lives: number): LivesDisplay {
  const n = Math.max(0, Math.floor(lives));
  if (n <= DOTS_MAX_LIVES) {
    return { kind: 'dots', total: DOTS_MAX_LIVES, filled: n };
  }
  return { kind: 'count', value: n };
}
