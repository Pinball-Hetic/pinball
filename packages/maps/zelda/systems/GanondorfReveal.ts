import * as THREE from 'three';
import type { GameEvent, GameEventListener } from '@pinball/game-engine';
import { getBossDefinition, GANONDORF_TARGET } from '../bosses';
import { layout } from '../layout';
import { PLAYFIELD_TILT } from '@pinball/game-engine';
import { easeIn, easeOut, strobeOn } from '@pinball/game-engine';
import { createBossTargetMesh } from '@pinball/game-engine';
import { BossTargetPulse } from '@pinball/game-engine';
import { PlayfieldCinematicStrobe } from './PlayfieldCinematicStrobe';
import { GanondorfTargetVisual } from './GanondorfTargetVisual';
import type { BossRevealController } from './BossRevealController';

const BLACKOUT = 0.12;
const REVEAL = 0.5;
const RESTORE = 0.3;
const VICTORY = 0.65;

const STROBE_HZ_INTRO = 4;
const FIGHT_FLICKER_HZ = 3;
const FIGHT_FLASH_MIX = 0.45;
const FLASH_INTENSITY = 1.5;

// Flash violet Ganondorf.
const FLASH_COLOR = 0x9900ff;

type Phase = 'idle' | 'blackout' | 'reveal' | 'flicker' | 'victory' | 'restore';

export type GanondorfSetup = {
  root: THREE.Object3D;
  scene: THREE.Scene;
  camera: THREE.Camera;
  onFightEnd?: () => void;
  onTargetReady?: () => void;
};

export class GanondorfReveal implements BossRevealController {
  readonly bossId = 'ganondorf' as const;
  private camera: THREE.Camera | null = null;
  private onFightEnd: (() => void) | null = null;
  private onTargetReady: (() => void) | null = null;
  private emit: GameEventListener | null = null;

  private cinematicStrobe = new PlayfieldCinematicStrobe();
  private ganondorfVisual = new GanondorfTargetVisual();
  private targetGroup: THREE.Group | null = null;
  private targetRingMat: THREE.MeshStandardMaterial | null = null;
  private targetCoreMat: THREE.MeshStandardMaterial | null = null;
  private targetLight: THREE.PointLight | null = null;
  private targetPulse: BossTargetPulse | null = null;
  private victoryBurst: THREE.Mesh | null = null;
  private victoryBurstMat: THREE.MeshBasicMaterial | null = null;
  private root: THREE.Object3D | null = null;
  private ownedGeos: THREE.BufferGeometry[] = [];
  private ownedMats: THREE.Material[] = [];

  private phase: Phase = 'idle';
  private elapsed = 0;
  private strobeT = 0;
  private pulseT = 0;

  setEmit(listener: GameEventListener): void {
    this.emit = listener;
  }

  async preload(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
  ): Promise<void> {
    await this.ganondorfVisual.ensureReady();
    await this.ganondorfVisual.warmup(renderer, scene, camera);
    if (this.targetGroup) await renderer.compileAsync(this.targetGroup, camera, scene);
  }

  setup(config: GanondorfSetup): void {
    this.dispose();
    this.camera = config.camera;
    this.onFightEnd = config.onFightEnd ?? null;
    this.onTargetReady = config.onTargetReady ?? null;
    this.root = config.root;

    this.cinematicStrobe.mount(config.root, {
      flashColor: FLASH_COLOR,
      flashIntensity: FLASH_INTENSITY,
      flashPosition: new THREE.Vector3(
        layout.sensors.bossReveal.x,
        layout.sensors.bossReveal.y + 0.12,
        layout.sensors.bossReveal.z,
      ),
    });

    this.ganondorfVisual.mount(config.root, config.camera);

    this.targetGroup = this.buildTargetMesh();
    this.targetGroup.position.set(
      GANONDORF_TARGET.x,
      GANONDORF_TARGET.y + 0.018,
      GANONDORF_TARGET.z,
    );
    this.targetGroup.rotation.x = PLAYFIELD_TILT;
    this.targetGroup.visible = false;
    config.root.add(this.targetGroup);
    this.initTargetPulse();
  }

  onGameEvent(event: GameEvent): void {
    if (event.type === 'BOSS_REVEAL' && event.bossId === 'ganondorf') {
      if (this.phase !== 'idle') return;
      this.phase = 'blackout';
      this.elapsed = 0;
      this.strobeT = 0;
      this.pulseT = 0;
      if (this.targetGroup) this.targetGroup.visible = true;
      return;
    }
    if (event.type === 'BOSS_TARGET_HIT' && event.bossId === 'ganondorf') {
      if (this.phase === 'idle' || this.phase === 'restore' || this.phase === 'victory') return;
      this.targetPulse?.flashHit();
      this.ganondorfVisual.playHit();
      if (event.hitCount >= getBossDefinition('ganondorf').targetHits) {
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
    this.ganondorfVisual.update(dt);
    this.pulseT += dt;
    this.targetPulse?.update(
      dt,
      this.targetGroup?.visible ?? false,
      this.phase === 'victory',
    );

    if (this.phase === 'idle') return;

    this.elapsed += dt;
    this.strobeT += dt;

    const on = strobeOn(this.strobeT, STROBE_HZ_INTRO);
    const darkMix = this.phase === 'restore'
      ? 1 - easeIn(Math.min(1, this.elapsed / RESTORE))
      : 1;

    if (this.phase === 'blackout') {
      // Flash violet sans voile noir.
      this.cinematicStrobe.applyFlashOnly(on, darkMix * easeOut(Math.min(1, this.elapsed / BLACKOUT)));
      if (this.elapsed >= BLACKOUT) {
        this.phase = 'reveal';
        this.elapsed = 0;
      }
      return;
    }

    if (this.phase === 'reveal') {
      this.cinematicStrobe.applyFlashOnly(on, 1);
      if (this.elapsed >= REVEAL) {
        this.phase = 'flicker';
        this.elapsed = 0;
        this.ganondorfVisual.show();
        this.onTargetReady?.();
      }
      return;
    }

    if (this.phase === 'flicker') {
      // Pas de shade, seulement le flash violet au rythme du flicker.
      const blink = strobeOn(this.strobeT, FIGHT_FLICKER_HZ);
      this.cinematicStrobe.applyFightFlicker(0, blink ? FIGHT_FLASH_MIX : 0);
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
      // Pas de shade pendant la restauration.
      this.cinematicStrobe.stop();
    }
  }

  dispose(): void {
    this.resetAtmosphere();

    this.cinematicStrobe.dispose();
    this.ganondorfVisual.dispose();

    if (this.targetGroup) this.targetGroup.parent?.remove(this.targetGroup);
    for (const g of this.ownedGeos) g.dispose();
    for (const m of this.ownedMats) m.dispose();
    this.ownedGeos = [];
    this.ownedMats = [];

    this.camera = null;
    this.onFightEnd = null;
    this.onTargetReady = null;
    this.emit = null;
    this.cinematicStrobe = new PlayfieldCinematicStrobe();
    this.ganondorfVisual = new GanondorfTargetVisual();
    this.targetGroup = null;
    this.targetRingMat = null;
    this.targetCoreMat = null;
    this.targetLight = null;
    this.targetPulse = null;
    this.victoryBurst = null;
    this.victoryBurstMat = null;
    this.root = null;
    this.phase = 'idle';
    this.elapsed = 0;
  }

  private buildTargetMesh(): THREE.Group {
    const parts = createBossTargetMesh(getBossDefinition('ganondorf').targetMeshTheme);
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
    this.targetPulse = new BossTargetPulse(getBossDefinition('ganondorf').targetPulse, {
      targetGroup: this.targetGroup,
      ringMat: this.targetRingMat,
      coreMat: this.targetCoreMat,
      light: this.targetLight,
    });
  }

  private beginVictory(): void {
    this.phase = 'victory';
    this.elapsed = 0;
    this.ganondorfVisual.playVictory();
    if (this.targetGroup) this.targetGroup.visible = true;
  }

  private beginRestore(): void {
    this.phase = 'restore';
    this.elapsed = 0;
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
      this.targetRingMat.emissive.setHex(0xffd700);
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
      this.targetLight.color.setHex(0xffd700);
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
    const def = getBossDefinition('ganondorf').targetMeshTheme;
    if (this.targetRingMat) {
      this.targetRingMat.transparent = false;
      this.targetRingMat.opacity = 1;
      this.targetRingMat.emissive.setHex(def.ring.emissive);
      this.targetRingMat.emissiveIntensity = def.ring.emissiveIntensity;
      this.targetRingMat.color.setHex(def.ring.color);
    }
    if (this.targetCoreMat) {
      this.targetCoreMat.transparent = false;
      this.targetCoreMat.opacity = 1;
      this.targetCoreMat.emissive.setHex(def.core.emissive);
      this.targetCoreMat.emissiveIntensity = def.core.emissiveIntensity;
      this.targetCoreMat.color.setHex(def.core.color);
    }
    if (this.targetLight) {
      this.targetLight.color.setHex(def.light.color);
      this.targetLight.intensity = def.light.intensity;
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

    this.cinematicStrobe.stop();
    this.ganondorfVisual.hide();

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
