import * as RAPIER from '@dimforge/rapier3d-compat';
import type { MapLayout } from '../domain/MapLayout';
import { surfaceYAtZ } from '../domain/PlayfieldGeometry';

type LaneConfig = MapLayout['shooterLane'];

// Lane-closing wall: placed just right of the lane's left edge, thin (the goal
// is to plug the opening, not to bounce the ball).
const GATE_X_INSET = 0.005;
const GATE_THICKNESS = 0.01;

export class ShooterLaneGate {
  private world: RAPIER.World | null = null;
  private body: RAPIER.RigidBody | null = null;
  private collider: RAPIER.Collider | null = null;
  private lane: LaneConfig | null = null;

  bind(world: RAPIER.World, lane: LaneConfig): void {
    this.world = world;
    this.lane = lane;
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
    if (!this.world || this.collider || !this.lane) return;
    const lane = this.lane;

    const x = lane.xMin + GATE_X_INSET;
    const zTop = lane.topZ;
    const zBot = lane.leftWallTopZ;
    const thickness = GATE_THICKNESS;
    const midZ = (zTop + zBot) / 2;
    const halfZ = (zBot - zTop) / 2;
    const yTop = surfaceYAtZ(zTop);
    const yBot = surfaceYAtZ(zBot);
    const midY = (yTop + yBot) / 2 + lane.wallHeight / 2;
    const tilt = Math.atan2(yTop - yBot, zBot - zTop);

    this.body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed()
        .setTranslation(x, midY, midZ)
        .setRotation({ x: Math.sin(tilt / 2), y: 0, z: 0, w: Math.cos(tilt / 2) }),
    );
    this.collider = this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(
        thickness / 2,
        lane.wallHeight / 2,
        halfZ,
      )
        .setRestitution(lane.restitution)
        .setFriction(lane.friction),
      this.body,
    );
  }

  dispose(): void {
    this.open();
    this.world = null;
  }
}
