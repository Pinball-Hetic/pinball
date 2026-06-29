import * as THREE from 'three';
import type { GameEvent } from '@pinball/game-engine';
import { getBossDefinition, DARK_LINK_TARGET } from '../bosses';
import { PLAYFIELD_TILT } from '@pinball/game-engine';
import { createBossTargetMesh, BossTargetPulse } from '@pinball/game-engine';
import { PlayfieldCinematicStrobe } from './PlayfieldCinematicStrobe';
import { DarkLinkTargetVisual } from './DarkLinkTargetVisual';
import type { BossRevealController } from './BossRevealController';

const VICTORY_DURATION = 0.65;
// Flash rouge Dark Link
const FLASH_COLOR = 0xff2200;
const FLASH_INTENSITY = 1.6;

type Phase = 'idle' | 'walk' | 'settle' | 'fight' | 'victory';

export type DarkLinkSetup = {
  root: THREE.Object3D;
  scene: THREE.Scene;
  camera: THREE.Camera;
  onFightEnd?: () => void;
  onTargetReady?: () => void;
};

/**
 * Contrôleur de révélation Dark Link (Sacred Realm).
 * Pattern identique à VecnaReveal :
 *  - phase walk  : Dark Link marche vers sa position (gameplay gelé)
 *  - phase settle: rotation face caméra (gameplay gelé)
 *  - phase fight : combat, animation idle + hit à chaque coup
 *  - phase victory: animation dead + portail retour ouvert
 */
export class DarkLinkReveal implements BossRevealController {
  readonly bossId = 'darklink' as const;
  private onFightEnd: (() => void) | null = null;
  private onTargetReady: (() => void) | null = null;

  private cinematicStrobe = new PlayfieldCinematicStrobe();
  private darkLinkVisual  = new DarkLinkTargetVisual();
  private targetGroup:    THREE.Group | null = null;
  private targetRingMat:  THREE.MeshStandardMaterial | null = null;
  private targetCoreMat:  THREE.MeshStandardMaterial | null = null;
  private targetLight:    THREE.PointLight | null = null;
  private targetPulse:    BossTargetPulse | null = null;
  private ownedGeos: THREE.BufferGeometry[] = [];
  private ownedMats: THREE.Material[] = [];

  private phase: Phase = 'idle';
  private elapsed = 0;

  // ── BossRevealController ─────────────────────────────────────────────────

  async preload(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
  ): Promise<void> {
    await this.darkLinkVisual.ensureReady();
    await this.darkLinkVisual.warmup(renderer, scene, camera);
  }

  setup(config: DarkLinkSetup): void {
    this.dispose();
    this.onFightEnd    = config.onFightEnd ?? null;
    this.onTargetReady = config.onTargetReady ?? null;

    this.cinematicStrobe.mount(config.root, {
      flashColor: FLASH_COLOR,
      flashIntensity: FLASH_INTENSITY,
      flashPosition: new THREE.Vector3(
        DARK_LINK_TARGET.x,
        DARK_LINK_TARGET.y + 0.14,
        DARK_LINK_TARGET.z,
      ),
    });

    this.darkLinkVisual.mount(config.root, config.camera);

    this.targetGroup = this.buildTargetMesh();
    this.targetGroup.position.set(
      DARK_LINK_TARGET.x,
      DARK_LINK_TARGET.y + 0.018,
      DARK_LINK_TARGET.z,
    );
    this.targetGroup.rotation.x = PLAYFIELD_TILT;
    this.targetGroup.visible = false;
    config.root.add(this.targetGroup);
    this.initTargetPulse();
  }

  onGameEvent(event: GameEvent): void {
    if (event.type === 'BOSS_REVEAL' && event.bossId === 'darklink') {
      this.startWalkPhase();
      return;
    }
    if (event.type === 'BOSS_TARGET_HIT' && event.bossId === 'darklink') {
      if (this.phase !== 'fight') return;
      this.targetPulse?.flashHit();
      this.darkLinkVisual.playHit();
      if (event.hitCount >= getBossDefinition('darklink').targetHits) {
        this.beginVictory();
      }
    }
  }

  endFight(): void {
    this.resetState();
  }

  isGameplayFrozen(): boolean {
    return this.phase === 'walk' || this.phase === 'settle';
  }

  update(dt: number): void {
    this.darkLinkVisual.update(dt);
    this.targetPulse?.update(
      dt,
      this.targetGroup?.visible ?? false,
      this.phase === 'victory',
    );

    if (this.phase === 'idle') return;

    this.elapsed += dt;

    if (this.phase === 'walk') {
      this.cinematicStrobe.stop();
      if (this.darkLinkVisual.isWalkPathComplete()) {
        this.darkLinkVisual.setPathProgress(1);
        this.beginSettlePhase();
      }
      return;
    }

    if (this.phase === 'settle') {
      this.cinematicStrobe.stop();
      if (this.darkLinkVisual.updateSettle(dt)) {
        this.beginFightPhase();
      }
      return;
    }

    if (this.phase === 'fight') {
      this.cinematicStrobe.applyFightFlicker(0.22, 0.10);
      return;
    }

    if (this.phase === 'victory') {
      this.cinematicStrobe.apply(false, false, Math.max(0, 1 - this.elapsed / VICTORY_DURATION));
      if (this.elapsed >= VICTORY_DURATION) {
        this.hideBoss();
      }
    }
  }

  dispose(): void {
    this.resetState();
    this.cinematicStrobe.dispose();
    this.darkLinkVisual.dispose();
    if (this.targetGroup) this.targetGroup.parent?.remove(this.targetGroup);
    for (const g of this.ownedGeos) g.dispose();
    for (const m of this.ownedMats) m.dispose();
    this.ownedGeos = [];
    this.ownedMats = [];
    this.onFightEnd    = null;
    this.onTargetReady = null;
    this.cinematicStrobe = new PlayfieldCinematicStrobe();
    this.darkLinkVisual  = new DarkLinkTargetVisual();
    this.targetGroup  = null;
    this.targetRingMat = null;
    this.targetCoreMat = null;
    this.targetLight  = null;
    this.targetPulse  = null;
    this.phase   = 'idle';
    this.elapsed = 0;
  }

  // ── Privé ────────────────────────────────────────────────────────────────

  private startWalkPhase(): void {
    if (this.phase !== 'idle') return;
    this.phase = 'walk';
    this.elapsed = 0;
    this.targetPulse?.reset();
    this.darkLinkVisual.beginReveal();
    this.darkLinkVisual.show();
    this.darkLinkVisual.prepareWalk();
    this.cinematicStrobe.stop();
  }

  private beginSettlePhase(): void {
    this.phase = 'settle';
    this.elapsed = 0;
    this.darkLinkVisual.startSettle();
  }

  private beginFightPhase(): void {
    this.phase = 'fight';
    this.elapsed = 0;
    this.darkLinkVisual.setPathProgress(1);
    if (this.targetGroup) this.targetGroup.visible = true;
    this.onTargetReady?.();
  }

  private beginVictory(): void {
    this.phase = 'victory';
    this.elapsed = 0;
    this.darkLinkVisual.playDead();
    this.onFightEnd?.();
    if (this.targetGroup) this.targetGroup.visible = false;
  }

  private hideBoss(): void {
    this.darkLinkVisual.hide();
    if (this.targetGroup) this.targetGroup.visible = false;
    this.resetState();
  }

  private resetState(): void {
    this.phase = 'idle';
    this.elapsed = 0;
    this.darkLinkVisual.hide();
    if (this.targetGroup) {
      this.targetGroup.visible = false;
      this.targetGroup.scale.setScalar(1);
      this.targetGroup.rotation.z = 0;
    }
    this.targetPulse?.reset();
    this.cinematicStrobe.stop();
  }

  private buildTargetMesh(): THREE.Group {
    const parts = createBossTargetMesh(getBossDefinition('darklink').targetMeshTheme);
    this.targetRingMat = parts.ringMat;
    this.targetCoreMat = parts.coreMat;
    this.targetLight   = parts.light;
    this.ownedGeos.push(...parts.ownedGeos);
    this.ownedMats.push(...parts.ownedMats);
    return parts.group;
  }

  private initTargetPulse(): void {
    if (!this.targetGroup) return;
    this.targetPulse = new BossTargetPulse(getBossDefinition('darklink').targetPulse, {
      targetGroup: this.targetGroup,
      ringMat:     this.targetRingMat,
      coreMat:     this.targetCoreMat,
      light:       this.targetLight,
    });
  }
}
