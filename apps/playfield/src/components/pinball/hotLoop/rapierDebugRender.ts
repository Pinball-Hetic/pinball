import * as THREE from "three";

// Non-finite vertices (some colliders return NaN/Infinity) must be squashed
// to 0, or computeBoundingSphere throws on a NaN radius. Mutates `vertices`.
export function sanitizeRapierDebugBuffers(
  vertices: Float32Array,
  colors: Float32Array,
): { vertices: Float32Array; rgb: Float32Array } {
  const rgb = new Float32Array(vertices.length);
  for (let i = 0, j = 0; i < colors.length; i += 4, j += 3) {
    rgb[j] = colors[i];
    rgb[j + 1] = colors[i + 1];
    rgb[j + 2] = colors[i + 2];
  }
  for (let i = 0; i < vertices.length; i++) {
    if (!Number.isFinite(vertices[i])) vertices[i] = 0;
  }
  return { vertices, rgb };
}

export function updateRapierDebugGeometry(
  geo: THREE.BufferGeometry,
  raw: { vertices: Float32Array; colors: Float32Array },
): void {
  const { vertices, rgb } = sanitizeRapierDebugBuffers(raw.vertices, raw.colors);
  geo.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(rgb, 3));
  geo.computeBoundingSphere();
}
