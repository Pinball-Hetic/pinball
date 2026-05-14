import RAPIER from "@dimforge/rapier3d-compat";

export class PhysicsWorld {
  public readonly world: RAPIER.World;
  public readonly eventQueue: RAPIER.EventQueue;

  private constructor(world: RAPIER.World) {
    this.world = world;
    this.eventQueue = new RAPIER.EventQueue(true);
  }

  static async create(): Promise<PhysicsWorld> {
    await RAPIER.init();
    // Straight down — playfield tilt is baked into the GLB trimesh geometry
    const gravity = { x: 0, y: -9.81, z: 0 };
    const world = new RAPIER.World(gravity);
    world.timestep = 1 / 120;
    return new PhysicsWorld(world);
  }

  update(time: number): void {
    void time;
    this.world.step(this.eventQueue);
  }
}
