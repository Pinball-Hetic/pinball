import RAPIER from '@dimforge/rapier3d-compat';
import {
  BALL_RADIUS,
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
import type { IBallPhysics } from '../use-cases/LaunchBall';
import type { IBumperEject } from '../use-cases/BumperHit';

export class BallPhysics implements IBallPhysics, IBumperEject {
  public readonly body: RAPIER.RigidBody;
  public readonly collider: RAPIER.Collider;

  private readonly spawns: MapLayout['spawns'];
  private spawnX: number;
  private spawnY: number;
  private spawnZ: number;

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

    const density = BALL_MASS / ((4 / 3) * Math.PI * BALL_RADIUS ** 3);
    const colliderDesc = RAPIER.ColliderDesc.ball(BALL_RADIUS)
      .setRestitution(BALL_RESTITUTION)
      .setFriction(BALL_FRICTION)
      .setDensity(density)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
    this.collider = world.createCollider(colliderDesc, this.body);
  }

  setSpawnPosition(x: number, y: number, z: number): void {
    this.spawnX = x;
    this.spawnZ = z;
    this.spawnY = ballCenterOnSurface(z);
    this.body.setTranslation({ x: this.spawnX, y: this.spawnY, z: this.spawnZ }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.body.wakeUp();
  }

  applyPlungerImpulse(factor = 1): void {
    this.body.wakeUp();
    const z = this.spawnZ;
    const y = ballCenterOnSurface(z);
    this.body.setTranslation({ x: this.spawnX, y, z }, true);
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
  }

  holdAtUpsideDownSpawn(): void {
    const s = this.spawns.upsideDown;
    const y = ballCenterOnSurface(s.z) + 0.004;
    this.body.setTranslation({ x: s.x, y, z: s.z }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.body.wakeUp();
  }

  spawnFromUpsideDown(): void {
    this.holdAtUpsideDownSpawn();
    const i = this.spawns.upsideDownImpulse;
    this.body.applyImpulse({ x: i.x, y: i.y, z: i.z }, true);
  }

  holdAtNormalReturnSpawn(): void {
    const s = this.spawns.normalReturn;
    const y = ballCenterOnSurface(s.z) + 0.004;
    this.body.setTranslation({ x: s.x, y, z: s.z }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.body.wakeUp();
  }

  spawnFromNormalReturn(): void {
    this.holdAtNormalReturnSpawn();
    const i = this.spawns.normalReturnImpulse;
    this.body.applyImpulse({ x: i.x, y: i.y, z: i.z }, true);
  }

  applyEjectionForce(bumperPos: { x: number; z: number }): void {
    const p = this.body.translation();
    const dx = p.x - bumperPos.x;
    const dz = p.z - bumperPos.z;
    const len = Math.sqrt(dx * dx + dz * dz) || 1;
    this.body.applyImpulse(
      { x: (dx / len) * BUMPER_EJECT_IMPULSE, y: 0, z: (dz / len) * BUMPER_EJECT_IMPULSE },
      true,
    );
  }

  applyScaledEjectionForce(scale: number, side: 'left' | 'right'): void {
    // Direction X fixe : bump_left pousse toujours à droite (+X),
    //                     bump_right pousse toujours à gauche (-X).
    // Peu importe où la balle touche le mèche, la direction horizontale est
    // déterministe → effet ping-pong entre les deux bumps.
    const xDir = side === 'left' ? 1 : -1;
    const impulse = BUMPER_EJECT_IMPULSE * scale;
    this.body.applyImpulse({ x: xDir * impulse, y: 0, z: 0 }, true);
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
}
