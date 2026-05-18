import RAPIER from '@dimforge/rapier3d-compat';
import { BALL_RADIUS, BALL_SPAWN_POSITION } from '../domain/Ball';
import { surfaceYAtZ } from '../domain/PlayfieldGeometry';

const CURVE_START_Z = -0.35;
const CURVE_END_Z   = -0.40;
const CURVE_START_X = BALL_SPAWN_POSITION.x;
const CURVE_END_X   = 0.05;

function laneSurfaceY(z: number): number {
  return surfaceYAtZ(z) + BALL_RADIUS + 0.004;
}

export class LauncherLaneAnimator {
  update(
    ballBody: RAPIER.RigidBody,
    speed: number,
    dt: number,
  ): { done: boolean; exitVel?: { x: number; y: number; z: number } } {
    const curZ = ballBody.translation().z;
    const newZ = curZ - speed * dt;

    if (newZ <= CURVE_END_Z) {
      const xSpread = (Math.random() - 0.6) * 0.4;
      const exitPos = { x: 0.06, y: laneSurfaceY(-0.38), z: -0.38 };
      const exitVel = { x: speed * xSpread, y: 0, z: speed * 0.5 };
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
      ballBody.setTranslation({ x: curX, y: laneSurfaceY(newZ), z: newZ }, true);
      ballBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
      ballBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
      return { done: false };
    }

    ballBody.setTranslation({ x: BALL_SPAWN_POSITION.x, y: laneSurfaceY(newZ), z: newZ }, true);
    ballBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
    ballBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
    return { done: false };
  }
}
