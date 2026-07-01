import { expect, test } from 'bun:test';
import * as THREE from 'three';
import type { MapRenderingConfig } from '@pinball/shared-types';
import { prepareGltfMaterialsForDisplay } from './GltfDisplay';

function renderingWith(colorDarken: number): MapRenderingConfig {
  return {
    useEnvironment: false,
    toneMappingExposure: 1,
    colorDarken,
    environmentBlur: 0,
    envIntensityMetallic: 1,
    envIntensitySemi: 1,
    envIntensityBase: 1,
    lights: {
      ambient: { color: 0xffffff, intensity: 1 },
      hemi: { sky: 0xffffff, ground: 0x000000, intensity: 1 },
      dir: { color: 0xffffff, intensity: 1, x: 0, y: 1, z: 0 },
      fill: { color: 0xffffff, intensity: 1, x: 0, y: 1, z: 0 },
    },
  };
}

function playfieldMesh(material: THREE.MeshStandardMaterial, name = 'playfield'): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
  mesh.name = name;
  return mesh;
}

test('darkens a table material exactly once (colorDarken applied a single time)', () => {
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff });
  const root = new THREE.Group();
  root.add(playfieldMesh(material));

  prepareGltfMaterialsForDisplay(root, renderingWith(0.5));

  expect(material.color.r).toBeCloseTo(0.5, 6);
});

test('shared material across meshes is not double-darkened', () => {
  const shared = new THREE.MeshStandardMaterial({ color: 0xffffff });
  const root = new THREE.Group();
  // Deux meshes "playfield" partagent le MÊME matériau.
  root.add(playfieldMesh(shared, 'playfield'));
  root.add(playfieldMesh(shared, 'playfield'));

  prepareGltfMaterialsForDisplay(root, renderingWith(0.5));

  // Sans le garde, ce serait 0.25 (0.5 * 0.5). Avec, une seule passe → 0.5.
  expect(shared.color.r).toBeCloseTo(0.5, 6);
});
