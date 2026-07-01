import type { BossGateContext } from '../domain/BossRegistry';

// Value object owning the alternate-world / score-baseline state machine that
// used to live inline in CollisionEventProcessor. Pure state only: transitions
// mutate the four fields and never reach out to bosses/portal/collision side
// effects — the CEP owns that orchestration and drives this object.
export class AlternateWorldState {
  private active = false;
  private normalWorldScoreBaseline = 0;
  private alternateWorldScoreBaseline = 0;
  private lastTotalScore = 0;

  isActive(): boolean {
    return this.active;
  }

  getNormalWorldScoreBaseline(): number {
    return this.normalWorldScoreBaseline;
  }

  getAlternateWorldScoreBaseline(): number {
    return this.alternateWorldScoreBaseline;
  }

  getLastTotalScore(): number {
    return this.lastTotalScore;
  }

  setLastTotalScore(score: number): void {
    this.lastTotalScore = score;
  }

  gateContext(): BossGateContext {
    return {
      totalScore: this.lastTotalScore,
      alternateWorldActive: this.active,
      normalWorldScoreBaseline: this.normalWorldScoreBaseline,
      alternateWorldScoreBaseline: this.alternateWorldScoreBaseline,
    };
  }

  enter(score: number): void {
    this.active = true;
    this.alternateWorldScoreBaseline = score;
  }

  resetSession(): void {
    this.active = false;
    this.alternateWorldScoreBaseline = 0;
  }

  resetScoreBaselines(): void {
    this.normalWorldScoreBaseline = 0;
    this.alternateWorldScoreBaseline = 0;
  }

  completeCycle(score: number): void {
    this.active = false;
    this.alternateWorldScoreBaseline = 0;
    this.normalWorldScoreBaseline = score;
  }
}
