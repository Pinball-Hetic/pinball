import * as THREE from "three";
import type { GLTF, GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  removePinballmapUnusedMeshes,
  hidePinballmapDecorNodes,
  prepareGltfMaterialsForDisplay,
  getBallRadius,
  BallTrail,
  type PlayfieldCinematicStrobe,
  type MapLayout,
} from "@pinball/game-engine";
import type { MapManifest } from "@pinball/shared-types";

const GLB_LOAD_MAX_ATTEMPTS = 3;
const GLB_LOAD_RETRY_BASE_MS = 1500;

export async function loadPlayfieldGlb(loader: GLTFLoader, url: string): Promise<GLTF> {
  for (let attempt = 1; attempt <= GLB_LOAD_MAX_ATTEMPTS; attempt++) {
    try {
      return await loader.loadAsync(url);
    } catch (err) {
      console.warn(`[Playfield] GLB load attempt ${attempt}/${GLB_LOAD_MAX_ATTEMPTS} failed`, err);
      if (attempt === GLB_LOAD_MAX_ATTEMPTS) throw err;
      await new Promise((r) => setTimeout(r, GLB_LOAD_RETRY_BASE_MS * attempt));
    }
  }
  throw new Error("[Playfield] GLB load failed");
}

export interface AssembleModelDeps {
  scene: THREE.Scene;
  modelRoot: THREE.Object3D;
  rendering: MapManifest["rendering"];
  layout: MapLayout;
  freezeFeedbackStrobe: PlayfieldCinematicStrobe;
  collectDisposables: (root: THREE.Object3D) => void;
  disposableGeos: THREE.BufferGeometry[];
  disposableMats: THREE.Material[];
}

export interface AssembledModel {
  playfieldRoot: THREE.Object3D;
  ballMesh: THREE.Mesh;
  ballTrail: BallTrail;
}

export function assemblePlayfieldModel(
  gltf: GLTF,
  d: AssembleModelDeps,
): AssembledModel {
  const playfieldRoot = gltf.scene;
  d.collectDisposables(playfieldRoot);
  d.modelRoot.add(playfieldRoot);
  removePinballmapUnusedMeshes(playfieldRoot);
  hidePinballmapDecorNodes(playfieldRoot);
  prepareGltfMaterialsForDisplay(playfieldRoot, d.rendering);

  const ballTrail = new BallTrail();
  ballTrail.mount(d.scene);

  const { leftX, rightX, topZ, bottomZ } = d.layout.geometry.bounds;
  d.freezeFeedbackStrobe.mount(d.modelRoot, {
    flashColor: 0xffffff,
    flashIntensity: 2.6,
    flashDistance: 0.9,
    flashPosition: new THREE.Vector3((leftX + rightX) / 2, 1.15, (topZ + bottomZ) / 2),
  });

  const ballGeo = new THREE.SphereGeometry(getBallRadius(), 24, 24);
  const ballMat = new THREE.MeshStandardMaterial({
    color: 0xd4d4d4,
    metalness: 0.95,
    roughness: 0.08,
  });
  const ballMesh = new THREE.Mesh(ballGeo, ballMat);
  ballMesh.castShadow = true;
  ballMesh.visible = false;
  d.disposableGeos.push(ballGeo);
  d.disposableMats.push(ballMat);
  d.scene.add(ballMesh);

  return { playfieldRoot, ballMesh, ballTrail };
}
