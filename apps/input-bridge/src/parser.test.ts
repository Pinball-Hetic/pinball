import { test, expect, describe } from 'bun:test';
import { parseLine, isButtonId } from './parser';

describe('isButtonId', () => {
  test('reconnaît les ids physiques du cabinet', () => {
    expect(isButtonId('WHITE_LEFT')).toBe(true);
    expect(isButtonId('PLUNGER')).toBe(true);
    expect(isButtonId('FRONT_WHITE')).toBe(true);
    expect(isButtonId('BLACK_LEFT')).toBe(true);
  });

  test('rejette les ids inconnus et la casse incorrecte', () => {
    expect(isButtonId('white_left')).toBe(false);
    expect(isButtonId('UNKNOWN')).toBe(false);
    expect(isButtonId('')).toBe(false);
  });
});

describe('parseLine — boutons', () => {
  test('BTN DOWN valide pour plusieurs ids', () => {
    expect(parseLine('BTN:WHITE_LEFT:DOWN')).toEqual({
      kind: 'button',
      id: 'WHITE_LEFT',
      action: 'DOWN',
    });
    expect(parseLine('BTN:PLUNGER:DOWN')).toEqual({
      kind: 'button',
      id: 'PLUNGER',
      action: 'DOWN',
    });
    expect(parseLine('BTN:FRONT_WHITE:DOWN')).toEqual({
      kind: 'button',
      id: 'FRONT_WHITE',
      action: 'DOWN',
    });
  });

  test('BTN UP valide', () => {
    expect(parseLine('BTN:WHITE_RIGHT:UP')).toEqual({
      kind: 'button',
      id: 'WHITE_RIGHT',
      action: 'UP',
    });
  });

  test('id de bouton inconnu → unknown', () => {
    expect(parseLine('BTN:NOPE:DOWN')).toEqual({
      kind: 'unknown',
      line: 'BTN:NOPE:DOWN',
    });
  });

  test('action invalide → unknown', () => {
    expect(parseLine('BTN:WHITE_LEFT:PRESS')).toEqual({
      kind: 'unknown',
      line: 'BTN:WHITE_LEFT:PRESS',
    });
    expect(parseLine('BTN:WHITE_LEFT:down')).toEqual({
      kind: 'unknown',
      line: 'BTN:WHITE_LEFT:down',
    });
  });

  test('BTN avec un nombre de segments incorrect → unknown', () => {
    expect(parseLine('BTN:WHITE_LEFT')).toEqual({
      kind: 'unknown',
      line: 'BTN:WHITE_LEFT',
    });
    expect(parseLine('BTN:WHITE_LEFT:DOWN:EXTRA')).toEqual({
      kind: 'unknown',
      line: 'BTN:WHITE_LEFT:DOWN:EXTRA',
    });
  });
});

describe('parseLine — tilt', () => {
  test('TILT TRIGGERED valide', () => {
    expect(parseLine('TILT:TRIGGERED')).toEqual({ kind: 'tilt' });
  });

  test('TILT avec mauvais payload → unknown', () => {
    expect(parseLine('TILT:RESET')).toEqual({
      kind: 'unknown',
      line: 'TILT:RESET',
    });
    expect(parseLine('TILT')).toEqual({ kind: 'unknown', line: 'TILT' });
    expect(parseLine('TILT:TRIGGERED:EXTRA')).toEqual({
      kind: 'unknown',
      line: 'TILT:TRIGGERED:EXTRA',
    });
  });
});

describe('parseLine — sensor', () => {
  test('SENSOR numérique valide', () => {
    expect(parseLine('SENSOR:PLUNGER:512')).toEqual({
      kind: 'sensor',
      id: 'PLUNGER',
      value: 512,
    });
  });

  test('accepte zéro, négatif et décimal', () => {
    expect(parseLine('SENSOR:X:0')).toEqual({ kind: 'sensor', id: 'X', value: 0 });
    expect(parseLine('SENSOR:X:-5')).toEqual({ kind: 'sensor', id: 'X', value: -5 });
    expect(parseLine('SENSOR:X:3.14')).toEqual({
      kind: 'sensor',
      id: 'X',
      value: 3.14,
    });
  });

  test('valeur NaN → unknown', () => {
    expect(parseLine('SENSOR:X:abc')).toEqual({
      kind: 'unknown',
      line: 'SENSOR:X:abc',
    });
    expect(parseLine('SENSOR:X:1.2.3')).toEqual({
      kind: 'unknown',
      line: 'SENSOR:X:1.2.3',
    });
  });

  test('valeur vide → 0 (Number("") === 0, comportement hérité)', () => {
    expect(parseLine('SENSOR:X:')).toEqual({ kind: 'sensor', id: 'X', value: 0 });
  });

  test('SENSOR avec un nombre de segments incorrect → unknown', () => {
    expect(parseLine('SENSOR:X')).toEqual({ kind: 'unknown', line: 'SENSOR:X' });
    expect(parseLine('SENSOR:X:1:2')).toEqual({
      kind: 'unknown',
      line: 'SENSOR:X:1:2',
    });
  });
});

describe('parseLine — lignes vides et bruit', () => {
  test('chaîne vide → null', () => {
    expect(parseLine('')).toBeNull();
  });

  test('espaces seuls → null', () => {
    expect(parseLine('   ')).toBeNull();
    expect(parseLine('\t\n')).toBeNull();
  });

  test('trim les espaces autour des lignes valides', () => {
    expect(parseLine('  BTN:WHITE_LEFT:DOWN  ')).toEqual({
      kind: 'button',
      id: 'WHITE_LEFT',
      action: 'DOWN',
    });
    expect(parseLine('\tTILT:TRIGGERED\n')).toEqual({ kind: 'tilt' });
  });

  test('garbage divers → unknown', () => {
    expect(parseLine('hello world')).toEqual({
      kind: 'unknown',
      line: 'hello world',
    });
    expect(parseLine('::::')).toEqual({ kind: 'unknown', line: '::::' });
    expect(parseLine('BOOT log line from esp32')).toEqual({
      kind: 'unknown',
      line: 'BOOT log line from esp32',
    });
  });
});
