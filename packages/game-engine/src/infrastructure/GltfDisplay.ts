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

/**
 * Prépare les matériaux GLB pour le rendu Three.js PBR.
 * - Corrige les espaces couleur des textures (SRGBColorSpace).
 * - Assombrit les surfaces de table selon `rendering.colorDarken`.
 * - Booste l'`envMapIntensity` selon le niveau de metalness et la config map.
 *
 * @param root     Racine de la scène GLB.
 * @param rendering Config de rendu de la map (depuis manifest.rendering).
 *                  Si absent → valeurs par défaut neutres.
 */
export function prepareGltfMaterialsForDisplay(
  root: THREE.Object3D,
  rendering?: MapRenderingConfig,
): void {
  const colorDarken        = rendering?.colorDarken        ?? DEFAULT_MAP_COLOR_DARKEN;
  const envMetallic        = rendering?.envIntensityMetallic ?? DEFAULT_ENV_METALLIC;
  const envSemi            = rendering?.envIntensitySemi    ?? DEFAULT_ENV_SEMI;
  const envBase            = rendering?.envIntensityBase    ?? DEFAULT_ENV_BASE;

  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const material of materials) {
      if (!(material instanceof THREE.MeshStandardMaterial)) continue;

      // Espaces couleur textures.
      for (const key of TEXTURE_KEYS) {
        const tex = material[key];
        if (tex) tex.colorSpace = THREE.SRGBColorSpace;
      }

      // Assombrissement sélectif des surfaces de plateau.
      if (shouldDarkenMapMaterial(obj)) {
        material.color.multiplyScalar(colorDarken);
        // Surfaces imprimées (sol/plastique/stickers) = diffuses, pas miroir.
        // roughness haut + metalness 0 + envMapIntensity quasi nul : même au
        // ras (fresnel rasant), le sol ne renvoie plus les panneaux de
        // RoomEnvironment. NE PAS retomber dans le boost ci-dessous.
        material.roughness = Math.max(material.roughness, 0.85);
        material.metalness = 0;
        material.envMapIntensity = 0.05;
        continue;
      }

      // envMapIntensity selon metalness — clé du rendu PBR vivid.
      // metalness = 0 → matériau diffus (plastique, bois) : envBase.
      // metalness 0.2–0.5 → semi-métal : envSemi.
      // metalness ≥ 0.5 → métal pur (or, chrome, gemmes) : envMetallic.
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

/**
 * Configure le renderer WebGL pour le rendu PBR correct.
 * @param rendering Config de la map — toneMappingExposure lu depuis rendering,
 *                  ou DEFAULT si absent.
 */
export function configureGltfRenderer(
  renderer: THREE.WebGLRenderer,
  rendering?: MapRenderingConfig,
): void {
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = rendering?.toneMappingExposure ?? DEFAULT_TONE_MAPPING_EXPOSURE;
}

/**
 * Retourne le facteur de flou à passer à `pmrem.fromScene(env, blur)`.
 * 0 = reflets nets, 0.04 = doux (défaut Three.js).
 */
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
