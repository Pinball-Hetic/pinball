import { test, expect, describe } from 'bun:test';
import * as THREE from 'three';
import {
  PlayfieldCinematicStrobe,
  type PlayfieldCinematicStrobeConfig,
  type DecorLights,
} from './PlayfieldCinematicStrobe';
import { playfieldShadeStrobeOpacity } from './PlayfieldShadeOverlay';

type StrobeCall = { active: boolean; on: boolean; normalWhenOn?: boolean };

class SpyDecor implements DecorLights {
  calls: StrobeCall[] = [];
  setStrobe(active: boolean, on: boolean, normalWhenOn?: boolean): void {
    this.calls.push({ active, on, normalWhenOn });
  }
}

function makeConfig(): PlayfieldCinematicStrobeConfig {
  return {
    flashColor: 0xff0000,
    flashIntensity: 2,
    flashPosition: new THREE.Vector3(1, 2, 3),
  };
}

function findFlash(root: THREE.Object3D): THREE.PointLight | undefined {
  return root.children.find((c): c is THREE.PointLight => c instanceof THREE.PointLight);
}

function findShade(root: THREE.Object3D): THREE.Mesh | undefined {
  return root.children.find((c): c is THREE.Mesh => c instanceof THREE.Mesh);
}

function shadeOpacity(root: THREE.Object3D): number {
  const mesh = findShade(root);
  const mat = mesh?.material as THREE.MeshBasicMaterial | undefined;
  return mat?.opacity ?? -1;
}

describe('PlayfieldCinematicStrobe', () => {
  test('mount adds the shade mesh and positions the flash light', () => {
    const root = new THREE.Object3D();
    const strobe = new PlayfieldCinematicStrobe();
    strobe.mount(root, makeConfig());

    const shade = findShade(root);
    expect(shade).toBeDefined();
    // Flash light is NOT in the scene until it flashes.
    expect(findFlash(root)).toBeUndefined();
    strobe.dispose();
  });

  test('apply: flash light only enters scene when on && !fullMap, intensity = flashIntensity * mix', () => {
    const root = new THREE.Object3D();
    const strobe = new PlayfieldCinematicStrobe();
    strobe.mount(root, makeConfig());

    strobe.apply(true, false, 0.5);
    const light = findFlash(root);
    expect(light).toBeDefined();
    expect(light?.intensity).toBeCloseTo(1, 6); // 2 * 0.5

    // fullMap => no flash, light removed from scene.
    strobe.apply(true, true, 0.5);
    expect(findFlash(root)).toBeUndefined();
    strobe.dispose();
  });

  test('apply: shade opacity matches playfieldShadeStrobeOpacity verbatim', () => {
    const root = new THREE.Object3D();
    const strobe = new PlayfieldCinematicStrobe();
    strobe.mount(root, makeConfig());

    for (const [on, fullMap, mix] of [
      [true, false, 0.5],
      [false, false, 0.5],
      [true, true, 0.8],
      [false, false, 0.01],
    ] as Array<[boolean, boolean, number]>) {
      strobe.apply(on, fullMap, mix);
      const expected = THREE.MathUtils.clamp(
        playfieldShadeStrobeOpacity(on, fullMap, mix),
        0,
        1,
      );
      expect(shadeOpacity(root)).toBeCloseTo(expected, 6);
    }
    strobe.dispose();
  });

  test('apply drives decor with (mix>0.02, on, fullMap)', () => {
    const root = new THREE.Object3D();
    const decor = new SpyDecor();
    const strobe = new PlayfieldCinematicStrobe();
    strobe.mount(root, makeConfig(), [decor]);

    strobe.apply(true, true, 0.5);
    expect(decor.calls.at(-1)).toEqual({ active: true, on: true, normalWhenOn: true });

    strobe.apply(false, false, 0.01); // below active threshold
    expect(decor.calls.at(-1)).toEqual({ active: false, on: false, normalWhenOn: false });
    strobe.dispose();
  });

  test('applyFlashOnly: shade forced to 0, flash = on ? intensity*mix : 0', () => {
    const root = new THREE.Object3D();
    const strobe = new PlayfieldCinematicStrobe();
    strobe.mount(root, makeConfig());

    strobe.apply(false, false, 1); // raise shade first
    expect(shadeOpacity(root)).toBeGreaterThan(0);

    strobe.applyFlashOnly(true, 0.25);
    expect(shadeOpacity(root)).toBe(0);
    expect(findFlash(root)?.intensity).toBeCloseTo(0.5, 6); // 2 * 0.25

    strobe.applyFlashOnly(false, 0.25);
    expect(findFlash(root)).toBeUndefined();
    strobe.dispose();
  });

  test('applyFightFlicker: sets shade, flashes, clears decor with (false,false)', () => {
    const root = new THREE.Object3D();
    const decor = new SpyDecor();
    const strobe = new PlayfieldCinematicStrobe();
    strobe.mount(root, makeConfig(), [decor]);

    strobe.applyFightFlicker(0.3, 0.5);
    expect(shadeOpacity(root)).toBeCloseTo(0.3, 6);
    expect(findFlash(root)?.intensity).toBeCloseTo(1, 6); // 2 * 0.5
    expect(decor.calls.at(-1)).toEqual({ active: false, on: false, normalWhenOn: undefined });
    strobe.dispose();
  });

  test('applyHoldShade: sets shade, clears flash and decor', () => {
    const root = new THREE.Object3D();
    const decor = new SpyDecor();
    const strobe = new PlayfieldCinematicStrobe();
    strobe.mount(root, makeConfig(), [decor]);

    strobe.apply(true, false, 1); // flash on
    expect(findFlash(root)).toBeDefined();

    strobe.applyHoldShade(0.4);
    expect(shadeOpacity(root)).toBeCloseTo(0.4, 6);
    expect(findFlash(root)).toBeUndefined();
    expect(decor.calls.at(-1)).toEqual({ active: false, on: false, normalWhenOn: undefined });
    strobe.dispose();
  });

  test('stop: hides shade, clears flash and decor', () => {
    const root = new THREE.Object3D();
    const decor = new SpyDecor();
    const strobe = new PlayfieldCinematicStrobe();
    strobe.mount(root, makeConfig(), [decor]);

    strobe.apply(true, false, 1);
    strobe.stop();
    expect(shadeOpacity(root)).toBe(0);
    expect(findFlash(root)).toBeUndefined();
    expect(decor.calls.at(-1)).toEqual({ active: false, on: false, normalWhenOn: undefined });
    strobe.dispose();
  });

  test('no decor port: apply/stop never throw and manage flash alone', () => {
    const root = new THREE.Object3D();
    const strobe = new PlayfieldCinematicStrobe();
    strobe.mount(root, makeConfig());

    strobe.apply(true, false, 1);
    expect(findFlash(root)?.intensity).toBeCloseTo(2, 6);
    strobe.stop();
    expect(findFlash(root)).toBeUndefined();
    strobe.dispose();
  });

  test('dispose removes shade mesh and detaches flash light', () => {
    const root = new THREE.Object3D();
    const strobe = new PlayfieldCinematicStrobe();
    strobe.mount(root, makeConfig());
    strobe.apply(true, false, 1);
    expect(root.children.length).toBeGreaterThan(0);

    strobe.dispose();
    expect(findShade(root)).toBeUndefined();
    expect(findFlash(root)).toBeUndefined();
  });
});
