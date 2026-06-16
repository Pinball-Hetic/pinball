import * as THREE from 'three';
import { easeOut, easeIn, strobeOn } from '@pinball/game-engine';
import { PlayfieldCinematicStrobe } from './PlayfieldCinematicStrobe';
import { layout } from '../layout';

// ── Timings ────────────────────────────────────────────────────────────────
/** Durée du flash violet montant (entrée Sacred Realm). */
const BLACKOUT_DURATION = 0.45; // s
/** Durée du fade-out avant de rendre le contrôle au callback. */
const RESTORE_DURATION  = 0.55; // s
/** Fréquence du strobe pendant le flash. */
const STROBE_HZ = 6;

type Phase = 'idle' | 'blackout' | 'restore';

type StartConfig = {
  /** Mesh de la bille — masqué pendant la transition. */
  ballMesh: THREE.Object3D;
};

/**
 * Transition Sacred Realm (Zelda) — aller ET retour.
 *
 * Séquence : flash violet (blackout) → fade (restore) → callback.
 * Le module appelle `onComplete` pour téléporter la balle et émettre
 * `PORTAL_TRANSITION_END` ou `RETURN_PORTAL_TRANSITION_END`.
 *
 * Pas de billboard (pas d'image "Sacred Realm") — l'atmosphère est gérée
 * par `SacredRealmAtmosphere` qui démarre sur `PORTAL_TRANSITION_END`.
 */
export class ZeldaTransition {
  private cinematicStrobe = new PlayfieldCinematicStrobe();

  private phase: Phase = 'idle';
  private elapsed   = 0;
  private strobeT   = 0;
  private active    = false;
  private ballMesh: THREE.Object3D | null = null;
  private onComplete: (() => void) | null = null;

  setup(config: { root: THREE.Object3D }): void {
    this.dispose();
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
   * La balle doit déjà être tenue (holdAtAlternateWorldSpawn / holdAtNormalReturnSpawn)
   * avant l'appel — on se contente de masquer le mesh ici.
   */
  start(config: StartConfig, onComplete: () => void): void {
    this.active     = true;
    this.phase      = 'blackout';
    this.elapsed    = 0;
    this.strobeT    = 0;
    this.ballMesh   = config.ballMesh;
    this.onComplete = onComplete;

    // Masque la bille pendant la transition.
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
        this.finish();
      }
    }
  }

  private finish(): void {
    this.phase   = 'idle';
    this.elapsed = 0;
    this.strobeT = 0;
    this.active  = false;
    this.cinematicStrobe.stop();

    // Le callback (fourni par le module) fait la téléportation de balle
    // et l'émission des events de fin de transition — on est hors du drain
    // Rapier ici (appelé depuis update()), donc les mutations de corps sont sûres.
    const cb = this.onComplete;
    this.onComplete = null;
    this.ballMesh   = null;
    cb?.();
  }

  dispose(): void {
    this.cinematicStrobe.dispose();
    this.cinematicStrobe = new PlayfieldCinematicStrobe();
    this.active     = false;
    this.phase      = 'idle';
    this.elapsed    = 0;
    this.strobeT    = 0;
    this.onComplete = null;
    this.ballMesh   = null;
  }
}
