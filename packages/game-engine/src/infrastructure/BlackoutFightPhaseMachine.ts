import { easeIn, easeOut, strobeOn } from './CinematicEasing';

/**
 * Pure phase state-machine for "shape B" boss reveals (blackout → reveal →
 * flicker → victory → restore). Owns {phase, elapsed, strobeT, pulseT} and the
 * eleven-assist sub-timer, with NO Three dependency. The fully time-driven
 * sequencing + the regression-prone scalar maths (strobe gating, blackout/reveal
 * eases, flicker shade breathe/blink, victory/restore mixes, assist envelope)
 * live here so the same machine drives Demogorgon (Stranger Things) and
 * Ganondorf (Zelda).
 *
 * Map-specific differences (shade vs flash-only, billboard, eleven assist) are
 * NOT decided here — the renderer reads the descriptor scalars/flags and chooses
 * which Three calls to make.
 */

export type BlackoutFightPhase =
  | 'idle'
  | 'blackout'
  | 'reveal'
  | 'flicker'
  | 'victory'
  | 'restore';

export type BlackoutFightConfig = {
  blackout: number;
  reveal: number;
  restore: number;
  victory: number;
  strobeHzIntro: number;
  fightFlickerHz: number;
  /** Hit count required to win (from the boss definition). */
  targetHits: number;
};

/**
 * Optional eleven-assist (Stranger Things only). Pass null to disable the whole
 * assist sub-machine (Ganondorf).
 */
export type ElevenAssistConfig = {
  /** Seconds before the first assist fires (ELEVEN_ASSIST_FIRST). */
  first: number;
  /** Seconds between subsequent assists (ASSIST_INTERVAL). */
  interval: number;
  /** Assist animation duration (ELEVEN_ASSIST_ANIM). */
  anim: number;
  /** Score increment emitted on each assist (ASSIST_SCORE). */
  scoreIncrement: number;
};

/** Per-frame envelope of the eleven-assist animation. */
export type ElevenAssistFrame = {
  active: boolean;
  /** Normalised progress t in [0,1]. */
  t: number;
  /** Raw assist clock (seconds) — drives the targetGroup.rotation.z wobble. */
  elapsed: number;
  rise: number;
  fade: number;
  alpha: number;
  burst: number;
};

export type BlackoutFightDescriptor = {
  phase: BlackoutFightPhase;
  /** strobeOn(strobeT, strobeHzIntro) — used by blackout/reveal. */
  on: boolean;
  /** darkMix: 1 except during restore where it eases down to 0. */
  darkMix: number;
  /** blackout phase: darkMix * easeOut(min(1, elapsed/blackout)). */
  blackoutMix: number;
  /** reveal phase: clamped progress t = min(1, elapsed/reveal). */
  revealT: number;
  /** flicker phase: clamped shade scalar. */
  flickerShade: number;
  /** flicker phase: blink = strobeOn(strobeT, fightFlickerHz). */
  flickerBlink: boolean;
  /** victory phase: clamped progress t = min(1, elapsed/victory). */
  victoryT: number;
  /** restore phase: FIGHT_SHADE-scaled hold shade (caller multiplies its own shade). */
  restoreDarkMix: number;
  /** transition flags (fired once on the frame they occur) */
  enteredReveal: boolean;
  enteredFlicker: boolean;
  finishedVictory: boolean;
  finishedRestore: boolean;
  /** eleven assist: an assist fired this frame (renderer emits ASSIST + shows fx). */
  assistFired: boolean;
  /** eleven assist: per-frame animation envelope (null when inactive/disabled). */
  assist: ElevenAssistFrame | null;
  /** eleven assist: the assist animation just finished this frame (renderer hides fx). */
  assistFinished: boolean;
};

// Flicker shade constants (Demogorgon formula). Ganondorf gets a flat shade
// of 0 by zeroing the terms via config — same formula, different inputs.
export type FlickerShadeConfig = {
  base: number;
  breatheAmp: number;
  breatheSpeed: number;
  dip: number;
  lift: number;
  clampMin: number;
  clampMax: number;
};

export class BlackoutFightPhaseMachine {
  private phase: BlackoutFightPhase = 'idle';
  private elapsed = 0;
  private strobeT = 0;
  private pulseT = 0;

  private assistNextIn: number;
  private elevenAssistActive = false;
  private elevenAssistT = 0;

  constructor(
    private readonly config: BlackoutFightConfig,
    private readonly flicker: FlickerShadeConfig,
    private readonly assistCfg: ElevenAssistConfig | null = null,
  ) {
    this.assistNextIn = assistCfg ? assistCfg.first : 0;
  }

  getPhase(): BlackoutFightPhase {
    return this.phase;
  }

  getElapsed(): number {
    return this.elapsed;
  }

  isVictory(): boolean {
    return this.phase === 'victory';
  }

  /** BOSS_REVEAL: enter blackout from idle. Returns true if it transitioned. */
  onReveal(): boolean {
    if (this.phase !== 'idle') return false;
    this.phase = 'blackout';
    this.elapsed = 0;
    this.strobeT = 0;
    this.pulseT = 0;
    this.assistNextIn = this.assistCfg ? this.assistCfg.first : 0;
    this.elevenAssistActive = false;
    this.elevenAssistT = 0;
    return true;
  }

  /**
   * BOSS_TARGET_HIT: accepted unless idle/restore/victory. Returns victory=true
   * when the threshold is reached (renderer begins victory).
   */
  onHit(hitCount: number): { accepted: boolean; victory: boolean } {
    if (this.phase === 'idle' || this.phase === 'restore' || this.phase === 'victory') {
      return { accepted: false, victory: false };
    }
    if (hitCount >= this.config.targetHits) {
      this.beginVictory();
      return { accepted: true, victory: true };
    }
    return { accepted: true, victory: false };
  }

  private beginVictory(): void {
    // hideElevenAssist resets the assist sub-state (renderer hides the meshes).
    this.elevenAssistActive = false;
    this.phase = 'victory';
    this.elapsed = 0;
  }

  /** endFight()/reset → idle, clears all clocks + assist state. */
  reset(): void {
    this.phase = 'idle';
    this.elapsed = 0;
    this.strobeT = 0;
    this.pulseT = 0;
    this.assistNextIn = this.assistCfg ? this.assistCfg.first : 0;
    this.elevenAssistActive = false;
    this.elevenAssistT = 0;
  }

  private computeFlickerShade(): number {
    const breathe = Math.sin(this.pulseT * this.flicker.breatheSpeed) * this.flicker.breatheAmp;
    const blink = strobeOn(this.strobeT, this.config.fightFlickerHz);
    const raw = this.flicker.base + breathe + (blink ? -this.flicker.lift : this.flicker.dip);
    return clamp(raw, this.flicker.clampMin, this.flicker.clampMax);
  }

  /**
   * @param opts.suspendAssist true while the game is not in play (ball
   * drained, game not relaunched). The assist sub-timer is then FROZEN (dt
   * does not flow): merely "not emitting" would let the counter keep running
   * down and the assist would fire the instant play resumes (catch-up).
   * The rest of the fight (strobe, flicker, phases) keeps running normally.
   */
  tick(dt: number, opts?: { suspendAssist?: boolean }): BlackoutFightDescriptor {
    // pulseT advances every frame — even in idle.
    this.pulseT += dt;

    const idleDesc = this.makeIdleDescriptor();
    if (this.phase === 'idle') return idleDesc;

    this.elapsed += dt;
    this.strobeT += dt;

    const on = strobeOn(this.strobeT, this.config.strobeHzIntro);
    const darkMix =
      this.phase === 'restore'
        ? 1 - easeIn(Math.min(1, this.elapsed / this.config.restore))
        : 1;

    const base: BlackoutFightDescriptor = {
      phase: this.phase,
      on,
      darkMix,
      blackoutMix: 0,
      revealT: 0,
      flickerShade: 0,
      flickerBlink: false,
      victoryT: 0,
      restoreDarkMix: darkMix,
      enteredReveal: false,
      enteredFlicker: false,
      finishedVictory: false,
      finishedRestore: false,
      assistFired: false,
      assist: null,
      assistFinished: false,
    };

    if (this.phase === 'blackout') {
      const blackoutMix = darkMix * easeOut(Math.min(1, this.elapsed / this.config.blackout));
      if (this.elapsed >= this.config.blackout) {
        this.phase = 'reveal';
        this.elapsed = 0;
        return { ...base, phase: 'blackout', blackoutMix, enteredReveal: true };
      }
      return { ...base, phase: 'blackout', blackoutMix };
    }

    if (this.phase === 'reveal') {
      const revealT = Math.min(1, this.elapsed / this.config.reveal);
      if (this.elapsed >= this.config.reveal) {
        this.phase = 'flicker';
        this.elapsed = 0;
        this.assistNextIn = this.assistCfg ? this.assistCfg.first : 0;
        return { ...base, phase: 'reveal', revealT, enteredFlicker: true };
      }
      return { ...base, phase: 'reveal', revealT };
    }

    if (this.phase === 'flicker') {
      const flickerShade = this.computeFlickerShade();
      const flickerBlink = strobeOn(this.strobeT, this.config.fightFlickerHz);
      // Outside playing: assist suspended (counter AND anim envelope frozen),
      // otherwise the assist scores +100 in a loop while the ball sits at spawn.
      const suspendAssist = opts?.suspendAssist === true;
      const assistDt = suspendAssist ? 0 : dt;
      let assistFired = false;
      if (this.assistCfg && !suspendAssist && !this.elevenAssistActive) {
        this.assistNextIn -= dt;
        if (this.assistNextIn <= 0) {
          assistFired = this.triggerElevenAssist();
        }
      }
      const { frame, finished } = this.updateElevenAssist(assistDt);
      return {
        ...base,
        phase: 'flicker',
        flickerShade,
        flickerBlink,
        assistFired,
        assist: frame,
        assistFinished: finished,
      };
    }

    if (this.phase === 'victory') {
      const victoryT = Math.min(1, this.elapsed / this.config.victory);
      const finishedVictory = victoryT >= 1;
      if (finishedVictory) {
        this.phase = 'restore';
        this.elapsed = 0;
      }
      return { ...base, phase: 'victory', victoryT, finishedVictory };
    }

    // restore
    const finishedRestore = darkMix <= 0;
    if (finishedRestore) {
      // resetAtmosphere() in the renderer drives reset(); we report it here.
      return { ...base, phase: 'restore', finishedRestore: true };
    }
    return { ...base, phase: 'restore' };
  }

  private makeIdleDescriptor(): BlackoutFightDescriptor {
    return {
      phase: 'idle',
      on: false,
      darkMix: 1,
      blackoutMix: 0,
      revealT: 0,
      flickerShade: 0,
      flickerBlink: false,
      victoryT: 0,
      restoreDarkMix: 1,
      enteredReveal: false,
      enteredFlicker: false,
      finishedVictory: false,
      finishedRestore: false,
      assistFired: false,
      assist: null,
      assistFinished: false,
    };
  }

  private triggerElevenAssist(): boolean {
    if (!this.assistCfg) return false;
    this.elevenAssistActive = true;
    this.elevenAssistT = 0;
    this.assistNextIn = this.assistCfg.interval;
    return true;
  }

  private updateElevenAssist(dt: number): { frame: ElevenAssistFrame | null; finished: boolean } {
    if (!this.assistCfg || !this.elevenAssistActive) {
      return { frame: null, finished: false };
    }
    this.elevenAssistT += dt;
    const t = Math.min(1, this.elevenAssistT / this.assistCfg.anim);
    const rise = easeOut(t);
    const fade = easeIn(t);
    const alpha = t < 0.18 ? rise / 0.18 : 1 - fade;
    const burst = 1 - fade * 0.85;
    const frame: ElevenAssistFrame = {
      active: true,
      t,
      elapsed: this.elevenAssistT,
      rise,
      fade,
      alpha,
      burst,
    };
    let finished = false;
    if (t >= 1) {
      this.elevenAssistActive = false;
      finished = true;
    }
    return { frame, finished };
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
