import RAPIER from "@dimforge/rapier3d-compat";

export class PhysicsWorld {
  public readonly world: RAPIER.World;
  public readonly eventQueue: RAPIER.EventQueue;

  /**
   * Pas de temps fixe découplé du refresh rate de l'écran.
   *
   * STEP_INTERVAL : intervalle réel entre deux appels à world.step().
   *   = 1/60 s → la physique avance à 60 steps par seconde RÉELLE, peu importe
   *   le refresh rate (60/120/144 Hz). C'est ce qui rend la vitesse identique
   *   pour tous les joueurs.
   *
   * SIM_TIMESTEP (world.timestep) : durée de simulation avancée à chaque step.
   *   = 1/98 s → 60 steps/s × 1/98 s ≈ 0.61 s de physique par seconde réelle,
   *   soit +22% vs le 0.5 s d'origine (1/120 s steppé une fois par frame à
   *   60 Hz). Ajusté au 2025-06-11 : vitesse de balle jugée trop lente.
   *
   * NE PAS égaliser STEP_INTERVAL et SIM_TIMESTEP : 1/60 = 1/60 ferait tourner
   * la physique en temps réel et changerait le feel (balle plus rapide).
   *
   * MAX_STEPS_PER_FRAME : borne le rattrapage (catch-up) quand une frame est
   *   lente. Sous 60 FPS on exécute plusieurs steps par frame pour rester en
   *   temps réel — donc même vitesse — jusqu'à 60/5 = 12 FPS. En-dessous, on
   *   plafonne (anti spiral-of-death) et la physique ralentit plutôt que de
   *   spiraler. Avec dt cappé à 0.05 dans le render loop, une frame normale ne
   *   demande jamais plus de 3 steps.
   */
  private static readonly STEP_INTERVAL = 1 / 60;
  private static readonly SIM_TIMESTEP  = 1 / 98;
  private static readonly MAX_STEPS_PER_FRAME = 5;
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
   * Logique pure de planification des steps (testable sans WASM).
   * Borne le backlog à MAX_STEPS_PER_FRAME × STEP_INTERVAL avant de drainer,
   * ce qui protège du spiral-of-death tout en autorisant le rattrapage.
   */
  static planSteps(accumulator: number): { steps: number; remainder: number } {
    const maxBacklog = PhysicsWorld.MAX_STEPS_PER_FRAME * PhysicsWorld.STEP_INTERVAL;
    let acc = Math.min(accumulator, maxBacklog);
    let steps = 0;
    while (acc >= PhysicsWorld.STEP_INTERVAL && steps < PhysicsWorld.MAX_STEPS_PER_FRAME) {
      acc -= PhysicsWorld.STEP_INTERVAL;
      steps += 1;
    }
    return { steps, remainder: acc };
  }

  /**
   * @param dt Temps écoulé depuis la dernière frame en secondes (cappé à 0.05
   *           dans le render loop — protège contre les freezes d'onglet).
   * @param onStep Appelé après CHAQUE world.step() — sert à drainer les events
   *           de collision par step. Indispensable avec le multi-step : Rapier
   *           ne conserve pas les events d'un step à l'autre, drainer une seule
   *           fois par frame perdrait les collisions des steps intermédiaires.
   */
  update(dt: number, onStep?: () => void): void {
    this.accumulator += dt;
    const { steps, remainder } = PhysicsWorld.planSteps(this.accumulator);
    this.accumulator = remainder;
    for (let i = 0; i < steps; i += 1) {
      this.world.step(this.eventQueue);
      onStep?.();
    }
  }
}
