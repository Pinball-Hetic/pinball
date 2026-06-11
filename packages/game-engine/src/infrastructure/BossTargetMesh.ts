import * as THREE from 'three';

export type BossTargetMeshTheme = {
  ring: {
    color: number;
    emissive: number;
    emissiveIntensity: number;
    radius?: number;
    tube?: number;
    metalness?: number;
    roughness?: number;
  };
  core: {
    color: number;
    emissive: number;
    emissiveIntensity: number;
    radius?: number;
    metalness?: number;
    roughness?: number;
  };
  light: {
    color: number;
    intensity: number;
    distance?: number;
    decay?: number;
  };
  victoryBurst?: { color: number };
};

export type BossTargetMeshParts = {
  group: THREE.Group;
  ringMat: THREE.MeshStandardMaterial;
  coreMat: THREE.MeshStandardMaterial;
  light: THREE.PointLight;
  victoryBurst: THREE.Mesh | null;
  victoryBurstMat: THREE.MeshBasicMaterial | null;
  ownedGeos: THREE.BufferGeometry[];
  ownedMats: THREE.Material[];
};

export function createBossTargetMesh(theme: BossTargetMeshTheme): BossTargetMeshParts {
  const group = new THREE.Group();
  const ownedGeos: THREE.BufferGeometry[] = [];
  const ownedMats: THREE.Material[] = [];

  const ringGeo = new THREE.TorusGeometry(
    theme.ring.radius ?? 0.034,
    theme.ring.tube ?? 0.004,
    8,
    24,
  );
  const ringMat = new THREE.MeshStandardMaterial({
    color: theme.ring.color,
    emissive: theme.ring.emissive,
    emissiveIntensity: theme.ring.emissiveIntensity,
    metalness: theme.ring.metalness ?? 0.45,
    roughness: theme.ring.roughness ?? 0.32,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = Math.PI / 2;
  group.add(ring);
  ownedGeos.push(ringGeo);
  ownedMats.push(ringMat);

  const coreGeo = new THREE.CircleGeometry(theme.core.radius ?? 0.015, 16);
  const coreMat = new THREE.MeshStandardMaterial({
    color: theme.core.color,
    emissive: theme.core.emissive,
    emissiveIntensity: theme.core.emissiveIntensity,
    metalness: theme.core.metalness ?? 0.25,
    roughness: theme.core.roughness ?? 0.38,
    side: THREE.DoubleSide,
  });
  const core = new THREE.Mesh(coreGeo, coreMat);
  core.rotation.x = -Math.PI / 2;
  group.add(core);
  ownedGeos.push(coreGeo);
  ownedMats.push(coreMat);

  const light = new THREE.PointLight(
    theme.light.color,
    theme.light.intensity,
    theme.light.distance ?? 0.18,
    theme.light.decay ?? 2,
  );
  light.position.y = 0.02;
  group.add(light);

  let victoryBurst: THREE.Mesh | null = null;
  let victoryBurstMat: THREE.MeshBasicMaterial | null = null;
  if (theme.victoryBurst) {
    const burstGeo = new THREE.RingGeometry(0.02, 0.038, 24);
    victoryBurstMat = new THREE.MeshBasicMaterial({
      color: theme.victoryBurst.color,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    victoryBurst = new THREE.Mesh(burstGeo, victoryBurstMat);
    victoryBurst.rotation.x = -Math.PI / 2;
    group.add(victoryBurst);
    ownedGeos.push(burstGeo);
    ownedMats.push(victoryBurstMat);
  }

  return {
    group,
    ringMat,
    coreMat,
    light,
    victoryBurst,
    victoryBurstMat,
    ownedGeos,
    ownedMats,
  };
}
