import { test, expect, describe } from 'bun:test';
import { livesDisplay, DOTS_MAX_LIVES } from '../src/livesDisplay';

describe('livesDisplay — règle pastilles vs compteur', () => {
  test('0 vie → 3 pastilles, 0 remplie', () => {
    expect(livesDisplay(0)).toEqual({ kind: 'dots', total: 3, filled: 0 });
  });

  test('1..3 vies → pastilles avec le bon nombre rempli', () => {
    expect(livesDisplay(1)).toEqual({ kind: 'dots', total: 3, filled: 1 });
    expect(livesDisplay(2)).toEqual({ kind: 'dots', total: 3, filled: 2 });
    expect(livesDisplay(3)).toEqual({ kind: 'dots', total: 3, filled: 3 });
  });

  test('exactement DOTS_MAX_LIVES reste en pastilles', () => {
    expect(livesDisplay(DOTS_MAX_LIVES).kind).toBe('dots');
  });

  test('> 3 vies → compteur compact avec la vraie valeur (pas de plafond à 3)', () => {
    expect(livesDisplay(4)).toEqual({ kind: 'count', value: 4 });
    expect(livesDisplay(7)).toEqual({ kind: 'count', value: 7 });
    expect(livesDisplay(12)).toEqual({ kind: 'count', value: 12 });
  });

  test('valeurs négatives clampées à 0 pastille', () => {
    expect(livesDisplay(-2)).toEqual({ kind: 'dots', total: 3, filled: 0 });
  });

  test('valeurs fractionnaires tronquées', () => {
    expect(livesDisplay(2.9)).toEqual({ kind: 'dots', total: 3, filled: 2 });
    expect(livesDisplay(4.9)).toEqual({ kind: 'count', value: 4 });
  });
});
