import * as THREE from 'three';

// Immediate GPU upload of every texture in a subtree.
// compileAsync only compiles shaders: the texture upload (texImage2D, several
// MB for a boss GLB) would otherwise stay deferred until the first visible
// frame — exactly the moment the boss spawns.
function initMaterialTextures(renderer: THREE.WebGLRenderer, root: THREE.Object3D): void {
  const seen = new Set<THREE.Texture>();
  root.traverse((obj) => {
    const material = (obj as THREE.Mesh).material;
    if (!material) return;
    const mats = Array.isArray(material) ? material : [material];
    for (const mat of mats) {
      for (const value of Object.values(mat) as unknown[]) {
        const tex = value as THREE.Texture;
        if (tex?.isTexture && !seen.has(tex)) {
          seen.add(tex);
          renderer.initTexture(tex);
        }
      }
    }
  });
}

// The bone texture (DataTexture of bone matrices) is created lazily by the
// renderer on the FIRST frame the SkinnedMesh is rendered: allocation +
// upload would land on the reveal frame. Force it here.
function initBoneTextures(renderer: THREE.WebGLRenderer, root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (!(obj instanceof THREE.SkinnedMesh)) return;
    const skeleton = obj.skeleton;
    if (skeleton.boneTexture === null) skeleton.computeBoneTexture();
    if (skeleton.boneTexture) renderer.initTexture(skeleton.boneTexture);
  });
}

export async function warmupObject3D(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  root: THREE.Object3D,
  opts?: {
    mixer?: THREE.AnimationMixer | null;
    primeActions?: THREE.AnimationAction[];
  },
): Promise<void> {
  await new Promise<void>((resolve) => { requestAnimationFrame(() => resolve()); });

  const actions = opts?.primeActions ?? [];
  if (opts?.mixer && actions.length > 0) {
    for (const action of actions) {
      action.reset();
      action.play();
      action.time = 0;
    }
    opts.mixer.update(0);
    opts.mixer.update(1 / 60);
    for (const action of actions) {
      action.stop();
    }
  }

  root.updateWorldMatrix(true, true);
  root.traverse((obj) => {
    if (obj instanceof THREE.SkinnedMesh) obj.skeleton.update();
  });

  // compileAsync covers neither the material texture upload nor the creation
  // of the SkinnedMesh bone texture — both must be pushed to the GPU here,
  // outside the critical frame.
  initMaterialTextures(renderer, root);
  initBoneTextures(renderer, root);

  const wasVisible = root.visible;
  root.visible = true;
  await renderer.compileAsync(root, camera, scene);
  root.visible = wasVisible;
}

/**
 * Pre-compiles the scene's "point-light count" shader variants.
 *
 * WHY: the Three program cache key includes the NUMBER of visible lights.
 * Boss reveals add/remove PointLights on the fly (strobe flash, boss glow,
 * target light, assist): on the first count change, ALL lit materials in the
 * scene must recompile their GLSL program → multi-frame freeze exactly at
 * spawn time. Each material then keeps its variants cached
 * (materialProperties.programs, key = cacheKey): compiling here, at preload,
 * with 0..max extra lights makes the switch at reveal nearly free. Only the
 * COUNT matters (not the lights' identity): dummy PointLights of intensity 0
 * are enough.
 *
 * The k=0 pass also compiles all still-invisible materials (boss, targets,
 * portal…) at the base count — the first real render only compiles what is
 * visible.
 */
export async function prewarmPointLightProgramVariants(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  maxExtraLights: number,
): Promise<void> {
  const holder = new THREE.Group();
  scene.add(holder);
  try {
    await renderer.compileAsync(scene, camera);
    for (let k = 1; k <= maxExtraLights; k++) {
      holder.add(new THREE.PointLight(0xffffff, 0, 0.001, 2));
      await renderer.compileAsync(scene, camera);
    }
  } finally {
    for (const child of [...holder.children]) {
      (child as THREE.PointLight).dispose();
    }
    holder.parent?.remove(holder);
  }
}
