import { test, expect } from 'bun:test';
import * as THREE from 'three';
import { collectFlashMats, applyFlash, FLASH_DURATION, FLASH_INTENSITY, type FlashMat } from './FlipperFlash';

const FLASH_COLOR = new THREE.Color(0xfff0e0);

function makeStandardMesh(emissive: number, intensity: number): THREE.Mesh {
  const mat = new THREE.MeshStandardMaterial();
  mat.emissive = new THREE.Color(emissive);
  mat.emissiveIntensity = intensity;
  return new THREE.Mesh(new THREE.BufferGeometry(), mat);
}

test('constants match the extracted values', () => {
  expect(FLASH_DURATION).toBe(0.08);
  expect(FLASH_INTENSITY).toBe(1.2);
});

test('collectFlashMats gathers only MeshStandardMaterial and snapshots base emissive/intensity', () => {
  const root = new THREE.Group();
  const std = makeStandardMesh(0x123456, 0.4);
  const basicMat = new THREE.MeshBasicMaterial();
  const basic = new THREE.Mesh(new THREE.BufferGeometry(), basicMat);
  root.add(std, basic);

  const mats = collectFlashMats(root);
  expect(mats.length).toBe(1);
  expect(mats[0]!.mat).toBe(std.material as THREE.MeshStandardMaterial);
  expect(mats[0]!.emissive.getHex()).toBe(0x123456);
  expect(mats[0]!.intensity).toBe(0.4);
});

test('collectFlashMats flattens material arrays', () => {
  const mat1 = new THREE.MeshStandardMaterial();
  const mat2 = new THREE.MeshStandardMaterial();
  const mesh = new THREE.Mesh(new THREE.BufferGeometry());
  mesh.material = [mat1, mat2];

  const mats = collectFlashMats(mesh);
  expect(mats.length).toBe(2);
});

test('applyFlash at full intensity (t = FLASH_DURATION) lerps fully to warm white and adds full intensity', () => {
  const std = makeStandardMesh(0x000000, 0.5);
  const mat = std.material as THREE.MeshStandardMaterial;
  const mats: FlashMat[] = [{ mat, emissive: mat.emissive.clone(), intensity: mat.emissiveIntensity }];

  applyFlash(mats, FLASH_DURATION); // f === 1
  expect(mat.emissive.getHex()).toBe(FLASH_COLOR.getHex());
  expect(mat.emissiveIntensity).toBeCloseTo(0.5 + FLASH_INTENSITY, 6);
});

test('applyFlash at t = 0 restores the base emissive and intensity', () => {
  const std = makeStandardMesh(0x223344, 0.7);
  const mat = std.material as THREE.MeshStandardMaterial;
  const base = mat.emissive.clone();
  const mats: FlashMat[] = [{ mat, emissive: base.clone(), intensity: mat.emissiveIntensity }];

  applyFlash(mats, FLASH_DURATION); // perturb
  applyFlash(mats, 0); // decay to rest
  expect(mat.emissive.getHex()).toBe(base.getHex());
  expect(mat.emissiveIntensity).toBe(0.7);
});

test('applyFlash at half progress lerps halfway and adds half intensity', () => {
  const base = new THREE.Color(0x000000);
  const std = makeStandardMesh(0x000000, 0.2);
  const mat = std.material as THREE.MeshStandardMaterial;
  const mats: FlashMat[] = [{ mat, emissive: base.clone(), intensity: mat.emissiveIntensity }];

  applyFlash(mats, FLASH_DURATION / 2); // f === 0.5
  const expected = base.clone().lerp(FLASH_COLOR, 0.5);
  expect(mat.emissive.getHex()).toBe(expected.getHex());
  expect(mat.emissiveIntensity).toBeCloseTo(0.2 + FLASH_INTENSITY * 0.5, 6);
});
