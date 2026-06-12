import type { BossId } from './BossRegistry';

export type GameEvent =
  | { type: 'BUMPER_HIT'; bumperIndex: number; scoreIncrement: number }
  | { type: 'SLINGSHOT_HIT'; side: 'left' | 'right'; scoreIncrement: number }
  | { type: 'RAMP_HIT'; scoreIncrement: number }
  | { type: 'DROP_TARGET_HIT'; targetId: string; scoreIncrement: number }
  | { type: 'DROP_TARGET_COMPLETE'; side: 'left' | 'right'; scoreIncrement: number }
  | { type: 'DROP_TARGET_RESET' }
  | { type: 'ZONE_HIT'; zone: string; scoreIncrement: number }
  | { type: 'BOSS_REVEAL'; bossId: BossId; scoreIncrement: number }
  | { type: 'BOSS_TARGET_HIT'; bossId: BossId; hitCount: number; scoreIncrement: number }
  | { type: 'BOSS_LOCKED_HIT'; bossId: BossId; remaining: number }
  | { type: 'ASSIST'; assistId: string; scoreIncrement: number }
  | { type: 'PORTAL_ENTER'; scoreIncrement: number }
  | { type: 'PORTAL_TREMOR' }
  | { type: 'PORTAL_TRANSITION_END' }
  | { type: 'RETURN_PORTAL_ENTER'; scoreIncrement: number }
  | { type: 'RETURN_PORTAL_TRANSITION_END' }
  | { type: 'WORLD_CYCLE_COMPLETE' }
  | { type: 'DRAIN' }
  | { type: 'BOTTOM_OUT' }
  | { type: 'BUMP_HIT'; side: 'left' | 'right'; scoreIncrement: number }
  | { type: 'BALL_LAUNCHED' };

export type GameEventListener = (event: GameEvent) => void;
