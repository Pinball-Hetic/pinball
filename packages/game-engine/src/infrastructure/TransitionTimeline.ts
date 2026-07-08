import { easeIn, easeOut, strobeOn } from './CinematicEasing';

export type TransitionPhase = 'idle' | 'blackout' | 'reveal' | 'hold' | 'restore' | 'tremor';

export type TransitionTimelineConfig = {
  blackout: number;
  reveal: number;
  hold: number;
  restore: number;
  tremor: number;
  strobeHz: number;
  hasReveal: boolean;
};

export type TransitionDescriptor = {
  phase: TransitionPhase;
  on: boolean;
  blackoutMix: number;
  revealT: number;
  darkMix: number;
  active: boolean;
  enteredReveal: boolean;
  enteredHold: boolean;
  enteredRestore: boolean;
  enteredTremor: boolean;
  finished: boolean;
};

export class TransitionTimeline {
  private phase: TransitionPhase = 'idle';
  private elapsed = 0;
  private strobeT = 0;

  constructor(private readonly config: TransitionTimelineConfig) {}

  getPhase(): TransitionPhase {
    return this.phase;
  }

  getElapsed(): number {
    return this.elapsed;
  }

  begin(): boolean {
    if (this.phase !== 'idle') return false;
    this.phase = 'blackout';
    this.elapsed = 0;
    this.strobeT = 0;
    return true;
  }

  reset(): void {
    this.phase = 'idle';
    this.elapsed = 0;
    this.strobeT = 0;
  }

  tick(dt: number): TransitionDescriptor {
    const base = this.makeBaseDescriptor();
    if (this.phase === 'idle') return base;

    this.elapsed += dt;
    this.strobeT += dt;

    const on = strobeOn(this.strobeT, this.config.strobeHz);

    if (this.phase === 'blackout') {
      const blackoutMix = easeOut(Math.min(1, this.elapsed / this.config.blackout));
      if (this.elapsed >= this.config.blackout) {
        if (this.config.hasReveal) {
          this.phase = 'reveal';
          this.elapsed = 0;
          this.strobeT = 0;
          return { ...base, phase: 'blackout', on, blackoutMix, enteredReveal: true };
        }
        this.phase = 'restore';
        this.elapsed = 0;
        this.strobeT = 0;
        return { ...base, phase: 'blackout', on, blackoutMix, enteredRestore: true };
      }
      return { ...base, phase: 'blackout', on, blackoutMix };
    }

    if (this.phase === 'reveal') {
      const revealT = Math.min(1, this.elapsed / this.config.reveal);
      if (this.elapsed >= this.config.reveal) {
        this.phase = 'hold';
        this.elapsed = 0;
        return { ...base, phase: 'reveal', on, revealT, enteredHold: true };
      }
      return { ...base, phase: 'reveal', on, revealT };
    }

    if (this.phase === 'hold') {
      if (this.elapsed >= this.config.hold) {
        this.phase = 'restore';
        this.elapsed = 0;
        this.strobeT = 0;
      }
      return { ...base, phase: 'hold', on };
    }

    if (this.phase === 'restore') {
      const darkMix = 1 - easeIn(Math.min(1, this.elapsed / this.config.restore));
      if (darkMix <= 0) {
        this.phase = 'tremor';
        this.elapsed = 0;
        return { ...base, phase: 'restore', on, darkMix, enteredTremor: true };
      }
      return { ...base, phase: 'restore', on, darkMix };
    }

    if (this.elapsed >= this.config.tremor) {
      return { ...base, phase: 'tremor', active: false, finished: true };
    }
    return { ...base, phase: 'tremor', active: false };
  }

  private makeBaseDescriptor(): TransitionDescriptor {
    return {
      phase: this.phase,
      on: false,
      blackoutMix: 0,
      revealT: 0,
      darkMix: 1,
      active: true,
      enteredReveal: false,
      enteredHold: false,
      enteredRestore: false,
      enteredTremor: false,
      finished: false,
    };
  }
}

export type TremorOffset = {
  camX: number;
  camY: number;
  camZ: number;
  rootRotX: number;
  rootRotZ: number;
};

export function tremorOffset(t: number, rampDuration: number, ampBase: number): TremorOffset {
  const ramp = Math.min(1, t / rampDuration);
  const amp = ampBase * ramp;
  return {
    camX: Math.sin(t * 41) * amp,
    camY: Math.sin(t * 53 + 0.8) * amp,
    camZ: Math.sin(t * 37 + 1.6) * amp,
    rootRotX: Math.sin(t * 44) * amp * 0.4,
    rootRotZ: Math.sin(t * 39 + 1.1) * amp * 0.5,
  };
}
