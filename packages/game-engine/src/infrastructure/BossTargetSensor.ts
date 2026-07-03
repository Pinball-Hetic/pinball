const DEFAULT_HIT_COOLDOWN_MS = 450;

export class BossTargetSensor {
  fightActive = false;
  targetArmed = false;
  private ballInside = false;
  private latchIgnore = false;
  private hits = 0;
  private lastHitMs = 0;

  setFightActive(active: boolean): void {
    this.fightActive = active;
    if (!active) {
      this.targetArmed = false;
      this.latchIgnore = false;
    }
  }

  setTargetArmed(armed: boolean): void {
    this.targetArmed = armed;
    if (armed && this.ballInside) {
      this.latchIgnore = true;
    }
  }

  beginFight(targetArmed: boolean): void {
    this.fightActive = true;
    this.targetArmed = targetArmed;
    this.latchIgnore = false;
    this.hits = 0;
    this.lastHitMs = 0;
  }

  reset(): void {
    this.fightActive = false;
    this.targetArmed = false;
    this.latchIgnore = false;
    this.ballInside = false;
    this.hits = 0;
    this.lastHitMs = 0;
  }

  handleCollision(
    started: boolean,
    gameState: string,
    options: {
      maxHits: number;
      onHit: (hitCount: number) => void;
      hitCooldownMs?: number;
    },
  ): void {
    // Sortie de balle : on nettoie l'état et on s'arrête.
    if (!started) {
      this.ballInside = false;
      this.latchIgnore = false;
      return;
    }

    // Entrée de balle : on valide les conditions, puis on délègue le comptage.
    this.ballInside = true;
    if (gameState !== 'playing' || !this.fightActive || !this.targetArmed) return;
    if (this.latchIgnore) return;

    this.registerHit(options);
  }

  private registerHit(options: {
    maxHits: number;
    onHit: (hitCount: number) => void;
    hitCooldownMs?: number;
  }): void {
    const cooldown = options.hitCooldownMs ?? DEFAULT_HIT_COOLDOWN_MS;
    const now = performance.now();
    if (now - this.lastHitMs < cooldown) return;

    this.lastHitMs = now;
    this.hits += 1;
    options.onHit(this.hits);

    if (this.hits >= options.maxHits) {
      this.fightActive = false;
      this.targetArmed = false;
    }
  }
}
