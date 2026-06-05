import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { PLAYFIELD_MAP_COLOR_DARKEN, PLAYFIELD_TONE_MAPPING_EXPOSURE } from '../domain/PlayfieldVisualConstants';
import { canonicalGltfName, isFlipperGltfMesh, isPinballmapRailMesh, normalizeGltfName } from './GltfNodeNames';

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

  const raw = normalizeGltfName(mesh.name);
  if (/^guirlande-\d+$/.test(raw)) return false;

  const n = canonicalGltfName(mesh.name);
  if (/bumper-strangerthings/.test(n) || /^bumper_ring/.test(n)) return false;

  if (n === 'playfield' || /^table(\.\d+)?$/.test(n) || n === 'pinballmap') return true;

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

/** Espace couleur correct — matériaux et textures GLB inchangés. */
export function prepareGltfMaterialsForDisplay(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const material of materials) {
      if (!(material instanceof THREE.MeshStandardMaterial)) continue;
      for (const key of TEXTURE_KEYS) {
        const tex = material[key];
        if (tex) tex.colorSpace = THREE.SRGBColorSpace;
      }
      if (shouldDarkenMapMaterial(obj)) {
        material.color.multiplyScalar(PLAYFIELD_MAP_COLOR_DARKEN);
      }
    }
  });
}

export function configureGltfRenderer(renderer: THREE.WebGLRenderer): void {
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = PLAYFIELD_TONE_MAPPING_EXPOSURE;
}

export function createGltfLoader(decoderPath = '/draco/'): GLTFLoader {
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath(decoderPath);
  const loader = new GLTFLoader();
  loader.setDRACOLoader(dracoLoader);
  return loader;
}
