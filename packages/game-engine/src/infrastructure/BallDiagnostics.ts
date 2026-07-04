import type { MapLayout } from '../domain/MapLayout';
import {
  BALL_LOST_Y_THRESHOLD,
  isBallOutOfBounds,
  isInBottomOutZone,
  bottomOutLaneSepX,
} from '../domain/PlayfieldGeometry';

export type BallLostReason = 'escaped_below_floor' | 'escaped_out_of_bounds';

export type BallResetReason =
  | 'launch'
  | 'drain'
  | 'bottom_out'
  | 'bottom_out_zone'
  | 'stuck_force_drain'
  | 'lost_recovery'
  | 'game_over_hide';

export type BallZone = 'lane' | 'playfield' | 'drain_zone' | 'out_of_bounds';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface BallDiagnosticsSnapshot {
  pos: Vec3;
  vel: Vec3;
  speed: number;
  zone: BallZone;
  gameState: string;
  lastEvent: string | null;
  lastReset: BallResetReason | null;
  lastLost: BallLostReason | null;
  lostCount: number;
  /** Highest point reached since launch (most negative Z). */
  apexZ: number;
  /** Ball X at the apex. */
  apexX: number;
  /** Peak speed since the last launch. */
  peakSpeed: number;
  /** Total detected crossings of the lane's left wall (sentinel). */
  wallCrossCount: number;
}

export interface BallLostEvent {
  reason: BallLostReason;
  pos: Vec3;
  vel: Vec3;
  speed: number;
}

interface DiagBody {
  translation(): Vec3;
  linvel(): Vec3;
}

// Single source of truth for labels (reused by the BallDebugOverlay HUD).
export const RESET_LABELS: Record<BallResetReason, string> = {
  launch: 'Lancement',
  drain: 'Drain (capteur)',
  bottom_out: 'Bottom-out (capteur)',
  bottom_out_zone: 'Bottom-out (zone géométrique)',
  stuck_force_drain: 'Balle bloquée → drain forcé',
  lost_recovery: 'Balle perdue → reset de secours',
  game_over_hide: 'Game over (balle masquée)',
};

export const LOST_LABELS: Record<BallLostReason, string> = {
  escaped_below_floor: 'Tombée sous le tapis (a traversé le sol)',
  escaped_out_of_bounds: 'Sortie hors des limites du terrain (X/Z)',
};

// ── Lane left-wall crossing tracer ─────────────────────────────────────────────
// The lane's left wall is centered on lane.xMin, thickness lane.wallThickness
// → inner/outer faces at ±thickness/2 (computed in the constructor). The ball
// is traced as soon as it enters a wide X band around the wall, and any
// frame-to-frame crossing (inner→outer or reverse) is reported.
const WALL_BAND_X_MIN = 0.17;
const WALL_BAND_X_MAX = 0.23;

/**
 * Tracks the ball every frame and explains why it disappears or leaves the
 * playfield: zone classification, physical escape detection (below floor /
 * out of bounds) and a reset-cause log. Read-only on the Rapier body.
 */
export class BallDiagnostics {
  /** Enables console logs (LaneFlight trace, apex, losses, resets).
   *  Driven by the playfield HUD `[J]` toggle → fully silent in prod. */
  verbose = false;

  private readonly lane: MapLayout['shooterLane'];
  private readonly wallFaceInner: number;
  private readonly wallFaceOuter: number;
  private readonly laneSepX: number;

  constructor(layout: MapLayout) {
    this.lane = layout.shooterLane;
    this.wallFaceInner = this.lane.xMin - this.lane.wallThickness / 2; // ≈ 0.196
    this.wallFaceOuter = this.lane.xMin + this.lane.wallThickness / 2; // ≈ 0.216
    this.laneSepX = bottomOutLaneSepX(layout.spawns.ball.x);
  }

  private snapshot: BallDiagnosticsSnapshot = {
    pos: { x: 0, y: 0, z: 0 },
    vel: { x: 0, y: 0, z: 0 },
    speed: 0,
    zone: 'playfield',
    gameState: 'idle',
    lastEvent: null,
    lastReset: null,
    lastLost: null,
    lostCount: 0,
    apexZ: 0,
    apexX: 0,
    peakSpeed: 0,
    wallCrossCount: 0,
  };

  private lostLatched = false;
  private apexZ = Number.POSITIVE_INFINITY;
  private apexLogged = false;
  private peakSpeed = 0;

  // ── Launch flight tracer ───────────────────────────────────────────────────
  // Samples pos/vel during the climb up the lane to see EXACTLY where and how
  // the ball stops (gradual energy loss vs hard stop against GLB geometry).
  // Armed on every 'launch' reset, disarmed when the ball leaves the lane
  // (low X) or falls back down, or after a frame cap to avoid console spam.
  private traceActive = false;
  private traceFrame = 0;
  private traceSampleCount = 0;
  private traceMaxSamples = 90;
  private traceEverStep = 6; // 1 sample every ~6 frames (~100 ms)
  private prevTraceVz = 0;

  // ── Left-wall crossing tracer ────────────────────────────────────────────────
  // Previous frame's X (NaN = not yet in the band). Detects passing from one
  // wall face to the other between 2 frames.
  private prevWallX = Number.NaN;

  /** Updates the snapshot and reports a loss (once per episode). */
  update(body: DiagBody, gameState: string): BallLostEvent | null {
    const p = body.translation();
    const v = body.linvel();
    const speed = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);

    // Launch flight tracer (before everything else, to capture the climb).
    this.traceLaneFlight(p, v, speed, gameState);

    this.traceWallCross(p, v);

    if (gameState === 'playing' && speed > this.peakSpeed) {
      this.peakSpeed = speed;
      this.snapshot = { ...this.snapshot, peakSpeed: speed };
    }

    // Apex = most negative Z since the last launch.
    if (gameState === 'playing' && p.z < this.apexZ) {
      this.apexZ = p.z;
      this.snapshot = { ...this.snapshot, apexZ: p.z, apexX: p.x };
    }
    // Log the apex once, when the ball starts moving back down the lane.
    if (
      gameState === 'playing' &&
      !this.apexLogged &&
      v.z > 0.05 &&
      Number.isFinite(this.apexZ)
    ) {
      this.apexLogged = true;
      if (this.verbose) {
        // eslint-disable-next-line no-console
        console.info(
          `[BallDiagnostics] Apogée atteinte — Z min = ${this.apexZ.toFixed(3)} (X = ${this.snapshot.apexX.toFixed(3)}), ` +
            `vitesse de pointe = ${this.peakSpeed.toFixed(2)} m/s. ` +
            'Guide de sortie attendu vers Z ≈ -0.40 à -0.49.',
        );
      }
    }

    this.snapshot = {
      ...this.snapshot,
      pos: { x: p.x, y: p.y, z: p.z },
      vel: { x: v.x, y: v.y, z: v.z },
      speed,
      zone: this.classifyZone(p),
      gameState,
    };

    const reason = this.detectLost(p);
    if (!reason) {
      this.lostLatched = false;
      return null;
    }

    if (this.lostLatched) return null;
    this.lostLatched = true;

    this.snapshot = {
      ...this.snapshot,
      lastLost: reason,
      lostCount: this.snapshot.lostCount + 1,
    };

    if (this.verbose) {
      // eslint-disable-next-line no-console
      console.error(
        `[BallDiagnostics] BALLE PERDUE — ${LOST_LABELS[reason]}`,
        {
          reason,
          pos: this.snapshot.pos,
          vel: this.snapshot.vel,
          speed: this.snapshot.speed,
          gameState,
        },
      );
    }

    return { reason, pos: this.snapshot.pos, vel: this.snapshot.vel, speed };
  }

  /**
   * Samples the ball trajectory during the launch flight. Logs X/Y/Z + speed
   * to reveal where and how the ball stops. Also detects the Z reversal
   * (climb → descent) and the lane exit.
   */
  private traceLaneFlight(p: Vec3, v: Vec3, speed: number, gameState: string): void {
    if (!this.traceActive || gameState !== 'playing') return;
    this.traceFrame++;

    // Successful lane exit: the ball reached the playfield (low X).
    if (p.x < this.lane.exitX) {
      this.traceActive = false;
      if (this.verbose) {
        // eslint-disable-next-line no-console
        console.info(
          `[LaneFlight] ✅ SORTIE couloir — la balle a rejoint le terrain à ` +
            `Z=${p.z.toFixed(3)} X=${p.x.toFixed(3)} (v=${speed.toFixed(2)} m/s, vx=${v.x.toFixed(2)}).`,
        );
      }
      return;
    }

    // Fell back to the bottom of the lane without exiting → failed launch.
    if (p.z > this.lane.failZ && this.traceSampleCount > 3) {
      this.traceActive = false;
      if (this.verbose) {
        // eslint-disable-next-line no-console
        console.warn(
          `[LaneFlight] ⛔ ÉCHEC — la balle est retombée en bas du couloir ` +
            `(Z=${p.z.toFixed(3)} X=${p.x.toFixed(3)}) sans rejoindre le terrain. ` +
            `Apogée=${this.apexZ.toFixed(3)}. Elle a calé puis glissé en arrière.`,
        );
      }
      return;
    }

    // Z direction reversal (apex) → explicit marker, bypasses the throttle.
    const reversedZ = this.prevTraceVz < -0.02 && v.z > 0.02;
    this.prevTraceVz = v.z;

    const due = this.traceFrame % this.traceEverStep === 0;
    if (!reversedZ && !due) return;
    if (this.traceSampleCount >= this.traceMaxSamples) return;
    this.traceSampleCount++;

    if (!this.verbose) return;
    const tag = reversedZ ? ' ⤴ APOGÉE (inversion Z)' : '';
    // eslint-disable-next-line no-console
    console.info(
      `[LaneFlight #${this.traceSampleCount}] ` +
        `Z=${p.z.toFixed(3)} X=${p.x.toFixed(3)} Y=${p.y.toFixed(3)} | ` +
        `v=${speed.toFixed(2)} (vx=${v.x.toFixed(2)} vy=${v.y.toFixed(2)} vz=${v.z.toFixed(2)})${tag}`,
    );
  }

  /**
   * PERMANENT sentinel (independent of `verbose`): traces the ball within the
   * X band around the lane's left wall and reports any frame-to-frame
   * crossing (inner ↔ outer face). Cost: 2 comparisons/frame only while the
   * ball is in the band, zero otherwise. Each crossing →
   * `console.warn('[WALL CROSS]', …)` + increments the counter shown in the
   * HUD. `side` tells whether the crossing happens above the wall top
   * (Z < lane.leftWallTopZ, legitimate exit gap) or below it (spurious pass
   * through the solid wall).
   */
  private traceWallCross(p: Vec3, v: Vec3): void {
    const inBand = p.x >= WALL_BAND_X_MIN && p.x <= WALL_BAND_X_MAX;
    if (!inBand) {
      this.prevWallX = Number.NaN;
      return;
    }

    const prev = this.prevWallX;
    this.prevWallX = p.x;

    // Detailed per-frame trace: verbose only (console spam).
    if (this.verbose) {
      // eslint-disable-next-line no-console
      console.info(
        `[WallTrace] x=${p.x.toFixed(4)} z=${p.z.toFixed(3)} | vx=${v.x.toFixed(2)} vz=${v.z.toFixed(2)}`,
      );
    }

    if (Number.isNaN(prev)) return;

    const crossedOutward = prev < this.wallFaceInner && p.x > this.wallFaceOuter;
    const crossedInward = prev > this.wallFaceOuter && p.x < this.wallFaceInner;
    if (!crossedOutward && !crossedInward) return;

    // Crossing detected: snapshot counter ALWAYS incremented (HUD sentinel),
    // console warn only in `verbose` (fully silent in prod).
    const side = p.z < this.lane.leftWallTopZ ? 'above_top' : 'below_top';
    this.snapshot = {
      ...this.snapshot,
      wallCrossCount: this.snapshot.wallCrossCount + 1,
    };
    if (this.verbose) {
      // eslint-disable-next-line no-console
      console.warn('[WALL CROSS]', {
        x: p.x,
        z: p.z,
        vx: v.x,
        vz: v.z,
        side,
        dir: crossedOutward ? 'inner_to_outer' : 'outer_to_inner',
      });
    }
  }

  /** Remembers the last game event (BUMPER_HIT, DRAIN, ...) for the HUD. */
  noteEvent(type: string): void {
    this.snapshot = { ...this.snapshot, lastEvent: type };
  }

  /** Logs and remembers the cause of a ball reset. */
  noteReset(reason: BallResetReason): void {
    this.snapshot = { ...this.snapshot, lastReset: reason };
    this.lostLatched = false;
    if (reason === 'launch') {
      this.apexZ = Number.POSITIVE_INFINITY;
      this.apexLogged = false;
      this.peakSpeed = 0;
      this.snapshot = { ...this.snapshot, apexZ: 0, apexX: 0, peakSpeed: 0 };
      // (Re)arms the launch flight tracer.
      this.traceActive = true;
      this.traceFrame = 0;
      this.traceSampleCount = 0;
      this.prevTraceVz = 0;
      if (this.verbose) {
        // eslint-disable-next-line no-console
        console.info('[LaneFlight] ▶ Traçage du vol de lancement démarré.');
      }
    }
    if (this.verbose) {
      // eslint-disable-next-line no-console
      console.info(`[BallDiagnostics] Reset balle — ${RESET_LABELS[reason]}`);
    }
  }

  getSnapshot(): Readonly<BallDiagnosticsSnapshot> {
    return this.snapshot;
  }

  resetLostLatch(): void {
    this.lostLatched = false;
  }

  private classifyZone(p: Vec3): BallZone {
    if (isBallOutOfBounds(p.x, p.z)) return 'out_of_bounds';
    if (
      p.x >= this.lane.xMin &&
      p.x <= this.lane.xMax &&
      p.z >= this.lane.topZ &&
      p.z <= this.lane.bottomZ
    ) {
      return 'lane';
    }
    if (isInBottomOutZone(p.x, p.z, this.laneSepX)) return 'drain_zone';
    return 'playfield';
  }

  private detectLost(p: Vec3): BallLostReason | null {
    if (p.y < BALL_LOST_Y_THRESHOLD) return 'escaped_below_floor';
    if (isBallOutOfBounds(p.x, p.z)) return 'escaped_out_of_bounds';
    return null;
  }
}
