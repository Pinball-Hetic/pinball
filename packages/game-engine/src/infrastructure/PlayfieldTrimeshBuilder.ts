import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  canonicalGltfName,
  hasPinballmapRoot,
  isFlipperGltfMesh,
  isJunkGltfMeshName,
  isPinballmapGameplayMesh,
  isPinballmapRailMesh,
  isVisualOnlyGltfName,
  normalizeGltfName,
  playfieldUsesCollOnlyCollision,
  isPinballmapNonPhysicalFloorMesh,
  isPinballmapNoCollisionMesh,
} from './GltfNodeNames';
import { surfaceYAtZ } from '../domain/PlayfieldGeometry';

const COLLISION_SOLIDS = new Set([
  'flipper',
  'plastic', 'plastic_left', 'plastic_pop_bumper_zone', 'plastic_rocket',
  'playfield_sides',
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

/**
 * Meshes racines de scène (pas sous Pinballmap ni Strangerthings) qui doivent
 * recevoir un collider trimesh. Typiquement : petites plaques/guides ajoutés
 * pour lisser une paroi où la balle se bloquait.
 * Noms normalisés (lowercase, espaces → underscores).
 */
const STANDALONE_WALL_MESHES = new Set([
  'mesh1.0',   // plaque-guide pour lisser la paroi haute gauche
  'fix-start', // guide de lancement : lisse la paroi du couloir au démarrage
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

const PINBALLMAP_TRIMESH_RESTITUTION = 0.35;
const PINBALLMAP_TRIMESH_FRICTION = 0.12;

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
  if (!(node instanceof THREE.Mesh)) return false;

  if (isPinballmapGameplayMesh(node)) {
    if (collOnly && !selfNorm.startsWith('coll_')) return true;
    if (isFlipperGltfMesh(node)) return true;
    // flipper_left_split / flipper_right_split ont des underscores (pas de points)
    // → isFlipperGltfMesh ne les détecte pas. COLLISION_ANALYTIC couvre ces noms.
    if (meshMatchesSet(node, COLLISION_ANALYTIC)) return true;
    return false;
  }

  if (isJunkGltfMeshName(node.name)) return true;
  if (collOnly && !selfNorm.startsWith('coll_')) return true;

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

function extractWorldGeometry(mesh: THREE.Mesh): THREE.BufferGeometry {
  mesh.updateMatrixWorld(true);
  const geo = mesh.geometry.clone() as THREE.BufferGeometry;
  geo.applyMatrix4(mesh.matrixWorld);
  const posOnly = new THREE.BufferGeometry();
  posOnly.setAttribute('position', geo.getAttribute('position'));
  if (geo.index) posOnly.setIndex(geo.index);
  return posOnly;
}

function doubleSidedGeometry(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const welded = mergeVertices(geo, 1e-4);
  const idx = welded.index;
  if (!idx) return welded;

  const n = idx.count;
  const doubled = new Uint32Array(n * 2);
  doubled.set(idx.array as ArrayLike<number>);
  for (let i = 0; i < n; i += 3) {
    doubled[n + i] = idx.getX(i + 2);
    doubled[n + i + 1] = idx.getX(i + 1);
    doubled[n + i + 2] = idx.getX(i);
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute('position', welded.attributes.position);
  out.setIndex(new THREE.BufferAttribute(doubled, 1));
  return out;
}

function laplacianSmooth(
  geo: THREE.BufferGeometry,
  iterations: number,
  factor: number,
): THREE.BufferGeometry {
  const welded = mergeVertices(geo, 1e-4);
  const pos = welded.attributes.position as THREE.BufferAttribute;
  const idx = welded.index;
  if (!idx) return welded;

  for (let iter = 0; iter < iterations; iter++) {
    const sums = new Float32Array(pos.count * 3);
    const counts = new Uint32Array(pos.count);

    for (let i = 0; i < idx.count; i += 3) {
      const a = idx.getX(i), b = idx.getX(i + 1), c = idx.getX(i + 2);
      for (const [u, v] of [[a, b], [b, c], [a, c]] as [number, number][]) {
        sums[u * 3] += pos.getX(v); sums[u * 3 + 1] += pos.getY(v); sums[u * 3 + 2] += pos.getZ(v);
        sums[v * 3] += pos.getX(u); sums[v * 3 + 1] += pos.getY(u); sums[v * 3 + 2] += pos.getZ(u);
        counts[u]++; counts[v]++;
      }
    }

    for (let i = 0; i < pos.count; i++) {
      if (counts[i] === 0) continue;
      const cx = sums[i * 3] / counts[i];
      const cy = sums[i * 3 + 1] / counts[i];
      const cz = sums[i * 3 + 2] / counts[i];
      pos.setXYZ(
        i,
        pos.getX(i) + (cx - pos.getX(i)) * factor,
        pos.getY(i) + (cy - pos.getY(i)) * factor,
        pos.getZ(i) + (cz - pos.getZ(i)) * factor,
      );
    }
    pos.needsUpdate = true;
  }

  return welded;
}

export class PlayfieldTrimeshBuilder {
  static build(playfieldRoot: THREE.Object3D, world: RAPIER.World): void {
    playfieldRoot.updateMatrixWorld(true);

    if (hasPinballmapRoot(playfieldRoot)) {
      PlayfieldTrimeshBuilder.buildPinballmap(playfieldRoot, world);
      // Les meshes hors-hiérarchie Pinballmap (ex : plaques-guide standalone)
      // ne sont pas couverts par buildPinballmap — on les traite séparément.
      PlayfieldTrimeshBuilder.buildStandaloneWalls(playfieldRoot, world);
      return;
    }

    const collOnly = playfieldUsesCollOnlyCollision(playfieldRoot);
    const mainGeos: THREE.BufferGeometry[] = [];

    playfieldRoot.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      if (isSkipped(child, collOnly)) return;
      mainGeos.push(extractWorldGeometry(child));
    });

    if (mainGeos.length > 0) {
      PlayfieldTrimeshBuilder.createTrimeshCollider(world, mainGeos, 0.35, 0.15, true, false);
    }

    PlayfieldTrimeshBuilder.buildTrimeshGroup(playfieldRoot, world, TRIMESH_NO_BOUNCE, 0, 0.1);
    PlayfieldTrimeshBuilder.buildTrimeshGroup(playfieldRoot, world, TRIMESH_MISC, 0.35, 0.15);
    PlayfieldTrimeshBuilder.buildPlasticTrimeshes(playfieldRoot, world);
  }

  private static buildPinballmap(playfieldRoot: THREE.Object3D, world: RAPIER.World): void {
    playfieldRoot.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      if (!isPinballmapGameplayMesh(child)) return;
      if (isFlipperGltfMesh(child)) return;
      if (meshMatchesSet(child, COLLISION_ANALYTIC)) return;
      // Mesh_0 (surface de jeu) : visible mais SANS collision. La physique est
      // assurée par le cuboïde analytique lisse (createPlayfieldFloor) → la
      // balle glisse sans accrocher les arêtes du trimesh. Mesh_1…4 (cadre bois,
      // structure haute) gardent leur collision.
      if (isPinballmapNonPhysicalFloorMesh(child)) return;
      // Meshes décoratifs : visibles mais sans collision (balle passe à travers).
      if (isPinballmapNoCollisionMesh(child)) return;

      if (isPinballmapRailMesh(child)) {
        PlayfieldTrimeshBuilder.createRailColliders(
          world,
          child,
          PINBALLMAP_TRIMESH_RESTITUTION,
          PINBALLMAP_TRIMESH_FRICTION,
        );
        return;
      }

      PlayfieldTrimeshBuilder.createTrimeshCollider(
        world,
        [extractWorldGeometry(child)],
        PINBALLMAP_TRIMESH_RESTITUTION,
        PINBALLMAP_TRIMESH_FRICTION,
        false,
        true,
      );
    });
  }

  /**
   * Crée des colliders trimesh pour les meshes standalone listés dans
   * STANDALONE_WALL_MESHES (nœuds racines de scène, hors hiérarchie Pinballmap).
   * Double-sided + pas de lissage : ces meshes sont déjà fins et plans,
   * le lissage Laplacien les déformerait.
   */
  private static buildStandaloneWalls(playfieldRoot: THREE.Object3D, world: RAPIER.World): void {
    playfieldRoot.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const n = normalizeGltfName(child.name);
      if (!STANDALONE_WALL_MESHES.has(n)) return;
      child.updateMatrixWorld(true);
      PlayfieldTrimeshBuilder.createTrimeshCollider(
        world,
        [extractWorldGeometry(child)],
        0.2,   // restitution : légère — la balle glisse sans rebond marqué
        0.15,  // friction modérée
        false, // pas de lissage Laplacien (plaque fine déjà plane)
        true,  // double-sided : la balle peut toucher les deux faces
      );
    });
  }

  private static createRailColliders(
    world: RAPIER.World,
    mesh: THREE.Mesh,
    restitution: number,
    friction: number,
  ): void {
    const geo = extractWorldGeometry(mesh);
    geo.computeBoundingBox();
    const bb = geo.boundingBox;
    if (!bb) return;

    PlayfieldTrimeshBuilder.createTrimeshCollider(
      world,
      [geo],
      restitution,
      friction,
      false,
      true,
    );

    const cx = (bb.min.x + bb.max.x) * 0.5;
    const cz = (bb.min.z + bb.max.z) * 0.5;
    const floorY = surfaceYAtZ(cz);
    const baseY = Math.min(bb.min.y, floorY);
    const topY = bb.max.y;
    const height = topY - baseY;
    if (height < 0.004) return;

    const hx = Math.max((bb.max.x - bb.min.x) * 0.5, 0.004);
    const hz = Math.max((bb.max.z - bb.min.z) * 0.5, 0.004);
    const hy = height * 0.5;
    const cy = baseY + hy;

    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(cx, cy, cz),
    );
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(hx, hy, hz)
        .setRestitution(restitution)
        .setFriction(friction),
      body,
    );
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
    PlayfieldTrimeshBuilder.createTrimeshCollider(world, geos, restitution, friction, true, false);
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

      if (!groupGeos.has(groupName)) groupGeos.set(groupName, []);
      groupGeos.get(groupName)!.push(extractWorldGeometry(child));
    });

    for (const geos of groupGeos.values()) {
      if (geos.length === 0) continue;
      PlayfieldTrimeshBuilder.createTrimeshCollider(world, geos, 0.3, 0.1, true, false);
    }
  }

  private static createTrimeshCollider(
    world: RAPIER.World,
    geos: THREE.BufferGeometry[],
    restitution: number,
    friction: number,
    smooth = true,
    doubleSided = false,
  ): void {
    const { verts, indices } = PlayfieldTrimeshBuilder.mergeGeos(geos);
    if (verts.length === 0 || indices.length === 0) return;

    const rawGeo = new THREE.BufferGeometry();
    rawGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
    rawGeo.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));

    let finalGeo = smooth ? laplacianSmooth(rawGeo, 4, 0.25) : mergeVertices(rawGeo, 1e-4);
    if (doubleSided) finalGeo = doubleSidedGeometry(finalGeo);

    const pos = finalGeo.attributes.position as THREE.BufferAttribute;
    let idx = finalGeo.index;
    if (!idx) {
      finalGeo = mergeVertices(finalGeo, 1e-4);
      idx = finalGeo.index;
    }
    if (!idx) return;

    const vertsF = new Float32Array(pos.array as ArrayLike<number>);
    const indU = new Uint32Array(idx.array as ArrayLike<number>);

    const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    const desc = RAPIER.ColliderDesc.trimesh(vertsF, indU);
    if (!desc) return;

    world.createCollider(
      desc.setRestitution(restitution).setFriction(friction),
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
      result.push(extractWorldGeometry(child));
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
