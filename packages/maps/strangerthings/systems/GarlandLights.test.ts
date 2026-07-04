import { describe, expect, test } from 'bun:test';
import { rocketFront, rocketGlow } from './GarlandLights';

// Garland rocket liftoff (score milestone): pure logic of the rising sweep
// (front + per-bulb intensity). Three.js rendering is not tested here.
describe('rocketFront (balayage montant)', () => {
  test('démarre sous le premier bulbe à rocketT=1', () => {
    expect(rocketFront(1, 10)).toBeLessThan(0);
  });

  test('dépasse le dernier bulbe à rocketT=0 (balayage complet)', () => {
    expect(rocketFront(0, 10)).toBeGreaterThanOrEqual(9);
  });

  test('progresse de façon monotone quand rocketT décroît', () => {
    expect(rocketFront(0.2, 10)).toBeGreaterThan(rocketFront(0.8, 10));
  });

  test('clamp rocketT hors [0,1]', () => {
    expect(rocketFront(2, 10)).toBe(rocketFront(1, 10));
    expect(rocketFront(-1, 10)).toBe(rocketFront(0, 10));
  });
});

describe('rocketGlow (intensité par bulbe)', () => {
  test('intensité max (1) au front', () => {
    expect(rocketGlow(5, 5)).toBe(1);
  });

  test('0 pour un bulbe au-dessus du front (pas encore atteint)', () => {
    expect(rocketGlow(8, 5)).toBe(0);
  });

  test('0 pour un bulbe trop loin derrière le front (bande dépassée)', () => {
    expect(rocketGlow(0, 5)).toBe(0);
  });

  test('décroît linéairement derrière le front dans la bande', () => {
    const near = rocketGlow(4, 5);
    const far = rocketGlow(3, 5);
    expect(near).toBeGreaterThan(far);
    expect(near).toBeGreaterThan(0);
    expect(far).toBeGreaterThan(0);
  });
});
