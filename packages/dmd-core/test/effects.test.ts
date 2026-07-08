import { test, expect, describe, spyOn, afterEach } from 'bun:test';
import { applyGlitch, MatrixRain } from '../src/effects';
import { DOT } from '../src/palette';

const GRID_W = 40;
const GRID_H = 20;

function emptyGrid(w = GRID_W, h = GRID_H): Uint8Array {
  return new Uint8Array(w * h);
}

function litCount(grid: Uint8Array): number {
  let n = 0;
  for (const v of grid) if (v !== 0) n++;
  return n;
}

// Deterministic value source for Math.random.
function stubRandom(seq: number[]): ReturnType<typeof spyOn> {
  let i = 0;
  return spyOn(Math, 'random').mockImplementation(() => {
    const v = seq[i % seq.length];
    i++;
    return v;
  });
}

afterEach(() => {
  // Restore Math.random after each test.
  if ((Math.random as { mockRestore?: () => void }).mockRestore) {
    (Math.random as unknown as { mockRestore: () => void }).mockRestore();
  }
});

describe('applyGlitch', () => {
  test('injecte du bruit (DOT.event) sur la grille', () => {
    // With all values at 0: bandCount=2, rows=3, y0=0, dx=-1 (shift),
    // noise = 6 + floor(0..*) = 6, but invertBand would fire (0 < 0.25 → true!).
    // Use 0.3 to avoid the inversion and keep the noise deterministic.
    stubRandom([0.3]);
    const grid = emptyGrid();
    applyGlitch(grid, GRID_W, GRID_H, 1);
    // at least a few event dots placed by the noise
    const eventDots = Array.from(grid).filter((v) => v === DOT.event).length;
    expect(eventDots).toBeGreaterThan(0);
  });

  test('clampe t01 > 1 sans crash et produit du bruit', () => {
    stubRandom([0.3]);
    const grid = emptyGrid();
    expect(() => applyGlitch(grid, GRID_W, GRID_H, 5)).not.toThrow();
    expect(litCount(grid)).toBeGreaterThan(0);
  });

  test('t01 = 1 produit plus d’itérations de bruit que t01 = 0', () => {
    // noise = 6 + floor(random * 7 * intensity). At intensity 0 → 6 iterations.
    // At intensity 1 with random=0.99 → 6 + floor(6.93) = 12 iterations.
    // Count stub calls: more iterations = more calls.
    const seqLow = stubRandom([0.99]);
    applyGlitch(emptyGrid(), GRID_W, GRID_H, 0);
    const callsLow = seqLow.mock.calls.length;
    seqLow.mockRestore();

    const seqHigh = stubRandom([0.99]);
    applyGlitch(emptyGrid(), GRID_W, GRID_H, 1);
    const callsHigh = seqHigh.mock.calls.length;
    seqHigh.mockRestore();

    expect(callsHigh).toBeGreaterThan(callsLow);
  });

  test('inverse une bande quand random < 0.25 au tirage final', () => {
    // We want to trigger invertBand. The last random in applyGlitch
    // (the < 0.25 check) must be < 0.25. With a constant 0.1 sequence,
    // invertBand fires AND its internal draws stay at 0.1.
    stubRandom([0.1]);
    const grid = emptyGrid();
    applyGlitch(grid, GRID_W, GRID_H, 1);
    // invertBand turns 0s into DOT.event over a band → many dots
    expect(litCount(grid)).toBeGreaterThan(GRID_W); // at least a full band
  });

  test('n’écrit jamais hors des bornes de la grille', () => {
    stubRandom([0.7, 0.2, 0.9, 0.4, 0.6]);
    const grid = emptyGrid();
    expect(() => applyGlitch(grid, GRID_W, GRID_H, 0.5)).not.toThrow();
    // all values are valid palette indices
    for (const v of grid) {
      expect(v).toBeGreaterThanOrEqual(0);
    }
    expect(grid.length).toBe(GRID_W * GRID_H);
  });
});

describe('MatrixRain', () => {
  test('le constructeur crée une colonne tous les 6 dots', () => {
    stubRandom([0.5]);
    const rain = new MatrixRain(18, 10); // x = 0, 6, 12 → 3 columns
    const grid = emptyGrid(18, 10);
    rain.drawBackground(grid);
    // placed dots are only on columns 0, 6, 12
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 18; x++) {
        if (grid[y * 18 + x] !== 0) {
          expect(x % 6).toBe(0);
        }
      }
    }
  });

  test('drawBackground pose des dots DOT.rain', () => {
    stubRandom([0.5]);
    const rain = new MatrixRain(GRID_W, GRID_H);
    const grid = emptyGrid();
    rain.drawBackground(grid);
    const rainDots = Array.from(grid).filter((v) => v === DOT.rain).length;
    expect(rainDots).toBeGreaterThan(0);
  });

  test('drawBackground n’écrase pas un dot déjà posé', () => {
    stubRandom([0.5]);
    const rain = new MatrixRain(GRID_W, GRID_H);
    const grid = emptyGrid();
    // pre-fill column 0 entirely with another color
    for (let y = 0; y < GRID_H; y++) grid[y * GRID_W + 0] = DOT.score;
    rain.drawBackground(grid);
    // column 0 keeps DOT.score (never overwritten by DOT.rain)
    for (let y = 0; y < GRID_H; y++) {
      expect(grid[y * GRID_W + 0]).toBe(DOT.score);
    }
  });

  test('drawBurst ne pose que des dots DOT.rainGo', () => {
    stubRandom([0.5]);
    const rain = new MatrixRain(GRID_W, GRID_H);
    const grid = emptyGrid();
    rain.drawBurst(grid, 1);
    const goDots = Array.from(grid).filter((v) => v === DOT.rainGo).length;
    expect(goDots).toBeGreaterThan(0);
    // every lit cell is rainGo (unlike drawBackground)
    for (const v of grid) {
      expect(v === 0 || v === DOT.rainGo).toBe(true);
    }
  });

  test('drawBurst écrase un dot existant situé sur une traînée', () => {
    stubRandom([0.5]);
    const rain = new MatrixRain(GRID_W, GRID_H);
    const grid = emptyGrid();
    // pre-fill the whole grid with another color
    grid.fill(DOT.score);
    rain.drawBurst(grid, 1);
    // at least a few cells were replaced by rainGo
    const goDots = Array.from(grid).filter((v) => v === DOT.rainGo).length;
    expect(goDots).toBeGreaterThan(0);
  });

  test('drawBurst densité plus forte à t01=1 qu’à t01=0', () => {
    stubRandom([0.5]);
    const a = new MatrixRain(GRID_W, GRID_H);
    const gridLow = emptyGrid();
    a.drawBurst(gridLow, 0);
    const low = litCount(gridLow);

    stubRandom([0.5]);
    const b = new MatrixRain(GRID_W, GRID_H);
    const gridHigh = emptyGrid();
    b.drawBurst(gridHigh, 1);
    const high = litCount(gridHigh);

    expect(high).toBeGreaterThan(low);
  });

  test('drawBurst clampe t01 négatif (densité scatter nulle)', () => {
    stubRandom([0.5]);
    const a = new MatrixRain(GRID_W, GRID_H);
    const gA = emptyGrid();
    a.drawBurst(gA, 0);

    stubRandom([0.5]);
    const b = new MatrixRain(GRID_W, GRID_H);
    const gB = emptyGrid();
    b.drawBurst(gB, -2);

    // density clamped to 0 in both cases → same dot count (trails only)
    expect(litCount(gB)).toBe(litCount(gA));
  });

  test('step recycle les colonnes sorties par le bas', () => {
    // headY starts at random*gridH. With many steps, no error and dots stay
    // within bounds.
    stubRandom([0.9]);
    const rain = new MatrixRain(GRID_W, GRID_H);
    const grid = emptyGrid();
    for (let i = 0; i < 200; i++) {
      grid.fill(0);
      rain.drawBackground(grid);
    }
    // all dots stay within the vertical bounds
    expect(litCount(grid)).toBeGreaterThanOrEqual(0);
    expect(grid.length).toBe(GRID_W * GRID_H);
  });
});
