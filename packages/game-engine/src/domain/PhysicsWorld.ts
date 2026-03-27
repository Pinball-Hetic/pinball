import * as CANNON from 'cannon-es';

export class PhysicsWorld {
  public world: CANNON.World;
  private lastTime: number = 0;
  private readonly fixedTimeStep: number = 1 / 60;
  private readonly maxSubSteps: number = 3;

  constructor() {
    this.world = new CANNON.World();
    this.world.gravity.set(0, -9.82, 0); // Gravité standard
  }

  /**
   * Met à jour la physique avec un fixed time step pour éviter le tunneling
   * Recommandation Context7: Séparer la boucle de rendu de la boucle physique.
   */
  public update(time: number) {
    if (this.lastTime !== 0) {
      const deltaTime = (time - this.lastTime) / 1000;
      this.world.step(this.fixedTimeStep, deltaTime, this.maxSubSteps);
    }
    this.lastTime = time;
  }
}
