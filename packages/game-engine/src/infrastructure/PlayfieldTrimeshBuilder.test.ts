import { test, expect, describe } from 'bun:test';
import { classifyPinballmapMesh, isSkipped } from './PlayfieldTrimeshBuilder';

// ancestry order = self → parents (comme produit par ancestryNames()).

describe('isSkipped — Pinballmap gameplay branch', () => {
  test('collOnly + non-coll_ self → skipped', () => {
    expect(isSkipped(['wall', 'Pinballmap'], true)).toBe(true);
  });

  test('collOnly + coll_ self → not skipped via collOnly (falls through to false)', () => {
    // coll_ self, not a flipper, not analytic → returns false
    expect(isSkipped(['coll_wall', 'Pinballmap'], true)).toBe(false);
  });

  test('flipper mesh under Pinballmap → skipped', () => {
    expect(isSkipped(['flipper', 'Pinballmap'], false)).toBe(true);
  });

  test('COLLISION_ANALYTIC name under Pinballmap → skipped', () => {
    expect(isSkipped(['flipper_left_split', 'Pinballmap'], false)).toBe(true);
  });

  test('plain gameplay mesh → not skipped', () => {
    expect(isSkipped(['mesh_1', 'Pinballmap'], false)).toBe(false);
  });
});

describe('isSkipped — non-Pinballmap branch', () => {
  test('junk name → skipped', () => {
    expect(isSkipped(['circle001', 'root'], false)).toBe(true);
  });

  test('collOnly + non-coll_ self → skipped', () => {
    // 'slingshot' is a junk? no — not junk, in COLLISION_SOLIDS. collOnly gates first.
    expect(isSkipped(['slingshot', 'root'], true)).toBe(true);
  });

  test('visual-only ancestry → skipped', () => {
    expect(isSkipped(['cap', 'vis_decor', 'root'], false)).toBe(true);
  });

  test('not in COLLISION_SOLIDS → skipped', () => {
    expect(isSkipped(['random_mesh', 'root'], false)).toBe(true);
  });

  test('in COLLISION_SOLIDS but also COLLISION_ANALYTIC → skipped', () => {
    // 'flipper' is in both COLLISION_SOLIDS and COLLISION_ANALYTIC
    expect(isSkipped(['flipper', 'root'], false)).toBe(true);
  });

  test('in COLLISION_SOLIDS but TRIMESH_DEDICATED → skipped', () => {
    // 'slingshot' is in COLLISION_SOLIDS and TRIMESH_NO_BOUNCE (=> dedicated)
    expect(isSkipped(['slingshot', 'root'], false)).toBe(true);
  });

  test('EXCLUDED parent node → skipped', () => {
    // 'playfield_sides' passes solids/analytic/dedicated; parent 'launcher' is excluded
    expect(isSkipped(['playfield_sides', 'launcher'], false)).toBe(true);
  });

  test('clean COLLISION_SOLIDS mesh with clean ancestry → not skipped', () => {
    expect(isSkipped(['playfield_sides', 'root'], false)).toBe(false);
  });

  test('self in EXCLUDED is NOT checked (walk starts at parent)', () => {
    // self 'ball' is in EXCLUDED_NODES, but the EXCLUDED walk skips index 0.
    // 'ball' is not in COLLISION_SOLIDS → skipped at the solids gate instead.
    expect(isSkipped(['ball', 'root'], false)).toBe(true);
  });

  test('empty ancestry → not a gameplay mesh, not junk, not in solids → skipped', () => {
    expect(isSkipped([], false)).toBe(true);
  });
});

describe('classifyPinballmapMesh — skip guards', () => {
  const PM = ['x', 'Pinballmap'];

  test('non-Pinballmap mesh → skip', () => {
    expect(classifyPinballmapMesh(['mesh_1', 'root'], null)).toEqual({ kind: 'skip' });
  });

  test('flipper under Pinballmap → skip', () => {
    expect(classifyPinballmapMesh(['flipper', 'Pinballmap'], null)).toEqual({ kind: 'skip' });
  });

  test('COLLISION_ANALYTIC name → skip', () => {
    expect(classifyPinballmapMesh(['pop_bumper_left', 'Pinballmap'], null)).toEqual({ kind: 'skip' });
  });

  test('non-physical floor (Mesh_0) → skip', () => {
    expect(classifyPinballmapMesh(['Mesh_0', 'Pinballmap'], null)).toEqual({ kind: 'skip' });
  });

  test('guards run before generic wall fallthrough', () => {
    // sanity: PM helper is a plain gameplay mesh that is not a guard hit.
    expect(classifyPinballmapMesh(PM, null).kind).toBe('wall');
  });
});

describe('classifyPinballmapMesh — bump tag', () => {
  test('bump-right → bump kind, tag dash→underscore, single-sided', () => {
    const c = classifyPinballmapMesh(['bump-right', 'Pinballmap'], null);
    expect(c).toEqual({
      kind: 'bump',
      tag: 'bump_right',
      restitution: 0.4,
      friction: 0.05,
      doubleSided: false,
    });
  });

  test('bump-left → tag bump_left', () => {
    const c = classifyPinballmapMesh(['bump-left', 'Pinballmap'], null);
    expect(c.kind === 'bump' && c.tag).toBe('bump_left');
  });
});

describe('classifyPinballmapMesh — rail dimension threshold', () => {
  // RAIL_SUBMESH_MIN_PHYS_DIM = 0.025. Rail node = circle.NNN / plane.NNN ancestor.
  const railAncestry = ['Mesh_8', 'Circle.018', 'Pinballmap'];

  test('rail with both smallest dims below threshold → skip (decorative)', () => {
    // dims 6mm × 0.6mm × 6mm → two smallest < 25mm.
    expect(classifyPinballmapMesh(railAncestry, [0.006, 0.0006, 0.006])).toEqual({ kind: 'skip' });
  });

  test('rail with a dim at/above threshold → rail kept', () => {
    // 86 × 44 × 290 mm → two smallest (0.044, 0.086) ≥ threshold.
    expect(classifyPinballmapMesh(railAncestry, [0.086, 0.044, 0.29])).toEqual({
      kind: 'rail',
      restitution: 0.35,
      friction: 0.12,
    });
  });

  test('rail with null dims (no AABB) → rail kept (filter skipped)', () => {
    expect(classifyPinballmapMesh(railAncestry, null).kind).toBe('rail');
  });

  test('exactly one small dim below threshold → kept (needs BOTH below)', () => {
    expect(classifyPinballmapMesh(railAncestry, [0.001, 0.05, 0.05]).kind).toBe('rail');
  });
});

describe('classifyPinballmapMesh — wall single-sided branch', () => {
  test('mesh_1 → wall single-sided (doubleSided=false)', () => {
    expect(classifyPinballmapMesh(['Mesh_1', 'Pinballmap'], null)).toEqual({
      kind: 'wall',
      restitution: 0.35,
      friction: 0.12,
      doubleSided: false,
    });
  });

  test('other wall → double-sided', () => {
    const c = classifyPinballmapMesh(['Mesh_3', 'Pinballmap'], null);
    expect(c).toEqual({ kind: 'wall', restitution: 0.35, friction: 0.12, doubleSided: true });
  });
});
