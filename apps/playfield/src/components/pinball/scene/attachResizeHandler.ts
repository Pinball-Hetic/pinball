import * as THREE from "three";
import type { PlayfieldCameraRig } from "./PlayfieldCameraRig";

export interface ResizeHandlerDeps {
  mountEl: HTMLElement;
  camera: THREE.Camera;
  renderer: THREE.WebGLRenderer;
  cameraRig: PlayfieldCameraRig;
  /** live GLB root (null until the GLB is loaded) */
  getPlayfieldRoot: () => THREE.Object3D | null;
}

// Canvas resize: camera aspect + rig reframing + renderer size. Observes the
// mount (ResizeObserver) + window resize/orientationchange, and runs an initial
// pass on the next frame. Returns the detach (cleanup).
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
