import { test, expect } from 'bun:test';
import * as THREE from 'three';
import { resolvePlayfieldFlippers } from './FlipperSplitter';

function namedMesh(name: string): THREE.Mesh {
  const mesh = new THREE.Mesh();
  mesh.name = name;
  return mesh;
}

function rootWith(...children: THREE.Object3D[]): THREE.Object3D {
  const root = new THREE.Group();
  for (const child of children) root.add(child);
  return root;
}

test('resolves the new named format (flipper-left / flipper-right)', () => {
  const left = namedMesh('flipper-left');
  const right = namedMesh('flipper-right');
  const pair = resolvePlayfieldFlippers(rootWith(left, right));

  expect(pair).not.toBeNull();
  expect(pair!.left).toBe(left);
  expect(pair!.right).toBe(right);
});

test('resolves the underscore variant (flipper_left / flipper_right)', () => {
  const left = namedMesh('flipper_left');
  const right = namedMesh('flipper_right');
  const pair = resolvePlayfieldFlippers(rootWith(left, right));

  expect(pair).not.toBeNull();
  expect(pair!.left).toBe(left);
  expect(pair!.right).toBe(right);
});

test('maps by name, not by geometric position', () => {
  // flipper-left placed on the +X side: name must still win over position.
  const left = namedMesh('flipper-left');
  left.position.x = 0.3;
  const right = namedMesh('flipper-right');
  right.position.x = -0.3;
  const pair = resolvePlayfieldFlippers(rootWith(left, right));

  expect(pair!.left.name).toBe('flipper-left');
  expect(pair!.right.name).toBe('flipper-right');
});

test('returns null when only one named flipper is present', () => {
  const pair = resolvePlayfieldFlippers(rootWith(namedMesh('flipper-left')));
  expect(pair).toBeNull();
});

test('returns null when no flipper node exists', () => {
  const pair = resolvePlayfieldFlippers(rootWith(namedMesh('bumper'), namedMesh('ramp')));
  expect(pair).toBeNull();
});
