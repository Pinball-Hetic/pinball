import type { MutableRefObject } from "react";
import {
  Plunger,
  LaunchBall,
  BumperHit,
  BumpHit,
  DrainBall,
  BottomOutBall,
  CollisionEventProcessor,
  type BallPhysics,
  type BallDiagnostics,
  type GameEventListener,
  type MapModule,
  type MapLayout,
  type ShooterLaneGate,
  type ScreenShake,
} from "@pinball/game-engine";
import type * as THREE from "three";
import { createEmitRouter } from "./scene/createEmitRouter";
import type { GameState } from "@/hooks/useGameState";
import type { useDmdOrchestrator } from "@/hooks/useDmdOrchestrator";
import type { PlayfieldCameraRig } from "./scene/PlayfieldCameraRig";

type EmitRouterDeps = Parameters<typeof createEmitRouter>[0];

export interface WireGameplayDeps {
  ball: BallPhysics;
  colliderMap: Map<number, string>;
  mapLayout: MapLayout;
  mapBosses: EmitRouterDeps["mapBosses"];
  mapModule: MapModule | null;
  cameraRig: PlayfieldCameraRig;
  dmd: ReturnType<typeof useDmdOrchestrator>;
  screenShake: ScreenShake;
  diag: BallDiagnostics;
  buildEmit: (hideBall: () => void) => GameEventListener;
  /** hides the ball at game over (reads the live mesh) */
  hideBallMesh: () => void;
  restoreBossCamera: () => void;
  clearAlternateWorldSession: () => void;
  getShooterLaneGate: () => ShooterLaneGate | null;
  getPlayfieldRoot: () => THREE.Object3D | null;
  livesRef: MutableRefObject<number>;
  gameStateRef: MutableRefObject<GameState>;
  scoreRef: MutableRefObject<number>;
  alternateWorldPersistence: EmitRouterDeps["ALTERNATE_WORLD_PERSISTENCE"];
}

export interface GameplayWiring {
  plunger: Plunger;
  emit: GameEventListener;
  launchBallUC: LaunchBall;
  bumperHitUC: BumperHit;
  bumpHitUC: BumpHit;
  drainBallUC: DrainBall;
  bottomOutBallUC: BottomOutBall;
  collisionProcessor: CollisionEventProcessor;
}

// Wires the gameplay core: event router (createEmitRouter), use-cases, and
// CollisionEventProcessor. ⚠ INTENTIONAL CYCLE: the processor is built WITH
// `emit`, and `emit` routes to the processor through lazy getters — the
// getters below resolve to THIS factory's locals, assigned before any event.
// Do not break this cycle (JSDoc contract in CollisionEventProcessor /
// createEmitRouter).
export function wireGameplay(d: WireGameplayDeps): GameplayWiring {
  const plunger = new Plunger();

  const baseEmit = d.buildEmit(() => {
    d.hideBallMesh();
    d.diag.noteReset("game_over_hide");
  });

  const releaseAlternateWorld = () => {
    d.restoreBossCamera();
    d.mapModule?.releaseWorld?.();
    collisionProcessor?.resetAlternateWorldSession();
    d.clearAlternateWorldSession();
  };

  // Cycle forward refs: assigned below, read lazily by the router.
  let drainBallUC: DrainBall | null = null;
  let bottomOutBallUC: BottomOutBall | null = null;
  let collisionProcessor: CollisionEventProcessor | null = null;

  const emit = createEmitRouter({
    baseEmit,
    mapModule: d.mapModule,
    getCollisionProcessor: () => collisionProcessor,
    cameraRig: d.cameraRig,
    dmd: d.dmd,
    screenShake: d.screenShake,
    diag: d.diag,
    getShooterLaneGate: d.getShooterLaneGate,
    getPlayfieldRoot: d.getPlayfieldRoot,
    mapLayout: d.mapLayout,
    mapBosses: d.mapBosses,
    getBottomOutBallUC: () => bottomOutBallUC,
    getDrainBallUC: () => drainBallUC,
    releaseAlternateWorld,
    livesRef: d.livesRef,
    gameStateRef: d.gameStateRef,
    scoreRef: d.scoreRef,
    ALTERNATE_WORLD_PERSISTENCE: d.alternateWorldPersistence,
  });

  const launchBallUC = new LaunchBall(d.ball, plunger, emit);
  const bumperHitUC = new BumperHit(d.ball, emit);
  const bumpHitUC = new BumpHit(d.ball, emit);
  drainBallUC = new DrainBall(d.ball, emit);
  bottomOutBallUC = new BottomOutBall(d.ball, emit);

  collisionProcessor = new CollisionEventProcessor(
    d.mapLayout,
    d.colliderMap,
    bumperHitUC,
    bumpHitUC,
    drainBallUC,
    bottomOutBallUC,
    emit,
  );

  return {
    plunger,
    emit,
    launchBallUC,
    bumperHitUC,
    bumpHitUC,
    drainBallUC,
    bottomOutBallUC,
    collisionProcessor,
  };
}
