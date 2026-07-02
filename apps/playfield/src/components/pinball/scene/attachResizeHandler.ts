import * as THREE from "three";
import type { PlayfieldCameraRig } from "./PlayfieldCameraRig";

export interface ResizeHandlerDeps {
  mountEl: HTMLElement;
  camera: THREE.Camera;
  renderer: THREE.WebGLRenderer;
  cameraRig: PlayfieldCameraRig;
  /** racine GLB live (null tant que le GLB n'est pas chargé) */
  getPlayfieldRoot: () => THREE.Object3D | null;
}

// Redimensionnement du canvas : aspect caméra + recadrage rig + taille renderer.
// Observe le mount (ResizeObserver) + resize/orientationchange fenêtre, et joue
// une passe initiale au prochain frame. Retourne le detach (cleanup).
export function attachResizeHandler(d: ResizeHandlerDeps): () => void {
  const handleResize = () => {
    const { clientWidth: w, clientHeight: h } = d.mountEl;
    if (w < 1 || h < 1) return;
    if (d.camera instanceof THREE.PerspectiveCamera) {
      d.camera.aspect = w / h;
      d.camera.updateProjectionMatrix();
    }
    const root = d.getPlayfieldRoot();
    if (root) {
      d.cameraRig.syncToRoot(root);
    } else {
      d.cameraRig.applyViewUpFallback();
    }
    d.renderer.setSize(w, h);
  };

  const resizeObserver = new ResizeObserver(() => handleResize());
  resizeObserver.observe(d.mountEl);
  window.addEventListener("resize", handleResize);
  window.addEventListener("orientationchange", handleResize);
  requestAnimationFrame(handleResize);

  return () => {
    window.removeEventListener("resize", handleResize);
    window.removeEventListener("orientationchange", handleResize);
    resizeObserver.disconnect();
  };
}
