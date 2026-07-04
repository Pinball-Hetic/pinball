import * as THREE from 'three';
import type { GameEvent } from '@pinball/game-engine';
import { getBossDefinition } from '../bosses';
import { VECNA_TARGET } from '../bosses';
import { PLAYFIELD_TILT } from '@pinball/game-engine';
import type { GarlandLights } from './GarlandLights';
import type { BumperVisuals } from './BumperVisuals';
import type { UpsideDownAtmosphere } from './UpsideDownAtmosphere';
import { createBossTargetMesh } from '@pinball/game-engine';
import { BossTargetPulse } from '@pinball/game-engine';
import { WalkFightPhaseMachine } from '@pinball/game-engine';
import { PlayfieldCinematicStrobe, strangerthingsDecor } from './PlayfieldCinematicStrobe';
import { VecnaTargetVisual } from './VecnaTargetVisual';
import type { BossRevealController } from './BossRevealController';

const VICTORY = 0.65;

export type VecnaSetup = {
  root: THREE.Object3D;
  camera: THREE.Camera;
  garlandLights: GarlandLights | null;
  bumperVisuals: BumperVisuals | null;
  onFightEnd?: () => void;
  onTargetReady?: () => void;
};

export class VecnaReveal implements BossRevealController {
  readonly bossId = 'vecna' as const;
  private garlandLights: GarlandLights | null = null;
  private bumperVisuals: BumperVisuals | null = null;
  private upsideDownAtmosphere: UpsideDownAtmosphere | null = null;
  private onFightEnd: (() => void) | null = null;
  private onTargetReady: (() => void) | null = null;

  private cinematicStrobe = new PlayfieldCinematicStrobe();
  private vecnaVisual = new VecnaTargetVisual();
  private targetGroup: THREE.Group | null = null;
  private targetRingMat: THREE.MeshStandardMaterial | null = null;
  private targetCoreMat: THREE.MeshStandardMaterial | null = null;
  private targetLight: THREE.PointLight | null = null;
  private targetPulse: BossTargetPulse | null = null;
  private ownedGeos: THREE.BufferGeometry[] = [];
  private ownedMats: THREE.Material[] = [];

  private machine = new WalkFightPhaseMachine({
    victoryDuration: VICTORY,
    fightFlickerShade: 0.26,
    fightFlickerFlashMix: 0.12,
    targetHits: getBossDefinition('vecna').targetHits,
  });

  bindUpsideDownAtmosphere(atmosphere: UpsideDownAtmosphere | null): void {
    this.upsideDownAtmosphere = atmosphere;
  }

  async preload(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
  ): Promise<void> {
    await this.vecnaVisual.ensureReady();
    await this.vecnaVisual.warmup(renderer, scene, camera);
  }

  // PointLights added dynamically during the fight: strobe flash + Vecna
  // glow + target light. Used to prewarm shader variants at preload
  // (see BossRevealOrchestrator.preloadAll).
  dynamicPointLightCount(): number {
    return 3;
  }

  setup(config: VecnaSetup): void {
    this.dispose();
    this.garlandLights = config.garlandLights;
    this.bumperVisuals = config.bumperVisuals;
    this.onFightEnd = config.onFightEnd ?? null;
    this.onTargetReady = config.onTargetReady ?? null;

    this.cinematicStrobe.mount(
      config.root,
      {
        flashColor: 0x6622aa,
        flashIntensity: 1.6,
        flashPosition: new THREE.Vector3(
          VECNA_TARGET.x,
          VECNA_TARGET.y + 0.14,
          VECNA_TARGET.z,
        ),
      },
      strangerthingsDecor(config.garlandLights, config.bumperVisuals),
    );

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
    this.initTargetPulse();
  }

  onGameEvent(event: GameEvent): void {
    if (event.type === 'BOSS_REVEAL' && event.bossId === 'vecna') {
      if (this.machine.onReveal()) this.startWalkPhase();
      return;
    }
    if (event.type === 'BOSS_TARGET_HIT' && event.bossId === 'vecna') {
      const res = this.machine.onHit(event.hitCount);
      if (!res.accepted) return;
      this.targetPulse?.flashHit();
      this.vecnaVisual.playHit();
      if (res.victory) {
        this.beginVictory();
      }
    }
  }

  endFight(): void {
    this.resetAtmosphere();
  }

  isGameplayFrozen(): boolean {
    return this.machine.isGameplayFrozen();
  }

  update(dt: number): void {
    this.vecnaVisual.update(dt);
    this.targetPulse?.update(
      dt,
      this.targetGroup?.visible ?? false,
      this.machine.getPhase() === 'victory',
    );

    // The walk/settle exit timing lives in the visual (Three-side animation);
    // sample it for the pure machine. updateSettle(dt) advances the settle anim
    // and reports completion, so it must run every frame while settling.
    const walkPathComplete =
      this.machine.getPhase() === 'walk' && this.vecnaVisual.isWalkPathComplete();
    const settleComplete =
      this.machine.getPhase() === 'settle' && this.vecnaVisual.updateSettle(dt);

    const d = this.machine.tick(dt, { walkPathComplete, settleComplete });

    if (d.phase === 'idle') {
      this.garlandLights?.setStrobe(false, false);
      this.bumperVisuals?.setStrobe(false, false);
      return;
    }

    switch (d.strobe.kind) {
      case 'stop':
        this.cinematicStrobe.stop();
        break;
      case 'fightFlicker':
        this.cinematicStrobe.applyFightFlicker(d.strobe.shade, d.strobe.flashMix);
        break;
      case 'apply':
        this.cinematicStrobe.apply(d.strobe.on, d.strobe.fullMap, d.strobe.mix);
        break;
    }

    if (walkPathComplete) this.vecnaVisual.setPathProgress(1);
    if (d.enteredSettle) this.beginSettlePhase();
    if (d.enteredFight) this.beginFightPhase();

    if (d.finishedVictory) this.hideBoss();
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
    this.targetPulse = null;
  }

  private startWalkPhase(): void {
    this.targetPulse?.reset();
    this.vecnaVisual.beginReveal();
    this.vecnaVisual.show();
    this.vecnaVisual.prepareWalk();
    this.cinematicStrobe.stop();
    this.upsideDownAtmosphere?.setRevealLift(1);
  }

  private beginSettlePhase(): void {
    this.vecnaVisual.startSettle();
  }

  private beginFightPhase(): void {
    this.upsideDownAtmosphere?.setRevealLift(0);
    this.vecnaVisual.setPathProgress(1);
    if (this.targetGroup) this.targetGroup.visible = true;
    this.onTargetReady?.();
    this.garlandLights?.setAtmosphere(0.94, 0.1, 2.5);
    this.bumperVisuals?.setAtmosphere(0.94, 0.1, 2.5);
  }

  private buildTargetMesh(): THREE.Group {
    const parts = createBossTargetMesh(getBossDefinition('vecna').targetMeshTheme);
    this.targetRingMat = parts.ringMat;
    this.targetCoreMat = parts.coreMat;
    this.targetLight = parts.light;
    this.ownedGeos.push(...parts.ownedGeos);
    this.ownedMats.push(...parts.ownedMats);
    return parts.group;
  }

  private initTargetPulse(): void {
    if (!this.targetGroup) return;
    this.targetPulse = new BossTargetPulse(getBossDefinition('vecna').targetPulse, {
      targetGroup: this.targetGroup,
      ringMat: this.targetRingMat,
      coreMat: this.targetCoreMat,
      light: this.targetLight,
    });
  }

  private beginVictory(): void {
    this.vecnaVisual.playVictory();
    if (this.targetGroup) this.targetGroup.visible = false;
  }

  private hideBoss(): void {
    this.vecnaVisual.hide();
    if (this.targetGroup) this.targetGroup.visible = false;
    this.onFightEnd?.();
    this.resetAtmosphere();
  }

  private resetAtmosphere(): void {
    this.machine.reset();
    this.upsideDownAtmosphere?.setRevealLift(0);
    this.vecnaVisual.hide();
    if (this.targetGroup) {
      this.targetGroup.visible = false;
      this.targetGroup.scale.setScalar(1);
      this.targetGroup.rotation.z = 0;
    }
    this.targetPulse?.reset();
    this.garlandLights?.setStrobe(false, false);
    this.bumperVisuals?.setStrobe(false, false);
    this.cinematicStrobe.stop();
    this.garlandLights?.setAtmosphere(1, 0);
    this.bumperVisuals?.setAtmosphere(1, 0);
  }
}
