import { test, expect, describe } from 'bun:test';
import { createLineBuffer } from './line-buffer';

function collector() {
  const lines: string[] = [];
  const buffer = createLineBuffer((line) => lines.push(line));
  return { buffer, lines };
}

describe('createLineBuffer — découpage pur en lignes', () => {
  test('ligne complète en un chunk → émet une ligne', () => {
    const { buffer, lines } = collector();
    buffer.push('BTN:WHITE_LEFT:DOWN\n');
    expect(lines).toEqual(['BTN:WHITE_LEFT:DOWN']);
  });

  test('plusieurs lignes dans un seul chunk → émet chacune dans l’ordre', () => {
    const { buffer, lines } = collector();
    buffer.push('TILT:TRIGGERED\nSENSOR:PLUNGER:512\nBTN:PLUNGER:UP\n');
    expect(lines).toEqual(['TILT:TRIGGERED', 'SENSOR:PLUNGER:512', 'BTN:PLUNGER:UP']);
  });

  test('ligne partielle → rien émis tant que pas de newline', () => {
    const { buffer, lines } = collector();
    buffer.push('BTN:WHITE');
    expect(lines).toEqual([]);
  });

  test('ligne fragmentée sur plusieurs chunks → recollée puis émise', () => {
    const { buffer, lines } = collector();
    buffer.push('BTN:WHITE');
    buffer.push('_LEFT:');
    buffer.push('DOWN\n');
    expect(lines).toEqual(['BTN:WHITE_LEFT:DOWN']);
  });

  test('chunk avec ligne complète + reste partiel → émet la complète, garde le reste', () => {
    const { buffer, lines } = collector();
    buffer.push('TILT:TRIGGERED\nBTN:PLUNG');
    expect(lines).toEqual(['TILT:TRIGGERED']);
    buffer.push('ER:DOWN\n');
    expect(lines).toEqual(['TILT:TRIGGERED', 'BTN:PLUNGER:DOWN']);
  });

  test('ligne vide entre deux newlines → émet une chaîne vide', () => {
    const { buffer, lines } = collector();
    buffer.push('A\n\nB\n');
    expect(lines).toEqual(['A', '', 'B']);
  });

  test('accepte un Buffer (chunk binaire utf8)', () => {
    const { buffer, lines } = collector();
    buffer.push(Buffer.from('BTN:BLACK_LEFT:DOWN\n', 'utf8'));
    expect(lines).toEqual(['BTN:BLACK_LEFT:DOWN']);
  });

  test('garde-fou overflow : ligne sans newline >8192 → buffer reset (rien émis)', () => {
    const { buffer, lines } = collector();
    buffer.push('x'.repeat(9000));
    expect(lines).toEqual([]);
    // après reset, une ligne complète repart proprement
    buffer.push('BTN:PLUNGER:UP\n');
    expect(lines).toEqual(['BTN:PLUNGER:UP']);
  });

  test('overflow ne perd pas une ligne déjà complète dans le même chunk', () => {
    const { buffer, lines } = collector();
    buffer.push('GOOD\n' + 'y'.repeat(9000));
    expect(lines).toEqual(['GOOD']);
  });

  test('exactement 8192 sans newline → pas de reset (limite stricte >)', () => {
    const { buffer, lines } = collector();
    buffer.push('z'.repeat(8192));
    buffer.push('\n');
    expect(lines).toEqual(['z'.repeat(8192)]);
  });
});
