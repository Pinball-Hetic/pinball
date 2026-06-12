import {
  SHOOTER_LANE_X_MIN,
  SHOOTER_LANE_X_MAX,
  SHOOTER_LANE_TOP_Z,
  SHOOTER_LANE_BOTTOM_Z,
  SHOOTER_LANE_EXIT_X,
  SHOOTER_LANE_FAIL_Z,
  SHOOTER_LANE_WALL_THICKNESS,
  SHOOTER_LANE_LEFT_WALL_TOP_Z,
} from '../domain/Ball';
import {
  BALL_LOST_Y_THRESHOLD,
  isBallOutOfBounds,
  isInBottomOutZone,
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
  /** Point le plus haut atteint depuis le lancement (Z le plus négatif). */
  apexZ: number;
  /** X de la balle au moment de l'apogée. */
  apexX: number;
  /** Vitesse maximale atteinte depuis le dernier lancement. */
  peakSpeed: number;
  /** Nb total de franchissements détectés du mur gauche du couloir (sentinelle). */
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

// Source de vérité unique des libellés (réutilisée par le HUD BallDebugOverlay).
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

// ── Traceur de traversée du mur gauche du couloir ──────────────────────────────
// Le mur gauche du couloir est centré sur SHOOTER_LANE_X_MIN, épaisseur
// SHOOTER_LANE_WALL_THICKNESS → faces internes/externes à ±épaisseur/2. On trace
// la bille dès qu'elle entre dans une bande X large autour du mur, et on signale
// tout franchissement frame-à-frame (interne→externe ou inverse).
const WALL_FACE_INNER = SHOOTER_LANE_X_MIN - SHOOTER_LANE_WALL_THICKNESS / 2; // ≈ 0.196
const WALL_FACE_OUTER = SHOOTER_LANE_X_MIN + SHOOTER_LANE_WALL_THICKNESS / 2; // ≈ 0.216
const WALL_BAND_X_MIN = 0.17;
const WALL_BAND_X_MAX = 0.23;

/**
 * Suit la balle chaque frame et explique pourquoi elle disparaît ou sort du
 * terrain : classification de zone, détection de fuite physique (sous le sol /
 * hors limites) et journal des causes de reset. Lecture seule du corps Rapier.
 */
export class BallDiagnostics {
  /** Active les logs console (trace LaneFlight, apogée, pertes, resets).
   *  Piloté par le toggle HUD `[J]` côté playfield → silence total en prod. */
  verbose = false;

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

  // ── Traceur de vol de lancement ────────────────────────────────────────────
  // Échantillonne pos/vel pendant la montée dans le couloir pour voir EXACTEMENT
  // où et comment la balle s'arrête (perte d'énergie progressive vs choc brutal
  // contre une géométrie GLB). Activé à chaque reset 'launch', coupé quand la
  // balle sort du couloir (X faible) ou retombe en bas, ou après un plafond de
  // frames pour éviter le spam console.
  private traceActive = false;
  private traceFrame = 0;
  private traceSampleCount = 0;
  private traceMaxSamples = 90;
  private traceEverStep = 6; // 1 échantillon toutes les ~6 frames (~100 ms)
  private prevTraceVz = 0;

  // ── Traceur de traversée du mur gauche ───────────────────────────────────────
  // X de la frame précédente (NaN = pas encore dans la bande). Sert à détecter le
  // passage d'une face du mur à l'autre entre 2 frames.
  private prevWallX = Number.NaN;

  /** Met à jour le snapshot et signale une perte (une seule fois par épisode). */
  update(body: DiagBody, gameState: string): BallLostEvent | null {
    const p = body.translation();
    const v = body.linvel();
    const speed = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);

    // Traceur de vol de lancement (avant tout le reste pour capter la montée).
    this.traceLaneFlight(p, v, speed, gameState);

    // Traceur de traversée du mur gauche du couloir.
    this.traceWallCross(p, v);

    // Suivi de la vitesse de pointe depuis le dernier lancement.
    if (gameState === 'playing' && speed > this.peakSpeed) {
      this.peakSpeed = speed;
      this.snapshot = { ...this.snapshot, peakSpeed: speed };
    }

    // Suivi de l'apogée (Z le plus négatif) depuis le dernier lancement.
    if (gameState === 'playing' && p.z < this.apexZ) {
      this.apexZ = p.z;
      this.snapshot = { ...this.snapshot, apexZ: p.z, apexX: p.x };
    }
    // Quand la balle repart vers le bas dans le couloir, logge l'apogée une fois.
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
   * Échantillonne la trajectoire de la balle pendant le vol de lancement.
   * Logge X/Y/Z + vitesse pour révéler le point et le mode d'arrêt. Détecte
   * aussi la transition Z (montée → redescente) et la sortie du couloir.
   */
  private traceLaneFlight(p: Vec3, v: Vec3, speed: number, gameState: string): void {
    if (!this.traceActive || gameState !== 'playing') return;
    this.traceFrame++;

    // Sortie réussie du couloir : la balle est passée dans le terrain (X bas).
    if (p.x < SHOOTER_LANE_EXIT_X) {
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

    // Retombée en bas du couloir sans être sortie → échec de lancement.
    if (p.z > SHOOTER_LANE_FAIL_Z && this.traceSampleCount > 3) {
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

    // Inversion du sens Z (apogée) → marqueur explicite, hors throttle.
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
   * Sentinelle PERMANENTE (indépendante de `verbose`) : trace la balle dans la
   * bande X autour du mur gauche du couloir et signale tout franchissement
   * frame-à-frame (face interne ↔ face externe). Coût : 2 comparaisons/frame
   * uniquement quand la bille est dans la bande, zéro sinon. Chaque franchissement
   * → `console.warn('[WALL CROSS]', …)` + incrément du compteur exposé au HUD.
   * `side` indique si le passage se fait au-dessus du sommet du mur
   * (Z < SHOOTER_LANE_LEFT_WALL_TOP_Z, trou légitime de sortie) ou en dessous
   * (traversée parasite du mur plein).
   */
  private traceWallCross(p: Vec3, v: Vec3): void {
    const inBand = p.x >= WALL_BAND_X_MIN && p.x <= WALL_BAND_X_MAX;
    if (!inBand) {
      this.prevWallX = Number.NaN;
      return;
    }

    const prev = this.prevWallX;
    this.prevWallX = p.x;

    // Trace par-frame détaillée : verbose uniquement (spam console).
    if (this.verbose) {
      // eslint-disable-next-line no-console
      console.info(
        `[WallTrace] x=${p.x.toFixed(4)} z=${p.z.toFixed(3)} | vx=${v.x.toFixed(2)} vz=${v.z.toFixed(2)}`,
      );
    }

    if (Number.isNaN(prev)) return;

    const crossedOutward = prev < WALL_FACE_INNER && p.x > WALL_FACE_OUTER;
    const crossedInward = prev > WALL_FACE_OUTER && p.x < WALL_FACE_INNER;
    if (!crossedOutward && !crossedInward) return;

    // Franchissement détecté : warn TOUJOURS + compteur snapshot (sentinelle).
    const side = p.z < SHOOTER_LANE_LEFT_WALL_TOP_Z ? 'above_top' : 'below_top';
    this.snapshot = {
      ...this.snapshot,
      wallCrossCount: this.snapshot.wallCrossCount + 1,
    };
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

  /** Mémorise le dernier évènement de jeu (BUMPER_HIT, DRAIN, ...) pour le HUD. */
  noteEvent(type: string): void {
    this.snapshot = { ...this.snapshot, lastEvent: type };
  }

  /** Journalise et mémorise la cause d'un reset de la balle. */
  noteReset(reason: BallResetReason): void {
    this.snapshot = { ...this.snapshot, lastReset: reason };
    this.lostLatched = false;
    if (reason === 'launch') {
      this.apexZ = Number.POSITIVE_INFINITY;
      this.apexLogged = false;
      this.peakSpeed = 0;
      this.snapshot = { ...this.snapshot, apexZ: 0, apexX: 0, peakSpeed: 0 };
      // (Re)démarre le traceur de vol de lancement.
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
      p.x >= SHOOTER_LANE_X_MIN &&
      p.x <= SHOOTER_LANE_X_MAX &&
      p.z >= SHOOTER_LANE_TOP_Z &&
      p.z <= SHOOTER_LANE_BOTTOM_Z
    ) {
      return 'lane';
    }
    if (isInBottomOutZone(p.x, p.z)) return 'drain_zone';
    return 'playfield';
  }

  private detectLost(p: Vec3): BallLostReason | null {
    if (p.y < BALL_LOST_Y_THRESHOLD) return 'escaped_below_floor';
    if (isBallOutOfBounds(p.x, p.z)) return 'escaped_out_of_bounds';
    return null;
  }
}
