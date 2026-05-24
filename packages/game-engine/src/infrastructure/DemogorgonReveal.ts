import * as THREE from 'three';
import type { GameEvent } from '../domain/GameEvents';
import { DEMOGORGON_SENSOR } from '../domain/Ball';
import type { GarlandLights } from './GarlandLights';

const TEXTURE_URL = '/playfield/demogorgon.png';

const BLACKOUT = 0.12;
const REVEAL = 0.22;
const HOLD = 0.42;
const RESTORE = 0.24;

const STROBE_HZ = 11;
const FOG_DENSITY = 4.5;
const BASE_EXPOSURE = 1.45;
const DARK_EXPOSURE = 0.04;

type Phase = 'idle' | 'blackout' | 'reveal' | 'hold' | 'restore';

type SceneLights = {
  ambient: THREE.AmbientLight;
  hemisphere: THREE.HemisphereLight;
  directional: THREE.DirectionalLight;
  fill: THREE.DirectionalLight;
};

export type DemogorgonSetup = {
  root: THREE.Object3D;
  scene: THREE.Scene;
  camera: THREE.Camera;
  renderer: THREE.WebGLRenderer;
  lights: SceneLights;
  garlandLights: GarlandLights | null;
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
  private scene: THREE.Scene | null = null;
  private camera: THREE.Camera | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private lights: SceneLights | null = null;
  private garlandLights: GarlandLights | null = null;

  private lightBase = { ambient: 0, hemi: 0, dir: 0, fill: 0 };
  private sceneBackground: THREE.Color | null = null;
  private fog: THREE.FogExp2 | null = null;

  private overlay: THREE.Mesh | null = null;
  private overlayMat: THREE.MeshBasicMaterial | null = null;
  private sprite: THREE.Sprite | null = null;
  private spriteMat: THREE.SpriteMaterial | null = null;
  private flashLight: THREE.PointLight | null = null;

  private phase: Phase = 'idle';
  private elapsed = 0;
  private strobeT = 0;
  private imageReady = false;

  setup(config: DemogorgonSetup): void {
    this.dispose();
    this.scene = config.scene;
    this.camera = config.camera;
    this.renderer = config.renderer;
    this.lights = config.lights;
    this.garlandLights = config.garlandLights;

    this.lightBase = {
      ambient: config.lights.ambient.intensity,
      hemi: config.lights.hemisphere.intensity,
      dir: config.lights.directional.intensity,
      fill: config.lights.fill.intensity,
    };

    if (config.scene.background instanceof THREE.Color) {
      this.sceneBackground = config.scene.background.clone();
    } else {
      this.sceneBackground = new THREE.Color(0x000000);
    }

    this.fog = new THREE.FogExp2(0x120008, 0);
    config.scene.fog = this.fog;

    const overlayGeo = new THREE.PlaneGeometry(4, 4);
    this.overlayMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
    });
    this.overlay = new THREE.Mesh(overlayGeo, this.overlayMat);
    this.overlay.renderOrder = 900;
    this.overlay.visible = false;
    config.scene.add(this.overlay);

    this.spriteMat = new THREE.SpriteMaterial({
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.sprite = new THREE.Sprite(this.spriteMat);
    this.sprite.center.set(0.5, 0.35);
    this.sprite.scale.set(0.55, 0.72, 1);
    this.sprite.renderOrder = 950;
    this.sprite.visible = false;
    config.scene.add(this.sprite);

    this.flashLight = new THREE.PointLight(0xff1122, 0, 1.8, 2);
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
        if (this.spriteMat) {
          this.spriteMat.map = tex;
          this.spriteMat.needsUpdate = true;
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
      if (this.overlay) this.overlay.visible = true;
      if (this.sprite) this.sprite.visible = true;
      return;
    }
    if (event.type === 'DRAIN') {
      this.resetAtmosphere();
    }
  }

  update(dt: number): void {
    this.syncHud();

    if (this.phase === 'idle') {
      this.garlandLights?.setStrobe(false, false);
      return;
    }

    this.elapsed += dt;
    this.strobeT += dt;

    const on = strobeOn(this.strobeT);
    const darkMix = this.phase === 'restore'
      ? 1 - easeIn(Math.min(1, this.elapsed / RESTORE))
      : 1;

    if (this.phase === 'blackout') {
      this.applyStrobe(on, darkMix * easeOut(Math.min(1, this.elapsed / BLACKOUT)));
      this.setSpriteOpacity(0);
      if (this.elapsed >= BLACKOUT) {
        this.phase = 'reveal';
        this.elapsed = 0;
      }
      return;
    }

    if (this.phase === 'reveal') {
      const t = Math.min(1, this.elapsed / REVEAL);
      this.applyStrobe(on, 1);
      this.setSpriteOpacity(this.imageReady && on ? easeOut(t) * 0.95 : 0);
      if (this.elapsed >= REVEAL) {
        this.phase = 'hold';
        this.elapsed = 0;
      }
      return;
    }

    if (this.phase === 'hold') {
      this.applyStrobe(on, 1);
      this.setSpriteOpacity(this.imageReady && on ? 0.95 : 0);
      if (this.elapsed >= HOLD) {
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
      this.applyStrobe(on, darkMix);
      this.setSpriteOpacity(this.imageReady && on ? 0.95 * darkMix : 0);
    }
  }

  dispose(): void {
    this.resetAtmosphere();

    if (this.overlay) {
      this.overlay.geometry.dispose();
      this.overlay.parent?.remove(this.overlay);
    }
    if (this.overlayMat) this.overlayMat.dispose();

    if (this.spriteMat) {
      this.spriteMat.map?.dispose();
      this.spriteMat.dispose();
    }
    if (this.sprite) this.sprite.parent?.remove(this.sprite);

    if (this.flashLight) {
      this.flashLight.dispose();
      this.flashLight.parent?.remove(this.flashLight);
    }

    if (this.scene) this.scene.fog = null;

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.lights = null;
    this.garlandLights = null;
    this.overlay = null;
    this.overlayMat = null;
    this.sprite = null;
    this.spriteMat = null;
    this.flashLight = null;
    this.phase = 'idle';
    this.elapsed = 0;
    this.imageReady = false;
  }

  private syncHud(): void {
    if (!this.camera || !this.overlay || !this.sprite) return;

    this.camera.getWorldPosition(_camPos);
    this.camera.getWorldDirection(_lookTarget);
    _lookTarget.normalize();

    this.overlay.position.copy(_camPos).addScaledVector(_lookTarget, 0.35);
    this.overlay.quaternion.copy(this.camera.quaternion);

    this.sprite.position.copy(_camPos).addScaledVector(_lookTarget, 0.38);
    this.sprite.position.y += 0.06;
    this.sprite.quaternion.copy(this.camera.quaternion);
  }

  private applyStrobe(on: boolean, darkMix: number): void {
    if (!this.lights || !this.renderer || !this.scene) return;

    const flashMul = on ? 0.28 * darkMix : 0;
    this.lights.ambient.intensity = this.lightBase.ambient * flashMul;
    this.lights.hemisphere.intensity = this.lightBase.hemi * flashMul;
    this.lights.directional.intensity = this.lightBase.dir * flashMul;
    this.lights.fill.intensity = this.lightBase.fill * flashMul;

    this.renderer.toneMappingExposure = on
      ? BASE_EXPOSURE * 0.22 * darkMix + DARK_EXPOSURE
      : DARK_EXPOSURE;

    if (this.sceneBackground) {
      this.scene.background = this.sceneBackground.clone().lerp(
        new THREE.Color(0x000000),
        darkMix,
      );
    }

    if (this.fog) {
      this.fog.density = FOG_DENSITY * darkMix * (on ? 0.5 : 1.2);
      this.fog.color.setHex(on ? 0x440010 : 0x000000);
    }

    if (this.flashLight) {
      this.flashLight.intensity = on ? 3.5 * darkMix : 0;
    }

    this.setOverlayOpacity(on ? 0.35 * darkMix : 0.88 * darkMix);
    this.garlandLights?.setStrobe(darkMix > 0.05, on);
  }

  private setOverlayOpacity(opacity: number): void {
    if (this.overlayMat) this.overlayMat.opacity = THREE.MathUtils.clamp(opacity, 0, 0.95);
  }

  private setSpriteOpacity(opacity: number): void {
    if (this.spriteMat) this.spriteMat.opacity = THREE.MathUtils.clamp(opacity, 0, 1);
  }

  private resetAtmosphere(): void {
    this.phase = 'idle';
    this.elapsed = 0;
    this.strobeT = 0;

    if (this.lights) {
      this.lights.ambient.intensity = this.lightBase.ambient;
      this.lights.hemisphere.intensity = this.lightBase.hemi;
      this.lights.directional.intensity = this.lightBase.dir;
      this.lights.fill.intensity = this.lightBase.fill;
    }

    if (this.renderer) {
      this.renderer.toneMappingExposure = BASE_EXPOSURE;
    }

    if (this.scene && this.sceneBackground) {
      this.scene.background = this.sceneBackground.clone();
    }

    if (this.fog) this.fog.density = 0;

    if (this.flashLight) this.flashLight.intensity = 0;

    if (this.overlay) this.overlay.visible = false;
    if (this.overlayMat) this.overlayMat.opacity = 0;

    if (this.sprite) this.sprite.visible = false;
    if (this.spriteMat) this.spriteMat.opacity = 0;

    this.garlandLights?.setStrobe(false, false);
  }
}
