import { test, expect, describe } from 'bun:test';
import {
  DEFAULT_PLAYFIELD_VIEW_MODE,
  parsePlayfieldViewMode,
} from './PlayfieldViewMode';

describe('DEFAULT_PLAYFIELD_VIEW_MODE', () => {
  test('vaut portrait-fill', () => {
    expect(DEFAULT_PLAYFIELD_VIEW_MODE).toBe('portrait-fill');
  });
});

describe('parsePlayfieldViewMode', () => {
  test('reconnaît legacy', () => {
    expect(parsePlayfieldViewMode('legacy')).toBe('legacy');
  });

  test('reconnaît portrait-fill', () => {
    expect(parsePlayfieldViewMode('portrait-fill')).toBe('portrait-fill');
  });

  test('valeur inconnue → défaut', () => {
    expect(parsePlayfieldViewMode('bogus')).toBe(DEFAULT_PLAYFIELD_VIEW_MODE);
  });

  test('undefined → défaut', () => {
    expect(parsePlayfieldViewMode(undefined)).toBe(DEFAULT_PLAYFIELD_VIEW_MODE);
  });

  test('chaîne vide → défaut', () => {
    expect(parsePlayfieldViewMode('')).toBe(DEFAULT_PLAYFIELD_VIEW_MODE);
  });

  test('sensible à la casse → défaut', () => {
    expect(parsePlayfieldViewMode('Legacy')).toBe(DEFAULT_PLAYFIELD_VIEW_MODE);
  });

  test('espaces parasites → défaut', () => {
    expect(parsePlayfieldViewMode(' legacy ')).toBe(DEFAULT_PLAYFIELD_VIEW_MODE);
  });
});
