import * as RAPIER from '@dimforge/rapier3d-compat';
import { kinematicPositionBasedDesc } from './RapierCompat';

export class PlungerPhysics {
  static createBody(
    world: RAPIER.World,
    position: { x: number; y: number; z: number },
  ): RAPIER.RigidBody {
    const body = world.createRigidBody(
      kinematicPositionBasedDesc().setTranslation(position.x, position.y, position.z),
    );
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.015, 0.015, 0.02)
        .setRestitution(0.4)
        .setFriction(0.1),
      body,
    );
    return body;
  }
}
