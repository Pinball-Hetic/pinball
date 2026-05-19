import RAPIER from '@dimforge/rapier3d-compat';
import {
  BALL_RADIUS,
  BALL_MASS,
  BALL_LINEAR_DAMPING,
  BALL_ANGULAR_DAMPING,
  BALL_SPAWN_POSITION,
  BUMPER_EJECT_IMPULSE,
  PLUNGER_IMPULSE_Z,
} from '../domain/Ball';
import { ballCenterOnSurface } from '../domain/PlayfieldGeometry';
import type { IBallPhysics } from '../use-cases/LaunchBall';
import type { IBumperEject } from '../use-cases/BumperHit';

export class BallPhysics implements IBallPhysics, IBumperEject {
  public readonly body: RAPIER.RigidBody;
  public readonly collider: RAPIER.Collider;

  private spawnX: number = BALL_SPAWN_POSITION.x;
  private spawnY: number = BALL_SPAWN_POSITION.y;
  private spawnZ: number = BALL_SPAWN_POSITION.z;

  constructor(world: RAPIER.World) {
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(BALL_SPAWN_POSITION.x, BALL_SPAWN_POSITION.y, BALL_SPAWN_POSITION.z)
      .setLinearDamping(BALL_LINEAR_DAMPING)
      .setAngularDamping(BALL_ANGULAR_DAMPING)
      .setCcdEnabled(true);
    this.body = world.createRigidBody(bodyDesc);

    const density = BALL_MASS / ((4 / 3) * Math.PI * BALL_RADIUS ** 3);
    const colliderDesc = RAPIER.ColliderDesc.ball(BALL_RADIUS)
      .setRestitution(0.4)
      .setFriction(0.1)
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
