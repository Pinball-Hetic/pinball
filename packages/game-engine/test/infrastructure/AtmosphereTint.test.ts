import { test, expect, describe } from 'bun:test';
import * as THREE from 'three';
import {
  applyColorTint,
  applyLightTint,
  applyMaterialTint,
  type LightTintDescriptor,
  type MaterialTintDescriptor,
} from '../../src/infrastructure/AtmosphereTint';

function fakeMaterial(color: number, emissive: number, emissiveIntensity: number) {
  return {
    color: new THREE.Color(color),
    emissive: new THREE.Color(emissive),
    emissiveIntensity,
  } as unknown as THREE.MeshStandardMaterial;
}

describe('applyMaterialTint', () => {
  const desc: MaterialTintDescriptor = {
    tint: 0x200040,
    tintK: 0.35,
    darken: 0.18,
    emissive: 0x1a0033,
    emissiveK: 0.3,
    emissiveMul: 1.12,
    emissiveAdd: 0.05,
  };

  test('ease=0 leaves color/emissive at snapshot values', () => {
    const material = fakeMaterial(0x808080, 0x101010, 0.4);
    const snapshot = {
      material,
      color: material.color.clone(),
      emissive: material.emissive.clone(),
      emissiveIntensity: material.emissiveIntensity,
    };
    applyMaterialTint(snapshot, 0, desc);
    expect(material.color.getHex()).toBe(0x808080);
    expect(material.emissive.getHex()).toBe(0x101010);
    expect(material.emissiveIntensity).toBeCloseTo(0.4, 10);
  });

  test('matches the verbatim lerp math at ease=1', () => {
    const material = fakeMaterial(0x808080, 0x101010, 0.4);
    const snapColor = material.color.clone();
    const snapEmissive = material.emissive.clone();
    const snapIntensity = material.emissiveIntensity;
    const snapshot = {
      material,
      color: snapColor.clone(),
      emissive: snapEmissive.clone(),
      emissiveIntensity: snapIntensity,
    };

    const ease = 1;
    applyMaterialTint(snapshot, ease, desc);

    // Reproduce the original loop independently.
    const expColor = snapColor.clone();
    expColor.lerp(new THREE.Color(desc.tint), ease * desc.tintK);
    expColor.multiplyScalar(1 - ease * desc.darken);
    const expEmissive = snapEmissive.clone();
    expEmissive.lerp(new THREE.Color(desc.emissive), ease * desc.emissiveK);
    const expIntensity = THREE.MathUtils.lerp(
      snapIntensity,
      snapIntensity * desc.emissiveMul + desc.emissiveAdd,
      ease,
    );

    expect(material.color.r).toBeCloseTo(expColor.r, 10);
    expect(material.color.g).toBeCloseTo(expColor.g, 10);
    expect(material.color.b).toBeCloseTo(expColor.b, 10);
    expect(material.emissive.getHex()).toBe(expEmissive.getHex());
    expect(material.emissiveIntensity).toBeCloseTo(expIntensity, 10);
  });

  test('re-applying from the same snapshot is idempotent (no drift)', () => {
    const material = fakeMaterial(0x445566, 0x223344, 1);
    const snapshot = {
      material,
      color: material.color.clone(),
      emissive: material.emissive.clone(),
      emissiveIntensity: material.emissiveIntensity,
    };
    applyMaterialTint(snapshot, 0.5, desc);
    const r1 = material.color.r;
    applyMaterialTint(snapshot, 0.5, desc);
    expect(material.color.r).toBeCloseTo(r1, 12);
  });
});

describe('applyLightTint', () => {
  const desc: LightTintDescriptor = { color: 0xcc88ff, colorK: 0.5, intensity: 0.62 };

  test('ease=0 keeps the snapshot color and intensity', () => {
    const light = { color: new THREE.Color(0xffffff), intensity: 1 };
    applyLightTint(light, { color: light.color.clone(), intensity: 1 }, 0, desc);
    expect(light.color.getHex()).toBe(0xffffff);
    expect(light.intensity).toBeCloseTo(1, 10);
  });

  test('matches verbatim color.lerp + intensity lerp at arbitrary ease', () => {
    const orig = new THREE.Color(0xffffff);
    const light = { color: orig.clone(), intensity: 1 };
    const ease = 0.7;
    applyLightTint(light, { color: orig.clone(), intensity: 1 }, ease, desc);

    const expColor = orig.clone();
    expColor.lerp(new THREE.Color(desc.color), ease * desc.colorK);
    const expIntensity = THREE.MathUtils.lerp(1, desc.intensity, ease);

    expect(light.color.r).toBeCloseTo(expColor.r, 10);
    expect(light.color.g).toBeCloseTo(expColor.g, 10);
    expect(light.color.b).toBeCloseTo(expColor.b, 10);
    expect(light.intensity).toBeCloseTo(expIntensity, 10);
  });
});

describe('applyColorTint', () => {
  test('ease=0 copies orig verbatim', () => {
    const out = new THREE.Color(0x000000);
    const orig = new THREE.Color(0x123456);
    applyColorTint(out, orig, 0xffffff, 0, 0.7);
    expect(out.getHex()).toBe(0x123456);
  });

  test('lerps orig toward target by ease*k', () => {
    const out = new THREE.Color();
    const orig = new THREE.Color(0x000000);
    applyColorTint(out, orig, 0xffffff, 1, 0.5);
    const exp = new THREE.Color(0x000000).lerp(new THREE.Color(0xffffff), 0.5);
    expect(out.r).toBeCloseTo(exp.r, 10);
    expect(out.g).toBeCloseTo(exp.g, 10);
    expect(out.b).toBeCloseTo(exp.b, 10);
  });
});
