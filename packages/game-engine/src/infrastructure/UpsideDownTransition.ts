import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { UPSIDE_DOWN_TRANSITION_DURATION } from '../domain/Ball';

const DURATION = UPSIDE_DOWN_TRANSITION_DURATION;

type StartConfig = {
  ballMesh: THREE.Object3D;
  ballBody: RAPIER.RigidBody;
  portalPos: THREE.Vector3;
};

type CompleteHandler = () => void;

const _ballPos = new THREE.Vector3();
const _shake = new THREE.Vector3();

function easeIn(t: number): number {
  return t * t * t;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function makeTitleTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 52px Georgia, serif';
  ctx.fillStyle = 'rgba(180, 40, 60, 0.95)';
  ctx.shadowColor = 'rgba(255, 80, 120, 0.9)';
  ctx.shadowBlur = 28;
  ctx.fillText('THE UPSIDE', size / 2, size / 2 - 28);
  ctx.fillText('DOWN', size / 2, size / 2 + 32);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class UpsideDownTransition {
  private camera: THREE.Camera | null = null;
  private overlayRoot: THREE.Group | null = null;
  private voidPlane: THREE.Mesh | null = null;
  private voidMat: THREE.MeshBasicMaterial | null = null;
  private titleSprite: THREE.Sprite | null = null;
  private titleMat: THREE.SpriteMaterial | null = null;
  private sporePoints: THREE.Points | null = null;
  private sporeGeo: THREE.BufferGeometry | null = null;
  private sporeMat: THREE.PointsMaterial | null = null;
  private sporeVel: Float32Array | null = null;
  private ownedTextures: THREE.Texture[] = [];
  private active = false;
  private elapsed = 0;
  private ballMesh: THREE.Object3D | null = null;
  private ballBody: RAPIER.RigidBody | null = null;
  private portalPos = new THREE.Vector3();
  private cameraBase = new THREE.Vector3();
  private onComplete: CompleteHandler | null = null;

  setup(camera: THREE.Camera): void {
    this.dispose();
    this.camera = camera;

    this.overlayRoot = new THREE.Group();
    this.overlayRoot.renderOrder = 2000;
    camera.add(this.overlayRoot);

    this.voidMat = new THREE.MeshBasicMaterial({
      color: 0x0a0008,
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
    });
    this.voidPlane = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.4), this.voidMat);
    this.voidPlane.position.z = -0.42;
    this.voidPlane.renderOrder = 2001;
    this.overlayRoot.add(this.voidPlane);

    const titleTex = makeTitleTexture();
    this.ownedTextures.push(titleTex);
    this.titleMat = new THREE.SpriteMaterial({
      map: titleTex,
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.titleSprite = new THREE.Sprite(this.titleMat);
    this.titleSprite.center.set(0.5, 0.5);
    this.titleSprite.scale.set(0.55, 0.28, 1);
    this.titleSprite.position.z = -0.38;
    this.titleSprite.renderOrder = 2003;
    this.overlayRoot.add(this.titleSprite);

    const count = 280;
    const positions = new Float32Array(count * 3);
    this.sporeVel = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 2.4;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 1.8;
      positions[i * 3 + 2] = -0.35 - Math.random() * 0.08;
      this.sporeVel[i * 3] = (Math.random() - 0.5) * 0.35;
      this.sporeVel[i * 3 + 1] = (Math.random() - 0.5) * 0.35;
      this.sporeVel[i * 3 + 2] = (Math.random() - 0.5) * 0.05;
    }
    this.sporeGeo = new THREE.BufferGeometry();
    this.sporeGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.sporeMat = new THREE.PointsMaterial({
      color: 0xcc4466,
      size: 0.012,
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    this.sporePoints = new THREE.Points(this.sporeGeo, this.sporeMat);
    this.sporePoints.renderOrder = 2002;
    this.overlayRoot.add(this.sporePoints);
  }

  isActive(): boolean {
    return this.active;
  }

  start(config: StartConfig, onComplete: CompleteHandler): void {
    if (!this.camera || !this.overlayRoot) return;

    this.active = true;
    this.elapsed = 0;
    this.ballMesh = config.ballMesh;
    this.ballBody = config.ballBody;
    this.portalPos.copy(config.portalPos);
    this.onComplete = onComplete;
    this.camera.getWorldPosition(this.cameraBase);

    this.ballBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.ballBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }

  update(dt: number): void {
    if (!this.active || !this.camera || !this.ballMesh || !this.ballBody) return;

    this.elapsed += dt;
    const t = Math.min(1, this.elapsed / DURATION);

    const suckEnd = 0.28;
    const voidEnd = 0.72;
    const titleEnd = 0.88;

    const suckT = smoothstep(0, suckEnd, t);
    const voidT = smoothstep(suckEnd, voidEnd, t);
    const titleT = smoothstep(voidEnd - 0.08, titleEnd, t);
    const fadeOut = smoothstep(titleEnd, 1, t);

    _ballPos.copy(this.portalPos);
    _ballPos.y -= 0.008 * easeIn(suckT);
    const scale = THREE.MathUtils.lerp(1, 0.05, easeIn(suckT));
    this.ballMesh.position.lerp(_ballPos, 0.18 + suckT * 0.35);
    this.ballMesh.scale.setScalar(scale);
    this.ballBody.setTranslation(
      { x: this.ballMesh.position.x, y: this.ballMesh.position.y, z: this.ballMesh.position.z },
      true,
    );

    if (this.voidMat) {
      this.voidMat.opacity = voidT * (1 - fadeOut) * 0.92;
      const hue = 0.02 + Math.sin(this.elapsed * 8) * 0.01;
      this.voidMat.color.setHSL(hue, 0.65, 0.04 + voidT * 0.06);
    }

    if (this.sporeMat && this.sporeGeo && this.sporeVel) {
      this.sporeMat.opacity = voidT * (1 - fadeOut) * 0.85;
      const pos = this.sporeGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        pos.setX(i, pos.getX(i) + this.sporeVel[i * 3]! * dt * (1 + voidT * 2));
        pos.setY(i, pos.getY(i) + this.sporeVel[i * 3 + 1]! * dt * (1 + voidT * 2));
        if (Math.abs(pos.getX(i)) > 1.4) this.sporeVel[i * 3]! *= -1;
        if (Math.abs(pos.getY(i)) > 1.1) this.sporeVel[i * 3 + 1]! *= -1;
      }
      pos.needsUpdate = true;
    }

    if (this.titleMat && this.titleSprite) {
      this.titleMat.opacity = titleT * (1 - fadeOut);
      const pulse = 1 + Math.sin(this.elapsed * 12) * 0.04 * titleT;
      this.titleSprite.scale.set(0.55 * pulse, 0.28 * pulse, 1);
    }

    if (voidT > 0.05 && fadeOut < 0.95) {
      const shakeAmp = 0.004 * voidT * (1 - fadeOut);
      _shake.set(
        (Math.random() - 0.5) * shakeAmp,
        (Math.random() - 0.5) * shakeAmp,
        (Math.random() - 0.5) * shakeAmp * 0.3,
      );
      this.camera.position.copy(this.cameraBase).add(_shake);
    } else if (fadeOut >= 0.95) {
      this.camera.position.copy(this.cameraBase);
    }

    if (t >= 1) this.finish();
  }

  dispose(): void {
    this.active = false;
    this.elapsed = 0;
    this.ballMesh = null;
    this.ballBody = null;
    this.onComplete = null;

    if (this.voidPlane) this.voidPlane.geometry.dispose();
    this.voidMat?.dispose();
    this.titleMat?.dispose();
    this.sporeGeo?.dispose();
    this.sporeMat?.dispose();
    for (const tex of this.ownedTextures) tex.dispose();
    this.ownedTextures = [];

    if (this.overlayRoot && this.camera) {
      this.camera.remove(this.overlayRoot);
    }

    this.camera = null;
    this.overlayRoot = null;
    this.voidPlane = null;
    this.voidMat = null;
    this.titleSprite = null;
    this.titleMat = null;
    this.sporePoints = null;
    this.sporeGeo = null;
    this.sporeMat = null;
    this.sporeVel = null;
    this.onComplete = null;
  }

  private finish(): void {
    if (!this.active) return;

    this.active = false;
    this.elapsed = 0;

    if (this.ballMesh) {
      this.ballMesh.scale.setScalar(1);
      this.ballMesh.visible = true;
    }
    if (this.ballBody) {
      this.ballBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
      this.ballBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
    if (this.voidMat) this.voidMat.opacity = 0;
    if (this.sporeMat) this.sporeMat.opacity = 0;
    if (this.titleMat) this.titleMat.opacity = 0;
    if (this.camera) this.camera.position.copy(this.cameraBase);

    this.ballMesh = null;
    this.ballBody = null;
    const done = this.onComplete;
    this.onComplete = null;
    done?.();
  }
}
