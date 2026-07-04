import { easeInOut } from '@pinball/game-engine';
import {
  UPSIDE_DOWN_PORTAL_OPEN_DURATION,
  UPSIDE_DOWN_PORTAL_REVEAL_DELAY,
} from './UpsideDownConstants';

// Share of the opening progress reached during the delay phase
// (the remaining [DELAY_PROGRESS_FRACTION, 1] is covered by the opening phase).
const DELAY_PROGRESS_FRACTION = 0.28;

export function portalRevealTotalDuration(): number {
  return UPSIDE_DOWN_PORTAL_REVEAL_DELAY + UPSIDE_DOWN_PORTAL_OPEN_DURATION;
}

/**
 * Maps normalized reveal time `u` ∈ [0,1] (over delay + opening) to the
 * portal opening progress `p` ∈ [0,1]: the delay phase brings coverage up to
 * DELAY_PROGRESS_FRACTION (linear), the opening phase eases in-out the rest
 * up to 1.
 */
export function mapPortalRevealProgress(u: number): number {
  const total = portalRevealTotalDuration();
  const delayFrac = UPSIDE_DOWN_PORTAL_REVEAL_DELAY / total;
  if (u <= delayFrac) return (u / delayFrac) * DELAY_PROGRESS_FRACTION;
  const tail = (u - delayFrac) / (1 - delayFrac);
  return DELAY_PROGRESS_FRACTION + easeInOut(tail) * (1 - DELAY_PROGRESS_FRACTION);
}
