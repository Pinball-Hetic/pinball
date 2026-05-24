import * as THREE from 'three';
import type { GameEvent } from '../domain/GameEvents';
import { DEMOGORGON_SENSOR } from '../domain/Ball';
import type { GarlandLights } from './GarlandLights';
import type { BumperVisuals } from './BumperVisuals';

const TEXTURE_URL = '/playfield/demogorgon.png';

const BLACKOUT = 0.12;
const REVEAL = 0.5;
const FLICKER = 10;
const RESTORE = 0.3;

const STROBE_HZ = 11;

const PLAYFIELD_W = 0.58;
const PLAYFIELD_D = 1.02;
const PLAYFIELD_TILT = Math.atan2(0.110, 0.970);

type Phase = 'idle' | 'blackout' | 'reveal' | 'flicker' | 'restore';

export type DemogorgonSetup = {
  root: THREE.Object3D;
  scene: THREE.Scene;
  camera: THREE.Camera;
  garlandLights: GarlandLights | null;
  bumperVisuals: BumperVisuals | null;
};

const _camPos = new THREE.Vector3();
const _lookTarget = new THREE.Vector3();

function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function easeIn(t: number): number {
  return t * t * t;
}

function strobeOn(t: number): boolean {
  return Math.sin(t * STROBE_HZ * Math.PI * 2) > 0;
}

export class DemogorgonReveal {
  private camera: THREE.Camera | null = null;
  private garlandLights: GarlandLights | null = null;
  private bumperVisuals: BumperVisuals | null = null;

  private playfieldShade: THREE.Mesh | null = null;
  private playfieldShadeMat: THREE.MeshBasicMaterial | null = null;
  private demogorgonSprite: THREE.Sprite | null = null;
  private demogorgonMat: THREE.SpriteMaterial | null = null;
  private flashLight: THREE.PointLight | null = null;

  private phase: Phase = 'idle';
  private elapsed = 0;
  private strobeT = 0;
  private imageReady = false;

  setup(config: DemogorgonSetup): void {
    this.dispose();
    this.camera = config.camera;
    this.garlandLights = config.garlandLights;
    this.bumperVisuals = config.bumperVisuals;

    this.playfieldShadeMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0,
      depthTest: true,
      depthWrite: false,
    });
    this.playfieldShade = new THREE.Mesh(
      new THREE.PlaneGeometry(PLAYFIELD_W, PLAYFIELD_D),
      this.playfieldShadeMat,
    );
    this.playfieldShade.rotation.x = -Math.PI / 2 + PLAYFIELD_TILT;
    this.playfieldShade.position.set(0, 1.062, -0.067);
    this.playfieldShade.renderOrder = 600;
    this.playfieldShade.visible = false;
    config.root.add(this.playfieldShade);

    this.demogorgonMat = new THREE.SpriteMaterial({
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.demogorgonSprite = new THREE.Sprite(this.demogorgonMat);
    this.demogorgonSprite.center.set(0.5, 0.35);
    this.demogorgonSprite.scale.set(0.55, 0.72, 1);
    this.demogorgonSprite.renderOrder = 950;
    this.demogorgonSprite.visible = false;
    config.scene.add(this.demogorgonSprite);

    this.flashLight = new THREE.PointLight(0xff1122, 0, 0.55, 2);
    this.flashLight.position.set(
      DEMOGORGON_SENSOR.x,
      DEMOGORGON_SENSOR.y + 0.12,
      DEMOGORGON_SENSOR.z,
    );
    config.root.add(this.flashLight);

    const loader = new THREE.TextureLoader();
    loader.load(
      TEXTURE_URL,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        if (this.demogorgonMat) {
          this.demogorgonMat.map = tex;
          this.demogorgonMat.needsUpdate = true;
        }
        this.imageReady = true;
      },
      undefined,
      () => {
        this.imageReady = true;
      },
    );
  }

  onGameEvent(event: GameEvent): void {
    if (event.type === 'DEMOGORGON_REVEAL') {
      if (this.phase !== 'idle') return;
      this.phase = 'blackout';
      this.elapsed = 0;
      this.strobeT = 0;
      if (this.playfieldShade) this.playfieldShade.visible = true;
      if (this.demogorgonSprite) this.demogorgonSprite.visible = true;
      return;
    }
    if (event.type === 'DRAIN') {
      this.resetAtmosphere();
    }
  }

  update(dt: number): void {
    this.syncDemogorgonScreen();

    if (this.phase === 'idle') {
      this.garlandLights?.setStrobe(false, false);
      this.bumperVisuals?.setStrobe(false, false);
      return;
    }

    this.elapsed += dt;
    this.strobeT += dt;

    const on = strobeOn(this.strobeT);
    const darkMix = this.phase === 'restore'
      ? 1 - easeIn(Math.min(1, this.elapsed / RESTORE))
      : 1;

    if (this.phase === 'blackout') {
      this.applyPlayfieldStrobe(on, false, darkMix * easeOut(Math.min(1, this.elapsed / BLACKOUT)));
      this.setDemogorgonOpacity(0);
      if (this.elapsed >= BLACKOUT) {
        this.phase = 'reveal';
        this.elapsed = 0;
      }
      return;
    }

    if (this.phase === 'reveal') {
      const t = Math.min(1, this.elapsed / REVEAL);
      this.applyPlayfieldStrobe(on, false, 1);
      this.setDemogorgonOpacity(this.imageReady && on ? easeOut(t) * 0.95 : 0);
      if (this.elapsed >= REVEAL) {
        this.phase = 'flicker';
        this.elapsed = 0;
        this.setDemogorgonOpacity(0);
        if (this.demogorgonSprite) this.demogorgonSprite.visible = false;
      }
      return;
    }

    if (this.phase === 'flicker') {
      this.applyPlayfieldStrobe(on, true, 1);
      this.setDemogorgonOpacity(0);
      if (this.elapsed >= FLICKER) {
        this.phase = 'restore';
        this.elapsed = 0;
      }
      return;
    }

    if (this.phase === 'restore') {
      if (darkMix <= 0) {
        this.resetAtmosphere();
        return;
      }
      this.applyPlayfieldStrobe(on, true, darkMix);
      this.setDemogorgonOpacity(0);
    }
  }

  dispose(): void {
    this.resetAtmosphere();

    if (this.playfieldShade) {
      this.playfieldShade.geometry.dispose();
      this.playfieldShade.parent?.remove(this.playfieldShade);
    }
    if (this.playfieldShadeMat) this.playfieldShadeMat.dispose();

    if (this.demogorgonMat) {
      this.demogorgonMat.map?.dispose();
      this.demogorgonMat.dispose();
    }
    if (this.demogorgonSprite) this.demogorgonSprite.parent?.remove(this.demogorgonSprite);

    if (this.flashLight) {
      this.flashLight.dispose();
      this.flashLight.parent?.remove(this.flashLight);
    }

    this.camera = null;
    this.garlandLights = null;
    this.bumperVisuals = null;
    this.playfieldShade = null;
    this.playfieldShadeMat = null;
    this.demogorgonSprite = null;
    this.demogorgonMat = null;
    this.flashLight = null;
    this.phase = 'idle';
    this.elapsed = 0;
    this.imageReady = false;
  }

  private syncDemogorgonScreen(): void {
    if (!this.camera || !this.demogorgonSprite || !this.demogorgonSprite.visible) return;

    this.camera.getWorldPosition(_camPos);
    this.camera.getWorldDirection(_lookTarget);
    _lookTarget.normalize();

    this.demogorgonSprite.position.copy(_camPos).addScaledVector(_lookTarget, 0.38);
    this.demogorgonSprite.position.y += 0.06;
    this.demogorgonSprite.quaternion.copy(this.camera.quaternion);
  }

  private applyPlayfieldStrobe(on: boolean, fullMap: boolean, mix: number): void {
    if (!this.playfieldShadeMat) return;

    const active = mix > 0.02;
    const shadeOpacity = on
      ? (fullMap ? 0 : 0.12) * mix
      : 0.94 * mix;

    this.playfieldShadeMat.opacity = THREE.MathUtils.clamp(shadeOpacity, 0, 0.96);
    if (this.playfieldShade) this.playfieldShade.visible = active;

    if (this.flashLight) {
      this.flashLight.intensity = on && !fullMap ? 2.8 * mix : 0;
    }

    this.garlandLights?.setStrobe(active, on, fullMap);
    this.bumperVisuals?.setStrobe(active, on, fullMap);
  }

  private setDemogorgonOpacity(opacity: number): void {
    if (this.demogorgonMat) {
      this.demogorgonMat.opacity = THREE.MathUtils.clamp(opacity, 0, 1);
    }
  }

  private resetAtmosphere(): void {
    this.phase = 'idle';
    this.elapsed = 0;
    this.strobeT = 0;

    if (this.flashLight) this.flashLight.intensity = 0;

    if (this.playfieldShade) this.playfieldShade.visible = false;
    if (this.playfieldShadeMat) this.playfieldShadeMat.opacity = 0;

    if (this.demogorgonSprite) this.demogorgonSprite.visible = false;
    if (this.demogorgonMat) this.demogorgonMat.opacity = 0;

    this.garlandLights?.setStrobe(false, false);
    this.bumperVisuals?.setStrobe(false, false);
  }
}
