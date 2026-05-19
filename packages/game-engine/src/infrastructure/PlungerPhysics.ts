import RAPIER from '@dimforge/rapier3d-compat';

export class PlungerPhysics {
  static createBody(
    world: RAPIER.World,
    position: { x: number; y: number; z: number },
  ): RAPIER.RigidBody {
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased()
        .setTranslation(position.x, position.y, position.z),
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
