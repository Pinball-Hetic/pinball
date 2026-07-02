import type { BallPhysics } from "@pinball/game-engine";
import type { InputState } from "../createApplyAction";

// État du hold d'intro boss : à l'entrée en intro, on capture la position de la
// bille et on la fige (relâche des flippers + vitesses nulles) ; stepBallSync la
// maintient à `pos` tant que l'intro dure. Rising-edge : la capture n'a lieu
// qu'une fois par intro.
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
