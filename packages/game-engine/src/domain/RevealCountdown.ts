/**
 * Compte à rebours piloté par dt (frames de jeu), pas par horloge murale :
 * un setTimeout/performance.now continuerait de courir pendant les gels
 * physique (cinématiques, time-scale), alors que le délai doit suivre le jeu.
 */
export class RevealCountdown {
  private remainingS = 0;

  /** Idempotent : un countdown déjà en cours n'est pas réécrasé. */
  start(delayS: number): void {
    if (this.remainingS > 0) return;
    this.remainingS = delayS;
  }

  cancel(): void {
    this.remainingS = 0;
  }

  isRunning(): boolean {
    return this.remainingS > 0;
  }

  /** Retourne true uniquement au frame où le délai expire. */
  tick(dt: number): boolean {
    if (this.remainingS <= 0) return false;
    this.remainingS -= dt;
    if (this.remainingS > 0) return false;
    this.remainingS = 0;
    return true;
  }
}
