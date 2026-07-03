import { test, expect } from 'bun:test';
import { PhysicsWorld } from './PhysicsWorld';

const STEP = 1 / 60;

/** Joue `seconds` de temps réel à `fps` et renvoie le nombre total de steps. */
function simulateSteps(fps: number, seconds: number): number {
  const dt = 1 / fps;
  const frames = Math.round(fps * seconds);
  let acc = 0;
  let total = 0;
  for (let i = 0; i < frames; i += 1) {
    acc += dt;
    const { steps, remainder } = PhysicsWorld.planSteps(acc);
    acc = remainder;
    total += steps;
  }
  return total;
}

test('runs ~60 physics steps per real second regardless of refresh rate', () => {
  for (const fps of [60, 120, 144]) {
    expect(simulateSteps(fps, 1)).toBeGreaterThanOrEqual(58);
    expect(simulateSteps(fps, 1)).toBeLessThanOrEqual(61);
  }
});

test('catches up below 60 FPS to stay real-time (down to 12 FPS)', () => {
  // 30 FPS → 2 steps/frame ; 15 FPS → 4 steps/frame. Toujours ~60/s.
  for (const fps of [30, 15, 12]) {
    expect(simulateSteps(fps, 1)).toBeGreaterThanOrEqual(58);
    expect(simulateSteps(fps, 1)).toBeLessThanOrEqual(61);
  }
});

test('one full interval yields exactly one step', () => {
  const { steps, remainder } = PhysicsWorld.planSteps(STEP);
  expect(steps).toBe(1);
  expect(remainder).toBeCloseTo(0, 6);
});

test('sub-interval accumulator yields no step', () => {
  const { steps, remainder } = PhysicsWorld.planSteps(1 / 120);
  expect(steps).toBe(0);
  expect(remainder).toBeCloseTo(1 / 120, 6);
});

test('interpolation alpha: fraction of the way to the next step, clamped [0,1]', () => {
  expect(PhysicsWorld.interpolationAlphaFor(0)).toBe(0);
  expect(PhysicsWorld.interpolationAlphaFor(STEP / 2)).toBeCloseTo(0.5, 6);
  expect(PhysicsWorld.interpolationAlphaFor(STEP)).toBe(1);
  // Hors bornes (backlog résiduel / valeur négative) → clamp, jamais d'extrapolation.
  expect(PhysicsWorld.interpolationAlphaFor(STEP * 3)).toBe(1);
  expect(PhysicsWorld.interpolationAlphaFor(-STEP)).toBe(0);
});

test('STEP_INTERVAL exposé = 1/60 (contrat des cibles kinématiques par step)', () => {
  expect(PhysicsWorld.STEP_INTERVAL).toBe(STEP);
});

test('hooks : onBeforeStep AVANT chaque step, onStep après, onAfterSteps une fois', () => {
  // Monde stubé (pas de WASM sous bun test) : on ne vérifie que l'ordonnancement
  // de update(), qui est le contrat anti-tunneling (cible kinématique posée
  // avant que Rapier n'en infère la vitesse).
  const calls: string[] = [];
  const pw = Object.create(PhysicsWorld.prototype) as PhysicsWorld;
  Object.assign(pw, {
    world: { step: () => calls.push('rapier-step') },
    eventQueue: {},
    accumulator: 0,
    timeScale: 1,
    crashed: false,
  });
  // 2 intervalles (+epsilon flottant) → exactement 2 steps.
  pw.update(2 * STEP + 1e-9, {
    onBeforeStep: () => calls.push('before'),
    onStep: () => calls.push('after-step'),
    onAfterSteps: () => calls.push('end'),
  });
  expect(calls).toEqual([
    'before', 'rapier-step', 'after-step',
    'before', 'rapier-step', 'after-step',
    'end',
  ]);
});

test('caps steps per frame (anti spiral-of-death) on a huge dt spike', () => {
  // 10 s d'un coup (onglet refocus) → borné à 5 steps, pas une avalanche.
  const { steps, remainder } = PhysicsWorld.planSteps(10);
  expect(steps).toBe(5);
  expect(remainder).toBeLessThan(STEP);
});
