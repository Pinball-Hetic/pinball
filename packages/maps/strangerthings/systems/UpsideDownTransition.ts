import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { layout } from '../layout';
import {
  UPSIDE_DOWN_TRANSITION_BLACKOUT,
  UPSIDE_DOWN_TRANSITION_HOLD,
  UPSIDE_DOWN_TRANSITION_RESTORE,
  UPSIDE_DOWN_TRANSITION_REVEAL,
  UPSIDE_DOWN_TRANSITION_STROBE_HZ,
  UPSIDE_DOWN_TRANSITION_TREMOR,
} from './UpsideDownConstants';
import { easeIn, easeOut, strobeOn } from '@pinball/game-engine';
import { CameraBillboardSprite } from '@pinball/game-engine';
import type { GarlandLights } from './GarlandLights';
import type { BumperVisuals } from './BumperVisuals';
import { PlayfieldCinematicStrobe } from './PlayfieldCinematicStrobe';
import { mapAsset } from '../manifest';

const TEXTURE_URL = mapAsset('playfield/upsidedown.jpg');

type Phase = 'idle' | 'blackout' | 'reveal' | 'hold' | 'restore' | 'tremor';

type SetupConfig = {
  root: THREE.Object3D;
  scene: THREE.Scene;
  camera: THREE.Camera;
  garlandLights: GarlandLights | null;
  bumperVisuals: BumperVisuals | null;
};

type StartConfig = {
  ballMesh: THREE.Object3D;
  ballBody: RAPIER.RigidBody;
  onRevealStart?: () => void;
  onTremorStart?: () => void;
};

type CompleteHandler = () => void;

export class UpsideDownTransition {
  private camera: THREE.Camera | null = null;
  private playfieldRoot: THREE.Object3D | null = null;

  private cinematicStrobe = new PlayfieldCinematicStrobe();
  private billboard = new CameraBillboardSprite();

  private phase: Phase = 'idle';
  private elapsed = 0;
  private strobeT = 0;
  private active = false;
  private ballMesh: THREE.Object3D | null = null;
  private ballBody: RAPIER.RigidBody | null = null;
  private onComplete: CompleteHandler | null = null;
  private onRevealStart: (() => void) | null = null;
  private onTremorStart: (() => void) | null = null;
  private tremorStarted = false;
  private baseCamPos = new THREE.Vector3();
  private baseRootPos = new THREE.Vector3();
  private baseRootRot = new THREE.Euler();

  setup(config: SetupConfig): void {
    this.dispose();
    this.camera = config.camera;
    this.playfieldRoot = config.root;

    this.cinematicStrobe.mount(config.root, config.garlandLights, config.bumperVisuals, {
      flashColor: 0x9933ff,
      flashIntensity: 2.4,
      flashPosition: new THREE.Vector3(
        layout.sensors.portal.x,
        layout.sensors.portal.y + 0.12,
        layout.sensors.portal.z,
      ),
    });

    this.billboard.mount(config.scene, config.camera, { textureUrl: TEXTURE_URL });
  }

  isActive(): boolean {
    return this.active;
  }

  start(config: StartConfig, onComplete: CompleteHandler): void {
    if (!this.camera) return;

    this.active = true;
    this.phase = 'blackout';
    this.elapsed = 0;
    this.strobeT = 0;
    this.ballMesh = config.ballMesh;
    this.ballBody = config.ballBody;
    this.onComplete = onComplete;
    this.onRevealStart = config.onRevealStart ?? null;
    this.onTremorStart = config.onTremorStart ?? null;
    this.tremorStarted = false;

    if (this.ballMesh) {
      this.ballMesh.visible = false;
      this.ballMesh.scale.setScalar(1);
    }
    if (this.ballBody) {
      this.ballBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
      this.ballBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
    this.billboard.show();
  }

  update(dt: number): void {
    if (!this.active || this.phase === 'idle') return;

    this.billboard.sync();
    this.elapsed += dt;
    this.strobeT += dt;

    const on = strobeOn(this.strobeT, UPSIDE_DOWN_TRANSITION_STROBE_HZ);

    if (this.phase === 'blackout') {
      this.cinematicStrobe.apply(on, false, easeOut(Math.min(1, this.elapsed / UPSIDE_DOWN_TRANSITION_BLACKOUT)));
      this.billboard.setOpacity(0);
      if (this.elapsed >= UPSIDE_DOWN_TRANSITION_BLACKOUT) {
        this.phase = 'reveal';
        this.elapsed = 0;
        this.strobeT = 0;
        this.onRevealStart?.();
      }
      return;
    }

    if (this.phase === 'reveal') {
      const t = Math.min(1, this.elapsed / UPSIDE_DOWN_TRANSITION_REVEAL);
      this.cinematicStrobe.apply(on, false, 1);
      this.billboard.setOpacity(this.billboard.isReady() && on ? easeOut(t) * 0.95 : 0);
      if (this.elapsed >= UPSIDE_DOWN_TRANSITION_REVEAL) {
        this.phase = 'hold';
        this.elapsed = 0;
        this.billboard.setOpacity(0.95);
        this.cinematicStrobe.applyHoldShade(0.72);
      }
      return;
    }

    if (this.phase === 'hold') {
      this.billboard.setOpacity(0.95);
      this.cinematicStrobe.setShadeOpacity(0.72);
      if (this.elapsed >= UPSIDE_DOWN_TRANSITION_HOLD) {
        this.phase = 'restore';
        this.elapsed = 0;
        this.strobeT = 0;
      }
      return;
    }

    if (this.phase === 'restore') {
      const darkMix = 1 - easeIn(Math.min(1, this.elapsed / UPSIDE_DOWN_TRANSITION_RESTORE));
      this.cinematicStrobe.apply(on, false, darkMix * 0.5);
      this.billboard.setOpacity(0.95 * darkMix);
      if (darkMix <= 0) {
        this.phase = 'tremor';
        this.elapsed = 0;
        this.captureShakeBases();
        this.cinematicStrobe.stop();
        this.billboard.hide();
        if (!this.tremorStarted) {
          this.tremorStarted = true;
          this.onTremorStart?.();
        }
      }
      return;
    }

    if (this.phase === 'tremor') {
      this.applyTremor();
      if (this.elapsed >= UPSIDE_DOWN_TRANSITION_TREMOR) this.finish();
    }
  }

  dispose(): void {
    this.resetAtmosphere();

    this.cinematicStrobe.dispose();
    this.billboard.dispose();

    this.camera = null;
    this.playfieldRoot = null;
    this.cinematicStrobe = new PlayfieldCinematicStrobe();
    this.billboard = new CameraBillboardSprite();
    this.onComplete = null;
    this.onRevealStart = null;
    this.onTremorStart = null;
    this.tremorStarted = false;
    this.active = false;
    this.phase = 'idle';
  }

  private resetAtmosphere(): void {
    this.restoreShakeBases();
    this.phase = 'idle';
    this.elapsed = 0;
    this.strobeT = 0;
    this.active = false;
    this.tremorStarted = false;

    this.cinematicStrobe.stop();
    this.billboard.hide();
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

  private applyTremor(): void {
    const t = this.elapsed;
    const ramp = Math.min(1, t / 0.45);
    const amp = 0.0032 * ramp;

    if (this.camera) {
      this.camera.position.set(
        this.baseCamPos.x + Math.sin(t * 41) * amp,
        this.baseCamPos.y + Math.sin(t * 53 + 0.8) * amp,
        this.baseCamPos.z + Math.sin(t * 37 + 1.6) * amp,
      );
    }

    if (this.playfieldRoot) {
      this.playfieldRoot.rotation.x = this.baseRootRot.x + Math.sin(t * 44) * amp * 0.4;
      this.playfieldRoot.rotation.z = this.baseRootRot.z + Math.sin(t * 39 + 1.1) * amp * 0.5;
    }
  }

  private finish(): void {
    if (!this.active) return;

    this.restoreShakeBases();

    if (this.ballMesh) {
      this.ballMesh.scale.setScalar(1);
      this.ballMesh.visible = true;
    }
    if (this.ballBody) {
      this.ballBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
      this.ballBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }

    this.resetAtmosphere();

    this.ballMesh = null;
    this.ballBody = null;
    const done = this.onComplete;
    this.onComplete = null;
    done?.();
  }
}
