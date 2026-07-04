import { test, expect, describe } from "bun:test";
import * as THREE from "three";
import type RAPIER from "@dimforge/rapier3d-compat";
import { SWING_RAD, PhysicsWorld, type FlipperPivot } from "@pinball/game-engine";
import {
  computeSwingStep,
  decayFlash,
  createFlipperFrameState,
  stepFlipperPhysics,
  type FlipperPhysicsDeps,
} from "./flipperFrame";

describe("computeSwingStep", () => {
  test("converge vers SWING_RAD quand target=1", () => {
    let swing = 0;
    for (let i = 0; i < 200; i++) swing = computeSwingStep(swing, 1, 1 / 60);
    expect(swing).toBeCloseTo(SWING_RAD, 3);
  });

  test("converge vers 0 quand target=0", () => {
    let swing = SWING_RAD;
    for (let i = 0; i < 200; i++) swing = computeSwingStep(swing, 0, 1 / 60);
    expect(swing).toBeCloseTo(0, 3);
  });

  test("monotone croissant vers la cible", () => {
    const a = computeSwingStep(0, 1, 1 / 60);
    const b = computeSwingStep(a, 1, 1 / 60);
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    expect(b).toBeLessThanOrEqual(SWING_RAD);
  });

  test("frame-rate independent : 2 pas à 120 Hz ≈ 1 pas à 60 Hz", () => {
    const at60 = computeSwingStep(0, 1, 1 / 60);
    let at120 = computeSwingStep(0, 1, 1 / 120);
    at120 = computeSwingStep(at120, 1, 1 / 120);
    expect(at120).toBeCloseTo(at60, 4);
  });
});

describe("decayFlash", () => {
  test("décroît linéairement, plancher 0", () => {
    expect(decayFlash(0.1, 0.016)).toBeCloseTo(0.084, 5);
    expect(decayFlash(0.01, 0.016)).toBe(0);
    expect(decayFlash(0, 0.016)).toBe(0);
  });
});

describe("createFlipperFrameState", () => {
  test("état initial à zéro", () => {
    const s = createFlipperFrameState();
    expect(s).toEqual({
      leftSwing: 0,
      rightSwing: 0,
      physLeftSwing: 0,
      physRightSwing: 0,
      physPrevLeft: 0,
      physPrevRight: 0,
      leftFlash: 0,
      rightFlash: 0,
    });
  });
});

// ── stepFlipperPhysics ───────────────────────────────────────────────────────

const STEP = PhysicsWorld.STEP_INTERVAL;

function makeBodyStub() {
  const calls = { translations: 0, rotations: 0 };
  const body = {
    setNextKinematicTranslation: () => { calls.translations += 1; },
    setNextKinematicRotation: () => { calls.rotations += 1; },
  };
  return { body: body as unknown as RAPIER.RigidBody, calls };
}

function makePivot(side: "left" | "right"): FlipperPivot {
  const pivot = new THREE.Group();
  const mesh = new THREE.Object3D();
  pivot.add(mesh);
  return { pivot, mesh, side, axis: "y" };
}

function makeDeps(overrides: Partial<FlipperPhysicsDeps> = {}): FlipperPhysicsDeps {
  return {
    input: { leftTarget: 0, rightTarget: 0 },
    leftPivot: null,
    rightPivot: null,
    leftObj: null,
    rightObj: null,
    leftBody: null,
    rightBody: null,
    leftOffset: new THREE.Vector3(),
    rightOffset: new THREE.Vector3(),
    ...overrides,
  };
}

describe("stepFlipperPhysics", () => {
  test("le phys-swing converge vers SWING_RAD quand target=1", () => {
    const s = createFlipperFrameState();
    const d = makeDeps({ input: { leftTarget: 1, rightTarget: 0 } });
    for (let i = 0; i < 200; i++) stepFlipperPhysics(s, d, STEP);
    expect(s.physLeftSwing).toBeCloseTo(SWING_RAD, 3);
    expect(s.physRightSwing).toBe(0);
  });

  test("physPrev mémorise le step précédent → delta/stepDt = angVel > 0 en montée", () => {
    const s = createFlipperFrameState();
    const d = makeDeps({ input: { leftTarget: 1, rightTarget: 1 } });
    stepFlipperPhysics(s, d, STEP);
    const afterOne = s.physLeftSwing;
    expect(s.physPrevLeft).toBe(0);
    stepFlipperPhysics(s, d, STEP);
    expect(s.physPrevLeft).toBe(afterOne);
    expect((s.physLeftSwing - s.physPrevLeft) / STEP).toBeGreaterThan(0);
    // Consistent with the shared integrator (same model as the visual).
    expect(s.physLeftSwing).toBeCloseTo(computeSwingStep(afterOne, 1, STEP), 10);
  });

  test("ne touche pas au swing visuel ni aux flashes", () => {
    const s = createFlipperFrameState();
    s.leftSwing = 0.1;
    s.rightSwing = 0.2;
    s.leftFlash = 0.05;
    const d = makeDeps({ input: { leftTarget: 1, rightTarget: 1 } });
    stepFlipperPhysics(s, d, STEP);
    expect(s.leftSwing).toBe(0.1);
    expect(s.rightSwing).toBe(0.2);
    expect(s.leftFlash).toBe(0.05);
  });

  test("pose le pivot et pousse UNE cible kinématique par appel (par step)", () => {
    const s = createFlipperFrameState();
    const left = makePivot("left");
    const stub = makeBodyStub();
    const d = makeDeps({
      input: { leftTarget: 1, rightTarget: 0 },
      leftPivot: left,
      leftObj: left.mesh,
      leftBody: stub.body,
    });
    stepFlipperPhysics(s, d, STEP);
    stepFlipperPhysics(s, d, STEP);
    expect(stub.calls.translations).toBe(2);
    expect(stub.calls.rotations).toBe(2);
    expect(left.pivot.rotation.y).toBeCloseTo(s.physLeftSwing, 10);
  });
});
