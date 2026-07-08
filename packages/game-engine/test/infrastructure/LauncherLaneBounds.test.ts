import { test, expect, describe, afterEach } from 'bun:test';
import * as THREE from 'three';
import { computeLauncherLaneZBounds } from '../../src/infrastructure/LauncherLaneBounds';
import { getBallRadius, WALL_BOTTOM_Z, resetBallRadius } from '../../src/domain/Ball';

afterEach(() => resetBallRadius());

// Helper: positioned, named box mesh.
function laneMesh(name: string, z: number, depth = 0.1): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, depth), new THREE.MeshBasicMaterial());
  m.name = name;
  m.position.set(0, 0, z);
  return m;
}

function rootWith(...children: THREE.Object3D[]): THREE.Object3D {
  const root = new THREE.Object3D();
  for (const c of children) root.add(c);
  return root;
}

describe('computeLauncherLaneZBounds', () => {
  test('returns fallback bounds when no launcher mesh is present', () => {
    const root = rootWith(laneMesh('flipper', 0.2));
    expect(computeLauncherLaneZBounds(root)).toEqual({ minZ: 0.03, maxZ: 0.42 });
  });

  test('returns fallback when root is empty', () => {
    expect(computeLauncherLaneZBounds(new THREE.Object3D())).toEqual({
      minZ: 0.03,
      maxZ: 0.42,
    });
  });

  test('derives bounds from a launcher mesh bbox with radius padding', () => {
    // box depth 0.1 centered at z=0.2 → min.z=0.15, max.z=0.25
    const root = rootWith(laneMesh('launcher', 0.2, 0.1));
    const r = getBallRadius();
    const { minZ, maxZ } = computeLauncherLaneZBounds(root);
    expect(minZ).toBeCloseTo(0.15 - r, 5);
    expect(maxZ).toBeCloseTo(0.25 + r * 0.5, 5);
  });

  test('unions multiple recognised lane meshes', () => {
    const root = rootWith(
      laneMesh('separator_left', 0.1, 0.1), // 0.05 .. 0.15
      laneMesh('separator_right', 0.3, 0.1), // 0.25 .. 0.35
    );
    const r = getBallRadius();
    const { minZ, maxZ } = computeLauncherLaneZBounds(root);
    expect(minZ).toBeCloseTo(0.05 - r, 5);
    expect(maxZ).toBeCloseTo(0.35 + r * 0.5, 5);
  });

  test('recognises the canonical name (prefix-stripped) variant', () => {
    // "coll_launcher" → canonical "launcher" should still match
    const root = rootWith(laneMesh('coll_launcher', 0.2, 0.1));
    expect(computeLauncherLaneZBounds(root)).not.toEqual({ minZ: 0.03, maxZ: 0.42 });
  });

  test('clamps minZ to -0.05 lower bound', () => {
    // box far in the negative so box.min.z - r < -0.05
    const root = rootWith(laneMesh('launcher', -0.5, 0.4)); // min.z = -0.7
    const { minZ } = computeLauncherLaneZBounds(root);
    expect(minZ).toBe(-0.05);
  });

  test('clamps maxZ to WALL_BOTTOM_Z upper bound', () => {
    // box pushed past the wall so box.max.z + r*0.5 > WALL_BOTTOM_Z
    const root = rootWith(laneMesh('launcher', 1.0, 0.4)); // max.z = 1.2
    const { maxZ } = computeLauncherLaneZBounds(root);
    expect(maxZ).toBe(WALL_BOTTOM_Z);
  });

  test('ignores non-mesh objects with a lane name', () => {
    const grp = new THREE.Object3D();
    grp.name = 'launcher';
    const root = rootWith(grp);
    expect(computeLauncherLaneZBounds(root)).toEqual({ minZ: 0.03, maxZ: 0.42 });
  });
});
