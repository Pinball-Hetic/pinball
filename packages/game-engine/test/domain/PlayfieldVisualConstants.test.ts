import { test, expect, describe } from 'bun:test';
import {
  DEFAULT_TONE_MAPPING_EXPOSURE,
  DEFAULT_MAP_COLOR_DARKEN,
  DEFAULT_ENVIRONMENT_BLUR,
  DEFAULT_ENV_METALLIC,
  DEFAULT_ENV_SEMI,
  DEFAULT_ENV_BASE,
  PLAYFIELD_TONE_MAPPING_EXPOSURE,
  PLAYFIELD_MAP_COLOR_DARKEN,
} from '../../src/domain/PlayfieldVisualConstants';

describe('constantes de rendu par défaut', () => {
  test('exposition tone mapping > 0', () => {
    expect(DEFAULT_TONE_MAPPING_EXPOSURE).toBeGreaterThan(0);
  });

  test('color darken dans [0, 1]', () => {
    expect(DEFAULT_MAP_COLOR_DARKEN).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_MAP_COLOR_DARKEN).toBeLessThanOrEqual(1);
  });

  test('blur environnement dans [0, 1]', () => {
    expect(DEFAULT_ENVIRONMENT_BLUR).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_ENVIRONMENT_BLUR).toBeLessThanOrEqual(1);
  });

  test('intensités env non négatives', () => {
    expect(DEFAULT_ENV_METALLIC).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_ENV_SEMI).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_ENV_BASE).toBeGreaterThanOrEqual(0);
  });
});

describe('aliases legacy', () => {
  test('exposition legacy === défaut', () => {
    expect(PLAYFIELD_TONE_MAPPING_EXPOSURE).toBe(DEFAULT_TONE_MAPPING_EXPOSURE);
  });

  test('darken legacy === défaut', () => {
    expect(PLAYFIELD_MAP_COLOR_DARKEN).toBe(DEFAULT_MAP_COLOR_DARKEN);
  });
});
