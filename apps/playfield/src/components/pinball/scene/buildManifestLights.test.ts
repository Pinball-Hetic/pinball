import { describe, expect, it } from "bun:test";
import * as THREE from "three";
import type { MapRenderingConfig } from "@pinball/shared-types";
import { buildManifestLights } from "./createPlayfieldScene";

function fullRendering(): MapRenderingConfig {
  return {
    useEnvironment: false,
    toneMappingExposure: 1,
    colorDarken: 1,
    environmentBlur: 0,
    envIntensityMetallic: 1,
    envIntensitySemi: 1,
    envIntensityBase: 1,
    lights: {
      ambient: { color: 0x112233, intensity: 0.5 },
      hemi: { sky: 0x445566, ground: 0x778899, intensity: 0.7 },
      dir: { color: 0xaabbcc, intensity: 3, x: 1, y: 2, z: 3 },
      dir2: { color: 0xddeeff, intensity: 1.1, x: -1, y: -2, z: -3 },
      rim: { color: 0x010203, intensity: 0.9, x: 4, y: 5, z: 6 },
      fill: { color: 0xffeedd, intensity: 0.2, x: -0.4, y: 0.9, z: -0.8 },
    },
  };
}

describe("buildManifestLights", () => {
  it("builds the four exposed lights from config values", () => {
    const scene = new THREE.Scene();
    const { ambient, hemi, dir, fill } = buildManifestLights(scene, fullRendering());

    expect(ambient).toBeInstanceOf(THREE.AmbientLight);
    expect(ambient.color.getHex()).toBe(0x112233);
    expect(ambient.intensity).toBe(0.5);

    expect(hemi).toBeInstanceOf(THREE.HemisphereLight);
    expect(hemi.color.getHex()).toBe(0x445566);
    expect(hemi.groundColor.getHex()).toBe(0x778899);
    expect(hemi.intensity).toBe(0.7);

    expect(dir).toBeInstanceOf(THREE.DirectionalLight);
    expect(dir.color.getHex()).toBe(0xaabbcc);
    expect(dir.intensity).toBe(3);
    expect(dir.position.toArray()).toEqual([1, 2, 3]);
    expect(dir.castShadow).toBe(false);

    expect(fill).toBeInstanceOf(THREE.DirectionalLight);
    expect(fill.color.getHex()).toBe(0xffeedd);
    expect(fill.intensity).toBe(0.2);
    expect(fill.position.toArray()).toEqual([-0.4, 0.9, -0.8]);
  });

  it("adds exposed lights to the scene", () => {
    const scene = new THREE.Scene();
    const { ambient, hemi, dir, fill } = buildManifestLights(scene, fullRendering());
    for (const light of [ambient, hemi, dir, fill]) {
      expect(scene.children).toContain(light);
    }
  });

  it("adds optional dir2 and rim lights to the scene when present", () => {
    const scene = new THREE.Scene();
    buildManifestLights(scene, fullRendering());
    // ambient + hemi + dir + dir2 + rim + fill = 6 lights on the scene.
    expect(scene.children.length).toBe(6);
  });

  it("omits dir2 and rim when absent", () => {
    const scene = new THREE.Scene();
    const cfg = fullRendering();
    delete cfg.lights.dir2;
    delete cfg.lights.rim;
    buildManifestLights(scene, cfg);
    // ambient + hemi + dir + fill = 4 lights.
    expect(scene.children.length).toBe(4);
  });

  it("uses the exact ?? fallbacks when rendering is undefined", () => {
    const scene = new THREE.Scene();
    const { ambient, hemi, dir, fill } = buildManifestLights(scene, undefined);

    expect(ambient.color.getHex()).toBe(0xffffff);
    expect(ambient.intensity).toBe(0.35);

    expect(hemi.color.getHex()).toBe(0xfff8e8);
    expect(hemi.groundColor.getHex()).toBe(0x111108);
    expect(hemi.intensity).toBe(0.2);

    expect(dir.color.getHex()).toBe(0xffffff);
    expect(dir.intensity).toBe(2.5);
    expect(dir.position.toArray()).toEqual([0, 0.48, 0.88]);

    expect(fill.color.getHex()).toBe(0xffeedd);
    expect(fill.intensity).toBe(0.15);
    expect(fill.position.toArray()).toEqual([-0.5, 1, -1]);

    // No dir2/rim → only 4 lights.
    expect(scene.children.length).toBe(4);
  });
});
