import { test, expect, describe, beforeEach, spyOn, afterEach } from 'bun:test';
import { BallDiagnostics, RESET_LABELS, LOST_LABELS } from './BallDiagnostics';
import type { Vec3 } from './BallDiagnostics';
import type { MapLayout } from '../domain/MapLayout';

// Corps Rapier minimal (lecture seule) : on injecte pos/vel à la main.
function body(pos: Vec3, vel: Vec3 = { x: 0, y: 0, z: 0 }) {
  return { translation: () => pos, linvel: () => vel };
}

// Layout minimal : seules shooterLane + spawns.ball sont lues par le diag.
function makeLayout(): MapLayout {
  return {
    shooterLane: {
      xMin: 0.206,
      xMax: 0.265,
      bottomZ: 0.4,
      topZ: -0.3,
      wallHeight: 0.06,
      wallThickness: 0.02,
      restitution: 0.3,
      friction: 0.05,
      leftWallTopZ: -0.28,
      lockX: 0.19,
      exitX: 0.17,
      failZ: 0.3,
      guideCenter: { x: 0, z: 0 },
      guideRadius: 0.1,
      guideSegments: 8,
      guideAngleStart: 0,
      guideAngleEnd: 1,
    },
    spawns: { ball: { x: 0.2355, y: 1, z: 0.35 } },
  } as unknown as MapLayout;
}

// Point de jeu valide (centre plateau, sur la surface, hors couloir/limites).
const SAFE: Vec3 = { x: 0, y: 1.0, z: 0 };

describe('BallDiagnostics — labels', () => {
  test('RESET_LABELS couvre toutes les causes de reset', () => {
    expect(RESET_LABELS.launch).toBe('Lancement');
    expect(RESET_LABELS.drain).toContain('Drain');
    expect(RESET_LABELS.game_over_hide).toContain('Game over');
  });

  test('LOST_LABELS couvre les deux causes de perte', () => {
    expect(LOST_LABELS.escaped_below_floor).toContain('sous le tapis');
    expect(LOST_LABELS.escaped_out_of_bounds).toContain('hors des limites');
  });
});

describe('BallDiagnostics — snapshot de base', () => {
  let diag: BallDiagnostics;
  beforeEach(() => {
    diag = new BallDiagnostics(makeLayout());
  });

  test('update copie pos/vel et calcule la vitesse (norme euclidienne)', () => {
    diag.update(body(SAFE, { x: 3, y: 0, z: 4 }), 'playing');
    const s = diag.getSnapshot();
    expect(s.pos).toEqual({ x: 0, y: 1.0, z: 0 });
    expect(s.vel).toEqual({ x: 3, y: 0, z: 4 });
    expect(s.speed).toBeCloseTo(5, 6);
  });

  test('gameState est répercuté dans le snapshot', () => {
    diag.update(body(SAFE), 'idle');
    expect(diag.getSnapshot().gameState).toBe('idle');
  });

  test('noteEvent mémorise le dernier évènement', () => {
    diag.noteEvent('BUMPER_HIT');
    expect(diag.getSnapshot().lastEvent).toBe('BUMPER_HIT');
  });

  test('noteReset mémorise la dernière cause de reset', () => {
    diag.noteReset('drain');
    expect(diag.getSnapshot().lastReset).toBe('drain');
  });
});

describe('BallDiagnostics — classification de zone', () => {
  let diag: BallDiagnostics;
  beforeEach(() => {
    diag = new BallDiagnostics(makeLayout());
  });

  test('centre plateau → playfield', () => {
    diag.update(body(SAFE), 'playing');
    expect(diag.getSnapshot().zone).toBe('playfield');
  });

  test('dans la bbox du couloir → lane', () => {
    // x dans [xMin,xMax], z dans [topZ,bottomZ]
    diag.update(body({ x: 0.23, y: 1, z: 0.1 }), 'playing');
    expect(diag.getSnapshot().zone).toBe('lane');
  });

  test('hors limites du terrain → out_of_bounds', () => {
    diag.update(body({ x: 999, y: 1, z: 0 }), 'playing');
    expect(diag.getSnapshot().zone).toBe('out_of_bounds');
  });

  test('zone bottom-out (bas du terrain, côté gauche du séparateur) → drain_zone', () => {
    // BOTTOM_OUT_Z est positif (vers le bas) ; x faible (< laneSepX) côté gauche.
    diag.update(body({ x: -0.2, y: 1, z: 0.4 }), 'playing');
    expect(diag.getSnapshot().zone).toBe('drain_zone');
  });
});

describe('BallDiagnostics — détection de balle perdue', () => {
  let diag: BallDiagnostics;
  beforeEach(() => {
    diag = new BallDiagnostics(makeLayout());
  });

  test('balle sous le seuil Y → perte escaped_below_floor', () => {
    const lost = diag.update(body({ x: 0, y: 0.5, z: 0 }), 'playing');
    expect(lost).not.toBeNull();
    expect(lost!.reason).toBe('escaped_below_floor');
    expect(diag.getSnapshot().lostCount).toBe(1);
    expect(diag.getSnapshot().lastLost).toBe('escaped_below_floor');
  });

  test('balle hors limites → perte escaped_out_of_bounds', () => {
    const lost = diag.update(body({ x: 999, y: 1, z: 0 }), 'playing');
    expect(lost).not.toBeNull();
    expect(lost!.reason).toBe('escaped_out_of_bounds');
  });

  test('seuil Y prioritaire sur hors-limites quand les deux sont vrais', () => {
    const lost = diag.update(body({ x: 999, y: 0.1, z: 0 }), 'playing');
    expect(lost!.reason).toBe('escaped_below_floor');
  });

  test('perte signalée une seule fois (latch) tant que la balle reste perdue', () => {
    const lowBody = body({ x: 0, y: 0.5, z: 0 });
    expect(diag.update(lowBody, 'playing')).not.toBeNull();
    expect(diag.update(lowBody, 'playing')).toBeNull();
    expect(diag.update(lowBody, 'playing')).toBeNull();
    expect(diag.getSnapshot().lostCount).toBe(1);
  });

  test('latch relâché quand la balle revient en zone valide → re-signalable', () => {
    diag.update(body({ x: 0, y: 0.5, z: 0 }), 'playing');
    diag.update(body(SAFE), 'playing'); // récupération
    const lost2 = diag.update(body({ x: 0, y: 0.5, z: 0 }), 'playing');
    expect(lost2).not.toBeNull();
    expect(diag.getSnapshot().lostCount).toBe(2);
  });

  test('resetLostLatch permet de re-signaler sans repasser en zone valide', () => {
    diag.update(body({ x: 0, y: 0.5, z: 0 }), 'playing');
    diag.resetLostLatch();
    const lost2 = diag.update(body({ x: 0, y: 0.5, z: 0 }), 'playing');
    expect(lost2).not.toBeNull();
    expect(diag.getSnapshot().lostCount).toBe(2);
  });

  test('balle valide → pas de perte', () => {
    expect(diag.update(body(SAFE), 'playing')).toBeNull();
    expect(diag.getSnapshot().lostCount).toBe(0);
  });
});

describe('BallDiagnostics — apogée et vitesse de pointe', () => {
  let diag: BallDiagnostics;
  beforeEach(() => {
    diag = new BallDiagnostics(makeLayout());
  });

  test('peakSpeed suit le maximum pendant playing', () => {
    diag.update(body(SAFE, { x: 2, y: 0, z: 0 }), 'playing');
    diag.update(body(SAFE, { x: 5, y: 0, z: 0 }), 'playing');
    diag.update(body(SAFE, { x: 1, y: 0, z: 0 }), 'playing');
    expect(diag.getSnapshot().peakSpeed).toBeCloseTo(5, 6);
  });

  test('peakSpeed ignore les frames hors playing', () => {
    diag.update(body(SAFE, { x: 9, y: 0, z: 0 }), 'idle');
    expect(diag.getSnapshot().peakSpeed).toBe(0);
  });

  test('apexZ retient le Z le plus négatif et l’X associé', () => {
    diag.update(body({ x: 0.1, y: 1, z: -0.2 }), 'playing');
    diag.update(body({ x: 0.15, y: 1, z: -0.45 }), 'playing'); // plus haut
    diag.update(body({ x: 0.2, y: 1, z: -0.1 }), 'playing'); // redescend
    const s = diag.getSnapshot();
    expect(s.apexZ).toBeCloseTo(-0.45, 6);
    expect(s.apexX).toBeCloseTo(0.15, 6);
  });

  test('noteReset(launch) remet à zéro apex/peak et le snapshot exposé', () => {
    diag.update(body({ x: 0, y: 1, z: -0.5 }), 'playing');
    diag.update(body(SAFE, { x: 6, y: 0, z: 0 }), 'playing');
    diag.noteReset('launch');
    const s = diag.getSnapshot();
    expect(s.apexZ).toBe(0);
    expect(s.apexX).toBe(0);
    expect(s.peakSpeed).toBe(0);
  });
});

describe('BallDiagnostics — traceur de traversée du mur gauche', () => {
  let diag: BallDiagnostics;
  let warnSpy: ReturnType<typeof spyOn>;
  beforeEach(() => {
    diag = new BallDiagnostics(makeLayout());
    warnSpy = spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    warnSpy.mockRestore();
  });

  // wallFaceInner = xMin - thickness/2 = 0.206 - 0.01 = 0.196
  // wallFaceOuter = xMin + thickness/2 = 0.206 + 0.01 = 0.216
  // bande X = [0.17, 0.23]

  test('franchissement interne→externe détecté et compté', () => {
    diag.update(body({ x: 0.18, y: 1, z: 0 }), 'playing'); // dans bande, < inner
    diag.update(body({ x: 0.22, y: 1, z: 0 }), 'playing'); // > outer → cross
    expect(diag.getSnapshot().wallCrossCount).toBe(1);
    expect(warnSpy).toHaveBeenCalledWith('[WALL CROSS]', expect.anything());
  });

  test('franchissement externe→interne détecté et compté', () => {
    diag.update(body({ x: 0.22, y: 1, z: 0 }), 'playing');
    diag.update(body({ x: 0.18, y: 1, z: 0 }), 'playing');
    expect(diag.getSnapshot().wallCrossCount).toBe(1);
  });

  test('rester dans la bande sans franchir une face → aucun cross', () => {
    diag.update(body({ x: 0.18, y: 1, z: 0 }), 'playing');
    diag.update(body({ x: 0.19, y: 1, z: 0 }), 'playing'); // toujours < inner
    expect(diag.getSnapshot().wallCrossCount).toBe(0);
  });

  test('sortir de la bande réinitialise le suivi (pas de faux cross au retour)', () => {
    diag.update(body({ x: 0.18, y: 1, z: 0 }), 'playing'); // dans bande
    diag.update(body({ x: 0.0, y: 1, z: 0 }), 'playing'); // hors bande → prevWallX = NaN
    diag.update(body({ x: 0.22, y: 1, z: 0 }), 'playing'); // re-entre, prev NaN → pas de cross
    expect(diag.getSnapshot().wallCrossCount).toBe(0);
  });
});

describe('BallDiagnostics — mode verbose et console', () => {
  afterEach(() => {
    // restauration faite via mockRestore dans chaque test
  });

  test('verbose=false → pas de console.error lors d’une perte', () => {
    const errSpy = spyOn(console, 'error').mockImplementation(() => {});
    const diag = new BallDiagnostics(makeLayout());
    diag.update(body({ x: 0, y: 0.5, z: 0 }), 'playing');
    expect(errSpy).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });

  test('verbose=true → console.error lors d’une perte', () => {
    const errSpy = spyOn(console, 'error').mockImplementation(() => {});
    const diag = new BallDiagnostics(makeLayout());
    diag.verbose = true;
    diag.update(body({ x: 0, y: 0.5, z: 0 }), 'playing');
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
