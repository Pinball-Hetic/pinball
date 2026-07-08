import { easeIn, easeOut, strobeOn } from './CinematicEasing';

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
  targetHits: number;
};

export type ElevenAssistConfig = {
  first: number;
  interval: number;
  anim: number;
  scoreIncrement: number;
};

export type ElevenAssistFrame = {
  active: boolean;
  t: number;
  elapsed: number;
  rise: number;
  fade: number;
  alpha: number;
  burst: number;
};

export type BlackoutFightDescriptor = {
  phase: BlackoutFightPhase;
  on: boolean;
  darkMix: number;
  blackoutMix: number;
  revealT: number;
  flickerShade: number;
  flickerBlink: boolean;
  victoryT: number;
  restoreDarkMix: number;
  enteredReveal: boolean;
  enteredFlicker: boolean;
  finishedVictory: boolean;
  finishedRestore: boolean;
  assistFired: boolean;
  assist: ElevenAssistFrame | null;
  assistFinished: boolean;
};

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
    this.elevenAssistActive = false;
    this.phase = 'victory';
    this.elapsed = 0;
  }

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

    const finishedRestore = darkMix <= 0;
    if (finishedRestore) {
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
