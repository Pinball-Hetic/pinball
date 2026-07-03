import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { MapLayout } from '@pinball/game-engine';
import { easeOut, RevealCountdown } from '@pinball/game-engine';
import { RETURN_PORTAL_REVEAL_DELAY_S } from './DarkLinkConstants';

// ── Dimensions ─────────────────────────────────────────────────────────────
const PORTAL_SENSOR_RADIUS = 0.014;
const PORTAL_OUTER_R       = 0.01867;
const PORTAL_INNER_R       = 0.01333;
const PORTAL_TUBE_R        = 0.0014;
const OPEN_DURATION        = 1.1;
const PARTICLE_COUNT       = 28;

type SetupConfig = {
  root: THREE.Object3D;
  world: RAPIER.World;
  colliderMap: Map<number, string>;
  layout: MapLayout;
  onOpenChange: (open: boolean) => void;
};

/**
 * Portail Sacred Realm (Zelda) — visuel Three.js + sensor Rapier.
 *
 * Pattern identique à UpsideDownPortal (ST) :
 *  - Le sensor Rapier est créé SEULEMENT quand le portail s'ouvre (open / enableReturn).
 *  - Le sensor est détruit physiquement à hide() et reset().
 *  - Impossible de déclencher le portail quand il est invisible.
 */
export class ZeldaPortal {
  // ── Rapier (créé / détruit dynamiquement) ────────────────────────────────
  private world:          RAPIER.World | null     = null;
  private sensorBody:     RAPIER.RigidBody | null = null;
  private sensorCollider: RAPIER.Collider | null  = null;
  private colliderMap:    Map<number, string> | null = null;
  private sensorPos = new THREE.Vector3();
  private onOpenChangeCb: ((open: boolean) => void) | null = null;

  // ── Three.js ──────────────────────────────────────────────────────────────
  private portalGroup:   THREE.Group | null = null;
  private outerRing:     THREE.Mesh  | null = null;
  private innerRing:     THREE.Mesh  | null = null;
  private swirl:         THREE.Mesh  | null = null;
  private particlesMesh: THREE.Points | null = null;
  private coreLight:     THREE.PointLight | null = null;
  private rimMat:    THREE.MeshBasicMaterial | null = null;
  private accentMat: THREE.MeshBasicMaterial | null = null;
  private coreMat:   THREE.MeshBasicMaterial | null = null;
  private particleAngles: number[] = [];
  private particleRadii:  number[] = [];
  private ownedGeos: THREE.BufferGeometry[] = [];
  private ownedMats: THREE.Material[]       = [];

  // ── State ─────────────────────────────────────────────────────────────────
  private openState = false;
  private isOpening = false;
  private openT     = 0;
  private animT     = 0;
  private returnCountdown = new RevealCountdown();

  // ── API ──────────────────────────────────────────────────────────────────

  setup(config: SetupConfig): void {
    this.dispose();
    this.world          = config.world;
    this.colliderMap    = config.colliderMap;
    this.onOpenChangeCb = config.onOpenChange;

    const pos = config.layout.sensors.portal;
    this.sensorPos.set(pos.x, pos.y, pos.z);

    // Visuel Three.js — masqué au départ. Sensor PAS encore créé.
    this.portalGroup = this.buildVisual();
    this.portalGroup.position.set(pos.x, pos.y + 0.020, pos.z);
    this.portalGroup.rotation.x = 96 * Math.PI / 180;  // à plat sur le plateau
    this.portalGroup.visible = false;
    config.root.add(this.portalGroup);

    config.onOpenChange(false);
  }

  /** Ouvre le portail après la défaite de Ganondorf. */
  open(): void {
    if (this.openState) return;
    this.openState = true;
    this.isOpening = true;
    this.openT     = 0;
    if (this.portalGroup) {
      this.portalGroup.visible = true;
      this.portalGroup.scale.setScalar(0);
    }
    this.createSensor();
    this.onOpenChangeCb?.(true);
  }

  /**
   * Cache le visuel et **détruit le sensor Rapier**.
   * Appelé dès que la balle entre dans le portail — impossible de le reprendre.
   */
  hide(): void {
    this.returnCountdown.cancel();
    if (this.portalGroup) this.portalGroup.visible = false;
    this.removeSensor();
    this.onOpenChangeCb?.(false);
  }

  /**
   * Programme le sensor pour le portail RETOUR (Sacred Realm → monde normal).
   * Différé : au coup fatal la bille colle à Dark Link — activer immédiatement
   * l'aspirerait sans laisser jouer. Le sensor est créé par update(dt).
   */
  enableReturn(): void {
    this.returnCountdown.start(RETURN_PORTAL_REVEAL_DELAY_S);
  }

  /** Réinitialise complètement le portail (game reset). */
  reset(): void {
    this.returnCountdown.cancel();
    this.openState = false;
    this.isOpening = false;
    this.openT     = 0;
    this.animT     = 0;
    if (this.portalGroup) {
      this.portalGroup.visible = false;
      this.portalGroup.scale.setScalar(1);
    }
    this.removeSensor();
    this.onOpenChangeCb?.(false);
  }

  isOpen(): boolean {
    return this.openState;
  }

  update(dt: number): void {
    // Avant le early-return visuel : le groupe est invisible dans le Sacred
    // Realm, mais le countdown retour doit quand même s'écouler.
    if (this.returnCountdown.tick(dt)) {
      this.createSensor();
      this.onOpenChangeCb?.(true);
    }

    if (!this.portalGroup?.visible) return;

    if (this.isOpening) {
      this.openT = Math.min(1, this.openT + dt / OPEN_DURATION);
      this.portalGroup.scale.setScalar(easeOut(this.openT));
      if (this.openT >= 1) this.isOpening = false;
    }

    this.animT += dt;

    if (this.outerRing) this.outerRing.rotation.z += dt * 0.65;
    if (this.innerRing) this.innerRing.rotation.z -= dt * 1.15;
    if (this.swirl)     this.swirl.rotation.z     += dt * 3.8;

    const pulse = 0.8 + Math.sin(this.animT * 2.8) * 0.2;
    if (this.coreLight) this.coreLight.intensity = 0.8 * pulse;

    if (this.rimMat)    this.rimMat.opacity    = 0.09 + Math.sin(this.animT * 1.9) * 0.04;
    if (this.accentMat) this.accentMat.opacity = 0.18 + Math.sin(this.animT * 2.3 + 1) * 0.06;
    if (this.coreMat)   this.coreMat.opacity   = 0.78 + Math.sin(this.animT * 4.1) * 0.08;

    if (this.particlesMesh) {
      const attr = this.particlesMesh.geometry.attributes['position'] as THREE.BufferAttribute;
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const a = this.particleAngles[i] + this.animT * 1.6;
        attr.setXY(i, Math.cos(a) * this.particleRadii[i], Math.sin(a) * this.particleRadii[i]);
      }
      attr.needsUpdate = true;
    }
  }

  dispose(): void {
    this.returnCountdown.cancel();
    this.removeSensor();
    if (this.coreLight) {
      this.coreLight.dispose();
      this.coreLight.parent?.remove(this.coreLight);
      this.coreLight = null;
    }
    if (this.portalGroup) {
      this.portalGroup.parent?.remove(this.portalGroup);
      this.portalGroup = null;
    }
    for (const g of this.ownedGeos) g.dispose();
    for (const m of this.ownedMats) m.dispose();
    this.ownedGeos = [];
    this.ownedMats = [];
    this.world          = null;
    this.colliderMap    = null;
    this.onOpenChangeCb = null;
    this.outerRing      = null;
    this.innerRing      = null;
    this.swirl          = null;
    this.particlesMesh  = null;
    this.rimMat         = null;
    this.accentMat      = null;
    this.coreMat        = null;
    this.particleAngles = [];
    this.particleRadii  = [];
    this.openState = false;
    this.isOpening = false;
    this.openT     = 0;
    this.animT     = 0;
  }

  // ── Sensor Rapier (créé / détruit dynamiquement) ─────────────────────────

  private createSensor(): void {
    if (!this.world || !this.colliderMap || this.sensorCollider) return;
    this.sensorBody = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(
        this.sensorPos.x, this.sensorPos.y, this.sensorPos.z,
      ),
    );
    this.sensorCollider = this.world.createCollider(
      RAPIER.ColliderDesc.ball(PORTAL_SENSOR_RADIUS)
        .setSensor(true)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      this.sensorBody,
    );
    this.colliderMap.set(this.sensorCollider.handle, 'portal_enter');
  }

  private removeSensor(): void {
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
    this.sensorBody     = null;
  }

  // ── Visuel Three.js ───────────────────────────────────────────────────────

  private buildVisual(): THREE.Group {
    const group = new THREE.Group();

    const rimGeo = new THREE.CircleGeometry(PORTAL_OUTER_R * 1.75, 32);
    this.rimMat  = new THREE.MeshBasicMaterial({
      color: 0x0044ff, transparent: true, opacity: 0.09,
      side: THREE.DoubleSide, depthWrite: false,
    });
    const rimGlow = new THREE.Mesh(rimGeo, this.rimMat);
    rimGlow.position.z = -0.002;
    group.add(rimGlow);
    this.ownedGeos.push(rimGeo); this.ownedMats.push(this.rimMat);

    const accentGeo = new THREE.CircleGeometry(PORTAL_OUTER_R * 1.18, 32);
    this.accentMat  = new THREE.MeshBasicMaterial({
      color: 0x1155ff, transparent: true, opacity: 0.18,
      side: THREE.DoubleSide, depthWrite: false,
    });
    const accentGlow = new THREE.Mesh(accentGeo, this.accentMat);
    accentGlow.position.z = -0.001;
    group.add(accentGlow);
    this.ownedGeos.push(accentGeo); this.ownedMats.push(this.accentMat);

    const coreGeo = new THREE.CircleGeometry(PORTAL_INNER_R - PORTAL_TUBE_R * 0.8, 48);
    this.coreMat  = new THREE.MeshBasicMaterial({
      color: 0x000d33, transparent: true, opacity: 0.78,
      side: THREE.DoubleSide, depthWrite: false,
    });
    const coreDisc = new THREE.Mesh(coreGeo, this.coreMat);
    coreDisc.position.z = 0.001;
    group.add(coreDisc);
    this.ownedGeos.push(coreGeo); this.ownedMats.push(this.coreMat);

    const swirlGeo = new THREE.RingGeometry(0.004, PORTAL_INNER_R - PORTAL_TUBE_R * 0.9, 3);
    const swirlMat = new THREE.MeshBasicMaterial({
      color: 0x2266ff, transparent: true, opacity: 0.28,
      side: THREE.DoubleSide, depthWrite: false,
    });
    this.swirl = new THREE.Mesh(swirlGeo, swirlMat);
    this.swirl.position.z = 0.002;
    group.add(this.swirl);
    this.ownedGeos.push(swirlGeo); this.ownedMats.push(swirlMat);

    const innerGeo = new THREE.TorusGeometry(PORTAL_INNER_R, PORTAL_TUBE_R * 0.72, 8, 64);
    const innerMat = new THREE.MeshStandardMaterial({
      color: 0x003388, emissive: 0x44aaff, emissiveIntensity: 2.0,
      metalness: 0.3, roughness: 0.3,
    });
    this.innerRing = new THREE.Mesh(innerGeo, innerMat);
    this.innerRing.position.z = 0.003;
    group.add(this.innerRing);
    this.ownedGeos.push(innerGeo); this.ownedMats.push(innerMat);

    const outerGeo = new THREE.TorusGeometry(PORTAL_OUTER_R, PORTAL_TUBE_R, 8, 64);
    const outerMat = new THREE.MeshStandardMaterial({
      color: 0x001155, emissive: 0x0066ff, emissiveIntensity: 2.8,
      metalness: 0.4, roughness: 0.2,
    });
    this.outerRing = new THREE.Mesh(outerGeo, outerMat);
    this.outerRing.position.z = 0.003;
    group.add(this.outerRing);
    this.ownedGeos.push(outerGeo); this.ownedMats.push(outerMat);

    const positions = new Float32Array(PARTICLE_COUNT * 3);
    this.particleAngles = [];
    this.particleRadii  = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const angle  = (i / PARTICLE_COUNT) * Math.PI * 2;
      const radius = PORTAL_INNER_R * 0.45 + Math.random() * PORTAL_INNER_R * 0.5;
      this.particleAngles.push(angle);
      this.particleRadii.push(radius);
      positions[i * 3]     = Math.cos(angle) * radius;
      positions[i * 3 + 1] = Math.sin(angle) * radius;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 0.006;
    }
    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const particleMat = new THREE.PointsMaterial({
      color: 0x88ccff, size: 0.0028, transparent: true, opacity: 0.85, depthWrite: false,
    });
    this.particlesMesh = new THREE.Points(particleGeo, particleMat);
    this.particlesMesh.position.z = 0.004;
    group.add(this.particlesMesh);
    this.ownedGeos.push(particleGeo); this.ownedMats.push(particleMat);

    this.coreLight = new THREE.PointLight(0x0066ff, 0, 0.38, 2);
    this.coreLight.position.set(0, 0, 0.02);
    group.add(this.coreLight);

    return group;
  }
}
