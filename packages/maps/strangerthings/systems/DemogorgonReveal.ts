import * as THREE from 'three';
import type { GameEvent, GameEventListener } from '@pinball/game-engine';
import { getBossDefinition } from '../bosses';
import {
  DEMOGORGON_TARGET,
  ELEVEN_ASSIST_SCORE,
  ELEVEN_ASSIST_INTERVAL,
} from '@pinball/game-engine';
import { layout } from '../layout';
import { PLAYFIELD_TILT } from '@pinball/game-engine';
import { easeIn, easeOut, strobeOn } from '@pinball/game-engine';
import { CameraBillboardSprite } from '@pinball/game-engine';
import type { GarlandLights } from './GarlandLights';
import type { BumperVisuals } from './BumperVisuals';
import { createBossTargetMesh } from '@pinball/game-engine';
import { BossTargetPulse } from '@pinball/game-engine';
import { PlayfieldCinematicStrobe } from './PlayfieldCinematicStrobe';
import { DemogorgonTargetVisual } from './DemogorgonTargetVisual';
import type { BossRevealController } from './BossRevealController';

const TEXTURE_URL = '/playfield/demogorgon.png';

const BLACKOUT = 0.12;
const REVEAL = 0.5;
const RESTORE = 0.3;
const VICTORY = 0.65;
const ELEVEN_ASSIST_ANIM = 0.85;
const ELEVEN_ASSIST_FIRST = 0.55;

const STROBE_HZ_INTRO = 4;
const FIGHT_SHADE = 0.36;
const FIGHT_SHADE_BREATHE = 0.04;
const FIGHT_SHADE_SPEED = 1.4;
const FIGHT_FLICKER_HZ = 3;
const FIGHT_FLINKER_DIP = 0.07;
const FIGHT_FLICKER_LIFT = 0.04;
const FIGHT_FLASH_MIX = 0.45;
const FIGHT_DECOR_STROBE = 0.22;
const FLASH_INTENSITY = 1.5;

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

export class DemogorgonReveal implements BossRevealController {
  readonly bossId = 'demogorgon' as const;
  private camera: THREE.Camera | null = null;
  private garlandLights: GarlandLights | null = null;
  private bumperVisuals: BumperVisuals | null = null;
  private onFightEnd: (() => void) | null = null;
  private onTargetReady: (() => void) | null = null;
  private emit: GameEventListener | null = null;

  private cinematicStrobe = new PlayfieldCinematicStrobe();
  private billboard = new CameraBillboardSprite();
  private demogorgonVisual = new DemogorgonTargetVisual();
  private targetGroup: THREE.Group | null = null;
  private targetRingMat: THREE.MeshStandardMaterial | null = null;
  private targetCoreMat: THREE.MeshStandardMaterial | null = null;
  private targetLight: THREE.PointLight | null = null;
  private targetPulse: BossTargetPulse | null = null;
  private victoryBurst: THREE.Mesh | null = null;
  private victoryBurstMat: THREE.MeshBasicMaterial | null = null;
  private elevenShockOuter: THREE.Mesh | null = null;
  private elevenShockOuterMat: THREE.MeshBasicMaterial | null = null;
  private elevenShockInner: THREE.Mesh | null = null;
  private elevenShockInnerMat: THREE.MeshBasicMaterial | null = null;
  private elevenAssistLight: THREE.PointLight | null = null;
  private root: THREE.Object3D | null = null;
  private ownedGeos: THREE.BufferGeometry[] = [];
  private ownedMats: THREE.Material[] = [];

  private phase: Phase = 'idle';
  private elapsed = 0;
  private strobeT = 0;
  private pulseT = 0;
  private assistNextIn = ELEVEN_ASSIST_FIRST;
  private elevenAssistActive = false;
  private elevenAssistT = 0;

  setEmit(listener: GameEventListener): void {
    this.emit = listener;
  }

  async preload(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
  ): Promise<void> {
    await Promise.all([
      this.billboard.ensureReady(),
      this.demogorgonVisual.ensureReady(),
    ]);
    // Upload GPU de la texture billboard + compilation des shaders du
    // demogorgon, du targetGroup (ring/core/burst) et du sprite — hors
    // frame critique. Sinon tout tombe sur la frame du spawn → freeze.
    this.billboard.warmup(renderer);
    await this.demogorgonVisual.warmup(renderer, scene, camera);
    if (this.targetGroup) await renderer.compileAsync(this.targetGroup, camera, scene);
    const sprite = this.billboard.object3D;
    if (sprite) await renderer.compileAsync(sprite, camera, scene);
  }

  setup(config: DemogorgonSetup): void {
    this.dispose();
    this.camera = config.camera;
    this.garlandLights = config.garlandLights;
    this.bumperVisuals = config.bumperVisuals;
    this.onFightEnd = config.onFightEnd ?? null;
    this.onTargetReady = config.onTargetReady ?? null;
    this.root = config.root;

    this.cinematicStrobe.mount(config.root, config.garlandLights, config.bumperVisuals, {
      flashColor: 0xff1122,
      flashIntensity: FLASH_INTENSITY,
      flashPosition: new THREE.Vector3(
        layout.sensors.demogorgon.x,
        layout.sensors.demogorgon.y + 0.12,
        layout.sensors.demogorgon.z,
      ),
    });

    this.billboard.mount(config.scene, config.camera, { textureUrl: TEXTURE_URL });
    this.demogorgonVisual.mount(config.root, config.camera);

    this.targetGroup = this.buildTargetMesh();
    this.targetGroup.position.set(
      DEMOGORGON_TARGET.x,
      DEMOGORGON_TARGET.y + 0.018,
      DEMOGORGON_TARGET.z,
    );
    this.targetGroup.rotation.x = PLAYFIELD_TILT;
    this.targetGroup.visible = false;
    config.root.add(this.targetGroup);
    this.initTargetPulse();

    const assistY = DEMOGORGON_TARGET.y + 0.021;

    // Ajoutée à la scène SEULEMENT pendant ses flashs (cf. trigger/hide).
    this.elevenAssistLight = new THREE.PointLight(0xbb55ff, 0, 0.32, 0.3);
    this.elevenAssistLight.position.set(DEMOGORGON_TARGET.x, DEMOGORGON_TARGET.y + 0.045, DEMOGORGON_TARGET.z);

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
    if (event.type === 'BOSS_REVEAL' && event.bossId === 'demogorgon') {
      if (this.phase !== 'idle') return;
      this.phase = 'blackout';
      this.elapsed = 0;
      this.strobeT = 0;
      this.pulseT = 0;
      this.assistNextIn = ELEVEN_ASSIST_FIRST;
      this.elevenAssistActive = false;
      this.elevenAssistT = 0;
      this.billboard.show();
      if (this.targetGroup) this.targetGroup.visible = true;
      return;
    }
    if (event.type === 'BOSS_TARGET_HIT' && event.bossId === 'demogorgon') {
      if (this.phase === 'idle' || this.phase === 'restore' || this.phase === 'victory') return;
      this.targetPulse?.flashHit();
      this.demogorgonVisual.playHit();
      if (event.hitCount >= getBossDefinition('demogorgon').targetHits) {
        this.beginVictory();
      }
      return;
    }
  }

  endFight(): void {
    this.resetAtmosphere();
  }

  isGameplayFrozen(): boolean {
    return false;
  }

  update(dt: number): void {
    this.demogorgonVisual.update(dt);
    // Advance the shade-breathe clock read in the flicker phase. The target
    // pulse moved into BossTargetPulse (its own clock); this drives only the
    // atmosphere breathe term and must keep ticking or breathe stays at 0.
    this.pulseT += dt;
    this.billboard.sync();
    this.targetPulse?.update(
      dt,
      this.targetGroup?.visible ?? false,
      this.phase === 'victory',
    );

    if (this.phase === 'idle') {
      this.garlandLights?.setStrobe(false, false);
      this.bumperVisuals?.setStrobe(false, false);
      return;
    }

    this.elapsed += dt;
    this.strobeT += dt;

    const on = strobeOn(this.strobeT, STROBE_HZ_INTRO);
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
      this.billboard.setOpacity(this.billboard.isReady() ? easeOut(t) * 0.95 : 0);
      if (this.elapsed >= REVEAL) {
        this.phase = 'flicker';
        this.elapsed = 0;
        this.assistNextIn = ELEVEN_ASSIST_FIRST;
        this.billboard.setOpacity(0);
        this.billboard.hide();
        this.demogorgonVisual.show();
        this.garlandLights?.setAtmosphere(0.88, FIGHT_DECOR_STROBE, FIGHT_FLICKER_HZ);
        this.bumperVisuals?.setAtmosphere(0.88, FIGHT_DECOR_STROBE, FIGHT_FLICKER_HZ);
        this.onTargetReady?.();
      }
      return;
    }

    if (this.phase === 'flicker') {
      const breathe = Math.sin(this.pulseT * FIGHT_SHADE_SPEED) * FIGHT_SHADE_BREATHE;
      const blink = strobeOn(this.strobeT, FIGHT_FLICKER_HZ);
      const shade = THREE.MathUtils.clamp(
        FIGHT_SHADE + breathe + (blink ? -FIGHT_FLICKER_LIFT : FIGHT_FLINKER_DIP),
        0.18,
        0.52,
      );
      this.cinematicStrobe.applyFightFlicker(shade, blink ? FIGHT_FLASH_MIX : 0);
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
      this.cinematicStrobe.applyHoldShade(FIGHT_SHADE * darkMix);
      this.billboard.setOpacity(0);
    }
  }

  dispose(): void {
    this.resetAtmosphere();

    this.cinematicStrobe.dispose();
    this.billboard.dispose();
    this.demogorgonVisual.dispose();

    if (this.elevenShockOuter) this.elevenShockOuter.parent?.remove(this.elevenShockOuter);
    if (this.elevenShockInner) this.elevenShockInner.parent?.remove(this.elevenShockInner);
    if (this.elevenAssistLight) {
      this.elevenAssistLight.dispose();
      this.elevenAssistLight.parent?.remove(this.elevenAssistLight);
    }

    if (this.targetGroup) this.targetGroup.parent?.remove(this.targetGroup);
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
    this.demogorgonVisual = new DemogorgonTargetVisual();
    this.targetGroup = null;
    this.targetRingMat = null;
    this.targetCoreMat = null;
    this.targetLight = null;
    this.targetPulse = null;
    this.victoryBurst = null;
    this.victoryBurstMat = null;
    this.elevenShockOuter = null;
    this.elevenShockOuterMat = null;
    this.elevenShockInner = null;
    this.elevenShockInnerMat = null;
    this.elevenAssistLight = null;
    this.root = null;
    this.phase = 'idle';
    this.elapsed = 0;
  }

  private buildTargetMesh(): THREE.Group {
    const parts = createBossTargetMesh(getBossDefinition('demogorgon').targetMeshTheme);
    this.targetRingMat = parts.ringMat;
    this.targetCoreMat = parts.coreMat;
    this.targetLight = parts.light;
    this.victoryBurst = parts.victoryBurst;
    this.victoryBurstMat = parts.victoryBurstMat;
    this.ownedGeos.push(...parts.ownedGeos);
    this.ownedMats.push(...parts.ownedMats);
    return parts.group;
  }

  private initTargetPulse(): void {
    if (!this.targetGroup) return;
    this.targetPulse = new BossTargetPulse(getBossDefinition('demogorgon').targetPulse, {
      targetGroup: this.targetGroup,
      ringMat: this.targetRingMat,
      coreMat: this.targetCoreMat,
      light: this.targetLight,
    });
  }

  private triggerElevenAssist(): void {
    this.elevenAssistActive = true;
    this.elevenAssistT = 0;
    this.assistNextIn = ELEVEN_ASSIST_INTERVAL;
    this.targetPulse?.flashHit();
    if (this.elevenShockOuter) this.elevenShockOuter.visible = true;
    if (this.elevenShockInner) this.elevenShockInner.visible = true;
    if (this.elevenAssistLight && this.root && !this.elevenAssistLight.parent) {
      this.root.add(this.elevenAssistLight);
    }
    this.emit?.({ type: 'ASSIST', assistId: 'eleven', scoreIncrement: ELEVEN_ASSIST_SCORE });
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
    if (this.elevenAssistLight) {
      this.elevenAssistLight.intensity = 0;
      this.elevenAssistLight.removeFromParent(); // hors scène entre les flashs
    }
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

    if (this.targetGroup && t < 0.45) {
      this.targetGroup.rotation.z = Math.sin(this.elevenAssistT * 32) * 0.1 * (1 - t / 0.45);
    }

    if (t >= 1) this.hideElevenAssist();
  }

  private beginVictory(): void {
    this.hideElevenAssist();
    this.phase = 'victory';
    this.elapsed = 0;
    this.billboard.hide();
    this.demogorgonVisual.playVictory();
    if (this.targetGroup) this.targetGroup.visible = true;
  }

  private beginRestore(): void {
    this.phase = 'restore';
    this.elapsed = 0;
    this.billboard.hide();
    if (this.targetGroup) {
      this.targetGroup.visible = false;
      this.targetGroup.scale.setScalar(1);
      this.targetGroup.rotation.z = 0;
    }
    this.resetTargetMaterials();
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
    this.garlandLights?.setAtmosphere(1, 0);
    this.bumperVisuals?.setAtmosphere(1, 0);
    this.billboard.hide();
    this.demogorgonVisual.hide();

    if (this.targetGroup) {
      this.targetGroup.visible = false;
      this.targetGroup.scale.setScalar(1);
      this.targetGroup.rotation.z = 0;
    }
    this.targetPulse?.reset();
    this.resetTargetMaterials();

    if (wasActive) this.onFightEnd?.();
  }
}
