import RAPIER from '@dimforge/rapier3d-compat';

/**
 * Rapier renamed `RigidBodyDesc.newKinematicPositionBased()` to
 * `.kinematicPositionBased()`. Depending on which exact
 * `@dimforge/rapier3d-compat` build actually resolves at runtime (version drift
 * between a fresh install and a cached/transitive copy — e.g. the 0.12.0 pulled
 * in by `@types/three`), only one of the two names may exist even though both
 * are declared in the current types. Feature-detect instead of hard-crashing
 * with "kinematicPositionBased is not a function".
 *
 * The root fix is the `overrides` pin in the root package.json; this guard is
 * belt-and-suspenders against future drift regardless of the lockfile.
 */
export function kinematicPositionBasedDesc(): RAPIER.RigidBodyDesc {
  const Desc = RAPIER.RigidBodyDesc as typeof RAPIER.RigidBodyDesc & {
    newKinematicPositionBased?: () => RAPIER.RigidBodyDesc;
  };
  if (typeof Desc.kinematicPositionBased === 'function') {
    return Desc.kinematicPositionBased();
  }
  if (typeof Desc.newKinematicPositionBased === 'function') {
    return Desc.newKinematicPositionBased();
  }
  throw new Error(
    '[RapierCompat] No kinematic position-based constructor on RAPIER.RigidBodyDesc ' +
      '(expected kinematicPositionBased() or the deprecated newKinematicPositionBased()). ' +
      'Check the installed @dimforge/rapier3d-compat version.',
  );
}
