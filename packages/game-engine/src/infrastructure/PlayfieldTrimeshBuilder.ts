import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {
  canonicalGltfName,
  isJunkGltfMeshName,
  isVisualOnlyGltfName,
  normalizeGltfName,
  playfieldUsesCollOnlyCollision,
} from './GltfNodeNames';

const COLLISION_SOLIDS = new Set([
  'flipper',
  'plastic', 'plastic_left', 'plastic_pop_bumper_zone', 'plastic_rocket',
  'playfield', 'playfield_sides',
  'plunger_panel',
  'pop_bumper', 'pop_bumper_left', 'pop_bumper_right', 'pop_bumper_guard',
  'separator_left', 'separator_right',
  'shoulder', 'slingshot',
]);

const COLLISION_ANALYTIC = new Set([
  'flipper', 'flipper_buttons', 'flipper_left_split', 'flipper_right_split',
  'pop_bumper', 'pop_bumper_left', 'pop_bumper_right',
]);

const TRIMESH_NO_BOUNCE = new Set([
  'slingshot',
  'cylinder008', 'cylinder008_1', 'cylinder008_2', 'cylinder008_3',
  'cylinder008_4', 'cylinder008_5', 'cylinder008_6', 'cylinder008_7', 'cylinder008_8',
  'shoulder',
  'plane008', 'plane008_1', 'plane008_2',
]);

const TRIMESH_PLASTIC = new Set([
  'plastic', 'plastic_left', 'plastic_pop_bumper_zone', 'plastic_rocket',
  'circle001', 'circle001_1', 'circle001_2',
  'circle011', 'circle011_1', 'circle011_2',
  'circle005', 'circle005_1', 'circle005_2', 'circle005_3', 'circle005_4', 'circle005_5',
  'circle018', 'circle018_1', 'circle018_2', 'circle018_3', 'circle018_4', 'circle018_5',
]);

const TRIMESH_MISC = new Set([
  'separator_left', 'separator_right',
  'plunger_panel',
  'pop_bumper_guard',
]);

const TRIMESH_DEDICATED = new Set([
  ...TRIMESH_NO_BOUNCE,
  ...TRIMESH_PLASTIC,
  ...TRIMESH_MISC,
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

const EXCLUDED_NODES = new Set([
  'ball', 'box', 'glass', 'feet', 'score_board', 'coin_slot',
  'exit_cover', 'plate', 'start_button', 'spinner',
  'drop_target_left_1', 'drop_target_left_2',
  'drop_target_right_1', 'drop_target_right_2', 'drop_target_right_3',
  'switch_out', 'switch_center_pop_bumper_zone', 'switch_left_pop_bumper_zone',
  'switch_right_pop_bumper_zone', 'switch_plunger', 'switch_rocket', 'switch_slingshot',
  'launcher',
  ...HIDDEN_NODES,
]);

const PLASTIC_GROUPS = new Set([
  'plastic', 'plastic_left', 'plastic_pop_bumper_zone', 'plastic_rocket',
]);

function meshMatchesSet(mesh: THREE.Mesh, names: Set<string>): boolean {
  const self = normalizeGltfName(mesh.name);
  const selfCanon = canonicalGltfName(mesh.name);
  if (names.has(self) || names.has(selfCanon)) return true;
  let parent: THREE.Object3D | null = mesh.parent;
  while (parent) {
    const pn = normalizeGltfName(parent.name);
    const pc = canonicalGltfName(parent.name);
    if (names.has(pn) || names.has(pc)) return true;
    parent = parent.parent;
  }
  return false;
}

function isSkipped(node: THREE.Object3D, collOnly: boolean): boolean {
  const selfNorm = normalizeGltfName(node.name);
  if (isJunkGltfMeshName(node.name)) return true;
  if (collOnly && !selfNorm.startsWith('coll_')) return true;
  if (!(node instanceof THREE.Mesh)) return false;

  let current: THREE.Object3D | null = node;
  while (current) {
    if (isVisualOnlyGltfName(current.name)) return true;
    current = current.parent;
  }

  if (!meshMatchesSet(node, COLLISION_SOLIDS)) return true;
  if (meshMatchesSet(node, COLLISION_ANALYTIC)) return true;
  if (meshMatchesSet(node, TRIMESH_DEDICATED)) return true;

  let parent: THREE.Object3D | null = node.parent;
  while (parent) {
    const n = normalizeGltfName(parent.name);
    const c = canonicalGltfName(parent.name);
    if (EXCLUDED_NODES.has(n) || EXCLUDED_NODES.has(c)) return true;
    parent = parent.parent;
  }
  return false;
}

export class PlayfieldTrimeshBuilder {
  static build(playfieldRoot: THREE.Object3D, world: RAPIER.World): void {
    playfieldRoot.updateMatrixWorld(true);

    const collOnly = playfieldUsesCollOnlyCollision(playfieldRoot);
    const mainGeos: THREE.BufferGeometry[] = [];

    playfieldRoot.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      if (isSkipped(child, collOnly)) return;

      child.updateMatrixWorld(true);
      const geo = child.geometry.clone() as THREE.BufferGeometry;
      geo.applyMatrix4(child.matrixWorld);

      const posOnly = new THREE.BufferGeometry();
      posOnly.setAttribute('position', geo.getAttribute('position'));
      if (geo.index) posOnly.setIndex(geo.index);
      mainGeos.push(posOnly);
    });

    if (mainGeos.length > 0) {
      PlayfieldTrimeshBuilder.createTrimeshCollider(world, mainGeos, 0.35, 0.15);
    }

    PlayfieldTrimeshBuilder.buildTrimeshGroup(playfieldRoot, world, TRIMESH_NO_BOUNCE, 0, 0.1);
    PlayfieldTrimeshBuilder.buildTrimeshGroup(playfieldRoot, world, TRIMESH_MISC, 0.35, 0.15);
    PlayfieldTrimeshBuilder.buildPlasticTrimeshes(playfieldRoot, world);
  }

  private static buildTrimeshGroup(
    root: THREE.Object3D,
    world: RAPIER.World,
    include: Set<string>,
    restitution: number,
    friction: number,
  ): void {
    const geos = PlayfieldTrimeshBuilder.collectMeshes(root, include, HIDDEN_NODES);
    if (geos.length === 0) return;
    PlayfieldTrimeshBuilder.createTrimeshCollider(world, geos, restitution, friction);
  }

  private static buildPlasticTrimeshes(playfieldRoot: THREE.Object3D, world: RAPIER.World): void {
    const groupGeos = new Map<string, THREE.BufferGeometry[]>();

    playfieldRoot.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      if (!meshMatchesSet(child, TRIMESH_PLASTIC)) return;

      let groupName = '';
      let node: THREE.Object3D | null = child;
      while (node) {
        const pn = normalizeGltfName(node.name);
        const pc = canonicalGltfName(node.name);
        if (PLASTIC_GROUPS.has(pn)) { groupName = pn; break; }
        if (PLASTIC_GROUPS.has(pc)) { groupName = pc; break; }
        node = node.parent;
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

    for (const geos of groupGeos.values()) {
      if (geos.length === 0) continue;
      PlayfieldTrimeshBuilder.createTrimeshCollider(world, geos, 0.3, 0.1);
    }
  }

  private static createTrimeshCollider(
    world: RAPIER.World,
    geos: THREE.BufferGeometry[],
    restitution: number,
    friction: number,
  ): void {
    const { verts, indices } = PlayfieldTrimeshBuilder.mergeGeos(geos);
    if (verts.length === 0) return;
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    world.createCollider(
      RAPIER.ColliderDesc.trimesh(
        new Float32Array(verts),
        new Uint32Array(indices),
      ).setRestitution(restitution).setFriction(friction),
      body,
    );
  }

  private static collectMeshes(
    root: THREE.Object3D,
    include: Set<string>,
    exclude: Set<string>,
  ): THREE.BufferGeometry[] {
    const result: THREE.BufferGeometry[] = [];
    root.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      if (!meshMatchesSet(child, include) || exclude.has(child.name.toLowerCase())) return;
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
