import { test, expect, describe, spyOn, afterEach } from 'bun:test';
import { ScreenShake } from './ScreenShake';

const MAX_AMPLITUDE = 0.004;
const DECAY_PER_S = 6;

afterEach(() => {
  // Restaure Math.random après chaque test qui le mocke.
  (Math.random as unknown as { mockRestore?: () => void }).mockRestore?.();
});

describe('ScreenShake.add', () => {
  test('énergie nulle au repos -> offset nul', () => {
    const s = new ScreenShake();
    spyOn(Math, 'random').mockReturnValue(0);
    expect(s.update(0.016)).toEqual({ x: 0, y: 0 });
  });

  test('clamp l\'énergie à 1 max', () => {
    const s = new ScreenShake();
    s.add(0.5);
    s.add(0.9); // somme 1.4 -> clampée à 1
    // random=0 -> cos(0)=1, sin(0)=0 ; cible x=1,y=0
    spyOn(Math, 'random').mockReturnValue(0);
    // dt assez grand pour lisser pleinement (k = min(1, dt*30) = 1)
    const off = s.update(0.05);
    // energy après decay: 1 - 1*6*0.05 = 0.7 ; cur.x ~ 1
    const expectedEnergy = 1 - 1 * DECAY_PER_S * 0.05;
    expect(off.x).toBeCloseTo(expectedEnergy * MAX_AMPLITUDE, 6);
    expect(off.y).toBeCloseTo(0, 6);
  });

  test('add négatif ne descend pas sous 0 via update decay', () => {
    const s = new ScreenShake();
    s.add(-1); // energy = min(1, 0 + -1) = -1 ... puis update clamp à 0
    spyOn(Math, 'random').mockReturnValue(0);
    const off = s.update(0.016);
    expect(off.x).toBe(0);
    expect(off.y).toBe(0);
  });
});

describe('ScreenShake.update decay', () => {
  test('l\'amplitude diminue une fois la direction stabilisée', () => {
    const s = new ScreenShake();
    s.add(1);
    spyOn(Math, 'random').mockReturnValue(0); // cible (1,0)
    // dt=0.05 -> k=1 : cur saute à (1,0) dès le 1er pas, direction figée ensuite.
    const first = s.update(0.05);
    const second = s.update(0.05);
    // cur.x reste 1 ; seule l'énergie décroît -> amplitude plus faible.
    expect(first.x).toBeGreaterThan(0);
    expect(second.x).toBeLessThan(first.x);
  });

  test('decay correct sur un pas: energy -= energy*DECAY*dt', () => {
    const s = new ScreenShake();
    s.add(1);
    spyOn(Math, 'random').mockReturnValue(0);
    const dt = 0.05; // k = 1 -> cur saute directement à la cible (1,0)
    const off = s.update(dt);
    const energy = 1 - 1 * DECAY_PER_S * dt; // 0.7
    expect(off.x).toBeCloseTo(energy * MAX_AMPLITUDE, 6);
  });

  test('energy never goes negative même avec dt énorme', () => {
    const s = new ScreenShake();
    s.add(1);
    spyOn(Math, 'random').mockReturnValue(0);
    // dt très grand: energy -= energy*6*dt pourrait sur-soustraire, clampé à 0.
    const off = s.update(10);
    expect(off.x).toBeGreaterThanOrEqual(0);
    expect(off.y).toBeGreaterThanOrEqual(0);
  });
});

describe('ScreenShake direction smoothing', () => {
  test('lissage partiel quand dt petit (k < 1)', () => {
    const s = new ScreenShake();
    s.add(1);
    // random=0 -> cible (cos0, sin0) = (1, 0)
    spyOn(Math, 'random').mockReturnValue(0);
    const dt = 0.01; // k = min(1, 0.3) = 0.3 ; cur.x part de 0 -> 0.3
    const off = s.update(dt);
    const energy = 1 - 1 * DECAY_PER_S * dt;
    const curX = 0 + (1 - 0) * Math.min(1, dt * 30);
    expect(off.x).toBeCloseTo(curX * energy * MAX_AMPLITUDE, 6);
  });

  test('offset borné par MAX_AMPLITUDE * energy (direction unitaire)', () => {
    const s = new ScreenShake();
    s.add(1);
    spyOn(Math, 'random').mockReturnValue(0);
    const off = s.update(0.05);
    const mag = Math.hypot(off.x, off.y);
    expect(mag).toBeLessThanOrEqual(MAX_AMPLITUDE + 1e-9);
  });

  test('retarget choisit une nouvelle direction depuis Math.random', () => {
    const s = new ScreenShake();
    s.add(1);
    // random = 0.25 -> angle = 0.25*2PI = PI/2 -> cos=0, sin=1 (cible verticale)
    spyOn(Math, 'random').mockReturnValue(0.25);
    const off = s.update(0.05); // k=1 -> cur saute à la cible (0,1)
    const energy = 1 - 1 * DECAY_PER_S * 0.05;
    expect(off.x).toBeCloseTo(0, 6);
    expect(off.y).toBeCloseTo(energy * MAX_AMPLITUDE, 6);
  });
});
