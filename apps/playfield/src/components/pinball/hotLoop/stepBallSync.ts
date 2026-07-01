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

// Seuil Z sous lequel le détecteur de balle coincée est actif (au-dessus = zone
// de drain, on laisse partir). Magic number hérité — à dériver de mapLayout.sensors
// à terme (backlog P2 Strategy), gardé littéral ici pour préserver le comportement.
export const STUCK_ZONE_MAX_Z = 0.22;

export interface BallSyncDeps {
  ball: BallPhysics;
  ballMesh: THREE.Object3D;
  gameState: GameState;
  freezeFrame: boolean;
  physicsReady: boolean;
  isMoveMode: boolean;
  bossIntroActive: boolean;
  bossIntroBallPos: { x: number; y: number; z: number };
  layout: MapLayout;
  shooterLaneGate: ShooterLaneGate | null;
  stuckDetector: StuckBallDetector;
  bottomOutDetector: DetectBottomOut;
  triggerBottomOut: (reason: BallResetReason) => void;
  dt: number;
}

// Synchronisation bille ↔ physique pour une frame (appelée quand bille visible +
// physique prête). Orchestration IMPÉRATIVE des locks/snaps/clamps/détecteurs —
// les DÉCISIONS sont des helpers PURS game-engine déjà testés (computeIdleSpawnLock/
// LaneStraightLock/SurfaceSnap/SpeedClamp) ; ici on lit/applique sur le body. Args
// live chaque frame → aucun stale-binding. Ordre load-bearing préservé 1:1.
export function stepBallSync(d: BallSyncDeps): void {
  const { ball, ballMesh, gameState, layout } = d;

  // Boss intro : bille tenue en place (pas de physique).
  if (d.bossIntroActive && gameState === "playing") {
    const p = d.bossIntroBallPos;
    ball.body.setTranslation({ x: p.x, y: p.y, z: p.z }, true);
    ball.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    ball.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    ball.syncToMesh(ballMesh);
    return;
  }

  if (d.freezeFrame) return;

  // Balle figée au spawn en idle (y compris pendant la charge) — évite le glissement.
  if (gameState === "idle" && d.physicsReady && !d.isMoveMode) {
    const lock = computeIdleSpawnLock(layout.spawns.ball);
    ball.body.setTranslation(lock.translation, true);
    ball.body.setLinvel(lock.linvel, true);
    ball.body.setAngvel(lock.angvel, true);
  }

  // Verrouillage latéral du couloir pendant la montée (lancement droit).
  if (gameState === "playing" && !d.isMoveMode && !d.shooterLaneGate?.isClosed()) {
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

  // Surface snap : recolle la balle au sol incliné.
  if (gameState === "playing" && !d.isMoveMode) {
    const snap = computeSurfaceSnap(ball.body.translation(), ball.body.linvel(), layout.shooterLane);
    if (snap) {
      ball.body.setTranslation(snap.translation, true);
      if (snap.linvel) ball.body.setLinvel(snap.linvel, true);
    }
  }

  ball.syncToMesh(ballMesh);

  // Clamp vitesse.
  const clampedVel = computeSpeedClamp(ball.body.linvel());
  if (clampedVel) ball.body.setLinvel(clampedVel, true);

  const bPos = ball.body.translation();
  const bVel = ball.body.linvel();
  const bSpd = Math.sqrt(bVel.x ** 2 + bVel.y ** 2 + bVel.z ** 2);

  // Détecteur balle coincée — seulement hors zone de drain.
  if (gameState === "playing" && bPos.z < STUCK_ZONE_MAX_Z) {
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

  // Bottom-out fallback — zone sous les flippers hors couloir.
  if (gameState === "playing" && d.bottomOutDetector.check(bPos)) {
    d.triggerBottomOut("bottom_out_zone");
  }
  // Drain nominal géré par le capteur Rapier bottom_out (CollisionEventProcessor).
}
