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
  /** Base emit (buildEmit) — react-scope scoring/lives/reset. */
  baseEmit: GameEventListener;
  /** Map module (optional depending on the map). */
  mapModule: MapModule | null;
  /** Lazy access to the processor (assigned after the factory). */
  getCollisionProcessor: () => CollisionEventProcessor | null;
  cameraRig: PlayfieldCameraRig;
  dmd: DmdOrchestrator;
  screenShake: ScreenShake;
  diag: BallDiagnostics;
  /** Lazy access to the shooter-lane gate (assigned after the factory). */
  getShooterLaneGate: () => ShooterLaneGate | null;
  /** Lazy access to the playfield root (assigned at GLB load). */
  getPlayfieldRoot: () => THREE.Object3D | null;
  mapLayout: MapLayout;
  mapBosses: BossDefinition[];
  /** Lazy access to the bottom-out use-case (assigned after the factory). */
  getBottomOutBallUC: () => BottomOutBall | null;
  /** Lazy access to the drain use-case (assigned after the factory). */
  getDrainBallUC: () => DrainBall | null;
  /** Releases the alternate world (react-scope: restoreBossCamera + clear session). */
  releaseAlternateWorld: () => void;
  livesRef: { current: number };
  gameStateRef: { current: GameState };
  scoreRef: { current: number };
  ALTERNATE_WORLD_PERSISTENCE: AlternateWorldPersistence;
}

/**
 * Game-loop event router (the "god-router"). Closes over its collaborators
 * through the `deps` object (lazy getters for the `let`s assigned later in
 * PinballPlayfield's effect).
 *
 * Not pure: mutates THREE meshes (drop targets), drives Rapier via the
 * processor, the cinematic camera and the DMD. Lives in the apps/playfield
 * glue, not in game-engine.
 */
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

  /**
   * Event sink injected into the CollisionEventProcessor and the game loop.
   *
   * GUARANTEED fan-out order per event (contract — see also the JSDoc of
   * CollisionEventProcessor's `emit` parameter):
   *
   *   1. mapModule.onPreDrain(pre-decrement lives) — DRAIN/BOTTOM_OUT only.
   *   2. baseEmit (useGameState) — scoring, life decrement, reset.
   *   3. mapModule.onGameEvent — visuals, world switch, boss reveals.
   *
   * The load-bearing invariant is 1 before 2: `onPreDrain` runs BEFORE
   * `baseEmit` reads/decrements lives, so a map can grant a save life on the
   * last ball (it sees the pre-decrement count). Do not reorder these three
   * calls. The react-scope effects that follow (screen shake, camera, DMD,
   * cleanup) observe post-scoring state and carry no ordering contract among
   * themselves.
   */
  const emit: GameEventListener = (event: GameEvent) => {
    const collisionProcessor = getCollisionProcessor();

    // ── Phase 1: pre-drain (last-life save) ──────────────────────────────
    // The map can grant a life BEFORE the decrement (handleDrain) to avoid
    // the game over. It receives the pre-decrement life count (livesRef not
    // yet modified by baseEmit).
    if (event.type === "DRAIN" || event.type === "BOTTOM_OUT") {
      mapModule?.onPreDrain?.(livesRef.current);
    }

    // ── Phase 2: baseEmit (scoring / lives / reset, react-scope) ─────────
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

    // ── Phase 3: mapModule.onGameEvent (observes post-scoring state) ─────
    mapModule?.onGameEvent(event);

    // ── Per-event screen shake (juice) ───────────────────────────────────
    if (event.type === "BUMPER_HIT") screenShake.add(0.25);
    else if (event.type === "SLINGSHOT_HIT") screenShake.add(0.2);
    else if (event.type === "DROP_TARGET_HIT") screenShake.add(0.35);
    else if (event.type === "DROP_TARGET_COMPLETE") screenShake.add(0.6);
    else if (event.type === "BOSS_TARGET_HIT") {
      // Generic juice: any boss-target hit shakes the screen.
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
      // The world switch itself is handled by the map module (onGameEvent).
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
      // GLB meshes follow the target_<id> convention (e.g. target_left_1);
      // the drop id is drop_<id> → recover the visual mesh from it.
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
