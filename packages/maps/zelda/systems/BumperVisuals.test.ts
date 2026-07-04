import { test, expect, describe } from 'bun:test';
import * as THREE from 'three';
import type { GameEvent } from '@pinball/game-engine';
import { layout } from '../layout';
import { BumperVisuals } from './BumperVisuals';

const PUNCH_DURATION = 0.18;
const PUNCH_PEAK = 0.28;

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

function rootWithBumper(index = 0): { root: THREE.Group; mesh: THREE.Mesh } {
  const root = new THREE.Group();
  const b = layout.bumpers[index]!;
  const mesh = meshNamed('vis_bumper.001', b);
  root.add(mesh);
  return { root, mesh };
}

describe('zelda BumperVisuals wiring', () => {
  test('setup matche les meshes vis_bumper et ignore les autres', () => {
    const root = new THREE.Group();
    const hit = meshNamed('vis_bumper.001', layout.bumpers[0]!);
    const skip = meshNamed('decor_torch', layout.bumpers[0]!);
    skip.scale.set(2, 2, 2);
    root.add(hit, skip);

    const v = new BumperVisuals();
    v.setup(root);
    v.onGameEvent(bumperHit(0));
    v.update(PUNCH_DURATION / 2);

    // the vis_bumper mesh got the punch (peak), decor untouched
    expect(hit.scale.x).toBeCloseTo(1 + PUNCH_PEAK, 5);
    expect(skip.scale.toArray()).toEqual([2, 2, 2]);
  });

  test('onGameEvent BUMPER_HIT arme le timer -> update applique le punch scale', () => {
    const { root, mesh } = rootWithBumper(0);
    const v = new BumperVisuals();
    v.setup(root);

    v.update(0.016);
    expect(mesh.scale.x).toBeCloseTo(1, 5); // idle = baseScale

    v.onGameEvent(bumperHit(0));
    v.update(PUNCH_DURATION / 2); // midway -> peak
    expect(mesh.scale.x).toBeCloseTo(1 + PUNCH_PEAK, 5);
  });

  test('un event non-BUMPER_HIT est ignore', () => {
    const { root, mesh } = rootWithBumper(0);
    const v = new BumperVisuals();
    v.setup(root);

    v.onGameEvent(DRAIN);
    v.update(PUNCH_DURATION / 2);

    expect(mesh.scale.x).toBeCloseTo(1, 5);
  });

  test('dispose restaure la scale d origine', () => {
    const root = new THREE.Group();
    const mesh = meshNamed('vis_bumper.001', layout.bumpers[0]!);
    mesh.scale.set(1.5, 1.5, 1.5);
    root.add(mesh);

    const v = new BumperVisuals();
    v.setup(root);
    v.onGameEvent(bumperHit(0));
    v.update(PUNCH_DURATION / 2); // inflates beyond baseScale
    expect(mesh.scale.x).toBeGreaterThan(1.5);

    v.dispose();
    expect(mesh.scale.toArray()).toEqual([1.5, 1.5, 1.5]);
  });
});
