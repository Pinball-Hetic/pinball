import * as THREE from 'three';

export type FlashMat = {
  mat: THREE.MeshStandardMaterial;
  emissive: THREE.Color;
  intensity: number;
};

export const FLASH_DURATION = 0.08;
export const FLASH_INTENSITY = 1.2;
const _flashColor = new THREE.Color(0xfff0e0);

export function collectFlashMats(obj: THREE.Object3D): FlashMat[] {
  const out: FlashMat[] = [];
  obj.traverse((c) => {
    if (!(c instanceof THREE.Mesh)) return;
    const mats = Array.isArray(c.material) ? c.material : [c.material];
    for (const m of mats) {
      if (m instanceof THREE.MeshStandardMaterial) {
        out.push({ mat: m, emissive: m.emissive.clone(), intensity: m.emissiveIntensity });
      }
    }
  });
  return out;
}

export function applyFlash(mats: FlashMat[], t: number): void {
  const f = t > 0 ? t / FLASH_DURATION : 0;
  for (const fm of mats) {
    if (f > 0) {
      fm.mat.emissive.copy(fm.emissive).lerp(_flashColor, f);
      fm.mat.emissiveIntensity = fm.intensity + FLASH_INTENSITY * f;
    } else {
      fm.mat.emissive.copy(fm.emissive);
      fm.mat.emissiveIntensity = fm.intensity;
    }
  }
}
