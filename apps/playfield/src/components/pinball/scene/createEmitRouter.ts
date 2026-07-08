import type * as THREE from "three";
import {
  getBossById,
  type BossDefinition,
  type BallDiagnostics,
  type BottomOutBall,
  type DrainBall,
  type CollisionEventProcessor,
  type GameEvent,
  type GameEventListener,
  type MapLayout,
  type MapModule,
  type ScreenShake,
  type ShooterLaneGate,
} from "@pinball/game-engine";
import type { GameState } from "@/hooks/useGameState";
import type { PlayfieldCameraRig } from "./PlayfieldCameraRig";
import type { DmdOrchestrator } from "@/hooks/useDmdOrchestrator";

type AlternateWorldPersistence = "until_game_over" | "until_drain";

export interface EmitRouterDeps {
  baseEmit: GameEventListener;
  mapModule: MapModule | null;
  getCollisionProcessor: () => CollisionEventProcessor | null;
  cameraRig: PlayfieldCameraRig;
  dmd: DmdOrchestrator;
  screenShake: ScreenShake;
  diag: BallDiagnostics;
  getShooterLaneGate: () => ShooterLaneGate | null;
  getPlayfieldRoot: () => THREE.Object3D | null;
  mapLayout: MapLayout;
  mapBosses: BossDefinition[];
  getBottomOutBallUC: () => BottomOutBall | null;
  getDrainBallUC: () => DrainBall | null;
  releaseAlternateWorld: () => void;
  livesRef: { current: number };
  gameStateRef: { current: GameState };
  scoreRef: { current: number };
  ALTERNATE_WORLD_PERSISTENCE: AlternateWorldPersistence;
}

export function createEmitRouter(deps: EmitRouterDeps): GameEventListener {
  const {
    baseEmit,
    mapModule,
    getCollisionProcessor,
    cameraRig,
    dmd,
    screenShake,
    diag,
    getShooterLaneGate,
    getPlayfieldRoot,
    mapLayout,
    mapBosses,
    getBottomOutBallUC,
    getDrainBallUC,
    releaseAlternateWorld,
    livesRef,
    gameStateRef,
    scoreRef,
    ALTERNATE_WORLD_PERSISTENCE,
  } = deps;

  const restoreBossCamera = () => {
    cameraRig.restoreBoss();
  };

  // Load-bearing fan-out order: onPreDrain (1) must run before baseEmit (2)
  // decrements lives, so a map can grant a last-ball save from the
  // pre-decrement count; onGameEvent (3) runs last on post-scoring state. Do
  // not reorder these three calls.
  const emit: GameEventListener = (event: GameEvent) => {
    const collisionProcessor = getCollisionProcessor();

    if (event.type === "DRAIN" || event.type === "BOTTOM_OUT") {
      mapModule?.onPreDrain?.(livesRef.current);
    }

    baseEmit(event);
    if (
      "scoreIncrement" in event
      && event.scoreIncrement
      && gameStateRef.current === "playing"
    ) {
      collisionProcessor?.tryAllBossReveals(scoreRef.current, gameStateRef.current);
    }
    diag.noteEvent(event.type);
    if (event.type === "DRAIN") diag.noteReset("drain");
    if (event.type === "BOTTOM_OUT") diag.noteReset("bottom_out");
    if (event.type === "DRAIN" || event.type === "BOTTOM_OUT") {
      restoreBossCamera();
    }
    if (event.type === "BALL_LAUNCHED") diag.noteReset("launch");

    mapModule?.onGameEvent(event);

    if (event.type === "BUMPER_HIT") screenShake.add(0.25);
    else if (event.type === "SLINGSHOT_HIT") screenShake.add(0.2);
    else if (event.type === "DROP_TARGET_HIT") screenShake.add(0.35);
    else if (event.type === "DROP_TARGET_COMPLETE") screenShake.add(0.6);
    else if (event.type === "BOSS_TARGET_HIT") {
      screenShake.add(0.5);
    }

    if (event.type === "BOSS_REVEAL") {
      cameraRig.director.play(event.bossId);
    }
    if (event.type === "BOSS_TARGET_HIT") {
      const boss = getBossById(mapBosses, event.bossId);
      if (boss && event.hitCount >= boss.targetHits) {
        cameraRig.director.playVictory(event.bossId);
      }
    }
    if (event.type === "RETURN_PORTAL_TRANSITION_END" || event.type === "WORLD_CYCLE_COMPLETE") {
      restoreBossCamera();
    }

    if (
      (event.type === "DRAIN" || event.type === "BOTTOM_OUT")
      && gameStateRef.current === "game_over"
    ) {
      collisionProcessor?.resetAllBossFights();
      collisionProcessor?.resetScoreBaselines();
    }
    if (event.type === "DRAIN" || event.type === "BOTTOM_OUT") {
      if (
        ALTERNATE_WORLD_PERSISTENCE === "until_drain" ||
        gameStateRef.current === "game_over"
      ) {
        releaseAlternateWorld();
      }
    }
    if (event.type === "PORTAL_ENTER") {
      dmd.pushCinematic("portal_swallow");
    }
    if (event.type === "RETURN_PORTAL_ENTER") {
      dmd.pushCinematic("portal_swallow");
    }
    if (event.type === "BALL_LAUNCHED") {
      collisionProcessor?.resetPortalTrigger();
      getBottomOutBallUC()?.resetLatch();
      getDrainBallUC()?.resetLatch();
    }
    if (event.type === "DRAIN" || event.type === "BOTTOM_OUT") {
      getShooterLaneGate()?.open();
    }
    if (event.type === 'DROP_TARGET_HIT') {
      // drop_<id> → target_<id>: the GLB visual mesh uses the target_ prefix.
      const meshName = event.targetId.replace('drop_', 'target_');
      const mesh = getPlayfieldRoot()?.getObjectByName(meshName);
      if (mesh) mesh.visible = false;
    }
    if (event.type === 'DROP_TARGET_COMPLETE' || event.type === 'DROP_TARGET_RESET') {
      for (const dt of mapLayout.dropTargets) {
        const mesh = getPlayfieldRoot()?.getObjectByName(dt.id.replace('drop_', 'target_'));
        if (mesh) mesh.visible = true;
      }
    }
  };

  return emit;
}
