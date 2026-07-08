import { test, expect, describe, spyOn, beforeEach, afterEach } from 'bun:test';
import * as THREE from 'three';
import { LayoutResolver } from '../../src/infrastructure/LayoutResolver';
import { MeshRoleResolver } from '../../src/infrastructure/MeshRoleResolver';
import type { MapLayout, MapPoint3, DropTargetDef } from '../../src/domain/MapLayout';

// Build a 0.02-side cube mesh centered on (x,y,z). Box3.setFromObject →
// center = mesh position (geometry symmetric around the local origin).
function cubeAt(name: string, x: number, y: number, z: number): THREE.Mesh {
  const geo = new THREE.BoxGeometry(0.02, 0.02, 0.02);
  const mesh = new THREE.Mesh(geo);
  mesh.name = name;
  mesh.position.set(x, y, z);
  return mesh;
}

const resolver = () => new MeshRoleResolver();

describe('LayoutResolver.derive', () => {
  test('dérive les bumpers indexés par (n-1) depuis le centre Box3 monde', () => {
    const root = new THREE.Object3D();
    root.add(cubeAt('bumper_1', 0.1, 1.0, -0.2));
    root.add(cubeAt('bumper_2', -0.1, 1.0, 0.3));

    const derived = LayoutResolver.derive(root, resolver());

    expect(derived.bumpers[0]).toEqual({ x: 0.1, y: 1.0, z: -0.2 });
    expect(derived.bumpers[1]).toEqual({ x: -0.1, y: 1.0, z: 0.3 });
  });

  test('dérive les drop targets clés par `drop_<id>`', () => {
    const root = new THREE.Object3D();
    root.add(cubeAt('target_a', 0.05, 0.9, 0.1));
    root.add(cubeAt('target_left2', -0.05, 0.9, 0.15));

    const derived = LayoutResolver.derive(root, resolver());

    expect(derived.dropTargets['drop_a']).toEqual({ x: 0.05, y: 0.9, z: 0.1 });
    expect(derived.dropTargets['drop_left2']).toEqual({ x: -0.05, y: 0.9, z: 0.15 });
  });

  test('prend en compte les transforms parents (matrice monde)', () => {
    const root = new THREE.Object3D();
    const group = new THREE.Object3D();
    group.position.set(1, 0, 0); // décale tous les enfants de +1 en x
    group.add(cubeAt('bumper_1', 0.1, 0, 0));
    root.add(group);

    const derived = LayoutResolver.derive(root, resolver());

    expect(derived.bumpers[0]!.x).toBeCloseTo(1.1, 5);
  });

  test('hérite du rôle via le groupe parent préfixé (resolveFromAncestry)', () => {
    const root = new THREE.Object3D();
    const group = new THREE.Object3D();
    group.name = 'bumper_3';
    // Primitive from a material split, non-conventional name.
    group.add(cubeAt('Mesh_8', 0.2, 1, 0.2));
    root.add(group);

    const derived = LayoutResolver.derive(root, resolver());

    // The group itself resolves as bumper (subtree center), the child Mesh_8
    // inherits too → same slot, idempotent overwrite.
    expect(derived.bumpers[2]).not.toBeNull();
    expect(derived.bumpers[2]!.x).toBeCloseTo(0.2, 5);
  });

  test('ignore les meshes sans rôle reconnu', () => {
    const root = new THREE.Object3D();
    root.add(cubeAt('vis_decor', 0, 0, 0));
    root.add(cubeAt('random_thing', 0, 0, 0));
    root.add(cubeAt('wall_left', 0, 0, 0));

    const derived = LayoutResolver.derive(root, resolver());

    expect(derived.bumpers).toEqual([]);
    expect(derived.dropTargets).toEqual({});
  });

  test('ignore un bumper dont le suffixe n’est pas numérique', () => {
    const root = new THREE.Object3D();
    root.add(cubeAt('bumper_abc', 0.1, 1, 0.1));

    const derived = LayoutResolver.derive(root, resolver());

    expect(derived.bumpers).toEqual([]);
  });

  test('crée des trous (slots null/undefined) pour les index manquants', () => {
    const root = new THREE.Object3D();
    root.add(cubeAt('bumper_3', 0.1, 1, 0.1)); // seul le 3e existe

    const derived = LayoutResolver.derive(root, resolver());

    expect(derived.bumpers[2]).toEqual({ x: 0.1, y: 1, z: 0.1 });
    expect(derived.bumpers[0]).toBeUndefined();
  });
});

describe('LayoutResolver.withDerivedDropTargets', () => {
  const baseLayout = (dropTargets: DropTargetDef[]): MapLayout =>
    ({ dropTargets } as unknown as MapLayout);

  test('remplace les positions des drop targets ayant un mesh dérivé', () => {
    const layout = baseLayout([
      { id: 'drop_a', x: 0, y: 0, z: 0, side: 'left' },
      { id: 'drop_b', x: 9, y: 9, z: 9, side: 'right' },
    ]);
    const derived = {
      bumpers: [],
      dropTargets: { drop_a: { x: 0.5, y: 0.6, z: 0.7 } as MapPoint3 },
    };

    const out = LayoutResolver.withDerivedDropTargets(layout, derived);

    expect(out.dropTargets[0]).toEqual({ id: 'drop_a', x: 0.5, y: 0.6, z: 0.7, side: 'left' });
    // drop_b without mesh → keeps its literal.
    expect(out.dropTargets[1]).toEqual({ id: 'drop_b', x: 9, y: 9, z: 9, side: 'right' });
  });

  test('ne mute pas le layout d’origine (copie immuable)', () => {
    const layout = baseLayout([{ id: 'drop_a', x: 0, y: 0, z: 0, side: 'left' }]);
    const derived = {
      bumpers: [],
      dropTargets: { drop_a: { x: 1, y: 2, z: 3 } as MapPoint3 },
    };

    const out = LayoutResolver.withDerivedDropTargets(layout, derived);

    expect(out).not.toBe(layout);
    expect(layout.dropTargets[0]).toEqual({ id: 'drop_a', x: 0, y: 0, z: 0, side: 'left' });
  });

  test('conserve tous les littéraux quand aucun mesh n’est dérivé', () => {
    const layout = baseLayout([{ id: 'drop_a', x: 1, y: 2, z: 3, side: 'right' }]);
    const out = LayoutResolver.withDerivedDropTargets(layout, { bumpers: [], dropTargets: {} });
    expect(out.dropTargets).toEqual(layout.dropTargets);
  });
});

describe('LayoutResolver.deriveAndCompare', () => {
  let logSpy: ReturnType<typeof spyOn>;
  let warnSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    logSpy = spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
  });

  const layoutWith = (
    bumpers: MapPoint3[],
    dropTargets: DropTargetDef[],
  ): MapLayout => ({ bumpers, dropTargets } as unknown as MapLayout);

  test('retourne le layout dérivé et logge OK quand le delta est sous la tolérance', () => {
    const root = new THREE.Object3D();
    root.add(cubeAt('bumper_1', 0.1, 1.0, -0.2));
    const layout = layoutWith([{ x: 0.1, y: 1.0, z: -0.2 }], []);

    const derived = LayoutResolver.deriveAndCompare(root, resolver(), layout);

    expect(derived.bumpers[0]).toEqual({ x: 0.1, y: 1.0, z: -0.2 });
    const line = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(line).toContain('bumper_1');
    expect(line).toContain('OK');
  });

  test('marque HORS TOLÉRANCE quand le delta dépasse le seuil', () => {
    const root = new THREE.Object3D();
    root.add(cubeAt('bumper_1', 0.1, 1.0, -0.2));
    // Constant off by 100mm (delta > 5mm default).
    const layout = layoutWith([{ x: 0.2, y: 1.0, z: -0.2 }], []);

    LayoutResolver.deriveAndCompare(root, resolver(), layout);

    const line = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(line).toContain('HORS TOLÉRANCE');
  });

  test('respecte une tolérance personnalisée', () => {
    const root = new THREE.Object3D();
    root.add(cubeAt('bumper_1', 0.1, 1.0, -0.2));
    const layout = layoutWith([{ x: 0.15, y: 1.0, z: -0.2 }], []); // 50mm d'écart

    LayoutResolver.deriveAndCompare(root, resolver(), layout, 100); // tol 100mm

    const line = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(line).toContain('OK');
    expect(line).not.toContain('HORS');
  });

  test('warn quand une constante n’a pas de mesh dérivé', () => {
    const root = new THREE.Object3D(); // aucun bumper dans le GLB
    const layout = layoutWith([{ x: 0.1, y: 1.0, z: -0.2 }], []);

    LayoutResolver.deriveAndCompare(root, resolver(), layout);

    const warns = warnSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(warns).toContain('pas de mesh dérivé');
  });

  test('compare aussi les drop targets par leur id', () => {
    const root = new THREE.Object3D();
    root.add(cubeAt('target_a', 0.05, 0.9, 0.1));
    const layout = layoutWith(
      [],
      [{ id: 'drop_a', x: 0.05, y: 0.9, z: 0.1, side: 'left' }],
    );

    LayoutResolver.deriveAndCompare(root, resolver(), layout);

    const line = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(line).toContain('drop_a');
    expect(line).toContain('OK');
  });
});
