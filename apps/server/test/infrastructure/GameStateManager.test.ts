import { test, expect, describe } from 'bun:test';
import { DEFAULT_MAP_ID } from '@pinball/shared-types';
import { GameStateManager } from '../../src/infrastructure/GameStateManager';

describe('GameStateManager', () => {
  test('démarre sur la map par défaut', () => {
    expect(new GameStateManager().getMapId()).toBe(DEFAULT_MAP_ID);
  });

  test('setMapId met à jour la map courante', () => {
    const gs = new GameStateManager();
    gs.setMapId('zelda');
    expect(gs.getMapId()).toBe('zelda');
  });

  test('chaque instance est isolée (pas d état partagé)', () => {
    const a = new GameStateManager();
    const b = new GameStateManager();
    a.setMapId('zelda');
    expect(b.getMapId()).toBe(DEFAULT_MAP_ID);
  });
});
