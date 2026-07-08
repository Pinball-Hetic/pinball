import { describe, it, expect, spyOn } from 'bun:test';
import * as THREE from 'three';
import { BossTargetActor, type BossTargetActorConfig } from '../../src/infrastructure/BossTargetActor';

const GLOW = { color: 0xff5533, distance: 0.38, decay: 2, y: 0.03 } as const;

function makeConfig(overrides: Partial<BossTargetActorConfig> = {}): BossTargetActorConfig {
  return {
    logTag: 'Test',
    // Bogus URL: loadModel() awaits loadAsync which rejects, caught internally.
    modelUrl: 'about:blank',
    target: { x: 0, z: 0 },
    footLift: 0.026,
    modelHeight: 0.2,
    floorClearance: 0.006,
    fitFrames: 8,
    yaw: 0,
    glow: { ...GLOW },
    resolveClips: () => ({ idleAction: null, hitAction: null, victoryAction: null }),
    disposeGlowOnDispose: true,
    ...overrides,
  };
}

function mountActor(actor: BossTargetActor): THREE.Group {
  const parent = new THREE.Group();
  const camera = new THREE.PerspectiveCamera();
  actor.mount(parent, camera);
  return parent;
}

describe('BossTargetActor glow lifecycle', () => {
  it('mount attaches an anchor to the parent and detaches it on dispose', () => {
    const actor = new BossTargetActor(makeConfig());
    const parent = mountActor(actor);
    expect(parent.children.length).toBe(1); // anchor only (glow attaches on show())
    actor.dispose();
    expect(parent.children.length).toBe(0);
  });

  // B1 regression: dispose() must dispose the glow PointLight's GPU resources,
  // not merely null the ref. Demogorgon previously called reset(false) → leak.
  it('dispose() disposes the glow light when disposeGlowOnDispose is true', () => {
    const disposeSpy = spyOn(THREE.PointLight.prototype, 'dispose');
    const before = disposeSpy.mock.calls.length;
    const actor = new BossTargetActor(makeConfig({ disposeGlowOnDispose: true }));
    mountActor(actor);
    actor.dispose();
    expect(disposeSpy.mock.calls.length).toBeGreaterThan(before);
    disposeSpy.mockRestore();
  });

  it('dispose() does NOT dispose the glow light when disposeGlowOnDispose is false', () => {
    const disposeSpy = spyOn(THREE.PointLight.prototype, 'dispose');
    const before = disposeSpy.mock.calls.length;
    const actor = new BossTargetActor(makeConfig({ disposeGlowOnDispose: false }));
    mountActor(actor);
    actor.dispose();
    expect(disposeSpy.mock.calls.length).toBe(before);
    disposeSpy.mockRestore();
  });
});
