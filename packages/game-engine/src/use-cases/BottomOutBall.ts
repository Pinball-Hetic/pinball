import type { IBallPhysics } from './LaunchBall';
import type { GameEventListener } from '../domain/GameEvents';

export class BottomOutBall {
  private latched = false;

  constructor(
    private readonly ballPhysics: IBallPhysics,
    private readonly emit: GameEventListener,
  ) {}

  /**
   * Réarme le use-case pour le prochain épisode de jeu.
   *
   * CONTRAT : le latch est posé par `execute()` (anti-rebond du capteur/zone
   * géométrique) et DOIT être levé quand une nouvelle bille entre en jeu,
   * sinon le bottom-out reste mort pour toute la session. Deux appelants
   * couvrent ce contrat :
   *  - le chemin `BALL_LAUNCHED` (relance normale),
   *  - `noteRespawn()`, appelé sur tout respawn physique de la bille, y
   *    compris les chemins de reset de partie qui ne passent pas par un
   *    lancement — garantit qu'aucun chemin ne peut laisser le latch bloqué.
   */
  resetLatch(): void {
    this.latched = false;
  }

  /**
   * À appeler chaque fois qu'une nouvelle bille est (re)placée au spawn, quel
   * que soit le chemin (lancement OU reset de partie). Auto-réarme le latch :
   * filet de sécurité pour que le bottom-out ne meure jamais faute d'un
   * `resetLatch()` explicite sur un chemin de reset oublié.
   */
  noteRespawn(): void {
    this.latched = false;
  }

  execute(): void {
    if (this.latched) return;
    this.latched = true;
    this.emit({ type: 'BOTTOM_OUT' });
    this.ballPhysics.resetToSpawn();
  }
}
