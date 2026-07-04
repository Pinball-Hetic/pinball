import type { BallPhysics } from "@pinball/game-engine";
import type { InputState } from "../createApplyAction";

// Boss-intro hold state: on entering the intro, capture the ball position and
// freeze it (release flippers + zero velocities); stepBallSync keeps it at `pos`
// for the intro's duration. Rising-edge: capture happens only once per intro.
export interface BossIntroHoldState {
  holding: boolean;
  pos: { x: number; y: number; z: number };
}

export function createBossIntroHoldState(): BossIntroHoldState {
  return { holding: false, pos: { x: 0, y: 0, z: 0 } };
}

export function stepBossIntroHold(
  s: BossIntroHoldState,
  bossIntroActive: boolean,
  ball: BallPhysics | null,
  input: InputState,
): void {
  if (bossIntroActive && !s.holding && ball) {
    const p = ball.body.translation();
    s.pos.x = p.x;
    s.pos.y = p.y;
    s.pos.z = p.z;
    s.holding = true;
    input.leftTarget = 0;
    input.rightTarget = 0;
    ball.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    ball.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }
  if (!bossIntroActive) {
    s.holding = false;
  }
}
