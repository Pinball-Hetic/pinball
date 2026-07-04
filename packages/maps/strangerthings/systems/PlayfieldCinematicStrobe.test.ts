import { test, expect, describe } from 'bun:test';
import type { DecorLights } from '@pinball/game-engine';
import { strangerthingsDecor } from './PlayfieldCinematicStrobe';

function spy(): DecorLights {
  return { setStrobe() {} };
}

describe('strangerthingsDecor', () => {
  test('filters out nulls, preserves order', () => {
    const garland = spy();
    const bumper = spy();
    expect(strangerthingsDecor(garland, bumper)).toEqual([garland, bumper]);
    expect(strangerthingsDecor(null, bumper)).toEqual([bumper]);
    expect(strangerthingsDecor(garland, null)).toEqual([garland]);
    expect(strangerthingsDecor(null, null)).toEqual([]);
  });

  test('no args yields empty array', () => {
    expect(strangerthingsDecor()).toEqual([]);
  });
});
