import * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { BallPhysics, PlayfieldCamera } from "@pinball/game-engine";
import { ballCenterOnSurface } from "@pinball/game-engine";

export function pointerToNdc(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
): { x: number; y: number } {
  return {
    x: ((clientX - rect.left) / rect.width) * 2 - 1,
    y: -((clientY - rect.top) / rect.height) * 2 + 1,
  };
}

export interface BallDragControllerDeps {
  renderer: THREE.WebGLRenderer;
  camera: PlayfieldCamera;
  getPlayfieldRoot: () => THREE.Object3D | null;
  getBall: () => BallPhysics | null;
  getBallMesh: () => THREE.Object3D | null;
  getOrbitControls: () => OrbitControls | null;
}

export class BallDragController {
  private moveMode = false;
  private dragging = false;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();

  constructor(private readonly deps: BallDragControllerDeps) {}

  get isMoveMode(): boolean {
    return this.moveMode;
  }

  // Game-loop locks (surface-snap, lane-lock) key off this flag, NOT moveMode,
  // so a released ball regains free physics even while `M` mode stays active.
  get isDragging(): boolean {
    return this.dragging;
  }

  private moveBallToPointer(clientX: number, clientY: number): void {
    const ball = this.deps.getBall();
    const root = this.deps.getPlayfieldRoot();
    if (!ball || !root) return;
    const rect = this.deps.renderer.domElement.getBoundingClientRect();
    const ndc = pointerToNdc(clientX, clientY, rect);
    this.pointer.x = ndc.x;
    this.pointer.y = ndc.y;
    this.raycaster.setFromCamera(this.pointer, this.deps.camera);
    const hits = this.raycaster.intersectObject(root, true);
    if (!hits.length) return;
    const p = hits[0].point;
    ball.body.setTranslation(
      { x: p.x, y: ballCenterOnSurface(p.z), z: p.z },
      true,
    );
    ball.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    ball.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    const ballMesh = this.deps.getBallMesh();
    if (ballMesh) ballMesh.visible = true;
  }

  private readonly onDown = (e: PointerEvent): void => {
    if (!this.moveMode) return;
    this.dragging = true;
    const orbit = this.deps.getOrbitControls();
    if (orbit) orbit.enabled = false;
    this.moveBallToPointer(e.clientX, e.clientY);
  };

  private readonly onMove = (e: PointerEvent): void => {
    if (!this.dragging) return;
    this.moveBallToPointer(e.clientX, e.clientY);
  };

  private readonly onUp = (): void => {
    if (!this.dragging) return;
    this.dragging = false;
    const orbit = this.deps.getOrbitControls();
    if (orbit) orbit.enabled = true;
  };

  attach(): void {
    this.deps.renderer.domElement.addEventListener("pointerdown", this.onDown);
    window.addEventListener("pointermove", this.onMove);
    window.addEventListener("pointerup", this.onUp);
  }

  toggleMoveMode(): void {
    this.moveMode = !this.moveMode;
    if (!this.moveMode && this.dragging) {
      this.dragging = false;
      const orbit = this.deps.getOrbitControls();
      if (orbit) orbit.enabled = true;
    }
  }

  dispose(): void {
    this.deps.renderer.domElement.removeEventListener("pointerdown", this.onDown);
    window.removeEventListener("pointermove", this.onMove);
    window.removeEventListener("pointerup", this.onUp);
  }
}
