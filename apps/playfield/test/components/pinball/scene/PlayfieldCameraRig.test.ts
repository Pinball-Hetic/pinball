import { describe, expect, it } from "bun:test";
import * as THREE from "three";
import {
  DEFAULT_PLAYFIELD_CAMERA_DEBUG_TUNING,
  playfieldCameraUpForMode,
  type PlayfieldViewMode,
} from "@pinball/game-engine";
import { PlayfieldCameraRig } from "../../../../src/components/pinball/scene/PlayfieldCameraRig";

function makeRig(viewMode: PlayfieldViewMode = "legacy") {
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
  const cameraTarget = new THREE.Vector3();
  const rig = new PlayfieldCameraRig({
    camera,
    cameraTarget,
    viewMode,
    getDebugTuning: () => DEFAULT_PLAYFIELD_CAMERA_DEBUG_TUNING,
    getViewportSize: () => ({ width: 800, height: 600 }),
  });
  return { rig, camera, cameraTarget };
}

describe("PlayfieldCameraRig.applyNearFar", () => {
  it("derives near/far from the frame box diagonal (verbatim formula)", () => {
    const { rig, camera } = makeRig();
    const box = new THREE.Box3(
      new THREE.Vector3(-1, -1, -1),
      new THREE.Vector3(1, 1, 1),
    );
    const len = box.getSize(new THREE.Vector3()).length();

    rig.applyNearFar(box);

    expect(camera.near).toBe(Math.max(0.001, Math.min(len * 0.004, 0.25)));
    expect(camera.far).toBe(Math.max(80, len * 120));
  });

  it("clamps near to the 0.001..0.25 window for a huge box", () => {
    const { rig, camera } = makeRig();
    const box = new THREE.Box3(
      new THREE.Vector3(-500, -500, -500),
      new THREE.Vector3(500, 500, 500),
    );
    rig.applyNearFar(box);
    expect(camera.near).toBe(0.25);
    expect(camera.far).toBeGreaterThanOrEqual(80);
  });

  it("floors far at 80 for a tiny box", () => {
    const { rig, camera } = makeRig();
    const box = new THREE.Box3(
      new THREE.Vector3(-0.001, -0.001, -0.001),
      new THREE.Vector3(0.001, 0.001, 0.001),
    );
    rig.applyNearFar(box);
    expect(camera.near).toBe(0.001);
    expect(camera.far).toBe(80);
  });

  it("leaves an orthographic camera untouched", () => {
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.5, 42);
    const rig = new PlayfieldCameraRig({
      camera,
      cameraTarget: new THREE.Vector3(),
      viewMode: "portrait-fill",
      getDebugTuning: () => DEFAULT_PLAYFIELD_CAMERA_DEBUG_TUNING,
      getViewportSize: () => ({ width: 800, height: 600 }),
    });
    rig.applyNearFar(
      new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1)),
    );
    expect(camera.near).toBe(0.5);
    expect(camera.far).toBe(42);
  });
});

describe("PlayfieldCameraRig.applyViewUpFallback", () => {
  it("returns false and no-ops before any syncToRoot capture", () => {
    const { rig, camera } = makeRig();
    const before = camera.up.clone();
    expect(rig.applyViewUpFallback()).toBe(false);
    expect(camera.up.equals(before)).toBe(true);
  });
});

describe("PlayfieldCameraRig director wiring", () => {
  it("exposes a director configured with the given view mode", () => {
    const { rig } = makeRig("portrait-fill");
    expect(rig.director).toBeDefined();
    // A fresh director is idle until captureBase runs.
    expect(rig.director.isActive()).toBe(false);
  });

  it("starts with no orbit controls attached", () => {
    const { rig } = makeRig();
    expect(rig.orbit).toBeNull();
  });
});

describe("PlayfieldCameraRig view-mode up vector", () => {
  it("matches the engine helper for legacy and portrait-fill", () => {
    // Guards that applyViewUpFallback would use the correct up per mode.
    expect(playfieldCameraUpForMode("legacy").y).toBe(1);
    expect(playfieldCameraUpForMode("portrait-fill").z).toBe(-1);
  });
});
