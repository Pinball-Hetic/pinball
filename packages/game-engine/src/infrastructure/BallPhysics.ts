import RAPIER from '@dimforge/rapier3d-compat';
import type { IMapBallPhysics } from '../domain/IBallPhysics';
import {
  getBallRadius,
  BALL_MASS,
  BALL_RESTITUTION,
  BALL_FRICTION,
  BALL_LINEAR_DAMPING,
  BALL_ANGULAR_DAMPING,
  BUMPER_EJECT_IMPULSE,
  PLUNGER_IMPULSE_Z,
} from '../domain/Ball';
import type { MapLayout } from '../domain/MapLayout';
import { ballCenterOnSurface } from '../domain/PlayfieldGeometry';
import { lerpVec3, BALL_INTERPOLATION_TELEPORT_DIST } from '../domain/RenderInterpolation';
import { radialEjectionImpulse, sidedEjectionImpulse } from '../domain/BumperEjection';
import type { IBallPhysics } from '../use-cases/LaunchBall';
import type { IBumperEject } from '../use-cases/BumperHit';

export class BallPhysics implements IMapBallPhysics, IBumperEject, IBallPhysics {
  public readonly body: RAPIER.RigidBody;
  public readonly collider: RAPIER.Collider;

  private readonly spawns: MapLayout['spawns'];
  private spawnX: number;
  private spawnY: number;
  private spawnZ: number;

  // Render-lerp bounds: positions at the last two physics steps.
  // Reused objects (mutated in place) — zero allocation in the hot loop.
  private readonly prevPos = { x: 0, y: 0, z: 0 };
  private readonly currPos = { x: 0, y: 0, z: 0 };
  private readonly lerpOut = { x: 0, y: 0, z: 0 };

  constructor(world: RAPIER.World, layout: MapLayout) {
    this.spawns = layout.spawns;
    const ball = layout.spawns.ball;
    this.spawnX = ball.x;
    this.spawnY = ball.y;
    this.spawnZ = ball.z;

    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(ball.x, ball.y, ball.z)
      .setLinearDamping(BALL_LINEAR_DAMPING)
      .setAngularDamping(BALL_ANGULAR_DAMPING)
      .setCcdEnabled(true);
    this.body = world.createRigidBody(bodyDesc);

    const r = getBallRadius();
    const density = BALL_MASS / ((4 / 3) * Math.PI * r ** 3);
    const colliderDesc = RAPIER.ColliderDesc.ball(r)
      .setRestitution(BALL_RESTITUTION)
      .setFriction(BALL_FRICTION)
      .setDensity(density)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
    this.collider = world.createCollider(colliderDesc, this.body);
    this.resetInterpolation();
  }

  /**
   * Resets prev = curr = the body's real position. Call after EVERY teleport
   * (setTranslation): otherwise the next frame would lerp between the old
   * and new positions → ball rendered as a "streak" across the playfield.
   */
  private resetInterpolation(): void {
    const p = this.body.translation();
    this.prevPos.x = p.x;
    this.prevPos.y = p.y;
    this.prevPos.z = p.z;
    this.currPos.x = p.x;
    this.currPos.y = p.y;
    this.currPos.z = p.z;
  }

  /**
   * Call after EACH world.step(): shifts the current state into prev and
   * captures the new position — provides both bounds of the render lerp.
   */
  noteStepped(): void {
    this.prevPos.x = this.currPos.x;
    this.prevPos.y = this.currPos.y;
    this.prevPos.z = this.currPos.z;
    const p = this.body.translation();
    this.currPos.x = p.x;
    this.currPos.y = p.y;
    this.currPos.z = p.z;
  }

  setSpawnPosition(x: number, y: number, z: number): void {
    this.spawnX = x;
    this.spawnZ = z;
    this.spawnY = ballCenterOnSurface(z);
    this.body.setTranslation({ x: this.spawnX, y: this.spawnY, z: this.spawnZ }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.body.wakeUp();
    this.resetInterpolation();
  }

  applyPlungerImpulse(factor = 1): void {
    this.body.wakeUp();
    const z = this.spawnZ;
    const y = ballCenterOnSurface(z);
    this.body.setTranslation({ x: this.spawnX, y, z }, true);
    this.resetInterpolation();
    this.body.applyImpulse(
      { x: 0, y: -0.02 * factor, z: PLUNGER_IMPULSE_Z * factor },
      true,
    );
  }

  resetToSpawn(): void {
    this.body.setTranslation({ x: this.spawnX, y: this.spawnY, z: this.spawnZ }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.body.wakeUp();
    this.resetInterpolation();
  }

  holdAtAlternateWorldSpawn(): void {
    const s = this.spawns.alternateWorld;
    const y = ballCenterOnSurface(s.z) + 0.004;
    this.body.setTranslation({ x: s.x, y, z: s.z }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.body.wakeUp();
    this.resetInterpolation();
  }

  spawnFromAlternateWorld(): void {
    this.holdAtAlternateWorldSpawn();
    const i = this.spawns.alternateWorldImpulse;
    this.body.applyImpulse({ x: i.x, y: i.y, z: i.z }, true);
  }

  holdAtNormalReturnSpawn(): void {
    const s = this.spawns.normalReturn;
    const y = ballCenterOnSurface(s.z) + 0.004;
    this.body.setTranslation({ x: s.x, y, z: s.z }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.body.wakeUp();
    this.resetInterpolation();
  }

  spawnFromNormalReturn(): void {
    this.holdAtNormalReturnSpawn();
    const i = this.spawns.normalReturnImpulse;
    this.body.applyImpulse({ x: i.x, y: i.y, z: i.z }, true);
  }

  applyEjectionForce(bumperPos: { x: number; z: number }): void {
    const t = this.body.translation();
    this.body.applyImpulse(
      radialEjectionImpulse({ x: t.x, z: t.z }, bumperPos, BUMPER_EJECT_IMPULSE),
      true,
    );
  }

  applyScaledEjectionForce(scale: number, side: 'left' | 'right'): void {
    this.body.applyImpulse(sidedEjectionImpulse(side, BUMPER_EJECT_IMPULSE * scale), true);
  }

  syncToMesh(mesh: {
    position: { set(x: number, y: number, z: number): void };
    quaternion: { set(x: number, y: number, z: number, w: number): void };
  }): void {
    const p = this.body.translation();
    const q = this.body.rotation();
    mesh.position.set(p.x, p.y, p.z);
    mesh.quaternion.set(q.x, q.y, q.z, q.w);
  }

  /**
   * Interpolated visual sync: position = lerp(prev, curr, alpha) to smooth
   * 120 Hz rendering over 60 steps/s physics. Quaternion taken as-is — ball
   * rotation is barely perceptible, no need to slerp.
   */
  syncToMeshInterpolated(
    mesh: {
      position: { set(x: number, y: number, z: number): void };
      quaternion: { set(x: number, y: number, z: number, w: number): void };
    },
    alpha: number,
  ): void {
    // Guard against EXTERNAL teleports (direct ball.body.setTranslation: map
    // scoop, boss intro hold, debug drag, stepBallSync locks) that cannot all
    // be intercepted: a prev↔curr distance impossible within one physics step
    // (clamped speed) betrays a teleport → snap without lerp + resync buffers.
    const dx = this.currPos.x - this.prevPos.x;
    const dy = this.currPos.y - this.prevPos.y;
    const dz = this.currPos.z - this.prevPos.z;
    const teleportDistSq = BALL_INTERPOLATION_TELEPORT_DIST * BALL_INTERPOLATION_TELEPORT_DIST;
    if (dx * dx + dy * dy + dz * dz > teleportDistSq) {
      this.resetInterpolation();
    }
    const p = lerpVec3(this.prevPos, this.currPos, alpha, this.lerpOut);
    const q = this.body.rotation();
    mesh.position.set(p.x, p.y, p.z);
    mesh.quaternion.set(q.x, q.y, q.z, q.w);
  }
}
