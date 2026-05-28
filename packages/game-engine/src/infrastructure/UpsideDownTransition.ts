import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { PORTAL_UPSIDE_DOWN } from '../domain/Ball';
import {
  UPSIDE_DOWN_TRANSITION_BLACKOUT,
  UPSIDE_DOWN_TRANSITION_HOLD,
  UPSIDE_DOWN_TRANSITION_RESTORE,
  UPSIDE_DOWN_TRANSITION_REVEAL,
  UPSIDE_DOWN_TRANSITION_STROBE_HZ,
  UPSIDE_DOWN_TRANSITION_TREMOR,
} from '../domain/UpsideDownConstants';
import type { GarlandLights } from './GarlandLights';
import type { BumperVisuals } from './BumperVisuals';
import { PlayfieldShadeOverlay, playfieldShadeStrobeOpacity } from './PlayfieldShadeOverlay';

const TEXTURE_URL = '/playfield/upsidedown.jpg';

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
  onTremorStart?: () => void;
};

type CompleteHandler = () => void;

const _camPos = new THREE.Vector3();
const _lookTarget = new THREE.Vector3();

function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function easeIn(t: number): number {
  return t * t * t;
}

function strobeOn(t: number): boolean {
  return Math.sin(t * UPSIDE_DOWN_TRANSITION_STROBE_HZ * Math.PI * 2) > 0;
}

export class UpsideDownTransition {
  private camera: THREE.Camera | null = null;
  private playfieldRoot: THREE.Object3D | null = null;
  private garlandLights: GarlandLights | null = null;
  private bumperVisuals: BumperVisuals | null = null;

  private playfieldShade = new PlayfieldShadeOverlay();
  private upsideDownSprite: THREE.Sprite | null = null;
  private upsideDownMat: THREE.SpriteMaterial | null = null;
  private flashLight: THREE.PointLight | null = null;

  private phase: Phase = 'idle';
  private elapsed = 0;
  private strobeT = 0;
  private imageReady = false;
  private active = false;
  private ballMesh: THREE.Object3D | null = null;
  private ballBody: RAPIER.RigidBody | null = null;
  private onComplete: CompleteHandler | null = null;
  private onTremorStart: (() => void) | null = null;
  private tremorStarted = false;
  private baseCamPos = new THREE.Vector3();
  private baseRootPos = new THREE.Vector3();
  private baseRootRot = new THREE.Euler();

  setup(config: SetupConfig): void {
    this.dispose();
    this.camera = config.camera;
    this.playfieldRoot = config.root;
    this.garlandLights = config.garlandLights;
    this.bumperVisuals = config.bumperVisuals;

    this.playfieldShade.mount(config.root, { color: 0x000000, renderOrder: 600 });

    this.upsideDownMat = new THREE.SpriteMaterial({
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.upsideDownSprite = new THREE.Sprite(this.upsideDownMat);
    this.upsideDownSprite.center.set(0.5, 0.35);
    this.upsideDownSprite.scale.set(0.55, 0.72, 1);
    this.upsideDownSprite.renderOrder = 950;
    this.upsideDownSprite.visible = false;
    config.scene.add(this.upsideDownSprite);

    this.flashLight = new THREE.PointLight(0x9933ff, 0, 0.55, 2);
    this.flashLight.position.set(
      PORTAL_UPSIDE_DOWN.x,
      PORTAL_UPSIDE_DOWN.y + 0.12,
      PORTAL_UPSIDE_DOWN.z,
    );
    config.root.add(this.flashLight);

    const loader = new THREE.TextureLoader();
    loader.load(
      TEXTURE_URL,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        if (this.upsideDownMat) {
          this.upsideDownMat.map = tex;
          this.upsideDownMat.needsUpdate = true;
        }
        this.imageReady = true;
      },
      undefined,
      () => {
        this.imageReady = true;
      },
    );
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
    if (this.upsideDownSprite) this.upsideDownSprite.visible = true;
  }

  update(dt: number): void {
    if (!this.active || this.phase === 'idle') return;

    this.syncSprite();
    this.elapsed += dt;
    this.strobeT += dt;

    const on = strobeOn(this.strobeT);

    if (this.phase === 'blackout') {
      this.applyPlayfieldStrobe(on, false, easeOut(Math.min(1, this.elapsed / UPSIDE_DOWN_TRANSITION_BLACKOUT)));
      this.setSpriteOpacity(0);
      if (this.elapsed >= UPSIDE_DOWN_TRANSITION_BLACKOUT) {
        this.phase = 'reveal';
        this.elapsed = 0;
        this.strobeT = 0;
      }
      return;
    }

    if (this.phase === 'reveal') {
      const t = Math.min(1, this.elapsed / UPSIDE_DOWN_TRANSITION_REVEAL);
      this.applyPlayfieldStrobe(on, false, 1);
      this.setSpriteOpacity(this.imageReady && on ? easeOut(t) * 0.95 : 0);
      if (this.elapsed >= UPSIDE_DOWN_TRANSITION_REVEAL) {
        this.phase = 'hold';
        this.elapsed = 0;
        this.setSpriteOpacity(0.95);
        this.applyPlayfieldStrobe(false, false, 0.72);
        this.garlandLights?.setStrobe(false, false);
        this.bumperVisuals?.setStrobe(false, false);
        if (this.flashLight) this.flashLight.intensity = 0;
      }
      return;
    }

    if (this.phase === 'hold') {
      this.setSpriteOpacity(0.95);
      this.playfieldShade.setOpacity(0.72);
      if (this.elapsed >= UPSIDE_DOWN_TRANSITION_HOLD) {
        this.phase = 'restore';
        this.elapsed = 0;
        this.strobeT = 0;
      }
      return;
    }

    if (this.phase === 'restore') {
      const darkMix = 1 - easeIn(Math.min(1, this.elapsed / UPSIDE_DOWN_TRANSITION_RESTORE));
      this.applyPlayfieldStrobe(on, false, darkMix * 0.5);
      this.setSpriteOpacity(0.95 * darkMix);
      if (darkMix <= 0) {
        this.phase = 'tremor';
        this.elapsed = 0;
        this.captureShakeBases();
        this.playfieldShade.hide();
        if (this.upsideDownSprite) this.upsideDownSprite.visible = false;
        this.setSpriteOpacity(0);
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

    this.playfieldShade.dispose();

    if (this.upsideDownMat) {
      this.upsideDownMat.map?.dispose();
      this.upsideDownMat.dispose();
    }
    if (this.upsideDownSprite) this.upsideDownSprite.parent?.remove(this.upsideDownSprite);

    if (this.flashLight) {
      this.flashLight.dispose();
      this.flashLight.parent?.remove(this.flashLight);
    }

    this.camera = null;
    this.playfieldRoot = null;
    this.garlandLights = null;
    this.bumperVisuals = null;
    this.playfieldShade = new PlayfieldShadeOverlay();
    this.upsideDownSprite = null;
    this.upsideDownMat = null;
    this.flashLight = null;
    this.onComplete = null;
    this.onTremorStart = null;
    this.tremorStarted = false;
    this.active = false;
    this.phase = 'idle';
    this.imageReady = false;
  }

  private syncSprite(): void {
    if (!this.camera || !this.upsideDownSprite || !this.upsideDownSprite.visible) return;

    this.camera.getWorldPosition(_camPos);
    this.camera.getWorldDirection(_lookTarget);
    _lookTarget.normalize();

    this.upsideDownSprite.position.copy(_camPos).addScaledVector(_lookTarget, 0.38);
    this.upsideDownSprite.position.y += 0.06;
    this.upsideDownSprite.quaternion.copy(this.camera.quaternion);
  }

  private setSpriteOpacity(opacity: number): void {
    if (this.upsideDownMat) {
      this.upsideDownMat.opacity = THREE.MathUtils.clamp(opacity, 0, 1);
    }
  }

  private applyPlayfieldStrobe(on: boolean, fullMap: boolean, mix: number): void {
    this.playfieldShade.setOpacity(playfieldShadeStrobeOpacity(on, fullMap, mix));

    const active = mix > 0.02;
    if (this.flashLight) {
      this.flashLight.intensity = on && !fullMap ? 2.4 * mix : 0;
    }

    this.garlandLights?.setStrobe(active, on, fullMap);
    this.bumperVisuals?.setStrobe(active, on, fullMap);
  }

  private resetAtmosphere(): void {
    this.restoreShakeBases();
    this.phase = 'idle';
    this.elapsed = 0;
    this.strobeT = 0;
    this.active = false;
    this.tremorStarted = false;

    if (this.flashLight) this.flashLight.intensity = 0;
    this.playfieldShade.hide();
    if (this.upsideDownSprite) this.upsideDownSprite.visible = false;
    this.setSpriteOpacity(0);

    this.garlandLights?.setStrobe(false, false);
    this.bumperVisuals?.setStrobe(false, false);
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
