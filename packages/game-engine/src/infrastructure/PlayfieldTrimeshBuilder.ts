import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {
  canonicalGltfName,
  isJunkGltfMeshName,
  isVisualOnlyGltfName,
  normalizeGltfName,
  playfieldUsesCollOnlyCollision,
} from './GltfNodeNames';

// Meshes handled by dedicated NO_BOUNCE trimesh (restitution=0)
const NO_BOUNCE = new Set([
  'slingshot',
  'cylinder008', 'cylinder008_1', 'cylinder008_2', 'cylinder008_3',
  'cylinder008_4', 'cylinder008_5', 'cylinder008_6', 'cylinder008_7', 'cylinder008_8',
]);

// Rails/guides — dedicated solid trimesh so thin curved rails don't fall through
const PLASTIC_SOLID = new Set([
  'plastic', 'plastic_left', 'plastic_pop_bumper_zone', 'plastic_rocket',
  'circle001', 'circle001_1', 'circle001_2',
  'circle011', 'circle011_1', 'circle011_2',
  'circle005', 'circle005_1', 'circle005_2', 'circle005_3', 'circle005_4', 'circle005_5',
  'circle018', 'circle018_1', 'circle018_2', 'circle018_3', 'circle018_4', 'circle018_5',
]);

const HIDDEN_NODES = new Set([
  'switch_left_pop_bumper_zone', 'switch left pop bumper zone',
  'switch_center_pop_bumper_zone', 'switch center pop bumper zone',
  'switch_plunger', 'switch plunger',
  'switch_right_pop_bumper_zone', 'switch right pop bumper zone',
  'switch_rocket', 'switch rocket',
  'switch_slingshot', 'switch slingshot',
  'spinner',
  'switch_out', 'switch out',
]);

/** Côtés / caisse : inclus dans le trimesh pour bordures réelles (évite de dépendre des murs analytiques). */
const SKIP = new Set([
  'ball', 'box', 'glass', 'feet', 'score_board', 'coin_slot',
  'plunger_panel', 'exit_cover', 'plate', 'start_button', 'spinner',
  'flipper', 'flipper_buttons', 'flipper_left_split', 'flipper_right_split',
  'pop_bumper', 'pop_bumper_left', 'pop_bumper_right', 'pop_bumper_guard',
  'drop_target_left_1', 'drop_target_left_2',
  'drop_target_right_1', 'drop_target_right_2', 'drop_target_right_3',
  'switch_out', 'switch_center_pop_bumper_zone', 'switch_left_pop_bumper_zone',
  'switch_right_pop_bumper_zone', 'switch_plunger', 'switch_rocket', 'switch_slingshot',
  'launcher',
  'separator_left', 'separator_right',
  'shoulder',
  // Elements handled by dedicated trimeshes
  ...NO_BOUNCE,
  ...PLASTIC_SOLID,
  ...HIDDEN_NODES,
]);

function isSkipped(node: THREE.Object3D, collOnly: boolean): boolean {
  const selfNorm = normalizeGltfName(node.name);
  if (isJunkGltfMeshName(node.name)) return true;
  if (collOnly && !selfNorm.startsWith('coll_')) return true;

  let current: THREE.Object3D | null = node;
  while (current) {
    if (isVisualOnlyGltfName(current.name)) return true;
    const n = normalizeGltfName(current.name);
    const c = canonicalGltfName(current.name);
    if (SKIP.has(n) || SKIP.has(c)) return true;
    current = current.parent;
  }
  return false;
}

export class PlayfieldTrimeshBuilder {
  static build(playfieldRoot: THREE.Object3D, world: RAPIER.World): void {
    playfieldRoot.updateMatrixWorld(true);

    const collOnly = playfieldUsesCollOnlyCollision(playfieldRoot);
    const trimGeos: THREE.BufferGeometry[] = [];

    playfieldRoot.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      if (isSkipped(child, collOnly)) return;

      child.updateMatrixWorld(true);
      const geo = child.geometry.clone() as THREE.BufferGeometry;
      geo.applyMatrix4(child.matrixWorld);

      const posOnly = new THREE.BufferGeometry();
      posOnly.setAttribute('position', geo.getAttribute('position'));
      if (geo.index) posOnly.setIndex(geo.index);
      trimGeos.push(posOnly);
    });

    if (trimGeos.length === 0) return;

    const allVerts: number[] = [];
    const allIdx: number[] = [];
    let offset = 0;

    for (const g of trimGeos) {
      const posAttr = g.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < posAttr.count; i++) {
        allVerts.push(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
      }
      const idxArr = g.index
        ? Array.from(g.index.array as ArrayLike<number>)
        : Array.from({ length: posAttr.count }, (_, k) => k);
      for (const idx of idxArr) allIdx.push(idx + offset);
      offset += posAttr.count;
    }

    const trimBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    world.createCollider(
      RAPIER.ColliderDesc.trimesh(
        new Float32Array(allVerts),
        new Uint32Array(allIdx),
      ).setRestitution(0.35).setFriction(0.15),
      trimBody,
    );

    PlayfieldTrimeshBuilder.buildNoBounce(playfieldRoot, world);
    PlayfieldTrimeshBuilder.buildPlasticSolid(playfieldRoot, world);
  }

  private static buildNoBounce(playfieldRoot: THREE.Object3D, world: RAPIER.World): void {
    const geos = PlayfieldTrimeshBuilder.collectMeshes(playfieldRoot, NO_BOUNCE, HIDDEN_NODES);
    if (geos.length === 0) return;
    const { verts, indices } = PlayfieldTrimeshBuilder.mergeGeos(geos);
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    world.createCollider(
      RAPIER.ColliderDesc.trimesh(
        new Float32Array(verts),
        new Uint32Array(indices),
      ).setRestitution(0).setFriction(0.1),
      body,
    );
  }

  private static buildPlasticSolid(playfieldRoot: THREE.Object3D, world: RAPIER.World): void {
    const plasticGroups = new Set(['plastic', 'plastic_left', 'plastic_pop_bumper_zone', 'plastic_rocket']);
    const groupGeos = new Map<string, THREE.BufferGeometry[]>();

    playfieldRoot.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      let groupName = '';
      let n: THREE.Object3D | null = child;
      while (n) {
        const nameLC = n.name.toLowerCase();
        if (PLASTIC_SOLID.has(nameLC) && plasticGroups.has(nameLC)) {
          groupName = nameLC;
          break;
        }
        n = n.parent;
      }
      if (!groupName && PLASTIC_SOLID.has(child.name.toLowerCase())) {
        groupName = child.name.toLowerCase();
      }
      if (!groupName) return;

      child.updateMatrixWorld(true);
      const geo = child.geometry.clone() as THREE.BufferGeometry;
      geo.applyMatrix4(child.matrixWorld);
      const posOnly = new THREE.BufferGeometry();
      posOnly.setAttribute('position', geo.getAttribute('position'));
      if (geo.index) posOnly.setIndex(geo.index);
      if (!groupGeos.has(groupName)) groupGeos.set(groupName, []);
      groupGeos.get(groupName)!.push(posOnly);
    });

    for (const [, geos] of groupGeos) {
      if (geos.length === 0) continue;
      const { verts, indices } = PlayfieldTrimeshBuilder.mergeGeos(geos);
      if (verts.length === 0) continue;
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
      world.createCollider(
        RAPIER.ColliderDesc.trimesh(
          new Float32Array(verts),
          new Uint32Array(indices),
        ).setRestitution(0.3).setFriction(0.1),
        body,
      );
    }
  }

  private static collectMeshes(
    root: THREE.Object3D,
    include: Set<string>,
    exclude: Set<string>,
  ): THREE.BufferGeometry[] {
    const result: THREE.BufferGeometry[] = [];
    root.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const nameLC = child.name.toLowerCase();
      if (!include.has(nameLC) || exclude.has(nameLC)) return;
      child.updateMatrixWorld(true);
      const geo = child.geometry.clone() as THREE.BufferGeometry;
      geo.applyMatrix4(child.matrixWorld);
      const posOnly = new THREE.BufferGeometry();
      posOnly.setAttribute('position', geo.getAttribute('position'));
      if (geo.index) posOnly.setIndex(geo.index);
      result.push(posOnly);
    });
    return result;
  }

  private static mergeGeos(geos: THREE.BufferGeometry[]): { verts: number[]; indices: number[] } {
    const verts: number[] = [];
    const indices: number[] = [];
    let offset = 0;
    for (const g of geos) {
      const posAttr = g.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < posAttr.count; i++) {
        verts.push(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
      }
      const idxArr = g.index
        ? Array.from(g.index.array as ArrayLike<number>)
        : Array.from({ length: posAttr.count }, (_, k) => k);
      for (const idx of idxArr) indices.push(idx + offset);
      offset += posAttr.count;
    }
    return { verts, indices };
  }
}
