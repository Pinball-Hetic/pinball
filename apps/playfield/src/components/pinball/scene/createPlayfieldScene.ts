import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import {
  configureGltfRenderer,
  getEnvironmentBlur,
  type PlayfieldCamera,
} from "@pinball/game-engine";
import type { MapRenderingConfig } from "@pinball/shared-types";

export interface PlayfieldSceneLights {
  ambient: THREE.AmbientLight;
  hemi: THREE.HemisphereLight;
  dir: THREE.DirectionalLight;
  fill: THREE.DirectionalLight;
}

export interface PlayfieldScene {
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  camera: PlayfieldCamera;
  cameraTarget: THREE.Vector3;
  modelRoot: THREE.Group;
  lights: PlayfieldSceneLights;
}

/**
 * Builds all of a map's lights from `rendering.lights`, with exact `??`
 * fallbacks. No renderer/DOM dependency: returns real THREE lights, added to
 * the scene by the caller.
 *
 * Optional lights (dir2, rim) are added straight to the scene here because
 * they are not exposed to the MapContext; ambient/hemi/dir/fill are returned
 * for the `MapContext.lighting` wiring.
 */
export function buildManifestLights(
  scene: THREE.Scene,
  rendering: MapRenderingConfig | undefined,
): PlayfieldSceneLights {
  const rl = rendering?.lights;

  const ambient = new THREE.AmbientLight(
    rl?.ambient.color ?? 0xffffff,
    rl?.ambient.intensity ?? 0.35,
  );
  scene.add(ambient);

  const hemi = new THREE.HemisphereLight(
    rl?.hemi.sky ?? 0xfff8e8,
    rl?.hemi.ground ?? 0x111108,
    rl?.hemi.intensity ?? 0.2,
  );
  scene.add(hemi);

  const dir = new THREE.DirectionalLight(
    rl?.dir.color ?? 0xffffff,
    rl?.dir.intensity ?? 2.5,
  );
  dir.position.set(rl?.dir.x ?? 0, rl?.dir.y ?? 0.48, rl?.dir.z ?? 0.88);
  dir.castShadow = false;
  scene.add(dir);

  // Optional second sun (rl.dir2) on the opposite side → dual lighting that
  // opens up the main light's shadow. Distinct from fill (reserved for
  // UpsideDownAtmosphere). Absent from the config → single sun.
  if (rl?.dir2) {
    const dir2 = new THREE.DirectionalLight(rl.dir2.color, rl.dir2.intensity);
    dir2.position.set(rl.dir2.x, rl.dir2.y, rl.dir2.z);
    dir2.castShadow = false;
    scene.add(dir2);
  }

  // Optional backlight (rl.rim) at the back of the table → metal edge
  // highlight toward the camera. Near-zero cost. Absent from the config → no rim.
  if (rl?.rim) {
    const rim = new THREE.DirectionalLight(rl.rim.color, rl.rim.intensity);
    rim.position.set(rl.rim.x, rl.rim.y, rl.rim.z);
    rim.castShadow = false;
    scene.add(rim);
  }

  const fill = new THREE.DirectionalLight(
    rl?.fill.color ?? 0xffeedd,
    rl?.fill.intensity ?? 0.15,
  );
  fill.position.set(rl?.fill.x ?? -0.5, rl?.fill.y ?? 1, rl?.fill.z ?? -1);
  scene.add(fill);

  return { ambient, hemi, dir, fill };
}

/**
 * Bootstrap of a map's Three.js scene: renderer (PBR config + PMREM/
 * RoomEnvironment env map), scene + background, perspective camera + target,
 * lights from `manifest.rendering`, and the `modelRoot` group.
 *
 * React-adjacent glue (depends on the `mountEl` DOM) → lives in
 * apps/playfield. `renderer.domElement` is appended to `mountEl` here.
 */
export function createPlayfieldScene(
  mountEl: HTMLElement,
  rendering: MapRenderingConfig | undefined,
): PlayfieldScene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#000000");

  const { clientWidth, clientHeight } = mountEl;
  const viewportAspect = clientWidth / Math.max(clientHeight, 1);
  const camera: PlayfieldCamera = new THREE.PerspectiveCamera(
    50,
    viewportAspect,
    0.001,
    100,
  );
  const cameraTarget = new THREE.Vector3();

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  // Exposure + tonemapping from the map config (no global value).
  configureGltfRenderer(renderer, rendering);

  // Environment map — per map (rendering.useEnvironment). ST: off → metal
  // lit by the directionals + rim (no ambient reflections). Zelda: on →
  // highly reflective gold/gems (Vectary look).
  if (rendering?.useEnvironment) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    scene.environment = pmrem.fromScene(new RoomEnvironment(), getEnvironmentBlur(rendering)).texture;
    pmrem.dispose();
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(clientWidth, clientHeight);
  renderer.shadowMap.enabled = false;
  mountEl.appendChild(renderer.domElement);

  // ─── Lights — read from manifest.rendering ──────────────────────────────
  // Each map fully controls its lighting setup. No shared value here: ST
  // (cold/cinematic) and Zelda (warm/overhead) diverge.
  const lights = buildManifestLights(scene, rendering);

  const modelRoot = new THREE.Group();
  scene.add(modelRoot);

  return { scene, renderer, camera, cameraTarget, modelRoot, lights };
}
