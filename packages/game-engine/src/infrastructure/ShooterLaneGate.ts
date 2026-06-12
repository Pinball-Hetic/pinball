import RAPIER from '@dimforge/rapier3d-compat';
import {
  SHOOTER_LANE_X_MIN,
  SHOOTER_LANE_TOP_Z,
  SHOOTER_LANE_LEFT_WALL_TOP_Z,
  SHOOTER_LANE_WALL_HEIGHT,
  SHOOTER_LANE_RESTITUTION,
  SHOOTER_LANE_FRICTION,
} from '../domain/Ball';
import { surfaceYAtZ } from '../domain/PlayfieldGeometry';

// Mur de fermeture du couloir : posé un poil à droite du bord gauche du couloir,
// fin (le but est de boucher l'ouverture, pas de rebondir).
const GATE_X_INSET = 0.005;
const GATE_THICKNESS = 0.01;

export class ShooterLaneGate {
  private world: RAPIER.World | null = null;
  private body: RAPIER.RigidBody | null = null;
  private collider: RAPIER.Collider | null = null;

  bind(world: RAPIER.World): void {
    this.world = world;
  }

  isClosed(): boolean {
    return this.collider !== null;
  }

  open(): void {
    if (!this.world) return;
    if (this.collider) {
      this.world.removeCollider(this.collider, true);
      this.collider = null;
    }
    if (this.body) {
      this.world.removeRigidBody(this.body);
      this.body = null;
    }
  }

  close(): void {
    if (!this.world || this.collider) return;

    const x = SHOOTER_LANE_X_MIN + GATE_X_INSET;
    const zTop = SHOOTER_LANE_TOP_Z;
    const zBot = SHOOTER_LANE_LEFT_WALL_TOP_Z;
    const thickness = GATE_THICKNESS;
    const midZ = (zTop + zBot) / 2;
    const halfZ = (zBot - zTop) / 2;
    const yTop = surfaceYAtZ(zTop);
    const yBot = surfaceYAtZ(zBot);
    const midY = (yTop + yBot) / 2 + SHOOTER_LANE_WALL_HEIGHT / 2;
    const tilt = Math.atan2(yTop - yBot, zBot - zTop);

    this.body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed()
        .setTranslation(x, midY, midZ)
        .setRotation({ x: Math.sin(tilt / 2), y: 0, z: 0, w: Math.cos(tilt / 2) }),
    );
    this.collider = this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(
        thickness / 2,
        SHOOTER_LANE_WALL_HEIGHT / 2,
        halfZ,
      )
        .setRestitution(SHOOTER_LANE_RESTITUTION)
        .setFriction(SHOOTER_LANE_FRICTION),
      this.body,
    );
  }

  dispose(): void {
    this.open();
    this.world = null;
  }
}
