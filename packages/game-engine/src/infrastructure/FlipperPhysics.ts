import RAPIER from '@dimforge/rapier3d-compat';
import { BALL_RADIUS } from '../domain/Ball';
import { FLIPPER_RESTITUTION } from '../domain/FlipperConstants';

export class FlipperPhysics {
  static createBody(
    world: RAPIER.World,
    center: { x: number; y: number; z: number },
    size: { x: number; y: number; z: number },
  ): RAPIER.RigidBody {
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased()
        .setTranslation(center.x, center.y, center.z),
    );
    const halfY = Math.max(size.y / 2, BALL_RADIUS * 3);
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(size.x / 2, halfY, size.z / 2 + BALL_RADIUS)
        .setRestitution(FLIPPER_RESTITUTION)
        .setFriction(0.28)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      body,
    );
    return body;
  }
}
