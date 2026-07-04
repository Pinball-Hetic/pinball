import { test, expect, describe } from 'bun:test';
import * as THREE from 'three';
import {
  AtmosphereFog,
  LightingSnapshot,
  collectAtmosphereMaterials,
  type SceneLighting,
} from './AtmosphereLighting';

function fakeLighting(): SceneLighting {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x102030);
  const renderer = { toneMappingExposure: 1.23 } as unknown as THREE.WebGLRenderer;
  const ambient = new THREE.AmbientLight(0x445566, 0.7);
  const hemi = new THREE.HemisphereLight(0x778899, 0xaabbcc, 0.55);
  const dir = new THREE.DirectionalLight(0xddeeff, 0.9);
  const fill = new THREE.DirectionalLight(0x223344, 0.4);
  return { scene, renderer, ambient, hemi, dir, fill };
}

describe('LightingSnapshot.capture', () => {
  test('reads every light/scene/renderer value verbatim', () => {
    const lighting = fakeLighting();
    const snap = new LightingSnapshot();
    snap.capture(lighting);

    expect(snap.bg.getHex()).toBe(0x102030);
    expect(snap.exposure).toBeCloseTo(1.23, 10);
    expect(snap.ambientColor.getHex()).toBe(0x445566);
    expect(snap.ambientIntensity).toBeCloseTo(0.7, 10);
    expect(snap.hemiSky.getHex()).toBe(0x778899);
    expect(snap.hemiGround.getHex()).toBe(0xaabbcc);
    expect(snap.hemiIntensity).toBeCloseTo(0.55, 10);
    expect(snap.dirColor.getHex()).toBe(0xddeeff);
    expect(snap.dirIntensity).toBeCloseTo(0.9, 10);
    expect(snap.fillColor.getHex()).toBe(0x223344);
    expect(snap.fillIntensity).toBeCloseTo(0.4, 10);
  });

  test('snapshot colors are clones — later light mutation does not bleed in', () => {
    const lighting = fakeLighting();
    const snap = new LightingSnapshot();
    snap.capture(lighting);
    lighting.ambient.color.set(0xff0000);
    lighting.ambient.intensity = 99;
    expect(snap.ambientColor.getHex()).toBe(0x445566);
    expect(snap.ambientIntensity).toBeCloseTo(0.7, 10);
  });

  test('non-Color background leaves bg at its default (white) — verbatim', () => {
    const lighting = fakeLighting();
    lighting.scene.background = null;
    const snap = new LightingSnapshot();
    snap.capture(lighting);
    expect(snap.bg.getHex()).toBe(0xffffff);
  });
});

describe('collectAtmosphereMaterials', () => {
  function meshWith(name: string, mat: THREE.Material | THREE.Material[]): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.BufferGeometry(), mat as THREE.Material);
    m.name = name;
    return m;
  }

  test('snapshots each unique MeshStandardMaterial with cloned color/emissive', () => {
    const root = new THREE.Object3D();
    const mat = new THREE.MeshStandardMaterial({ color: 0x808080, emissive: 0x101010 });
    mat.emissiveIntensity = 0.4;
    root.add(meshWith('a', mat));

    const entries = collectAtmosphereMaterials(root);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.material).toBe(mat);
    expect(entries[0]!.color.getHex()).toBe(0x808080);
    expect(entries[0]!.emissive.getHex()).toBe(0x101010);
    expect(entries[0]!.emissiveIntensity).toBeCloseTo(0.4, 10);

    // Clone: mutating live material does not change the snapshot.
    mat.color.set(0xffffff);
    expect(entries[0]!.color.getHex()).toBe(0x808080);
  });

  test('dedupes a material shared across two meshes', () => {
    const root = new THREE.Object3D();
    const shared = new THREE.MeshStandardMaterial({ color: 0x123456 });
    root.add(meshWith('a', shared));
    root.add(meshWith('b', shared));
    expect(collectAtmosphereMaterials(root)).toHaveLength(1);
  });

  test('ignores non-standard materials and walks material arrays', () => {
    const root = new THREE.Object3D();
    const basic = new THREE.MeshBasicMaterial();
    const std = new THREE.MeshStandardMaterial();
    root.add(meshWith('multi', [basic, std]));
    const entries = collectAtmosphereMaterials(root);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.material).toBe(std);
  });

  test('skip predicate drops a mesh entirely', () => {
    const root = new THREE.Object3D();
    root.add(meshWith('keep', new THREE.MeshStandardMaterial()));
    root.add(meshWith('drop', new THREE.MeshStandardMaterial()));
    const entries = collectAtmosphereMaterials(root, {
      skip: (obj) => obj.name === 'drop',
    });
    expect(entries).toHaveLength(1);
  });

  test('extra() merges per-map fields into each entry', () => {
    const root = new THREE.Object3D();
    root.add(meshWith('surface', new THREE.MeshStandardMaterial()));
    const entries = collectAtmosphereMaterials(root, {
      extra: (obj) => ({ kind: obj.name }),
    });
    expect(entries[0]!.kind).toBe('surface');
  });
});

describe('AtmosphereFog', () => {
  test('save then restore puts the original scene fog back', () => {
    const scene = new THREE.Scene();
    const original = new THREE.FogExp2(0x111111, 0.2);
    scene.fog = original;
    const fog = new AtmosphereFog(0x0c001a);
    fog.save(scene);

    fog.apply(scene, 1, 0.5);
    expect(scene.fog).not.toBe(original);

    fog.restore(scene);
    expect(scene.fog).toBe(original);
  });

  test('save with no original fog restores to null', () => {
    const scene = new THREE.Scene();
    scene.fog = null;
    const fog = new AtmosphereFog(0x0c001a);
    fog.save(scene);
    fog.apply(scene, 1, 0.3);
    fog.restore(scene);
    expect(scene.fog).toBeNull();
  });

  test('apply swaps in the map fog and sets density', () => {
    const scene = new THREE.Scene();
    const fog = new AtmosphereFog(0x0c001a);
    fog.save(scene);
    fog.apply(scene, 0.5, 0.25);
    const applied = scene.fog as THREE.FogExp2;
    expect(applied).toBeInstanceOf(THREE.FogExp2);
    expect(applied.color.getHex()).toBe(0x0c001a);
    expect(applied.density).toBeCloseTo(0.25, 10);
  });

  test('apply with ease<=0 restores instead of swapping in', () => {
    const scene = new THREE.Scene();
    const original = new THREE.FogExp2(0x111111, 0.2);
    scene.fog = original;
    const fog = new AtmosphereFog(0x0c001a);
    fog.save(scene);
    fog.apply(scene, 0, 0);
    expect(scene.fog).toBe(original);
  });

  test('repeated apply reuses the same fog instance', () => {
    const scene = new THREE.Scene();
    const fog = new AtmosphereFog(0x0c001a);
    fog.save(scene);
    fog.apply(scene, 0.5, 0.1);
    const first = scene.fog;
    fog.apply(scene, 0.8, 0.2);
    expect(scene.fog).toBe(first);
  });
});
