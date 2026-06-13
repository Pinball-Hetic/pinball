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
  SWITCH_SENSOR_NODES,
} from './GltfNodeNames';
import { MeshRoleResolver } from './MeshRoleResolver';

// Tuning matière par mesh (= manifest.elements). Passé en brut pour ne pas
// coupler game-engine à shared-types.
export type MeshElements = Record<string, Record<string, number | string>>;

function ancestryNames(obj: THREE.Object3D): string[] {
  const names: string[] = [];
  let cur: THREE.Object3D | null = obj;
  while (cur) {
    names.push(cur.name);
    cur = cur.parent;
  }
  return names;
}

function elemNum(v: number | string | undefined, def: number): number {
  return typeof v === 'number' ? v : def;
}

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
  // Ancienne convention (nœud unique splitté géométriquement)
  'flipper', 'flipper_buttons', 'flipper_left_split', 'flipper_right_split',
  // Nouvelle convention (sous-modèles nommés dans le GLB)
  'flipper-left', 'flipper-right', 'flipper_left', 'flipper_right',
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
 * Meshes racines de scène (hors hiérarchie GLB connue) qui doivent
 * recevoir un collider trimesh. Typiquement : petites plaques/guides ajoutés
 * pour lisser une paroi où la balle se bloquait.
 * Noms normalisés (lowercase, espaces → underscores).
 */
const STANDALONE_WALL_MESHES = new Set([
  'mesh1.0',   // plaque-guide pour lisser la paroi haute gauche
  'fix-start', // guide de lancement : lisse la paroi du couloir au démarrage
]);

// Switch sensors : source unique dans GltfNodeNames (partagée avec le rendu).
const HIDDEN_NODES = new Set(SWITCH_SENSOR_NODES);

const EXCLUDED_NODES = new Set([
  'ball', 'box', 'glass', 'feet', 'score_board', 'coin_slot',
  'exit_cover', 'plate', 'start_button',
  'drop_target_left_1', 'drop_target_left_2',
  'drop_target_right_1', 'drop_target_right_2', 'drop_target_right_3',
  'launcher',
  ...HIDDEN_NODES,
]);

const PINBALLMAP_TRIMESH_RESTITUTION = 0.35;
const PINBALLMAP_TRIMESH_FRICTION = 0.12;

/**
 * Seuil de taille pour les sous-meshes rail (Circle.xxx).
 * Si les 2 plus petites dimensions sont toutes les deux < ce seuil,
 * le mesh est un détail décoratif (vis, clip, anneau fin) → pas de physique.
 * Exemple Circle.018 : Mesh_11 (18×29×19mm), Mesh_12 (6×0.6×6mm), Mesh_13 (24×7×24mm)
 * → exclus. Mesh_8/9/10 (86×44×290mm) → inclus.
 */
const RAIL_SUBMESH_MIN_PHYS_DIM = 0.025; // 25 mm

// Meshes Pinballmap qui doivent rebondir fort (surfaces "bump").
// Noms normalisés : lowercase, espaces → underscores (les tirets restent).
const PINBALLMAP_HIGH_BOUNCE = new Set([
  'bump-right',
  'bump-left',
]);
// Restitution modérée : le sensor BumpHit fournit l'impulsion active principale.
const PINBALLMAP_HIGH_BOUNCE_RESTITUTION = 0.40;
const PINBALLMAP_HIGH_BOUNCE_FRICTION    = 0.05;

// Murs moulés plein plateau : trimesh single-sided (doubleSided=true créerait
// des faces fantômes qui expulsent la balle à travers le mur). Normales
// orientées vers l'intérieur du terrain (vérifiées Blender).
const PINBALLMAP_SINGLE_SIDED_WALL = 'mesh_1';

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
  /**
   * Construction role-driven (GLB conventionné). Chaque mesh est classé par
   * son rôle (MeshRoleResolver, via la hiérarchie) :
   *  - wall_ / lane_ → trimesh solide (matière depuis elements[nom])
   *  - floor_        → trimesh, SAUF si elements.physics === 'analytic'
   *  - flipper_/bumper_/slingshot_/target_/sensor_/vis_ → ignorés ici
   *    (gérés analytiquement par PlayfieldColliderFactory, ou sans physique).
   * Les meshes d'un même nom conventionné (ex. wall_top = Mesh_2/3/4) sont
   * fusionnés en un seul collider.
   */
  static buildRoleDriven(
    playfieldRoot: THREE.Object3D,
    world: RAPIER.World,
    resolver: MeshRoleResolver,
    elements: MeshElements,
  ): void {
    playfieldRoot.updateMatrixWorld(true);
    const groups = new Map<string, { geos: THREE.BufferGeometry[]; role: string }>();

    playfieldRoot.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const resolved = resolver.resolveFromAncestry(ancestryNames(child));
      if (!resolved) return;
      const { role, id } = resolved;
      if (role !== 'wall' && role !== 'lane' && role !== 'floor') return;
      const key = `${role}_${id}`;
      if (role === 'floor' && elements[key]?.physics === 'analytic') return;
      if (!groups.has(key)) groups.set(key, { geos: [], role });
      groups.get(key)!.geos.push(extractWorldGeometry(child));
    });

    resolver.warnUnresolvedOnce();

    for (const [key, g] of groups) {
      const el = elements[key] ?? {};
      const restitution = elemNum(el.restitution, 0.35);
      const friction = elemNum(el.friction, 0.15);
      const singleSided = el.singleSided === 1;
      const doubleSided = el.doubleSided !== undefined ? el.doubleSided === 1 : !singleSided;
      const smooth = el.smooth !== undefined ? el.smooth === 1 : true;
      PlayfieldTrimeshBuilder.createTrimeshCollider(
        world, g.geos, restitution, friction, smooth, doubleSided,
      );
    }
  }

  static build(
    playfieldRoot: THREE.Object3D,
    world: RAPIER.World,
    colliderMap?: Map<number, string>,
  ): void {
    playfieldRoot.updateMatrixWorld(true);

    if (hasPinballmapRoot(playfieldRoot)) {
      PlayfieldTrimeshBuilder.buildPinballmap(playfieldRoot, world, colliderMap);
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

  private static buildPinballmap(
    playfieldRoot: THREE.Object3D,
    world: RAPIER.World,
    colliderMap?: Map<number, string>,
  ): void {
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

      // Surfaces "bump" : le trimesh du mèche EST la surface de rebond ET la
      // surface de détection. On l'ajoute à colliderMap (tag bump_left/bump_right)
      // et on active COLLISION_EVENTS pour que CollisionEventProcessor le détecte.
      // Aucun corps invisible supplémentaire : la balle ne rebondit que quand elle
      // touche physiquement le mesh.
      if (meshMatchesSet(child, PINBALLMAP_HIGH_BOUNCE)) {
        const meshName = normalizeGltfName(child.name);   // 'bump-right' | 'bump-left'
        const tag      = meshName.replace(/-/g, '_');     // 'bump_right' | 'bump_left'
        const col = PlayfieldTrimeshBuilder.createTrimeshCollider(
          world,
          [extractWorldGeometry(child)],
          PINBALLMAP_HIGH_BOUNCE_RESTITUTION,
          PINBALLMAP_HIGH_BOUNCE_FRICTION,
          false, // pas de lissage (mesh déjà propre)
          false, // single-sided : les normales du mèche pointent vers la zone de jeu
        );
        if (col && colliderMap) {
          col.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
          colliderMap.set(col.handle, tag);
        }
        return;
      }

      if (isPinballmapRailMesh(child)) {
        // Filtrer les détails décoratifs microscopiques (vis, clips, anneaux fins).
        // On calcule la AABB du mesh et on vérifie que les 2 plus petites dimensions
        // dépassent le seuil RAIL_SUBMESH_MIN_PHYS_DIM (25 mm).
        // Ex : Circle.018/Mesh_11 (18×29×19mm), Mesh_12 (6×0.6mm×6mm) → exclus.
        const testGeo = extractWorldGeometry(child);
        testGeo.computeBoundingBox();
        const bb = testGeo.boundingBox;
        if (bb) {
          const dims = [
            bb.max.x - bb.min.x,
            bb.max.y - bb.min.y,
            bb.max.z - bb.min.z,
          ].sort((a, b) => a - b);
          // Les 2 plus petites dimensions doivent dépasser le seuil.
          if (dims[0] < RAIL_SUBMESH_MIN_PHYS_DIM && dims[1] < RAIL_SUBMESH_MIN_PHYS_DIM) return;
        }
        // Réutilise la géométrie déjà extraite pour le test de taille.
        PlayfieldTrimeshBuilder.createRailColliders(
          world,
          child,
          PINBALLMAP_TRIMESH_RESTITUTION,
          PINBALLMAP_TRIMESH_FRICTION,
          testGeo,
        );
        return;
      }

      // Mesh_1 (murs moulés) : single-sided (cf. PINBALLMAP_SINGLE_SIDED_WALL).
      const isMesh1 = normalizeGltfName(child.name) === PINBALLMAP_SINGLE_SIDED_WALL;
      PlayfieldTrimeshBuilder.createTrimeshCollider(
        world,
        [extractWorldGeometry(child)],
        PINBALLMAP_TRIMESH_RESTITUTION,
        PINBALLMAP_TRIMESH_FRICTION,
        false,
        !isMesh1,  // doubleSided=false pour Mesh_1, true pour les autres
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
    preExtracted?: THREE.BufferGeometry,
  ): void {
    const geo = preExtracted ?? extractWorldGeometry(mesh);
    // Trimesh uniquement — le cuboid bounding-box ajouté précédemment créait
    // 2 corps physiques superposés par sous-mesh (trimesh + cuboid).
    // Résultat : Rapier résolvait 2 collisions simultanées avec des normales
    // contradictoires → téléportation de la balle à grande vitesse.
    // CCD + trimesh suffit pour les rails de la taille de Circle.018 (≥ 86mm).
    PlayfieldTrimeshBuilder.createTrimeshCollider(
      world,
      [geo],
      restitution,
      friction,
      false,
      true,
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
  ): RAPIER.Collider | null {
    const { verts, indices } = PlayfieldTrimeshBuilder.mergeGeos(geos);
    if (verts.length === 0 || indices.length === 0) return null;

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
    if (!idx) return null;

    const vertsF = new Float32Array(pos.array as ArrayLike<number>);
    const indU = new Uint32Array(idx.array as ArrayLike<number>);

    const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    const desc = RAPIER.ColliderDesc.trimesh(vertsF, indU);
    if (!desc) return null;

    return world.createCollider(
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
