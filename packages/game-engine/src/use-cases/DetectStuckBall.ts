export interface StuckBallResult {
  type: 'nudge' | 'force_drain';
  impulse?: { x: number; y: number; z: number };
}

interface BallPositionXZ {
  x: number;
  z?: number;
}

const SLOW_SPEED_THRESHOLD = 0.02;
const STUCK_TIMEOUT_S = 1.0;
const MAX_NUDGES_BEFORE_DRAIN = 3;
// Rayon (m) en-deçà duquel la balle est considérée "toujours au même endroit".
// Plus petit qu'un diamètre de balle (0.0295) : un vrai dégagement doit
// vraiment sortir la balle de la poche, pas juste la faire vibrer dedans.
const STUCK_RADIUS = 0.012;

// Impulsion appliquée à chaque tentative de dégagement, de plus en plus
// forte. Certains creux (ex. cibles-vortex profondes) absorbent une simple
// pichenette sans jamais laisser la balle s'échapper : avant cette escalade,
// la balle rebondissait indéfiniment dans la poche à vitesse quasi nulle,
// ce qui pouvait aussi empêcher le minuteur de repartir (cf. ancre position
// ci-dessous) et la balle restait bloquée pour de bon.
const NUDGE_IMPULSES: ReadonlyArray<{ x: number; y: number; z: number }> = [
  { x: 0.08, y: 0.02, z: 0.12 },
  { x: 0.14, y: 0.05, z: 0.2 },
  { x: 0.2, y: 0.08, z: 0.3 },
];

export class StuckBallDetector {
  private timer = 0;
  private nudgeCount = 0;
  // Point de référence figé dès que la balle ralentit. Tant qu'elle reste
  // dans STUCK_RADIUS de cette ancre, on continue d'accumuler le minuteur
  // même si sa vitesse instantanée dépasse ponctuellement le seuil — ce qui
  // arrive typiquement quand une balle coincée rebondit contre les parois
  // d'une poche sans jamais en sortir. Un simple contrôle de vitesse remettait
  // le minuteur à zéro à chaque micro-rebond et empêchait tout dégagement.
  private anchor: { x: number; z: number } | null = null;

  update(
    ballSpeed: number,
    ballPos: BallPositionXZ,
    dt: number,
  ): StuckBallResult | null {
    const posZ = ballPos.z ?? 0;

    if (this.anchor === null) {
      if (ballSpeed >= SLOW_SPEED_THRESHOLD) return null;
      this.anchor = { x: ballPos.x, z: posZ };
      this.timer = dt;
    } else {
      const dx = ballPos.x - this.anchor.x;
      const dz = posZ - this.anchor.z;
      const driftedAway = Math.sqrt(dx * dx + dz * dz) > STUCK_RADIUS;
      if (driftedAway && ballSpeed >= SLOW_SPEED_THRESHOLD) {
        this.anchor = null;
        this.timer = 0;
        this.nudgeCount = 0;
        return null;
      }
      this.timer += dt;
    }

    if (this.timer <= STUCK_TIMEOUT_S) return null;

    this.timer = 0;
    this.nudgeCount++;
    if (this.nudgeCount >= MAX_NUDGES_BEFORE_DRAIN) {
      this.nudgeCount = 0;
      this.anchor = null;
      return { type: 'force_drain' };
    }

    const strength = NUDGE_IMPULSES[Math.min(this.nudgeCount - 1, NUDGE_IMPULSES.length - 1)];
    const nudgeX = ballPos.x > 0 ? -strength.x : strength.x;
    return { type: 'nudge', impulse: { x: nudgeX, y: strength.y, z: strength.z } };
  }

  reset(): void {
    this.timer = 0;
    this.nudgeCount = 0;
    this.anchor = null;
  }
}
