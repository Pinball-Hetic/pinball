import * as CANNON from 'cannon-es';

/**
 * Représente la bille physique du flipper.
 * Encapsule le corps Cannon.js — la partie visuelle (THREE.Mesh) reste dans le Playfield.
 */
export class Ball {
  public readonly radius: number;
  public readonly body: CANNON.Body;

  constructor(radius: number, material?: CANNON.Material) {
    this.radius = radius;

    const shape = new CANNON.Sphere(radius);
    this.body = new CANNON.Body({
      mass: 1,
      shape,
      material,
      linearDamping: 0.05,
      angularDamping: 0.4,
    });

    // Permet à la bille de dormir quand elle est immobile (performance)
    this.body.allowSleep = true;
    this.body.sleepSpeedLimit = 0.1;
    this.body.sleepTimeLimit = 1;
  }

  /** Positionne la bille et réinitialise sa vélocité. */
  reset(x: number, y: number, z: number): void {
    this.body.position.set(x, y, z);
    this.body.velocity.setZero();
    this.body.angularVelocity.setZero();
    this.body.wakeUp();
  }
}
