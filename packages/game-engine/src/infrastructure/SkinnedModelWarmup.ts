import * as THREE from 'three';

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

  const wasVisible = root.visible;
  root.visible = true;
  await renderer.compileAsync(root, camera, scene);
  root.visible = wasVisible;
}
