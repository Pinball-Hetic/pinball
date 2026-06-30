import { describe, expect, test } from 'bun:test';
import {
  ancestryMatchesSet,
  laplacianSmoothPositions,
  mergeGeometryTuples,
  resolveMaterialParams,
  reverseWoundIndices,
} from './PlayfieldTrimeshRules';

describe('ancestryMatchesSet', () => {
  const set = new Set(['slingshot', 'plastic_left']);

  test('match sur le self (forme normalisée)', () => {
    expect(ancestryMatchesSet(['Slingshot'], set)).toBe(true);
  });

  test('match sur un ancêtre', () => {
    expect(ancestryMatchesSet(['Mesh_3', 'group', 'plastic_left'], set)).toBe(true);
  });

  test('match sur la forme canonique (préfixe coll_/vis_ retiré)', () => {
    expect(ancestryMatchesSet(['coll_slingshot'], set)).toBe(true);
    expect(ancestryMatchesSet(['vis_plastic_left'], set)).toBe(true);
  });

  test('espaces normalisés en underscore', () => {
    expect(ancestryMatchesSet(['Plastic Left'], set)).toBe(true);
  });

  test('aucun match → false', () => {
    expect(ancestryMatchesSet(['Mesh_0', 'root'], set)).toBe(false);
  });

  test('ancestry vide → false', () => {
    expect(ancestryMatchesSet([], set)).toBe(false);
  });
});

describe('resolveMaterialParams', () => {
  test('défauts quand element absent', () => {
    expect(resolveMaterialParams(undefined, 'wall')).toEqual({
      restitution: 0.35,
      friction: 0.15,
      smooth: false,
      doubleSided: true,
    });
  });

  test('floor → smooth par défaut, wall/lane → brut', () => {
    expect(resolveMaterialParams(undefined, 'floor').smooth).toBe(true);
    expect(resolveMaterialParams(undefined, 'wall').smooth).toBe(false);
    expect(resolveMaterialParams(undefined, 'lane').smooth).toBe(false);
  });

  test('restitution/friction numériques surchargent les défauts', () => {
    const p = resolveMaterialParams({ restitution: 0.9, friction: 0.02 }, 'wall');
    expect(p.restitution).toBe(0.9);
    expect(p.friction).toBe(0.02);
  });

  test('valeurs non numériques retombent sur les défauts', () => {
    const p = resolveMaterialParams({ restitution: 'high', friction: 'low' }, 'wall');
    expect(p.restitution).toBe(0.35);
    expect(p.friction).toBe(0.15);
  });

  test('singleSided=1 → doubleSided false', () => {
    expect(resolveMaterialParams({ singleSided: 1 }, 'wall').doubleSided).toBe(false);
  });

  test('doubleSided explicite prime sur singleSided', () => {
    expect(resolveMaterialParams({ singleSided: 1, doubleSided: 1 }, 'wall').doubleSided).toBe(true);
    expect(resolveMaterialParams({ doubleSided: 0 }, 'wall').doubleSided).toBe(false);
  });

  test('smooth explicite prime sur le défaut de rôle', () => {
    expect(resolveMaterialParams({ smooth: 0 }, 'floor').smooth).toBe(false);
    expect(resolveMaterialParams({ smooth: 1 }, 'wall').smooth).toBe(true);
  });
});

describe('laplacianSmoothPositions', () => {
  // Fan : centre v0=(0,0,0), v1=(1,0,0), v2=(0,1,0), v3=(-1,0,0).
  // Triangles [0,1,2] et [0,2,3].
  const fanPositions = () =>
    new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, -1, 0, 0]);
  const fanIndex = [0, 1, 2, 0, 2, 3];

  test('barycentre des voisins, factor 0.5, une passe', () => {
    const out = laplacianSmoothPositions(fanPositions(), fanIndex, 1, 0.5);
    expect(Array.from(out)).toEqual([
      0, 0.25, 0,    // v0 vers (0,0.5,0)
      0.5, 0.25, 0,  // v1 vers (0,0.5,0)
      0, 0.5, 0,     // v2 vers (0,0,0)
      -0.5, 0.25, 0, // v3 vers (0,0.5,0)
    ]);
  });

  test('factor 0 → positions inchangées', () => {
    const out = laplacianSmoothPositions(fanPositions(), fanIndex, 4, 0);
    expect(Array.from(out)).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0, -1, 0, 0]);
  });

  test('zéro itération → identité', () => {
    const out = laplacianSmoothPositions(fanPositions(), fanIndex, 0, 0.25);
    expect(Array.from(out)).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0, -1, 0, 0]);
  });

  test('n_e mute pas le tableau d_entrée', () => {
    const input = fanPositions();
    laplacianSmoothPositions(input, fanIndex, 1, 0.5);
    expect(Array.from(input)).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0, -1, 0, 0]);
  });

  test('sommet isolé (count 0) laissé inchangé', () => {
    // v3 n_apparaît dans aucun triangle → counts[3] = 0.
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 5, 5, 5]);
    const out = laplacianSmoothPositions(positions, [0, 1, 2], 1, 0.5);
    expect(Array.from(out).slice(9)).toEqual([5, 5, 5]);
  });
});

describe('reverseWoundIndices', () => {
  test('concatène index + faces arrière (enroulement inversé)', () => {
    expect(reverseWoundIndices([0, 1, 2])).toEqual([0, 1, 2, 2, 1, 0]);
  });

  test('plusieurs triangles → chaque face inversée séparément', () => {
    expect(reverseWoundIndices([0, 1, 2, 3, 4, 5])).toEqual([
      0, 1, 2, 3, 4, 5, // faces avant
      2, 1, 0, 5, 4, 3, // faces arrière
    ]);
  });

  test('accepte un Uint32Array', () => {
    expect(reverseWoundIndices(new Uint32Array([0, 1, 2]))).toEqual([0, 1, 2, 2, 1, 0]);
  });

  test('n_e mute pas l_entrée', () => {
    const input = new Uint32Array([0, 1, 2]);
    reverseWoundIndices(input);
    expect(Array.from(input)).toEqual([0, 1, 2]);
  });
});

describe('mergeGeometryTuples', () => {
  test('géométrie unique indexée → identité', () => {
    const out = mergeGeometryTuples([
      { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], index: [0, 1, 2] },
    ]);
    expect(out.verts).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    expect(out.indices).toEqual([0, 1, 2]);
  });

  test('sans index → indexation séquentielle des sommets', () => {
    const out = mergeGeometryTuples([
      { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], index: null },
    ]);
    expect(out.indices).toEqual([0, 1, 2]);
  });

  test('deux géométries → index décalés du nombre de sommets', () => {
    const out = mergeGeometryTuples([
      { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], index: [0, 1, 2] },
      { positions: [2, 0, 0, 3, 0, 0, 2, 1, 0], index: [0, 1, 2] },
    ]);
    expect(out.verts).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0, 2, 0, 0, 3, 0, 0, 2, 1, 0]);
    expect(out.indices).toEqual([0, 1, 2, 3, 4, 5]);
  });

  test('mix indexé + non indexé → offsets corrects', () => {
    const out = mergeGeometryTuples([
      { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], index: null },
      { positions: [2, 0, 0, 3, 0, 0, 2, 1, 0], index: [2, 1, 0] },
    ]);
    expect(out.indices).toEqual([0, 1, 2, 5, 4, 3]);
  });

  test('accepte des typed arrays (Float32Array/Uint32Array)', () => {
    const out = mergeGeometryTuples([
      { positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), index: new Uint32Array([0, 1, 2]) },
    ]);
    expect(out.verts).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    expect(out.indices).toEqual([0, 1, 2]);
  });

  test('liste vide → vide', () => {
    expect(mergeGeometryTuples([])).toEqual({ verts: [], indices: [] });
  });
});
