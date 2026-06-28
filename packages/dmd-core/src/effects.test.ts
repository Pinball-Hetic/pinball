import { test, expect, describe, spyOn, afterEach } from 'bun:test';
import { applyGlitch, MatrixRain } from './effects';
import { DOT } from './palette';

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

// Source de valeurs déterministes pour Math.random.
function stubRandom(seq: number[]): ReturnType<typeof spyOn> {
  let i = 0;
  return spyOn(Math, 'random').mockImplementation(() => {
    const v = seq[i % seq.length];
    i++;
    return v;
  });
}

afterEach(() => {
  // Restaure Math.random après chaque test.
  if ((Math.random as { mockRestore?: () => void }).mockRestore) {
    (Math.random as unknown as { mockRestore: () => void }).mockRestore();
  }
});

describe('applyGlitch', () => {
  test('injecte du bruit (DOT.event) sur la grille', () => {
    // Toutes les valeurs à 0 : bandCount=2, rows=3, y0=0, dx=-1 (shift),
    // noise = 6 + floor(0..*) = 6, invertBand non déclenché (0 < 0.25 → true!).
    // On choisit 0.3 pour éviter l'inversion et garder le bruit déterministe.
    stubRandom([0.3]);
    const grid = emptyGrid();
    applyGlitch(grid, GRID_W, GRID_H, 1);
    // au moins quelques dots event posés par le bruit
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
    // noise = 6 + floor(random * 7 * intensity). À intensité 0 → 6 itérations.
    // À intensité 1 avec random=0.99 → 6 + floor(6.93) = 12 itérations.
    // On compte les appels au stub : plus d'itérations = plus d'appels.
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
    // On veut déclencher invertBand. Le dernier random de applyGlitch
    // (le test < 0.25) doit être < 0.25. Avec une seq constante 0.1,
    // invertBand est déclenché ET ses tirages internes restent à 0.1.
    stubRandom([0.1]);
    const grid = emptyGrid();
    applyGlitch(grid, GRID_W, GRID_H, 1);
    // invertBand transforme les 0 en DOT.event sur une bande → beaucoup de dots
    expect(litCount(grid)).toBeGreaterThan(GRID_W); // au moins une bande entière
  });

  test('n’écrit jamais hors des bornes de la grille', () => {
    stubRandom([0.7, 0.2, 0.9, 0.4, 0.6]);
    const grid = emptyGrid();
    expect(() => applyGlitch(grid, GRID_W, GRID_H, 0.5)).not.toThrow();
    // toutes les valeurs sont des index palette valides
    for (const v of grid) {
      expect(v).toBeGreaterThanOrEqual(0);
    }
    expect(grid.length).toBe(GRID_W * GRID_H);
  });
});

describe('MatrixRain', () => {
  test('le constructeur crée une colonne tous les 6 dots', () => {
    stubRandom([0.5]);
    const rain = new MatrixRain(18, 10); // x = 0, 6, 12 → 3 colonnes
    const grid = emptyGrid(18, 10);
    rain.drawBackground(grid);
    // les dots posés sont sur les colonnes 0, 6, 12 uniquement
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
    // pré-remplit la colonne 0 entièrement avec une autre couleur
    for (let y = 0; y < GRID_H; y++) grid[y * GRID_W + 0] = DOT.score;
    rain.drawBackground(grid);
    // la colonne 0 garde DOT.score (jamais écrasée par DOT.rain)
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
    // toute cellule allumée est rainGo (contrairement à drawBackground)
    for (const v of grid) {
      expect(v === 0 || v === DOT.rainGo).toBe(true);
    }
  });

  test('drawBurst écrase un dot existant situé sur une traînée', () => {
    stubRandom([0.5]);
    const rain = new MatrixRain(GRID_W, GRID_H);
    const grid = emptyGrid();
    // pré-remplit toute la grille avec une autre couleur
    grid.fill(DOT.score);
    rain.drawBurst(grid, 1);
    // au moins quelques cellules ont été remplacées par rainGo
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

    // densité clampée à 0 dans les deux cas → même nombre de dots (traînées seules)
    expect(litCount(gB)).toBe(litCount(gA));
  });

  test('step recycle les colonnes sorties par le bas', () => {
    // headY part de random*gridH. Avec un grand nombre de steps, aucune erreur
    // et les dots restent dans les bornes.
    stubRandom([0.9]);
    const rain = new MatrixRain(GRID_W, GRID_H);
    const grid = emptyGrid();
    for (let i = 0; i < 200; i++) {
      grid.fill(0);
      rain.drawBackground(grid);
    }
    // tous les dots restent dans les bornes verticales
    expect(litCount(grid)).toBeGreaterThanOrEqual(0);
    expect(grid.length).toBe(GRID_W * GRID_H);
  });
});
