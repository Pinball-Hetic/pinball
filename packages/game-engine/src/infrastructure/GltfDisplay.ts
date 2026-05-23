import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

const TEXTURE_KEYS = [
  'map',
  'emissiveMap',
  'normalMap',
  'roughnessMap',
  'metalnessMap',
  'aoMap',
] as const;

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
    }
  });
}

export function configureGltfRenderer(renderer: THREE.WebGLRenderer): void {
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.45;
}

export function createGltfLoader(decoderPath = '/draco/'): GLTFLoader {
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath(decoderPath);
  const loader = new GLTFLoader();
  loader.setDRACOLoader(dracoLoader);
  return loader;
}
