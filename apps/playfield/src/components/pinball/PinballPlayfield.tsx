import { useEffect, useRef, useState, type CSSProperties } from "react";
import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { ConvexGeometry } from "three/examples/jsm/geometries/ConvexGeometry.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  PhysicsWorld,
  BallPhysics,
  Plunger,
  LaunchBall,
  BumperHit,
  DrainBall,
  BottomOutBall,
  DetectBottomOut,
  BALL_RADIUS,
  BALL_SPAWN_POSITION,
  SHOOTER_LANE_LEFT_WALL_TOP_Z,
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
  resolvePlayfieldFlippers,
  attachFlipperAtHinge,
  applyFlipperSwing,
  type FlipperPivot,
  CollisionEventProcessor,
  detectFlipperHit,
  StuckBallDetector,
  BallDiagnostics,
  type BallDiagnosticsSnapshot,
  findObjectByNormalizedName,
  removePinballmapUnusedMeshes,
  prepareGltfMaterialsForDisplay,
  configureGltfRenderer,
  createGltfLoader,
  ballCenterOnSurface,
  DROP_TARGETS,
  PlungerPhysics,
  BumperVisuals,
  GarlandLights,
  DemogorgonReveal,
  UpsideDownPortal,
  UpsideDownTransition,
  UpsideDownAtmosphere,
} from "@pinball/game-engine";
import type { ButtonAction, ButtonId } from "@pinball/shared-types";
import { useGameState } from "@/hooks/useGameState";
import { usePhysicalInputs } from "@/hooks/usePhysicalInputs";
import { unlockPinballAudio } from "@/audio/PinballSounds";
import GameOverlay from "./GameOverlay";
import BallDebugOverlay from "./BallDebugOverlay";

const PLAYFIELD_URL = "/playfield/Strangerthings.glb";

type UpsideDownPersistence = "until_game_over" | "until_drain";
const UPSIDE_DOWN_PERSISTENCE: UpsideDownPersistence = "until_game_over";

/**
 * Mode du clavier — `NEXT_PUBLIC_KEYBOARD_MODE` :
 * - `direct` : applique localement (defaut). Latence ~0.
 * - `simulate-esp32` : émet un event Socket.io `dev:simulate-button` au
 *   server qui le retransforme en `input:button` broadcast. Permet de
 *   valider la chaîne réseau sans hardware.
 * - `disabled` : ignore le clavier de jeu. Touche `H` (debug) reste active.
 */
type KeyboardMode = "direct" | "simulate-esp32" | "disabled";
const KEYBOARD_MODE: KeyboardMode =
  (process.env.NEXT_PUBLIC_KEYBOARD_MODE as KeyboardMode) || "direct";

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

  const [debugSnapshot, setDebugSnapshot] = useState<BallDiagnosticsSnapshot | null>(null);
  const [debugVisible, setDebugVisible] = useState(false);
  const debugVisibleRef = useRef(false);

  const {
    score,
    lives,
    gameState,
    gameStateRef,
    demogorgonHud,
    scorePops,
    upsideDownActive,
    upsideDownHint,
    clearUpsideDownSession,
    resetGame,
    buildEmit,
  } = useGameState();

  const { callbacksRef: physicalInputsRef, simulateButton, isConnectedRef } = usePhysicalInputs();

  useEffect(() => {
    let cancelled = false;
    const mountEl = mountRef.current;
    if (!mountEl) return;

    // ── Three.js setup ───────────────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#121828");
    const loader = createGltfLoader();

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

    const ambientLight = new THREE.AmbientLight(0xfff4ee, 0.95);
    scene.add(ambientLight);
    const hemiLight = new THREE.HemisphereLight(0xaabbff, 0x553344, 0.55);
    scene.add(hemiLight);
    const dirLight = new THREE.DirectionalLight(0xfff8f0, 1.75);
    dirLight.position.set(2, 5, 3);
    dirLight.castShadow = true;
    scene.add(dirLight);
    const fillLight = new THREE.DirectionalLight(0xffeedd, 0.65);
    fillLight.position.set(-1.5, 3, -2);
    scene.add(fillLight);

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
    let leftFlipperPivot: FlipperPivot | null = null;
    let rightFlipperPivot: FlipperPivot | null = null;
    let leftFlipperObj: THREE.Object3D | null = null;
    let rightFlipperObj: THREE.Object3D | null = null;
    let leftSwing = 0, rightSwing = 0;
    let leftTarget = 0, rightTarget = 0;
    let prevLeftSwing = 0, prevRightSwing = 0;

    // ── Physics / game objects ───────────────────────────────────────────────
    let ballMesh: THREE.Object3D | null = null;
    let playfieldRootRef: THREE.Object3D | null = null;
    let physicsWorld: PhysicsWorld | null = null;
    let ballPhysicsInst: BallPhysics | null = null;
    let launchBallUC: LaunchBall | null = null;
    let bumperHitUC: BumperHit | null = null;
    let drainBallUC: DrainBall | null = null;
    let bottomOutBallUC: BottomOutBall | null = null;
    let collisionProcessor: CollisionEventProcessor | null = null;
    let bumperVisuals: BumperVisuals | null = null;
    let garlandLights: GarlandLights | null = null;
    let demogorgonReveal: DemogorgonReveal | null = null;
    let upsideDownPortal: UpsideDownPortal | null = null;
    let upsideDownTransition: UpsideDownTransition | null = null;
    let upsideDownAtmosphere: UpsideDownAtmosphere | null = null;
    let leftFlipperBody: RAPIER.RigidBody | null = null;
    let rightFlipperBody: RAPIER.RigidBody | null = null;
    let isChargingPlunger = false;
    let chargeStartTime = 0;
    let physicsReady = false;
    let prevFrameTime = 0;

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

    const stuckDetector = new StuckBallDetector();
    const bottomOutDetector = new DetectBottomOut();
    const diag = new BallDiagnostics();
    let lastDebugPush = 0;

    // ── Plunger kinematic ────────────────────────────────────────────────────
    let plungerBody: RAPIER.RigidBody | null = null;
    let plungerMesh: THREE.Mesh | null = null;
    type PlungerState = "idle" | "charging" | "releasing" | "returning";
    let plungerState: PlungerState = "idle";
    let plungerRestZ = 0;

    const loadPlayfieldGlb = async () => {
      const maxAttempts = 3;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          return await loader.loadAsync(PLAYFIELD_URL);
        } catch (err) {
          console.warn(`[Playfield] GLB load attempt ${attempt}/${maxAttempts} failed`, err);
          if (attempt === maxAttempts) throw err;
          await new Promise((r) => setTimeout(r, 1500 * attempt));
        }
      }
      throw new Error('[Playfield] GLB load failed');
    };

    // ── GLTF + Physics setup ─────────────────────────────────────────────────
    const init = async () => {
      try {
        const gltf = await loadPlayfieldGlb();
        const playfieldRoot = gltf.scene;
        playfieldRootRef = playfieldRoot;
        collectDisposables(playfieldRoot);
        modelRoot.add(playfieldRoot);
        removePinballmapUnusedMeshes(playfieldRoot);
        prepareGltfMaterialsForDisplay(playfieldRoot);

        bumperVisuals = new BumperVisuals();
        bumperVisuals.setup(playfieldRoot);
        garlandLights = new GarlandLights();
        garlandLights.setup(playfieldRoot);
        demogorgonReveal = new DemogorgonReveal();
        demogorgonReveal.setup({
          root: playfieldRoot,
          scene,
          camera,
          garlandLights,
          bumperVisuals,
          onFightEnd: () => collisionProcessor?.setDemogorgonFightActive(false),
          onTargetReady: () => collisionProcessor?.setDemogorgonTargetArmed(true),
        });

        // ── Ball mesh ────────────────────────────────────────────────────────
        const ballGeo = new THREE.SphereGeometry(BALL_RADIUS, 24, 24);
        const ballMat = new THREE.MeshStandardMaterial({ color: 0xd4d4d4, metalness: 0.95, roughness: 0.08 });
        const ballSphere = new THREE.Mesh(ballGeo, ballMat);
        ballSphere.castShadow = true;
        disposableGeos.push(ballGeo);
        disposableMats.push(ballMat);
        scene.add(ballSphere);
        ballMesh = ballSphere;
        ballMesh.visible = false;

        modelRoot.updateMatrixWorld(true);

        const pinballmap =
          findObjectByNormalizedName(playfieldRoot, 'Pinballmap', 'pinballmap') ?? playfieldRoot;

        let flipperSetup = resolvePlayfieldFlippers(playfieldRoot);
        if (!flipperSetup) {
          const meshA = playfieldRoot.getObjectByName('flipper.002');
          const meshB = playfieldRoot.getObjectByName('flipper.003');
          if ((meshA as THREE.Mesh | null)?.isMesh && (meshB as THREE.Mesh | null)?.isMesh) {
            const leftMesh = meshA as THREE.Mesh;
            const rightMesh = meshB as THREE.Mesh;
            const center = new THREE.Vector3();
            leftMesh.updateMatrixWorld(true);
            rightMesh.updateMatrixWorld(true);
            const lx = new THREE.Box3().setFromObject(leftMesh).getCenter(center).x;
            const rx = new THREE.Box3().setFromObject(rightMesh).getCenter(center).x;
            flipperSetup = lx <= rx
              ? { left: leftMesh, right: rightMesh, hide: playfieldRoot }
              : { left: rightMesh, right: leftMesh, hide: playfieldRoot };
          }
        }

        let leftFlipper: THREE.Object3D | null = null;
        let rightFlipper: THREE.Object3D | null = null;

        if (flipperSetup) {
          leftFlipper = flipperSetup.left;
          rightFlipper = flipperSetup.right;
        }

        leftFlipper?.updateMatrixWorld(true);
        rightFlipper?.updateMatrixWorld(true);

        if (leftFlipper && (leftFlipper as THREE.Mesh).isMesh) {
          leftFlipperPivot = attachFlipperAtHinge(leftFlipper, "left", pinballmap);
          leftFlipperObj = leftFlipper;
        }
        if (rightFlipper && (rightFlipper as THREE.Mesh).isMesh) {
          rightFlipperPivot = attachFlipperAtHinge(rightFlipper, "right", pinballmap);
          rightFlipperObj = rightFlipper;
        }

        // ── Physics ──────────────────────────────────────────────────────────
        physicsWorld = await PhysicsWorld.create();
        const world = physicsWorld.world;

        modelRoot.updateMatrixWorld(true);

        const colliderMap = new Map<number, string>();

        PlayfieldTrimeshBuilder.build(playfieldRoot, world);

        const collOnly = playfieldUsesCollOnlyCollision(playfieldRoot);
        PlayfieldColliderFactory.createAll(
          world,
          colliderMap,
          playfieldRoot,
          collOnly
            ? { laneFloor: false, walls: false, bumpers: false }
            : undefined,
        );

        upsideDownTransition = new UpsideDownTransition();
        upsideDownTransition.setup({
          root: playfieldRoot,
          scene,
          camera,
          garlandLights,
          bumperVisuals,
        });

        ballPhysicsInst = new BallPhysics(world);

        // ── Flipper kinematic bodies (ConvexHull) ─────────────────────────────
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
          const allBodyLocal: THREE.Vector3[] = [];
          const v = new THREE.Vector3();
          for (let i = 0; i < posAttr.count; i++) {
            v.fromBufferAttribute(posAttr, i);
            v.applyMatrix4(flipper.matrixWorld);
            v.sub(worldPos);
            v.applyQuaternion(invWorldQuat);
            allBodyLocal.push(v.clone());
          }
          const sortedY = allBodyLocal.map(p => p.y).sort((a, b) => a - b);
          const medianY = sortedY[Math.floor(sortedY.length * 0.50)];
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
          debugMesh.visible = false;
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

        plungerBody = PlungerPhysics.createBody(world, {
          x: BALL_SPAWN_POSITION.x,
          y: BALL_SPAWN_POSITION.y,
          z: plungerRestZ,
        });

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
        let onPortalEnter: (() => void) | null = null;

        const baseEmit = buildEmit(() => {
          if (ballMesh) ballMesh.visible = false;
          diag.noteReset("game_over_hide");
        });
        const releaseUpsideDownWorld = () => {
          upsideDownAtmosphere?.reset();
          clearUpsideDownSession();
        };
        const emit: typeof baseEmit = (event) => {
          baseEmit(event);
          diag.noteEvent(event.type);
          if (event.type === "DRAIN") diag.noteReset("drain");
          if (event.type === "BOTTOM_OUT") diag.noteReset("bottom_out");
          if (event.type === "BALL_LAUNCHED") diag.noteReset("launch");
          bumperVisuals?.onGameEvent(event);
          garlandLights?.onGameEvent(event);
          demogorgonReveal?.onGameEvent(event);
          upsideDownPortal?.onGameEvent(event);
          upsideDownAtmosphere?.onGameEvent(event);
          if (event.type === "DRAIN" && UPSIDE_DOWN_PERSISTENCE === "until_drain") {
            releaseUpsideDownWorld();
          }
          if (event.type === "BOTTOM_OUT" && UPSIDE_DOWN_PERSISTENCE === "until_drain") {
            releaseUpsideDownWorld();
          }
          if (event.type === "PORTAL_ENTER") onPortalEnter?.();
          if (event.type === "BALL_LAUNCHED") {
            collisionProcessor?.resetPortalTrigger();
            bottomOutBallUC?.resetLatch();
          }
          if (event.type === 'DROP_TARGET_HIT') {
            const meshName = event.targetId.replace('drop_', 'drop_target_');
            const mesh = playfieldRootRef?.getObjectByName(meshName);
            if (mesh) mesh.visible = false;
          }
          if (event.type === 'DROP_TARGET_COMPLETE' || event.type === 'DROP_TARGET_RESET') {
            for (const dt of DROP_TARGETS) {
              const mesh = playfieldRootRef?.getObjectByName(dt.id.replace('drop_', 'drop_target_'));
              if (mesh) mesh.visible = true;
            }
          }
        };
        launchBallUC = new LaunchBall(ballPhysicsInst, plunger, emit);
        bumperHitUC = new BumperHit(ballPhysicsInst, emit);
        drainBallUC = new DrainBall(ballPhysicsInst, emit);
        bottomOutBallUC = new BottomOutBall(ballPhysicsInst, emit);

        collisionProcessor = new CollisionEventProcessor(
          colliderMap,
          bumperHitUC,
          drainBallUC,
          bottomOutBallUC,
          emit,
        );

        upsideDownPortal = new UpsideDownPortal();
        upsideDownPortal.setup({
          root: playfieldRoot,
          world,
          colliderMap,
          onOpenChange: (open) => collisionProcessor?.setPortalOpen(open),
        });

        upsideDownAtmosphere = new UpsideDownAtmosphere();
        upsideDownAtmosphere.setup({
          root: playfieldRoot,
          garlandLights,
          bumperVisuals,
          lighting: {
            scene,
            renderer,
            ambient: ambientLight,
            hemi: hemiLight,
            dir: dirLight,
            fill: fillLight,
          },
        });

        onPortalEnter = () => {
          if (!ballMesh || !ballPhysicsInst || !upsideDownTransition || !upsideDownPortal) return;
          if (upsideDownTransition.isActive()) return;
          upsideDownTransition.start(
            {
              ballMesh,
              ballBody: ballPhysicsInst.body,
              onTremorStart: () => emit({ type: "PORTAL_TREMOR" }),
            },
            () => {
              const portal = upsideDownPortal?.getAnchorPosition();
              if (portal) ballPhysicsInst?.ejectFromPortal(portal);
              collisionProcessor?.resetPortalTrigger();
              stuckDetector.reset();
              if (ballMesh) {
                ballMesh.visible = true;
                ballMesh.scale.setScalar(1);
              }
              emit({ type: "PORTAL_TRANSITION_END" });
            },
          );
        };

        demogorgonReveal?.setEmit(emit);

        // ── Input handling ────────────────────────────────────────────────────
        console.log("[PinballPlayfield] KEYBOARD_MODE =", KEYBOARD_MODE);

        // Le callback métier (vrai effet sur le game loop). Source de vérité
        // unique : appelé soit par les events réseau `input:button`, soit
        // localement en mode `direct` via dispatchButton. Le mode
        // `simulate-esp32` n'appelle PAS ce callback directement — il émet sur
        // le réseau et c'est le broadcast server qui rappelle ce même
        // callback via socket.on('input:button').
        physicalInputsRef.current = {
          onButton: (data) => {
            if (data.id === "LEFT") {
              leftTarget = data.action === "DOWN" ? 1 : 0;
              return;
            }
            if (data.id === "RIGHT") {
              rightTarget = data.action === "DOWN" ? 1 : 0;
              return;
            }
            if (data.id === "PLUNGER") {
              if (data.action === "DOWN") {
                // eslint-disable-next-line no-console
                console.info(
                  `[Plunger] DOWN — gameState=${gameStateRef.current} physicsReady=${physicsReady} charging=${isChargingPlunger}`,
                );
                if (gameStateRef.current === "game_over") {
                  resetGame();
                  upsideDownPortal?.reset();
                  upsideDownAtmosphere?.reset();
                  if (ballMesh) ballMesh.visible = true;
                  return;
                }
                if (gameStateRef.current === "idle" && physicsReady) {
                  plunger.startCharge(performance.now());
                  isChargingPlunger = true;
                  chargeStartTime = performance.now();
                } else {
                  // eslint-disable-next-line no-console
                  console.warn(
                    `[Plunger] DOWN ignoré — charge impossible (idle requis + physicsReady). ` +
                      `gameState=${gameStateRef.current} physicsReady=${physicsReady}`,
                  );
                }
              } else if (isChargingPlunger && gameStateRef.current === "idle") {
                isChargingPlunger = false;
                plungerState = "releasing";
                const t = Math.min(1, (performance.now() - chargeStartTime) / PLUNGER_CHARGE_MS) ** 1.15;
                const factor = PLUNGER_MIN_FACTOR + (PLUNGER_MAX_FACTOR - PLUNGER_MIN_FACTOR) * t;
                // eslint-disable-next-line no-console
                console.info(`[Plunger] RELEASE — factor=${factor.toFixed(2)} → lancement`);
                launchBallUC?.execute(factor);
              } else {
                // eslint-disable-next-line no-console
                console.warn(
                  `[Plunger] UP ignoré — pas en charge ou pas idle. ` +
                    `charging=${isChargingPlunger} gameState=${gameStateRef.current}`,
                );
              }
              return;
            }
            if (data.id === "START") {
              if (data.action === "DOWN" && gameStateRef.current === "game_over") {
                resetGame();
                upsideDownPortal?.reset();
                upsideDownAtmosphere?.reset();
                if (ballMesh) ballMesh.visible = true;
              }
            }
          },
          onTilt: (data) => {
            console.log("[playfield] tilt reçu:", data, "— logique non implémentée");
          },
          onSensor: (data) => {
            console.log("[playfield] sensor reçu:", data, "— logique non implémentée");
          },
        };

        const dispatchButton = (id: ButtonId, action: ButtonAction) => {
          if (KEYBOARD_MODE === "disabled") return;
          if (KEYBOARD_MODE === "simulate-esp32") {
            if (isConnectedRef.current) {
              simulateButton({ id, action });
            } else {
              // Fallback si le socket n'est pas prêt (évite un plongeur mort).
              physicalInputsRef.current.onButton?.({ id, action });
            }
            return;
          }
          physicalInputsRef.current.onButton?.({ id, action });
        };

        const onKeyDown = (e: KeyboardEvent) => {
          if (["ArrowLeft", "ArrowRight", " "].includes(e.key)) e.preventDefault();
          unlockPinballAudio();
          if (e.repeat) return;
          // `H` reste TOUJOURS actif (debug), indépendant du KEYBOARD_MODE.
          if (e.key === "h" || e.key === "H") {
            debugCollidersOn = !debugCollidersOn;
            rapierDebugLines.visible = debugCollidersOn;
            if (leftFlipperDebug)  leftFlipperDebug.visible  = debugCollidersOn;
            if (rightFlipperDebug) rightFlipperDebug.visible = debugCollidersOn;
            return;
          }
          if (e.key === "j" || e.key === "J") {
            debugVisibleRef.current = !debugVisibleRef.current;
            setDebugVisible(debugVisibleRef.current);
            return;
          }
          if (e.key === "ArrowLeft" || e.key === "q" || e.key === "Q") dispatchButton("LEFT", "DOWN");
          if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") dispatchButton("RIGHT", "DOWN");
          if (e.key === " ") dispatchButton("PLUNGER", "DOWN");
        };

        const onKeyUp = (e: KeyboardEvent) => {
          if (["ArrowLeft", "ArrowRight", " "].includes(e.key)) e.preventDefault();
          if (e.key === "ArrowLeft" || e.key === "q" || e.key === "Q") dispatchButton("LEFT", "UP");
          if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") dispatchButton("RIGHT", "UP");
          if (e.key === " ") dispatchButton("PLUNGER", "UP");
        };

        if (cancelled) return;

        document.addEventListener("keydown", onKeyDown);
        document.addEventListener("keyup", onKeyUp);

        (physicsWorld as PhysicsWorld & { _onKeyDown?: typeof onKeyDown; _onKeyUp?: typeof onKeyUp })._onKeyDown = onKeyDown;
        (physicsWorld as PhysicsWorld & { _onKeyDown?: typeof onKeyDown; _onKeyUp?: typeof onKeyUp })._onKeyUp = onKeyUp;

        if (ballMesh) ballMesh.visible = true;
        physicsReady = true;
        // eslint-disable-next-line no-console
        console.info("[PinballPlayfield] physicsReady = true (init terminée, plunger actif)");
        mountEl.focus();
      } catch (err) {
        console.error("[Playfield] Erreur chargement :", err);
      }
    };

    void init();

    const syncFlipperBody = (
      body: RAPIER.RigidBody | null,
      flipper: THREE.Object3D | null,
    ) => {
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

      bumperVisuals?.update(dt);
      garlandLights?.update(dt);
      demogorgonReveal?.update(dt);
      upsideDownAtmosphere?.update(dt);
      upsideDownPortal?.update(dt);

      const transitionActive = upsideDownTransition?.isActive() ?? false;
      if (transitionActive) {
        upsideDownTransition?.update(dt);
      } else {
        prevLeftSwing = leftSwing;
        prevRightSwing = rightSwing;
        leftSwing += (leftTarget * SWING_RAD - leftSwing) * SWING_SMOOTH;
        rightSwing += (rightTarget * SWING_RAD - rightSwing) * SWING_SMOOTH;
        if (leftFlipperPivot) applyFlipperSwing(leftFlipperPivot, leftSwing);
        if (rightFlipperPivot) applyFlipperSwing(rightFlipperPivot, rightSwing);

        syncFlipperBody(leftFlipperBody, leftFlipperObj);
        syncFlipperBody(rightFlipperBody, rightFlipperObj);
      }

      if (leftFlipperDebug && leftFlipperObj && !transitionActive) {
        const wp = new THREE.Vector3(); const wq = new THREE.Quaternion();
        leftFlipperObj.getWorldPosition(wp); leftFlipperObj.getWorldQuaternion(wq);
        leftFlipperDebug.position.copy(wp);
        leftFlipperDebug.quaternion.copy(wq);
      }
      if (rightFlipperDebug && rightFlipperObj && !transitionActive) {
        const wp = new THREE.Vector3(); const wq = new THREE.Quaternion();
        rightFlipperObj.getWorldPosition(wp); rightFlipperObj.getWorldQuaternion(wq);
        rightFlipperDebug.position.copy(wp);
        rightFlipperDebug.quaternion.copy(wq);
      }

      if (physicsWorld && !transitionActive) physicsWorld.update(time);

      if (physicsWorld && collisionProcessor && !transitionActive) {
        collisionProcessor.process(physicsWorld.eventQueue, gameStateRef.current);
      }

      // ── Diagnostic balle : pourquoi disparaît/sort + reset de secours ────
      if (ballPhysicsInst && !transitionActive) {
        const lost = diag.update(ballPhysicsInst.body, gameStateRef.current);
        if (lost && gameStateRef.current === "playing") {
          bottomOutBallUC?.execute();
          diag.noteReset("lost_recovery");
        }
        if (debugVisibleRef.current && time - lastDebugPush > 100) {
          lastDebugPush = time;
          setDebugSnapshot({ ...diag.getSnapshot() });
        }
      }

      if (
        ballPhysicsInst
        && gameStateRef.current === "playing"
        && !transitionActive
        && upsideDownPortal?.isOpen()
      ) {
        upsideDownPortal.applyMagnet(ballPhysicsInst.body);
      }

      if (ballPhysicsInst && gameStateRef.current === "playing" && !transitionActive) {
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

      // Ball sync
      if (ballMesh?.visible && ballPhysicsInst && !transitionActive) {
        // Balle figée au spawn tant qu'on est idle, Y COMPRIS pendant la charge
        // du plongeur : sinon la gravité/inclinaison la fait glisser contre le
        // mur droit (frottement → ralentissement au lancement).
        if (gameStateRef.current === "idle" && physicsReady) {
          const z = BALL_SPAWN_POSITION.z;
          ballPhysicsInst.body.setTranslation(
            { x: BALL_SPAWN_POSITION.x, y: ballCenterOnSurface(z), z },
            true,
          );
          ballPhysicsInst.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
          ballPhysicsInst.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
        }

        // Verrouillage latéral du couloir : pendant la montée (partie droite du
        // couloir, avant l'ouverture de sortie), on fige X sur la ligne de spawn
        // et on annule la vitesse latérale → lancement parfaitement droit, sans
        // dépendre de la géométrie GLB. La balle est libérée dès qu'elle atteint
        // la zone de sortie (Z <= SHOOTER_LANE_LEFT_WALL_TOP_Z) pour partir
        // naturellement dans le terrain.
        if (gameStateRef.current === "playing") {
          const lp = ballPhysicsInst.body.translation();
          const inLaneStraight =
            lp.z > SHOOTER_LANE_LEFT_WALL_TOP_Z && lp.x > 0.19;
          if (inLaneStraight) {
            ballPhysicsInst.body.setTranslation(
              { x: BALL_SPAWN_POSITION.x, y: lp.y, z: lp.z },
              true,
            );
            const lv = ballPhysicsInst.body.linvel();
            ballPhysicsInst.body.setLinvel({ x: 0, y: lv.y, z: lv.z }, true);
            const av = ballPhysicsInst.body.angvel();
            ballPhysicsInst.body.setAngvel({ x: av.x, y: 0, z: 0 }, true);
          }
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
        if (bVelClamp.y > 1.25) {
          ballPhysicsInst.body.setLinvel({ x: bVelClamp.x, y: 0.35, z: bVelClamp.z }, true);
        }

        const bPos = ballPhysicsInst.body.translation();
        const bVel = ballPhysicsInst.body.linvel();
        const bSpd = Math.sqrt(bVel.x ** 2 + bVel.y ** 2 + bVel.z ** 2);

        // Stuck ball detection
        // Stuck detector — only when NOT in drain zone (Z<0.22)
        if (gameStateRef.current === "playing" && bPos.z < 0.22) {
          const stuckResult = stuckDetector.update(bSpd, bPos, dt);
          if (stuckResult) {
            if (stuckResult.type === 'force_drain') {
              bottomOutBallUC?.execute();
              diag.noteReset('stuck_force_drain');
            } else if (stuckResult.impulse) {
              ballPhysicsInst.body.applyImpulse(stuckResult.impulse, true);
            }
          }
        } else {
          stuckDetector.reset();
        }

        // Bottom-out fallback — zone sous les flippers hors lane de lancement
        if (
          gameStateRef.current === "playing"
          && bottomOutDetector.check(bPos)
        ) {
          bottomOutBallUC?.execute();
          diag.noteReset('bottom_out_zone');
        }

        // Drain géré par le capteur Rapier bottom_out (CollisionEventProcessor)
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
      if (orbitControls && !transitionActive) orbitControls.update();

      // ── Rapier debug render (tous colliders) ─────────────────────────────
      if (debugCollidersOn && physicsWorld) {
        const { vertices, colors } = physicsWorld.world.debugRender();
        const rgb = new Float32Array(vertices.length);
        for (let i = 0, j = 0; i < colors.length; i += 4, j += 3) {
          rgb[j] = colors[i]; rgb[j + 1] = colors[i + 1]; rgb[j + 2] = colors[i + 2];
        }
        // Certains colliders renvoient des sommets non finis (NaN/Infinity) :
        // on les écrase à 0 pour éviter les pics parasites + l'erreur
        // computeBoundingSphere (radius NaN).
        for (let i = 0; i < vertices.length; i++) {
          if (!Number.isFinite(vertices[i])) vertices[i] = 0;
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
      bumperVisuals?.dispose();
      garlandLights?.dispose();
      demogorgonReveal?.dispose();
      upsideDownPortal?.dispose();
      upsideDownTransition?.dispose();
      upsideDownAtmosphere?.dispose();
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
          demogorgonHud={demogorgonHud}
          scorePops={scorePops}
          upsideDownActive={upsideDownActive}
          upsideDownHint={upsideDownHint}
          cabinetMode={cabinetMode}
        />

        <BallDebugOverlay snapshot={debugSnapshot} visible={debugVisible} />

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
