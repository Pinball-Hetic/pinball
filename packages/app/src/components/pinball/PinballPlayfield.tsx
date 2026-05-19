import { useEffect, useRef, type CSSProperties } from "react";
import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { ConvexGeometry } from "three/examples/jsm/geometries/ConvexGeometry.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  PhysicsWorld,
  BallPhysics,
  Plunger,
  LaunchBall,
  BumperHit,
  DrainBall,
  BALL_RADIUS,
  BALL_SPAWN_POSITION,
  WALL_LEFT_X,
  WALL_RIGHT_X,
  WALL_BOTTOM_Z,
  WALL_TOP_Z,
  PLAYFIELD_SURFACE_Y,
  INITIAL_LIVES,
  PLUNGER_CHARGE_MS,
  PLUNGER_MIN_FACTOR,
  PLUNGER_MAX_FACTOR,
  SWING_RAD,
  SWING_SMOOTH,
  FLIPPER_RESTITUTION,
  FLIPPER_FRICTION,
  PlayfieldTrimeshBuilder,
  PlayfieldColliderFactory,
  playfieldUsesCollOnlyCollision,
  type AnalyticalColliderOptions,
  splitFlipperIntoTwo,
  attachFlipperAtHinge,
  CollisionEventProcessor,
  detectFlipperHit,
  LauncherLaneAnimator,
  StuckBallDetector,
  findObjectByNormalizedName,
  hideGltfDecorativeBall,
  prepareGltfMaterialsForDisplay,
  configureGltfRenderer,
} from "@pinball/game-engine";
import { useGameState } from "../../hooks/useGameState";
import GameOverlay from "./GameOverlay";

/** Plateau complet — `packages/app/public/playfield/Pinballmap.glb` */
const PLAYFIELD_URL = "/playfield/Pinballmap.glb";
const FLIPPER_LEFT_NAME = "flipper";
const DRAIN_Z = WALL_BOTTOM_Z + BALL_RADIUS * 2;

/**
 * Vue cabine fixe : joueur côté +Z (flippers), regarde vers le haut du tapis (-Z).
 * Direction depuis la cible vers la caméra (haut + avant).
 */
const PLAYFIELD_VIEW_DIR = new THREE.Vector3(0, 0.48, 0.88).normalize();
/** Marge NDC : plus bas = plus de bande autour du tapis. */
const PLAYFIELD_VIEW_NDC_MARGIN = 0.78;
const PLAYFIELD_CAM_DISTANCE_SCALE = 1.05;

type PlayfieldCamFit = {
  target: THREE.Vector3;
  /** unitaire : depuis la cible vers la caméra */
  dirToCamera: THREE.Vector3;
  corners: THREE.Vector3[];
};

function fillPlayfieldBoxCorners(box: THREE.Box3, reuse: THREE.Vector3[]): THREE.Vector3[] {
  reuse.length = 0;
  const { min, max } = box;
  for (const x of [min.x, max.x] as const) {
    for (const y of [min.y, max.y] as const) {
      for (const z of [min.z, max.z] as const) {
        reuse.push(new THREE.Vector3(x, y, z));
      }
    }
  }
  return reuse;
}

function playfieldCornersInView(
  camera: THREE.PerspectiveCamera,
  target: THREE.Vector3,
  camPos: THREE.Vector3,
  corners: readonly THREE.Vector3[],
  ndcMargin: number,
): boolean {
  camera.up.set(0, 1, 0);
  camera.position.copy(camPos);
  camera.lookAt(target);
  camera.updateMatrixWorld(true);
  const clip = new THREE.Matrix4().multiplyMatrices(
    camera.projectionMatrix,
    camera.matrixWorldInverse,
  );
  const v4 = new THREE.Vector4();
  for (const c of corners) {
    v4.set(c.x, c.y, c.z, 1).applyMatrix4(clip);
    const w = Math.abs(v4.w);
    if (w < 1e-7) return false;
    const nx = v4.x / w;
    const ny = v4.y / w;
    if (Math.abs(nx) > ndcMargin || Math.abs(ny) > ndcMargin) return false;
  }
  return true;
}

function distanceForTiltedPlayfieldView(
  camera: THREE.PerspectiveCamera,
  fit: PlayfieldCamFit,
  ndcMargin: number,
): number {
  const { target: mc, dirToCamera, corners } = fit;
  const pos = new THREE.Vector3();
  let lo = 0.04;
  let hi = 0.6;
  while (!playfieldCornersInView(camera, mc, pos.copy(mc).addScaledVector(dirToCamera, hi), corners, ndcMargin) && hi < 240) {
    hi *= 1.75;
  }
  if (!playfieldCornersInView(camera, mc, pos.copy(mc).addScaledVector(dirToCamera, hi), corners, ndcMargin)) {
    return hi;
  }
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    pos.copy(mc).addScaledVector(dirToCamera, mid);
    if (playfieldCornersInView(camera, mc, pos, corners, ndcMargin)) hi = mid;
    else lo = mid;
  }
  return hi;
}

function applyPlayfieldCamera(
  camera: THREE.PerspectiveCamera,
  target: THREE.Vector3,
  dirToCamera: THREE.Vector3,
  distance: number,
): void {
  camera.up.set(0, 1, 0);
  camera.position.copy(target).addScaledVector(dirToCamera, distance);
  camera.lookAt(target);
}

/** Rectangle jouable (murs physiques + mesh tapis). */
function boundingBoxPlayableArea(playfieldRoot: THREE.Object3D): THREE.Box3 {
  const wallBox = new THREE.Box3(
    new THREE.Vector3(WALL_LEFT_X - 0.012, PLAYFIELD_SURFACE_Y - 0.04, WALL_TOP_Z - 0.02),
    new THREE.Vector3(WALL_RIGHT_X + 0.012, PLAYFIELD_SURFACE_Y + 0.1, WALL_BOTTOM_Z + 0.02),
  );
  const meshBox = boundingBoxPlayfieldSurface(playfieldRoot);
  if (meshBox.isEmpty()) return wallBox;
  return meshBox.union(wallBox);
}

function fitPlayfieldCamera(
  camera: THREE.PerspectiveCamera,
  fit: PlayfieldCamFit,
  target: THREE.Vector3,
): number {
  const dist =
    distanceForTiltedPlayfieldView(camera, fit, PLAYFIELD_VIEW_NDC_MARGIN) *
    PLAYFIELD_CAM_DISTANCE_SCALE;
  applyPlayfieldCamera(camera, target, fit.dirToCamera, dist);
  return dist;
}

/** Boîte du tapis jouable uniquement (hors caisse / backbox). */
function boundingBoxPlayfieldSurface(playfieldRoot: THREE.Object3D): THREE.Box3 {
  const box = new THREE.Box3();
  const named =
    findObjectByNormalizedName(
      playfieldRoot,
      "playfield",
      "pf_playfield",
      "coll_playfield",
    ) ?? null;
  const sides =
    findObjectByNormalizedName(
      playfieldRoot,
      "playfield_sides",
      "pf_playfield_sides",
    ) ?? null;
  if (named) {
    named.updateMatrixWorld(true);
    box.setFromObject(named);
    if (sides) {
      sides.updateMatrixWorld(true);
      box.union(new THREE.Box3().setFromObject(sides));
    }
  }
  if (!box.isEmpty()) {
    box.expandByScalar(0.006);
    return box;
  }

  const tmp = new THREE.Box3();
  let first = true;
  const skipName = (n: string) =>
    /backglass|backbox|cabinet|score.?board|coin|feet|foot|glass|launcher|plunger.?panel|epoxy|upright|stand|skirt|lockbar|siderail|caisse|vitre|button|monnayeur|start.?button/i.test(
      n,
    );
  playfieldRoot.updateMatrixWorld(true);
  playfieldRoot.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const n = child.name.toLowerCase();
    if (skipName(n)) return;
    if (
      n.includes("playfield") ||
      n.includes("plastic") ||
      n.includes("bumper") ||
      n.includes("pop_") ||
      n.includes("flipper") ||
      n.includes("separator") ||
      n.includes("sling") ||
      n.includes("target") ||
      n.includes("spinner") ||
      n.includes("guide") ||
      n.includes("rail") ||
      n.includes("rocket") ||
      n.startsWith("coll_") ||
      n.startsWith("pf_")
    ) {
      tmp.setFromObject(child);
      if (first) {
        box.copy(tmp);
        first = false;
      } else {
        box.union(tmp);
      }
    }
  });
  if (first) {
    box.setFromObject(playfieldRoot);
  }
  box.expandByScalar(0.008);
  return box;
}

type PinballPlayfieldProps = {
  /** HUD + cadre portrait pour écran de flipper physique (`/pinball?cabinet`) */
  cabinetMode?: boolean;
};

export default function PinballPlayfield({ cabinetMode = false }: PinballPlayfieldProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);

  const {
    score,
    lives,
    gameState,
    gameStateRef,
    resetGame,
    buildEmit,
  } = useGameState();

  useEffect(() => {
    let cancelled = false;
    const mountEl = mountRef.current;
    if (!mountEl) return;

    // ── Three.js setup ───────────────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#050816");
    const loader = new GLTFLoader();

    const { clientWidth, clientHeight } = mountEl;
    const camera = new THREE.PerspectiveCamera(50, clientWidth / clientHeight, 0.001, 100);
    const cameraTarget = new THREE.Vector3();
    let playfieldCamFit: {
      fit: PlayfieldCamFit;
      camera: THREE.PerspectiveCamera;
      cameraTarget: THREE.Vector3;
    } | null = null;
    let orbitControls: OrbitControls | null = null;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    configureGltfRenderer(renderer);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(clientWidth, clientHeight);
    renderer.shadowMap.enabled = true;
    mountEl.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.15);
    dirLight.position.set(2, 5, 3);
    dirLight.castShadow = true;
    scene.add(dirLight);

    const modelRoot = new THREE.Group();
    scene.add(modelRoot);

    const disposableGeos: THREE.BufferGeometry[] = [];
    const disposableMats: THREE.Material[] = [];

    const collectDisposables = (root: THREE.Object3D) => {
      root.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        if (child.geometry) disposableGeos.push(child.geometry);
        const m = child.material;
        if (Array.isArray(m)) m.forEach((x) => disposableMats.push(x));
        else if (m) disposableMats.push(m);
        child.castShadow = true;
        child.receiveShadow = true;
      });
    };

    // ── Flipper visual state ─────────────────────────────────────────────────
    let leftPivot: THREE.Object3D | null = null;
    let rightPivot: THREE.Object3D | null = null;
    let leftFlipperObj: THREE.Object3D | null = null;
    let rightFlipperObj: THREE.Object3D | null = null;
    let leftSwing = 0, rightSwing = 0;
    let leftTarget = 0, rightTarget = 0;
    let prevLeftSwing = 0, prevRightSwing = 0;

    // ── Physics / game objects ───────────────────────────────────────────────
    let fieldBoundsLaneSepX = BALL_SPAWN_POSITION.x - BALL_RADIUS * 2;
    let ballMesh: THREE.Object3D | null = null;
    let playfieldRootRef: THREE.Object3D | null = null;
    let physicsWorld: PhysicsWorld | null = null;
    let ballPhysicsInst: BallPhysics | null = null;
    let launchBallUC: LaunchBall | null = null;
    let bumperHitUC: BumperHit | null = null;
    let drainBallUC: DrainBall | null = null;
    let collisionProcessor: CollisionEventProcessor | null = null;
    let leftFlipperBody: RAPIER.RigidBody | null = null;
    let rightFlipperBody: RAPIER.RigidBody | null = null;
    let isChargingPlunger = false;
    let chargeStartTime = 0;
    let physicsReady = false;
    let prevFrameTime = 0;
    let laneAnimSpeed = 0;

    let leftFlipperHit = false;
    let rightFlipperHit = false;

    // ── Flipper collider debug wireframes ────────────────────────────────────
    let leftFlipperDebug: THREE.Mesh | null = null;
    let rightFlipperDebug: THREE.Mesh | null = null;

    // ── Rapier debug renderer — tous les colliders ───────────────────────────
    const rapierDebugGeo = new THREE.BufferGeometry();
    const rapierDebugMat = new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false });
    const rapierDebugLines = new THREE.LineSegments(rapierDebugGeo, rapierDebugMat);
    rapierDebugLines.visible = false;
    rapierDebugLines.renderOrder = 1000;
    scene.add(rapierDebugLines);
    disposableMats.push(rapierDebugMat);
    let debugCollidersOn = false;

    const laneAnimator = new LauncherLaneAnimator();
    const stuckDetector = new StuckBallDetector();

    // ── Plunger kinematic ────────────────────────────────────────────────────
    let plungerBody: RAPIER.RigidBody | null = null;
    let plungerMesh: THREE.Mesh | null = null;
    type PlungerState = "idle" | "charging" | "releasing" | "returning";
    let plungerState: PlungerState = "idle";
    let plungerRestZ = 0;

    // ── GLTF + Physics setup ─────────────────────────────────────────────────
    const init = async () => {
      try {
        const gltf = await loader.loadAsync(PLAYFIELD_URL);
        const playfieldRoot = gltf.scene;
        playfieldRootRef = playfieldRoot;
        collectDisposables(playfieldRoot);
        modelRoot.add(playfieldRoot);
        hideGltfDecorativeBall(playfieldRoot);
        prepareGltfMaterialsForDisplay(playfieldRoot);

        // ── Ball mesh ────────────────────────────────────────────────────────
        const glbBallNode = findObjectByNormalizedName(playfieldRoot, "ball", "pf_ball");
        if (glbBallNode) glbBallNode.visible = false;

        const ballGeo = new THREE.SphereGeometry(BALL_RADIUS, 24, 24);
        const ballMat = new THREE.MeshStandardMaterial({ color: 0xd4d4d4, metalness: 0.95, roughness: 0.08 });
        const ballSphere = new THREE.Mesh(ballGeo, ballMat);
        ballSphere.castShadow = true;
        disposableGeos.push(ballGeo);
        disposableMats.push(ballMat);
        scene.add(ballSphere);
        ballMesh = ballSphere;
        ballMesh.visible = false;

        const baseFlipper =
          findObjectByNormalizedName(
            playfieldRoot,
            FLIPPER_LEFT_NAME,
            "pf_flipper",
            "pf_flipper_left",
          ) ?? null;
        let leftFlipper: THREE.Object3D | null = null;
        let rightFlipper: THREE.Object3D | null = null;

        // ── Charger le nouveau GLB de palette ────────────────────────────────
        const flipperGltf = await loader.loadAsync("/playfield/pinball_flipper.glb");
        flipperGltf.scene.updateMatrixWorld(true);
        prepareGltfMaterialsForDisplay(flipperGltf.scene);
        let srcFlipperMesh: THREE.Mesh | null = null;
        flipperGltf.scene.traverse((c) => {
          if (!srcFlipperMesh && c instanceof THREE.Mesh) srcFlipperMesh = c as THREE.Mesh;
        });

        if (baseFlipper?.parent) {
          const [lMesh, rMesh] = splitFlipperIntoTwo(baseFlipper);

          if (lMesh && rMesh && srcFlipperMesh) {
            baseFlipper.visible = false;
            // On n'ajoute plus les split-meshes à la scène —
            // leurs vertices sont déjà en espace local du parent.
            disposableGeos.push(lMesh.geometry, rMesh.geometry);
            disposableMats.push(lMesh.material as THREE.Material, rMesh.material as THREE.Material);

            // ── Réglages manuels des palettes ────────────────────────────────
            // Avancer les palettes vers le joueur (+Z)
            const FLIPPER_Z_ADVANCE = -0;
            // Rotation autour de Y (radians) — négatif = vers la droite, positif = vers la gauche
            const FLIPPER_LEFT_ROT_Y  = -Math.PI / 6;   // 30° vers la gauche
            const FLIPPER_RIGHT_ROT_Y = +Math.PI / 6;   // 30° vers la droite

            // Construire une palette fittée depuis le nouveau GLB.
            // Tout se passe en parent-local space — pas de parentInv nécessaire.
            const buildFitted = (
              refMesh: THREE.Mesh,
              mirror: boolean,
              name: string,
              rotY: number,
            ): THREE.Mesh => {
              // 1. Lire les vertices directement en parent-local (déjà dans cet espace)
              const origAttr = refMesh.geometry.attributes.position as THREE.BufferAttribute;
              let pMinX = Infinity, pMinY = Infinity, pMinZ = Infinity;
              let pMaxX = -Infinity, pMaxY = -Infinity, pMaxZ = -Infinity;
              for (let i = 0; i < origAttr.count; i++) {
                const x = origAttr.getX(i), y = origAttr.getY(i), z = origAttr.getZ(i);
                if (x < pMinX) pMinX = x; if (x > pMaxX) pMaxX = x;
                if (y < pMinY) pMinY = y; if (y > pMaxY) pMaxY = y;
                if (z < pMinZ) pMinZ = z; if (z > pMaxZ) pMaxZ = z;
              }
              const origSizeX  = pMaxX - pMinX;
              const origCenterX = (pMinX + pMaxX) / 2;
              const origCenterZ = (pMinZ + pMaxZ) / 2;

              // 2. Aplatir la géo du nouveau GLB en world-space (rotation Sketchfab incluse)
              const geo = (srcFlipperMesh as THREE.Mesh).geometry.clone();
              geo.applyMatrix4((srcFlipperMesh as THREE.Mesh).matrixWorld);

              // 3. Miroir X pour la palette droite
              if (mirror) geo.applyMatrix4(new THREE.Matrix4().makeScale(-1, 1, 1));

              geo.computeBoundingBox();
              const nb = geo.boundingBox!;
              const newSizeX = nb.max.x - nb.min.x;
              const newCenter = nb.getCenter(new THREE.Vector3());

              // 4. Scale uniforme sur X/Z, ×2 sur Y pour rendre les palettes plus hautes
              const uniformScale = origSizeX / newSizeX;
              geo.translate(-newCenter.x, -newCenter.y, -newCenter.z);
              geo.applyMatrix4(new THREE.Matrix4().makeScale(uniformScale, uniformScale * 2, uniformScale));

              // 4b. Rotation Y (orientation horizontale de la palette)
              geo.applyMatrix4(new THREE.Matrix4().makeRotationY(rotY));

              // 5. Positionner en parent-local space : X/Z centré, Y bas aligné sur pMinY
              geo.computeBoundingBox();
              const sb = geo.boundingBox!;
              geo.translate(origCenterX, pMinY - sb.min.y, origCenterZ + FLIPPER_Z_ADVANCE);
              // Pas de parentInv — on est déjà en espace local du parent

              const srcMat = (srcFlipperMesh as THREE.Mesh).material;
              const mat = Array.isArray(srcMat)
                ? (srcMat[0] as THREE.Material).clone()
                : (srcMat as THREE.Material).clone();
              const mesh = new THREE.Mesh(geo, mat);
              mesh.name = name;
              mesh.castShadow = mesh.receiveShadow = true;
              disposableGeos.push(geo);
              disposableMats.push(mat);
              return mesh;
            };

            const newLeft  = buildFitted(lMesh, false, "flipper_left_split",  FLIPPER_LEFT_ROT_Y);
            const newRight = buildFitted(rMesh, true,  "flipper_right_split", FLIPPER_RIGHT_ROT_Y);
            baseFlipper.parent.add(newLeft);
            baseFlipper.parent.add(newRight);
            leftFlipper  = newLeft;
            rightFlipper = newRight;

          } else if (lMesh && rMesh) {
            // Fallback : anciens split-meshes si le nouveau GLB a échoué
            baseFlipper.visible = false;
            baseFlipper.parent.add(lMesh);
            baseFlipper.parent.add(rMesh);
            disposableGeos.push(lMesh.geometry, rMesh.geometry);
            disposableMats.push(lMesh.material as THREE.Material, rMesh.material as THREE.Material);
            leftFlipper  = lMesh;
            rightFlipper = rMesh;
          } else {
            leftFlipper  = baseFlipper;
            rightFlipper = baseFlipper;
          }
        }

        leftFlipper?.updateMatrixWorld(true);
        rightFlipper?.updateMatrixWorld(true);

        if (leftFlipper) {
          leftPivot = attachFlipperAtHinge(leftFlipper, "left");
          leftFlipperObj = leftFlipper;
        }
        if (rightFlipper) {
          rightPivot = attachFlipperAtHinge(rightFlipper, "right");
          rightFlipperObj = rightFlipper;
        }

        // ── Physics ──────────────────────────────────────────────────────────
        physicsWorld = await PhysicsWorld.create();
        const world = physicsWorld.world;

        modelRoot.updateMatrixWorld(true);
        const playfieldViewBox = boundingBoxPlayfieldSurface(playfieldRoot);
        fieldBoundsLaneSepX = playfieldViewBox.min.x;

        const colliderMap = new Map<number, string>();

        PlayfieldTrimeshBuilder.build(playfieldRoot, world);

        const collOnly = playfieldUsesCollOnlyCollision(playfieldRoot);
        const analytical: AnalyticalColliderOptions = collOnly
          ? { laneFloor: false, walls: false, barriers: false, bumpers: false }
          : { laneFloor: true, walls: true, barriers: true, bumpers: true };
        PlayfieldColliderFactory.createAll(world, colliderMap, analytical);

        ballPhysicsInst = new BallPhysics(world);

        // ── Flipper kinematic bodies ──────────────────────────────────────────
        // Utilise un ConvexHull basé sur les vrais vertices du mesh pour que
        // le collider coïncide exactement avec la forme visuelle de la palette.
        const makeFlipperBody = (
          flipper: THREE.Mesh | null,
          debugColor: number,
        ): { body: RAPIER.RigidBody | null; debugMesh: THREE.Mesh | null } => {
          if (!flipper) return { body: null, debugMesh: null };
          flipper.updateMatrixWorld(true);
          const worldPos = new THREE.Vector3();
          const worldQuat = new THREE.Quaternion();
          flipper.getWorldPosition(worldPos);
          flipper.getWorldQuaternion(worldQuat);
          const invWorldQuat = worldQuat.clone().invert();
          const posAttr = flipper.geometry.attributes.position as THREE.BufferAttribute;
          // Première passe : transformer tous les vertices en body-local
          const allBodyLocal: THREE.Vector3[] = [];
          const v = new THREE.Vector3();
          for (let i = 0; i < posAttr.count; i++) {
            v.fromBufferAttribute(posAttr, i);
            v.applyMatrix4(flipper.matrixWorld);
            v.sub(worldPos);
            v.applyQuaternion(invWorldQuat);
            allBodyLocal.push(v.clone());
          }
          // Médiane Y — on ne garde que la moitié supérieure pour exclure la face arrière
          const sortedY = allBodyLocal.map(p => p.y).sort((a, b) => a - b);
          const medianY = sortedY[Math.floor(sortedY.length / 2)];
          const points = allBodyLocal.filter(p => p.y >= medianY);
          const raw: number[] = [];
          for (const p of points) raw.push(p.x, p.y, p.z);
          const body = world.createRigidBody(
            RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(worldPos.x, worldPos.y, worldPos.z),
          );
          const desc = RAPIER.ColliderDesc.convexHull(new Float32Array(raw));
          if (desc) {
            world.createCollider(
              desc.setRestitution(FLIPPER_RESTITUTION).setFriction(FLIPPER_FRICTION)
                .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
              body,
            );
          }

          // Wireframe debug — même vertices que Rapier
          const convexGeo = new ConvexGeometry(points);
          const convexMat = new THREE.MeshBasicMaterial({
            color: debugColor,
            wireframe: true,
            transparent: true,
            opacity: 0.85,
            depthTest: false,
          });
          const debugMesh = new THREE.Mesh(convexGeo, convexMat);
          debugMesh.renderOrder = 999;
          debugMesh.visible = false; // caché par défaut, toggle avec H
          scene.add(debugMesh);
          disposableGeos.push(convexGeo);
          disposableMats.push(convexMat);

          return { body, debugMesh };
        };

        const leftResult = makeFlipperBody(leftFlipper as THREE.Mesh | null, 0x00ffff);
        const rightResult = makeFlipperBody(rightFlipper as THREE.Mesh | null, 0xff00ff);
        leftFlipperBody = leftResult.body;
        rightFlipperBody = rightResult.body;
        leftFlipperDebug = leftResult.debugMesh;
        rightFlipperDebug = rightResult.debugMesh;

        ballPhysicsInst.setSpawnPosition(BALL_SPAWN_POSITION.x, BALL_SPAWN_POSITION.y, BALL_SPAWN_POSITION.z);
        ballPhysicsInst.body.wakeUp();

        // ── Plunger visual + kinematic body ──────────────────────────────────
        const PLUNGER_RADIUS = 0.010;
        plungerRestZ = 0.240;

        const pgeo = new THREE.CylinderGeometry(PLUNGER_RADIUS, PLUNGER_RADIUS * 1.3, 0.04, 12);
        const pmat = new THREE.MeshStandardMaterial({ color: 0xddaa00, metalness: 0.9, roughness: 0.15 });
        const pmesh = new THREE.Mesh(pgeo, pmat);
        pmesh.rotation.x = Math.PI / 2;
        pmesh.position.set(BALL_SPAWN_POSITION.x, BALL_SPAWN_POSITION.y, plungerRestZ);
        scene.add(pmesh);
        plungerMesh = pmesh;
        disposableGeos.push(pgeo);
        disposableMats.push(pmat);

        plungerBody = world.createRigidBody(
          RAPIER.RigidBodyDesc.kinematicPositionBased()
            .setTranslation(BALL_SPAWN_POSITION.x, BALL_SPAWN_POSITION.y, plungerRestZ),
        );
        world.createCollider(
          RAPIER.ColliderDesc.cuboid(0.015, 0.015, 0.02).setRestitution(0.4).setFriction(0.1),
          plungerBody,
        );

        // ── Caméra cabine fixe (non rotatable) — tapis jouable uniquement ───────
        modelRoot.updateMatrixWorld(true);
        const camFrameBox = boundingBoxPlayableArea(playfieldRoot);
        camFrameBox.getCenter(cameraTarget);
        const camCorners: THREE.Vector3[] = [];
        fillPlayfieldBoxCorners(camFrameBox, camCorners);
        const fit: PlayfieldCamFit = {
          target: cameraTarget,
          dirToCamera: PLAYFIELD_VIEW_DIR.clone(),
          corners: camCorners,
        };

        const msz = camFrameBox.getSize(new THREE.Vector3());
        camera.near = Math.max(0.001, Math.min(msz.length() * 0.004, 0.25));
        camera.far = Math.max(80, msz.length() * 120);
        camera.updateProjectionMatrix();

        fitPlayfieldCamera(camera, fit, cameraTarget);
        playfieldCamFit = { fit, camera, cameraTarget };

        // ── OrbitControls — caméra libre ─────────────────────────────────────
        orbitControls = new OrbitControls(camera, renderer.domElement);
        orbitControls.target.copy(cameraTarget);
        orbitControls.enableDamping = true;
        orbitControls.dampingFactor = 0.08;
        orbitControls.screenSpacePanning = true;
        orbitControls.minDistance = 0.05;
        orbitControls.maxDistance = 5;
        orbitControls.update();

        // ── Use-cases ─────────────────────────────────────────────────────────
        const plunger = new Plunger();

        const emit = buildEmit(() => { if (ballMesh) ballMesh.visible = false; });
        launchBallUC = new LaunchBall(ballPhysicsInst, plunger, emit);
        bumperHitUC = new BumperHit(ballPhysicsInst, emit);
        drainBallUC = new DrainBall(ballPhysicsInst, emit);

        collisionProcessor = new CollisionEventProcessor(
          colliderMap,
          bumperHitUC,
          drainBallUC,
          emit,
          () => playfieldRootRef,
        );

        // ── Input handling ────────────────────────────────────────────────────
        const onKeyDown = (e: KeyboardEvent) => {
          if (["ArrowLeft", "ArrowRight", " "].includes(e.key)) e.preventDefault();
          if (e.repeat) return;
          if (e.key === "ArrowLeft" || e.key === "q" || e.key === "Q") leftTarget = 1;
          if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") rightTarget = 1;
          if (e.key === "h" || e.key === "H") {
            debugCollidersOn = !debugCollidersOn;
            rapierDebugLines.visible = debugCollidersOn;
            if (leftFlipperDebug)  leftFlipperDebug.visible  = debugCollidersOn;
            if (rightFlipperDebug) rightFlipperDebug.visible = debugCollidersOn;
          }
          if (e.key === " ") {
            if (gameStateRef.current === "game_over") {
              resetGame();
              if (ballMesh) ballMesh.visible = true;
              return;
            }
            if (gameStateRef.current === "idle" && physicsReady) {
              plunger.startCharge(performance.now());
              isChargingPlunger = true;
              chargeStartTime = performance.now();
            }
          }
        };

        const onKeyUp = (e: KeyboardEvent) => {
          if (["ArrowLeft", "ArrowRight", " "].includes(e.key)) e.preventDefault();
          if (e.key === "ArrowLeft" || e.key === "q" || e.key === "Q") leftTarget = 0;
          if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") rightTarget = 0;
          if (e.key === " " && isChargingPlunger && gameStateRef.current === "idle") {
            isChargingPlunger = false;
            plungerState = "releasing";
            const t = Math.min(1, (performance.now() - chargeStartTime) / PLUNGER_CHARGE_MS) ** 1.15;
            const factor = PLUNGER_MIN_FACTOR + (PLUNGER_MAX_FACTOR - PLUNGER_MIN_FACTOR) * t;
            launchBallUC?.execute();
            laneAnimSpeed = 1.0 + factor * 3.0;
          }
        };

        if (cancelled) return;

        document.addEventListener("keydown", onKeyDown);
        document.addEventListener("keyup", onKeyUp);

        (physicsWorld as PhysicsWorld & { _onKeyDown?: typeof onKeyDown; _onKeyUp?: typeof onKeyUp })._onKeyDown = onKeyDown;
        (physicsWorld as PhysicsWorld & { _onKeyDown?: typeof onKeyDown; _onKeyUp?: typeof onKeyUp })._onKeyUp = onKeyUp;

        if (ballMesh) ballMesh.visible = true;
        physicsReady = true;
        mountEl.focus();
      } catch (err) {
        console.error("[Playfield] Erreur chargement :", err);
      }
    };

    void init();

    // ── Sync flipper kinematic body ───────────────────────────────────────────
    const syncFlipperBody = (body: RAPIER.RigidBody | null, flipper: THREE.Object3D | null) => {
      if (!body || !flipper) return;
      flipper.updateMatrixWorld(true);
      const wp = new THREE.Vector3();
      const wq = new THREE.Quaternion();
      flipper.getWorldPosition(wp);
      flipper.getWorldQuaternion(wq);
      body.setNextKinematicTranslation({ x: wp.x, y: wp.y, z: wp.z });
      body.setNextKinematicRotation({ x: wq.x, y: wq.y, z: wq.z, w: wq.w });
    };

    // ── Render loop ───────────────────────────────────────────────────────────
    let frameId: number;

    const animate = (time: number) => {
      frameId = requestAnimationFrame(animate);

      const dt = prevFrameTime > 0 ? Math.min((time - prevFrameTime) / 1000, 0.05) : 0.016;
      prevFrameTime = time;

      syncFlipperBody(leftFlipperBody, leftFlipperObj);
      syncFlipperBody(rightFlipperBody, rightFlipperObj);

      // Sync debug wireframes avec les bodies cinématiques
      if (leftFlipperDebug && leftFlipperObj) {
        const wp = new THREE.Vector3(); const wq = new THREE.Quaternion();
        leftFlipperObj.getWorldPosition(wp); leftFlipperObj.getWorldQuaternion(wq);
        leftFlipperDebug.position.copy(wp);
        leftFlipperDebug.quaternion.copy(wq);
      }
      if (rightFlipperDebug && rightFlipperObj) {
        const wp = new THREE.Vector3(); const wq = new THREE.Quaternion();
        rightFlipperObj.getWorldPosition(wp); rightFlipperObj.getWorldQuaternion(wq);
        rightFlipperDebug.position.copy(wp);
        rightFlipperDebug.quaternion.copy(wq);
      }

      if (physicsWorld) physicsWorld.update(time);

      // Collision events
      if (physicsWorld && collisionProcessor) {
        collisionProcessor.process(physicsWorld.eventQueue, gameStateRef.current);
      }

      // Flipper visuals
      leftSwing += (leftTarget * SWING_RAD - leftSwing) * SWING_SMOOTH;
      rightSwing += (rightTarget * SWING_RAD - rightSwing) * SWING_SMOOTH;
      if (leftPivot) leftPivot.rotation.y = leftSwing;
      if (rightPivot) rightPivot.rotation.y = -rightSwing;

      // Flipper hit detection
      if (ballPhysicsInst && gameStateRef.current === "playing" && laneAnimSpeed <= 0) {
        const bp = ballPhysicsInst.body.translation();
        const bv = ballPhysicsInst.body.linvel();
        const { result, leftHit, rightHit } = detectFlipperHit(
          bp,
          bv,
          leftSwing, prevLeftSwing,
          rightSwing, prevRightSwing,
          leftFlipperHit, rightFlipperHit,
        );
        leftFlipperHit = leftHit;
        rightFlipperHit = rightHit;
        if (result) {
          const v = ballPhysicsInst.body.linvel();
          const damp = 0.55;
          ballPhysicsInst.body.setLinvel(
            { x: v.x * damp, y: v.y * damp, z: v.z * damp },
            true,
          );
          ballPhysicsInst.body.applyImpulse(result.impulse, true);
        }
        if (leftTarget === 0) leftFlipperHit = false;
        if (rightTarget === 0) rightFlipperHit = false;
      }

      prevLeftSwing = leftSwing;
      prevRightSwing = rightSwing;

      // Ball sync
      if (ballMesh?.visible && ballPhysicsInst) {
        if (gameStateRef.current === "idle" && physicsReady) {
          ballPhysicsInst.body.setTranslation(
            { x: BALL_SPAWN_POSITION.x, y: BALL_SPAWN_POSITION.y, z: BALL_SPAWN_POSITION.z },
            true,
          );
          ballPhysicsInst.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
          ballPhysicsInst.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
        }

        // Lane animation
        if (laneAnimSpeed > 0) {
          const { done } = laneAnimator.update(ballPhysicsInst.body, laneAnimSpeed, dt);
          if (done) laneAnimSpeed = 0;
        }

        ballPhysicsInst.syncToMesh(ballMesh);

        // Clamp ball speed
        const bVelClamp = ballPhysicsInst.body.linvel();
        const speed = Math.sqrt(bVelClamp.x ** 2 + bVelClamp.y ** 2 + bVelClamp.z ** 2);
        const MAX_SPEED = 2.8;
        if (speed > MAX_SPEED) {
          const scale = MAX_SPEED / speed;
          ballPhysicsInst.body.setLinvel(
            { x: bVelClamp.x * scale, y: bVelClamp.y * scale, z: bVelClamp.z * scale },
            true,
          );
        }
        if (bVelClamp.y > 0.5) {
          ballPhysicsInst.body.setLinvel({ x: bVelClamp.x, y: 0.1, z: bVelClamp.z }, true);
        }

        const bPos = ballPhysicsInst.body.translation();
        const bVel = ballPhysicsInst.body.linvel();
        const bSpd = Math.sqrt(bVel.x ** 2 + bVel.y ** 2 + bVel.z ** 2);

        // Stuck ball detection
        // Stuck detector — only when NOT in drain zone (Z<0.22)
        if (gameStateRef.current === "playing" && laneAnimSpeed <= 0 && bPos.z < 0.22) {
          const stuckResult = stuckDetector.update(bSpd, bPos, dt);
          if (stuckResult) {
            if (stuckResult.type === 'force_drain') {
              drainBallUC?.execute();
            } else if (stuckResult.impulse) {
              ballPhysicsInst.body.applyImpulse(stuckResult.impulse, true);
            }
          }
        } else {
          stuckDetector.reset();
        }

        // Drain géré uniquement par le sensor Rapier (CollisionEventProcessor)
        // → pas de drain-par-position qui tue la balle avant que les flippers aient pu agir
      }

      // Plunger animation
      if (plungerMesh && plungerRestZ > 0) {
        let plungerZ = plungerRestZ;
        if (isChargingPlunger) {
          const t = Math.min(1, (time - chargeStartTime) / PLUNGER_CHARGE_MS) ** 1.15;
          const pullback = (PLUNGER_MIN_FACTOR + (PLUNGER_MAX_FACTOR - PLUNGER_MIN_FACTOR) * t) * 0.08;
          plungerZ = plungerRestZ + pullback;
        } else if (plungerState === "releasing") {
          plungerZ = plungerRestZ - 0.015;
          if (time - chargeStartTime > PLUNGER_CHARGE_MS * 0.1) plungerState = "returning";
        } else if (plungerState === "returning") {
          plungerZ = plungerRestZ;
          plungerState = "idle";
        }
        plungerMesh.position.z = plungerZ;
        if (plungerBody) {
          plungerBody.setNextKinematicTranslation({
            x: BALL_SPAWN_POSITION.x,
            y: BALL_SPAWN_POSITION.y,
            z: plungerZ,
          });
        }
      }

      // ── OrbitControls update ─────────────────────────────────────────────
      if (orbitControls) orbitControls.update();

      // ── Rapier debug render (tous colliders) ─────────────────────────────
      if (debugCollidersOn && physicsWorld) {
        const { vertices, colors } = physicsWorld.world.debugRender();
        // Rapier retourne RGBA (4 floats/vertex), Three.js LineBasicMaterial attend RGB (3)
        const rgb = new Float32Array(vertices.length);
        for (let i = 0, j = 0; i < colors.length; i += 4, j += 3) {
          rgb[j] = colors[i]; rgb[j + 1] = colors[i + 1]; rgb[j + 2] = colors[i + 2];
        }
        rapierDebugGeo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        rapierDebugGeo.setAttribute('color',    new THREE.BufferAttribute(rgb, 3));
        rapierDebugGeo.computeBoundingSphere();
      }

      renderer.render(scene, camera);
    };

    frameId = requestAnimationFrame(animate);

    // ── Resize ────────────────────────────────────────────────────────────────
    const handleResize = () => {
      if (!mountEl) return;
      const { clientWidth: w, clientHeight: h } = mountEl;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      if (playfieldCamFit) {
        fitPlayfieldCamera(
          playfieldCamFit.camera,
          playfieldCamFit.fit,
          playfieldCamFit.cameraTarget,
        );
      } else {
        camera.up.set(0, 1, 0);
        camera.lookAt(cameraTarget);
      }
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", handleResize);

    // ── Cleanup ───────────────────────────────────────────────────────────────
    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", handleResize);
      orbitControls?.dispose();
      const pw = physicsWorld as (PhysicsWorld & { _onKeyDown?: (e: KeyboardEvent) => void; _onKeyUp?: (e: KeyboardEvent) => void }) | null;
      if (pw?._onKeyDown) document.removeEventListener("keydown", pw._onKeyDown);
      if (pw?._onKeyUp) document.removeEventListener("keyup", pw._onKeyUp);
      if (mountEl.contains(renderer.domElement)) mountEl.removeChild(renderer.domElement);
      disposableGeos.forEach((g) => g.dispose());
      disposableMats.forEach((m) => m.dispose());
      renderer.dispose();
    };
  }, []);

  const cabinetFrameStyle: CSSProperties = cabinetMode
    ? {
        width: "min(100dvw, calc(100dvh * 9 / 16))",
        height: "min(100dvh, calc(100dvw * 16 / 9))",
      }
    : {};

  // ── JSX ───────────────────────────────────────────────────────────────────
  return (
    <div
      className={
        cabinetMode
          ? "flex min-h-[100dvh] w-full items-center justify-center bg-black text-zinc-100"
          : "relative min-h-screen bg-black text-zinc-100"
      }
    >
      <div
        className={
          cabinetMode
            ? "relative overflow-hidden rounded-sm shadow-[0_0_80px_rgba(0,0,0,0.85)] ring-1 ring-zinc-800/40"
            : "relative min-h-screen w-full"
        }
        style={cabinetFrameStyle}
      >
        <GameOverlay
          score={score}
          lives={lives}
          gameState={gameState}
          initialLives={INITIAL_LIVES}
          cabinetMode={cabinetMode}
        />

        <main
          ref={mountRef}
          className={
            cabinetMode
              ? "absolute inset-0 h-full w-full touch-none outline-none focus:outline-none"
              : "h-screen w-full touch-none outline-none focus:outline-none"
          }
          tabIndex={0}
          aria-label="Terrain de flipper — Q/D ou ← → pour les flippers, maintenir ESPACE et relâcher pour lancer"
        />
      </div>
    </div>
  );
}
