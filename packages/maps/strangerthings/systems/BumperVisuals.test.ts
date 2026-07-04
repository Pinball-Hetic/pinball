import { test, expect, describe } from 'bun:test';
import * as THREE from 'three';
import type { GameEvent } from '@pinball/game-engine';
import { layout } from '../layout';

// GlowSprite (gltf/base) creates a radial canvas. No happy-dom in this
// package: stub the minimum of document.createElement('canvas') so the
// texture constructor passes, deterministically.
type StubCanvas = {
  width: number;
  height: number;
  getContext: () => StubContext;
};
type StubContext = {
  createRadialGradient: () => { addColorStop: () => void };
  fillRect: () => void;
  fillStyle: unknown;
};

type StubDoc = {
  createElement: (tag: string) => StubCanvas;
  createElementNS: (ns: string, tag: string) => StubCanvas;
};
const g = globalThis as { document?: StubDoc };
if (typeof g.document === 'undefined') {
  const makeCanvas = (): StubCanvas => ({
    width: 0,
    height: 0,
    getContext: (): StubContext => ({
      createRadialGradient: () => ({ addColorStop: () => {} }),
      fillRect: () => {},
      fillStyle: undefined,
    }),
  });
  // createElementNS is also provided so this shared global document isn't
  // incomplete for a later test file (bun test shares the module singleton).
  g.document = { createElement: makeCanvas, createElementNS: makeCanvas };
}

// Import AFTER the stub (GlowSprite builds its shared texture on first ctor).
const { BumperVisuals } = await import('./BumperVisuals');

const PUNCH_DURATION = 0.15;
const PUNCH_PEAK = 0.2;

function bumperHit(bumperIndex: number): GameEvent {
  return { type: 'BUMPER_HIT', bumperIndex, scoreIncrement: 100 };
}

const DRAIN: GameEvent = { type: 'DRAIN' };

function meshNamed(name: string, pos: { x: number; y: number; z: number }): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial());
  m.name = name;
  m.position.set(pos.x, pos.y, pos.z);
  return m;
}

describe('strangerthings BumperVisuals wiring', () => {
  test('setup matche gltf/base/ring, masque les legacy, ignore le reste', () => {
    const root = new THREE.Group();
    const b = layout.bumpers[0]!;
    const gltf = meshNamed('bumper-1', b);
    const base = meshNamed('bumper-strangerthings', b);
    const ring = meshNamed('bumper_ring.001', b);
    const legacy = meshNamed('bumper-st-1', b);
    const decor = meshNamed('decor_wall', b);
    decor.scale.set(3, 3, 3);
    root.add(gltf, base, ring, legacy, decor);

    const v = new BumperVisuals();
    v.setup(root);

    // legacy hidden, decor untouched
    expect(legacy.visible).toBe(false);
    expect(decor.scale.toArray()).toEqual([3, 3, 3]);

    // punch applied to the 3 kinds matching bumper 0
    v.onGameEvent(bumperHit(0));
    v.update(PUNCH_DURATION / 2);
    expect(gltf.scale.x).toBeCloseTo(1 + PUNCH_PEAK, 5);
    expect(base.scale.x).toBeCloseTo(1 + PUNCH_PEAK, 5);
    expect(ring.scale.x).toBeCloseTo(1 + PUNCH_PEAK, 5);
    // decor never touched
    expect(decor.scale.toArray()).toEqual([3, 3, 3]);
  });

  test('onGameEvent BUMPER_HIT arme punch + hit flash; update les applique', () => {
    const root = new THREE.Group();
    const ring = meshNamed('bumper_ring.001', layout.bumpers[0]!);
    root.add(ring);

    const v = new BumperVisuals();
    v.setup(root);
    const mat = ring.material as THREE.MeshStandardMaterial;

    // idle (no hit): scale returns to base, resting emissiveIntensity
    v.update(0.016);
    expect(ring.scale.x).toBeCloseTo(1, 5);
    const idleIntensity = mat.emissiveIntensity;

    // hit: punch scale at peak + flash raises the intensity
    v.onGameEvent(bumperHit(0));
    v.update(PUNCH_DURATION / 2);
    expect(ring.scale.x).toBeCloseTo(1 + PUNCH_PEAK, 5);
    expect(mat.emissiveIntensity).toBeGreaterThan(idleIntensity);
  });

  test('un event non-BUMPER_HIT est ignore (pas de punch)', () => {
    const root = new THREE.Group();
    const ring = meshNamed('bumper_ring.001', layout.bumpers[0]!);
    root.add(ring);

    const v = new BumperVisuals();
    v.setup(root);
    v.onGameEvent(DRAIN);
    v.update(PUNCH_DURATION / 2);

    expect(ring.scale.x).toBeCloseTo(1, 5);
  });

  test('dispose restaure la scale d origine (B2: parite Zelda)', () => {
    const root = new THREE.Group();
    const ring = meshNamed('bumper_ring.001', layout.bumpers[0]!);
    ring.scale.set(1.5, 1.5, 1.5);
    root.add(ring);

    const v = new BumperVisuals();
    v.setup(root);
    v.onGameEvent(bumperHit(0));
    v.update(PUNCH_DURATION / 2); // gonfle au-dela de baseScale
    expect(ring.scale.x).toBeGreaterThan(1.5);

    v.dispose();
    // dispose restores scale to baseScale (previously ST left it inflated)
    expect(ring.scale.toArray()).toEqual([1.5, 1.5, 1.5]);
  });

  test('dispose vide les parts: update ulterieur ne touche plus le mesh', () => {
    const root = new THREE.Group();
    const ring = meshNamed('bumper_ring.001', layout.bumpers[0]!);
    root.add(ring);

    const v = new BumperVisuals();
    v.setup(root);
    v.dispose();
    const afterDispose = ring.scale.clone();
    // no part tracked anymore -> update reapplies no transform
    v.update(1);
    expect(ring.scale.toArray()).toEqual(afterDispose.toArray());
  });

  test('hit flash decay: a elapsed egal, avec flash > sans flash', () => {
    // Compare two instances at the SAME elapsed (same breathing phase):
    // only the hit flash presence differs -> isolates hitFactor.
    const makeRing = () => {
      const root = new THREE.Group();
      const ring = meshNamed('bumper_ring.001', layout.bumpers[0]!);
      root.add(ring);
      const v = new BumperVisuals();
      v.setup(root);
      return { v, mat: ring.material as THREE.MeshStandardMaterial };
    };

    const idle = makeRing();
    idle.v.update(0.05);
    const idleIntensity = idle.mat.emissiveIntensity;

    const hit = makeRing();
    hit.v.onGameEvent(bumperHit(0));
    hit.v.update(0.05); // flash encore actif (< HIT_FLASH_DURATION)
    expect(hit.mat.emissiveIntensity).toBeGreaterThan(idleIntensity);
  });
});
