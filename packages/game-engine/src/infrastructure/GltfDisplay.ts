import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import {
  PLAYFIELD_MAP_COLOR_DARKEN,
  PLAYFIELD_TONE_MAPPING_EXPOSURE,
  PLAYFIELD_ENV_METALLIC,
  PLAYFIELD_ENV_SEMI,
  PLAYFIELD_ENV_BASE,
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
  // Bumpers visuels exclus du darken (rendu vif). Les noms legacy spécifiques à
  // une map ont été retirés : le GLB conventionné utilise des préfixes vis_
  // (gérés en amont), ces patterns ne matchaient plus → retombée identique.
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
        // Surfaces imprimées (sol/plastique/stickers) = diffuses, pas miroir.
        // roughness haut + metalness 0 + envMapIntensity quasi nul : même au
        // ras (fresnel rasant), le sol ne renvoie plus les panneaux de
        // RoomEnvironment. NE PAS retomber dans le boost ci-dessous.
        material.roughness = Math.max(material.roughness, 0.85);
        material.metalness = 0;
        material.envMapIntensity = 0.05;
        continue;
      }
      // Boost envMapIntensity selon le niveau de metalness.
      // Les matériaux métalliques (or, gemmes) doivent refléter fortement
      // l'environment pour atteindre l'aspect Vectary (vivid gold, vivid gems).
      if (material.metalness >= 0.5) {
        material.envMapIntensity = PLAYFIELD_ENV_METALLIC;
      } else if (material.metalness >= 0.2) {
        material.envMapIntensity = PLAYFIELD_ENV_SEMI;
      } else {
        material.envMapIntensity = PLAYFIELD_ENV_BASE;
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
