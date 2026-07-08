import { test, expect, describe } from 'bun:test';
import * as THREE from 'three';
import { collectBumperParts, type BumperPartContext } from '../../src/infrastructure/BumperPartCollector';
import type { BumperMatchRule, BumperPoint } from '../../src/domain/BumperVisualMath';

type Kind = 'gltf' | 'ring';

const RULES: readonly BumperMatchRule<Kind>[] = [
  { pattern: /^bumper-st-\d+$/, result: { action: 'hide' } },
  { pattern: /^bumper[-_]\d+$/, result: { action: 'part', kind: 'gltf' } },
  { pattern: /^bumper_ring/, result: { action: 'part', kind: 'ring' } },
];

const BUMPERS: BumperPoint[] = [
  { x: 0, y: 0, z: 0 },
  { x: 10, y: 0, z: 0 },
];

function meshNamed(name: string, x = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial());
  m.name = name;
  m.position.set(x, 0, 0);
  return m;
}

function identity(ctx: BumperPartContext<Kind>): BumperPartContext<Kind> {
  return ctx;
}

describe('collectBumperParts', () => {
  test('ne collecte que les meshes matchant une regle part', () => {
    const root = new THREE.Group();
    root.add(meshNamed('bumper-1'));
    root.add(meshNamed('bumper_ring.002'));
    root.add(meshNamed('decor_plate'));

    const parts = collectBumperParts(root, BUMPERS, RULES, identity);

    expect(parts.map((p) => p.kind)).toEqual(['gltf', 'ring']);
  });

  test('classe le kind via la premiere regle gagnante', () => {
    const root = new THREE.Group();
    root.add(meshNamed('bumper-3'));

    const parts = collectBumperParts(root, BUMPERS, RULES, identity);

    expect(parts).toHaveLength(1);
    expect(parts[0]!.kind).toBe('gltf');
  });

  test('action hide masque le noeud et ses descendants, sans creer de part', () => {
    const root = new THREE.Group();
    const legacy = meshNamed('bumper-st-1');
    const child = meshNamed('inner');
    legacy.add(child);
    root.add(legacy);

    const parts = collectBumperParts(root, BUMPERS, RULES, identity);

    expect(parts).toHaveLength(0);
    expect(legacy.visible).toBe(false);
    expect(child.visible).toBe(false);
  });

  test('un noeud non-Mesh matchant part est ignore (gate instanceof Mesh)', () => {
    const root = new THREE.Group();
    const groupNamed = new THREE.Group();
    groupNamed.name = 'bumper-1';
    root.add(groupNamed);

    const parts = collectBumperParts(root, BUMPERS, RULES, identity);

    expect(parts).toHaveLength(0);
  });

  test('bumperIndex = bumper de layout le plus proche en position monde', () => {
    const root = new THREE.Group();
    root.add(meshNamed('bumper-1', 9)); // proche du bumper 1 (x=10)

    const parts = collectBumperParts(root, BUMPERS, RULES, identity);

    expect(parts[0]!.bumperIndex).toBe(1);
  });

  test('baseScale clone la scale courante (independante des mutations futures)', () => {
    const root = new THREE.Group();
    const m = meshNamed('bumper-1');
    m.scale.set(2, 3, 4);
    root.add(m);

    const parts = collectBumperParts(root, BUMPERS, RULES, identity);
    m.scale.set(9, 9, 9);

    expect(parts[0]!.baseScale.toArray()).toEqual([2, 3, 4]);
  });

  test('build retournant null filtre le part', () => {
    const root = new THREE.Group();
    root.add(meshNamed('bumper-1'));
    root.add(meshNamed('bumper-2'));

    const parts = collectBumperParts(root, BUMPERS, RULES, (ctx) =>
      ctx.mesh.name === 'bumper-1' ? ctx : null,
    );

    expect(parts).toHaveLength(1);
    expect(parts[0]!.mesh.name).toBe('bumper-1');
  });
});
