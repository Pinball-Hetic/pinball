import { easeInOut } from '@pinball/game-engine';
import {
  UPSIDE_DOWN_PORTAL_OPEN_DURATION,
  UPSIDE_DOWN_PORTAL_REVEAL_DELAY,
} from './UpsideDownConstants';

const DELAY_PROGRESS_FRACTION = 0.28;

export function portalRevealTotalDuration(): number {
  return UPSIDE_DOWN_PORTAL_REVEAL_DELAY + UPSIDE_DOWN_PORTAL_OPEN_DURATION;
}

export function mapPortalRevealProgress(u: number): number {
  const total = portalRevealTotalDuration();
  const delayFrac = UPSIDE_DOWN_PORTAL_REVEAL_DELAY / total;
  if (u <= delayFrac) return (u / delayFrac) * DELAY_PROGRESS_FRACTION;
  const tail = (u - delayFrac) / (1 - delayFrac);
  return DELAY_PROGRESS_FRACTION + easeInOut(tail) * (1 - DELAY_PROGRESS_FRACTION);
}
