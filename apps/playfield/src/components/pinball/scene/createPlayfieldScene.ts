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

  if (rl?.dir2) {
    const dir2 = new THREE.DirectionalLight(rl.dir2.color, rl.dir2.intensity);
    dir2.position.set(rl.dir2.x, rl.dir2.y, rl.dir2.z);
    dir2.castShadow = false;
    scene.add(dir2);
  }

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
  configureGltfRenderer(renderer, rendering);

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

  const lights = buildManifestLights(scene, rendering);

  const modelRoot = new THREE.Group();
  scene.add(modelRoot);

  return { scene, renderer, camera, cameraTarget, modelRoot, lights };
}
