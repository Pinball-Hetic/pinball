import type Rapier from '@dimforge/rapier3d-compat';

export interface IPhysicsWorld {
    readonly world: Rapier.World;
    setTimeScale(scale: number):void;
}

