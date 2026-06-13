import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { GameEvent } from '@pinball/game-engine';
import { getBossDefinition } from '../bosses';
import {
  PORTAL_COVER_RADIUS,
  PORTAL_HOLE_RADIUS,
  PORTAL_MAGNET_RADIUS,
  PORTAL_MAGNET_STRENGTH,
  PORTAL_SENSOR_RADIUS,
} from '@pinball/game-engine';
import { layout } from '../layout';
import { PLAYFIELD_TILT, surfaceYAtZ } from '@pinball/game-engine';
import {
  UPSIDE_DOWN_PORTAL_ACCENT_PULSE_SPEED,
  UPSIDE_DOWN_PORTAL_ANCHOR_NAMES,
  UPSIDE_DOWN_PORTAL_COVER_LIFT,
  UPSIDE_DOWN_PORTAL_OPEN_DURATION,
  UPSIDE_DOWN_PORTAL_OPEN_POLISH,
  UPSIDE_DOWN_PORTAL_PULSE_SPEED,
  UPSIDE_DOWN_PORTAL_REVEAL_DELAY,
  UPSIDE_DOWN_PORTAL_VINE_COUNT,
} from './UpsideDownConstants';
import { clonePlayfieldSurfaceMaterial, findObjectByNormalizedName } from '@pinball/game-engine';
import { GlowSprite, easeInOut } from '@pinball/game-engine';

type SetupConfig = {
  root: THREE.Object3D;
  world: RAPIER.World;
  colliderMap: Map<number, string>;
  onOpenChange?: (open: boolean) => void;
};

type PortalParticle = {
  mesh: THREE.Mesh;
  angle: number;
  radius: number;
  speed: number;
  yOffset: number;
};

type PortalVine = {
  mesh: THREE.Mesh;
  phase: number;
};

const _vinePoint = new THREE.Vector3();
const _portalAnchor = new THREE.Vector3();

function resolvePortalAnchor(root: THREE.Object3D): THREE.Vector3 {
  for (const name of UPSIDE_DOWN_PORTAL_ANCHOR_NAMES) {
    const node = findObjectByNormalizedName(root, name);
    if (node) {
      node.getWorldPosition(_portalAnchor);
      return _portalAnchor.clone();
    }
  }
  return _portalAnchor.set(
    layout.sensors.portal.x,
    layout.sensors.portal.y,
    layout.sensors.portal.z,
  );
}

function portalCoverSurfaceY(z: number, anchorY: number): number {
  return Math.max(surfaceYAtZ(z) + UPSIDE_DOWN_PORTAL_COVER_LIFT, anchorY);
}

export class UpsideDownPortal {
  private cover: THREE.Mesh | null = null;
  private coverMat: THREE.MeshStandardMaterial | null = null;
  private coverBody: RAPIER.RigidBody | null = null;
  private coverCollider: RAPIER.Collider | null = null;
  private sensorBody: RAPIER.RigidBody | null = null;
  private sensorCollider: RAPIER.Collider | null = null;
  private world: RAPIER.World | null = null;
  private colliderMap: Map<number, string> | null = null;
  private onOpenChange: ((open: boolean) => void) | null = null;
  private portalGroup: THREE.Group | null = null;
  private outerRingMat: THREE.MeshStandardMaterial | null = null;
  private innerRingMat: THREE.MeshStandardMaterial | null = null;
  private coreMat: THREE.MeshBasicMaterial | null = null;
  private vortexMat: THREE.MeshBasicMaterial | null = null;
  private rimGlow: GlowSprite | null = null;
  private coreLight: THREE.PointLight | null = null; // seule PointLight conservée
  private accentGlow: GlowSprite | null = null;
  private vineMat: THREE.MeshStandardMaterial | null = null;
  private vines: PortalVine[] = [];
  private particles: PortalParticle[] = [];
  private ownedGeos: THREE.BufferGeometry[] = [];
  private ownedMats: THREE.Material[] = [];
  private anchorPos = new THREE.Vector3();
  private alternateWorldActive = false;
  private revealed = false;
  private pendingReveal = false;
  private pendingT = 0;
  private opening = false;
  private revealing = false;
  private revealT = 0;
  private pulseT = 0;
  private baseY = 0;
  private suckBoost = 0;

  setup(config: SetupConfig): void {
    this.dispose();
    this.world = config.world;
    this.colliderMap = config.colliderMap;
    this.onOpenChange = config.onOpenChange ?? null;

    config.root.updateMatrixWorld(true);

    this.anchorPos.copy(resolvePortalAnchor(config.root));
    this.baseY = portalCoverSurfaceY(this.anchorPos.z, this.anchorPos.y);

    this.coverMat = clonePlayfieldSurfaceMaterial(config.root);
    this.coverMat.polygonOffset = true;
    this.coverMat.polygonOffsetFactor = -2;
    this.coverMat.polygonOffsetUnits = -2;
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

    this.portalGroup = this.buildPortalVisuals();
    this.portalGroup.position.copy(this.anchorPos);
    this.portalGroup.position.y = this.baseY - 0.0005;
    this.portalGroup.rotation.x = -PLAYFIELD_TILT;
    this.portalGroup.visible = false;
    config.root.add(this.portalGroup);
  }

  isOpen(): boolean {
    return this.revealed;
  }

  getAnchorPosition(): THREE.Vector3 {
    return this.anchorPos.clone();
  }

  setSuckBoost(boost: number): void {
    this.suckBoost = boost;
  }

  setUpsideDownActive(active: boolean): void {
    this.alternateWorldActive = active;
  }

  onGameEvent(event: GameEvent): void {
    if (this.revealed || this.revealing || this.opening || this.pendingReveal) return;
    if (event.type !== 'BOSS_TARGET_HIT') return;
    const def = getBossDefinition(event.bossId);
    if (event.hitCount < def.targetHits) return;

    if (def.unlocksPortal && !this.alternateWorldActive) {
      this.scheduleReveal();
      return;
    }
    if (def.unlocksReturnPortal && this.alternateWorldActive) {
      this.beginReveal();
    }
  }

  applyMagnet(body: RAPIER.RigidBody): void {
    if (!this.revealed) return;

    const p = body.translation();
    const dx = this.anchorPos.x - p.x;
    const dz = this.anchorPos.z - p.z;
    const horiz = Math.sqrt(dx * dx + dz * dz);
    if (horiz > PORTAL_MAGNET_RADIUS || horiz < 0.0005) return;

    const t = 1 - horiz / PORTAL_MAGNET_RADIUS;
    const pull = PORTAL_MAGNET_STRENGTH * t * t * (1 + this.suckBoost);
    body.applyImpulse(
      {
        x: (dx / horiz) * pull,
        y: -pull * (0.42 + t * 0.35),
        z: (dz / horiz) * pull,
      },
      true,
    );
  }

  update(dt: number): void {
    this.pulseT += dt;

    if (this.pendingReveal) {
      this.pendingT += dt;
      if (this.pendingT >= UPSIDE_DOWN_PORTAL_REVEAL_DELAY) {
        this.pendingReveal = false;
        this.startOpening();
      }
    }

    if (this.opening) {
      this.revealT += dt;
      const rawT = Math.min(1, this.revealT / UPSIDE_DOWN_PORTAL_OPEN_DURATION);
      this.applyOpenProgress(easeInOut(rawT));
      if (rawT >= 1) this.finishOpening();
    }

    if (this.revealing && this.portalGroup) {
      this.revealT += dt;
      const t = Math.min(1, this.revealT / UPSIDE_DOWN_PORTAL_OPEN_POLISH);
      const ease = 1 - Math.pow(1 - t, 3);
      this.portalGroup.scale.setScalar(0.35 + ease * 0.65);
      if (t >= 1) this.revealing = false;
    }

    if (!this.revealed || !this.portalGroup) return;

    const pulse = 0.65 + Math.sin(this.pulseT * UPSIDE_DOWN_PORTAL_PULSE_SPEED) * 0.35;
    const fast = this.pulseT * 4.2;

    if (this.outerRingMat) {
      this.outerRingMat.emissiveIntensity = 1.8 * pulse * (1 + this.suckBoost);
    }
    if (this.innerRingMat) {
      this.innerRingMat.emissiveIntensity = 2.4 * pulse * (1 + this.suckBoost * 0.6);
    }
    if (this.coreMat) {
      this.coreMat.opacity = 0.55 + pulse * 0.35;
    }
    if (this.vortexMat) {
      this.vortexMat.opacity = 0.25 + pulse * 0.2;
    }
    if (this.rimGlow) {
      this.rimGlow.set(Math.min(1, 0.55 * pulse * (1 + this.suckBoost)), 0.9 + pulse * 0.4);
    }
    if (this.coreLight) {
      this.coreLight.intensity = 0.85 * pulse * (1 + this.suckBoost * 1.2);
    }
    if (this.accentGlow) {
      const accentPulse = 0.55 + Math.sin(this.pulseT * UPSIDE_DOWN_PORTAL_ACCENT_PULSE_SPEED) * 0.45;
      this.accentGlow.set(Math.min(1, 0.48 * accentPulse * (1 + this.suckBoost * 0.55)), 1);
    }
    if (this.vineMat) {
      this.vineMat.emissiveIntensity = 0.22 + pulse * 0.28 * (1 + this.suckBoost * 0.4);
    }

    for (const vine of this.vines) {
      const sway = Math.sin(this.pulseT * 1.6 + vine.phase) * 0.0009;
      vine.mesh.position.y = sway;
      vine.mesh.rotation.z = Math.sin(this.pulseT * 1.1 + vine.phase * 1.3) * 0.06;
    }

    this.portalGroup.children.forEach((child, i) => {
      if (child instanceof THREE.Mesh && child.geometry.type === 'TorusGeometry') {
        child.rotation.z = fast * (i % 2 === 0 ? 1 : -1) * 0.15;
      }
    });

    for (const part of this.particles) {
      part.angle += part.speed * dt * (1 + this.suckBoost);
      const r = part.radius * (0.92 + Math.sin(this.pulseT * 3 + part.angle) * 0.08);
      part.mesh.position.set(
        Math.cos(part.angle) * r,
        part.yOffset + Math.sin(this.pulseT * 5 + part.angle) * 0.002,
        Math.sin(part.angle) * r,
      );
      const s = 0.55 + Math.sin(this.pulseT * 6 + part.angle) * 0.25;
      part.mesh.scale.setScalar(s);
    }
  }

  reset(): void {
    if (!this.world || !this.cover || !this.coverMat) return;
    if (!this.revealed && !this.revealing && !this.opening && !this.pendingReveal) return;

    this.revealed = false;
    this.pendingReveal = false;
    this.pendingT = 0;
    this.opening = false;
    this.revealing = false;
    this.revealT = 0;
    this.suckBoost = 0;

    if (this.portalGroup) {
      this.portalGroup.visible = false;
      this.portalGroup.scale.setScalar(1);
    }
    for (const vine of this.vines) {
      vine.mesh.position.y = 0;
      vine.mesh.rotation.z = 0;
    }
    this.removePortalSensor();
    this.onOpenChange?.(false);

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
    this.removePortalSensor();
    this.removePhysicsCover();
    if (this.cover) {
      this.cover.geometry.dispose();
      this.cover.parent?.remove(this.cover);
    }
    this.coverMat?.dispose();
    if (this.portalGroup) this.portalGroup.parent?.remove(this.portalGroup);
    this.rimGlow?.dispose();
    this.accentGlow?.dispose();
    if (this.coreLight) {
      this.coreLight.dispose();
      this.coreLight.parent?.remove(this.coreLight);
    }
    for (const g of this.ownedGeos) g.dispose();
    for (const m of this.ownedMats) m.dispose();
    this.ownedGeos = [];
    this.ownedMats = [];
    this.particles = [];
    this.vines = [];

    this.cover = null;
    this.coverMat = null;
    this.coverBody = null;
    this.coverCollider = null;
    this.world = null;
    this.colliderMap = null;
    this.onOpenChange = null;
    this.portalGroup = null;
    this.outerRingMat = null;
    this.innerRingMat = null;
    this.coreMat = null;
    this.vortexMat = null;
    this.rimGlow = null;
    this.coreLight = null;
    this.accentGlow = null;
    this.vineMat = null;
    this.revealed = false;
    this.pendingReveal = false;
    this.pendingT = 0;
    this.opening = false;
    this.revealing = false;
    this.revealT = 0;
    this.suckBoost = 0;
  }

  private buildPortalVisuals(): THREE.Group {
    const group = new THREE.Group();

    this.vortexMat = new THREE.MeshBasicMaterial({
      color: 0x110008,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const vortex = new THREE.Mesh(new THREE.CircleGeometry(PORTAL_HOLE_RADIUS * 0.92, 32), this.vortexMat);
    vortex.rotation.x = -Math.PI / 2;
    vortex.position.y = -0.001;
    vortex.renderOrder = 4;
    group.add(vortex);
    this.ownedGeos.push(vortex.geometry);
    this.ownedMats.push(this.vortexMat);

    this.coreMat = new THREE.MeshBasicMaterial({
      color: 0x220011,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const core = new THREE.Mesh(new THREE.CircleGeometry(PORTAL_HOLE_RADIUS * 0.55, 24), this.coreMat);
    core.rotation.x = -Math.PI / 2;
    core.renderOrder = 5;
    group.add(core);
    this.ownedGeos.push(core.geometry);
    this.ownedMats.push(this.coreMat);

    this.outerRingMat = new THREE.MeshStandardMaterial({
      color: 0x661122,
      emissive: 0xff1133,
      emissiveIntensity: 1.8,
      metalness: 0.75,
      roughness: 0.28,
      transparent: true,
      opacity: 0.95,
    });
    const outerRing = new THREE.Mesh(
      new THREE.TorusGeometry(PORTAL_HOLE_RADIUS * 1.08, 0.0028, 8, 36),
      this.outerRingMat,
    );
    outerRing.rotation.x = Math.PI / 2;
    outerRing.renderOrder = 6;
    group.add(outerRing);
    this.ownedGeos.push(outerRing.geometry);
    this.ownedMats.push(this.outerRingMat);

    this.innerRingMat = new THREE.MeshStandardMaterial({
      color: 0x442266,
      emissive: 0x9933ff,
      emissiveIntensity: 2.4,
      metalness: 0.6,
      roughness: 0.32,
      transparent: true,
      opacity: 0.88,
    });
    const innerRing = new THREE.Mesh(
      new THREE.TorusGeometry(PORTAL_HOLE_RADIUS * 0.78, 0.002, 8, 32),
      this.innerRingMat,
    );
    innerRing.rotation.x = Math.PI / 2;
    innerRing.renderOrder = 7;
    group.add(innerRing);
    this.ownedGeos.push(innerRing.geometry);
    this.ownedMats.push(this.innerRingMat);

    this.buildVines(group);

    const sparkMat = new THREE.MeshBasicMaterial({
      color: 0xff6688,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.ownedMats.push(sparkMat);
    for (let i = 0; i < 14; i++) {
      const sparkGeo = new THREE.SphereGeometry(0.0018, 6, 6);
      const spark = new THREE.Mesh(sparkGeo, sparkMat);
      spark.renderOrder = 8;
      group.add(spark);
      this.ownedGeos.push(sparkGeo);
      this.particles.push({
        mesh: spark,
        angle: (i / 14) * Math.PI * 2,
        radius: PORTAL_HOLE_RADIUS * (0.65 + (i % 3) * 0.12),
        speed: 2.8 + (i % 5) * 0.6,
        yOffset: 0.001 + (i % 4) * 0.0008,
      });
    }

    this.rimGlow = new GlowSprite(0xff2244, 0.05);
    this.rimGlow.sprite.position.y = 0.012;
    group.add(this.rimGlow.sprite);

    // Seule PointLight du portail (le groupe invisible la sort du rendu).
    this.coreLight = new THREE.PointLight(0x7722cc, 0.85, 0.1, 2);
    this.coreLight.position.y = 0.004;
    group.add(this.coreLight);

    this.accentGlow = new GlowSprite(0x9955ee, 0.06);
    this.accentGlow.sprite.position.y = 0.016;
    group.add(this.accentGlow.sprite);

    return group;
  }

  private buildVines(group: THREE.Group): void {
    this.vineMat = new THREE.MeshStandardMaterial({
      color: 0x182818,
      emissive: 0x661133,
      emissiveIntensity: 0.35,
      roughness: 0.94,
      metalness: 0.03,
    });
    this.ownedMats.push(this.vineMat);

    for (let i = 0; i < UPSIDE_DOWN_PORTAL_VINE_COUNT; i++) {
      const startAngle = (i / UPSIDE_DOWN_PORTAL_VINE_COUNT) * Math.PI * 2 + 0.4;
      const curl = i % 2 === 0 ? 1 : -1;
      const points: THREE.Vector3[] = [];
      const outerR = PORTAL_HOLE_RADIUS * 1.48;
      const innerR = PORTAL_HOLE_RADIUS * 0.88;
      const segments = 9;

      for (let s = 0; s <= segments; s++) {
        const t = s / segments;
        const angle = startAngle + curl * t * 1.05;
        const radius = THREE.MathUtils.lerp(outerR, innerR, t * t);
        const lift = Math.sin(t * Math.PI) * 0.0035;
        const wobble = Math.sin(t * Math.PI * 2.4 + i) * 0.0012;
        points.push(_vinePoint.set(
          Math.cos(angle) * radius + wobble,
          0.0025 + lift,
          Math.sin(angle) * radius - wobble * 0.6,
        ).clone());
      }

      const curve = new THREE.CatmullRomCurve3(points);
      const geo = new THREE.TubeGeometry(curve, 14, 0.00058, 4, false);
      const mesh = new THREE.Mesh(geo, this.vineMat);
      mesh.renderOrder = 9;
      group.add(mesh);
      this.ownedGeos.push(geo);
      this.vines.push({ mesh, phase: i * 1.9 });
    }
  }

  private scheduleReveal(): void {
    this.pendingReveal = true;
    this.pendingT = 0;
  }

  private startOpening(): void {
    this.opening = true;
    this.revealT = 0;
    this.removePhysicsCover();
    if (this.portalGroup) {
      this.portalGroup.visible = true;
      this.portalGroup.scale.setScalar(0.001);
    }
    this.applyOpenProgress(0);
  }

  private finishOpening(): void {
    this.opening = false;
    this.revealed = true;
    if (this.cover) this.cover.visible = false;
    if (this.portalGroup) this.portalGroup.scale.setScalar(1);
    this.applyOpenProgress(1);
    this.createPortalSensor();
    this.onOpenChange?.(true);
  }

  private applyOpenProgress(p: number): void {
    if (!this.portalGroup) return;

    this.portalGroup.visible = p > 0.001;
    this.portalGroup.scale.setScalar(Math.max(0.001, p));

    if (this.cover && this.coverMat) {
      if (p < 0.5) {
        this.cover.visible = true;
        this.coverMat.transparent = true;
        this.coverMat.opacity = 1 - p / 0.5;
      } else {
        this.cover.visible = false;
        this.coverMat.transparent = false;
        this.coverMat.opacity = 1;
      }
    }

    const fx = Math.min(1, p * 1.15);
    if (this.coreMat) this.coreMat.opacity = 0.7 * fx;
    if (this.vortexMat) this.vortexMat.opacity = 0.35 * fx;
    if (this.outerRingMat) {
      this.outerRingMat.transparent = true;
      this.outerRingMat.opacity = 0.95 * fx;
    }
    if (this.innerRingMat) {
      this.innerRingMat.transparent = true;
      this.innerRingMat.opacity = 0.88 * fx;
    }
    if (this.rimGlow) this.rimGlow.set(0.55 * fx, 0.9 * fx);
    if (this.accentGlow) this.accentGlow.set(0.48 * fx, fx);
    if (this.coreLight) this.coreLight.intensity = 0.85 * fx;
    if (this.vineMat) this.vineMat.emissiveIntensity = 0.35 * fx;

    for (const part of this.particles) {
      part.mesh.visible = p > 0.08;
      part.mesh.scale.setScalar(0.55 * fx);
    }
  }

  private beginReveal(): void {
    this.revealing = true;
    this.revealed = true;
    this.revealT = 0;
    this.removePhysicsCover();
    if (this.cover) this.cover.visible = false;
    if (this.portalGroup) {
      this.portalGroup.visible = true;
      this.portalGroup.scale.setScalar(0.35);
    }
    this.createPortalSensor();
    this.onOpenChange?.(true);
  }

  private createPortalSensor(): void {
    if (!this.world || !this.colliderMap || this.sensorCollider) return;

    const sensorY = this.anchorPos.y - 0.006;
    this.sensorBody = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(this.anchorPos.x, sensorY, this.anchorPos.z),
    );
    this.sensorCollider = this.world.createCollider(
      RAPIER.ColliderDesc.ball(PORTAL_SENSOR_RADIUS)
        .setSensor(true)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      this.sensorBody,
    );
    this.colliderMap.set(this.sensorCollider.handle, 'portal_enter');
  }

  private removePortalSensor(): void {
    if (this.sensorCollider && this.colliderMap) {
      this.colliderMap.delete(this.sensorCollider.handle);
    }
    if (this.sensorCollider && this.world) {
      this.world.removeCollider(this.sensorCollider, true);
    }
    if (this.sensorBody && this.world) {
      this.world.removeRigidBody(this.sensorBody);
    }
    this.sensorCollider = null;
    this.sensorBody = null;
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
