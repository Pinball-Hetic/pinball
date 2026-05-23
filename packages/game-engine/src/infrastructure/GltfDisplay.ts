import * as THREE from 'three';

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
