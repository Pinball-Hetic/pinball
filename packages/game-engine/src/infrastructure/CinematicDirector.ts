export interface CinematicSpec {
  id: string;
  durationMs: number;
  freezePhysics: boolean;
  onStart?: () => void;
  onEnd?: () => void;
}

/**
 * Directeur de cinématiques : généralise le pattern de pause
 * d'la transition de monde (clip joué → physique gelée pendant sa durée).
 * Le playfield combine `transitionActive || director.shouldFreeze()`.
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

  /** true si la physique doit être gelée cette frame */
  shouldFreeze(): boolean {
    return this.active !== null && this.active.freezePhysics;
  }

  /** joue un clip ; once=true → une seule fois par partie */
  play(spec: CinematicSpec, opts?: { once?: boolean }): boolean {
    if (opts?.once && this.playedThisGame.has(spec.id)) return false;
    if (opts?.once) this.playedThisGame.add(spec.id);
    this.active = spec;
    this.startedAt = this.now();
    spec.onStart?.();
    return true;
  }

  /** à appeler chaque frame avec performance.now() */
  update(now: number): void {
    if (!this.active) return;
    if (now - this.startedAt >= this.active.durationMs) {
      const spec = this.active;
      this.active = null;
      spec.onEnd?.();
    }
  }

  /** reset par partie (appelé au resetGame) */
  resetGame(): void {
    this.playedThisGame.clear();
    // Annule un clip encore actif (sinon shouldFreeze() resterait vrai et
    // gèlerait la physique de la nouvelle partie). onEnd() lève le gel
    // gameplay / restaure caméra+DMD → doit être appelé avant de nuller.
    const spec = this.active;
    this.active = null;
    spec?.onEnd?.();
  }
}
