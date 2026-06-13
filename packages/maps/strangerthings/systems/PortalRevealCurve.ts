import { easeInOut } from '@pinball/game-engine';
import {
  UPSIDE_DOWN_PORTAL_OPEN_DURATION,
  UPSIDE_DOWN_PORTAL_REVEAL_DELAY,
} from './UpsideDownConstants';

// Part de la progression d'ouverture atteinte pendant la phase de délai
// (le reste de [DELAY_PROGRESS_FRACTION, 1] est couvert par la phase d'ouverture).
const DELAY_PROGRESS_FRACTION = 0.28;

export function portalRevealTotalDuration(): number {
  return UPSIDE_DOWN_PORTAL_REVEAL_DELAY + UPSIDE_DOWN_PORTAL_OPEN_DURATION;
}

/**
 * Mappe le temps de reveal normalisé `u` ∈ [0,1] (sur délai + ouverture) vers la
 * progression d'ouverture du portail `p` ∈ [0,1] : la phase de délai amène la
 * couverture jusqu'à DELAY_PROGRESS_FRACTION (linéaire), la phase d'ouverture
 * easeInOut le reste jusqu'à 1.
 */
export function mapPortalRevealProgress(u: number): number {
  const total = portalRevealTotalDuration();
  const delayFrac = UPSIDE_DOWN_PORTAL_REVEAL_DELAY / total;
  if (u <= delayFrac) return (u / delayFrac) * DELAY_PROGRESS_FRACTION;
  const tail = (u - delayFrac) / (1 - delayFrac);
  return DELAY_PROGRESS_FRACTION + easeInOut(tail) * (1 - DELAY_PROGRESS_FRACTION);
}
