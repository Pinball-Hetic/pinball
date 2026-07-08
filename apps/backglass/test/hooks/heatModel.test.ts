import { test, expect, describe } from 'bun:test'
import {
  clamp,
  HEAT_DECAY,
  HIT_GAIN,
  hitIntensity,
  heatAfterHit,
  nextHeat,
  roundedHeat,
} from '../../src/hooks/heatModel'

describe('clamp', () => {
  test('borne bas et haut', () => {
    expect(clamp(-1, 0, 1)).toBe(0)
    expect(clamp(2, 0, 1)).toBe(1)
    expect(clamp(0.5, 0, 1)).toBe(0.5)
  })
})

describe('hitIntensity', () => {
  test('delta 500 → 1', () => {
    expect(hitIntensity(500)).toBe(1)
  })
  test('gros delta → clamp haut à 1', () => {
    expect(hitIntensity(99999)).toBe(1)
  })
  test('petit delta → clamp bas à 0.1', () => {
    expect(hitIntensity(10)).toBe(0.1)
  })
  test('delta intermédiaire → proportionnel', () => {
    expect(hitIntensity(250)).toBeCloseTo(0.5, 5)
  })
})

describe('heatAfterHit', () => {
  test('ajoute intensity * HIT_GAIN', () => {
    expect(heatAfterHit(0, 1)).toBeCloseTo(HIT_GAIN, 5)
    expect(heatAfterHit(0.1, 0.5)).toBeCloseTo(0.1 + 0.5 * HIT_GAIN, 5)
  })
  test('borné à 1', () => {
    expect(heatAfterHit(0.95, 1)).toBe(1)
  })
})

describe('nextHeat', () => {
  test('heatLock verrouille à 1 quel que soit le reste', () => {
    expect(nextHeat(0, null, true)).toBe(1)
    expect(nextHeat(0.3, 5, true)).toBe(1)
  })
  test('premier frame (dt null) : heat inchangé', () => {
    expect(nextHeat(0.3, null, false)).toBe(0.3)
  })
  test('decay linéaire HEAT_DECAY par seconde', () => {
    expect(nextHeat(0.5, 0.5, false)).toBeCloseTo(0.5 - HEAT_DECAY * 0.5, 5)
  })
  test('borné à 0 (pas de heat négatif)', () => {
    expect(nextHeat(0.3, 1, false)).toBe(0)
  })
})

describe('roundedHeat', () => {
  test('arrondit au centième', () => {
    expect(roundedHeat(0.3)).toBe(0.3)
    expect(roundedHeat(0.12345)).toBe(0.12)
    expect(roundedHeat(0.126)).toBe(0.13)
    expect(roundedHeat(0)).toBe(0)
    expect(roundedHeat(1)).toBe(1)
  })
})
