import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import { clonePlayfieldSurfaceMaterial } from './GltfDisplay';
import { PLAYFIELD_SURFACE_MATERIAL_FALLBACK } from '../domain/PlayfieldVisualConstants';

describe('clonePlayfieldSurfaceMaterial', () => {
  test('clones floor_main material when present', () => {
    const root = new THREE.Group();
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshStandardMaterial({ color: 0x224466 }),
    );
    mesh.name = 'floor_main';
    root.add(mesh);

    const mat = clonePlayfieldSurfaceMaterial(root);
    expect(mat.color.getHex()).toBe(0x224466);
  });

  test('falls back to wood tone when no playfield mesh exists', () => {
    const mat = clonePlayfieldSurfaceMaterial(new THREE.Group());
    expect(mat.color.getHex()).toBe(PLAYFIELD_SURFACE_MATERIAL_FALLBACK.color);
  });
});
