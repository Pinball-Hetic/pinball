import * as CANNON from 'cannon-es';

/**
 * Monde physique Cannon.js avec matériaux préconfigurés pour le flipper.
 * Gère le fixed time step pour éviter le tunneling à haut framerate.
 */
export class PhysicsWorld {
  public readonly world: CANNON.World;

  // Matériaux de surface (partagés pour créer les ContactMaterials)
  public readonly ballMaterial: CANNON.Material;
  public readonly tableMaterial: CANNON.Material;
  public readonly bumperMaterial: CANNON.Material;
  public readonly flipperMaterial: CANNON.Material;

  private readonly fixedTimeStep: number = 1 / 60;
  private readonly maxSubSteps: number = 3;

  constructor(gravityX = 0, gravityY = -9.75, gravityZ = 1.5) {
    this.world = new CANNON.World({
      gravity: new CANNON.Vec3(gravityX, gravityY, gravityZ),
    });

    // SAP broadphase : plus efficace quand les corps sont espacés (typique flipper)
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.world.allowSleep = true;

    // ── Matériaux ─────────────────────────────────────────────────────────
    this.ballMaterial    = new CANNON.Material('ball');
    this.tableMaterial   = new CANNON.Material('table');
    this.bumperMaterial  = new CANNON.Material('bumper');
    this.flipperMaterial = new CANNON.Material('flipper');

    // Bille / table : friction légère, rebond modéré
    this.world.addContactMaterial(
      new CANNON.ContactMaterial(this.ballMaterial, this.tableMaterial, {
        friction: 0.2,
        restitution: 0.4,
      }),
    );

    // Bille / bumper : sans friction, rebond fort (pop bumper)
    this.world.addContactMaterial(
      new CANNON.ContactMaterial(this.ballMaterial, this.bumperMaterial, {
        friction: 0.0,
        restitution: 0.85,
      }),
    );

    // Bille / flipper : rebond moyen, friction faible
    this.world.addContactMaterial(
      new CANNON.ContactMaterial(this.ballMaterial, this.flipperMaterial, {
        friction: 0.1,
        restitution: 0.55,
      }),
    );
  }

  /**
   * Avance la simulation d'un pas physique fixe.
   * Doit être appelé dans la boucle de rendu avec le timestamp requestAnimationFrame.
   *
   * @param dt - delta en secondes depuis le dernier appel (clampé à 50 ms pour éviter les sauts)
   */
  public step(dt: number): void {
    const clamped = Math.min(dt, 0.05);
    this.world.step(this.fixedTimeStep, clamped, this.maxSubSteps);
  }
}
