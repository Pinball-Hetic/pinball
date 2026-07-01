import * as THREE from "three";
import type RAPIER from "@dimforge/rapier3d-compat";
import { PlungerPhysics } from "@pinball/game-engine";

// Réglages visuels/géométriques du plongeur. Les défauts reproduisent EXACTEMENT
// les littéraux d'origine ; passer une config permet un tuning par map sans
// toucher la factory.
export interface PlungerConfig {
  radius: number;
  restZ: number;
  length: number;
  color: number;
  metalness: number;
  roughness: number;
}

export const DEFAULT_PLUNGER_CONFIG: PlungerConfig = {
  radius: 0.01,
  restZ: 0.24,
  length: 0.04,
  color: 0xddaa00,
  metalness: 0.9,
  roughness: 0.15,
};

export interface BuildPlungerBodyDeps {
  world: RAPIER.World;
  scene: THREE.Object3D;
  // Ancrage (spawn bille) — le plongeur partage x/y et repose à restZ en Z.
  spawn: { x: number; y: number };
  disposableGeos: THREE.BufferGeometry[];
  disposableMats: THREE.Material[];
  config?: Partial<PlungerConfig>;
}

export interface PlungerBodyResult {
  mesh: THREE.Mesh;
  body: RAPIER.RigidBody;
  restZ: number;
}

// Construction PURE (setup) du plongeur : mesh cylindre + corps cinématique
// Rapier au repos. Behavior-preserving 1:1 (défauts = anciens littéraux). La
// boucle animate lit mesh/body/restZ seulement APRÈS ce setup.
export function buildPlungerBody(deps: BuildPlungerBodyDeps): PlungerBodyResult {
  const { world, scene, spawn, disposableGeos, disposableMats } = deps;
  const cfg = { ...DEFAULT_PLUNGER_CONFIG, ...deps.config };

  const geo = new THREE.CylinderGeometry(cfg.radius, cfg.radius * 1.3, cfg.length, 12);
  const mat = new THREE.MeshStandardMaterial({
    color: cfg.color,
    metalness: cfg.metalness,
    roughness: cfg.roughness,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = Math.PI / 2;
  mesh.position.set(spawn.x, spawn.y, cfg.restZ);
  scene.add(mesh);
  disposableGeos.push(geo);
  disposableMats.push(mat);

  const body = PlungerPhysics.createBody(world, { x: spawn.x, y: spawn.y, z: cfg.restZ });

  return { mesh, body, restZ: cfg.restZ };
}
