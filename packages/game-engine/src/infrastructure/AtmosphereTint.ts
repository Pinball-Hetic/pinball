import * as THREE from 'three';

/**
 * Shared APPLY-side tint helpers for map atmosphere systems (Stranger Things
 * Upside Down, Zelda Sacred Realm). The blend integrator lives in
 * `AtmosphereBlend` (domain); these mutate the actual Three materials/lights.
 *
 * VERBATIM math from the original `applyMix()` loops:
 *  - color  : copy(orig) -> set(tint) -> lerp(ease*tintK) -> multiplyScalar(1 - ease*darken)
 *  - emissive: copy(orig) -> set(emissive) -> lerp(ease*emissiveK)
 *  - emissiveIntensity: lerp(orig, orig*emissiveMul + emissiveAdd, ease)
 *  - light  : color.copy(orig) -> set(target) -> lerp(ease*colorK) ; intensity lerp
 *
 * The caller owns its snapshot/lighting types and per-map scene/fog/pulse
 * specifics; these helpers only run the common per-element lerps.
 */

/** Original (snapshot) values for one material, captured at setup. */
export type MaterialTintSnapshot = {
  material: THREE.MeshStandardMaterial;
  color: THREE.Color;
  emissive: THREE.Color;
  emissiveIntensity: number;
};

/** Per-material target factors for the tint lerp. */
export type MaterialTintDescriptor = {
  tint: THREE.ColorRepresentation;
  tintK: number;
  darken: number;
  emissive: THREE.ColorRepresentation;
  emissiveK: number;
  emissiveMul: number;
  emissiveAdd: number;
};

/** Original (snapshot) values for one light, captured at setup. */
export type LightTintSnapshot = {
  color: THREE.Color;
  intensity: number;
};

/** Per-light target factors for the tint lerp. */
export type LightTintDescriptor = {
  color: THREE.ColorRepresentation;
  colorK: number;
  intensity: number;
};

const _scratch = new THREE.Color();

/** Tint one material toward its descriptor by `ease`. VERBATIM lerp. */
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

/** Tint a light's color + set its intensity toward the descriptor by `ease`. */
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

/** Lerp one Three.Color from `orig` toward `target` by `ease * k`. */
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
