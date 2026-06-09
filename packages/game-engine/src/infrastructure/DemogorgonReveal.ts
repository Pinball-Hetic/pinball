import * as THREE from 'three';
import type { GameEvent, GameEventListener } from '../domain/GameEvents';
import {
  DEMOGORGON_SENSOR,
  DEMOGORGON_TARGET,
  DEMOGORGON_TARGET_HITS,
  ELEVEN_ASSIST_SCORE,
  ELEVEN_ASSIST_INTERVAL,
} from '../domain/Ball';
import { easeIn, easeOut, strobeOn } from './CinematicEasing';
import { CameraBillboardSprite } from './CameraBillboardSprite';
import { DemogorgonTargetVisual } from './DemogorgonTargetVisual';
import type { GarlandLights } from './GarlandLights';
import type { BumperVisuals } from './BumperVisuals';
import { PlayfieldCinematicStrobe } from './PlayfieldCinematicStrobe';

const TEXTURE_URL = '/playfield/demogorgon.png';

const BLACKOUT = 0.12;
const REVEAL = 0.5;
const RESTORE = 0.3;
const TARGET_HIT_FLASH = 0.18;
const VICTORY = 0.65;
const ELEVEN_ASSIST_ANIM = 0.85;
const ELEVEN_ASSIST_FIRST = 0.55;

const STROBE_HZ = 11;

type Phase = 'idle' | 'blackout' | 'reveal' | 'flicker' | 'victory' | 'restore';

export type DemogorgonSetup = {
  root: THREE.Object3D;
  scene: THREE.Scene;
  camera: THREE.Camera;
  garlandLights: GarlandLights | null;
  bumperVisuals: BumperVisuals | null;
  onFightEnd?: () => void;
  onTargetReady?: () => void;
};

export class DemogorgonReveal {
  private camera: THREE.Camera | null = null;
  private garlandLights: GarlandLights | null = null;
  private bumperVisuals: BumperVisuals | null = null;
  private onFightEnd: (() => void) | null = null;
  private onTargetReady: (() => void) | null = null;
  private emit: GameEventListener | null = null;

  private cinematicStrobe = new PlayfieldCinematicStrobe();
  private billboard = new CameraBillboardSprite();
  private targetVisual = new DemogorgonTargetVisual();
  private elevenShockOuter: THREE.Mesh | null = null;
  private elevenShockOuterMat: THREE.MeshBasicMaterial | null = null;
  private elevenShockInner: THREE.Mesh | null = null;
  private elevenShockInnerMat: THREE.MeshBasicMaterial | null = null;
  private elevenAssistLight: THREE.PointLight | null = null;
  private ownedGeos: THREE.BufferGeometry[] = [];
  private ownedMats: THREE.Material[] = [];

  private phase: Phase = 'idle';
  private elapsed = 0;
  private strobeT = 0;
  private pulseT = 0;
  private targetHitFlash = 0;
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
    this.onTargetReady = config.onTargetReady ?? null;

    this.cinematicStrobe.mount(config.root, config.garlandLights, config.bumperVisuals, {
      flashColor: 0xff1122,
      flashIntensity: 2.8,
      flashPosition: new THREE.Vector3(
        DEMOGORGON_SENSOR.x,
        DEMOGORGON_SENSOR.y + 0.12,
        DEMOGORGON_SENSOR.z,
      ),
    });

    this.billboard.mount(config.scene, config.camera, { textureUrl: TEXTURE_URL });
    this.targetVisual.mount(config.root);

    const assistY = DEMOGORGON_TARGET.y + 0.021;

    this.elevenAssistLight = new THREE.PointLight(0xbb55ff, 0, 0.32, 0.3);
    this.elevenAssistLight.position.set(DEMOGORGON_TARGET.x, DEMOGORGON_TARGET.y + 0.045, DEMOGORGON_TARGET.z);
    config.root.add(this.elevenAssistLight);

    this.elevenShockOuterMat = new THREE.MeshBasicMaterial({
      color: 0x9933dd,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
      blending: THREE.AdditiveBlending,
    });
    this.elevenShockOuter = new THREE.Mesh(new THREE.RingGeometry(0.024, 0.038, 32), this.elevenShockOuterMat);
    this.elevenShockOuter.rotation.x = -Math.PI / 2;
    this.elevenShockOuter.position.set(DEMOGORGON_TARGET.x, assistY, DEMOGORGON_TARGET.z);
    this.elevenShockOuter.renderOrder = 620;
    this.elevenShockOuter.visible = false;
    config.root.add(this.elevenShockOuter);
    this.ownedGeos.push(this.elevenShockOuter.geometry);
    this.ownedMats.push(this.elevenShockOuterMat);

    this.elevenShockInnerMat = new THREE.MeshBasicMaterial({
      color: 0xffeeff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
      blending: THREE.AdditiveBlending,
    });
    this.elevenShockInner = new THREE.Mesh(new THREE.RingGeometry(0.008, 0.018, 24), this.elevenShockInnerMat);
    this.elevenShockInner.rotation.x = -Math.PI / 2;
    this.elevenShockInner.position.set(DEMOGORGON_TARGET.x, assistY + 0.001, DEMOGORGON_TARGET.z);
    this.elevenShockInner.renderOrder = 625;
    this.elevenShockInner.visible = false;
    config.root.add(this.elevenShockInner);
    this.ownedGeos.push(this.elevenShockInner.geometry);
    this.ownedMats.push(this.elevenShockInnerMat);
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
      this.billboard.show();
      return;
    }
    if (event.type === 'DEMOGORGON_TARGET_HIT') {
      if (this.phase === 'idle' || this.phase === 'restore' || this.phase === 'victory') return;
      this.targetHitFlash = TARGET_HIT_FLASH;
      this.targetVisual.playHit();
      if (event.hitCount >= DEMOGORGON_TARGET_HITS) {
        this.beginVictory();
      }
      return;
    }
    if (event.type === 'DRAIN' || event.type === 'BOTTOM_OUT') {
      this.resetAtmosphere();
    }
  }

  update(dt: number): void {
    this.billboard.sync();
    this.targetVisual.update(dt);
    if (this.targetHitFlash > 0) this.targetHitFlash = Math.max(0, this.targetHitFlash - dt);

    if (this.phase === 'idle') {
      this.garlandLights?.setStrobe(false, false);
      this.bumperVisuals?.setStrobe(false, false);
      return;
    }

    this.elapsed += dt;
    this.strobeT += dt;
    this.pulseT += dt;

    const pulseActive = this.phase === 'flicker' || this.phase === 'victory';
    this.targetVisual.updatePulse(
      this.pulseT,
      this.targetHitFlash,
      TARGET_HIT_FLASH,
      pulseActive,
    );

    const on = strobeOn(this.strobeT, STROBE_HZ);
    const darkMix = this.phase === 'restore'
      ? 1 - easeIn(Math.min(1, this.elapsed / RESTORE))
      : 1;

    if (this.phase === 'blackout') {
      this.cinematicStrobe.apply(on, false, darkMix * easeOut(Math.min(1, this.elapsed / BLACKOUT)));
      this.billboard.setOpacity(0);
      if (this.elapsed >= BLACKOUT) {
        this.phase = 'reveal';
        this.elapsed = 0;
      }
      return;
    }

    if (this.phase === 'reveal') {
      const t = Math.min(1, this.elapsed / REVEAL);
      this.cinematicStrobe.apply(on, false, 1);
      this.billboard.setOpacity(this.billboard.isReady() && on ? easeOut(t) * 0.95 : 0);
      if (this.elapsed >= REVEAL) {
        this.phase = 'flicker';
        this.elapsed = 0;
        this.assistNextIn = ELEVEN_ASSIST_FIRST;
        this.billboard.setOpacity(0);
        this.billboard.hide();
        this.targetVisual.show();
        this.onTargetReady?.();
      }
      return;
    }

    if (this.phase === 'flicker') {
      this.cinematicStrobe.apply(on, true, 1);
      this.billboard.setOpacity(0);
      if (!this.elevenAssistActive) {
        this.assistNextIn -= dt;
        if (this.assistNextIn <= 0) this.triggerElevenAssist();
      }
      this.updateElevenAssist(dt);
      return;
    }

    if (this.phase === 'victory') {
      const t = Math.min(1, this.elapsed / VICTORY);
      this.cinematicStrobe.stop();
      this.targetVisual.updateVictory(t, easeOut, easeIn);
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
      this.cinematicStrobe.apply(on, true, darkMix);
      this.billboard.setOpacity(0);
    }
  }

  dispose(): void {
    this.resetAtmosphere();

    this.cinematicStrobe.dispose();
    this.billboard.dispose();
    this.targetVisual.dispose();

    if (this.elevenShockOuter) this.elevenShockOuter.parent?.remove(this.elevenShockOuter);
    if (this.elevenShockInner) this.elevenShockInner.parent?.remove(this.elevenShockInner);
    if (this.elevenAssistLight) {
      this.elevenAssistLight.dispose();
      this.elevenAssistLight.parent?.remove(this.elevenAssistLight);
    }

    for (const g of this.ownedGeos) g.dispose();
    for (const m of this.ownedMats) m.dispose();
    this.ownedGeos = [];
    this.ownedMats = [];

    this.camera = null;
    this.garlandLights = null;
    this.bumperVisuals = null;
    this.onFightEnd = null;
    this.onTargetReady = null;
    this.emit = null;
    this.cinematicStrobe = new PlayfieldCinematicStrobe();
    this.billboard = new CameraBillboardSprite();
    this.targetVisual = new DemogorgonTargetVisual();
    this.elevenShockOuter = null;
    this.elevenShockOuterMat = null;
    this.elevenShockInner = null;
    this.elevenShockInnerMat = null;
    this.elevenAssistLight = null;
    this.phase = 'idle';
    this.elapsed = 0;
  }

  private triggerElevenAssist(): void {
    this.elevenAssistActive = true;
    this.elevenAssistT = 0;
    this.assistNextIn = ELEVEN_ASSIST_INTERVAL;
    this.targetHitFlash = TARGET_HIT_FLASH;
    if (this.elevenShockOuter) this.elevenShockOuter.visible = true;
    if (this.elevenShockInner) this.elevenShockInner.visible = true;
    this.emit?.({ type: 'ELEVEN_ASSIST', scoreIncrement: ELEVEN_ASSIST_SCORE });
  }

  private hideElevenAssist(): void {
    this.elevenAssistActive = false;
    if (this.elevenShockOuter) {
      this.elevenShockOuter.visible = false;
      this.elevenShockOuter.scale.setScalar(1);
    }
    if (this.elevenShockInner) {
      this.elevenShockInner.visible = false;
      this.elevenShockInner.scale.setScalar(1);
    }
    if (this.elevenShockOuterMat) this.elevenShockOuterMat.opacity = 0;
    if (this.elevenShockInnerMat) this.elevenShockInnerMat.opacity = 0;
    if (this.elevenAssistLight) this.elevenAssistLight.intensity = 0;
  }

  private updateElevenAssist(dt: number): void {
    if (!this.elevenAssistActive) return;

    this.elevenAssistT += dt;
    const t = Math.min(1, this.elevenAssistT / ELEVEN_ASSIST_ANIM);
    const rise = easeOut(t);
    const fade = easeIn(t);
    const alpha = t < 0.18 ? rise / 0.18 : 1 - fade;
    const burst = 1 - fade * 0.85;

    if (this.elevenShockOuter) this.elevenShockOuter.scale.setScalar(1 + rise * 4.5);
    if (this.elevenShockOuterMat) this.elevenShockOuterMat.opacity = alpha * 0.5 * burst;

    if (this.elevenShockInner) this.elevenShockInner.scale.setScalar(0.55 + rise * 2.4);
    if (this.elevenShockInnerMat) this.elevenShockInnerMat.opacity = alpha * 0.82;

    if (this.elevenAssistLight) {
      this.elevenAssistLight.intensity = rise * burst * 2.8;
    }

    if (t < 0.45) {
      this.targetVisual.applyElevenShake(Math.sin(this.elevenAssistT * 32) * 0.1 * (1 - t / 0.45));
    }

    if (t >= 1) this.hideElevenAssist();
  }

  private beginVictory(): void {
    this.hideElevenAssist();
    this.phase = 'victory';
    this.elapsed = 0;
    this.billboard.hide();
    this.targetVisual.show();
    this.targetVisual.playVictory();
  }

  private beginRestore(): void {
    this.phase = 'restore';
    this.elapsed = 0;
    this.billboard.hide();
    this.targetVisual.hide();
  }

  private resetAtmosphere(): void {
    const wasActive = this.phase !== 'idle';
    this.phase = 'idle';
    this.elapsed = 0;
    this.strobeT = 0;
    this.pulseT = 0;
    this.assistNextIn = ELEVEN_ASSIST_FIRST;
    this.hideElevenAssist();
    this.elevenAssistT = 0;

    this.cinematicStrobe.stop();
    this.billboard.hide();
    this.targetVisual.hide();

    if (wasActive) this.onFightEnd?.();
  }
}
