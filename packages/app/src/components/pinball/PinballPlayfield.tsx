import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
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
  WALL_BOTTOM_Z,
  WALL_TOP_Z,
  INITIAL_LIVES,
  PLUNGER_CHARGE_MS,
  PLUNGER_MIN_FACTOR,
  PLUNGER_MAX_FACTOR,
  SWING_RAD,
  SWING_SMOOTH,
  PlayfieldTrimeshBuilder,
  PlayfieldColliderFactory,
  splitFlipperIntoTwo,
  attachFlipperAtHinge,
  CollisionEventProcessor,
  detectFlipperHit,
  LauncherLaneAnimator,
  StuckBallDetector,
} from "@pinball/game-engine";
import { useGameState } from "../../hooks/useGameState";
import GameOverlay from "./GameOverlay";
import DebugPanel from "./DebugPanel";

const PLAYFIELD_URL = "/playfield/pinball-machine.glb";
const FLIPPER_LEFT_NAME = "flipper";
const DRAIN_Z = WALL_BOTTOM_Z + BALL_RADIUS * 2;

const COLLIDER_COLORS: Record<string, { color: string; label: string }> = {
  playfield:       { color: "#00ff44", label: "Sol — Trimesh" },
  playfield_sides: { color: "#333333", label: "Caisse externe — ignoré" },
  plastic:                 { color: "#ff8800", label: "Rail haut — ConvexPoly" },
  plastic_left:            { color: "#ff8800", label: "Rail gauche — ConvexPoly" },
  plastic_pop_bumper_zone: { color: "#ff8800", label: "Zone bumpers — ConvexPoly" },
  plastic_rocket:          { color: "#ff8800", label: "Rail droit — ConvexPoly" },
  shoulder:                { color: "#ff8800", label: "Épaule — ConvexPoly" },
  slingshot:       { color: "#cc2200", label: "Slingshot — ConvexPoly" },
  pop_bumper:      { color: "#ff0022", label: "Bumper centre — Cylinder" },
  pop_bumper_left: { color: "#ff0022", label: "Bumper gauche — Cylinder" },
  pop_bumper_right:{ color: "#ff0022", label: "Bumper droit — Cylinder" },
  separator_left:  { color: "#ffff00", label: "Séparateur G — Cylinder" },
  separator_right: { color: "#ffff00", label: "Séparateur D — Cylinder" },
  drop_target_left_1:  { color: "#cc00ff", label: "Target G1 — Box" },
  drop_target_left_2:  { color: "#cc00ff", label: "Target G2 — Box" },
  drop_target_right_1: { color: "#cc00ff", label: "Target D1 — Box" },
  drop_target_right_2: { color: "#cc00ff", label: "Target D2 — Box" },
  drop_target_right_3: { color: "#cc00ff", label: "Target D3 — Box" },
  switch_out:                    { color: "#0088ff", label: "Drain — sensor" },
  switch_center_pop_bumper_zone: { color: "#0088ff", label: "Sensor bumper C" },
  switch_left_pop_bumper_zone:   { color: "#0088ff", label: "Sensor bumper G" },
  switch_right_pop_bumper_zone:  { color: "#0088ff", label: "Sensor bumper D" },
  switch_plunger:                { color: "#0088ff", label: "Sensor plunger" },
  switch_slingshot:              { color: "#0088ff", label: "Sensor slingshot" },
  switch_rocket:                 { color: "#0088ff", label: "Sensor rocket" },
  box:             { color: "#1a1a1a", label: "Caisse — décoratif" },
  feet:            { color: "#1a1a1a", label: "Pieds — décoratif" },
  glass:           { color: "#1a1a1a", label: "Vitre — décoratif" },
  launcher:        { color: "#1a1a1a", label: "Launcher — décoratif" },
  plunger_panel:   { color: "#1a1a1a", label: "Panel — décoratif" },
  score_board:     { color: "#1a1a1a", label: "Tableau — décoratif" },
  coin_slot:       { color: "#1a1a1a", label: "Monnayeur — décoratif" },
  flipper_buttons: { color: "#1a1a1a", label: "Boutons — décoratif" },
  pop_bumper_guard:{ color: "#1a1a1a", label: "Guard bumper — décoratif" },
  spinner:         { color: "#1a1a1a", label: "Spinner — décoratif" },
  plate:           { color: "#1a1a1a", label: "Plaque — décoratif" },
  start_button:    { color: "#1a1a1a", label: "Bouton start — décoratif" },
  exit_cover:      { color: "#1a1a1a", label: "Cover — décoratif" },
  flipper:             { color: "#00ffff", label: "Flipper — kinematic" },
  flipper_left_split:  { color: "#00ffff", label: "Flipper G — kinematic" },
  flipper_right_split: { color: "#00ffff", label: "Flipper D — kinematic" },
};

export default function PinballPlayfield() {
  const mountRef = useRef<HTMLDivElement | null>(null);

  const {
    score,
    lives,
    gameState,
    gameStateRef,
    resetGame,
    buildEmit,
  } = useGameState();

  const [debugPos, setDebugPos] = useState({
    x: BALL_SPAWN_POSITION.x as number,
    y: BALL_SPAWN_POSITION.y as number,
    z: BALL_SPAWN_POSITION.z as number,
  });
  const [debugColliders, setDebugColliders] = useState(false);
  const [debugRadius, setDebugRadius] = useState(BALL_RADIUS);

  const sceneRef = useRef<THREE.Scene | null>(null);
  const wireframeMeshesRef = useRef<THREE.Mesh[]>([]);
  const debugSpawnRef = useRef<((x: number, y: number, z: number) => void) | null>(null);
  const debugCursorRef = useRef<THREE.Mesh | null>(null);
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
    const camera = new THREE.PerspectiveCamera(60, clientWidth / clientHeight, 0.001, 100);
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
    let leftFlipperBBox: THREE.Box3 | null = null;
    let rightFlipperBBox: THREE.Box3 | null = null;
    let isChargingPlunger = false;
    let chargeStartTime = 0;
    let physicsReady = false;
    let prevFrameTime = 0;
    let laneAnimSpeed = 0;
    let leftFlipperHit = false;
    let rightFlipperHit = false;

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

        // ── Ball mesh ────────────────────────────────────────────────────────
        const glbBallNode = playfieldRoot.getObjectByName("ball");
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

        // ── Flipper split ────────────────────────────────────────────────────
        const baseFlipper = playfieldRoot.getObjectByName(FLIPPER_LEFT_NAME) ?? null;
        let leftFlipper: THREE.Object3D | null = null;
        let rightFlipper: THREE.Object3D | null = null;

        if (baseFlipper?.parent) {
          const [lMesh, rMesh] = splitFlipperIntoTwo(baseFlipper);
          if (lMesh && rMesh) {
            baseFlipper.visible = false;
            baseFlipper.parent.add(lMesh);
            baseFlipper.parent.add(rMesh);
            disposableGeos.push(lMesh.geometry, rMesh.geometry);
            disposableMats.push(lMesh.material as THREE.Material, rMesh.material as THREE.Material);
            leftFlipper = lMesh;
            rightFlipper = rMesh;
          } else {
            leftFlipper = baseFlipper;
            rightFlipper = baseFlipper;
          }
        }

        leftFlipper?.updateMatrixWorld(true);
        rightFlipper?.updateMatrixWorld(true);
        leftFlipperBBox = leftFlipper ? new THREE.Box3().setFromObject(leftFlipper) : null;
        rightFlipperBBox = rightFlipper ? new THREE.Box3().setFromObject(rightFlipper) : null;

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
        const fieldBox = new THREE.Box3().setFromObject(modelRoot);
        fieldBoundsLaneSepX = fieldBox.min.x;

        const colliderMap = new Map<number, string>();

        PlayfieldTrimeshBuilder.build(playfieldRoot, world);
        PlayfieldColliderFactory.createAll(world, colliderMap, scene);

        // ── Wireframe debug ──────────────────────────────────────────────────
        type WireframeDef =
          | { type: "box"; hx: number; hy: number; hz: number; px: number; py: number; pz: number; qx: number; qy: number; qz: number; qw: number }
          | { type: "sphere"; radius: number; px: number; py: number; pz: number }
          | { type: "cylinder"; halfHeight: number; radius: number; px: number; py: number; pz: number };

        const wireframeData: WireframeDef[] = [];

        world.forEachCollider((col) => {
          const parent = col.parent();
          if (!parent) return;
          const t = parent.translation();
          const q = parent.rotation();
          const shape = col.shape;
          if (shape.type === RAPIER.ShapeType.Cuboid) {
            const half = (shape as RAPIER.Cuboid).halfExtents;
            wireframeData.push({ type: "box", hx: half.x, hy: half.y, hz: half.z, px: t.x, py: t.y, pz: t.z, qx: q.x, qy: q.y, qz: q.z, qw: q.w });
          } else if (shape.type === RAPIER.ShapeType.Ball) {
            wireframeData.push({ type: "sphere", radius: (shape as RAPIER.Ball).radius, px: t.x, py: t.y, pz: t.z });
          } else if (shape.type === RAPIER.ShapeType.Cylinder) {
            const cyl = shape as RAPIER.Cylinder;
            wireframeData.push({ type: "cylinder", halfHeight: cyl.halfHeight, radius: cyl.radius, px: t.x, py: t.y, pz: t.z });
          }
        });

        for (const wd of wireframeData) {
          let geo: THREE.BufferGeometry;
          if (wd.type === "box") {
            geo = new THREE.BoxGeometry(wd.hx * 2, wd.hy * 2, wd.hz * 2);
          } else if (wd.type === "sphere") {
            geo = new THREE.SphereGeometry(wd.radius, 8, 6);
          } else {
            geo = new THREE.CylinderGeometry(wd.radius, wd.radius, wd.halfHeight * 2, 12);
          }
          const mat = new THREE.MeshBasicMaterial({ color: 0x00ffff, wireframe: true, opacity: 0.55, transparent: true });
          const wfMesh = new THREE.Mesh(geo, mat);
          wfMesh.position.set(wd.px, wd.py, wd.pz);
          if (wd.type === "box") wfMesh.quaternion.set(wd.qx, wd.qy, wd.qz, wd.qw);
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
          world.removeCollider(ballPhysicsInst.collider, false);
          const density = 0.08 / ((4 / 3) * Math.PI * newRadius ** 3);
          const newCol = world.createCollider(
            RAPIER.ColliderDesc.ball(newRadius)
              .setRestitution(0.4).setFriction(0.1)
              .setDensity(density)
              .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
            ballPhysicsInst.body,
          );
          (ballPhysicsInst as unknown as Record<string, unknown>).collider = newCol;
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

        // ── Flipper kinematic bodies ──────────────────────────────────────────
        const makeFlipperBody = (bbox: THREE.Box3 | null): RAPIER.RigidBody | null => {
          if (!bbox) return null;
          const sz = bbox.getSize(new THREE.Vector3());
          const cx = bbox.getCenter(new THREE.Vector3());
          const body = world.createRigidBody(
            RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(cx.x, cx.y, cx.z),
          );
          const halfY = Math.max(sz.y / 2, BALL_RADIUS * 3);
          world.createCollider(
            RAPIER.ColliderDesc.cuboid(sz.x / 2, halfY, sz.z / 2 + BALL_RADIUS)
              .setRestitution(0.8).setFriction(0.2)
              .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
            body,
          );
          return body;
        };
        leftFlipperBody = makeFlipperBody(leftFlipperBBox);
        rightFlipperBody = makeFlipperBody(rightFlipperBBox);

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

        // ── Trajectory debug line ─────────────────────────────────────────────
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

        // ── Camera ────────────────────────────────────────────────────────────
        modelRoot.updateMatrixWorld(true);
        const mb = new THREE.Box3().setFromObject(modelRoot);
        const mc = mb.getCenter(new THREE.Vector3());
        const msz = mb.getSize(new THREE.Vector3());

        const fovRad = (camera.fov * Math.PI) / 180;
        const halfFovY = fovRad / 2;
        const halfFovX = Math.atan(Math.tan(halfFovY) * camera.aspect);
        const needH = Math.max(
          (msz.x / 2) / Math.tan(halfFovX),
          (msz.z / 2) / Math.tan(halfFovY),
        ) * 1.35;

        camera.near = msz.y * 0.01;
        camera.far = needH * 4;
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
          if (e.key === "h" || e.key === "H") {
            setDebugColliders((prev) => !prev);
            return;
          }
          if (e.key === "ArrowLeft" || e.key === "q" || e.key === "Q") leftTarget = 1;
          if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") rightTarget = 1;
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
        console.info("[Pinball] Physics ready");
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

      const ctrl = (physicsWorld as unknown as Record<string, unknown>)?._controls as OrbitControls | undefined;
      ctrl?.update();

      syncFlipperBody(leftFlipperBody, leftFlipperObj);
      syncFlipperBody(rightFlipperBody, rightFlipperObj);

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
        const { result, leftHit, rightHit } = detectFlipperHit(
          bp,
          leftSwing, prevLeftSwing,
          rightSwing, prevRightSwing,
          leftFlipperHit, rightFlipperHit,
        );
        leftFlipperHit = leftHit;
        rightFlipperHit = rightHit;
        if (result) {
          ballPhysicsInst.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
          ballPhysicsInst.body.applyImpulse(result.impulse, true);
        }
        if (leftTarget === 0) leftFlipperHit = false;
        if (rightTarget === 0) rightFlipperHit = false;
      }

      prevLeftSwing = leftSwing;
      prevRightSwing = rightSwing;

      // Ball sync
      if (ballMesh?.visible && ballPhysicsInst) {
        if (gameStateRef.current === "idle" && physicsReady && !debugCursorRef.current?.visible) {
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
        const MAX_SPEED = 4.0;
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
        if (gameStateRef.current === "playing" && laneAnimSpeed <= 0) {
          const nudge = stuckDetector.update(bSpd, bPos, dt);
          if (nudge) ballPhysicsInst.body.applyImpulse(nudge, true);
        }

        // Periodic ball state log
        if (gameStateRef.current === "playing" && laneAnimSpeed <= 0 && Math.round(time / 16) % 30 === 0) {
          const spd = Math.sqrt(bVel.x ** 2 + bVel.y ** 2 + bVel.z ** 2);
          console.log(`[Ball] pos=(${bPos.x.toFixed(3)},${bPos.y.toFixed(3)},${bPos.z.toFixed(3)}) vel=(${bVel.x.toFixed(3)},${bVel.y.toFixed(3)},${bVel.z.toFixed(3)}) spd=${spd.toFixed(3)}`);
        }

        // Drain by position fallback
        if (gameStateRef.current === "playing" && drainBallUC) {
          if ((bPos.z > DRAIN_Z && bPos.x < fieldBoundsLaneSepX) || bPos.y < 0.8) {
            console.log(`[DRAIN] pos=(${bPos.x.toFixed(3)},${bPos.y.toFixed(3)},${bPos.z.toFixed(3)})`);
            drainBallUC.execute();
          }
        }
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
      const pw = physicsWorld as (PhysicsWorld & { _onKeyDown?: (e: KeyboardEvent) => void; _onKeyUp?: (e: KeyboardEvent) => void }) | null;
      if (pw?._onKeyDown) document.removeEventListener("keydown", pw._onKeyDown);
      if (pw?._onKeyUp) document.removeEventListener("keyup", pw._onKeyUp);
      const ctrl2 = (physicsWorld as unknown as Record<string, unknown>)?._controls as OrbitControls | undefined;
      ctrl2?.dispose();
      if (mountEl.contains(renderer.domElement)) mountEl.removeChild(renderer.domElement);
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

  // ── Debug collider highlight effect ──────────────────────────────────────────
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
      if (!mat || Array.isArray(mat) || !("emissive" in mat)) return;
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
  return (
    <div className="relative min-h-screen bg-black text-zinc-100">
      <GameOverlay
        score={score}
        lives={lives}
        gameState={gameState}
        initialLives={INITIAL_LIVES}
      />

      <DebugPanel
        debugPos={debugPos}
        onDebugPosChange={(pos) => {
          setDebugPos(pos);
          debugSpawnRef.current?.(pos.x, pos.y, pos.z);
        }}
        debugRadius={debugRadius}
        onDebugRadiusChange={(r) => {
          setDebugRadius(r);
          debugResizeBallRef.current?.(r);
        }}
        debugColliders={debugColliders}
        onLogSpawn={() =>
          console.info(
            `BALL_SPAWN_POSITION = { x: ${debugPos.x.toFixed(4)}, y: ${debugPos.y.toFixed(4)}, z: ${debugPos.z.toFixed(4)} }`,
          )
        }
      />

      <main
        ref={mountRef}
        className="h-screen w-full cursor-grab outline-none focus:outline-none"
        tabIndex={0}
        aria-label="Terrain de flipper — Q/D ou ← → pour les flippers, maintenir ESPACE et relâcher pour lancer"
      />
    </div>
  );
}
