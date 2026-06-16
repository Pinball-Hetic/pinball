import { expect, test } from 'bun:test';
import * as THREE from 'three';
import { PlayfieldCameraDirector } from './PlayfieldCameraDirector';
import type { BossDefinition } from '../domain/BossRegistry';

function boss(overrides: Partial<BossDefinition>): BossDefinition {
  return {
    id: 'boss_a',
    colliderRole: 'boss_target',
    target: { x: 8, y: 0, z: 0 },
    targetHits: 5,
    scoreTargetHit: 250,
    reveal: { scoreThreshold: 3000, scoreIncrement: 150, requiresAlternateWorld: false },
    hud: {
      label: '',
      victoryLabel: '',
      dmdLabel: '',
      requiresAlternateWorld: false,
      bottomClass: '',
      borderClass: '',
      subtitleClass: '',
      hitsClass: '',
      victoryClass: '',
      victoryClearMs: 1000,
    },
    unlocksPortal: false,
    unlocksReturnPortal: false,
    cameraCinematic: {
      lookAtLift: 0,
      panFrom: { x: 0, y: 0, z: 0 },
      zoomInDuration: 2,
      holdDuration: 0.2,
      zoomOutDuration: 0.2,
      distanceScale: 1,
    },
    victoryCameraCinematic: {
      lookAtLift: 0,
      zoomInDuration: 0.2,
      holdDuration: 0.2,
      zoomOutDuration: 0.2,
      distanceScale: 1,
    },
    targetMeshTheme: {
      ring: { color: 0, emissive: 0, emissiveIntensity: 1 },
      core: { color: 0, emissive: 0, emissiveIntensity: 1 },
      light: { color: 0, intensity: 1 },
    },
    targetPulse: {
      hitFlashDuration: 0.18,
      pulseSpeed: 2.5,
      pulseAmp: 0.18,
      hitBoost: 1.4,
      ringEmissiveBase: 1.6,
      coreEmissiveBase: 1.2,
      lightIntensityBase: 0.45,
      wobbleSpeed: 3,
      wobbleAmp: 0.08,
      hitScaleBoost: 0.25,
    },
    ...overrides,
  };
}

function setupDirector(definition: BossDefinition) {
  const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 200);
  const lookAtCalls: THREE.Vector3[] = [];
  const originalLookAt = camera.lookAt.bind(camera);
  camera.lookAt = ((x: number | THREE.Vector3, y?: number, z?: number) => {
    const v =
      x instanceof THREE.Vector3
        ? x.clone()
        : new THREE.Vector3(x, y ?? 0, z ?? 0);
    lookAtCalls.push(v);
    return originalLookAt(x as never, y as never, z as never);
  }) as typeof camera.lookAt;

  const director = new PlayfieldCameraDirector();
  director.setBosses([definition]);
  director.captureBase({
    camera,
    target: new THREE.Vector3(0, 0, 0),
    dirToCamera: new THREE.Vector3(0, 0, 1),
    cameraUp: new THREE.Vector3(0, 1, 0),
    distance: 10,
    aspect: 1,
  });
  return { director, lookAtCalls };
}

test('uses linear reveal pan when panEasing is linear', () => {
  const definition = boss({
    cameraCinematic: {
      lookAtLift: 0,
      panFrom: { x: 0, y: 0, z: 0 },
      panEasing: 'linear',
      zoomInDuration: 2,
      holdDuration: 0.2,
      zoomOutDuration: 0.2,
      distanceScale: 1,
    },
  });
  const { director, lookAtCalls } = setupDirector(definition);

  director.play('boss_a');
  director.update(0.5);

  const latest = lookAtCalls.at(-1);
  expect(latest).toBeDefined();
  expect(latest!.x).toBeCloseTo(2, 6);
});

test('uses eased reveal pan by default', () => {
  const definition = boss({
    cameraCinematic: {
      lookAtLift: 0,
      panFrom: { x: 0, y: 0, z: 0 },
      zoomInDuration: 2,
      holdDuration: 0.2,
      zoomOutDuration: 0.2,
      distanceScale: 1,
    },
  });
  const { director, lookAtCalls } = setupDirector(definition);

  director.play('boss_a');
  director.update(0.5);

  const latest = lookAtCalls.at(-1);
  expect(latest).toBeDefined();
  expect(latest!.x).toBeCloseTo(0.5, 6);
});
