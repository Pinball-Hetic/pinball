import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { GameEvent } from '../domain/GameEvents';
import {
  DEMOGORGON_TARGET_HITS,
  PORTAL_COVER_RADIUS,
  PORTAL_UPSIDE_DOWN,
} from '../domain/Ball';
import { findObjectByNormalizedName } from './GltfNodeNames';

const PLAYFIELD_TILT = Math.atan2(0.110, 0.970);
const REVEAL_DURATION = 0.55;

type SetupConfig = {
  root: THREE.Object3D;
  world: RAPIER.World;
};

function playfieldMaterialFromTable(root: THREE.Object3D): THREE.MeshStandardMaterial {
  const table = findObjectByNormalizedName(root, 'table.005', 'table005');
  if (table instanceof THREE.Mesh) {
    const src = table.material;
    const mat = (Array.isArray(src) ? src[0] : src) as THREE.Material;
    if (mat instanceof THREE.MeshStandardMaterial) return mat.clone();
  }
  return new THREE.MeshStandardMaterial({
    color: 0xff5010,
    metalness: 0.19,
    roughness: 0.45,
  });
}

export class UpsideDownPortal {
  private cover: THREE.Mesh | null = null;
  private coverMat: THREE.MeshStandardMaterial | null = null;
  private coverBody: RAPIER.RigidBody | null = null;
  private coverCollider: RAPIER.Collider | null = null;
  private world: RAPIER.World | null = null;
  private anchorPos = new THREE.Vector3();
  private revealed = false;
  private revealing = false;
  private revealT = 0;
  private baseY = 0;

  setup(config: SetupConfig): void {
    this.dispose();
    this.world = config.world;

    config.root.updateMatrixWorld(true);

    const anchor = findObjectByNormalizedName(config.root, 'portal_upsidedown');
    if (anchor) {
      anchor.getWorldPosition(this.anchorPos);
    } else {
      this.anchorPos.set(PORTAL_UPSIDE_DOWN.x, PORTAL_UPSIDE_DOWN.y, PORTAL_UPSIDE_DOWN.z);
    }
    this.baseY = this.anchorPos.y + 0.0015;

    this.coverMat = playfieldMaterialFromTable(config.root);
    const geo = new THREE.CylinderGeometry(PORTAL_COVER_RADIUS, PORTAL_COVER_RADIUS, 0.004, 32);
    this.cover = new THREE.Mesh(geo, this.coverMat);
    this.cover.position.copy(this.anchorPos);
    this.cover.position.y = this.baseY;
    this.cover.rotation.x = -PLAYFIELD_TILT;
    this.cover.renderOrder = 2;
    config.root.add(this.cover);

    const qx = Math.sin(PLAYFIELD_TILT / 2);
    const qw = Math.cos(PLAYFIELD_TILT / 2);
    this.coverBody = config.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed()
        .setTranslation(this.anchorPos.x, this.baseY, this.anchorPos.z)
        .setRotation({ x: qx, y: 0, z: 0, w: qw }),
    );
    this.coverCollider = config.world.createCollider(
      RAPIER.ColliderDesc.cylinder(0.002, PORTAL_COVER_RADIUS)
        .setRestitution(0.35)
        .setFriction(0.15),
      this.coverBody,
    );
  }

  onGameEvent(event: GameEvent): void {
    if (this.revealed || this.revealing) return;
    if (event.type !== 'DEMOGORGON_TARGET_HIT') return;
    if (event.hitCount < DEMOGORGON_TARGET_HITS) return;
    this.beginReveal();
  }

  update(dt: number): void {
    if (!this.revealing || !this.cover || !this.coverMat) return;

    this.revealT += dt;
    const t = Math.min(1, this.revealT / REVEAL_DURATION);
    const fade = t * t;
    this.coverMat.transparent = true;
    this.coverMat.opacity = 1 - fade;
    this.cover.scale.setScalar(1 - fade * 0.35);
    this.cover.position.y += dt * 0.012;

    if (t >= 1) this.finishReveal();
  }

  reset(): void {
    if (!this.world || !this.cover || !this.coverMat) return;
    if (!this.revealed && !this.revealing) return;

    this.revealed = false;
    this.revealing = false;
    this.revealT = 0;

    this.cover.visible = true;
    this.cover.scale.setScalar(1);
    this.cover.position.copy(this.anchorPos);
    this.cover.position.y = this.baseY;
    this.coverMat.transparent = false;
    this.coverMat.opacity = 1;

    this.removePhysicsCover();

    const qx = Math.sin(PLAYFIELD_TILT / 2);
    const qw = Math.cos(PLAYFIELD_TILT / 2);
    this.coverBody = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed()
        .setTranslation(this.anchorPos.x, this.baseY, this.anchorPos.z)
        .setRotation({ x: qx, y: 0, z: 0, w: qw }),
    );
    this.coverCollider = this.world.createCollider(
      RAPIER.ColliderDesc.cylinder(0.002, PORTAL_COVER_RADIUS)
        .setRestitution(0.35)
        .setFriction(0.15),
      this.coverBody,
    );
  }

  dispose(): void {
    if (this.coverCollider && this.world) {
      this.world.removeCollider(this.coverCollider, true);
    }
    if (this.coverBody && this.world) {
      this.world.removeRigidBody(this.coverBody);
    }
    if (this.cover) {
      this.cover.geometry.dispose();
      this.cover.parent?.remove(this.cover);
    }
    this.coverMat?.dispose();

    this.cover = null;
    this.coverMat = null;
    this.coverBody = null;
    this.coverCollider = null;
    this.world = null;
    this.revealed = false;
    this.revealing = false;
    this.revealT = 0;
  }

  private beginReveal(): void {
    this.revealing = true;
    this.revealT = 0;
    this.removePhysicsCover();
  }

  private finishReveal(): void {
    this.revealing = false;
    this.revealed = true;
    if (this.cover) this.cover.visible = false;
  }

  private removePhysicsCover(): void {
    if (this.coverCollider && this.world) {
      this.world.removeCollider(this.coverCollider, true);
      this.coverCollider = null;
    }
    if (this.coverBody && this.world) {
      this.world.removeRigidBody(this.coverBody);
      this.coverBody = null;
    }
  }
}
