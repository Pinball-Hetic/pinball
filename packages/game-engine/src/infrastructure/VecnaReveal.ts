import * as THREE from 'three';
import type { GameEvent } from '../domain/GameEvents';
import { VECNA_TARGET, VECNA_TARGET_HITS } from '../domain/Ball';
import {
  VECNA_DESCENT_DURATION,
  VECNA_DESCENT_HEIGHT,
} from '../domain/VecnaConstants';
import { PLAYFIELD_TILT } from '../domain/PlayfieldGeometry';
import { easeOut } from './CinematicEasing';
import type { GarlandLights } from './GarlandLights';
import type { BumperVisuals } from './BumperVisuals';
import { PlayfieldCinematicStrobe } from './PlayfieldCinematicStrobe';
import { VecnaTargetVisual } from './VecnaTargetVisual';

const TARGET_HIT_FLASH = 0.18;
const VICTORY = 0.65;
const TARGET_PULSE_SPEED = 2.2;
const TARGET_PULSE_AMP = 0.16;

type Phase = 'idle' | 'descend' | 'fight' | 'victory';

export type VecnaSetup = {
  root: THREE.Object3D;
  scene: THREE.Scene;
  camera: THREE.Camera;
  garlandLights: GarlandLights | null;
  bumperVisuals: BumperVisuals | null;
  onFightEnd?: () => void;
  onTargetReady?: () => void;
};

export class VecnaReveal {
  private camera: THREE.Camera | null = null;
  private garlandLights: GarlandLights | null = null;
  private bumperVisuals: BumperVisuals | null = null;
  private onFightEnd: (() => void) | null = null;
  private onTargetReady: (() => void) | null = null;

  private cinematicStrobe = new PlayfieldCinematicStrobe();
  private vecnaVisual = new VecnaTargetVisual();
  private targetGroup: THREE.Group | null = null;
  private targetRingMat: THREE.MeshStandardMaterial | null = null;
  private targetCoreMat: THREE.MeshStandardMaterial | null = null;
  private targetLight: THREE.PointLight | null = null;
  private ownedGeos: THREE.BufferGeometry[] = [];
  private ownedMats: THREE.Material[] = [];

  private phase: Phase = 'idle';
  private elapsed = 0;
  private pulseT = 0;
  private targetHitFlash = 0;

  async preload(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
  ): Promise<void> {
    await this.vecnaVisual.ensureReady();
    await this.vecnaVisual.warmup(renderer, scene, camera);
  }

  setup(config: VecnaSetup): void {
    this.dispose();
    this.camera = config.camera;
    this.garlandLights = config.garlandLights;
    this.bumperVisuals = config.bumperVisuals;
    this.onFightEnd = config.onFightEnd ?? null;
    this.onTargetReady = config.onTargetReady ?? null;

    this.cinematicStrobe.mount(config.root, config.garlandLights, config.bumperVisuals, {
      flashColor: 0x6622aa,
      flashIntensity: 1.6,
      flashPosition: new THREE.Vector3(
        VECNA_TARGET.x,
        VECNA_TARGET.y + 0.14,
        VECNA_TARGET.z,
      ),
    });

    this.vecnaVisual.mount(config.root, config.camera);

    this.targetGroup = this.buildTargetMesh();
    this.targetGroup.position.set(
      VECNA_TARGET.x,
      VECNA_TARGET.y + 0.018,
      VECNA_TARGET.z,
    );
    this.targetGroup.rotation.x = PLAYFIELD_TILT;
    this.targetGroup.visible = false;
    config.root.add(this.targetGroup);
  }

  onGameEvent(event: GameEvent): void {
    if (event.type === 'VECNA_REVEAL') {
      if (this.phase !== 'idle') return;
      this.phase = 'descend';
      this.elapsed = 0;
      this.pulseT = 0;
      this.vecnaVisual.setLift(VECNA_DESCENT_HEIGHT);
      this.vecnaVisual.show();
      return;
    }
    if (event.type === 'VECNA_TARGET_HIT') {
      if (this.phase !== 'fight') return;
      this.targetHitFlash = TARGET_HIT_FLASH;
      this.vecnaVisual.playHit();
      if (event.hitCount >= VECNA_TARGET_HITS) {
        this.beginVictory();
      }
    }
  }

  endFight(): void {
    this.resetAtmosphere();
  }

  update(dt: number): void {
    this.vecnaVisual.update(dt);
    if (this.targetHitFlash > 0) this.targetHitFlash = Math.max(0, this.targetHitFlash - dt);
    this.updateTargetPulse(dt);

    if (this.phase === 'idle') {
      this.garlandLights?.setStrobe(false, false);
      this.bumperVisuals?.setStrobe(false, false);
      return;
    }

    this.elapsed += dt;

    if (this.phase === 'descend') {
      const t = Math.min(1, this.elapsed / VECNA_DESCENT_DURATION);
      const ease = easeOut(t);
      const lift = VECNA_DESCENT_HEIGHT * (1 - ease);
      this.vecnaVisual.setLift(lift);
      this.cinematicStrobe.apply(false, false, 0.38 + ease * 0.18);
      if (t >= 1) {
        this.beginFightPhase();
      }
      return;
    }

    if (this.phase === 'fight') {
      this.cinematicStrobe.applyFightFlicker(0.26, 0.12);
      return;
    }

    if (this.phase === 'victory') {
      this.cinematicStrobe.apply(false, false, Math.max(0, 1 - this.elapsed / VICTORY));
      if (this.elapsed >= VICTORY) {
        this.hideBoss();
      }
    }
  }

  dispose(): void {
    this.resetAtmosphere();
    this.cinematicStrobe.dispose();
    this.vecnaVisual.dispose();
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
    this.cinematicStrobe = new PlayfieldCinematicStrobe();
    this.vecnaVisual = new VecnaTargetVisual();
    this.targetGroup = null;
    this.targetRingMat = null;
    this.targetCoreMat = null;
    this.targetLight = null;
    this.phase = 'idle';
    this.elapsed = 0;
  }

  private beginFightPhase(): void {
    this.phase = 'fight';
    this.elapsed = 0;
    this.vecnaVisual.setLift(0);
    this.vecnaVisual.land();
    if (this.targetGroup) this.targetGroup.visible = true;
    this.onTargetReady?.();
    this.garlandLights?.setAtmosphere(0.94, 0.1, 2.5);
    this.bumperVisuals?.setAtmosphere(0.94, 0.1, 2.5);
  }

  private buildTargetMesh(): THREE.Group {
    const group = new THREE.Group();

    const ringGeo = new THREE.TorusGeometry(0.034, 0.004, 8, 24);
    this.targetRingMat = new THREE.MeshStandardMaterial({
      color: 0x6622aa,
      emissive: 0x9933ff,
      emissiveIntensity: 1.5,
      metalness: 0.45,
      roughness: 0.32,
    });
    const ring = new THREE.Mesh(ringGeo, this.targetRingMat);
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
    this.ownedGeos.push(ringGeo);
    this.ownedMats.push(this.targetRingMat);

    const coreGeo = new THREE.CircleGeometry(0.015, 16);
    this.targetCoreMat = new THREE.MeshStandardMaterial({
      color: 0xeeddff,
      emissive: 0xaa55ff,
      emissiveIntensity: 1.1,
      metalness: 0.25,
      roughness: 0.38,
      side: THREE.DoubleSide,
    });
    const core = new THREE.Mesh(coreGeo, this.targetCoreMat);
    core.rotation.x = -Math.PI / 2;
    group.add(core);
    this.ownedGeos.push(coreGeo);
    this.ownedMats.push(this.targetCoreMat);

    this.targetLight = new THREE.PointLight(0x9933ff, 0.42, 0.18, 2);
    this.targetLight.position.y = 0.02;
    group.add(this.targetLight);

    return group;
  }

  private updateTargetPulse(dt: number): void {
    if (!this.targetGroup?.visible || this.phase === 'victory') return;
    this.pulseT += dt;
    const hitBoost = this.targetHitFlash > 0 ? 1.35 : 1;
    const pulse = (0.82 + Math.sin(this.pulseT * TARGET_PULSE_SPEED) * TARGET_PULSE_AMP) * hitBoost;
    if (this.targetRingMat) this.targetRingMat.emissiveIntensity = 1.5 * pulse;
    if (this.targetCoreMat) this.targetCoreMat.emissiveIntensity = 1.1 * pulse;
    if (this.targetLight) this.targetLight.intensity = 0.42 * pulse;
    this.targetGroup.rotation.z = Math.sin(this.pulseT * 2.8) * 0.06;
    const scale = 1 + (this.targetHitFlash / TARGET_HIT_FLASH) * 0.22;
    this.targetGroup.scale.setScalar(scale);
  }

  private beginVictory(): void {
    this.phase = 'victory';
    this.elapsed = 0;
    this.vecnaVisual.playVictory();
    this.onFightEnd?.();
    if (this.targetGroup) this.targetGroup.visible = false;
  }

  private hideBoss(): void {
    this.vecnaVisual.hide();
    if (this.targetGroup) this.targetGroup.visible = false;
    this.resetAtmosphere();
  }

  private resetAtmosphere(): void {
    this.phase = 'idle';
    this.elapsed = 0;
    this.targetHitFlash = 0;
    this.vecnaVisual.hide();
    if (this.targetGroup) {
      this.targetGroup.visible = false;
      this.targetGroup.scale.setScalar(1);
      this.targetGroup.rotation.z = 0;
    }
    this.garlandLights?.setStrobe(false, false);
    this.bumperVisuals?.setStrobe(false, false);
    this.cinematicStrobe.stop();
    this.garlandLights?.setAtmosphere(1, 0);
    this.bumperVisuals?.setAtmosphere(1, 0);
  }
}
