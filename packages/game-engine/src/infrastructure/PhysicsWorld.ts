import RAPIER from "@dimforge/rapier3d-compat";

export class PhysicsWorld {
  public readonly world: RAPIER.World;
  public readonly eventQueue: RAPIER.EventQueue;

  /**
   * Taux de simulation cible : 60 Hz.
   * Le render loop tourne au refresh rate natif de l'écran (60/120/144 Hz),
   * mais world.step() est appelé exactement 60 fois par seconde réelle
   * grâce à l'accumulateur ci-dessous. Cela garantit un gameplay identique
   * sur tous les appareils, calé sur le feel validé à 60 FPS.
   */
  private static readonly PHYSICS_HZ = 60;
  private static readonly PHYSICS_DT = 1 / PhysicsWorld.PHYSICS_HZ;
  private accumulator = 0;

  private constructor(world: RAPIER.World) {
    this.world = world;
    this.eventQueue = new RAPIER.EventQueue(true);
  }

  static async create(): Promise<PhysicsWorld> {
    await RAPIER.init();
    // Straight down — playfield tilt is baked into the GLB trimesh geometry
    // 9.81 réel : descente downslope ≈ 1.1 m/s² (glisse) / 0.79 (roulis).
    // Ne pas booster — une bille qui "tombe" au lieu de rouler tue le feel.
    const gravity = { x: 0, y: -9.81, z: 0 };
    const world = new RAPIER.World(gravity);
    world.timestep = PhysicsWorld.PHYSICS_DT;
    return new PhysicsWorld(world);
  }

  /**
   * @param dt Temps écoulé depuis la dernière frame en secondes (cappé à 0.05
   *           dans le render loop — protège contre les freezes d'onglet).
   */
  update(dt: number): void {
    this.accumulator += dt;
    // Anti spiral-of-death : si l'onglet est en arrière-plan ou que dt explose,
    // on plafonne à un seul step en retard pour éviter une avalanche de steps.
    if (this.accumulator > 2 * PhysicsWorld.PHYSICS_DT) {
      this.accumulator = PhysicsWorld.PHYSICS_DT;
    }
    if (this.accumulator >= PhysicsWorld.PHYSICS_DT) {
      this.world.step(this.eventQueue);
      this.accumulator -= PhysicsWorld.PHYSICS_DT;
    }
  }
}
