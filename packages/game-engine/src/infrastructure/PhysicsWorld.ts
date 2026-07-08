import * as RAPIER from "@dimforge/rapier3d-compat";
import type { IPhysicsWorld } from '../domain/IPhysicsWorld';

export interface PhysicsUpdateHooks {
  /**
   * Kinematic body targets (flippers) must be set here, before world.step():
   * Rapier infers a kinematic body's velocity from the target/pose gap at step
   * time. Setting the target at RENDER rate made the flipper sweep a double arc
   * per step at 120 Hz (tunneling — Rapier does not CCD kinematic motion) and a
   * zero arc every other step at 60 Hz. One target per step = constant arc.
   */
  onBeforeStep?: () => void;
  /**
   * Called after EACH world.step(). Rapier does not keep events across steps,
   * so draining once per frame would lose collisions from intermediate steps.
   */
  onStep?: () => void;
  onAfterSteps?: () => void;
}


export class PhysicsWorld implements IPhysicsWorld {
  public readonly world: RAPIER.World;
  public readonly eventQueue: RAPIER.EventQueue;

  /**
   * Fixed timestep decoupled from the screen refresh rate.
   *
   * STEP_INTERVAL: real-time interval between two world.step() calls.
   *   = 1/60 s → physics advances at 60 steps per REAL second regardless of
   *   refresh rate (60/120/144 Hz). This is what makes ball speed identical
   *   for all players.
   *
   * SIM_TIMESTEP (world.timestep): simulated time advanced per step.
   *   = 1/98 s → 60 steps/s × 1/98 s ≈ 0.61 s of physics per real second,
   *   i.e. +22% vs the original 0.5 s (1/120 s stepped once per frame at
   *   60 Hz). Tuned because ball speed felt too slow.
   *
   * Do NOT equalize STEP_INTERVAL and SIM_TIMESTEP: 1/60 = 1/60 would run
   * physics in real time and change the feel (faster ball).
   *
   * MAX_STEPS_PER_FRAME: bounds catch-up when a frame is slow. Below 60 FPS
   *   we run several steps per frame to stay real-time — same ball speed —
   *   down to 60/5 = 12 FPS. Below that we cap (anti spiral-of-death) and
   *   physics slows down instead of spiraling. With dt capped at 0.05 in the
   *   render loop, a normal frame never needs more than 3 steps.
   */
  public static readonly STEP_INTERVAL = 1 / 60;
  private static readonly SIM_TIMESTEP  = 1 / 98;
  private static readonly MAX_STEPS_PER_FRAME = 5;
  private accumulator = 0;
  private timeScale = 1;
  private crashed = false;

  setTimeScale(scale: number): void {
    this.timeScale = scale;
  }

  private constructor(world: RAPIER.World) {
    this.world = world;
    this.eventQueue = new RAPIER.EventQueue(true);
  }

  static async create(): Promise<PhysicsWorld> {
    await RAPIER.init();
    // Straight down — playfield tilt is baked into the GLB trimesh geometry.
    // Real 9.81: downslope acceleration ≈ 1.1 m/s² (sliding) / 0.79 (rolling).
    // Do not boost — a ball that "falls" instead of rolling kills the feel.
    const gravity = { x: 0, y: -9.81, z: 0 };
    const world = new RAPIER.World(gravity);
    world.timestep = PhysicsWorld.SIM_TIMESTEP;
    return new PhysicsWorld(world);
  }

  // Caps the backlog before draining to protect against the spiral-of-death.
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

  get isAlive(): boolean {
    return !this.crashed;
  }

  get interpolationAlpha(): number {
    return PhysicsWorld.interpolationAlphaFor(this.accumulator);
  }

  static interpolationAlphaFor(accumulator: number): number {
    const a = accumulator / PhysicsWorld.STEP_INTERVAL;
    return a < 0 ? 0 : a > 1 ? 1 : a;
  }

  update(dt: number, hooks?: PhysicsUpdateHooks): void {
    this.accumulator += dt * this.timeScale;
    const { steps, remainder } = PhysicsWorld.planSteps(this.accumulator);
    this.accumulator = remainder;
    for (let i = 0; i < steps; i += 1) {
      hooks?.onBeforeStep?.();
      try {
        this.world.step(this.eventQueue);
      } catch (e) {
        // Mark the world dead on a Rapier WASM panic so later calls do not
        // cascade into errors; the page must be reloaded to recover.
        this.crashed = true;
        console.error('[Rapier] world.step() panic — physics halted:', e);
        return;
      }
      hooks?.onStep?.();
    }
    hooks?.onAfterSteps?.();
  }
}
