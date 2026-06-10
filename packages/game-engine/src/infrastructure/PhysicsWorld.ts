import RAPIER from "@dimforge/rapier3d-compat";

export class PhysicsWorld {
  public readonly world: RAPIER.World;
  public readonly eventQueue: RAPIER.EventQueue;

  /**
   * Deux constantes distinctes, intentionnellement différentes :
   *
   * STEP_INTERVAL : intervalle réel entre deux appels à world.step().
   *   = 1/60 s → on appelle step() exactement 60 fois par seconde réelle,
   *   peu importe le refresh rate de l'écran (60/120/144 Hz).
   *
   * world.timestep : durée de simulation avancée à chaque step().
   *   = 1/100 s → 60 steps/s × 1/100 s = 0.6 s de physique par seconde réelle
   *   (+20% vs le 0.5 s d'origine à 1/120). Ajusté au 2025-06-11 : vitesse
   *   de balle jugée trop lente, +20% demandé explicitement.
   *
   * NE PAS égaliser ces deux valeurs : STEP_INTERVAL = world.timestep = 1/60
   * ferait tourner la physique en temps réel → balle deux fois trop rapide.
   */
  private static readonly STEP_INTERVAL = 1 / 60;   // fréquence d'appel réelle
  private static readonly SIM_TIMESTEP  = 1 / 118;  // durée simulée par step (−15% vs 1/100)
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
    world.timestep = PhysicsWorld.SIM_TIMESTEP;
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
    if (this.accumulator > 2 * PhysicsWorld.STEP_INTERVAL) {
      this.accumulator = PhysicsWorld.STEP_INTERVAL;
    }
    if (this.accumulator >= PhysicsWorld.STEP_INTERVAL) {
      this.world.step(this.eventQueue);
      this.accumulator -= PhysicsWorld.STEP_INTERVAL;
    }
  }
}
