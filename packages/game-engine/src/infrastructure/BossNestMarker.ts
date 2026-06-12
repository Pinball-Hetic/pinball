import * as THREE from 'three';
import { BOSS_IDS, getBossDefinition, type BossId } from '../domain/BossRegistry';

export type NestMarkerState = 'locked' | 'armed' | 'revealed';

// Anneau plat émissif posé sur la surface, à l'aplomb de la cible du boss.
// Marqueur d'état du « nid » : il indique au joueur OÙ frapper et SI le palier
// de score est atteint. Rendu purement additif (MeshBasicMaterial) — AUCUNE
// lumière ajoutée à la scène (perf : zéro PointLight, zéro shadow map).
const RING_INNER = 0.022;
const RING_OUTER = 0.03;
const SURFACE_OFFSET = 0.004; // juste au-dessus du tapis (anti z-fighting)

const LOCKED_OPACITY_MIN = 0.04;
const LOCKED_OPACITY_MAX = 0.12;
const LOCKED_PERIOD = 4; // s — pulse très lent « braise »

const ARMED_OPACITY_MIN = 0.35;
const ARMED_OPACITY_MAX = 0.8;
const ARMED_PERIOD = 1.2; // s — pulse rapide « appelle le regard »

const HINT_OPACITY_MAX = 1; // pulse amplifié du hint tardif
const HINT_PERIOD = 0.7;

const REVEAL_FADE_S = 0.6; // fondu vers 0 au reveal

const FLASH_DURATION = 0.6; // « pas encore » : 2 flashs gris
const FLASH_SEGMENT = 0.15; // 0.6 / 0.15 = 4 segments → 2 on / 2 off
const FLASH_COLOR = 0x888888;
const FLASH_OPACITY = 0.7;

type Marker = {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  geo: THREE.RingGeometry;
  armedColor: THREE.Color;
  lockedColor: THREE.Color;
  requiresUpsideDown: boolean;
  state: NestMarkerState;
  t: number; // horloge de pulse
  revealT: number; // horloge de fondu reveal
  revealFromOpacity: number;
  flashT: number; // timer du flash « pas encore »
  lateHint: boolean;
};

export type BossNestMarkerSetup = {
  root: THREE.Object3D;
};

export class BossNestMarker {
  private markers = new Map<BossId, Marker>();
  private upsideDownActive = false;
  private root: THREE.Object3D | null = null;

  setup(config: BossNestMarkerSetup): void {
    this.dispose();
    this.root = config.root;

    for (const id of BOSS_IDS) {
      const def = getBossDefinition(id);
      const armedColor = new THREE.Color(def.targetMeshTheme.ring.emissive);
      // « gris-rouge sombre » : teinte désaturée et assombrie de la couleur armée.
      const lockedColor = armedColor.clone().lerp(new THREE.Color(0x555555), 0.6);

      const geo = new THREE.RingGeometry(RING_INNER, RING_OUTER, 32);
      const mat = new THREE.MeshBasicMaterial({
        color: lockedColor,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
        blending: THREE.AdditiveBlending,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = -Math.PI / 2; // à plat sur le tapis
      mesh.position.set(def.target.x, def.target.y + SURFACE_OFFSET, def.target.z);
      mesh.renderOrder = 600;
      mesh.visible = false;
      config.root.add(mesh);

      this.markers.set(id, {
        mesh,
        mat,
        geo,
        armedColor,
        lockedColor,
        requiresUpsideDown: def.hud.requiresUpsideDown,
        state: 'locked',
        t: 0,
        revealT: 0,
        revealFromOpacity: 0,
        flashT: 0,
        lateHint: false,
      });
    }
  }

  /** Gate Upside Down : les marqueurs `requiresUpsideDown` restent cachés hors UD. */
  setUpsideDown(active: boolean): void {
    this.upsideDownActive = active;
  }

  setState(id: BossId, state: NestMarkerState): void {
    const m = this.markers.get(id);
    if (!m || m.state === state) return;
    if (state === 'revealed') {
      m.revealT = 0;
      m.revealFromOpacity = m.mat.opacity;
    }
    if (state !== 'armed') m.lateHint = false;
    m.state = state;
  }

  /** Flash gris 2× : retour pédagogique « cible verrouillée ». */
  flashLocked(id: BossId): void {
    const m = this.markers.get(id);
    if (m) m.flashT = FLASH_DURATION;
  }

  /** Amplifie le pulse du marqueur armé (hint tardif). */
  setLateHint(id: BossId, on: boolean): void {
    const m = this.markers.get(id);
    if (m && m.state === 'armed') m.lateHint = on;
  }

  isArmed(id: BossId): boolean {
    return this.markers.get(id)?.state === 'armed';
  }

  reset(): void {
    for (const m of this.markers.values()) {
      m.state = 'locked';
      m.t = 0;
      m.revealT = 0;
      m.flashT = 0;
      m.lateHint = false;
      m.mat.opacity = 0;
      m.mesh.visible = false;
    }
  }

  update(dt: number): void {
    for (const m of this.markers.values()) {
      m.t += dt;
      if (m.flashT > 0) m.flashT = Math.max(0, m.flashT - dt);

      // Gate Upside Down : marqueur de boss UD invisible hors Upside Down.
      if (m.requiresUpsideDown && !this.upsideDownActive) {
        m.mesh.visible = false;
        continue;
      }

      if (m.state === 'revealed') {
        m.revealT += dt;
        const k = Math.min(1, m.revealT / REVEAL_FADE_S);
        m.mat.opacity = m.revealFromOpacity * (1 - k);
        m.mesh.visible = m.mat.opacity > 0.001;
        continue;
      }

      // Flash « pas encore » : prioritaire sur le pulse, gris.
      if (m.flashT > 0) {
        const elapsed = FLASH_DURATION - m.flashT;
        const on = Math.floor(elapsed / FLASH_SEGMENT) % 2 === 0;
        m.mat.color.setHex(FLASH_COLOR);
        m.mat.opacity = on ? FLASH_OPACITY : 0.1;
        m.mesh.visible = true;
        continue;
      }

      if (m.state === 'armed') {
        const period = m.lateHint ? HINT_PERIOD : ARMED_PERIOD;
        const max = m.lateHint ? HINT_OPACITY_MAX : ARMED_OPACITY_MAX;
        const wave = 0.5 + 0.5 * Math.sin((m.t / period) * Math.PI * 2);
        m.mat.color.copy(m.armedColor);
        m.mat.opacity = ARMED_OPACITY_MIN + (max - ARMED_OPACITY_MIN) * wave;
      } else {
        const wave = 0.5 + 0.5 * Math.sin((m.t / LOCKED_PERIOD) * Math.PI * 2);
        m.mat.color.copy(m.lockedColor);
        m.mat.opacity = LOCKED_OPACITY_MIN + (LOCKED_OPACITY_MAX - LOCKED_OPACITY_MIN) * wave;
      }
      m.mesh.visible = true;
    }
  }

  dispose(): void {
    for (const m of this.markers.values()) {
      this.root?.remove(m.mesh);
      m.mesh.parent?.remove(m.mesh);
      m.geo.dispose();
      m.mat.dispose();
    }
    this.markers.clear();
    this.root = null;
  }
}
