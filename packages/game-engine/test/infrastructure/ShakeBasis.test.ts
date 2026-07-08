import { test, expect, describe } from 'bun:test';
import * as THREE from 'three';
import { ShakeBasis } from '../../src/infrastructure/ShakeBasis';

describe('ShakeBasis.capture', () => {
  test('copies camera position and root position/rotation', () => {
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(1, 2, 3);
    const root = new THREE.Object3D();
    root.position.set(4, 5, 6);
    root.rotation.set(0.1, 0.2, 0.3);

    const basis = new ShakeBasis();
    basis.capture(camera, root);

    expect(basis.camPos.toArray()).toEqual([1, 2, 3]);
    expect(basis.rootPos.toArray()).toEqual([4, 5, 6]);
    expect([basis.rootRot.x, basis.rootRot.y, basis.rootRot.z]).toEqual([0.1, 0.2, 0.3]);
  });

  test('snapshot is a copy — later mutation does not change basis', () => {
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(1, 1, 1);
    const root = new THREE.Object3D();
    root.position.set(2, 2, 2);
    root.rotation.set(0.5, 0.5, 0.5);

    const basis = new ShakeBasis();
    basis.capture(camera, root);

    camera.position.set(9, 9, 9);
    root.position.set(8, 8, 8);
    root.rotation.set(1, 1, 1);

    expect(basis.camPos.toArray()).toEqual([1, 1, 1]);
    expect(basis.rootPos.toArray()).toEqual([2, 2, 2]);
    expect([basis.rootRot.x, basis.rootRot.y, basis.rootRot.z]).toEqual([0.5, 0.5, 0.5]);
  });
});

describe('ShakeBasis.restore', () => {
  test('writes captured transforms back onto camera and root', () => {
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(1, 2, 3);
    const root = new THREE.Object3D();
    root.position.set(4, 5, 6);
    root.rotation.set(0.1, 0.2, 0.3);

    const basis = new ShakeBasis();
    basis.capture(camera, root);

    camera.position.set(0, 0, 0);
    root.position.set(0, 0, 0);
    root.rotation.set(0, 0, 0);

    basis.restore(camera, root);

    expect(camera.position.toArray()).toEqual([1, 2, 3]);
    expect(root.position.toArray()).toEqual([4, 5, 6]);
    expect([root.rotation.x, root.rotation.y, root.rotation.z]).toEqual([0.1, 0.2, 0.3]);
  });
});

describe('ShakeBasis null-safety', () => {
  test('capture tolerates null camera and root', () => {
    const basis = new ShakeBasis();
    expect(() => basis.capture(null, null)).not.toThrow();
    expect(basis.camPos.toArray()).toEqual([0, 0, 0]);
    expect(basis.rootPos.toArray()).toEqual([0, 0, 0]);
  });

  test('restore tolerates null camera and root', () => {
    const basis = new ShakeBasis();
    expect(() => basis.restore(null, null)).not.toThrow();
  });

  test('capture with only camera leaves root snapshot untouched', () => {
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(7, 8, 9);

    const basis = new ShakeBasis();
    basis.capture(camera, null);

    expect(basis.camPos.toArray()).toEqual([7, 8, 9]);
    expect(basis.rootPos.toArray()).toEqual([0, 0, 0]);
  });
});
