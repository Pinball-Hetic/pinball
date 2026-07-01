import type { MutableRefObject } from "react";
import {
  findObjectByNormalizedName,
  type MapContext,
  type BossId,
  type BallPhysics,
  type CollisionEventProcessor,
  type GameEvent,
} from "@pinball/game-engine";
import type { MapState } from "@pinball/shared-types";
import type { GameState } from "@/hooks/useGameState";
import type { useDmdOrchestrator } from "@/hooks/useDmdOrchestrator";

type Dmd = ReturnType<typeof useDmdOrchestrator>;

// Dépendances du MapContext. Les collaborateurs assignés APRÈS ce build
// (ball / ballMesh / collisionProcessor / emit) sont passés en getters/closures
// live-bound — JAMAIS en snapshots, sinon le contexte se fige.
export interface MapContextDeps {
  // Passthrough (typés via MapContext → match garanti).
  scene: MapContext["scene"];
  root: MapContext["root"];
  camera: MapContext["camera"];
  physics: MapContext["physics"];
  layout: MapContext["layout"];
  manifest: MapContext["manifest"];
  colliderMap: MapContext["colliderMap"];
  lighting: MapContext["lighting"];

  // Forward-refs live.
  getBall: () => BallPhysics | null;
  getBallMesh: () => MapContext["ballMesh"];
  getCollisionProcessor: () => CollisionEventProcessor | null;
  emit: (e: GameEvent) => void;

  // Refs d'état.
  scoreRef: MutableRefObject<number>;
  comboRef: MutableRefObject<number>;
  multiplierRef: MutableRefObject<number>;
  livesRef: MutableRefObject<number>;
  playerRef: MutableRefObject<string>;
  gameStateRef: MutableRefObject<GameState>;
  mapStateExtraRef: MutableRefObject<Record<string, unknown>>;
  atmosphereAlternateRef: MutableRefObject<boolean>;

  // Collaborateurs.
  dmd: Dmd;
  screenShakeAdd: (amount: number) => void;
  resetStuck: () => void;
  playCinematicSound: (url: string, volume?: number) => void;
  addLife: () => void;
  startFever: (durationMs: number) => void;
  isFeverActive: () => boolean;
  playCinematic: (clipId: string, opts?: { value?: number }) => void;
  buildMapState: () => MapState;
}

// Construit le MapContext passé à mapModule.setup() : le sac de closures par
// lequel un module de map pilote scène / physique / score / DMD / cinématiques.
// C'est la plus grande surface de couplage de l'init — l'isoler ici documente le
// contrat et allège la closure d'init. Behavior-preserving 1:1.
export function createMapContext(deps: MapContextDeps): MapContext {
  const {
    scene, root, camera, physics, layout, manifest, colliderMap, lighting,
    getBall, getBallMesh, getCollisionProcessor, emit,
    scoreRef, comboRef, multiplierRef, livesRef, playerRef, gameStateRef,
    mapStateExtraRef, atmosphereAlternateRef,
    dmd, screenShakeAdd, resetStuck, playCinematicSound,
    addLife, startFever, isFeverActive, playCinematic, buildMapState,
  } = deps;

  const snapshot = () => ({
    player: playerRef.current,
    score: scoreRef.current,
    combo: comboRef.current,
    multiplier: multiplierRef.current,
    lives: livesRef.current,
    mapState: buildMapState(),
  });

  return {
    scene,
    root,
    camera,
    physics,
    layout,
    manifest,
    colliderMap,
    get ball() {
      return getBall();
    },
    get ballMesh() {
      return getBallMesh();
    },
    resetPortalTrigger: () => getCollisionProcessor()?.resetPortalTrigger(),
    completeWorldCycle: () => getCollisionProcessor()?.completeWorldCycle(scoreRef.current),
    resetStuck,
    enterAlternateWorld: () => getCollisionProcessor()?.onAlternateWorldEntered(scoreRef.current),
    playSound: (id) => {
      const s = manifest.sounds?.[id];
      if (s) playCinematicSound(s.url, s.volume);
    },
    refreshScoreSnapshot: () => {
      const snap = snapshot();
      dmd.emitScoreSnapshot(snap);
      dmd.pushScore(snap);
    },
    screenShake: (amount) => screenShakeAdd(amount),
    isFeverActive: () => isFeverActive(),
    gameState: () => gameStateRef.current,
    lighting,
    resolve: (name) => findObjectByNormalizedName(root, name) ?? null,
    setPortalGateOpen: (open) => getCollisionProcessor()?.setPortalOpen(open),
    setBossFightActive: (bossId, active) =>
      getCollisionProcessor()?.setBossFightActive(bossId as BossId, active),
    setBossTargetArmed: (bossId, armed) =>
      getCollisionProcessor()?.setBossTargetArmed(bossId as BossId, armed),
    bossGateContext: () => ({
      totalScore: scoreRef.current,
      alternateWorldActive: getCollisionProcessor()?.isAlternateWorldActive() ?? false,
      normalWorldScoreBaseline: getCollisionProcessor()?.getNormalWorldScoreBaseline() ?? 0,
      alternateWorldScoreBaseline: getCollisionProcessor()?.getAlternateWorldScoreBaseline() ?? 0,
    }),
    isBossTriggered: (bossId) =>
      getCollisionProcessor()?.isBossTriggered(bossId as BossId) ?? false,
    addScore: (points, label) =>
      emit({ type: "ZONE_HIT", zone: label ?? "", scoreIncrement: points }),
    addLife: () => addLife(),
    lives: () => livesRef.current,
    totalScore: () => scoreRef.current,
    setMapState: (patch) => {
      Object.assign(mapStateExtraRef.current, patch);
    },
    forceMultiplier: (_value, durationMs) => startFever(durationMs),
    pushDmdEvent: (label, points) => dmd.pushEvent(label, points, snapshot()),
    playCinematic: (clipId, opts) => playCinematic(clipId, opts),
    setAtmosphere: (active) => {
      dmd.setAtmosphere(active);
      atmosphereAlternateRef.current = active;
    },
    emitGameEvent: (e) => emit(e),
  };
}
