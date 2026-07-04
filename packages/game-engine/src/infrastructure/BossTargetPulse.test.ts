import { test, expect, beforeEach } from 'bun:test';
import * as THREE from 'three';
import { BossTargetPulse, type BossTargetPulseParts } from './BossTargetPulse';
import type { BossTargetPulseConfig } from '../domain/BossRegistry';

// Config with "round" numbers to keep the math assertions readable.
const CONFIG: BossTargetPulseConfig = {
  hitFlashDuration: 0.5,
  pulseSpeed: 10 * Math.PI, // dt=0.05 → sin(0.05*10π)=sin(π/2)=1
  pulseAmp: 0.1,
  hitBoost: 2,
  ringEmissiveBase: 10,
  coreEmissiveBase: 4,
  lightIntensityBase: 6,
  wobbleSpeed: 10 * Math.PI, // same for the wobble at dt=0.05
  wobbleAmp: 0.2,
  hitScaleBoost: 0.5,
};

const DT_PEAK = 0.05; // sin(DT_PEAK * 10π) === 1

function makeParts(): BossTargetPulseParts {
  return {
    targetGroup: new THREE.Group(),
    ringMat: new THREE.MeshStandardMaterial(),
    coreMat: new THREE.MeshStandardMaterial(),
    light: new THREE.PointLight(),
  };
}

let parts: BossTargetPulseParts;
let pulse: BossTargetPulse;
beforeEach(() => {
  parts = makeParts();
  pulse = new BossTargetPulse(CONFIG, parts);
});

test('update masqué (visible=false) ne modifie pas les matériaux ni la transform', () => {
  pulse.update(0.016, false, false);
  expect(parts.ringMat!.emissiveIntensity).toBe(1); // MeshStandardMaterial default
  expect(parts.targetGroup.scale.x).toBe(1);
  expect(parts.targetGroup.rotation.z).toBe(0);
});

test('update en pause ne touche pas la pulsation', () => {
  pulse.update(0.016, true, true);
  expect(parts.targetGroup.rotation.z).toBe(0);
  expect(parts.light!.intensity).toBe(1); // PointLight default intensity = 1
});

test('update visible applique base * pulse aux émissions et à la lumière', () => {
  // pulseT starts at 0; after DT_PEAK, sin(pulseT*pulseSpeed) = 1.
  pulse.update(DT_PEAK, true, false);
  const expectedPulse = 0.82 + 1 * CONFIG.pulseAmp; // hitBoost=1 (no flash)
  expect(parts.ringMat!.emissiveIntensity).toBeCloseTo(CONFIG.ringEmissiveBase * expectedPulse, 8);
  expect(parts.coreMat!.emissiveIntensity).toBeCloseTo(CONFIG.coreEmissiveBase * expectedPulse, 8);
  expect(parts.light!.intensity).toBeCloseTo(CONFIG.lightIntensityBase * expectedPulse, 8);
});

test('wobble pilote rotation.z = sin(pulseT*wobbleSpeed)*wobbleAmp', () => {
  pulse.update(DT_PEAK, true, false); // sin(DT_PEAK*wobbleSpeed) = 1
  expect(parts.targetGroup.rotation.z).toBeCloseTo(1 * CONFIG.wobbleAmp, 8);
});

test('sans flash, le scale reste à 1', () => {
  pulse.update(0.016, true, false);
  expect(parts.targetGroup.scale.x).toBeCloseTo(1, 8);
});

test('flashHit + update applique hitBoost à la pulsation', () => {
  pulse.flashHit(); // flash = 0.5, survives DT_PEAK (0.05)
  pulse.update(DT_PEAK, true, false); // sin → 1
  const expectedPulse = (0.82 + 1 * CONFIG.pulseAmp) * CONFIG.hitBoost;
  expect(parts.ringMat!.emissiveIntensity).toBeCloseTo(CONFIG.ringEmissiveBase * expectedPulse, 8);
});

test('flashHit gonfle le scale proportionnellement au reste du flash', () => {
  pulse.flashHit(); // targetHitFlash = 0.5
  const dt = 0.1; // after decrement: 0.4; ratio = 0.4/0.5 = 0.8
  pulse.update(dt, true, false);
  const expectedScale = 1 + 0.8 * CONFIG.hitScaleBoost; // 1 + 0.8*0.5 = 1.4
  expect(parts.targetGroup.scale.x).toBeCloseTo(expectedScale, 8);
});

test('le flash décroît avec dt même quand masqué et finit par expirer', () => {
  pulse.flashHit(); // 0.5
  // hidden update: the flash still decrements (branch before the early return)
  pulse.update(0.3, false, false); // 0.5 - 0.3 = 0.2
  // now visible: ratio 0.2/0.5 = 0.4 → scale 1 + 0.4*0.5 = 1.2 (without advancing dt further we keep 0.2 then -0)
  pulse.update(0, true, false);
  expect(parts.targetGroup.scale.x).toBeCloseTo(1 + 0.4 * CONFIG.hitScaleBoost, 8);
});

test('le flash est borné à 0 (pas de valeur négative)', () => {
  pulse.flashHit(); // 0.5
  pulse.update(10, true, false); // massive decrement → clamp to 0
  // hitBoost no longer applies (targetHitFlash == 0), scale returns to pure pulse (>=1 base)
  // ratio = 0/0.5 = 0 → scale = 1
  expect(parts.targetGroup.scale.x).toBeCloseTo(1, 8);
});

test('reset remet pulseT/flash à zéro et la transform à l’identité', () => {
  pulse.flashHit();
  pulse.update(0.5, true, false);
  pulse.reset();
  expect(parts.targetGroup.scale.x).toBe(1);
  expect(parts.targetGroup.rotation.z).toBe(0);
  // after reset, a new cycle restarts from pulseT=0
  pulse.update(DT_PEAK, true, false);
  const expectedPulse = 0.82 + 1 * CONFIG.pulseAmp; // no flash → hitBoost 1
  expect(parts.ringMat!.emissiveIntensity).toBeCloseTo(CONFIG.ringEmissiveBase * expectedPulse, 8);
});

test('parts null (matériaux/lumière absents) : update ne plante pas', () => {
  const sparse: BossTargetPulseParts = {
    targetGroup: new THREE.Group(),
    ringMat: null,
    coreMat: null,
    light: null,
  };
  const p = new BossTargetPulse(CONFIG, sparse);
  expect(() => p.update(0.016, true, false)).not.toThrow();
  // the group transform is still driven even without materials
  expect(sparse.targetGroup.rotation.z).not.toBe(0);
});
