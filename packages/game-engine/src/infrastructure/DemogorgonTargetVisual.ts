import * as THREE from 'three';
import { DEMOGORGON_TARGET } from '../domain/Ball';
import {
  DEMOGORGON_ANIM_HIT,
  DEMOGORGON_ANIM_IDLE,
  DEMOGORGON_ANIM_VICTORY,
  DEMOGORGON_MODEL_HEIGHT,
  DEMOGORGON_MODEL_URL,
  DEMOGORGON_MODEL_Y_OFFSET,
  DEMOGORGON_MODEL_YAW,
} from '../domain/DemogorgonConstants';
import { PLAYFIELD_TILT } from '../domain/PlayfieldGeometry';
import { createGltfLoader, prepareGltfMaterialsForDisplay } from './GltfDisplay';

const _box = new THREE.Box3();
const _center = new THREE.Vector3();
const _size = new THREE.Vector3();

type MaterialSnapshot = {
  material: THREE.MeshStandardMaterial;
  emissiveIntensity: number;
};

function findAnimationClip(clips: THREE.AnimationClip[], token: string): THREE.AnimationClip | null {
  const exact = clips.find((clip) => clip.name.endsWith(`|${token}`));
  if (exact) return exact;
  return clips.find((clip) => clip.name.includes(token)) ?? null;
}

export class DemogorgonTargetVisual {
  private group: THREE.Group | null = null;
  private modelRoot: THREE.Object3D | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private idleAction: THREE.AnimationAction | null = null;
  private hitAction: THREE.AnimationAction | null = null;
  private victoryAction: THREE.AnimationAction | null = null;
  private materials: MaterialSnapshot[] = [];
  private targetLight: THREE.PointLight | null = null;
  private victoryBurst: THREE.Mesh | null = null;
  private victoryBurstMat: THREE.MeshBasicMaterial | null = null;
  private ownedGeos: THREE.BufferGeometry[] = [];
  private ownedMats: THREE.Material[] = [];
  private modelReady = false;
  private visible = false;

  mount(root: THREE.Object3D): void {
    this.dispose();

    this.group = new THREE.Group();
    this.group.position.set(
      DEMOGORGON_TARGET.x,
      DEMOGORGON_TARGET.y + DEMOGORGON_MODEL_Y_OFFSET,
      DEMOGORGON_TARGET.z,
    );
    this.group.rotation.x = PLAYFIELD_TILT;
    this.group.visible = false;
    root.add(this.group);

    this.targetLight = new THREE.PointLight(0xff2244, 0, 0.16, 2);
    this.targetLight.position.y = 0.028;
    this.group.add(this.targetLight);

    const burstGeo = new THREE.RingGeometry(0.02, 0.038, 24);
    this.victoryBurstMat = new THREE.MeshBasicMaterial({
      color: 0xffee55,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    this.victoryBurst = new THREE.Mesh(burstGeo, this.victoryBurstMat);
    this.victoryBurst.rotation.x = -Math.PI / 2;
    this.group.add(this.victoryBurst);
    this.ownedGeos.push(burstGeo);
    this.ownedMats.push(this.victoryBurstMat);

    const loader = createGltfLoader();
    loader.load(
      DEMOGORGON_MODEL_URL,
      (gltf) => {
        if (!this.group) return;
        this.modelRoot = gltf.scene;
        prepareGltfMaterialsForDisplay(this.modelRoot);
        this.normalizeModel(this.modelRoot);
        this.modelRoot.rotation.y = DEMOGORGON_MODEL_YAW;
        this.group.add(this.modelRoot);
        this.captureMaterials(this.modelRoot);
        this.setupAnimations(gltf.animations);
        this.modelReady = true;
        if (this.visible) this.playIdle();
      },
      undefined,
      () => {
        this.modelReady = false;
      },
    );
  }

  isReady(): boolean {
    return this.modelReady;
  }

  show(): void {
    this.visible = true;
    if (this.group) this.group.visible = true;
    this.playIdle();
  }

  hide(): void {
    this.visible = false;
    if (this.group) this.group.visible = false;
    this.reset();
  }

  update(dt: number): void {
    this.mixer?.update(dt);
  }

  playHit(): void {
    if (!this.mixer || !this.hitAction) return;

    this.hitAction.reset();
    this.hitAction.setEffectiveTimeScale(1.15);
    this.hitAction.setEffectiveWeight(1);
    this.hitAction.play();

    if (this.idleAction) {
      this.idleAction.crossFadeTo(this.hitAction, 0.08, false);
    }

    if (this.targetLight) this.targetLight.intensity = 1.1;
  }

  playVictory(): void {
    if (!this.mixer || !this.victoryAction) return;

    this.victoryAction.reset();
    this.victoryAction.setEffectiveTimeScale(1);
    this.victoryAction.setEffectiveWeight(1);
    this.victoryAction.play();

    if (this.idleAction?.isRunning()) {
      this.idleAction.crossFadeTo(this.victoryAction, 0.1, false);
    } else if (this.hitAction?.isRunning()) {
      this.hitAction.crossFadeTo(this.victoryAction, 0.1, false);
    }
  }

  updatePulse(pulseT: number, hitFlash: number, hitFlashDuration: number, active: boolean): void {
    if (!this.group?.visible || !active) return;

    const hitBoost = hitFlash > 0 ? 1.5 : 1;
    const pulse = (0.7 + Math.sin(pulseT * 6) * 0.2) * hitBoost;

    if (this.targetLight && hitFlash <= 0) {
      this.targetLight.intensity = 0.38 * pulse;
    }

    for (const entry of this.materials) {
      entry.material.emissive.setHex(0x2a1010);
      entry.material.emissiveIntensity = 0.28 * pulse;
    }

    if (hitFlash <= 0) {
      this.group.rotation.z = Math.sin(pulseT * 2.5) * 0.04;
    }
  }

  applyElevenShake(angle: number): void {
    if (this.group) this.group.rotation.z = angle;
  }

  updateVictory(t: number, easeOut: (n: number) => number, easeIn: (n: number) => number): void {
    const pop = easeOut(t);
    const fade = easeIn(t);

    if (this.group) {
      this.group.scale.setScalar(1 + pop * 0.35);
    }

    for (const entry of this.materials) {
      entry.material.transparent = true;
      entry.material.opacity = 1 - fade;
      entry.material.emissive.setHex(0xffdd44);
      entry.material.emissiveIntensity = 3.5 * (1 - fade * 0.6);
    }

    if (this.targetLight) {
      this.targetLight.color.setHex(0xffee88);
      this.targetLight.intensity = 1.6 * (1 - fade);
    }

    if (this.victoryBurst && this.victoryBurstMat) {
      const burstT = Math.min(1, t * 1.35);
      const burstFade = easeIn(burstT);
      this.victoryBurst.scale.setScalar(1 + burstFade * 4.5);
      this.victoryBurstMat.opacity = (1 - burstFade) * 0.95;
    }
  }

  reset(): void {
    this.idleAction?.stop();
    this.hitAction?.stop();
    this.victoryAction?.stop();
    this.mixer?.stopAllAction();

    if (this.group) {
      this.group.scale.setScalar(1);
      this.group.rotation.z = 0;
    }

    for (const entry of this.materials) {
      entry.material.transparent = false;
      entry.material.opacity = 1;
      entry.material.emissive.setHex(0x000000);
      entry.material.emissiveIntensity = entry.emissiveIntensity;
    }

    if (this.targetLight) {
      this.targetLight.color.setHex(0xff2244);
      this.targetLight.intensity = 0.38;
    }

    if (this.victoryBurst) this.victoryBurst.scale.setScalar(1);
    if (this.victoryBurstMat) this.victoryBurstMat.opacity = 0;
  }

  dispose(): void {
    this.mixer?.stopAllAction();
    this.mixer = null;
    this.idleAction = null;
    this.hitAction = null;
    this.victoryAction = null;

    if (this.modelRoot) {
      this.modelRoot.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        obj.geometry?.dispose();
        const mat = obj.material;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat?.dispose();
      });
    }

    if (this.group) this.group.parent?.remove(this.group);
    for (const g of this.ownedGeos) g.dispose();
    for (const m of this.ownedMats) m.dispose();

    this.group = null;
    this.modelRoot = null;
    this.materials = [];
    this.targetLight = null;
    this.victoryBurst = null;
    this.victoryBurstMat = null;
    this.ownedGeos = [];
    this.ownedMats = [];
    this.modelReady = false;
    this.visible = false;
  }

  private setupAnimations(clips: THREE.AnimationClip[]): void {
    if (!this.modelRoot) return;

    this.mixer = new THREE.AnimationMixer(this.modelRoot);

    const idleClip = findAnimationClip(clips, DEMOGORGON_ANIM_IDLE);
    const hitClip = findAnimationClip(clips, DEMOGORGON_ANIM_HIT);
    const victoryClip = findAnimationClip(clips, DEMOGORGON_ANIM_VICTORY);

    if (idleClip) {
      this.idleAction = this.mixer.clipAction(idleClip);
      this.idleAction.setLoop(THREE.LoopRepeat, Infinity);
    }

    if (hitClip) {
      this.hitAction = this.mixer.clipAction(hitClip);
      this.hitAction.setLoop(THREE.LoopOnce, 1);
      this.hitAction.clampWhenFinished = false;
    }

    if (victoryClip) {
      this.victoryAction = this.mixer.clipAction(victoryClip);
      this.victoryAction.setLoop(THREE.LoopOnce, 1);
      this.victoryAction.clampWhenFinished = true;
    }

    this.mixer.addEventListener('finished', (event) => {
      if (event.action === this.hitAction && this.idleAction) {
        this.idleAction.reset().fadeIn(0.12).play();
      }
    });
  }

  private playIdle(): void {
    if (!this.idleAction) return;
    this.idleAction.reset().fadeIn(0.15).play();
  }

  private normalizeModel(model: THREE.Object3D): void {
    _box.setFromObject(model);
    _box.getCenter(_center);
    _box.getSize(_size);
    const height = Math.max(_size.y, 1e-6);
    const scale = DEMOGORGON_MODEL_HEIGHT / height;
    model.scale.setScalar(scale);
    model.position.set(-_center.x * scale, -_box.min.y * scale, -_center.z * scale);
  }

  private captureMaterials(root: THREE.Object3D): void {
    this.materials = [];
    root.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of mats) {
        if (!(mat instanceof THREE.MeshStandardMaterial)) continue;
        this.materials.push({ material: mat, emissiveIntensity: mat.emissiveIntensity });
      }
    });
  }
}
