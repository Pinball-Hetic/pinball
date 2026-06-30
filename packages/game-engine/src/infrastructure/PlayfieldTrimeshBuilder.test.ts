import { test, expect, describe } from 'bun:test';
import { isSkipped } from './PlayfieldTrimeshBuilder';

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
