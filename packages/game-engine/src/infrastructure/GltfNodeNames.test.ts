import { test, expect, describe } from 'bun:test';
import * as THREE from 'three';
import {
  normalizeGltfName,
  stripGltfPrefixes,
  isVisualOnlyGltfName,
  canonicalGltfName,
  findObjectByNormalizedName,
  hasNamedAncestor,
  isPinballmapGameplayMesh,
  isPinballmapGameplayMeshName,
  isFlipperGltfMesh,
  isFlipperGltfMeshName,
  isVisualOnlyGltfAncestry,
  isPinballmapRailMesh,
  hasPinballmapRoot,
  isPinballmapNonPhysicalFloorMesh,
  PINBALLMAP_NONPHYSICAL_FLOOR_MESHES,
  SWITCH_SENSOR_NODES,
  hidePinballmapDecorNodes,
  removePinballmapUnusedMeshes,
  playfieldUsesCollOnlyCollision,
  isJunkGltfMeshName,
} from './GltfNodeNames';

// Helper : crée un Object3D nommé.
function node(name: string, ...children: THREE.Object3D[]): THREE.Object3D {
  const o = new THREE.Object3D();
  o.name = name;
  for (const c of children) o.add(c);
  return o;
}

// Helper : crée un Mesh nommé avec géométrie réelle.
function mesh(name: string): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  m.name = name;
  return m;
}

describe('normalizeGltfName', () => {
  test('lowercases, trims, collapses spaces to underscores', () => {
    expect(normalizeGltfName('  Switch  Slingshot ')).toBe('switch_slingshot');
  });

  test('idempotent on already-normalized names', () => {
    expect(normalizeGltfName('flipper_left')).toBe('flipper_left');
  });

  test('handles empty string', () => {
    expect(normalizeGltfName('')).toBe('');
  });
});

describe('stripGltfPrefixes', () => {
  test('strips vis_', () => {
    expect(stripGltfPrefixes('vis_glass')).toBe('glass');
  });
  test('strips coll_', () => {
    expect(stripGltfPrefixes('coll_wall')).toBe('wall');
  });
  test('strips pf_', () => {
    expect(stripGltfPrefixes('pf_floor')).toBe('floor');
  });
  test('leaves unprefixed names untouched', () => {
    expect(stripGltfPrefixes('flipper')).toBe('flipper');
  });
  test('only strips a single leading prefix', () => {
    expect(stripGltfPrefixes('vis_coll_x')).toBe('coll_x');
  });
});

describe('isVisualOnlyGltfName', () => {
  test('true for vis_ prefix', () => {
    expect(isVisualOnlyGltfName('VIS_Wall')).toBe(true);
  });
  test('true for exact glass', () => {
    expect(isVisualOnlyGltfName('Glass')).toBe(true);
  });
  test('true when name contains glass', () => {
    expect(isVisualOnlyGltfName('top_glass_cover')).toBe(true);
  });
  test('false for a gameplay mesh', () => {
    expect(isVisualOnlyGltfName('flipper_left')).toBe(false);
  });
});

describe('canonicalGltfName', () => {
  test('normalizes then strips prefix', () => {
    expect(canonicalGltfName(' Coll_Wall ')).toBe('wall');
  });
});

describe('findObjectByNormalizedName', () => {
  test('finds by normalized name', () => {
    const child = node('Switch Slingshot');
    const root = node('root', child);
    expect(findObjectByNormalizedName(root, 'switch_slingshot')).toBe(child);
  });

  test('finds by canonical (prefix-stripped) name', () => {
    const child = node('coll_wall');
    const root = node('root', child);
    // candidate "wall" matches canonical("coll_wall") = "wall"
    expect(findObjectByNormalizedName(root, 'wall')).toBe(child);
  });

  test('returns null when no candidate matches', () => {
    const root = node('root', node('floor'));
    expect(findObjectByNormalizedName(root, 'nope')).toBeNull();
  });

  test('returns the first match found in traversal', () => {
    const a = node('target');
    const b = node('target');
    const root = node('root', a, b);
    expect(findObjectByNormalizedName(root, 'target')).toBe(a);
  });
});

describe('hasNamedAncestor', () => {
  test('true when self matches', () => {
    const o = node('Pinballmap');
    expect(hasNamedAncestor(o, 'Pinballmap')).toBe(true);
  });
  test('true when an ancestor matches', () => {
    const leaf = node('leaf');
    node('Pinballmap', node('mid', leaf));
    expect(hasNamedAncestor(leaf, 'pinballmap')).toBe(true);
  });
  test('false when no ancestor matches', () => {
    const leaf = node('leaf');
    node('root', leaf);
    expect(hasNamedAncestor(leaf, 'pinballmap')).toBe(false);
  });
});

describe('isPinballmapGameplayMesh', () => {
  test('true under a Pinballmap ancestor', () => {
    const m = mesh('flipper');
    node('Pinballmap', m);
    expect(isPinballmapGameplayMesh(m)).toBe(true);
  });
  test('false without Pinballmap ancestor', () => {
    const m = mesh('flipper');
    node('other', m);
    expect(isPinballmapGameplayMesh(m)).toBe(false);
  });
});

describe('isFlipperGltfMesh', () => {
  test('true for legacy single "flipper" node', () => {
    const m = mesh('flipper');
    expect(isFlipperGltfMesh(m)).toBe(true);
  });
  test('true for numbered legacy flipper (flipper.001)', () => {
    const m = mesh('flipper.001');
    expect(isFlipperGltfMesh(m)).toBe(true);
  });
  test('true for separated left/right (dash & underscore)', () => {
    expect(isFlipperGltfMesh(mesh('flipper-left'))).toBe(true);
    expect(isFlipperGltfMesh(mesh('flipper-right'))).toBe(true);
    expect(isFlipperGltfMesh(mesh('flipper_left'))).toBe(true);
    expect(isFlipperGltfMesh(mesh('flipper_right'))).toBe(true);
  });
  test('true when a flipper ancestor wraps the mesh', () => {
    const m = mesh('cap');
    node('flipper-left', m);
    expect(isFlipperGltfMesh(m)).toBe(true);
  });
  test('stops (returns false) at Pinballmap boundary before reaching flipper', () => {
    // hierarchy: flipper > Pinballmap > mesh -> traversal hits pinballmap first
    const m = mesh('cap');
    node('flipper', node('Pinballmap', m));
    expect(isFlipperGltfMesh(m)).toBe(false);
  });
  test('false for unrelated mesh', () => {
    expect(isFlipperGltfMesh(mesh('wall'))).toBe(false);
  });
});

describe('isPinballmapGameplayMeshName (pure)', () => {
  test('true when ancestry contains a Pinballmap node', () => {
    expect(isPinballmapGameplayMeshName(['flipper', 'mid', 'Pinballmap'])).toBe(true);
  });
  test('matches case-insensitively / normalized', () => {
    expect(isPinballmapGameplayMeshName(['x', 'PINBALLMAP'])).toBe(true);
  });
  test('false without a Pinballmap node', () => {
    expect(isPinballmapGameplayMeshName(['flipper', 'root'])).toBe(false);
  });
  test('false for empty ancestry', () => {
    expect(isPinballmapGameplayMeshName([])).toBe(false);
  });
});

describe('isFlipperGltfMeshName (pure)', () => {
  test('true for legacy single "flipper" self', () => {
    expect(isFlipperGltfMeshName(['flipper'])).toBe(true);
  });
  test('true for numbered legacy flipper (flipper.001)', () => {
    expect(isFlipperGltfMeshName(['flipper.001'])).toBe(true);
  });
  test('true for separated left/right (dash & underscore)', () => {
    expect(isFlipperGltfMeshName(['flipper-left'])).toBe(true);
    expect(isFlipperGltfMeshName(['flipper-right'])).toBe(true);
    expect(isFlipperGltfMeshName(['flipper_left'])).toBe(true);
    expect(isFlipperGltfMeshName(['flipper_right'])).toBe(true);
  });
  test('true via a flipper ancestor', () => {
    expect(isFlipperGltfMeshName(['cap', 'flipper-left'])).toBe(true);
  });
  test('stops at pinballmap boundary before reaching flipper', () => {
    // ancestry order self → parents: cap, pinballmap, flipper
    expect(isFlipperGltfMeshName(['cap', 'Pinballmap', 'flipper'])).toBe(false);
  });
  test('false for unrelated names', () => {
    expect(isFlipperGltfMeshName(['wall', 'root'])).toBe(false);
  });
  test('false for empty ancestry', () => {
    expect(isFlipperGltfMeshName([])).toBe(false);
  });
});

describe('isVisualOnlyGltfAncestry (pure)', () => {
  test('true when self is vis_', () => {
    expect(isVisualOnlyGltfAncestry(['VIS_Wall', 'root'])).toBe(true);
  });
  test('true when an ancestor is glass', () => {
    expect(isVisualOnlyGltfAncestry(['decal', 'top_glass_cover'])).toBe(true);
  });
  test('false when nothing is visual-only', () => {
    expect(isVisualOnlyGltfAncestry(['flipper', 'root'])).toBe(false);
  });
  test('false for empty ancestry', () => {
    expect(isVisualOnlyGltfAncestry([])).toBe(false);
  });
});

describe('isPinballmapRailMesh', () => {
  test('true for self named circle.NNN', () => {
    expect(isPinballmapRailMesh(mesh('Circle.001'))).toBe(true);
  });
  test('true for self named plane.NNN', () => {
    expect(isPinballmapRailMesh(mesh('plane.042'))).toBe(true);
  });
  test('true via a rail ancestor', () => {
    const m = mesh('detail');
    node('circle.003', m);
    expect(isPinballmapRailMesh(m)).toBe(true);
  });
  test('false (stops at pinballmap) when rail ancestor is above Pinballmap', () => {
    const m = mesh('detail');
    node('plane.001', node('Pinballmap', m));
    expect(isPinballmapRailMesh(m)).toBe(false);
  });
  test('false for plain circle without number', () => {
    expect(isPinballmapRailMesh(mesh('circle'))).toBe(false);
  });
});

describe('hasPinballmapRoot', () => {
  test('true when a Pinballmap node exists', () => {
    const root = node('scene', node('Pinballmap'));
    expect(hasPinballmapRoot(root)).toBe(true);
  });
  test('false otherwise', () => {
    expect(hasPinballmapRoot(node('scene', node('floor')))).toBe(false);
  });
});

describe('isPinballmapNonPhysicalFloorMesh', () => {
  test('matches mesh_0 variants', () => {
    expect(isPinballmapNonPhysicalFloorMesh(mesh('Mesh_0'))).toBe(true);
    expect(isPinballmapNonPhysicalFloorMesh(mesh('mesh.0'))).toBe(true);
    expect(isPinballmapNonPhysicalFloorMesh(mesh('mesh0'))).toBe(true);
  });
  test('does NOT match mesh_1 (walls must keep collision)', () => {
    expect(isPinballmapNonPhysicalFloorMesh(mesh('Mesh_1'))).toBe(false);
  });
  test('set contains the documented variants', () => {
    expect(PINBALLMAP_NONPHYSICAL_FLOOR_MESHES.has('mesh_0')).toBe(true);
  });
});

describe('SWITCH_SENSOR_NODES', () => {
  test('contains underscore and space variants', () => {
    expect(SWITCH_SENSOR_NODES.has('switch_slingshot')).toBe(true);
    expect(SWITCH_SENSOR_NODES.has('switch slingshot')).toBe(true);
    expect(SWITCH_SENSOR_NODES.has('switch_plunger')).toBe(true);
  });
});

describe('hidePinballmapDecorNodes', () => {
  test('hides plate and switch sensors, leaves gameplay visible', () => {
    const plate = mesh('plate');
    const sw = mesh('Switch Slingshot');
    const keep = mesh('flipper');
    const root = node('root', plate, sw, keep);
    hidePinballmapDecorNodes(root);
    expect(plate.visible).toBe(false);
    expect(sw.visible).toBe(false);
    expect(keep.visible).toBe(true);
  });

  test('ignores non-mesh objects', () => {
    const grp = node('plate'); // Object3D, not Mesh
    const root = node('root', grp);
    hidePinballmapDecorNodes(root);
    expect(grp.visible).toBe(true);
  });
});

describe('removePinballmapUnusedMeshes', () => {
  test('removes ball / metal ball meshes from the tree', () => {
    const ball = mesh('ball');
    const metal = mesh('ball_metal');
    const root = node('root', ball, metal, mesh('flipper'));
    removePinballmapUnusedMeshes(root);
    expect(ball.parent).toBeNull();
    expect(metal.parent).toBeNull();
    expect(root.children.length).toBe(1);
  });

  test('removes numbered spheres only under a Pinballmap ancestor', () => {
    const insideSphere = mesh('sphere.005');
    const pinballmap = node('Pinballmap', insideSphere);
    const outsideSphere = mesh('sphere.006');
    const root = node('root', pinballmap, outsideSphere);
    removePinballmapUnusedMeshes(root);
    expect(insideSphere.parent).toBeNull();
    expect(outsideSphere.parent).toBe(root);
  });

  test('keeps a normal gameplay mesh', () => {
    const keep = mesh('flipper');
    const root = node('root', keep);
    removePinballmapUnusedMeshes(root);
    expect(keep.parent).toBe(root);
  });
});

describe('playfieldUsesCollOnlyCollision', () => {
  test('true when a coll_ mesh exists', () => {
    const root = node('root', mesh('coll_wall'));
    expect(playfieldUsesCollOnlyCollision(root)).toBe(true);
  });
  test('false when no coll_ mesh', () => {
    const root = node('root', mesh('wall'));
    expect(playfieldUsesCollOnlyCollision(root)).toBe(false);
  });
  test('false when coll_ is only on a non-mesh node', () => {
    const root = node('root', node('coll_group'));
    expect(playfieldUsesCollOnlyCollision(root)).toBe(false);
  });
});

describe('isJunkGltfMeshName', () => {
  test('true for circle*, cube, sphere, cylinder primitives', () => {
    expect(isJunkGltfMeshName('Circle.001')).toBe(true);
    expect(isJunkGltfMeshName('cube')).toBe(true);
    expect(isJunkGltfMeshName('cube.003')).toBe(true);
    expect(isJunkGltfMeshName('sphere')).toBe(true);
    expect(isJunkGltfMeshName('cylinder.012')).toBe(true);
  });
  test('true for table.NNN', () => {
    expect(isJunkGltfMeshName('table.001')).toBe(true);
  });
  test('true for _normal / _color material leftovers', () => {
    expect(isJunkGltfMeshName('foo_normal')).toBe(true);
    expect(isJunkGltfMeshName('bar_color')).toBe(true);
  });
  test('true for material-name prefixes', () => {
    expect(isJunkGltfMeshName('board_wood_01')).toBe(true);
    expect(isJunkGltfMeshName('aluminum_part')).toBe(true);
    expect(isJunkGltfMeshName('white_acrylic')).toBe(true);
  });
  test('false for plain gameplay names', () => {
    expect(isJunkGltfMeshName('flipper')).toBe(false);
    expect(isJunkGltfMeshName('playfield')).toBe(false);
  });
  test('false for bare "table" (only numbered table is junk)', () => {
    expect(isJunkGltfMeshName('table')).toBe(false);
  });
});
