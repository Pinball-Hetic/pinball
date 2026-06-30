/**
 * Pure phase state-machine for "shape A" boss reveals (walk → settle → fight →
 * victory). Owns {phase, elapsed} and the sequencing/timer logic, with NO Three
 * dependency. Map-specific scalars (fight flicker shade/flashMix, victory
 * duration, target hit count) are passed in via config so the same machine
 * drives Vecna (Stranger Things) and Dark Link (Zelda).
 *
 * Walk/settle exit is gated by the renderer's visual (path completion / settle
 * completion booleans) because that timing lives in Three-side animation; the
 * machine consumes those booleans but owns the phase transitions.
 *
 * The descriptor returned by tick() is a faithful, verbatim translation of what
 * the original *Reveal.update(dt) computed each frame.
 */

export type WalkFightPhase = 'idle' | 'walk' | 'settle' | 'fight' | 'victory';

export type WalkFightConfig = {
  /** Victory phase duration in seconds (Vecna/DarkLink: 0.65). */
  victoryDuration: number;
  /** Constant shade passed to applyFightFlicker during the fight phase. */
  fightFlickerShade: number;
  /** Constant flashMix passed to applyFightFlicker during the fight phase. */
  fightFlickerFlashMix: number;
  /** Hit count required to win (from the boss definition). */
  targetHits: number;
};

/** Per-frame inputs sampled from the renderer's visual (Three-side timing). */
export type WalkFightTickInput = {
  /** vecnaVisual.isWalkPathComplete() — gates walk → settle. */
  walkPathComplete: boolean;
  /** result of vecnaVisual.updateSettle(dt) — gates settle → fight. */
  settleComplete: boolean;
};

/** What the strobe should do this frame. The renderer translates this. */
export type WalkFightStrobeOp =
  | { kind: 'stop' }
  | { kind: 'fightFlicker'; shade: number; flashMix: number }
  | { kind: 'apply'; on: boolean; fullMap: boolean; mix: number };

export type WalkFightDescriptor = {
  phase: WalkFightPhase;
  /** Whether the machine just transitioned into walk this tick. */
  enteredWalk: boolean;
  /** Whether the machine just transitioned into settle this tick. */
  enteredSettle: boolean;
  /** Whether the machine just transitioned into fight this tick. */
  enteredFight: boolean;
  /** Whether the victory phase just finished this tick (→ hide boss). */
  finishedVictory: boolean;
  /** The strobe operation to apply this frame. */
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

  /** Gameplay is frozen during the cinematic walk/settle phases. */
  isGameplayFrozen(): boolean {
    return this.phase === 'walk' || this.phase === 'settle';
  }

  /** BOSS_REVEAL received: enter walk (only from idle). */
  onReveal(): boolean {
    if (this.phase !== 'idle') return false;
    this.phase = 'walk';
    this.elapsed = 0;
    return true;
  }

  /**
   * BOSS_TARGET_HIT received while fighting. Returns true if this hit reaches
   * the victory threshold (renderer then plays victory). Returns false if the
   * hit lands outside the fight phase or below the threshold.
   */
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

  /** endFight()/reset: back to idle. */
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

    // victory
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
