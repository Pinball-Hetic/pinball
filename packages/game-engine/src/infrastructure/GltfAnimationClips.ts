import * as THREE from 'three';

/** Matches exact name, `*|token`, or `*|token|*` (Blender/GLTF pipe segments). */
export function findGltfAnimationClip(
  clips: THREE.AnimationClip[],
  token: string,
): THREE.AnimationClip | undefined {
  const needle = token.toLowerCase();
  return clips.find((clip) => {
    const name = clip.name.toLowerCase();
    if (name === needle) return true;
    if (name.endsWith(`|${needle}`)) return true;
    return name.split('|').some((segment) => segment === needle);
  });
}
