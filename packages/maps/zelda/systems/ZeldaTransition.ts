import * as THREE from 'three';
import { TransitionTimeline, tremorOffset } from '@pinball/game-engine';
import { PlayfieldCinematicStrobe } from './PlayfieldCinematicStrobe';
import { layout } from '../layout';

// ── Timings ────────────────────────────────────────────────────────────────
/** Durée du flash violet montant (entrée Sacred Realm). */
const BLACKOUT_DURATION = 0.45; // s
/** Durée du fade-out avant la phase tremor. */
const RESTORE_DURATION  = 0.55; // s
/** Durée du tremor (secousses caméra + playfield). */
const TREMOR_DURATION   = 0.55; // s
/** Fréquence du strobe pendant le flash. */
const STROBE_HZ = 6;

type SetupConfig = {
  /** Racine de la scène (playfield root) — secouée pendant le tremor. */
  root: THREE.Object3D;
  /** Caméra — secouée pendant le tremor. */
  camera: THREE.Camera;
};

type StartConfig = {
  /** Mesh de la bille — masqué pendant la transition. */
  ballMesh: THREE.Object3D;
};

/**
 * Transition Sacred Realm (Zelda) — aller ET retour.
 *
 * Séquence : flash violet (blackout) → fade (restore) → tremor → callback.
 * Le module appelle `onComplete` pour téléporter la balle et émettre
 * `PORTAL_TRANSITION_END` ou `RETURN_PORTAL_TRANSITION_END`.
 *
 * Le tremor (secousses de caméra + playfield) suit la restauration de l'écran,
 * avant de rendre la balle visible — même pattern que UpsideDownTransition ST.
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

  // Références pour le tremor.
  private camera:        THREE.Camera | null       = null;
  private playfieldRoot: THREE.Object3D | null     = null;
  private baseCamPos     = new THREE.Vector3();
  private baseRootPos    = new THREE.Vector3();
  private baseRootRot    = new THREE.Euler();

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
   * Démarre la transition.
   * Appelé depuis `onGameEvent(PORTAL_ENTER | RETURN_PORTAL_ENTER)`.
   * La balle doit déjà être tenue avant l'appel.
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
        this.baseCamPos.x + o.camX,
        this.baseCamPos.y + o.camY,
        this.baseCamPos.z + o.camZ,
      );
    }

    if (this.playfieldRoot) {
      this.playfieldRoot.rotation.x = this.baseRootRot.x + o.rootRotX;
      this.playfieldRoot.rotation.z = this.baseRootRot.z + o.rootRotZ;
    }
  }

  private captureShakeBases(): void {
    if (this.camera) this.baseCamPos.copy(this.camera.position);
    if (this.playfieldRoot) {
      this.baseRootPos.copy(this.playfieldRoot.position);
      this.baseRootRot.copy(this.playfieldRoot.rotation);
    }
  }

  private restoreShakeBases(): void {
    if (this.camera) this.camera.position.copy(this.baseCamPos);
    if (this.playfieldRoot) {
      this.playfieldRoot.position.copy(this.baseRootPos);
      this.playfieldRoot.rotation.copy(this.baseRootRot);
    }
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
