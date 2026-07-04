import { easeInOut, easeOut } from './CinematicEasing';

/**
 * Cinematic FSM for the boss camera move (idle → zoomIn → hold → zoomOut →
 * idle). Owns {phase, elapsed} only — NO Three dependency. Given (dt, config) it
 * advances the timeline and returns per-phase blend factors in [0,1] that the
 * caller (PlayfieldCameraDirector) feeds into its vector/distance lerps:
 *
 *  - lookAtT   : panFrom → bossFocus (zoomIn) / bossFocus → baseTarget (zoomOut)
 *  - distanceT : baseDistance → zoomedDistance (zoomIn) / reverse (zoomOut)
 *  - dirT      : baseDir → faceDir blend amount
 */

export type CinematicPhase = 'idle' | 'zoomIn' | 'hold' | 'zoomOut';

export type CinematicPhaseConfig = {
  zoomInDuration: number;
  holdDuration: number;
  zoomOutDuration: number;
  panEasing?: 'linear' | 'easeInOut';
};

export type CinematicBlend = {
  lookAtT: number;
  distanceT: number;
  dirT: number;
};

export type CinematicTick = {
  phase: CinematicPhase;
  blend: CinematicBlend;
  done: boolean;
};

export class CinematicPhaseMachine {
  private phase: CinematicPhase = 'idle';
  private elapsed = 0;

  getPhase(): CinematicPhase {
    return this.phase;
  }

  isActive(): boolean {
    return this.phase !== 'idle';
  }

  start(): void {
    this.phase = 'zoomIn';
    this.elapsed = 0;
  }

  reset(): void {
    this.phase = 'idle';
    this.elapsed = 0;
  }

  tick(dt: number, config: CinematicPhaseConfig): CinematicTick {
    if (this.phase === 'idle') {
      return { phase: 'idle', blend: { lookAtT: 0, distanceT: 0, dirT: 0 }, done: false };
    }
    this.elapsed += dt;
    if (this.phase === 'zoomIn') return this.tickZoomIn(config);
    if (this.phase === 'hold') return this.tickHold(config);
    return this.tickZoomOut(config);
  }

  private tickZoomIn(config: CinematicPhaseConfig): CinematicTick {
    const t = Math.min(1, this.elapsed / config.zoomInDuration);
    const e = config.panEasing === 'linear' ? t : easeInOut(t);
    if (t >= 1) {
      this.phase = 'hold';
      this.elapsed = 0;
    }
    return { phase: 'zoomIn', blend: { lookAtT: e, distanceT: e, dirT: e }, done: false };
  }

  private tickHold(config: CinematicPhaseConfig): CinematicTick {
    if (this.elapsed >= config.holdDuration) {
      this.phase = 'zoomOut';
      this.elapsed = 0;
    }
    return { phase: 'hold', blend: { lookAtT: 1, distanceT: 1, dirT: 1 }, done: false };
  }

  private tickZoomOut(config: CinematicPhaseConfig): CinematicTick {
    const t = Math.min(1, this.elapsed / config.zoomOutDuration);
    const e = easeOut(t);
    const done = t >= 1;
    if (done) {
      this.phase = 'idle';
      this.elapsed = 0;
    }
    return { phase: 'zoomOut', blend: { lookAtT: e, distanceT: e, dirT: 1 - e }, done };
  }
}
