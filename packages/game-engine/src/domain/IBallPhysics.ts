import type Rapier from '@dimforge/rapier3d-compat';

export interface IMapBallPhysics  { 

    readonly body: Rapier.RigidBody;
    holdAtAlternateWorldSpawn():void;
    holdAtNormalReturnSpawn():void;
    spawnFromAlternateWorld():void;
    spawnFromNormalReturn():void;
    applyEjectionForce(bumperPos: { x: number; z: number }):void;
    syncToMesh(mesh: {
        position: { set(x: number, y: number, z: number): void };
        quaternion: { set(x: number, y: number, z: number, w: number): void };
    }):void;
}