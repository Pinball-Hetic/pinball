import * as THREE from 'three';
import { VECNA_TARGET } from '../domain/Ball';
import {
  VECNA_MODEL_BIND_HEIGHT,
  VECNA_MODEL_FIT_FRAMES,
  VECNA_MODEL_FLOOR_CLEARANCE,
  VECNA_MODEL_FOOT_LIFT,
  VECNA_MODEL_HEIGHT,
  VECNA_MODEL_URL,
  VECNA_MODEL_YAW,
} from '../domain/VecnaConstants';
import { PLAYFIELD_TILT, surfaceYAtZ } from '../domain/PlayfieldGeometry';
import { createGltfLoader } from './GltfDisplay';
import {
  applySkinnedModelFit,
  fitSkinnedModelWithRetry,
  updateSkinnedBindPose,
} from './SkinnedModelFit';

export class VecnaTargetVisual {
  private anchor: THREE.Group | null = null;
  private camera: THREE.Camera | null = null;
  private rig: THREE.Group | null = null;
  private offset: THREE.Group | null = null;
  private model: THREE.Object3D | null = null;
  private glowLight: THREE.PointLight | null = null;
  private loadPromise: Promise<void> | null = null;
  private groundY = 0;
  private liftY = 0;
  private pulseT = 0;
  private hitFlash = 0;

  mount(parent: THREE.Object3D, camera: THREE.Camera): void {
    this.dispose();
    this.camera = camera;

    this.groundY = surfaceYAtZ(VECNA_TARGET.z) + VECNA_MODEL_FOOT_LIFT;
    const anchor = new THREE.Group();
    anchor.position.set(VECNA_TARGET.x, this.groundY, VECNA_TARGET.z);
    anchor.rotation.x = PLAYFIELD_TILT;
    anchor.visible = false;
    parent.add(anchor);
    this.anchor = anchor;

    const rig = new THREE.Group();
    anchor.add(rig);
    this.rig = rig;

    this.glowLight = new THREE.PointLight(0x9955ee, 0, 0.55, 2);
    this.glowLight.position.y = 0.08;
    anchor.add(this.glowLight);

    this.loadPromise = this.loadModel();
  }

  ensureReady(): Promise<void> {
    return this.loadPromise ?? Promise.resolve();
  }

  async warmup(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): Promise<void> {
    if (!this.anchor) return;
    await renderer.compileAsync(this.anchor, camera, scene);
  }

  setLift(lift: number): void {
    this.liftY = lift;
    if (this.anchor) this.anchor.position.y = this.groundY + lift;
  }

  show(): void {
    if (this.anchor) this.anchor.visible = true;
  }

  hide(): void {
    if (this.anchor) {
      this.anchor.visible = false;
      this.anchor.scale.setScalar(1);
      this.anchor.rotation.z = 0;
      this.anchor.position.y = this.groundY;
    }
    this.liftY = 0;
    this.hitFlash = 0;
    if (this.glowLight) this.glowLight.intensity = 0;
  }

  land(): void {
    this.applyFit();
  }

  playHit(): void {
    this.hitFlash = 0.18;
  }

  playVictory(): void {
    this.hitFlash = 0.28;
  }

  update(dt: number): void {
    if (!this.anchor?.visible) return;

    this.syncFacing();

    if (this.hitFlash > 0) this.hitFlash = Math.max(0, this.hitFlash - dt);

    this.pulseT += dt;
    const hitBoost = this.hitFlash > 0 ? 1.5 : 1;
    const pulse = (0.82 + Math.sin(this.pulseT * 2.2) * 0.14) * hitBoost;
    if (this.glowLight) this.glowLight.intensity = 0.58 * pulse;

    const scale = 1 + (this.hitFlash / 0.18) * 0.12;
    this.anchor.scale.setScalar(scale);
  }

  dispose(): void {
    if (this.anchor) this.anchor.parent?.remove(this.anchor);
    this.anchor = null;
    this.camera = null;
    this.glowLight = null;
    this.rig = null;
    this.offset = null;
    this.model = null;
    this.hitFlash = 0;
    this.pulseT = 0;
    this.liftY = 0;
    this.loadPromise = null;
  }

  private async loadModel(): Promise<void> {
    try {
      const gltf = await createGltfLoader().loadAsync(VECNA_MODEL_URL);
      if (!this.anchor) return;
      this.attachModel(gltf.scene);
      await fitSkinnedModelWithRetry(
        () => this.applyFit(),
        VECNA_MODEL_FIT_FRAMES,
        () => this.anchor !== null,
      );
      this.syncFacing();
      this.setLift(this.liftY);
    } catch (err) {
      console.error('[Vecna] load error:', err);
    }
  }

  private attachModel(model: THREE.Object3D): void {
    if (!this.anchor || !this.rig) return;

    this.rig.position.set(0, 0, 0);
    this.rig.rotation.set(0, 0, 0);
    this.rig.scale.set(1, 1, 1);
    this.anchor.scale.set(1, 1, 1);

    const offset = new THREE.Group();
    this.offset = offset;
    this.rig.add(offset);
    offset.add(model);
    this.model = model;

    model.traverse((obj) => {
      obj.frustumCulled = false;
      if (obj instanceof THREE.SkinnedMesh) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const mat of mats) {
          if (mat instanceof THREE.MeshStandardMaterial) {
            mat.emissive.setHex(0x553366);
            mat.emissiveIntensity = 0.55;
            mat.needsUpdate = true;
          }
        }
      }
    });
  }

  private applyFit(): boolean {
    if (!this.model || !this.offset || !this.rig || !this.anchor) return false;

    return applySkinnedModelFit({
      model: this.model,
      rig: this.rig,
      offset: this.offset,
      anchor: this.anchor,
      targetHeight: VECNA_MODEL_HEIGHT,
      floorClearance: VECNA_MODEL_FLOOR_CLEARANCE,
      fixedBindHeight: VECNA_MODEL_BIND_HEIGHT,
      beforeMeasure: () => updateSkinnedBindPose(this.model!),
    });
  }

  private syncFacing(): void {
    if (!this.rig || !this.anchor || !this.camera) return;

    const anchorPos = new THREE.Vector3();
    this.anchor.getWorldPosition(anchorPos);
    const dx = this.camera.position.x - anchorPos.x;
    const dz = this.camera.position.z - anchorPos.z;
    this.rig.rotation.y = Math.atan2(dx, dz) + VECNA_MODEL_YAW;
  }
}
