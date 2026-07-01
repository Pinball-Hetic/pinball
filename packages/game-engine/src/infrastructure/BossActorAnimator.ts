import * as THREE from 'three';

export type BossActorAnimState = 'idle' | 'hit' | 'victory';

export type BossActorGlowConfig = {
  /** Hex color of the glow PointLight created on mount. */
  color: number;
  /** Light distance (THREE.PointLight 3rd arg). */
  distance: number;
  /** Light decay (THREE.PointLight 4th arg). */
  decay: number;
  /** Local Y position of the glow light. */
  y: number;
};

export type BossActorActions = {
  mixer: THREE.AnimationMixer;
  idleAction: THREE.AnimationAction | null;
  hitAction: THREE.AnimationAction | null;
  victoryAction: THREE.AnimationAction | null;
};

const HIT_FLASH_DURATION = 0.18;
const PULSE_SPEED = 2.5;
const PULSE_AMP = 0.12;
const PULSE_BASE = 0.82;
const HIT_BOOST = 1.4;
const GLOW_INTENSITY_BASE = 0.42;
const HIT_SCALE_BOOST = 0.2;

/**
 * Pure pulse intensity multiplier shared by demogorgon/ganondorf target visuals.
 * pulse = (0.82 + sin(t*2.5)*0.12) * (hitFlash>0 ? 1.4 : 1)
 */
export function bossActorPulse(pulseT: number, hitFlash: number): number {
  const hitBoost = hitFlash > 0 ? HIT_BOOST : 1;
  return (PULSE_BASE + Math.sin(pulseT * PULSE_SPEED) * PULSE_AMP) * hitBoost;
}

/** Pure anchor scale during a hit flash: 1 + (hitFlash/0.18)*0.2. */
export function bossActorScale(hitFlash: number): number {
  return 1 + (hitFlash / HIT_FLASH_DURATION) * HIT_SCALE_BOOST;
}

/**
 * Composed lifecycle helper for the demogorgon/ganondorf "target boss" actors.
 * Owns the idle/hit/victory anim state machine + the glow/scale pulse math.
 * The owning class injects the glow config and feeds in the per-map mixer/actions
 * once its GLTF is fitted. GLTF/material IO stays in the owner.
 */
export class BossActorAnimator {
  private mixer: THREE.AnimationMixer | null = null;
  private idleAction: THREE.AnimationAction | null = null;
  private hitAction: THREE.AnimationAction | null = null;
  private victoryAction: THREE.AnimationAction | null = null;
  private animState: BossActorAnimState = 'idle';
  private pulseT = 0;
  private hitFlash = 0;
  private glowLight: THREE.PointLight | null = null;

  constructor(private readonly glow: BossActorGlowConfig) {}

  createGlowLight(): THREE.PointLight {
    this.glowLight = new THREE.PointLight(this.glow.color, 0, this.glow.distance, this.glow.decay);
    this.glowLight.position.y = this.glow.y;
    return this.glowLight;
  }

  /** Register the per-map mixer + actions, wire the hit→idle finished listener. */
  setActions(actions: BossActorActions): void {
    this.mixer = actions.mixer;
    this.idleAction = actions.idleAction;
    this.hitAction = actions.hitAction;
    this.victoryAction = actions.victoryAction;

    this.mixer.addEventListener('finished', (event) => {
      if (event.action === this.hitAction && this.animState === 'hit') {
        this.playIdle();
      }
    });
  }

  primeActions(): THREE.AnimationAction[] {
    return [this.idleAction, this.hitAction, this.victoryAction].filter(
      (action): action is THREE.AnimationAction => action !== null,
    );
  }

  get currentMixer(): THREE.AnimationMixer | null {
    return this.mixer;
  }

  get idle(): THREE.AnimationAction | null {
    return this.idleAction;
  }

  /** Attach the glow light to the anchor (idempotent) and start idle. */
  show(anchor: THREE.Object3D): void {
    if (this.glowLight && !this.glowLight.parent) {
      anchor.add(this.glowLight);
    }
    this.playIdle();
  }

  /** Reset to hidden idle state: scale/rotation reset, glow off + detached. */
  hide(anchor: THREE.Object3D | null): void {
    if (anchor) {
      anchor.scale.setScalar(1);
      anchor.rotation.z = 0;
    }
    this.animState = 'idle';
    this.hitFlash = 0;
    // hit/victory tournent en LoopOnce + clampWhenFinished : une fois finies,
    // elles restent "actives" gelées sur leur dernière frame (poids toujours
    // dans le blend) au lieu de se couper. Sans ce stop() explicite, la pose
    // de victoire (boss "mort") continuait de peser au combat suivant — d'où
    // le boss figé dans une pose bizarre au lieu de repartir en idle propre
    // (cf. bug Ganondorf coincé après une 1re victoire).
    this.hitAction?.stop();
    this.victoryAction?.stop();
    if (this.glowLight) {
      this.glowLight.intensity = 0;
      this.glowLight.removeFromParent();
    }
  }

  playHit(): void {
    if (!this.mixer || !this.hitAction || !this.idleAction) return;
    this.animState = 'hit';
    this.hitFlash = HIT_FLASH_DURATION;
    this.hitAction.reset();
    this.hitAction.setLoop(THREE.LoopOnce, 1);
    this.hitAction.clampWhenFinished = true;
    this.hitAction.crossFadeFrom(this.idleAction, 0.08, true).play();
  }

  playVictory(): void {
    if (!this.mixer || !this.victoryAction || !this.idleAction) {
      this.playIdle();
      return;
    }
    this.animState = 'victory';
    this.victoryAction.reset();
    this.victoryAction.setLoop(THREE.LoopOnce, 1);
    this.victoryAction.clampWhenFinished = true;
    const from = this.hitAction?.isRunning() ? this.hitAction : this.idleAction;
    this.victoryAction.crossFadeFrom(from, 0.12, true).play();
  }

  playIdle(): void {
    if (!this.idleAction) return;
    this.animState = 'idle';
    // Défense en profondeur : garantit qu'aucune pose one-shot gelée (hit ou
    // victoire d'une partie précédente) ne reste dans le blend quand on
    // revient à idle, quel que soit le chemin d'appel (show() après hide(),
    // reveal direct, etc.).
    this.hitAction?.stop();
    this.victoryAction?.stop();
    this.idleAction.reset();
    this.idleAction.setLoop(THREE.LoopRepeat, Infinity);
    this.idleAction.fadeIn(0.12).play();
  }

  /** Advance mixer + glow/scale pulse. Owner gates on anchor.visible before calling. */
  update(dt: number, anchor: THREE.Object3D): void {
    this.mixer?.update(dt);

    if (this.hitFlash > 0) this.hitFlash = Math.max(0, this.hitFlash - dt);

    this.pulseT += dt;
    const pulse = bossActorPulse(this.pulseT, this.hitFlash);
    if (this.glowLight) this.glowLight.intensity = GLOW_INTENSITY_BASE * pulse;

    anchor.scale.setScalar(bossActorScale(this.hitFlash));
  }

  /** Clear all anim state. `disposeGlow` matches the per-map dispose() behaviour. */
  reset(disposeGlow: boolean): void {
    if (disposeGlow && this.glowLight) {
      this.glowLight.dispose();
      this.glowLight.removeFromParent();
    }
    this.mixer = null;
    this.idleAction = null;
    this.hitAction = null;
    this.victoryAction = null;
    this.glowLight = null;
    this.animState = 'idle';
    this.hitFlash = 0;
    this.pulseT = 0;
  }
}
