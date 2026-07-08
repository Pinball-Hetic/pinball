import type * as THREE from "three";
import {
  computeIdleSpawnLock,
  computeLaneStraightLock,
  computeSurfaceSnap,
  computeSpeedClamp,
  type BallPhysics,
  type StuckBallDetector,
  type DetectBottomOut,
  type MapLayout,
  type ShooterLaneGate,
  type BallResetReason,
} from "@pinball/game-engine";
import type { GameState } from "@/hooks/useGameState";

// Z threshold below which the stuck-ball detector is active (above = drain
// zone, let the ball go).
// TODO: derive from mapLayout.sensors instead of this inherited magic number.
export const STUCK_ZONE_MAX_Z = 0.22;

export interface BallSyncDeps {
  ball: BallPhysics;
  ballMesh: THREE.Object3D;
  gameState: GameState;
  freezeFrame: boolean;
  physicsReady: boolean;
  isDragging: boolean;
  bossIntroActive: boolean;
  bossIntroBallPos: { x: number; y: number; z: number };
  layout: MapLayout;
  shooterLaneGate: ShooterLaneGate | null;
  stuckDetector: StuckBallDetector;
  bottomOutDetector: DetectBottomOut;
  triggerBottomOut: (reason: BallResetReason) => void;
  dt: number;
  alpha: number;
}

// The step order below is load-bearing — do not reorder the locks/snaps/clamps.
export function stepBallSync(d: BallSyncDeps): void {
  const { ball, ballMesh, gameState, layout } = d;

  if (d.bossIntroActive && gameState === "playing") {
    const p = d.bossIntroBallPos;
    ball.body.setTranslation({ x: p.x, y: p.y, z: p.z }, true);
    ball.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    ball.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    ball.syncToMeshInterpolated(ballMesh, d.alpha);
    return;
  }

  if (d.freezeFrame) return;

  if (gameState === "idle" && d.physicsReady && !d.isDragging) {
    const lock = computeIdleSpawnLock(layout.spawns.ball);
    ball.body.setTranslation(lock.translation, true);
    ball.body.setLinvel(lock.linvel, true);
    ball.body.setAngvel(lock.angvel, true);
  }

  if (gameState === "playing" && !d.isDragging && !d.shooterLaneGate?.isClosed()) {
    const laneLock = computeLaneStraightLock(
      ball.body.translation(),
      ball.body.linvel(),
      ball.body.angvel(),
      layout.shooterLane,
      layout.spawns.ball.x,
    );
    if (laneLock === "close") {
      d.shooterLaneGate?.close();
    } else if (laneLock) {
      ball.body.setTranslation(laneLock.translation, true);
      ball.body.setLinvel(laneLock.linvel, true);
      ball.body.setAngvel(laneLock.angvel, true);
    }
  }

  if (gameState === "playing" && !d.isDragging) {
    const snap = computeSurfaceSnap(ball.body.translation(), ball.body.linvel(), layout.shooterLane);
    if (snap) {
      ball.body.setTranslation(snap.translation, true);
      if (snap.linvel) ball.body.setLinvel(snap.linvel, true);
    }
  }

  ball.syncToMeshInterpolated(ballMesh, d.alpha);

  const clampedVel = computeSpeedClamp(ball.body.linvel());
  if (clampedVel) ball.body.setLinvel(clampedVel, true);

  const bPos = ball.body.translation();
  const bVel = ball.body.linvel();
  const bSpd = Math.sqrt(bVel.x ** 2 + bVel.y ** 2 + bVel.z ** 2);

  // Skip during a debug drag: a ball held still would be force-drained = lost life.
  if (gameState === "playing" && !d.isDragging && bPos.z < STUCK_ZONE_MAX_Z) {
    const stuck = d.stuckDetector.update(bSpd, bPos, d.dt);
    if (stuck) {
      if (stuck.type === "force_drain") {
        d.triggerBottomOut("stuck_force_drain");
      } else if (stuck.impulse) {
        ball.body.applyImpulse(stuck.impulse, true);
      }
    }
  } else {
    d.stuckDetector.reset();
  }

  // Skip during a debug drag: the ball can be dragged through without draining.
  if (gameState === "playing" && !d.isDragging && d.bottomOutDetector.check(bPos)) {
    d.triggerBottomOut("bottom_out_zone");
  }
}
