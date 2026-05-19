import { BALL_SPAWN_POSITION } from '../domain/Ball';
import { ballCenterOnSurface } from '../domain/PlayfieldGeometry';

export interface IAnimatableBody {
  translation(): { x: number; y: number; z: number };
  setTranslation(pos: { x: number; y: number; z: number }, wakeUp: boolean): void;
  setLinvel(vel: { x: number; y: number; z: number }, wakeUp: boolean): void;
  setAngvel(vel: { x: number; y: number; z: number }, wakeUp: boolean): void;
  wakeUp(): void;
}

const CURVE_START_Z = -0.35;
const CURVE_END_Z   = -0.40;
const CURVE_START_X = BALL_SPAWN_POSITION.x;
const CURVE_END_X   = 0.05;

export class LauncherLaneAnimator {
  update(
    ballBody: IAnimatableBody,
    speed: number,
    dt: number,
  ): { done: boolean; exitVel?: { x: number; y: number; z: number } } {
    const curZ = ballBody.translation().z;
    const newZ = curZ - speed * dt;

    if (newZ <= CURVE_END_Z) {
      const xSpread = (Math.random() - 0.6) * 0.4;
      const exitPos = { x: 0.06, y: ballCenterOnSurface(-0.38), z: -0.38 };
      const exitVel = { x: speed * xSpread, y: -0.15 * speed, z: speed * 0.65 };
      ballBody.setTranslation(exitPos, true);
      ballBody.setLinvel(exitVel, true);
      ballBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
      ballBody.wakeUp();
      return { done: true, exitVel };
    }

    if (newZ <= CURVE_START_Z) {
      const t = (CURVE_START_Z - newZ) / (CURVE_START_Z - CURVE_END_Z);
      const tSmooth = t * t * (3 - 2 * t);
      const curX = CURVE_START_X + (CURVE_END_X - CURVE_START_X) * tSmooth;
      ballBody.setTranslation({ x: curX, y: ballCenterOnSurface(newZ), z: newZ }, true);
      ballBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
      ballBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
      return { done: false };
    }

    ballBody.setTranslation({ x: BALL_SPAWN_POSITION.x, y: ballCenterOnSurface(newZ), z: newZ }, true);
    ballBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
    ballBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
    return { done: false };
  }
}
