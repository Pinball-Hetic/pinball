import * as THREE from 'three';
import { easeOut, easeIn, strobeOn } from '@pinball/game-engine';
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

type Phase = 'idle' | 'blackout' | 'restore' | 'tremor';

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

  private phase:    Phase = 'idle';
  private elapsed   = 0;
  private strobeT   = 0;
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
    this.phase      = 'blackout';
    this.elapsed    = 0;
    this.strobeT    = 0;
    this.ballMesh   = config.ballMesh;
    this.onComplete = onComplete;

    if (this.ballMesh) {
      this.ballMesh.visible = false;
      this.ballMesh.scale.setScalar(1);
    }
  }

  update(dt: number): void {
    if (!this.active || this.phase === 'idle') return;

    this.elapsed += dt;
    this.strobeT  += dt;
    const on = strobeOn(this.strobeT, STROBE_HZ);

    if (this.phase === 'blackout') {
      const t = Math.min(1, this.elapsed / BLACKOUT_DURATION);
      this.cinematicStrobe.applyFlashOnly(on, easeOut(t));
      if (this.elapsed >= BLACKOUT_DURATION) {
        this.phase   = 'restore';
        this.elapsed = 0;
        this.strobeT = 0;
      }
      return;
    }

    if (this.phase === 'restore') {
      const darkMix = 1 - easeIn(Math.min(1, this.elapsed / RESTORE_DURATION));
      this.cinematicStrobe.applyFlashOnly(on, darkMix);
      if (darkMix <= 0) {
        this.cinematicStrobe.stop();
        this.phase   = 'tremor';
        this.elapsed = 0;
        this.captureShakeBases();
      }
      return;
    }

    if (this.phase === 'tremor') {
      this.applyTremor();
      if (this.elapsed >= TREMOR_DURATION) {
        this.restoreShakeBases();
        this.finish();
      }
    }
  }

  private applyTremor(): void {
    const t   = this.elapsed;
    const ramp = Math.min(1, t / 0.3);
    const amp  = 0.003 * ramp;

    if (this.camera) {
      this.camera.position.set(
        this.baseCamPos.x + Math.sin(t * 41) * amp,
        this.baseCamPos.y + Math.sin(t * 53 + 0.8) * amp,
        this.baseCamPos.z + Math.sin(t * 37 + 1.6) * amp,
      );
    }

    if (this.playfieldRoot) {
      this.playfieldRoot.rotation.x =
        this.baseRootRot.x + Math.sin(t * 44) * amp * 0.4;
      this.playfieldRoot.rotation.z =
        this.baseRootRot.z + Math.sin(t * 39 + 1.1) * amp * 0.5;
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
    this.phase   = 'idle';
    this.elapsed = 0;
    this.strobeT = 0;
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
    this.phase      = 'idle';
    this.elapsed    = 0;
    this.strobeT    = 0;
    this.onComplete = null;
    this.ballMesh   = null;
    this.camera     = null;
    this.playfieldRoot = null;
  }
}
