import RAPIER from '@dimforge/rapier3d-compat';

/**
 * Rapier renamed `RigidBodyDesc.newKinematicPositionBased()` to
 * `.kinematicPositionBased()`. Depending on which exact
 * `@dimforge/rapier3d-compat` build actually gets resolved (version drift
 * between a fresh install and a cached one — e.g. a nested/older copy pulled
 * in transitively), only one of the two names may exist at runtime even
 * though both are declared in the current package's types. Feature-detect
 * instead of hard-crashing with "kinematicPositionBased is not a function".
 */
function kinematicPositionBasedDesc(): RAPIER.RigidBodyDesc {
  const Desc = RAPIER.RigidBodyDesc;
  if (typeof Desc.kinematicPositionBased === 'function') {
    return Desc.kinematicPositionBased();
  }
  if (typeof Desc.newKinematicPositionBased === 'function') {
    return Desc.newKinematicPositionBased();
  }
  throw new Error(
    '[PlungerPhysics] No kinematic position-based constructor found on ' +
      'RAPIER.RigidBodyDesc (expected kinematicPositionBased() or the ' +
      'deprecated newKinematicPositionBased()). Check the installed ' +
      '@dimforge/rapier3d-compat version.',
  );
}

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
