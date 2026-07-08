export type WalkFightPhase = 'idle' | 'walk' | 'settle' | 'fight' | 'victory';

export type WalkFightConfig = {
  victoryDuration: number;
  fightFlickerShade: number;
  fightFlickerFlashMix: number;
  targetHits: number;
};

export type WalkFightTickInput = {
  walkPathComplete: boolean;
  settleComplete: boolean;
};

export type WalkFightStrobeOp =
  | { kind: 'stop' }
  | { kind: 'fightFlicker'; shade: number; flashMix: number }
  | { kind: 'apply'; on: boolean; fullMap: boolean; mix: number };

export type WalkFightDescriptor = {
  phase: WalkFightPhase;
  enteredWalk: boolean;
  enteredSettle: boolean;
  enteredFight: boolean;
  finishedVictory: boolean;
  strobe: WalkFightStrobeOp;
};

export class WalkFightPhaseMachine {
  private phase: WalkFightPhase = 'idle';
  private elapsed = 0;

  constructor(private readonly config: WalkFightConfig) {}

  getPhase(): WalkFightPhase {
    return this.phase;
  }

  getElapsed(): number {
    return this.elapsed;
  }

  isGameplayFrozen(): boolean {
    return this.phase === 'walk' || this.phase === 'settle';
  }

  onReveal(): boolean {
    if (this.phase !== 'idle') return false;
    this.phase = 'walk';
    this.elapsed = 0;
    return true;
  }

  onHit(hitCount: number): { accepted: boolean; victory: boolean } {
    if (this.phase !== 'fight') return { accepted: false, victory: false };
    if (hitCount >= this.config.targetHits) {
      this.beginVictory();
      return { accepted: true, victory: true };
    }
    return { accepted: true, victory: false };
  }

  private beginVictory(): void {
    this.phase = 'victory';
    this.elapsed = 0;
  }

  reset(): void {
    this.phase = 'idle';
    this.elapsed = 0;
  }

  tick(dt: number, input: WalkFightTickInput): WalkFightDescriptor {
    const base: WalkFightDescriptor = {
      phase: this.phase,
      enteredWalk: false,
      enteredSettle: false,
      enteredFight: false,
      finishedVictory: false,
      strobe: { kind: 'stop' },
    };

    if (this.phase === 'idle') {
      return base;
    }

    this.elapsed += dt;

    if (this.phase === 'walk') {
      if (input.walkPathComplete) {
        this.phase = 'settle';
        this.elapsed = 0;
        return { ...base, phase: 'settle', enteredSettle: true, strobe: { kind: 'stop' } };
      }
      return { ...base, phase: 'walk', strobe: { kind: 'stop' } };
    }

    if (this.phase === 'settle') {
      if (input.settleComplete) {
        this.phase = 'fight';
        this.elapsed = 0;
        return { ...base, phase: 'fight', enteredFight: true, strobe: { kind: 'stop' } };
      }
      return { ...base, phase: 'settle', strobe: { kind: 'stop' } };
    }

    if (this.phase === 'fight') {
      return {
        ...base,
        phase: 'fight',
        strobe: {
          kind: 'fightFlicker',
          shade: this.config.fightFlickerShade,
          flashMix: this.config.fightFlickerFlashMix,
        },
      };
    }

    const mix = Math.max(0, 1 - this.elapsed / this.config.victoryDuration);
    const finished = this.elapsed >= this.config.victoryDuration;
    return {
      ...base,
      phase: 'victory',
      finishedVictory: finished,
      strobe: { kind: 'apply', on: false, fullMap: false, mix },
    };
  }
}
