import type * as THREE from 'three';
import type { MapManifest, MapState } from '@pinball/shared-types';
import type { GameEvent } from './GameEvents';
import type { BossGateContext } from './BossRegistry';
import type { MapLayout } from './MapLayout';
import type { IPhysicsWorld } from './IPhysicsWorld';
import type { IMapBallPhysics } from './IBallPhysics';

export interface CinematicOpts {
  once?: boolean;
  value?: number;
  onEnd?: () => void;
}

export interface MapLighting {
  renderer: THREE.WebGLRenderer;
  ambient: THREE.AmbientLight;
  hemi: THREE.HemisphereLight;
  dir: THREE.DirectionalLight;
  fill: THREE.DirectionalLight;
}

export interface MapContext {
  scene: THREE.Scene;
  root: THREE.Object3D;
  camera: THREE.Camera;
  physics: IPhysicsWorld;
  layout: MapLayout;
  manifest: MapManifest;
  lighting: MapLighting;
  colliderMap: Map<number, string>;
  readonly ball: IMapBallPhysics | null;
  readonly ballMesh: THREE.Object3D | null;

  resetPortalTrigger(): void;
  completeWorldCycle(): void;
  resetStuck(): void;
  enterAlternateWorld(): void;
  playSound(id: string): void;
  refreshScoreSnapshot(): void;
  screenShake(amount: number): void;
  isFeverActive(): boolean;
  gameState(): string;
  resolve(name: string): THREE.Object3D | null;
  setPortalGateOpen(open: boolean): void;
  setBossFightActive(bossId: string, active: boolean): void;
  setBossTargetArmed(bossId: string, armed: boolean): void;
  bossGateContext(): BossGateContext;
  isBossTriggered(bossId: string): boolean;
  addScore(points: number, label?: string): void;
  addLife(): void;
  lives(): number;
  totalScore(): number;
  setMapState(patch: MapState): void;
  forceMultiplier(value: number, durationMs: number): void;
  pushDmdEvent(label: string, points: number): void;
  playCinematic(clipId: string, opts?: CinematicOpts): void;
  setAtmosphere(active: boolean): void;
  emitGameEvent(e: GameEvent): void;
}

export interface MapModule {
  setup(ctx: MapContext): void;
  preload?(): Promise<void>;
  /**
   * Called BEFORE the life decrement (handleDrain) applies, on a
   * DRAIN/BOTTOM_OUT, with the PRE-decrement life count. Lets a map grant a
   * life before the decrement (e.g. last-life save) to avoid the game over.
   * Must do NOTHING besides that save.
   */
  onPreDrain?(livesBeforeDrain: number): void;
  onGameEvent(e: GameEvent): void;
  update(dt: number): void;
  onGameReset(): void;
  dispose(): void;
  shouldFreezePhysics?(): boolean;
  isIntroHolding?(): boolean;
  applyBallMagnet?(): void;
  setSporesEnabled?(enabled: boolean): void;
  releaseWorld?(): void;
  resetWorld?(): void;
}
