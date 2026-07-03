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

  // Bornes du lerp de rendu : positions aux deux derniers steps physiques.
  // Objets réutilisés (mutation en place) — zéro allocation dans le hot loop.
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
   * Recale prev = curr = position réelle du body. À appeler après TOUT
   * téléport (setTranslation) : sans ça, la frame suivante lerperait entre
   * l'ancienne et la nouvelle position → bille rendue en "streak" à travers
   * tout le terrain.
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
   * À appeler après CHAQUE world.step() : décale l'état courant vers prev et
   * capture la nouvelle position — fournit les deux bornes du lerp de rendu.
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
   * Sync visuel interpolé : position = lerp(prev, curr, alpha) pour lisser le
   * rendu 120 Hz sur une physique à 60 steps/s. Quaternion pris tel quel — la
   * rotation de la bille est peu perceptible, pas la peine de slerp.
   */
  syncToMeshInterpolated(
    mesh: {
      position: { set(x: number, y: number, z: number): void };
      quaternion: { set(x: number, y: number, z: number, w: number): void };
    },
    alpha: number,
  ): void {
    // Garde-fou téléports EXTERNES (ball.body.setTranslation direct : scoop de
    // map, hold d'intro boss, drag debug, locks stepBallSync) qu'on ne peut pas
    // tous intercepter : une distance prev↔curr impossible en un step physique
    // (vitesse clampée) trahit un téléport → snap sans lerp + resync des buffers.
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
