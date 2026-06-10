import * as THREE from 'three';
import { DEMOGORGON_TARGET } from '../domain/Ball';
import {
  DEMOGORGON_ANIM_HIT,
  DEMOGORGON_ANIM_IDLE,
  DEMOGORGON_ANIM_VICTORY,
  DEMOGORGON_ANIM_VICTORY_FALLBACK,
  DEMOGORGON_MODEL_HEIGHT,
  DEMOGORGON_MODEL_URL,
  DEMOGORGON_MODEL_FOOT_LIFT,
  DEMOGORGON_MODEL_YAW,
} from '../domain/DemogorgonConstants';
import { PLAYFIELD_TILT, surfaceYAtZ } from '../domain/PlayfieldGeometry';
import { createGltfLoader } from './GltfDisplay';

type AnimState = 'idle' | 'hit' | 'victory';

function findAnimationClip(clips: THREE.AnimationClip[], token: string): THREE.AnimationClip | undefined {
  const needle = token.toLowerCase();
  return clips.find((clip) => {
    const name = clip.name.toLowerCase();
    return name === needle || name.endsWith(`|${needle}`) || name.endsWith(needle);
  });
}

export class DemogorgonTargetVisual {
  private anchor: THREE.Group | null = null;
  private modelRoot: THREE.Object3D | null = null;
  private camera: THREE.Camera | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private idleAction: THREE.AnimationAction | null = null;
  private hitAction: THREE.AnimationAction | null = null;
  private victoryAction: THREE.AnimationAction | null = null;
  private animState: AnimState = 'idle';
  private pulseT = 0;
  private hitFlash = 0;
  private rig: THREE.Group | null = null;
  private offset: THREE.Group | null = null;
  private pendingFit: THREE.Object3D | null = null;
  private victoryBurst: THREE.Mesh | null = null;
  private victoryBurstMat: THREE.MeshBasicMaterial | null = null;
  private glowLight: THREE.PointLight | null = null;
  private ownedGeos: THREE.BufferGeometry[] = [];
  private ownedMats: THREE.Material[] = [];

  mount(parent: THREE.Object3D, camera: THREE.Camera): void {
    this.dispose();
    this.camera = camera;

    const anchor = new THREE.Group();
    anchor.position.set(
      DEMOGORGON_TARGET.x,
      surfaceYAtZ(DEMOGORGON_TARGET.z) + DEMOGORGON_MODEL_FOOT_LIFT,
      DEMOGORGON_TARGET.z,
    );
    anchor.rotation.x = PLAYFIELD_TILT;
    anchor.visible = false;
    parent.add(anchor);
    this.anchor = anchor;

    const rig = new THREE.Group();
    anchor.add(rig);
    this.rig = rig;

    this.glowLight = new THREE.PointLight(0xff5533, 0, 0.38, 2);
    this.glowLight.position.y = 0.03;
    anchor.add(this.glowLight);

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
    this.victoryBurst.position.y = 0.002;
    anchor.add(this.victoryBurst);
    this.ownedGeos.push(burstGeo);
    this.ownedMats.push(this.victoryBurstMat);

    const loader = createGltfLoader();
    loader.load(
      DEMOGORGON_MODEL_URL,
      (gltf) => {
        if (!this.anchor) return;
        const model = gltf.scene;
        this.fitModel(model, gltf.animations);
        this.modelRoot = model;
        this.syncFacing();
        if (this.anchor.visible) this.playIdle();
      },
      undefined,
      (err) => { console.error('[Demogorgon] load error:', err); },
    );
  }

  show(): void {
    if (this.anchor) this.anchor.visible = true;
    this.playIdle();
  }

  hide(): void {
    if (this.anchor) {
      this.anchor.visible = false;
      this.anchor.scale.setScalar(1);
      this.anchor.rotation.z = 0;
    }
    this.animState = 'idle';
    this.hitFlash = 0;
    this.resetVictoryBurst();
    if (this.glowLight) this.glowLight.intensity = 0;
  }

  playHit(): void {
    if (!this.mixer || !this.hitAction || !this.idleAction) return;
    this.animState = 'hit';
    this.hitFlash = 0.18;
    this.hitAction.reset();
    this.hitAction.setLoop(THREE.LoopOnce, 1);
    this.hitAction.clampWhenFinished = true;
    this.hitAction.crossFadeFrom(this.idleAction, 0.08, true).play();
  }

  playVictory(): void {
    if (!this.mixer || !this.victoryAction || !this.idleAction) {
      this.playIdle();
      return;
    }
    this.animState = 'victory';
    this.victoryAction.reset();
    this.victoryAction.setLoop(THREE.LoopOnce, 1);
    this.victoryAction.clampWhenFinished = true;
    const from = this.hitAction?.isRunning() ? this.hitAction : this.idleAction;
    this.victoryAction.crossFadeFrom(from, 0.12, true).play();
  }

  update(dt: number): void {
    if (this.pendingFit) this.tryApplyFit();
    if (!this.anchor?.visible) return;

    this.mixer?.update(dt);
    this.syncFacing();

    if (this.hitFlash > 0) this.hitFlash = Math.max(0, this.hitFlash - dt);

    this.pulseT += dt;
    const hitBoost = this.hitFlash > 0 ? 1.8 : 1;
    const pulse = (0.75 + Math.sin(this.pulseT * 8) * 0.25) * hitBoost;
    if (this.glowLight) this.glowLight.intensity = 0.42 * pulse;

    const scale = 1 + (this.hitFlash / 0.18) * 0.2;
    this.anchor.scale.setScalar(scale);
  }

  updateVictoryBurst(t: number): void {
    if (!this.victoryBurst || !this.victoryBurstMat) return;
    const burstT = Math.min(1, t * 1.35);
    const burstFade = burstT * burstT;
    this.victoryBurst.scale.setScalar(1 + burstFade * 4.5);
    this.victoryBurstMat.opacity = (1 - burstFade) * 0.95;
    if (this.glowLight) this.glowLight.intensity = 1.6 * (1 - burstFade);
  }

  applyAssistShake(t: number, assistT: number): void {
    if (!this.anchor || t >= 0.45) return;
    this.anchor.rotation.z = Math.sin(assistT * 32) * 0.1 * (1 - t / 0.45);
  }

  applyVictoryMotion(t: number): void {
    if (!this.anchor) return;
    const pop = 1 - Math.pow(1 - t, 3);
    this.anchor.scale.setScalar(1 + pop * 0.35);
    this.anchor.rotation.z = pop * Math.PI * 0.5;
  }

  resetMotion(): void {
    if (!this.anchor) return;
    this.anchor.scale.setScalar(1);
    this.anchor.rotation.z = 0;
    this.resetVictoryBurst();
  }

  dispose(): void {
    if (this.anchor) this.anchor.parent?.remove(this.anchor);
    for (const g of this.ownedGeos) g.dispose();
    for (const m of this.ownedMats) m.dispose();
    this.ownedGeos = [];
    this.ownedMats = [];
    this.anchor = null;
    this.modelRoot = null;
    this.camera = null;
    this.mixer = null;
    this.idleAction = null;
    this.hitAction = null;
    this.victoryAction = null;
    this.victoryBurst = null;
    this.victoryBurstMat = null;
    this.glowLight = null;
    this.rig = null;
    this.offset = null;
    this.pendingFit = null;
    this.animState = 'idle';
    this.hitFlash = 0;
    this.pulseT = 0;
  }

  private syncFacing(): void {
    if (!this.rig || !this.anchor || !this.camera) return;

    const anchorPos = new THREE.Vector3();
    this.anchor.getWorldPosition(anchorPos);
    const dx = this.camera.position.x - anchorPos.x;
    const dz = this.camera.position.z - anchorPos.z;
    this.rig.rotation.y = Math.atan2(dx, dz) + DEMOGORGON_MODEL_YAW;
  }

  private tryApplyFit(): void {
    const model = this.pendingFit;
    if (!model || !this.rig || !this.offset || !this.anchor) return;

    model.updateWorldMatrix(true, true);

    const box = new THREE.Box3();
    const v = new THREE.Vector3();
    model.traverse((obj) => {
      if (obj instanceof THREE.SkinnedMesh) {
        const pos = obj.geometry.attributes.position;
        const hasSkin = obj.geometry.attributes.skinIndex && obj.geometry.attributes.skinWeight;
        if (!pos) return;
        obj.skeleton.update();
        const step = Math.max(1, Math.floor(pos.count / 2000));
        for (let i = 0; i < pos.count; i += step) {
          v.fromBufferAttribute(pos, i);
          if (hasSkin) obj.applyBoneTransform(i, v);
          obj.localToWorld(v);
          this.anchor!.worldToLocal(v);
          box.expandByPoint(v);
        }
      }
    });
    if (box.isEmpty()) return;

    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    if (Math.max(Math.abs(center.x), Math.abs(center.y), Math.abs(center.z)) > 4) return;

    const height = Math.max(size.y, 1e-4);
    this.offset.position.set(-center.x, -box.min.y + 0.006, -center.z);
    this.rig.scale.setScalar(DEMOGORGON_MODEL_HEIGHT / height);
    this.pendingFit = null;
  }

  private fitModel(model: THREE.Object3D, clips: THREE.AnimationClip[]): void {
    if (!this.anchor || !this.rig) return;

    this.rig.position.set(0, 0, 0);
    this.rig.scale.set(1, 1, 1);
    this.rig.rotation.set(0, 0, 0);
    this.anchor.scale.set(1, 1, 1);
    const offset = new THREE.Group();
    this.offset = offset;
    this.rig.add(offset);
    offset.add(model);
    this.pendingFit = model;

    model.traverse((obj) => {
      obj.frustumCulled = false;
      if (obj instanceof THREE.SkinnedMesh) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const mat of mats) {
          if (mat instanceof THREE.MeshStandardMaterial) {
            if (mat.map) {
              mat.emissiveMap = mat.map;
              mat.emissive.setHex(0xffffff);
            } else {
              mat.emissive.copy(mat.color);
            }
            mat.emissiveIntensity = 0.55;
            mat.needsUpdate = true;
          }
        }
      }
    });

    this.mixer = new THREE.AnimationMixer(model);
    const idleClip = findAnimationClip(clips, DEMOGORGON_ANIM_IDLE);
    const hitClip = findAnimationClip(clips, DEMOGORGON_ANIM_HIT);
    const victoryClip =
      findAnimationClip(clips, DEMOGORGON_ANIM_VICTORY) ??
      findAnimationClip(clips, DEMOGORGON_ANIM_VICTORY_FALLBACK);

    if (idleClip) {
      this.idleAction = this.mixer.clipAction(idleClip);
      this.idleAction.setLoop(THREE.LoopRepeat, Infinity);
    }
    if (hitClip) {
      this.hitAction = this.mixer.clipAction(hitClip);
      this.hitAction.setLoop(THREE.LoopOnce, 1);
      this.hitAction.clampWhenFinished = true;
    }
    if (victoryClip) {
      this.victoryAction = this.mixer.clipAction(victoryClip);
      this.victoryAction.setLoop(THREE.LoopOnce, 1);
      this.victoryAction.clampWhenFinished = true;
    }

    this.mixer.addEventListener('finished', (event) => {
      if (event.action === this.hitAction && this.animState === 'hit') {
        this.playIdle();
      }
    });

    this.playIdle();
  }

  private playIdle(): void {
    if (!this.idleAction) return;
    this.animState = 'idle';
    this.idleAction.reset();
    this.idleAction.setLoop(THREE.LoopRepeat, Infinity);
    this.idleAction.fadeIn(0.12).play();
  }

  private resetVictoryBurst(): void {
    if (this.victoryBurst) this.victoryBurst.scale.setScalar(1);
    if (this.victoryBurstMat) this.victoryBurstMat.opacity = 0;
  }
}
