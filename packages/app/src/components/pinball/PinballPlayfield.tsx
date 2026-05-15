import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
// mergeGeometries removed — each element gets its own collider now
import {
  PhysicsWorld,
  BallPhysics,
  Plunger,
  LaunchBall,
  BumperHit,
  DrainBall,
  BUMPER_POSITIONS,
  WALL_TOP_Z,
  WALL_BOTTOM_Z,
  WALL_LEFT_X,
  WALL_RIGHT_X,
  BALL_RADIUS,
  BALL_SPAWN_POSITION,
  SLINGSHOT_LEFT_CENTER,
  SLINGSHOT_RIGHT_CENTER,
  POP_ZONE_SENSORS,
  ROCKET_SENSOR,
  DROP_TARGETS,
} from "@pinball/game-engine";
import type { GameEventListener } from "@pinball/game-engine";

// ── Constants ──────────────────────────────────────────────────────────────────
const PLAYFIELD_URL = "/playfield/pinball-machine.glb";

const COLLIDER_COLORS: Record<string, { color: string; label: string }> = {
  'playfield':       { color: '#00ff44', label: 'Sol — Trimesh' },
  'playfield_sides': { color: '#333333', label: 'Caisse externe — ignoré' },

  'plastic':                 { color: '#ff8800', label: 'Rail haut — ConvexPoly' },
  'plastic_left':            { color: '#ff8800', label: 'Rail gauche — ConvexPoly' },
  'plastic_pop_bumper_zone': { color: '#ff8800', label: 'Zone bumpers — ConvexPoly' },
  'plastic_rocket':          { color: '#ff8800', label: 'Rail droit — ConvexPoly' },
  'shoulder':                { color: '#ff8800', label: 'Épaule — ConvexPoly' },

  'slingshot': { color: '#cc2200', label: 'Slingshot — ConvexPoly' },

  'pop_bumper':       { color: '#ff0022', label: 'Bumper centre — Cylinder' },
  'pop_bumper_left':  { color: '#ff0022', label: 'Bumper gauche — Cylinder' },
  'pop_bumper_right': { color: '#ff0022', label: 'Bumper droit — Cylinder' },

  'separator_left':  { color: '#ffff00', label: 'Séparateur G — Cylinder' },
  'separator_right': { color: '#ffff00', label: 'Séparateur D — Cylinder' },

  'drop_target_left_1':  { color: '#cc00ff', label: 'Target G1 — Box' },
  'drop_target_left_2':  { color: '#cc00ff', label: 'Target G2 — Box' },
  'drop_target_right_1': { color: '#cc00ff', label: 'Target D1 — Box' },
  'drop_target_right_2': { color: '#cc00ff', label: 'Target D2 — Box' },
  'drop_target_right_3': { color: '#cc00ff', label: 'Target D3 — Box' },

  'switch_out':                    { color: '#0088ff', label: 'Drain — sensor' },
  'switch_center_pop_bumper_zone': { color: '#0088ff', label: 'Sensor bumper C' },
  'switch_left_pop_bumper_zone':   { color: '#0088ff', label: 'Sensor bumper G' },
  'switch_right_pop_bumper_zone':  { color: '#0088ff', label: 'Sensor bumper D' },
  'switch_plunger':                { color: '#0088ff', label: 'Sensor plunger' },
  'switch_slingshot':              { color: '#0088ff', label: 'Sensor slingshot' },
  'switch_rocket':                 { color: '#0088ff', label: 'Sensor rocket' },

  'box':             { color: '#1a1a1a', label: 'Caisse — décoratif' },
  'feet':            { color: '#1a1a1a', label: 'Pieds — décoratif' },
  'glass':           { color: '#1a1a1a', label: 'Vitre — décoratif' },
  'launcher':        { color: '#1a1a1a', label: 'Launcher — décoratif' },
  'plunger_panel':   { color: '#1a1a1a', label: 'Panel — décoratif' },
  'score_board':     { color: '#1a1a1a', label: 'Tableau — décoratif' },
  'coin_slot':       { color: '#1a1a1a', label: 'Monnayeur — décoratif' },
  'flipper_buttons': { color: '#1a1a1a', label: 'Boutons — décoratif' },
  'pop_bumper_guard':{ color: '#1a1a1a', label: 'Guard bumper — décoratif' },
  'spinner':         { color: '#1a1a1a', label: 'Spinner — décoratif' },
  'plate':           { color: '#1a1a1a', label: 'Plaque — décoratif' },
  'start_button':    { color: '#1a1a1a', label: 'Bouton start — décoratif' },
  'exit_cover':      { color: '#1a1a1a', label: 'Cover — décoratif' },

  'flipper':             { color: '#00ffff', label: 'Flipper — kinematic' },
  'flipper_left_split':  { color: '#00ffff', label: 'Flipper G — kinematic' },
  'flipper_right_split': { color: '#00ffff', label: 'Flipper D — kinematic' },
};

const FLIPPER_LEFT_NAME = "flipper";
const FLIPPER_RIGHT_NAME = "flipper";

const SWING_RAD = 0.65;
const SWING_SMOOTH = 0.42;
const HINGE_INSET_FROM_EDGE = 0.18;

const INITIAL_LIVES = 3;
const PLUNGER_CHARGE_MS = 1800;
const PLUNGER_MIN_FACTOR = 0.32;
const PLUNGER_MAX_FACTOR = 1.0;

const DRAIN_Z = WALL_BOTTOM_Z + BALL_RADIUS * 2;

// ── Types ──────────────────────────────────────────────────────────────────────
type GameState = "idle" | "playing" | "game_over";

// ── Helper : attachement pivot de charnière ────────────────────────────────────
function attachFlipperAtHinge(
  flipper: THREE.Object3D,
  side: "left" | "right",
): THREE.Object3D {
  const parent = flipper.parent;
  if (!parent) return flipper;

  flipper.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(flipper);
  const { min, max } = box;
  const midY = (min.y + max.y) / 2;
  const midZ = (min.z + max.z) / 2;
  const widthX = max.x - min.x;
  const inset = widthX * HINGE_INSET_FROM_EDGE;
  const hingeX = side === "left" ? min.x + inset : max.x - inset;

  const pivot = new THREE.Group();
  pivot.name = `${flipper.name}_pivot`;
  const hingeWorld = new THREE.Vector3(hingeX, midY, midZ);
  const hingeLocal = hingeWorld.clone();
  parent.worldToLocal(hingeLocal);
  pivot.position.copy(hingeLocal);
  parent.add(pivot);
  pivot.attach(flipper);
  return pivot;
}

// ── Helper : split géométrique du flipper unique en deux moitiés ──────────────
function splitFlipperIntoTwo(
  flipperObj: THREE.Object3D,
): [THREE.Mesh | null, THREE.Mesh | null] {
  let src: THREE.Mesh | null = null;
  if (flipperObj instanceof THREE.Mesh) {
    src = flipperObj;
  } else {
    flipperObj.traverse((c) => {
      if (!src && c instanceof THREE.Mesh) src = c as THREE.Mesh;
    });
  }
  if (!src || !flipperObj.parent) return [null, null];

  src.updateMatrixWorld(true);
  flipperObj.parent.updateMatrixWorld(true);

  const worldMat = src.matrixWorld;
  const toParent = flipperObj.parent.matrixWorld.clone().invert();
  const geom = src.geometry as THREE.BufferGeometry;
  const posAttr = geom.attributes.position as THREE.BufferAttribute;
  const uvAttr = geom.attributes.uv as THREE.BufferAttribute | undefined;
  const vertCount = posAttr.count;

  const wX: number[] = new Array(vertCount);
  const localVerts: number[][] = new Array(vertCount);
  const tmp = new THREE.Vector3();
  for (let i = 0; i < vertCount; i++) {
    tmp.fromBufferAttribute(posAttr, i).applyMatrix4(worldMat);
    wX[i] = tmp.x;
    tmp.applyMatrix4(toParent);
    localVerts[i] = [tmp.x, tmp.y, tmp.z];
  }

  const idxArr: number[] = geom.index
    ? Array.from(geom.index.array as ArrayLike<number>)
    : Array.from({ length: vertCount }, (_, i) => i);

  const leftTris: number[] = [];
  const rightTris: number[] = [];
  for (let t = 0; t < idxArr.length; t += 3) {
    const a = idxArr[t],
      b = idxArr[t + 1],
      c = idxArr[t + 2];
    const cx = (wX[a] + wX[b] + wX[c]) / 3;
    (cx <= 0 ? leftTris : rightTris).push(a, b, c);
  }

  const buildGeom = (tris: number[]): THREE.BufferGeometry | null => {
    if (tris.length === 0) return null;
    const remap = new Map<number, number>();
    const pos: number[] = [],
      uvs: number[] = [],
      idx: number[] = [];
    for (const old of tris) {
      if (!remap.has(old)) {
        remap.set(old, pos.length / 3);
        const [lx, ly, lz] = localVerts[old];
        pos.push(lx, ly, lz);
        if (uvAttr) uvs.push(uvAttr.getX(old), uvAttr.getY(old));
      }
      idx.push(remap.get(old)!);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    if (uvs.length)
      g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  };

  const baseMat = src.material as THREE.MeshStandardMaterial;
  const makeMesh = (tris: number[], name: string): THREE.Mesh | null => {
    const g = buildGeom(tris);
    if (!g) return null;
    const m = new THREE.Mesh(g, baseMat.clone());
    m.name = name;
    m.castShadow = m.receiveShadow = true;
    return m;
  };

  return [
    makeMesh(leftTris, "flipper_left_split"),
    makeMesh(rightTris, "flipper_right_split"),
  ];
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function PinballPlayfield() {
  const mountRef = useRef<HTMLDivElement | null>(null);

  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(INITIAL_LIVES);
  const [gameState, setGameState] = useState<GameState>("idle");
  const [debugPos, setDebugPos] = useState({
    x: BALL_SPAWN_POSITION.x as number,
    y: BALL_SPAWN_POSITION.y as number,
    z: BALL_SPAWN_POSITION.z as number,
  });

  const scoreRef = useRef(0);
  const livesRef = useRef(INITIAL_LIVES);
  const gameStateRef = useRef<GameState>("idle");
  const debugSpawnRef = useRef<((x: number, y: number, z: number) => void) | null>(null);
  const debugCursorRef = useRef<THREE.Mesh | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const wireframeMeshesRef = useRef<THREE.Mesh[]>([]);
  const [debugColliders, setDebugColliders] = useState(false);
  const [debugRadius, setDebugRadius] = useState(BALL_RADIUS);
  const debugResizeBallRef = useRef<((r: number) => void) | null>(null);
  void debugCursorRef;

  useEffect(() => {
    let cancelled = false;
    const mountEl = mountRef.current;
    if (!mountEl) return;

    // ── Three.js setup ───────────────────────────────────────────────────────
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color("#050816");
    const loader = new GLTFLoader();

    const { clientWidth, clientHeight } = mountEl;
    const camera = new THREE.PerspectiveCamera(
      60,
      clientWidth / clientHeight,
      0.001,
      100,
    );
    const cameraTarget = new THREE.Vector3();

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(clientWidth, clientHeight);
    renderer.shadowMap.enabled = true;
    mountEl.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 1.0));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
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
    let leftSwing = 0,
      rightSwing = 0;
    let leftTarget = 0,
      rightTarget = 0;
    let prevLeftSwing = 0,
      prevRightSwing = 0;

    // ── Physics / game state ─────────────────────────────────────────────────
    let fieldBounds = {
      leftX: WALL_LEFT_X, rightX: WALL_RIGHT_X,
      topZ: WALL_TOP_Z, bottomZ: WALL_BOTTOM_Z,
      surfaceY: BALL_SPAWN_POSITION.y - BALL_RADIUS,
      laneSepX: BALL_SPAWN_POSITION.x - BALL_RADIUS * 2,
    };
    let ballMesh: THREE.Object3D | null = null;
    let playfieldRootRef: THREE.Object3D | null = null;
    let physicsWorld: PhysicsWorld | null = null;
    let ballPhysicsInst: BallPhysics | null = null;
    let launchBallUC: LaunchBall | null = null;
    let bumperHitUC: BumperHit | null = null;
    let drainBallUC: DrainBall | null = null;
    let colliderMap: Map<number, string> | null = null;
    let emitFn: GameEventListener | null = null;
    let leftFlipperBody: RAPIER.RigidBody | null = null;
    let rightFlipperBody: RAPIER.RigidBody | null = null;
    let leftFlipperBBox: THREE.Box3 | null = null;
    let rightFlipperBBox: THREE.Box3 | null = null;
    let isChargingPlunger = false;
    let chargeStartTime = 0;
    let physicsReady = false;
    let prevFrameTime = 0;
    let laneAnimSpeed = 0;  // >0 means ball is being animated through lane
    let leftFlipperHit = false;
    let rightFlipperHit = false;
    let stuckTimer = 0;  // time ball has been near-stationary
    const dropTargetDown: Record<string, boolean> = {};
    for (const dt of DROP_TARGETS) dropTargetDown[dt.id] = false;

    // ── Plunger kinématique ───────────────────────────────────────────────────
    let plungerBody: RAPIER.RigidBody | null = null;
    let plungerMesh: THREE.Mesh | null = null;
    type PlungerState = 'idle' | 'charging' | 'releasing' | 'returning';
    let plungerState: PlungerState = 'idle';
    let plungerRestZ = 0;
    let plungerReleaseSpeed = 0;

    const updateGameState = (state: GameState) => {
      gameStateRef.current = state;
      setGameState(state);
    };

    const handleDrain = () => {
      const newLives = livesRef.current - 1;
      livesRef.current = newLives;
      setLives(newLives);
      if (newLives <= 0) {
        if (ballMesh) ballMesh.visible = false;
        updateGameState("game_over");
      } else {
        updateGameState("idle");
      }
    };

    const resetGame = () => {
      scoreRef.current = 0;
      setScore(0);
      livesRef.current = INITIAL_LIVES;
      setLives(INITIAL_LIVES);
      updateGameState("idle");
    };

    // ── GLTF + Physics setup ─────────────────────────────────────────────────
    const init = async () => {
      try {
        const gltf = await loader.loadAsync(PLAYFIELD_URL);
        const playfieldRoot = gltf.scene;
        playfieldRootRef = playfieldRoot;
        collectDisposables(playfieldRoot);
        modelRoot.add(playfieldRoot);

        gltf.scene.traverse((child) => {
          if (!(child instanceof THREE.Mesh)) return;
          const nameLC = child.name.toLowerCase();
          const mat = child.material as THREE.MeshStandardMaterial;
          if (!mat || Array.isArray(mat)) return;
          if (nameLC.includes("flipper") && !nameLC.includes("button")) {
            mat.emissive = new THREE.Color("#ff6600");
            mat.emissiveIntensity = 0.28;
          }
        });

        // ── Ball mesh from GLB ───────────────────────────────────────────────
        const glbBallNode = playfieldRoot.getObjectByName("ball");
        if (glbBallNode) glbBallNode.visible = false;

        const ballGeo = new THREE.SphereGeometry(BALL_RADIUS, 24, 24);
        const ballMat = new THREE.MeshStandardMaterial({
          color: 0xd4d4d4,
          metalness: 0.95,
          roughness: 0.08,
        });
        const ballSphere = new THREE.Mesh(ballGeo, ballMat);
        ballSphere.castShadow = true;
        disposableGeos.push(ballGeo);
        disposableMats.push(ballMat);
        scene.add(ballSphere);
        ballMesh = ballSphere;
        ballMesh.visible = false;

        // ── Flipper split ────────────────────────────────────────────────────
        const baseFlipper =
          playfieldRoot.getObjectByName(FLIPPER_LEFT_NAME) ?? null;
        let leftFlipper: THREE.Object3D | null = null;
        let rightFlipper: THREE.Object3D | null = null;

        if (baseFlipper?.parent) {
          const [lMesh, rMesh] = splitFlipperIntoTwo(baseFlipper);
          if (lMesh && rMesh) {
            baseFlipper.visible = false;
            baseFlipper.parent.add(lMesh);
            baseFlipper.parent.add(rMesh);
            disposableGeos.push(lMesh.geometry, rMesh.geometry);
            disposableMats.push(
              lMesh.material as THREE.Material,
              rMesh.material as THREE.Material,
            );
            leftFlipper = lMesh;
            rightFlipper = rMesh;
          } else {
            leftFlipper = baseFlipper;
            rightFlipper = baseFlipper;
          }
        }

        leftFlipper?.updateMatrixWorld(true);
        rightFlipper?.updateMatrixWorld(true);
        leftFlipperBBox = leftFlipper
          ? new THREE.Box3().setFromObject(leftFlipper)
          : null;
        rightFlipperBBox = rightFlipper
          ? new THREE.Box3().setFromObject(rightFlipper)
          : null;

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

        // Bornes réelles du terrain depuis la bounding box du modèle GLB
        modelRoot.updateMatrixWorld(true);
        const fieldBox = new THREE.Box3().setFromObject(modelRoot);
        fieldBounds = {
          leftX:    fieldBox.min.x,
          rightX:   fieldBox.max.x,
          topZ:     fieldBox.min.z,
          bottomZ:  fieldBox.max.z,
          surfaceY: BALL_SPAWN_POSITION.y - BALL_RADIUS,
          laneSepX: BALL_SPAWN_POSITION.x - BALL_RADIUS * 2,
        };
        colliderMap = new Map<number, string>();

        // ── Trimesh — merged from physical GLB meshes ─────────────────────────
        // Include: playfield surface, rails, guides, shoulders, slingshots, sides
        // Exclude: cabinet box, glass, decorative, bumpers (have cylinders), sensors
        playfieldRoot.updateMatrixWorld(true);
        // Include all physical elements. Exclude: cabinet, decorative, bumpers (have cylinders), sensors
        // Names from Three.js (underscores, not spaces)
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
          // Dark objects blocking passages
          'separator_left', 'separator_right',
          'plastic_pop_bumper_zone',
          // Rails — ball rides on top of them instead of playfield surface
          'plastic', 'plastic_left', 'plastic_rocket',
        ]);
        const trimGeos: THREE.BufferGeometry[] = [];
        playfieldRoot.traverse((child) => {
          if (!(child instanceof THREE.Mesh)) return;
          // Check mesh name AND all parent names against SKIP
          let skipped = false;
          let node: THREE.Object3D | null = child;
          while (node) {
            if (SKIP.has(node.name.toLowerCase())) { skipped = true; break; }
            node = node.parent;
          }
          if (skipped) return;
          child.updateMatrixWorld(true);
          const geo = child.geometry.clone() as THREE.BufferGeometry;
          geo.applyMatrix4(child.matrixWorld);
          const posOnly = new THREE.BufferGeometry();
          posOnly.setAttribute('position', geo.getAttribute('position'));
          if (geo.index) posOnly.setIndex(geo.index);
          trimGeos.push(posOnly);
        });

        if (trimGeos.length > 0) {
          // Merge all into one trimesh
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
        }

        // ── Launcher lane floor — no trimesh geometry here ──────────────────
        // Lane: X [0.206, 0.265], Z [0.03, 0.42], tilted surface
        {
          const surfaceYAtZ = (z: number) => 1.068 - ((z + 0.552) / 0.970) * 0.110;
          const laneTopZ = 0.03;
          const laneBotZ = 0.42;
          const laneMidZ = (laneTopZ + laneBotZ) / 2;
          const laneHalfZ = (laneBotZ - laneTopZ) / 2;
          const laneMidX = (0.206 + 0.265) / 2;
          const laneHalfX = (0.265 - 0.206) / 2;
          const yTop = surfaceYAtZ(laneTopZ);
          const yBot = surfaceYAtZ(laneBotZ);
          const laneMidY = (yTop + yBot) / 2;
          const tiltAngle = Math.atan2(yTop - yBot, laneBotZ - laneTopZ);
          const laneFloorBody = world.createRigidBody(
            RAPIER.RigidBodyDesc.fixed()
              .setTranslation(laneMidX, laneMidY, laneMidZ)
              .setRotation({
                x: Math.sin(tiltAngle / 2), y: 0, z: 0, w: Math.cos(tiltAngle / 2),
              }),
          );
          world.createCollider(
            RAPIER.ColliderDesc.cuboid(laneHalfX, 0.003, laneHalfZ)
              .setRestitution(0.35).setFriction(0.15),
            laneFloorBody,
          );
        }

        // ── Walls ────────────────────────────────────────────────────────────
        {
          const WALL_H = 0.06;
          const WALL_T = 0.015;
          const HH = WALL_H / 2;
          const HT = WALL_T / 2;
          const surfaceYAtZ = (z: number) => 1.068 - ((z + 0.552) / 0.970) * 0.110;
          const laneSepX = BALL_SPAWN_POSITION.x - BALL_RADIUS * 2;

          const walls = [
            { hx: HT, hy: HH, hz: 0.485, px: -0.265, py: surfaceYAtZ(-0.067) + HH, pz: -0.067 },
            { hx: HT, hy: HH, hz: 0.485, px:  0.265, py: surfaceYAtZ(-0.067) + HH, pz: -0.067 },
            { hx: 0.265, hy: HH, hz: HT, px: 0.0, py: surfaceYAtZ(-0.552) + HH, pz: -0.552 },
            { hx: HT, hy: HH, hz: 0.50, px: laneSepX, py: surfaceYAtZ(-0.05) + HH, pz: -0.05 },
            { hx: 0.265, hy: HH, hz: HT, px: 0.0, py: surfaceYAtZ(0.418) + HH, pz: 0.420 },
          ];
          for (const w of walls) {
            const wallBody = world.createRigidBody(
              RAPIER.RigidBodyDesc.fixed().setTranslation(w.px, w.py, w.pz),
            );
            world.createCollider(
              RAPIER.ColliderDesc.cuboid(w.hx, w.hy, w.hz).setRestitution(0.4).setFriction(0.1),
              wallBody,
            );
          }
        }

        // ── Bumpers : Cylinder — exact GLB positions ──────────────────────────
        for (let i = 0; i < BUMPER_POSITIONS.length; i++) {
          const pos = BUMPER_POSITIONS[i];
          const bumperBody = world.createRigidBody(
            RAPIER.RigidBodyDesc.fixed().setTranslation(pos.x, pos.y, pos.z),
          );
          const bumperCol = world.createCollider(
            RAPIER.ColliderDesc.cylinder(0.020, 0.025)
              .setRestitution(0.3)
              .setFriction(0)
              .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
            bumperBody,
          );
          colliderMap!.set(bumperCol.handle, `bumper_${i}`);
        }

        // ── Playfield barriers — shoulders, slingshots, posts, guides ────────
        {
          const surfY = (z: number) => 1.068 - ((z + 0.552) / 0.970) * 0.110;

          // Posts + right-side wall to close drain gap
          const barriers: Array<{
            name: string; color: number;
            type: 'cyl' | 'box';
            px: number; pz: number; hAbove: number;
            r?: number; hh?: number;
            hx?: number; hy?: number; hz?: number;
            rest?: number;
          }> = [
            // Outlane posts — wider apart to cover flipper edges
            { name: 'OutlaneL', color: 0xff00ff, type: 'cyl', px: -0.14, pz: 0.28, hAbove: 0.012, r: 0.012, hh: 0.015 },
            { name: 'OutlaneR', color: 0x00ffff, type: 'cyl', px: 0.10, pz: 0.28, hAbove: 0.012, r: 0.012, hh: 0.015 },
            // Center post between flippers
            { name: 'CenterPost', color: 0xffffff, type: 'cyl', px: -0.02, pz: 0.32, hAbove: 0.012, r: 0.015, hh: 0.015 },
            // Right-side wall: closes gap between outlane R and lane separator
            { name: 'WallR', color: 0xff8800, type: 'box', px: 0.155, pz: 0.32, hAbove: 0.015, hx: 0.008, hy: 0.025, hz: 0.08 },
            // Left-side wall: closes gap between outlane L and left wall
            { name: 'WallL', color: 0x88ff00, type: 'box', px: -0.20, pz: 0.32, hAbove: 0.015, hx: 0.008, hy: 0.025, hz: 0.08 },
          ];

          for (const b of barriers) {
            const py = surfY(b.pz) + b.hAbove;
            const body = world.createRigidBody(
              RAPIER.RigidBodyDesc.fixed().setTranslation(b.px, py, b.pz),
            );
            let dg: THREE.BufferGeometry;
            if (b.type === 'cyl') {
              world.createCollider(
                RAPIER.ColliderDesc.cylinder(b.hh!, b.r!)
                  .setRestitution(b.rest ?? 0.4).setFriction(0.1),
                body,
              );
              dg = new THREE.CylinderGeometry(b.r!, b.r!, b.hh! * 2, 12);
            } else {
              world.createCollider(
                RAPIER.ColliderDesc.cuboid(b.hx!, b.hy!, b.hz!)
                  .setRestitution(b.rest ?? 0.4).setFriction(0.1),
                body,
              );
              dg = new THREE.BoxGeometry(b.hx! * 2, b.hy! * 2, b.hz! * 2);
            }
            const dm = new THREE.MeshBasicMaterial({ color: b.color, transparent: true, opacity: 0.7 });
            const dMesh = new THREE.Mesh(dg, dm);
            dMesh.position.set(b.px, py, b.pz);
            dMesh.name = b.name;
            scene.add(dMesh);
          }
        }

        // ── Slingshot sensors (×2) — score + repulsion ──────────────────────
        {
          const slings = [
            { pos: SLINGSHOT_LEFT_CENTER, role: 'slingshot_left' },
            { pos: SLINGSHOT_RIGHT_CENTER, role: 'slingshot_right' },
          ];
          for (const s of slings) {
            const b = world.createRigidBody(
              RAPIER.RigidBodyDesc.fixed().setTranslation(s.pos.x, s.pos.y, s.pos.z),
            );
            const col = world.createCollider(
              RAPIER.ColliderDesc.cuboid(0.06, 0.015, 0.03)
                .setSensor(true)
                .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
              b,
            );
            colliderMap!.set(col.handle, s.role);
          }
        }

        // ── Pop bumper zone sensors (×3) — bonus score ────────────────────────
        {
          for (let i = 0; i < POP_ZONE_SENSORS.length; i++) {
            const p = POP_ZONE_SENSORS[i];
            const b = world.createRigidBody(
              RAPIER.RigidBodyDesc.fixed().setTranslation(p.x, p.y, p.z),
            );
            const col = world.createCollider(
              RAPIER.ColliderDesc.cuboid(0.015, 0.010, 0.015)
                .setSensor(true)
                .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
              b,
            );
            colliderMap!.set(col.handle, `pop_zone_${i}`);
          }
        }

        // ── Rocket ramp sensor — high-value target ────────────────────────────
        {
          const b = world.createRigidBody(
            RAPIER.RigidBodyDesc.fixed().setTranslation(ROCKET_SENSOR.x, ROCKET_SENSOR.y, ROCKET_SENSOR.z),
          );
          const col = world.createCollider(
            RAPIER.ColliderDesc.cuboid(0.015, 0.010, 0.020)
              .setSensor(true)
              .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
            b,
          );
          colliderMap!.set(col.handle, 'rocket_ramp');
        }

        // ── Drop targets (×5) — physical blockers + score ─────────────────────
        {
          for (const dt of DROP_TARGETS) {
            const b = world.createRigidBody(
              RAPIER.RigidBodyDesc.fixed().setTranslation(dt.x, dt.y, dt.z),
            );
            const col = world.createCollider(
              RAPIER.ColliderDesc.cuboid(0.006, 0.020, 0.015)
                .setRestitution(0.3)
                .setFriction(0.1)
                .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
              b,
            );
            colliderMap!.set(col.handle, dt.id);
          }
        }

        // ── Drain sensor — at actual bottom of playfield, not GLB switch_out ──
        {
          const surfaceYAtZ = (z: number) => 1.068 - ((z + 0.552) / 0.970) * 0.110;
          const drainZ = 0.40; // just before bottom wall
          const drainBody = world.createRigidBody(
            RAPIER.RigidBodyDesc.fixed().setTranslation(0.0, surfaceYAtZ(drainZ), drainZ),
          );
          const drainCol = world.createCollider(
            RAPIER.ColliderDesc.cuboid(0.25, 0.03, 0.01)
              .setSensor(true)
              .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
            drainBody,
          );
          colliderMap!.set(drainCol.handle, 'drain');
        }

        // ── Wireframes debug (geometry data stored alongside collider creation) ──
        // Wireframes are built from a parallel list of simple shapes
        const wireframeData: Array<{
          type: 'box';
          hx: number; hy: number; hz: number;
          px: number; py: number; pz: number;
          qx: number; qy: number; qz: number; qw: number;
        } | {
          type: 'sphere';
          radius: number;
          px: number; py: number; pz: number;
        } | {
          type: 'cylinder';
          halfHeight: number; radius: number;
          px: number; py: number; pz: number;
        }> = [];

        world.forEachCollider((col) => {
          const parent = col.parent();
          if (!parent) return;
          const t = parent.translation();
          const q = parent.rotation();
          const shape = col.shape;
          if (shape.type === RAPIER.ShapeType.Cuboid) {
            const half = (shape as RAPIER.Cuboid).halfExtents;
            wireframeData.push({ type: 'box', hx: half.x, hy: half.y, hz: half.z, px: t.x, py: t.y, pz: t.z, qx: q.x, qy: q.y, qz: q.z, qw: q.w });
          } else if (shape.type === RAPIER.ShapeType.Ball) {
            wireframeData.push({ type: 'sphere', radius: (shape as RAPIER.Ball).radius, px: t.x, py: t.y, pz: t.z });
          } else if (shape.type === RAPIER.ShapeType.Cylinder) {
            const cyl = shape as RAPIER.Cylinder;
            wireframeData.push({ type: 'cylinder', halfHeight: cyl.halfHeight, radius: cyl.radius, px: t.x, py: t.y, pz: t.z });
          }
        });

        for (const wd of wireframeData) {
          let geo: THREE.BufferGeometry;
          if (wd.type === 'box') {
            geo = new THREE.BoxGeometry(wd.hx * 2, wd.hy * 2, wd.hz * 2);
          } else if (wd.type === 'sphere') {
            geo = new THREE.SphereGeometry(wd.radius, 8, 6);
          } else {
            geo = new THREE.CylinderGeometry(wd.radius, wd.radius, wd.halfHeight * 2, 12);
          }
          const mat = new THREE.MeshBasicMaterial({ color: 0x00ffff, wireframe: true, opacity: 0.55, transparent: true });
          const wfMesh = new THREE.Mesh(geo, mat);
          wfMesh.position.set(wd.px, wd.py, wd.pz);
          if (wd.type === 'box') {
            wfMesh.quaternion.set(wd.qx, wd.qy, wd.qz, wd.qw);
          }
          wfMesh.visible = false;
          wireframeMeshesRef.current.push(wfMesh);
          scene.add(wfMesh);
          disposableGeos.push(geo);
          disposableMats.push(mat);
        }

        ballPhysicsInst = new BallPhysics(world);

        // ── Resize ball at runtime ────────────────────────────────────────────
        debugResizeBallRef.current = (newRadius: number) => {
          if (!ballPhysicsInst || !ballMesh) return;
          // Remove old collider, create new one
          world.removeCollider(ballPhysicsInst.collider, false);
          const density = 0.08 / ((4 / 3) * Math.PI * newRadius ** 3);
          const newCol = world.createCollider(
            RAPIER.ColliderDesc.ball(newRadius)
              .setRestitution(0.4)
              .setFriction(0.1)
              .setDensity(density)
              .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
            ballPhysicsInst.body,
          );
          (ballPhysicsInst as unknown as Record<string, unknown>).collider = newCol;
          // Update visual mesh
          const sphere = ballMesh as THREE.Mesh;
          sphere.geometry.dispose();
          sphere.geometry = new THREE.SphereGeometry(newRadius, 24, 24);
          console.info(`[Debug] Ball radius → ${newRadius.toFixed(4)}`);
        };

        // ── Debug cursor ──────────────────────────────────────────────────────
        const cursorGeo = new THREE.SphereGeometry(BALL_RADIUS, 12, 12);
        const cursorMat = new THREE.MeshBasicMaterial({ color: 0xff6600, wireframe: true });
        const cursorMesh = new THREE.Mesh(cursorGeo, cursorMat);
        cursorMesh.visible = false;
        scene.add(cursorMesh);
        debugCursorRef.current = cursorMesh;
        disposableGeos.push(cursorGeo);
        disposableMats.push(cursorMat);

        debugSpawnRef.current = (x: number, y: number, z: number) => {
          ballPhysicsInst!.setSpawnPosition(x, y, z);
          cursorMesh.position.set(x, y, z);
          cursorMesh.visible = true;
          console.info(`[Debug spawn] x=${x.toFixed(4)}, y=${y.toFixed(4)}, z=${z.toFixed(4)}`);
        };

        // Flipper kinematic bodies
        const makeFlipperBody = (
          bbox: THREE.Box3 | null,
        ): RAPIER.RigidBody | null => {
          if (!bbox) return null;
          const sz = bbox.getSize(new THREE.Vector3());
          const cx = bbox.getCenter(new THREE.Vector3());
          const body = world.createRigidBody(
            RAPIER.RigidBodyDesc.kinematicPositionBased()
              .setTranslation(cx.x, cx.y, cx.z),
          );
          const halfY = Math.max(sz.y / 2, BALL_RADIUS * 3);
          world.createCollider(
            RAPIER.ColliderDesc.cuboid(sz.x / 2, halfY, sz.z / 2 + BALL_RADIUS)
              .setRestitution(0.8)
              .setFriction(0.2)
              .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
            body,
          );
          return body;
        };
        leftFlipperBody  = makeFlipperBody(leftFlipperBBox);
        rightFlipperBody = makeFlipperBody(rightFlipperBBox);

        ballPhysicsInst.setSpawnPosition(
          BALL_SPAWN_POSITION.x,
          BALL_SPAWN_POSITION.y,
          BALL_SPAWN_POSITION.z,
        );
        ballPhysicsInst.body.wakeUp();

        // ── Plunger visuel + corps physique kinématique ───────────────────────
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

        // ── Ligne de trajectoire plunger (debug H) ────────────────────────────
        const trajectoryPoints = [
          new THREE.Vector3(BALL_SPAWN_POSITION.x, BALL_SPAWN_POSITION.y, WALL_BOTTOM_Z),
          new THREE.Vector3(BALL_SPAWN_POSITION.x, BALL_SPAWN_POSITION.y, WALL_TOP_Z),
        ];
        const trajectoryGeo = new THREE.BufferGeometry().setFromPoints(trajectoryPoints);
        const trajectoryMat = new THREE.LineBasicMaterial({ color: 0xffaa00, opacity: 0.8, transparent: true });
        const trajectoryLine = new THREE.Line(trajectoryGeo, trajectoryMat);
        trajectoryLine.visible = false;
        scene.add(trajectoryLine);
        disposableGeos.push(trajectoryGeo);
        disposableMats.push(trajectoryMat);
        wireframeMeshesRef.current.push(trajectoryLine as unknown as THREE.Mesh);

        // ── Caméra — vue plongeante centrée sur le modèle ────────────────────
        modelRoot.updateMatrixWorld(true);
        const mb  = new THREE.Box3().setFromObject(modelRoot);
        const mc  = mb.getCenter(new THREE.Vector3());
        const msz = mb.getSize(new THREE.Vector3());

        const fovRad   = (camera.fov * Math.PI) / 180;
        const halfFovY = fovRad / 2;
        const halfFovX = Math.atan(Math.tan(halfFovY) * camera.aspect);
        const needH    = Math.max(
          (msz.x / 2) / Math.tan(halfFovX),
          (msz.z / 2) / Math.tan(halfFovY),
        ) * 1.35;

        camera.near = msz.y * 0.01;
        camera.far  = needH * 4;
        camera.updateProjectionMatrix();

        camera.position.set(mc.x, mc.y + needH, mc.z);
        cameraTarget.copy(mc);
        camera.lookAt(cameraTarget);

        // ── OrbitControls ─────────────────────────────────────────────────────
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.target.copy(cameraTarget);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.update();
        (physicsWorld as unknown as Record<string, unknown>)._controls = controls;

        // ── Use-cases ─────────────────────────────────────────────────────────
        const plunger = new Plunger();

        const emit: GameEventListener = (event) => {
          if ('scoreIncrement' in event && event.scoreIncrement) {
            scoreRef.current += event.scoreIncrement;
            setScore(scoreRef.current);
          }
          if (event.type === "DRAIN") {
            handleDrain();
          }
          if (event.type === "BALL_LAUNCHED") {
            updateGameState("playing");
          }
        };
        emitFn = emit;

        launchBallUC = new LaunchBall(ballPhysicsInst, plunger, emit);
        bumperHitUC = new BumperHit(ballPhysicsInst, emit);
        drainBallUC = new DrainBall(ballPhysicsInst, emit);

        // Inputs
        const onKeyDown = (e: KeyboardEvent) => {
          if (["ArrowLeft", "ArrowRight", " "].includes(e.key))
            e.preventDefault();
          if (e.repeat) return;
          if (e.key === "h" || e.key === "H") {
            setDebugColliders((prev) => !prev);
            return;
          }
          if (e.key === "ArrowLeft" || e.key === "q" || e.key === "Q") {
            leftTarget = 1;
          }
          if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") {
            rightTarget = 1;
          }
          if (e.key === " ") {
            if (gameStateRef.current === "game_over") {
              resetGame();
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
          if (["ArrowLeft", "ArrowRight", " "].includes(e.key))
            e.preventDefault();
          if (e.key === "ArrowLeft" || e.key === "q" || e.key === "Q")
            leftTarget = 0;
          if (e.key === "ArrowRight" || e.key === "d" || e.key === "D")
            rightTarget = 0;
          if (
            e.key === " " &&
            isChargingPlunger &&
            gameStateRef.current === "idle"
          ) {
            isChargingPlunger = false;
            plungerState = 'releasing';
            const t =
              Math.min(
                1,
                (performance.now() - chargeStartTime) / PLUNGER_CHARGE_MS,
              ) ** 1.15;
            const factor = PLUNGER_MIN_FACTOR + (PLUNGER_MAX_FACTOR - PLUNGER_MIN_FACTOR) * t;
            plungerReleaseSpeed = factor * 4.5;
            launchBallUC?.execute();
            // Don't use physics impulse — animate through lane instead
            laneAnimSpeed = 1.0 + factor * 3.0;  // 1.0–4.0 m/s along -Z
          }
        };

        if (cancelled) return;

        document.addEventListener("keydown", onKeyDown);
        document.addEventListener("keyup", onKeyUp);

        (
          physicsWorld as PhysicsWorld & {
            _onKeyDown?: typeof onKeyDown;
            _onKeyUp?: typeof onKeyUp;
          }
        )._onKeyDown = onKeyDown;
        (
          physicsWorld as PhysicsWorld & {
            _onKeyDown?: typeof onKeyDown;
            _onKeyUp?: typeof onKeyUp;
          }
        )._onKeyUp = onKeyUp;

        if (ballMesh) ballMesh.visible = true;

        physicsReady = true;
        mountEl.focus();
        console.info('[Pinball] Physics ready');
      } catch (err) {
        console.error("[Playfield] Erreur chargement :", err);
      }
    };

    void init();

    // ── Sync flipper kinematic body ───────────────────────────────────────────
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

    // ── Boucle de rendu ───────────────────────────────────────────────────────
    let frameId: number;

    const animate = (time: number) => {
      frameId = requestAnimationFrame(animate);

      const dt =
        prevFrameTime > 0
          ? Math.min((time - prevFrameTime) / 1000, 0.05)
          : 0.016;
      prevFrameTime = time;
      // dt is used implicitly for plunger animation timing checks
      void dt;

      const ctrl = (physicsWorld as unknown as Record<string, unknown>)?._controls as OrbitControls | undefined;
      ctrl?.update();

      // Sync flipper kinematic bodies before stepping
      syncFlipperBody(leftFlipperBody, leftFlipperObj);
      syncFlipperBody(rightFlipperBody, rightFlipperObj);

      if (physicsWorld) physicsWorld.update(time);

      // Drain collision events
      if (physicsWorld && colliderMap) {
        physicsWorld.eventQueue.drainCollisionEvents((h1, h2, started) => {
          if (!started) return;
          const role = colliderMap!.get(h1) ?? colliderMap!.get(h2);
          if (!role) return;
          console.log(`[Collision] ${role}`);

          if (role.startsWith('bumper_')) {
            const idx = parseInt(role.split('_')[1], 10);
            const pos = BUMPER_POSITIONS[idx];
            if (pos && ballPhysicsInst) {
              const bp = ballPhysicsInst.body.translation();
              const bv = ballPhysicsInst.body.linvel();
              console.log(`[Bumper ${idx}] PRE pos=(${bp.x.toFixed(3)},${bp.y.toFixed(3)},${bp.z.toFixed(3)}) vel=(${bv.x.toFixed(3)},${bv.y.toFixed(3)},${bv.z.toFixed(3)}) spd=${Math.sqrt(bv.x**2+bv.y**2+bv.z**2).toFixed(3)}`);
              bumperHitUC?.execute(idx, pos);
              const av = ballPhysicsInst.body.linvel();
              console.log(`[Bumper ${idx}] POST vel=(${av.x.toFixed(3)},${av.y.toFixed(3)},${av.z.toFixed(3)}) spd=${Math.sqrt(av.x**2+av.y**2+av.z**2).toFixed(3)}`);
            }
          }
          if (role === 'drain' && gameStateRef.current === 'playing') {
            drainBallUC?.execute();
            // Reset drop targets on drain
            for (const dt of DROP_TARGETS) {
              dropTargetDown[dt.id] = false;
              const mesh = playfieldRootRef?.getObjectByName(dt.id.replace('drop_', 'drop_target_'));
              if (mesh) mesh.visible = true;
            }
          }
          // Slingshots — score only, no impulse (causes teleportation)
          if ((role === 'slingshot_left' || role === 'slingshot_right') && gameStateRef.current === 'playing') {
            const side = role === 'slingshot_left' ? 'left' as const : 'right' as const;
            emitFn?.({ type: 'SLINGSHOT_HIT', side, scoreIncrement: 10 });
          }
          // Pop bumper zone sensors
          if (role.startsWith('pop_zone_') && gameStateRef.current === 'playing') {
            emitFn?.({ type: 'ZONE_HIT', zone: role, scoreIncrement: 50 });
          }
          // Rocket ramp
          if (role === 'rocket_ramp' && gameStateRef.current === 'playing') {
            emitFn?.({ type: 'RAMP_HIT', scoreIncrement: 200 });
          }
          // Drop targets
          if (role.startsWith('drop_') && !role.startsWith('drop_target') && gameStateRef.current === 'playing') {
            if (!dropTargetDown[role]) {
              dropTargetDown[role] = true;
              emitFn?.({ type: 'DROP_TARGET_HIT', targetId: role, scoreIncrement: 75 });
              // Hide the target mesh
              const meshName = role.replace('drop_', 'drop_target_');
              const mesh = playfieldRootRef?.getObjectByName(meshName);
              if (mesh) mesh.visible = false;
              // Check completion
              const target = DROP_TARGETS.find(t => t.id === role);
              if (target) {
                const sideTargets = DROP_TARGETS.filter(t => t.side === target.side);
                const allDown = sideTargets.every(t => dropTargetDown[t.id]);
                if (allDown) {
                  emitFn?.({ type: 'DROP_TARGET_COMPLETE', side: target.side, scoreIncrement: 500 });
                  // Reset this side
                  for (const t of sideTargets) {
                    dropTargetDown[t.id] = false;
                    const m = playfieldRootRef?.getObjectByName(t.id.replace('drop_', 'drop_target_'));
                    if (m) m.visible = true;
                  }
                }
              }
            }
          }
        });
      }

      // Flippers visuels
      leftSwing += (leftTarget * SWING_RAD - leftSwing) * SWING_SMOOTH;
      rightSwing += (rightTarget * SWING_RAD - rightSwing) * SWING_SMOOTH;
      if (leftPivot) leftPivot.rotation.y = leftSwing;
      if (rightPivot) rightPivot.rotation.y = -rightSwing;

      // ── Flipper hit — tight zones, rising-edge trigger, directional impulse ──
      if (ballPhysicsInst && gameStateRef.current === 'playing' && laneAnimSpeed <= 0) {
        const bp = ballPhysicsInst.body.translation();
        const FLIPPER_POWER = 0.32;
        const TRIGGER = 0.15;
        const inFlipperZ = bp.z > 0.20 && bp.z < 0.33;

        // Left flipper — visual X [-0.129, 0], with margin
        if (leftSwing > TRIGGER && prevLeftSwing <= TRIGGER
            && inFlipperZ && bp.x > -0.145 && bp.x < 0.015) {
          leftFlipperHit = true;
          ballPhysicsInst.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
          const flipperMidX = -0.065;
          const normalizedPos = Math.max(-1, Math.min(1, (bp.x - flipperMidX) / 0.08));
          const launchAngle = -0.4 + normalizedPos * 0.6;
          ballPhysicsInst.body.applyImpulse(
            { x: FLIPPER_POWER * Math.sin(launchAngle), y: 0, z: -FLIPPER_POWER * Math.cos(launchAngle) },
            true,
          );
        }
        if (leftTarget === 0) leftFlipperHit = false;

        // Right flipper — visual X [0, 0.084], with margin
        if (rightSwing > TRIGGER && prevRightSwing <= TRIGGER
            && inFlipperZ && bp.x > -0.015 && bp.x < 0.10) {
          rightFlipperHit = true;
          ballPhysicsInst.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
          const flipperMidX = 0.042;
          const normalizedPos = Math.max(-1, Math.min(1, (bp.x - flipperMidX) / 0.06));
          const launchAngle = 0.4 - normalizedPos * 0.6;
          ballPhysicsInst.body.applyImpulse(
            { x: FLIPPER_POWER * Math.sin(launchAngle), y: 0, z: -FLIPPER_POWER * Math.cos(launchAngle) },
            true,
          );
        }
        if (rightTarget === 0) rightFlipperHit = false;
      }

      prevLeftSwing = leftSwing;
      prevRightSwing = rightSwing;

      // Sync bille
      if (ballMesh?.visible && ballPhysicsInst) {
        if (gameStateRef.current === "idle" && physicsReady && !debugCursorRef.current?.visible) {
          ballPhysicsInst.body.setTranslation(
            { x: BALL_SPAWN_POSITION.x, y: BALL_SPAWN_POSITION.y, z: BALL_SPAWN_POSITION.z },
            true,
          );
          ballPhysicsInst.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
          ballPhysicsInst.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
        }

        // ── Lane animation — straight up, curve at top, release ──
        const laneSurfaceY = (z: number) => 1.068 - ((z + 0.552) / 0.970) * 0.110 + BALL_RADIUS + 0.004;
        // Phase 1: straight up lane  (Z from spawn to CURVE_START_Z)
        // Phase 2: curve around top   (Z from CURVE_START_Z to CURVE_END_Z, X shifts left)
        // Phase 3: release to physics
        const CURVE_START_Z = -0.35;
        const CURVE_END_Z   = -0.40;
        const CURVE_START_X = BALL_SPAWN_POSITION.x;
        const CURVE_END_X   = 0.05;

        if (laneAnimSpeed > 0) {
          const curZ = ballPhysicsInst.body.translation().z;
          const newZ = curZ - laneAnimSpeed * dt;

          if (newZ <= CURVE_END_Z) {
            const exitSpeed = laneAnimSpeed;
            laneAnimSpeed = 0;
            // Exit right of bumper 0 (at X=-0.02), give room before bumper zone
            const exitPos = { x: 0.06, y: laneSurfaceY(-0.38), z: -0.38 };
            // Bias slightly left with spread, gentle downfield
            const xSpread = (Math.random() - 0.6) * 0.4;
            const exitVel = { x: exitSpeed * xSpread, y: 0, z: exitSpeed * 0.5 };
            ballPhysicsInst.body.setTranslation(exitPos, true);
            ballPhysicsInst.body.setLinvel(exitVel, true);
            ballPhysicsInst.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
            ballPhysicsInst.body.wakeUp();
            console.log(`[Lane EXIT] pos=(${exitPos.x.toFixed(3)},${exitPos.y.toFixed(3)},${exitPos.z.toFixed(3)}) vel=(${exitVel.x.toFixed(3)},${exitVel.y.toFixed(3)},${exitVel.z.toFixed(3)})`);
          } else if (newZ <= CURVE_START_Z) {
            // Phase 2: curving — interpolate X from lane to playfield
            const t = (CURVE_START_Z - newZ) / (CURVE_START_Z - CURVE_END_Z);
            // Smooth ease-in curve
            const tSmooth = t * t * (3 - 2 * t);
            const curX = CURVE_START_X + (CURVE_END_X - CURVE_START_X) * tSmooth;
            ballPhysicsInst.body.setTranslation(
              { x: curX, y: laneSurfaceY(newZ), z: newZ },
              true,
            );
            ballPhysicsInst.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
            ballPhysicsInst.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
          } else {
            // Phase 1: straight up lane
            ballPhysicsInst.body.setTranslation(
              { x: BALL_SPAWN_POSITION.x, y: laneSurfaceY(newZ), z: newZ },
              true,
            );
            ballPhysicsInst.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
            ballPhysicsInst.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
          }
        }

        ballPhysicsInst.syncToMesh(ballMesh);

        // Clamp ball speed to prevent teleportation
        const bVelClamp = ballPhysicsInst.body.linvel();
        const speed = Math.sqrt(bVelClamp.x**2 + bVelClamp.y**2 + bVelClamp.z**2);
        const MAX_SPEED = 4.0;
        if (speed > MAX_SPEED) {
          const scale = MAX_SPEED / speed;
          ballPhysicsInst.body.setLinvel(
            { x: bVelClamp.x * scale, y: bVelClamp.y * scale, z: bVelClamp.z * scale },
            true,
          );
        }
        // Prevent ball from going airborne
        if (bVelClamp.y > 0.5) {
          ballPhysicsInst.body.setLinvel(
            { x: bVelClamp.x, y: 0.1, z: bVelClamp.z },
            true,
          );
        }

        const bPos = ballPhysicsInst.body.translation();
        const bVel = ballPhysicsInst.body.linvel();
        const bSpd = Math.sqrt(bVel.x**2 + bVel.y**2 + bVel.z**2);

        // Stuck ball detector — nudge if stationary for 1s
        if (gameStateRef.current === 'playing' && laneAnimSpeed <= 0) {
          if (bSpd < 0.02) {
            stuckTimer += dt;
            if (stuckTimer > 1.0) {
              stuckTimer = 0;
              // Strong nudge: toward center + downhill + small Y pop to escape traps
              const nudgeX = bPos.x > 0 ? -0.08 : 0.08;
              ballPhysicsInst.body.applyImpulse({ x: nudgeX, y: 0.02, z: 0.12 }, true);
              console.log(`[NUDGE] ball stuck at (${bPos.x.toFixed(3)},${bPos.z.toFixed(3)})`);
            }
          } else {
            stuckTimer = 0;
          }
        }

        // Ball state every ~0.5s
        if (gameStateRef.current === 'playing' && laneAnimSpeed <= 0 && Math.round(time / 16) % 30 === 0) {
          const spd = Math.sqrt(bVel.x**2+bVel.y**2+bVel.z**2);
          console.log(`[Ball] pos=(${bPos.x.toFixed(3)},${bPos.y.toFixed(3)},${bPos.z.toFixed(3)}) vel=(${bVel.x.toFixed(3)},${bVel.y.toFixed(3)},${bVel.z.toFixed(3)}) spd=${spd.toFixed(3)}`);
        }

        if (gameStateRef.current === "playing" && drainBallUC) {
          if ((bPos.z > DRAIN_Z && bPos.x < fieldBounds.laneSepX) || bPos.y < 0.8) {
            console.log(`[DRAIN] pos=(${bPos.x.toFixed(3)},${bPos.y.toFixed(3)},${bPos.z.toFixed(3)})`);
            drainBallUC.execute();
          }
        }
      }

      // ── Plunger animation (visuel uniquement) ────────────────────────────
      if (plungerMesh && plungerRestZ > 0) {
        let plungerZ = plungerRestZ;
        if (isChargingPlunger) {
          const t = Math.min(1, (time - chargeStartTime) / PLUNGER_CHARGE_MS) ** 1.15;
          const pullback = (PLUNGER_MIN_FACTOR + (PLUNGER_MAX_FACTOR - PLUNGER_MIN_FACTOR) * t) * 0.08;
          plungerZ = plungerRestZ + pullback;
        } else if (plungerState === 'releasing') {
          plungerZ = plungerRestZ - 0.015;
          if (time - chargeStartTime > PLUNGER_CHARGE_MS * 0.1) plungerState = 'returning';
        } else if (plungerState === 'returning') {
          plungerZ = plungerRestZ;
          plungerState = 'idle';
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

      renderer.render(scene, camera);
    };

    frameId = requestAnimationFrame(animate);

    // ── Resize ────────────────────────────────────────────────────────────────
    const handleResize = () => {
      if (!mountEl) return;
      const { clientWidth: w, clientHeight: h } = mountEl;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      camera.lookAt(cameraTarget);
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", handleResize);

    // ── Cleanup ───────────────────────────────────────────────────────────────
    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", handleResize);
      const pw = physicsWorld as
        | (PhysicsWorld & {
            _onKeyDown?: (e: KeyboardEvent) => void;
            _onKeyUp?: (e: KeyboardEvent) => void;
          })
        | null;
      if (pw?._onKeyDown)
        document.removeEventListener("keydown", pw._onKeyDown);
      if (pw?._onKeyUp) document.removeEventListener("keyup", pw._onKeyUp);
      const ctrl2 = (physicsWorld as unknown as Record<string, unknown>)?._controls as OrbitControls | undefined;
      ctrl2?.dispose();
      if (mountEl.contains(renderer.domElement))
        mountEl.removeChild(renderer.domElement);
      wireframeMeshesRef.current.forEach((m) => {
        m.geometry?.dispose();
        if (m.material) (m.material as THREE.Material).dispose();
      });
      wireframeMeshesRef.current = [];
      disposableGeos.forEach((g) => g.dispose());
      disposableMats.forEach((m) => m.dispose());
      renderer.dispose();
    };
  }, []);

  useEffect(() => {
    const s = sceneRef.current;
    if (!s) return;
    s.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      let target: THREE.Object3D | null = node;
      let colorInfo: { color: string; label: string } | undefined;
      while (target) {
        colorInfo = COLLIDER_COLORS[target.name];
        if (colorInfo) break;
        target = target.parent;
      }
      const mat = node.material as THREE.MeshStandardMaterial;
      if (!mat || Array.isArray(mat) || !('emissive' in mat)) return;
      if (debugColliders && colorInfo) {
        mat.emissive = new THREE.Color(colorInfo.color);
        mat.emissiveIntensity = 0.85;
      } else {
        mat.emissive = new THREE.Color(0x000000);
        mat.emissiveIntensity = 0;
      }
    });
    wireframeMeshesRef.current.forEach((m) => { m.visible = debugColliders; });
  }, [debugColliders]);

  // ── JSX ───────────────────────────────────────────────────────────────────
  const hintLine =
    gameState === "idle"
      ? "▶  Maintenir ESPACE — relâcher pour lancer"
      : gameState === "game_over"
        ? "ESPACE pour rejouer"
        : null;

  return (
    <div className="relative min-h-screen bg-black text-zinc-100">
      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between px-5 pt-4">
        <div className="font-mono space-y-1.5">
          <div className="text-3xl font-bold tabular-nums tracking-widest drop-shadow-[0_0_8px_rgba(255,180,0,0.6)]">
            {String(score).padStart(7, "0")}
          </div>
          <div className="flex gap-1.5 text-lg">
            {Array.from({ length: INITIAL_LIVES }).map((_, i) => (
              <span
                key={i}
                className="transition-opacity duration-300"
                style={{ opacity: i < lives ? 1 : 0.2 }}
              >
                ●
              </span>
            ))}
          </div>
        </div>
        <div className="text-right font-mono text-[10px] text-zinc-500 space-y-0.5 leading-relaxed">
          <div>Q / ← — Flipper gauche</div>
          <div>D / → — Flipper droit</div>
          <div>ESPACE — Charger / lancer</div>
          <div>H — Debug colliders</div>
        </div>
      </header>

      {(gameState === "idle" || gameState === "game_over") && (
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-4">
          {gameState === "game_over" && (
            <p className="font-mono text-4xl font-bold uppercase tracking-[0.25em] text-red-400 drop-shadow-[0_0_16px_rgba(239,68,68,0.8)]">
              Game Over
            </p>
          )}
          {hintLine && (
            <p className="animate-pulse font-mono text-sm uppercase tracking-[0.3em] text-zinc-400">
              {hintLine}
            </p>
          )}
        </div>
      )}

      {debugColliders && (
        <div className="absolute top-4 right-4 z-20 bg-black/90 rounded-lg p-3 font-mono text-xs space-y-1">
          <div className="text-white font-bold mb-2">Mode Debug Colliders [H]</div>
          {[
            { color: '#00ff44', label: 'Sol — Trimesh' },
            { color: '#888888', label: 'Caisse ext — aucun collider' },
            { color: '#ff8800', label: 'Guides courbes — ConvexPoly' },
            { color: '#ff0022', label: 'Bumpers — Cylinder' },
            { color: '#cc2200', label: 'Slingshots — ConvexPoly' },
            { color: '#cc00ff', label: 'Drop targets — Box' },
            { color: '#ffff00', label: 'Séparateurs — Cylinder' },
            { color: '#0088ff', label: 'Sensors — pas de collision' },
            { color: '#444444', label: 'Décoratif — aucun collider' },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: color }} />
              <span className="text-zinc-300">{label}</span>
            </div>
          ))}
        </div>
      )}

      <div className="absolute bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-lg bg-black/80 px-5 py-4 font-mono text-xs text-zinc-200 backdrop-blur space-y-3 min-w-72">
          <div className="flex items-center justify-between mb-1">
            <span className="text-orange-400 font-bold uppercase tracking-wider">Debug Spawn</span>
            <button
              className="rounded bg-orange-600 px-2 py-0.5 text-white hover:bg-orange-500"
              onClick={() => console.info(`BALL_SPAWN_POSITION = { x: ${debugPos.x.toFixed(4)}, y: ${debugPos.y.toFixed(4)}, z: ${debugPos.z.toFixed(4)} }`)}
            >
              log
            </button>
          </div>
          {(["x", "y", "z"] as const).map((axis) => {
            const ranges = { x: [-0.35, 0.35], y: [0.95, 1.10], z: [-0.6, 0.7] };
            const [min, max] = ranges[axis];
            return (
              <label key={axis} className="flex items-center gap-3">
                <span className="w-4 text-orange-300 uppercase">{axis}</span>
                <input
                  type="range"
                  min={min}
                  max={max}
                  step={0.0005}
                  value={debugPos[axis]}
                  className="flex-1 accent-orange-500"
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    const next = { ...debugPos, [axis]: val };
                    setDebugPos(next);
                    debugSpawnRef.current?.(next.x, next.y, next.z);
                  }}
                />
                <span className="w-16 text-right tabular-nums">{debugPos[axis].toFixed(4)}</span>
              </label>
            );
          })}
          <div className="border-t border-zinc-700 pt-3 mt-2">
            <span className="text-cyan-400 font-bold uppercase tracking-wider text-[10px]">Ball Radius</span>
            <label className="flex items-center gap-3 mt-1">
              <span className="w-4 text-cyan-300 uppercase">R</span>
              <input
                type="range"
                min={0.005}
                max={0.05}
                step={0.001}
                value={debugRadius}
                className="flex-1 accent-cyan-500"
                onChange={(e) => {
                  const r = parseFloat(e.target.value);
                  setDebugRadius(r);
                  debugResizeBallRef.current?.(r);
                }}
              />
              <span className="w-16 text-right tabular-nums">{debugRadius.toFixed(3)}</span>
            </label>
          </div>
      </div>

      <main
        ref={mountRef}
        className="h-screen w-full cursor-grab outline-none focus:outline-none"
        tabIndex={0}
        aria-label="Terrain de flipper — Q/D ou ← → pour les flippers, maintenir ESPACE et relâcher pour lancer"
      />
    </div>
  );
}
