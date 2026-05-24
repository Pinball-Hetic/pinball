import * as THREE from 'three';
import type { GameEvent, GameEventListener } from '../domain/GameEvents';
import {
  DEMOGORGON_SENSOR,
  DEMOGORGON_TARGET,
  DEMOGORGON_TARGET_HITS,
  ELEVEN_ASSIST_SCORE,
  ELEVEN_ASSIST_INTERVAL,
} from '../domain/Ball';
import type { GarlandLights } from './GarlandLights';
import type { BumperVisuals } from './BumperVisuals';

const TEXTURE_URL = '/playfield/demogorgon.png';

const BLACKOUT = 0.12;
const REVEAL = 0.5;
const RESTORE = 0.3;
const TARGET_HIT_FLASH = 0.18;
const VICTORY = 0.65;
const ELEVEN_ASSIST_ANIM = 0.85;
const ELEVEN_ASSIST_FIRST = 0.55;

const STROBE_HZ = 11;

const PLAYFIELD_W = 0.58;
const PLAYFIELD_D = 1.02;
const PLAYFIELD_TILT = Math.atan2(0.110, 0.970);

type Phase = 'idle' | 'blackout' | 'reveal' | 'flicker' | 'victory' | 'restore';

export type DemogorgonSetup = {
  root: THREE.Object3D;
  scene: THREE.Scene;
  camera: THREE.Camera;
  garlandLights: GarlandLights | null;
  bumperVisuals: BumperVisuals | null;
  onFightEnd?: () => void;
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
  private onFightEnd: (() => void) | null = null;
  private emit: GameEventListener | null = null;

  private playfieldShade: THREE.Mesh | null = null;
  private playfieldShadeMat: THREE.MeshBasicMaterial | null = null;
  private demogorgonSprite: THREE.Sprite | null = null;
  private demogorgonMat: THREE.SpriteMaterial | null = null;
  private flashLight: THREE.PointLight | null = null;
  private targetGroup: THREE.Group | null = null;
  private targetRingMat: THREE.MeshStandardMaterial | null = null;
  private targetCoreMat: THREE.MeshStandardMaterial | null = null;
  private targetLight: THREE.PointLight | null = null;
  private victoryBurst: THREE.Mesh | null = null;
  private victoryBurstMat: THREE.MeshBasicMaterial | null = null;
  private elevenBeam: THREE.Mesh | null = null;
  private elevenBeamMat: THREE.MeshBasicMaterial | null = null;
  private elevenPulse: THREE.Mesh | null = null;
  private elevenPulseMat: THREE.MeshBasicMaterial | null = null;
  private ownedGeos: THREE.BufferGeometry[] = [];
  private ownedMats: THREE.Material[] = [];

  private phase: Phase = 'idle';
  private elapsed = 0;
  private strobeT = 0;
  private pulseT = 0;
  private targetHitFlash = 0;
  private imageReady = false;
  private assistNextIn = ELEVEN_ASSIST_FIRST;
  private elevenAssistActive = false;
  private elevenAssistT = 0;

  setEmit(listener: GameEventListener): void {
    this.emit = listener;
  }

  setup(config: DemogorgonSetup): void {
    this.dispose();
    this.camera = config.camera;
    this.garlandLights = config.garlandLights;
    this.bumperVisuals = config.bumperVisuals;
    this.onFightEnd = config.onFightEnd ?? null;

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

    this.targetGroup = this.buildTargetMesh();
    this.targetGroup.position.set(
      DEMOGORGON_TARGET.x,
      DEMOGORGON_TARGET.y + 0.018,
      DEMOGORGON_TARGET.z,
    );
    this.targetGroup.rotation.x = PLAYFIELD_TILT;
    this.targetGroup.visible = false;
    config.root.add(this.targetGroup);

    this.flashLight = new THREE.PointLight(0xff1122, 0, 0.55, 2);
    this.flashLight.position.set(
      DEMOGORGON_SENSOR.x,
      DEMOGORGON_SENSOR.y + 0.12,
      DEMOGORGON_SENSOR.z,
    );
    config.root.add(this.flashLight);

    this.elevenBeamMat = new THREE.MeshBasicMaterial({
      color: 0x66ccff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      toneMapped: false,
      blending: THREE.AdditiveBlending,
    });
    this.elevenBeam = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.018), this.elevenBeamMat);
    this.elevenBeam.rotation.x = -Math.PI / 2 + PLAYFIELD_TILT;
    this.elevenBeam.renderOrder = 620;
    this.elevenBeam.visible = false;
    config.root.add(this.elevenBeam);
    this.ownedGeos.push(this.elevenBeam.geometry);
    this.ownedMats.push(this.elevenBeamMat);

    this.elevenPulseMat = new THREE.MeshBasicMaterial({
      color: 0xaaddff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
      blending: THREE.AdditiveBlending,
    });
    this.elevenPulse = new THREE.Mesh(new THREE.RingGeometry(0.02, 0.05, 24), this.elevenPulseMat);
    this.elevenPulse.rotation.x = -Math.PI / 2;
    this.elevenPulse.position.set(DEMOGORGON_TARGET.x, DEMOGORGON_TARGET.y + 0.02, DEMOGORGON_TARGET.z);
    this.elevenPulse.renderOrder = 630;
    this.elevenPulse.visible = false;
    config.root.add(this.elevenPulse);
    this.ownedGeos.push(this.elevenPulse.geometry);
    this.ownedMats.push(this.elevenPulseMat);

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
      this.pulseT = 0;
      this.assistNextIn = ELEVEN_ASSIST_FIRST;
      this.elevenAssistActive = false;
      this.elevenAssistT = 0;
      if (this.playfieldShade) this.playfieldShade.visible = true;
      if (this.demogorgonSprite) this.demogorgonSprite.visible = true;
      if (this.targetGroup) this.targetGroup.visible = true;
      return;
    }
    if (event.type === 'DEMOGORGON_TARGET_HIT') {
      if (this.phase === 'idle' || this.phase === 'restore' || this.phase === 'victory') return;
      this.targetHitFlash = TARGET_HIT_FLASH;
      if (event.hitCount >= DEMOGORGON_TARGET_HITS) {
        this.beginVictory();
      }
      return;
    }
    if (event.type === 'DRAIN') {
      this.resetAtmosphere();
    }
  }

  update(dt: number): void {
    this.syncDemogorgonScreen();
    if (this.targetHitFlash > 0) this.targetHitFlash = Math.max(0, this.targetHitFlash - dt);
    this.updateTargetPulse(dt);

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
        this.assistNextIn = ELEVEN_ASSIST_FIRST;
        this.setDemogorgonOpacity(0);
        if (this.demogorgonSprite) this.demogorgonSprite.visible = false;
      }
      return;
    }

    if (this.phase === 'flicker') {
      this.applyPlayfieldStrobe(on, true, 1);
      this.setDemogorgonOpacity(0);
      if (!this.elevenAssistActive) {
        this.assistNextIn -= dt;
        if (this.assistNextIn <= 0) this.triggerElevenAssist();
      }
      this.updateElevenAssist(dt);
      return;
    }

    if (this.phase === 'victory') {
      const t = Math.min(1, this.elapsed / VICTORY);
      this.applyVictoryLight();
      this.updateVictoryAnim(t);
      if (t >= 1) {
        this.beginRestore();
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

    if (this.elevenBeam) this.elevenBeam.parent?.remove(this.elevenBeam);
    if (this.elevenPulse) this.elevenPulse.parent?.remove(this.elevenPulse);

    if (this.targetGroup) this.targetGroup.parent?.remove(this.targetGroup);
    for (const g of this.ownedGeos) g.dispose();
    for (const m of this.ownedMats) m.dispose();
    this.ownedGeos = [];
    this.ownedMats = [];

    if (this.flashLight) {
      this.flashLight.dispose();
      this.flashLight.parent?.remove(this.flashLight);
    }

    this.camera = null;
    this.garlandLights = null;
    this.bumperVisuals = null;
    this.onFightEnd = null;
    this.emit = null;
    this.playfieldShade = null;
    this.playfieldShadeMat = null;
    this.demogorgonSprite = null;
    this.demogorgonMat = null;
    this.flashLight = null;
    this.targetGroup = null;
    this.targetRingMat = null;
    this.targetCoreMat = null;
    this.targetLight = null;
    this.victoryBurst = null;
    this.victoryBurstMat = null;
    this.elevenBeam = null;
    this.elevenBeamMat = null;
    this.elevenPulse = null;
    this.elevenPulseMat = null;
    this.phase = 'idle';
    this.elapsed = 0;
    this.imageReady = false;
  }

  private buildTargetMesh(): THREE.Group {
    const group = new THREE.Group();

    const ringGeo = new THREE.TorusGeometry(0.032, 0.004, 8, 24);
    this.targetRingMat = new THREE.MeshStandardMaterial({
      color: 0xff2244,
      emissive: 0xff1133,
      emissiveIntensity: 1.6,
      metalness: 0.4,
      roughness: 0.35,
    });
    const ring = new THREE.Mesh(ringGeo, this.targetRingMat);
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
    this.ownedGeos.push(ringGeo);
    this.ownedMats.push(this.targetRingMat);

    const coreGeo = new THREE.CircleGeometry(0.014, 16);
    this.targetCoreMat = new THREE.MeshStandardMaterial({
      color: 0xffeedd,
      emissive: 0xff4422,
      emissiveIntensity: 1.2,
      metalness: 0.2,
      roughness: 0.4,
      side: THREE.DoubleSide,
    });
    const core = new THREE.Mesh(coreGeo, this.targetCoreMat);
    core.rotation.x = -Math.PI / 2;
    group.add(core);
    this.ownedGeos.push(coreGeo);
    this.ownedMats.push(this.targetCoreMat);

    this.targetLight = new THREE.PointLight(0xff2244, 0.45, 0.18, 2);
    this.targetLight.position.y = 0.02;
    group.add(this.targetLight);

    const burstGeo = new THREE.RingGeometry(0.02, 0.038, 24);
    this.victoryBurstMat = new THREE.MeshBasicMaterial({
      color: 0xffee55,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    this.victoryBurst = new THREE.Mesh(burstGeo, this.victoryBurstMat);
    this.victoryBurst.rotation.x = -Math.PI / 2;
    group.add(this.victoryBurst);
    this.ownedGeos.push(burstGeo);
    this.ownedMats.push(this.victoryBurstMat);

    return group;
  }

  private updateTargetPulse(dt: number): void {
    if (!this.targetGroup?.visible || this.phase === 'victory') return;
    this.pulseT += dt;
    const hitBoost = this.targetHitFlash > 0 ? 1.8 : 1;
    const pulse = (0.75 + Math.sin(this.pulseT * 8) * 0.25) * hitBoost;
    if (this.targetRingMat) this.targetRingMat.emissiveIntensity = 1.6 * pulse;
    if (this.targetCoreMat) this.targetCoreMat.emissiveIntensity = 1.2 * pulse;
    if (this.targetLight) this.targetLight.intensity = 0.45 * pulse;
    this.targetGroup.rotation.z = Math.sin(this.pulseT * 3) * 0.08;
    const scale = 1 + (this.targetHitFlash / TARGET_HIT_FLASH) * 0.25;
    this.targetGroup.scale.setScalar(scale);
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

  private triggerElevenAssist(): void {
    this.elevenAssistActive = true;
    this.elevenAssistT = 0;
    this.assistNextIn = ELEVEN_ASSIST_INTERVAL;
    if (this.elevenBeam) this.elevenBeam.visible = true;
    if (this.elevenPulse) this.elevenPulse.visible = true;
    this.emit?.({ type: 'ELEVEN_ASSIST', scoreIncrement: ELEVEN_ASSIST_SCORE });
  }

  private updateElevenAssist(dt: number): void {
    if (!this.elevenAssistActive) return;

    this.elevenAssistT += dt;
    const t = Math.min(1, this.elevenAssistT / ELEVEN_ASSIST_ANIM);
    const rise = easeOut(t);
    const fade = easeIn(t);
    const alpha = t < 0.25 ? rise / 0.25 : 1 - fade;

    const beamX = -0.22 + rise * (DEMOGORGON_TARGET.x + 0.22);
    if (this.elevenBeam) {
      this.elevenBeam.position.set(beamX, DEMOGORGON_TARGET.y + 0.022, DEMOGORGON_TARGET.z);
      this.elevenBeam.scale.set(0.4 + rise * 1.4, 1, 1);
    }
    if (this.elevenBeamMat) this.elevenBeamMat.opacity = alpha * 0.75;

    if (this.elevenPulse) this.elevenPulse.scale.setScalar(1 + rise * 3.5);
    if (this.elevenPulseMat) this.elevenPulseMat.opacity = (1 - fade) * 0.85;

    if (t >= 1) {
      this.elevenAssistActive = false;
      if (this.elevenBeam) this.elevenBeam.visible = false;
      if (this.elevenPulse) this.elevenPulse.visible = false;
      if (this.elevenBeamMat) this.elevenBeamMat.opacity = 0;
      if (this.elevenPulseMat) this.elevenPulseMat.opacity = 0;
      if (this.elevenPulse) this.elevenPulse.scale.setScalar(1);
    }
  }

  private beginVictory(): void {
    this.elevenAssistActive = false;
    if (this.elevenBeam) this.elevenBeam.visible = false;
    if (this.elevenPulse) this.elevenPulse.visible = false;
    this.phase = 'victory';
    this.elapsed = 0;
    this.setDemogorgonOpacity(0);
    if (this.demogorgonSprite) this.demogorgonSprite.visible = false;
    if (this.targetGroup) this.targetGroup.visible = true;
  }

  private beginRestore(): void {
    this.phase = 'restore';
    this.elapsed = 0;
    this.setDemogorgonOpacity(0);
    if (this.demogorgonSprite) this.demogorgonSprite.visible = false;
    if (this.targetGroup) {
      this.targetGroup.visible = false;
      this.targetGroup.scale.setScalar(1);
      this.targetGroup.rotation.z = 0;
    }
    this.resetTargetMaterials();
  }

  private applyVictoryLight(): void {
    if (this.playfieldShadeMat) this.playfieldShadeMat.opacity = 0;
    if (this.playfieldShade) this.playfieldShade.visible = false;
    if (this.flashLight) this.flashLight.intensity = 0;
    this.garlandLights?.setStrobe(false, false);
    this.bumperVisuals?.setStrobe(false, false);
  }

  private updateVictoryAnim(t: number): void {
    const pop = easeOut(t);
    const fade = easeIn(t);

    if (this.targetGroup) {
      this.targetGroup.scale.setScalar(1 + pop * 2.2);
      this.targetGroup.rotation.z = pop * Math.PI * 2;
    }

    if (this.targetRingMat) {
      this.targetRingMat.transparent = true;
      this.targetRingMat.opacity = 1 - fade;
      this.targetRingMat.emissive.setHex(0xffdd44);
      this.targetRingMat.emissiveIntensity = 3.5 * (1 - fade * 0.6);
      this.targetRingMat.color.setHex(0xffeeaa);
    }

    if (this.targetCoreMat) {
      this.targetCoreMat.transparent = true;
      this.targetCoreMat.opacity = 1 - fade;
      this.targetCoreMat.emissive.setHex(0xffffff);
      this.targetCoreMat.emissiveIntensity = 4 * (1 - fade * 0.5);
    }

    if (this.targetLight) {
      this.targetLight.color.setHex(0xffee88);
      this.targetLight.intensity = 1.6 * (1 - fade);
    }

    if (this.victoryBurst && this.victoryBurstMat) {
      const burstT = Math.min(1, t * 1.35);
      const burstFade = easeIn(burstT);
      this.victoryBurst.scale.setScalar(1 + burstFade * 4.5);
      this.victoryBurstMat.opacity = (1 - burstFade) * 0.95;
    }
  }

  private resetTargetMaterials(): void {
    if (this.targetRingMat) {
      this.targetRingMat.transparent = false;
      this.targetRingMat.opacity = 1;
      this.targetRingMat.emissive.setHex(0xff1133);
      this.targetRingMat.emissiveIntensity = 1.6;
      this.targetRingMat.color.setHex(0xff2244);
    }
    if (this.targetCoreMat) {
      this.targetCoreMat.transparent = false;
      this.targetCoreMat.opacity = 1;
      this.targetCoreMat.emissive.setHex(0xff4422);
      this.targetCoreMat.emissiveIntensity = 1.2;
      this.targetCoreMat.color.setHex(0xffeedd);
    }
    if (this.targetLight) {
      this.targetLight.color.setHex(0xff2244);
      this.targetLight.intensity = 0.45;
    }
    if (this.victoryBurst) this.victoryBurst.scale.setScalar(1);
    if (this.victoryBurstMat) this.victoryBurstMat.opacity = 0;
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
    const wasActive = this.phase !== 'idle';
    this.phase = 'idle';
    this.elapsed = 0;
    this.strobeT = 0;
    this.pulseT = 0;
    this.assistNextIn = ELEVEN_ASSIST_FIRST;
    this.elevenAssistActive = false;
    this.elevenAssistT = 0;

    if (this.flashLight) this.flashLight.intensity = 0;

    if (this.playfieldShade) this.playfieldShade.visible = false;
    if (this.playfieldShadeMat) this.playfieldShadeMat.opacity = 0;

    if (this.demogorgonSprite) this.demogorgonSprite.visible = false;
    if (this.demogorgonMat) this.demogorgonMat.opacity = 0;

    if (this.elevenBeam) this.elevenBeam.visible = false;
    if (this.elevenPulse) this.elevenPulse.visible = false;
    if (this.elevenBeamMat) this.elevenBeamMat.opacity = 0;

    if (this.targetGroup) {
      this.targetGroup.visible = false;
      this.targetGroup.scale.setScalar(1);
      this.targetGroup.rotation.z = 0;
    }
    this.resetTargetMaterials();

    this.garlandLights?.setStrobe(false, false);
    this.bumperVisuals?.setStrobe(false, false);

    if (wasActive) this.onFightEnd?.();
  }
}
