import * as THREE from 'three';
import { ShakeBasis, TransitionTimeline, tremorOffset } from '@pinball/game-engine';
import { PlayfieldCinematicStrobe } from './PlayfieldCinematicStrobe';
import { layout } from '../layout';

// ── Timings ────────────────────────────────────────────────────────────────
/** Duration of the rising purple flash (Sacred Realm entry). */
const BLACKOUT_DURATION = 0.45; // s
/** Fade-out duration before the tremor phase. */
const RESTORE_DURATION  = 0.55; // s
/** Tremor duration (camera + playfield shakes). */
const TREMOR_DURATION   = 0.55; // s
/** Strobe frequency during the flash. */
const STROBE_HZ = 6;

type SetupConfig = {
  /** Scene root (playfield root) — shaken during the tremor. */
  root: THREE.Object3D;
  /** Camera — shaken during the tremor. */
  camera: THREE.Camera;
};

type StartConfig = {
  /** Ball mesh — hidden during the transition. */
  ballMesh: THREE.Object3D;
};

/**
 * Sacred Realm transition (Zelda) — both entry AND return.
 *
 * Sequence: purple flash (blackout) → fade (restore) → tremor → callback.
 * The module calls `onComplete` to teleport the ball and emit
 * `PORTAL_TRANSITION_END` or `RETURN_PORTAL_TRANSITION_END`.
 *
 * The tremor (camera + playfield shakes) follows the screen restore, before
 * the ball becomes visible — same pattern as ST's UpsideDownTransition.
 */
export class ZeldaTransition {
  private cinematicStrobe = new PlayfieldCinematicStrobe();

  private timeline = new TransitionTimeline({
    blackout: BLACKOUT_DURATION,
    reveal:   0,
    hold:     0,
    restore:  RESTORE_DURATION,
    tremor:   TREMOR_DURATION,
    strobeHz: STROBE_HZ,
    hasReveal: false,
  });
  private active    = false;
  private ballMesh: THREE.Object3D | null = null;
  private onComplete: (() => void) | null = null;

  // Tremor references.
  private camera:        THREE.Camera | null       = null;
  private playfieldRoot: THREE.Object3D | null     = null;
  private shakeBasis     = new ShakeBasis();

  setup(config: SetupConfig): void {
    this.dispose();
    this.camera        = config.camera;
    this.playfieldRoot = config.root;

    this.cinematicStrobe.mount(config.root, {
      flashColor:     0x9900ff,
      flashIntensity: 2.2,
      flashPosition:  new THREE.Vector3(
        layout.sensors.portal.x,
        layout.sensors.portal.y + 0.14,
        layout.sensors.portal.z,
      ),
      flashDistance: 0.6,
    });
  }

  isActive(): boolean {
    return this.active;
  }

  /**
   * Starts the transition.
   * Called from `onGameEvent(PORTAL_ENTER | RETURN_PORTAL_ENTER)`.
   * The ball must already be held before the call.
   */
  start(config: StartConfig, onComplete: () => void): void {
    this.active     = true;
    this.timeline.reset();
    this.timeline.begin();
    this.ballMesh   = config.ballMesh;
    this.onComplete = onComplete;

    if (this.ballMesh) {
      this.ballMesh.visible = false;
      this.ballMesh.scale.setScalar(1);
    }
  }

  update(dt: number): void {
    if (!this.active || this.timeline.getPhase() === 'idle') return;

    const d = this.timeline.tick(dt);

    if (d.phase === 'blackout') {
      this.cinematicStrobe.applyFlashOnly(d.on, d.blackoutMix);
      return;
    }

    if (d.phase === 'restore') {
      this.cinematicStrobe.applyFlashOnly(d.on, d.darkMix);
      if (d.enteredTremor) {
        this.cinematicStrobe.stop();
        this.captureShakeBases();
      }
      return;
    }

    if (d.phase === 'tremor') {
      this.applyTremor();
      if (d.finished) {
        this.restoreShakeBases();
        this.finish();
      }
    }
  }

  private applyTremor(): void {
    const o = tremorOffset(this.timeline.getElapsed(), 0.3, 0.003);

    if (this.camera) {
      this.camera.position.set(
        this.shakeBasis.camPos.x + o.camX,
        this.shakeBasis.camPos.y + o.camY,
        this.shakeBasis.camPos.z + o.camZ,
      );
    }

    if (this.playfieldRoot) {
      this.playfieldRoot.rotation.x = this.shakeBasis.rootRot.x + o.rootRotX;
      this.playfieldRoot.rotation.z = this.shakeBasis.rootRot.z + o.rootRotZ;
    }
  }

  private captureShakeBases(): void {
    this.shakeBasis.capture(this.camera, this.playfieldRoot);
  }

  private restoreShakeBases(): void {
    this.shakeBasis.restore(this.camera, this.playfieldRoot);
  }

  private finish(): void {
    this.timeline.reset();
    this.active  = false;
    this.cinematicStrobe.stop();

    const cb = this.onComplete;
    this.onComplete = null;
    this.ballMesh   = null;
    cb?.();
  }

  dispose(): void {
    this.restoreShakeBases();
    this.cinematicStrobe.dispose();
    this.cinematicStrobe = new PlayfieldCinematicStrobe();
    this.active     = false;
    this.timeline.reset();
    this.onComplete = null;
    this.ballMesh   = null;
    this.camera     = null;
    this.playfieldRoot = null;
  }
}
