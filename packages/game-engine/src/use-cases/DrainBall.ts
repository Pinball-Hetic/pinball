import type { IBallPhysics } from './LaunchBall';
import type { GameEventListener } from '../domain/GameEvents';

export class DrainBall {
  private latched = false;

  constructor(
    private readonly ballPhysics: IBallPhysics,
    private readonly emit: GameEventListener,
  ) {}

  /**
   * Réarme le use-case. À appeler quand une nouvelle bille est mise en jeu
   * (chemin `BALL_LAUNCHED`), symétrique de `BottomOutBall.resetLatch`.
   */
  resetLatch(): void {
    this.latched = false;
  }

  /**
   * Émet DRAIN et remet la bille au spawn. Le délai visuel est géré par la
   * couche interface. Latch anti-rebond : le capteur de drain (Rapier) peut
   * déclencher `execute()` sur 2 frames consécutives avant que le reset au
   * spawn ne soit pris en compte → sans ce garde, double DRAIN / double perte
   * de vie. Le latch est levé par `resetLatch()` au (re)lancement de la bille.
   */
  execute(): void {
    if (this.latched) return;
    this.latched = true;
    this.emit({ type: 'DRAIN' });
    this.ballPhysics.resetToSpawn();
  }
}
