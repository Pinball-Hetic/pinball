/**
 * gameStateUtils.ts — Fonctions pures et constantes du game state.
 *
 * Extraites de useGameState.ts (SRP) : ces utilitaires ne dépendent d'aucun
 * state React, aucun ref, aucun hook. Ils peuvent être testés indépendamment
 * de React, sans monter de composant.
 */

export const COMBO_DECAY_MS = 2000;
export const MULTIPLIER_THRESHOLDS = [5, 10, 20, 40] as const;

export const MILESTONES = [5_000, 15_000, 30_000];
export const MILESTONE_REPEAT_EVERY = 25_000; // au-delà de 50k

/**
 * Renvoie le multiplicateur de score correspondant au combo courant.
 * Combo 0–4 → ×1, 5–9 → ×2, 10–19 → ×3, 20–39 → ×4, 40+ → ×5.
 */
export function computeMultiplier(combo: number): number {
  if (combo < MULTIPLIER_THRESHOLDS[0]) return 1;
  if (combo < MULTIPLIER_THRESHOLDS[1]) return 2;
  if (combo < MULTIPLIER_THRESHOLDS[2]) return 3;
  if (combo < MULTIPLIER_THRESHOLDS[3]) return 4;
  return 5;
}

/**
 * Plus haut seuil de {5k,15k,30k,50k,75k,100k,…} franchi entre prev et next.
 * Marque TOUS les seuils franchis dans `passed` (sinon les seuils intermédiaires
 * non retournés re-déclencheraient au prochain event) et renvoie le plus haut.
 */
export function nextMilestone(prev: number, next: number, passed: Set<number>): number | null {
  let crossed: number | null = null;
  const mark = (m: number) => {
    if (m > prev && m <= next && !passed.has(m)) {
      passed.add(m);
      if (crossed === null || m > crossed) crossed = m;
    }
  };
  for (const m of MILESTONES) mark(m);
  // Répétition tous les 25k au-delà de 50k.
  for (let m = 50_000; m <= next; m += MILESTONE_REPEAT_EVERY) mark(m);
  return crossed;
}

/**
 * Génère un nom de joueur aléatoire de la forme PLAYER0000–PLAYER9999.
 */
export function generatePlayerName(): string {
  const n = Math.floor(Math.random() * 10000).toString().padStart(4, "0");
  return `PLAYER${n}`;
}
