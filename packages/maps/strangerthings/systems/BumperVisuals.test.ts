import { test, expect, describe } from 'bun:test';
import * as THREE from 'three';
import type { GameEvent } from '@pinball/game-engine';
import { layout } from '../layout';

// GlowSprite (gltf/base) cree un canvas radial. Pas de happy-dom dans ce
// package : on stub le minimum de document.createElement('canvas') pour que
// le constructeur de texture passe, de facon deterministe.
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

const g = globalThis as { document?: { createElement: (tag: string) => StubCanvas } };
if (typeof g.document === 'undefined') {
  g.document = {
    createElement: (): StubCanvas => ({
      width: 0,
      height: 0,
      getContext: (): StubContext => ({
        createRadialGradient: () => ({ addColorStop: () => {} }),
        fillRect: () => {},
        fillStyle: undefined,
      }),
    }),
  };
}

// Importe APRES le stub (GlowSprite genere sa texture partagee a la 1re ctor).
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

    // legacy masque, decor intact
    expect(legacy.visible).toBe(false);
    expect(decor.scale.toArray()).toEqual([3, 3, 3]);

    // punch applique aux 3 kinds matchant le bumper 0
    v.onGameEvent(bumperHit(0));
    v.update(PUNCH_DURATION / 2);
    expect(gltf.scale.x).toBeCloseTo(1 + PUNCH_PEAK, 5);
    expect(base.scale.x).toBeCloseTo(1 + PUNCH_PEAK, 5);
    expect(ring.scale.x).toBeCloseTo(1 + PUNCH_PEAK, 5);
    // decor jamais touche
    expect(decor.scale.toArray()).toEqual([3, 3, 3]);
  });

  test('onGameEvent BUMPER_HIT arme punch + hit flash; update les applique', () => {
    const root = new THREE.Group();
    const ring = meshNamed('bumper_ring.001', layout.bumpers[0]!);
    root.add(ring);

    const v = new BumperVisuals();
    v.setup(root);
    const mat = ring.material as THREE.MeshStandardMaterial;

    // idle (sans hit) : scale revient a base, emissiveIntensity de repos
    v.update(0.016);
    expect(ring.scale.x).toBeCloseTo(1, 5);
    const idleIntensity = mat.emissiveIntensity;

    // hit : punch scale au pic + flash augmente l intensite
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
    // B2 : dispose remet la scale a baseScale (avant, ST la laissait gonflee)
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
    // plus aucun part suivi -> update ne reapplique aucune transformation
    v.update(1);
    expect(ring.scale.toArray()).toEqual(afterDispose.toArray());
  });

  test('hit flash decay: a elapsed egal, avec flash > sans flash', () => {
    // Compare deux instances au MEME elapsed (meme phase de respiration) :
    // seule differe la presence du hit flash -> isole hitFactor.
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
