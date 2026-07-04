export interface CinematicSpec {
  id: string;
  durationMs: number;
  freezePhysics: boolean;
  onStart?: () => void;
  onEnd?: () => void;
}

/**
 * Cinematics director: generalizes the world-transition pause pattern
 * (clip playing → physics frozen for its duration).
 * The playfield combines `transitionActive || director.shouldFreeze()`.
 */
export class CinematicDirector {
  private active: CinematicSpec | null = null;
  private startedAt = 0;
  private playedThisGame = new Set<string>();
  private readonly now: () => number;

  constructor(now: () => number = () => performance.now()) {
    this.now = now;
  }

  isActive(): boolean {
    return this.active !== null;
  }

  /** true if physics must be frozen this frame */
  shouldFreeze(): boolean {
    return this.active !== null && this.active.freezePhysics;
  }

  /**
   * Elapsed time (ms) since the active clip started, or -1 if none.
   * Lets the playfield drive a feedback (strobe) during the freeze without
   * duplicating the director's time measurement.
   */
  activeElapsedMs(now: number = this.now()): number {
    if (!this.active) return -1;
    return now - this.startedAt;
  }

  /** Duration (ms) of the active clip, or -1 if none. */
  activeDurationMs(): number {
    return this.active?.durationMs ?? -1;
  }

  /** plays a clip; once=true → only once per game */
  play(spec: CinematicSpec, opts?: { once?: boolean }): boolean {
    if (opts?.once && this.playedThisGame.has(spec.id)) return false;
    if (opts?.once) this.playedThisGame.add(spec.id);
    this.active = spec;
    this.startedAt = this.now();
    spec.onStart?.();
    return true;
  }

  /** call every frame with performance.now() */
  update(now: number): void {
    if (!this.active) return;
    if (now - this.startedAt >= this.active.durationMs) {
      const spec = this.active;
      this.active = null;
      spec.onEnd?.();
    }
  }

  /** per-game reset (called on resetGame) */
  resetGame(): void {
    this.playedThisGame.clear();
    // Cancel a still-active clip (otherwise shouldFreeze() would stay true
    // and freeze the new game's physics). onEnd() lifts the gameplay freeze /
    // restores camera+DMD → must be called before nulling.
    const spec = this.active;
    this.active = null;
    spec?.onEnd?.();
  }
}
