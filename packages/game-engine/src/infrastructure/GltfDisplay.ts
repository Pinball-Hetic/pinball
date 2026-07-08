import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import type { MapRenderingConfig } from '@pinball/shared-types';
import {
  DEFAULT_MAP_COLOR_DARKEN,
  DEFAULT_TONE_MAPPING_EXPOSURE,
  DEFAULT_ENVIRONMENT_BLUR,
  DEFAULT_ENV_METALLIC,
  DEFAULT_ENV_SEMI,
  DEFAULT_ENV_BASE,
} from '../domain/PlayfieldVisualConstants';
import { canonicalGltfName, isFlipperGltfMesh, isPinballmapRailMesh } from './GltfNodeNames';

const TEXTURE_KEYS = [
  'map',
  'emissiveMap',
  'normalMap',
  'roughnessMap',
  'metalnessMap',
  'aoMap',
] as const;

function shouldDarkenMapMaterial(mesh: THREE.Mesh): boolean {
  if (isFlipperGltfMesh(mesh)) return false;

  const n = canonicalGltfName(mesh.name);
  if (/^bumper_ring/.test(n) || /^bumper-\d+$/.test(n)) return false;

  if (n === 'playfield' || n === 'floor_main' || /^table(\.\d+)?$/.test(n) || n === 'pinballmap') return true;

  if (
    n === 'playfield_sides'
    || n === 'shoulder'
    || n === 'slingshot'
    || n === 'plastic'
    || n.startsWith('plastic_')
    || n.startsWith('separator_')
    || n === 'plunger_panel'
    || isPinballmapRailMesh(mesh)
  ) {
    return true;
  }

  return false;
}

export function prepareGltfMaterialsForDisplay(
  root: THREE.Object3D,
  rendering?: MapRenderingConfig,
): void {
  const colorDarken        = rendering?.colorDarken        ?? DEFAULT_MAP_COLOR_DARKEN;
  const envMetallic        = rendering?.envIntensityMetallic ?? DEFAULT_ENV_METALLIC;
  const envSemi            = rendering?.envIntensitySemi    ?? DEFAULT_ENV_SEMI;
  const envBase            = rendering?.envIntensityBase    ?? DEFAULT_ENV_BASE;

  // The same material (and its `.color`) can be shared by several meshes.
  // Without this guard, `color.multiplyScalar` would run once per mesh and
  // darken the color multiple times. Process each material only once.
  const processed = new Set<THREE.MeshStandardMaterial>();

  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const material of materials) {
      if (!(material instanceof THREE.MeshStandardMaterial)) continue;
      if (processed.has(material)) continue;
      processed.add(material);

      for (const key of TEXTURE_KEYS) {
        const tex = material[key];
        if (tex) tex.colorSpace = THREE.SRGBColorSpace;
      }

      if (shouldDarkenMapMaterial(obj)) {
        material.color.multiplyScalar(colorDarken);
        // Printed surfaces stay diffuse (near-zero envMapIntensity) so the floor
        // never reflects the RoomEnvironment panels. Do NOT fall through to the
        // boost below.
        material.roughness = Math.max(material.roughness, 0.85);
        material.metalness = 0;
        material.envMapIntensity = 0.05;
        continue;
      }

      if (material.metalness >= 0.5) {
        material.envMapIntensity = envMetallic;
      } else if (material.metalness >= 0.2) {
        material.envMapIntensity = envSemi;
      } else {
        material.envMapIntensity = envBase;
      }
    }
  });
}

export function configureGltfRenderer(
  renderer: THREE.WebGLRenderer,
  rendering?: MapRenderingConfig,
): void {
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = rendering?.toneMappingExposure ?? DEFAULT_TONE_MAPPING_EXPOSURE;
}

export function getEnvironmentBlur(rendering?: MapRenderingConfig): number {
  return rendering?.environmentBlur ?? DEFAULT_ENVIRONMENT_BLUR;
}

export function createGltfLoader(decoderPath = '/draco/'): GLTFLoader {
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath(decoderPath);
  const loader = new GLTFLoader();
  loader.setDRACOLoader(dracoLoader);
  return loader;
}
