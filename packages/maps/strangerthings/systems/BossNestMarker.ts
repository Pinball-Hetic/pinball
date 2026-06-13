import * as THREE from 'three';
import { type BossId } from '@pinball/game-engine';
import { BOSS_IDS, getBossDefinition } from '../bosses';

export type NestMarkerState = 'locked' | 'armed' | 'revealed';

const RING_INNER = 0.022;
const RING_OUTER = 0.03;
const SURFACE_OFFSET = 0.004;

const ARMED_OPACITY_MIN = 0.35;
const ARMED_OPACITY_MAX = 0.8;
const ARMED_PERIOD = 1.2;

const HINT_OPACITY_MAX = 1;
const HINT_PERIOD = 0.7;

const REVEAL_FADE_S = 0.6;

type Marker = {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  geo: THREE.RingGeometry;
  armedColor: THREE.Color;
  requiresAlternateWorld: boolean;
  state: NestMarkerState;
  t: number;
  revealT: number;
  revealFromOpacity: number;
  lateHint: boolean;
};

export type BossNestMarkerSetup = {
  root: THREE.Object3D;
};

export class BossNestMarker {
  private markers = new Map<BossId, Marker>();
  private alternateWorldActive = false;
  private root: THREE.Object3D | null = null;

  setup(config: BossNestMarkerSetup): void {
    this.dispose();
    this.root = config.root;

    for (const id of BOSS_IDS) {
      const def = getBossDefinition(id);
      const armedColor = new THREE.Color(def.targetMeshTheme.ring.emissive);

      const geo = new THREE.RingGeometry(RING_INNER, RING_OUTER, 32);
      const mat = new THREE.MeshBasicMaterial({
        color: armedColor,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
        blending: THREE.AdditiveBlending,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(def.target.x, def.target.y + SURFACE_OFFSET, def.target.z);
      mesh.renderOrder = 600;
      mesh.visible = false;
      config.root.add(mesh);

      this.markers.set(id, {
        mesh,
        mat,
        geo,
        armedColor,
        requiresAlternateWorld: def.hud.requiresAlternateWorld,
        state: 'locked',
        t: 0,
        revealT: 0,
        revealFromOpacity: 0,
        lateHint: false,
      });
    }
  }

  setUpsideDown(active: boolean): void {
    this.alternateWorldActive = active;
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
      m.lateHint = false;
      m.mat.opacity = 0;
      m.mesh.visible = false;
    }
  }

  update(dt: number): void {
    for (const m of this.markers.values()) {
      m.t += dt;

      if (m.requiresAlternateWorld && !this.alternateWorldActive) {
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

      if (m.state === 'locked') {
        m.mesh.visible = false;
        m.mat.opacity = 0;
        continue;
      }

      const period = m.lateHint ? HINT_PERIOD : ARMED_PERIOD;
      const max = m.lateHint ? HINT_OPACITY_MAX : ARMED_OPACITY_MAX;
      const wave = 0.5 + 0.5 * Math.sin((m.t / period) * Math.PI * 2);
      m.mat.color.copy(m.armedColor);
      m.mat.opacity = ARMED_OPACITY_MIN + (max - ARMED_OPACITY_MIN) * wave;
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
