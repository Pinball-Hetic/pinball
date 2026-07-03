import * as THREE from 'three';

// Upload GPU immédiat de toutes les textures d'un sous-arbre.
// compileAsync ne compile QUE les shaders : l'upload texture (texImage2D,
// plusieurs Mo pour un GLB de boss) resterait sinon différé à la première
// frame visible — pile l'instant du spawn du boss.
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

// La bone texture (DataTexture des matrices d'os) est créée paresseusement
// par le renderer à la PREMIÈRE frame où le SkinnedMesh est rendu :
// allocation + upload retomberaient sur la frame du reveal. On force ici.
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

  // compileAsync ne couvre ni l'upload des textures matériaux ni la création
  // de la bone texture des SkinnedMesh — les deux doivent être poussés au GPU
  // ici, hors frame critique.
  initMaterialTextures(renderer, root);
  initBoneTextures(renderer, root);

  const wasVisible = root.visible;
  root.visible = true;
  await renderer.compileAsync(root, camera, scene);
  root.visible = wasVisible;
}

/**
 * Pré-compile les variantes de shaders « nombre de point lights » de la scène.
 *
 * POURQUOI : la clé de cache des programmes Three inclut le NOMBRE de
 * lumières visibles. Les reveals boss ajoutent/retirent des PointLights à la
 * volée (flash strobe, glow du boss, lumière de cible, assist) : au premier
 * changement de compte, TOUS les matériaux éclairés de la scène doivent
 * recompiler leur programme GLSL → freeze de plusieurs frames pile au moment
 * du spawn. Chaque matériau garde ensuite ses variantes en cache
 * (materialProperties.programs, clé = cacheKey) : compiler ici, au preload,
 * avec 0..max lumières supplémentaires rend le basculement au reveal quasi
 * gratuit. Seul le COMPTE importe (pas l'identité des lumières) : des
 * PointLights factices d'intensité 0 suffisent.
 *
 * Le passage k=0 compile aussi tous les matériaux encore invisibles (boss,
 * cibles, portail…) au compte de base — le premier rendu réel ne compile que
 * le visible.
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
