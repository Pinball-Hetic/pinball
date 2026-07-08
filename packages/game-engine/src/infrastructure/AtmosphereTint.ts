import * as THREE from 'three';

export type MaterialTintSnapshot = {
  material: THREE.MeshStandardMaterial;
  color: THREE.Color;
  emissive: THREE.Color;
  emissiveIntensity: number;
};

export type MaterialTintDescriptor = {
  tint: THREE.ColorRepresentation;
  tintK: number;
  darken: number;
  emissive: THREE.ColorRepresentation;
  emissiveK: number;
  emissiveMul: number;
  emissiveAdd: number;
};

export type LightTintSnapshot = {
  color: THREE.Color;
  intensity: number;
};

export type LightTintDescriptor = {
  color: THREE.ColorRepresentation;
  colorK: number;
  intensity: number;
};

const _scratch = new THREE.Color();

export function applyMaterialTint(
  snapshot: MaterialTintSnapshot,
  ease: number,
  descriptor: MaterialTintDescriptor,
): void {
  const mat = snapshot.material;

  mat.color.copy(snapshot.color);
  _scratch.set(descriptor.tint);
  mat.color.lerp(_scratch, ease * descriptor.tintK);
  mat.color.multiplyScalar(1 - ease * descriptor.darken);

  mat.emissive.copy(snapshot.emissive);
  _scratch.set(descriptor.emissive);
  mat.emissive.lerp(_scratch, ease * descriptor.emissiveK);
  mat.emissiveIntensity = THREE.MathUtils.lerp(
    snapshot.emissiveIntensity,
    snapshot.emissiveIntensity * descriptor.emissiveMul + descriptor.emissiveAdd,
    ease,
  );
}

export function applyLightTint(
  light: { color: THREE.Color; intensity: number },
  snapshot: LightTintSnapshot,
  ease: number,
  descriptor: LightTintDescriptor,
): void {
  light.color.copy(snapshot.color);
  _scratch.set(descriptor.color);
  light.color.lerp(_scratch, ease * descriptor.colorK);
  light.intensity = THREE.MathUtils.lerp(snapshot.intensity, descriptor.intensity, ease);
}

export function applyColorTint(
  out: THREE.Color,
  orig: THREE.Color,
  target: THREE.ColorRepresentation,
  ease: number,
  k: number,
): void {
  out.copy(orig);
  _scratch.set(target);
  out.lerp(_scratch, ease * k);
}
