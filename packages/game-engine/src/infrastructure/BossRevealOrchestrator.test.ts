import { test, expect, mock } from 'bun:test';
import * as THREE from 'three';
import { BossRevealOrchestrator } from './BossRevealOrchestrator';
import type { BossRevealController } from './BossRevealController';
import type { GameEvent } from '../domain/GameEvents';

// Faux reveal minimal : implémente le contrat avec des spies, sans Three réel.
function makeFake(
  bossId: string,
  opts: { frozen?: boolean; dynamicLights?: number } = {},
) {
  const spy = {
    preload: mock(() => Promise.resolve()),
    onGameEvent: mock((_e: GameEvent) => undefined),
    endFight: mock(() => undefined),
    update: mock((_dt: number) => undefined),
    dispose: mock(() => undefined),
    isGameplayFrozen: mock(() => opts.frozen ?? false),
  };
  const controller: BossRevealController = {
    bossId,
    preload: spy.preload,
    onGameEvent: spy.onGameEvent,
    endFight: spy.endFight,
    update: spy.update,
    dispose: spy.dispose,
    isGameplayFrozen: spy.isGameplayFrozen,
    ...(opts.dynamicLights !== undefined
      ? { dynamicPointLightCount: () => opts.dynamicLights! }
      : {}),
  };
  return { controller, spy };
}

const RENDERER = {} as THREE.WebGLRenderer;
const SCENE = {} as THREE.Scene;
const CAMERA = {} as THREE.Camera;
const EVENT = { type: 'DRAIN' } as unknown as GameEvent;

test('register is chainable and get returns the registered controller by bossId', () => {
  const orch = new BossRevealOrchestrator();
  const a = makeFake('demogorgon');
  const b = makeFake('vecna');

  expect(orch.register(a.controller)).toBe(orch);
  orch.register(b.controller);

  expect(orch.get('demogorgon')).toBe(a.controller);
  expect(orch.get('vecna')).toBe(b.controller);
  expect(orch.get('unknown')).toBeUndefined();
});

test('preloadAll preloads every reveal with renderer/scene/camera', async () => {
  const orch = new BossRevealOrchestrator();
  const a = makeFake('demogorgon');
  const b = makeFake('vecna');
  orch.register(a.controller).register(b.controller);

  await orch.preloadAll(RENDERER, SCENE, CAMERA);

  expect(a.spy.preload).toHaveBeenCalledTimes(1);
  expect(a.spy.preload).toHaveBeenCalledWith(RENDERER, SCENE, CAMERA);
  expect(b.spy.preload).toHaveBeenCalledTimes(1);
});

test('preloadAll ne pré-chauffe pas les shaders si aucun reveal ne déclare de lumières', async () => {
  const orch = new BossRevealOrchestrator();
  orch.register(makeFake('demogorgon').controller);
  const compileAsync = mock(() => Promise.resolve());
  const renderer = { compileAsync } as unknown as THREE.WebGLRenderer;
  const scene = new THREE.Scene();

  await orch.preloadAll(renderer, scene, CAMERA);

  expect(compileAsync).not.toHaveBeenCalled();
});

test('preloadAll pré-chauffe les variantes 0..max+1 lumières et nettoie la scène', async () => {
  const orch = new BossRevealOrchestrator();
  orch.register(makeFake('demogorgon', { dynamicLights: 4 }).controller);
  orch.register(makeFake('vecna', { dynamicLights: 3 }).controller);
  const compileAsync = mock(() => Promise.resolve());
  const renderer = { compileAsync } as unknown as THREE.WebGLRenderer;
  const scene = new THREE.Scene();

  await orch.preloadAll(renderer, scene, CAMERA);

  // max(4, 3) + 1 de marge = 5 lumières factices → 6 passes (k = 0..5).
  expect(compileAsync).toHaveBeenCalledTimes(6);
  // Les lumières factices ne restent pas dans la scène après le preload.
  expect(scene.children.length).toBe(0);
});

test('preloadAll swallows a rejected preload (others still complete)', async () => {
  const orch = new BossRevealOrchestrator();
  const ok = makeFake('demogorgon');
  const boom = makeFake('vecna');
  boom.spy.preload.mockImplementation(() => Promise.reject(new Error('nope')));
  orch.register(ok.controller).register(boom.controller);

  await expect(orch.preloadAll(RENDERER, SCENE, CAMERA)).resolves.toBeUndefined();
  expect(ok.spy.preload).toHaveBeenCalledTimes(1);
});

test('onGameEvent forwards the event to every reveal', () => {
  const orch = new BossRevealOrchestrator();
  const a = makeFake('demogorgon');
  const b = makeFake('vecna');
  orch.register(a.controller).register(b.controller);

  orch.onGameEvent(EVENT);

  expect(a.spy.onGameEvent).toHaveBeenCalledWith(EVENT);
  expect(b.spy.onGameEvent).toHaveBeenCalledWith(EVENT);
});

test('update forwards dt to every reveal', () => {
  const orch = new BossRevealOrchestrator();
  const a = makeFake('demogorgon');
  const b = makeFake('vecna');
  orch.register(a.controller).register(b.controller);

  orch.update(0.016);

  expect(a.spy.update).toHaveBeenCalledWith(0.016);
  expect(b.spy.update).toHaveBeenCalledWith(0.016);
});

test('endFight ends only the targeted reveal', () => {
  const orch = new BossRevealOrchestrator();
  const a = makeFake('demogorgon');
  const b = makeFake('vecna');
  orch.register(a.controller).register(b.controller);

  orch.endFight('demogorgon');

  expect(a.spy.endFight).toHaveBeenCalledTimes(1);
  expect(b.spy.endFight).not.toHaveBeenCalled();
});

test('endFight no-ops on an unknown id', () => {
  const orch = new BossRevealOrchestrator();
  const a = makeFake('demogorgon');
  orch.register(a.controller);

  expect(() => orch.endFight('does-not-exist')).not.toThrow();
  expect(a.spy.endFight).not.toHaveBeenCalled();
});

test('endAllFights ends every registered reveal (iterates the map, not a fixed list)', () => {
  const orch = new BossRevealOrchestrator();
  const a = makeFake('demogorgon');
  const b = makeFake('vecna');
  const c = makeFake('arbitrary-extra-boss');
  orch.register(a.controller).register(b.controller).register(c.controller);

  orch.endAllFights();

  expect(a.spy.endFight).toHaveBeenCalledTimes(1);
  expect(b.spy.endFight).toHaveBeenCalledTimes(1);
  expect(c.spy.endFight).toHaveBeenCalledTimes(1);
});

test('isGameplayFrozen is false with no frozen reveal', () => {
  const orch = new BossRevealOrchestrator();
  orch.register(makeFake('demogorgon').controller);
  orch.register(makeFake('vecna').controller);

  expect(orch.isGameplayFrozen()).toBe(false);
});

test('isGameplayFrozen is true if any reveal is frozen', () => {
  const orch = new BossRevealOrchestrator();
  orch.register(makeFake('demogorgon').controller);
  orch.register(makeFake('vecna', { frozen: true }).controller);

  expect(orch.isGameplayFrozen()).toBe(true);
});

test('dispose disposes every reveal and clears the registry', () => {
  const orch = new BossRevealOrchestrator();
  const a = makeFake('demogorgon');
  const b = makeFake('vecna');
  orch.register(a.controller).register(b.controller);

  orch.dispose();

  expect(a.spy.dispose).toHaveBeenCalledTimes(1);
  expect(b.spy.dispose).toHaveBeenCalledTimes(1);
  expect(orch.get('demogorgon')).toBeUndefined();
  expect(orch.get('vecna')).toBeUndefined();
});
