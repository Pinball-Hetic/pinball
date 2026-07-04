import { useEffect, useRef, useState, useCallback, type CSSProperties } from "react";
import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import {
  PhysicsWorld,
  BallPhysics,
  LaunchBall,
  DrainBall,
  BottomOutBall,
  DetectBottomOut,
  getBallRadius,
  INITIAL_LIVES,
  CollisionEventProcessor,
  StuckBallDetector,
  BallDiagnostics,
  type BallDiagnosticsSnapshot,
  type BallResetReason,
  createGltfLoader,
  CinematicDirector,
  PlayfieldCinematicStrobe,
  cinematicFreezeFeedback,
  type CinematicFreezeFeedbackConfig,
  ScreenShake,
  parsePlayfieldViewMode,
  configureSurfaceCoefficients,
  configureBallRadius,
  DEFAULT_BALL_RADIUS,
  DEFAULT_PLAYFIELD_CAMERA_DEBUG_TUNING,
  type PlayfieldCameraDebugTuning,
  BallTrail,
  QualityGovernor,
  ShooterLaneGate,
} from "@pinball/game-engine";
import { getMapPackage, type ResolvedMap } from "@pinball/maps";
import { NoSignal } from "@pinball/ui";
import { type MapModule, type GameEventListener } from "@pinball/game-engine";
import type { CinematicClip, ScoreUpdate } from "@pinball/shared-types";
import { clipFreezeMs, DEFAULT_MAP_ID } from "@pinball/shared-types";

const MAP_ID = process.env.NEXT_PUBLIC_MAP_ID ?? DEFAULT_MAP_ID;
// Resolved at module level (MAP_ID is a build-time constant) — fallback
// when no mapId prop is provided.
const DEFAULT_RESOLVED_MAP = getMapPackage(MAP_ID);

import { createPlayfieldScene } from "./scene/createPlayfieldScene";
import { attachResizeHandler } from "./scene/attachResizeHandler";
import { loadPlayfieldGlb, assemblePlayfieldModel } from "./scene/assemblePlayfieldModel";
import { BallDragController } from "./scene/BallDragController";
import { PlayfieldCameraRig } from "./scene/PlayfieldCameraRig";
import { useGameState } from "@/hooks/useGameState";
import { useDmdOrchestrator } from "@/hooks/useDmdOrchestrator";
import { useOutroAutoExit } from "@/hooks/useOutroAutoExit";
import { useMapAudio, collectMapSoundUrls } from "@/hooks/useMapAudio";
import { usePhysicalInputs } from "@/hooks/usePhysicalInputs";
import { playfieldToScreenPercentForMode } from "@/utils/playfieldScreen";
import {
  notifyBootPhase,
  onPlayfieldReady,
  playMapCinematicSound,
  warmMapSounds,
  resetPinballAudioForNewGame,
  unlockPinballAudio,
} from "@/audio/pinballAudio";
import GameOverlay from "./GameOverlay";
import {
  computeBootPhase,
  shouldAutoBeginSession,
  type PlayfieldBootPhase,
} from "./bootPhase";
import {
  createApplyAction,
  createInputState,
  type InputState,
} from "./createApplyAction";
import { buildFlipperBodies, type FlipperBodiesResult } from "./physics/buildFlipperBodies";
import { buildPlungerBody } from "./physics/buildPlungerBody";
import { createKeyboardRouter } from "./createKeyboardRouter";
import { DebugMeshManager } from "./debug/DebugMeshManager";
import { createMapContext } from "./createMapContext";
import { computePlungerVisual, createPlungerChargeUi } from "./hotLoop/computePlungerVisual";
import { computeFrameDt, computeTrailIntensity } from "./hotLoop/frameMath";
import { buildPlayfieldColliders } from "./physics/buildPlayfieldColliders";
import { setupFlippers, type FlipperSetupResult } from "./physics/setupFlippers";
import { stepBallSync } from "./hotLoop/stepBallSync";
import {
  createFlipperFrameState,
  stepFlipperPhysics,
  stepFlipperKinematics,
  stepFlipperAssist,
} from "./hotLoop/flipperFrame";
import { updateRapierDebugGeometry } from "./hotLoop/rapierDebugRender";
import { createBossIntroHoldState, stepBossIntroHold } from "./hotLoop/bossIntroHold";
import { wireGameplay } from "./wireGameplay";
import { createPhysicalInputHandlers, createDispatchButton } from "./wireInputs";
import { createDmdScoreCallbacks } from "./dmdScoreCallbacks";
import CinematicOverlay from "./CinematicOverlay";
import BallDebugOverlay from "./BallDebugOverlay";
import DebugPanel from "./DebugPanel";


type AlternateWorldPersistence = "until_game_over" | "until_drain";
const ALTERNATE_WORLD_PERSISTENCE: AlternateWorldPersistence = "until_game_over";

/**
 * Keyboard mode — `NEXT_PUBLIC_KEYBOARD_MODE`:
 * - `direct`: applies locally (default). ~0 latency.
 * - `simulate-esp32`: emits a `dev:simulate-button` Socket.io event to the
 *   server, which turns it into an `input:button` broadcast. Validates the
 *   network chain without hardware.
 * - `disabled`: game keys ignored. `H` (debug) stays active.
 */
type KeyboardMode = "direct" | "simulate-esp32" | "disabled";
const KEYBOARD_MODE: KeyboardMode =
  (process.env.NEXT_PUBLIC_KEYBOARD_MODE as KeyboardMode) || "direct";

const PLAYFIELD_VIEW_MODE = parsePlayfieldViewMode(process.env.NEXT_PUBLIC_PLAYFIELD_VIEW_MODE);
const IS_PORTRAIT_FILL = PLAYFIELD_VIEW_MODE === 'portrait-fill';

type PinballPlayfieldProps = {
  /** HUD + portrait frame for the physical cabinet screen (`/pinball?cabinet`) */
  cabinetMode?: boolean;
  /** Map id to load. Absent → NEXT_PUBLIC_MAP_ID, then DEFAULT_MAP_ID. */
  mapId?: string;
};

// NO SIGNAL guard: unknown map → fullscreen standby, no crash. Hook-free
// wrapper so the Inner (all the hooks) only mounts when the map exists.
export default function PinballPlayfield(props: PinballPlayfieldProps) {
  const resolvedMap = props.mapId ? getMapPackage(props.mapId) : DEFAULT_RESOLVED_MAP;
  if (!resolvedMap) return <NoSignal reason={`MAP "${props.mapId ?? MAP_ID}" INTROUVABLE`} />;
  return <PinballPlayfieldInner {...props} resolvedMap={resolvedMap} />;
}

function PinballPlayfieldInner({ cabinetMode = false, resolvedMap }: PinballPlayfieldProps & { resolvedMap: ResolvedMap }) {
  // Bosses, clips and sounds derive from the selected map (prop — changes on remount).
  const mapBosses = resolvedMap.layout.bosses ?? [];
  const mapClips = resolvedMap.manifest.clips;
  useMapAudio(resolvedMap.manifest);
  const mapSoundUrls = collectMapSoundUrls(resolvedMap);
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!IS_PORTRAIT_FILL) return;
    document.documentElement.classList.add('playfield-portrait-fill');
    document.body.classList.add('playfield-portrait-fill');
    return () => {
      document.documentElement.classList.remove('playfield-portrait-fill');
      document.body.classList.remove('playfield-portrait-fill');
    };
  }, []);

  const [debugSnapshot, setDebugSnapshot] = useState<BallDiagnosticsSnapshot | null>(null);
  const [debugVisible, setDebugVisible] = useState(false);
  const [cameraDebugTuning, setCameraDebugTuning] = useState<PlayfieldCameraDebugTuning>(
    () => DEFAULT_PLAYFIELD_CAMERA_DEBUG_TUNING,
  );
  const cameraDebugTuningRef = useRef(cameraDebugTuning);
  cameraDebugTuningRef.current = cameraDebugTuning;
  const playfieldRootHandleRef = useRef<THREE.Object3D | null>(null);
  const refitCameraRef = useRef<((root: THREE.Object3D) => void) | null>(null);
  // DOM cinematic overlay (one re-render per cinematic, not per frame).
  const [cinematicClip, setCinematicClip] = useState<CinematicClip | null>(null);
  const debugVisibleRef = useRef(false);

  const [flipperPivotCoords, setFlipperPivotCoords] = useState<{
    left:  { x: number; y: number; z: number };
    right: { x: number; y: number; z: number };
  } | null>(null);

  const [physicsReady, setPhysicsReady] = useState(false);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [plungerCharge, setPlungerCharge] = useState<number | null>(null);
  // Game-over outro: claim URL (arrives async via game:registered) + frozen
  // score shown in the overlay. QR is rendered client-side (StyledQrCode).
  const [gameOverClaimUrl, setGameOverClaimUrl] = useState<string | null>(null);
  const [gameOverCode, setGameOverCode] = useState<string | null>(null);
  const [finalScore, setFinalScore] = useState(0);
  const physicsReadyRef = useRef(false);
  const sessionStartedRef = useRef(false);
  /** Called from the game loop when the session starts (shows the ball). */
  const onSessionStartRef = useRef<(() => void) | null>(null);

  const handleCameraTuningChange = useCallback((next: PlayfieldCameraDebugTuning) => {
    setCameraDebugTuning(next);
    const root = playfieldRootHandleRef.current;
    if (root) refitCameraRef.current?.(root);
  }, []);

  const handleAttractInteract = useCallback(() => {
    unlockPinballAudio();
  }, []);

  const beginSession = useCallback(() => {
    if (!physicsReadyRef.current || sessionStartedRef.current) return;
    sessionStartedRef.current = true;
    setSessionStarted(true);
    handleAttractInteract();
    onSessionStartRef.current?.();
    mountRef.current?.focus();
  }, [handleAttractInteract]);

  const beginSessionRef = useRef(beginSession);
  beginSessionRef.current = beginSession;

  const bootPhase: PlayfieldBootPhase = computeBootPhase({
    physicsReady,
    sessionStarted,
  });

  useEffect(() => {
    notifyBootPhase(bootPhase);
  }, [bootPhase]);

  // Auto-spawn: the map is already selected upstream, so start the session as
  // soon as physics is ready — no START/SPACE wait. The ball appears in the
  // shooter lane, ready to launch.
  useEffect(() => {
    if (shouldAutoBeginSession({ physicsReady, sessionStarted })) {
      beginSessionRef.current();
    }
  }, [physicsReady, sessionStarted]);

  const dmd = useDmdOrchestrator(mapClips, (d) => {
    setGameOverClaimUrl(d.claimUrl);
    setGameOverCode(d.code);
  });

  // Cinematic director (stable). Ref → reachable from render-scope callbacks
  // (onLifeLost) and the animate loop (useEffect).
  const cinematicsRef = useRef<CinematicDirector | null>(null);
  if (!cinematicsRef.current) cinematicsRef.current = new CinematicDirector();
  const cinematics = cinematicsRef.current;

  // Resolved map (guaranteed non-null by the wrapper's NO SIGNAL guard).
  const mapPackageRef = useRef<ResolvedMap>(resolvedMap);
  // Module ref (reachable from render-scope callbacks, e.g. reset).
  const mapModuleRef = useRef<MapModule | null>(null);
  // emit (defined inside the effect) exposed to render-scope useGameState callbacks.
  const emitRef = useRef<GameEventListener | null>(null);
  const mapLayout = mapPackageRef.current.layout;
  const mapManifest = mapPackageRef.current.manifest;
  // manifest.glb is already an absolute public URL (/maps/<id>/…).
  const playfieldUrl = mapManifest.glb;

  const playCinematic = useCallback(
    (
      clip: CinematicClip,
      opts?: { once?: boolean; value?: number; onEnd?: () => void },
    ): boolean => {
      const freezeMs = clipFreezeMs(mapManifest.clips, clip);
      // Freezing clip → goes through the director (physics pause). No freeze
      // (0 ms) → plain DMD push, the game keeps running.
      if (freezeMs > 0) {
        const accepted = cinematics.play(
          {
            id: clip,
            durationMs: freezeMs,
            freezePhysics: true,
            onEnd: () => {
              setCinematicClip(null); // hide DOM overlay on resume
              opts?.onEnd?.();
            },
          },
          { once: opts?.once },
        );
        if (!accepted) return false;
        setCinematicClip(clip); // show DOM overlay during the freeze
      } else {
        opts?.onEnd?.();
      }
      dmd.pushCinematic(clip, opts?.value); // SHOW duration handled by the orchestrator
      return true;
    },
    [cinematics, dmd],
  );

  const {
    lives,
    gameState,
    gameStateRef,
    bossHud,
    scorePops,
    alternateWorldActive,
    alternateWorldHint,
    scoreRef,
    livesRef,
    comboRef,
    multiplierRef,
    playerRef,
    isFeverActive,
    startFever,
    clearAlternateWorldSession,
    buildEmit,
    addLife,
  } = useGameState({
    // Deps resolved lazily (lambda): scoreSnapshot/mapStateExtraRef/… are
    // declared further down (TDZ at render otherwise); the callbacks run
    // post-render.
    ...createDmdScoreCallbacks(() => ({
      dmd,
      mapBosses,
      mapId: mapManifest.id,
      snapshot: scoreSnapshot,
      buildMapState,
      playCinematic,
      playerRef,
      scoreRef,
      atmosphereAlternateRef,
      getMapCounters: () => mapStateExtraRef.current,
      setFinalScore,
      clearClaimQr: () => {
        setGameOverClaimUrl(null);
        setGameOverCode(null);
      },
      resetCinematics: () => cinematics.resetGame(),
      resetAudio: resetPinballAudioForNewGame,
      resetMapModule: () => mapModuleRef.current?.onGameReset(),
      openShooterLaneGate: () => shooterLaneGateRef.current?.open(),
    })),
    // Milestone + boss-armed effects (cinematics/celebrate/shake/hint) are
    // handled by the map module (MILESTONE / BOSS_ARMED events).
    onMilestone: (threshold) => emitRef.current?.({ type: "MILESTONE", threshold }),
    onBossArmed: (bossId) => emitRef.current?.({ type: "BOSS_ARMED", bossId }),
  }, {
    portalAnchor: mapLayout.sensors.portal,
    bumperAnchors: mapLayout.bumpers,
    atmosphereHintMs: mapLayout.atmosphere.hintMs,
    bosses: mapBosses,
  });

  // mapState patches pushed by the map module (ctx.setMapState), merged into
  // every snapshot.
  const mapStateExtraRef = useRef<Record<string, number | boolean>>({});

  // Single builder for the mapState injected into every DMD/score snapshot.
  // Map counters come from the map module (mapStateExtraRef); fever stays
  // driven by useGameState (multiplier mechanism).
  const buildMapState = (fever: boolean = isFeverActive()) => ({
    ...mapStateExtraRef.current,
    fever,
  });

  // Current score snapshot (DMD/backglass) — `over` overrides fields when the
  // fresh value isn't in the ref yet (e.g. lives just decremented).
  // Referenced by useGameState callbacks (run post-render → TDZ ok).
  const scoreSnapshot = (over: Partial<ScoreUpdate> = {}): ScoreUpdate => ({
    player: playerRef.current,
    score: scoreRef.current,
    combo: comboRef.current,
    multiplier: multiplierRef.current,
    lives: livesRef.current,
    mapState: buildMapState(),
    ...over,
  });

  const shooterLaneGateRef = useRef<ShooterLaneGate | null>(null);
  const screenShakeRef = useRef<ScreenShake | null>(null);
  if (!screenShakeRef.current) screenShakeRef.current = new ScreenShake();
  const atmosphereAlternateRef = useRef(false);

  useEffect(() => {
    dmd.pushIntro(playerRef.current);
  }, []);

  const resetBallRef = useRef<(() => void) | null>(null);
  const handleResetBall = useCallback(() => {
    resetBallRef.current?.();
  }, []);

  // Outro/QR auto-exit after 20s → reload → selector.
  useOutroAutoExit(gameState);

  const { callbacksRef: physicalInputsRef, simulateButton, isConnectedRef } = usePhysicalInputs();

  useEffect(() => {
    let cancelled = false;
    const mountEl = mountRef.current;
    if (!mountEl) return;

    // ── Per-map config — must precede any physics/camera setup ──────────────
    configureSurfaceCoefficients(resolvedMap.layout.geometry.coefficients);
    configureBallRadius(mapManifest.ballRadius ?? DEFAULT_BALL_RADIUS);

    // ── Three.js setup ───────────────────────────────────────────────────────
    const rendering = mapManifest.rendering;
    const {
      scene,
      renderer,
      camera,
      cameraTarget,
      modelRoot,
      lights: {
        ambient: ambientLight,
        hemi: hemiLight,
        dir: dirLight,
        fill: fillLight,
      },
    } = createPlayfieldScene(mountEl, rendering);
    const { clientWidth, clientHeight } = mountEl;
    const loader = createGltfLoader();

    const cameraRig = new PlayfieldCameraRig({
      camera,
      cameraTarget,
      viewMode: PLAYFIELD_VIEW_MODE,
      getDebugTuning: () => cameraDebugTuningRef.current,
      getViewportSize: () => ({
        width: mountEl.clientWidth,
        height: mountEl.clientHeight,
      }),
    });

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

    refitCameraRef.current = (root) => cameraRig.syncToRoot(root);

    // ── Flipper visual state ─────────────────────────────────────────────────
    let flipperSetup: FlipperSetupResult | null = null;
    // Flipper frame accumulators (smoothed swing + hit flash), mutated by the
    // hot-loop steps.
    const flipperFrame = createFlipperFrameState();
    // Shared mutable input state (flippers + plunger) — owned here, mutated by
    // applyAction AND read by the animate loop.
    const inputState: InputState = createInputState();

    // ── Juice: screen shake ──────────────────────────────────────────────────
    const screenShake = screenShakeRef.current!;

    // ── Physics / game objects ───────────────────────────────────────────────
    let ballMesh: THREE.Object3D | null = null;
    let playfieldRootRef: THREE.Object3D | null = null;
    let physicsWorld: PhysicsWorld | null = null;
    let ballPhysicsInst: BallPhysics | null = null;
    let launchBallUC: LaunchBall | null = null;
    let drainBallUC: DrainBall | null = null;
    let bottomOutBallUC: BottomOutBall | null = null;
    let collisionProcessor: CollisionEventProcessor | null = null;
    const mapModule: MapModule | null = mapPackageRef.current?.module?.() ?? null;
    mapModuleRef.current = mapModule;
    // Hoisted: the MapContext (built early) references it via closures, but it
    // is only assigned once the event pipeline is ready (below).
    let emit: GameEventListener;
    let ballTrail: BallTrail | null = null;
    let shooterLaneGate: ShooterLaneGate | null = null;

    // Playfield feedback during cinematic freezes (e.g. HETIC letter gain):
    // a strobed flash makes the freeze read as intentional and points to the
    // DMD, instead of a dead frozen scene. Flash-only (no black veil) — the
    // DMD carries the content. Tunable via FREEZE_FEEDBACK.
    const freezeFeedbackStrobe = new PlayfieldCinematicStrobe();
    const FREEZE_FEEDBACK: CinematicFreezeFeedbackConfig = {
      hz: 9,
      maxMix: 0.85,
      activeFraction: 0.75,
      fadeOutFraction: 0.4,
    };

    // Quality governor: adjusts pixelRatio + feature flags from frame time.
    const quality = new QualityGovernor((tier) => {
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, tier.dpr));
      renderer.setSize(
        mountRef.current?.clientWidth ?? clientWidth,
        mountRef.current?.clientHeight ?? clientHeight,
      );
      ballTrail?.setMaxSprites(tier.trailMax);
      mapModuleRef.current?.setSporesEnabled?.(tier.sporesOn);
    });
    let flipperRig: FlipperBodiesResult | null = null;
    let physicsReady = false;
    // Keyboard handlers kept in effect scope → safe cleanup even if init() is
    // cancelled before wiring.
    let keydownHandler: ((e: KeyboardEvent) => void) | null = null;
    let keyupHandler: ((e: KeyboardEvent) => void) | null = null;
    let prevFrameTime = 0;
    const plungerChargeUi = createPlungerChargeUi((v) => setPlungerCharge(v));
    const bossIntroHold = createBossIntroHoldState();


    // ── Rapier debug renderer — all colliders ────────────────────────────────
    const rapierDebugGeo = new THREE.BufferGeometry();
    const rapierDebugMat = new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false });
    const rapierDebugLines = new THREE.LineSegments(rapierDebugGeo, rapierDebugMat);
    rapierDebugLines.visible = false;
    rapierDebugLines.renderOrder = 1000;
    scene.add(rapierDebugLines);
    disposableMats.push(rapierDebugMat);
    // Debug meshes (collidersOn state + H toggle) — assigned after the flipper
    // hulls/pivot markers are built (buildFlipperBodies).
    let debugMeshManager: DebugMeshManager | null = null;

    const stuckDetector = new StuckBallDetector();
    const bottomOutDetector = new DetectBottomOut();
    const diag = new BallDiagnostics(mapLayout);
    let lastDebugPush = 0;

    // SINGLE bottom-out trigger point: whatever the detection source (Rapier
    // sensor, lost ball, stuck ball, or the geometric zone below the flippers),
    // the decision happens here → one execute (idempotent via BottomOutBall's
    // latch) + cause logging.
    const triggerBottomOut = (reason: BallResetReason) => {
      bottomOutBallUC?.execute();
      diag.noteReset(reason);
    };

    // ── Debug: drag the ball with the mouse (`M` toggle) ─────────────────────
    // Drag the ball anywhere on the table to test stuck spots. While dragging:
    // orbit disabled, velocity forced to 0 (follows the cursor), shooter-lane
    // locks bypassed. On release physics resumes.
    const ballDragController = new BallDragController({
      renderer,
      camera,
      getPlayfieldRoot: () => playfieldRootRef,
      getBall: () => ballPhysicsInst,
      getBallMesh: () => ballMesh,
      getOrbitControls: () => cameraRig.orbit,
    });
    ballDragController.attach();

    // Diagnostic logs gated by the HUD `[J]` toggle → fully silent in prod.
    const debugLog = (...args: unknown[]) => {
      if (!debugVisibleRef.current) return;
      // eslint-disable-next-line no-console
      console.info(...args);
    };

    // ── Plunger kinematic ────────────────────────────────────────────────────
    let plungerBody: RAPIER.RigidBody | null = null;
    let plungerMesh: THREE.Mesh | null = null;
    let plungerRestZ = 0;


    // ── GLTF + Physics setup ─────────────────────────────────────────────────
    const init = async () => {
      try {
        const gltf = await loadPlayfieldGlb(loader, playfieldUrl);
        if (cancelled) return; // StrictMode: first mount was unmounted mid-flight
        // garlands/bumperVisuals/nestMarker/reveals are created by the map
        // module, not here.
        const assembled = assemblePlayfieldModel(gltf, {
          scene,
          modelRoot,
          rendering,
          layout: mapLayout,
          freezeFeedbackStrobe,
          collectDisposables,
          disposableGeos,
          disposableMats,
        });
        const playfieldRoot = assembled.playfieldRoot;
        playfieldRootRef = playfieldRoot;
        playfieldRootHandleRef.current = playfieldRoot;
        ballMesh = assembled.ballMesh;
        ballTrail = assembled.ballTrail;

        modelRoot.updateMatrixWorld(true);

        const flippers = setupFlippers(playfieldRoot, mapLayout.flipperPivots, getBallRadius());
        flipperSetup = flippers;

        // ── Physics ──────────────────────────────────────────────────────────
        physicsWorld = await PhysicsWorld.create();
        if (cancelled) return; // bail before colliders/ball — World disposed in cleanup
        const world = physicsWorld.world;
        // colliderMap created here (before the ctx) so it can be injected into the module.
        const colliderMap = new Map<number, string>();

        // ── MapContext: built EARLY so module.setup can create its systems
        // before they are consumed. emit is hoisted (assigned further down) →
        // reached via closures.
        if (mapModule) {
          // Forward refs (ball/ballMesh/collisionProcessor/emit, assigned
          // later) are passed as live-bound getters.
          const mapCtx = createMapContext({
            scene,
            root: playfieldRoot,
            camera,
            physics: physicsWorld,
            layout: mapLayout,
            manifest: mapManifest,
            colliderMap,
            lighting: {
              renderer,
              ambient: ambientLight,
              hemi: hemiLight,
              dir: dirLight,
              fill: fillLight,
            },
            getBall: () => ballPhysicsInst,
            getBallMesh: () => ballMesh,
            getCollisionProcessor: () => collisionProcessor,
            emit: (e) => emit(e),
            scoreRef,
            comboRef,
            multiplierRef,
            livesRef,
            playerRef,
            gameStateRef,
            mapStateExtraRef,
            atmosphereAlternateRef,
            dmd,
            screenShakeAdd: (amount) => screenShakeRef.current?.add(amount),
            resetStuck: () => stuckDetector.reset(),
            playCinematicSound: playMapCinematicSound,
            addLife: () => addLife(),
            startFever: (durationMs) => startFever(durationMs),
            isFeverActive: () => isFeverActive(),
            playCinematic: (clipId, opts) => playCinematic(clipId, opts),
            buildMapState: () => buildMapState(),
          });
          mapModule.setup(mapCtx);
        }
        // Async module preload (e.g. boss reveals) — blocks loading.
        await mapModule?.preload?.();
        if (cancelled) return; // bail before ball/collider creation

        shooterLaneGate = new ShooterLaneGate();
        shooterLaneGate.bind(world, mapLayout.shooterLane);
        shooterLaneGateRef.current = shooterLaneGate;

        modelRoot.updateMatrixWorld(true);

        // Role-driven GLB: trimeshes (walls/lane) + derived drop targets +
        // analytic colliders (floor/bumpers/sensors). Side effects on world +
        // colliderMap.
        buildPlayfieldColliders({
          world,
          root: playfieldRoot,
          manifest: mapManifest,
          layout: mapLayout,
          colliderMap,
        });

        ballPhysicsInst = new BallPhysics(world, mapLayout);

        // ── Flippers: kinematic bodies + debug hulls + pivot markers ──────────
        flipperRig = buildFlipperBodies({
          world,
          scene,
          leftFlipper: flippers.leftMesh as THREE.Mesh | null,
          rightFlipper: flippers.rightMesh as THREE.Mesh | null,
          leftPivot: flippers.leftPivot,
          rightPivot: flippers.rightPivot,
          disposableGeos,
          disposableMats,
        });

        debugMeshManager = new DebugMeshManager(
          {
            colliders: rapierDebugLines,
            leftHull: flipperRig.left.debugMesh,
            rightHull: flipperRig.right.debugMesh,
            leftPivotMarker: flipperRig.leftPivotMarker,
            rightPivotMarker: flipperRig.rightPivotMarker,
          },
          () => ({ left: flippers.leftPivot, right: flippers.rightPivot }),
        );

        ballPhysicsInst.setSpawnPosition(mapLayout.spawns.ball.x, mapLayout.spawns.ball.y, mapLayout.spawns.ball.z);
        ballPhysicsInst.body.wakeUp();

        // ── Plunger visual + kinematic body ──────────────────────────────────
        const plungerSetup = buildPlungerBody({
          world,
          scene,
          spawn: mapLayout.spawns.ball,
          disposableGeos,
          disposableMats,
        });
        plungerMesh = plungerSetup.mesh;
        plungerBody = plungerSetup.body;
        plungerRestZ = plungerSetup.restZ;

        // ── Fixed cabinet camera (non-rotatable) — playable table only ─────────
        modelRoot.updateMatrixWorld(true);
        cameraRig.director.setBosses(mapBosses);
        const camFrameBox = cameraRig.syncToRoot(playfieldRoot);
        cameraRig.applyNearFar(camFrameBox);
        const restoreBossCamera = () => {
          cameraRig.restoreBoss();
        };

        // ── OrbitControls — free camera ──────────────────────────────────────
        cameraRig.attachOrbit(renderer.domElement);

        // ── Use-case + event-router wiring. The intentional processor↔emit
        // cycle lives in the factory; results are assigned into closure `let`s
        // read by animate/applyAction/ctx.
        const wiring = wireGameplay({
          ball: ballPhysicsInst,
          colliderMap,
          mapLayout,
          mapBosses,
          mapModule,
          cameraRig,
          dmd,
          screenShake,
          diag,
          buildEmit,
          hideBallMesh: () => {
            if (ballMesh) ballMesh.visible = false;
          },
          restoreBossCamera,
          clearAlternateWorldSession,
          getShooterLaneGate: () => shooterLaneGate,
          getPlayfieldRoot: () => playfieldRootRef,
          livesRef,
          gameStateRef,
          scoreRef,
          alternateWorldPersistence: ALTERNATE_WORLD_PERSISTENCE,
        });
        const plunger = wiring.plunger;
        emit = wiring.emit;
        emitRef.current = emit; // exposed to useGameState callbacks (milestone/boss-armed)
        launchBallUC = wiring.launchBallUC;
        drainBallUC = wiring.drainBallUC;
        bottomOutBallUC = wiring.bottomOutBallUC;
        collisionProcessor = wiring.collisionProcessor;

        resetBallRef.current = () => {
          if (!drainBallUC || !sessionStartedRef.current) return;
          if (gameStateRef.current === "game_over") return;
          inputState.isChargingPlunger = false;
          inputState.plungerState = "idle";
          setPlungerCharge(null);
          stuckDetector.reset();
          bottomOutBallUC?.resetLatch();
          if (ballMesh) ballMesh.visible = true;
          // Manual reset (R key / game-over hide): re-arm the drain latch so
          // it stays repeatable, then force the drain.
          drainBallUC.resetLatch();
          drainBallUC.execute();
        };

        // ── Input handling ────────────────────────────────────────────────────
        console.log("[PinballPlayfield] KEYBOARD_MODE =", KEYBOARD_MODE);

        // Leaving the outro/QR screen (game over) → restart the workflow FROM
        // THE START: full reload → pinball.tsx boot → MapSelectorScreen
        // (multi-map) or forced-map attract (Fliphetic mono-map via
        // NEXT_PUBLIC_MAP_ID), with fresh engine/sockets/refs state. Same path
        // for manual replay (START/PLUNGE) and the 20s auto-exit (React
        // effect) — we never replay the same map in place.
        const restartWorkflow = () => window.location.reload();

        // Game-action router → effects (flippers/plunger/reset). Single source
        // of truth, called by `input:button` network events and by the dev
        // keyboard. All collaboration goes through getters/callbacks + the
        // `inputState` object shared with the animate loop.
        const applyAction = createApplyAction({
          state: inputState,
          now: () => performance.now(),
          isSessionStarted: () => sessionStartedRef.current,
          isPhysicsReady: () => physicsReadyRef.current,
          getGameState: () => gameStateRef.current,
          beginSession: () => beginSessionRef.current(),
          startPlungerCharge: (t) => plunger.startCharge(t),
          launchBall: (factor) => launchBallUC?.execute(factor),
          setPlungerCharge: (v) => setPlungerCharge(v),
          restartWorkflow,
          debugLog,
        });

        physicalInputsRef.current = createPhysicalInputHandlers({
          applyAction,
          emit: (e) => emit(e),
          mapBosses,
          getCollisionProcessor: () => collisionProcessor,
          getGameState: () => gameStateRef.current,
          // Cabinet cheat code: 3 left-facade buttons held together → ball
          // reset (same path as the R key — resetBall guards itself: no-op
          // outside a session or in game_over).
          onCheatReset: () => resetBallRef.current?.(),
        });

        const dispatchButton = createDispatchButton({
          mode: KEYBOARD_MODE,
          isConnectedRef,
          simulateButton,
          onButton: (data) => physicalInputsRef.current.onButton?.(data),
        });

        const { onKeyDown, onKeyUp } = createKeyboardRouter({
          unlockAudio: unlockPinballAudio,
          dispatchButton,
          debug: debugMeshManager,
          setFlipperPivotCoords,
          debugVisibleRef,
          setDebugVisible,
          toggleMoveMode: () => ballDragController.toggleMoveMode(),
          resetBall: () => resetBallRef.current?.(),
          isDev: process.env.NODE_ENV !== "production",
        });

        onSessionStartRef.current = () => {
          if (ballMesh) ballMesh.visible = true;
        };

        if (cancelled) return;

        document.addEventListener("keydown", onKeyDown);
        document.addEventListener("keyup", onKeyUp);
        keydownHandler = onKeyDown;
        keyupHandler = onKeyUp;

        if (ballMesh) ballMesh.visible = false;
        physicsReady = true;
        physicsReadyRef.current = true;
        setPhysicsReady(true);
        onPlayfieldReady();
        warmMapSounds(mapSoundUrls);
        debugLog("[PinballPlayfield] physicsReady = true (plateau chargé, en attente START)");
      } catch (err) {
        console.error("[Playfield] Erreur chargement :", err);
      }
    };

    void init();

    // ── Render loop ───────────────────────────────────────────────────────────
    let frameId: number;

    const animate = (time: number) => {
      frameId = requestAnimationFrame(animate);

      const dt = computeFrameDt(prevFrameTime, time);
      prevFrameTime = time;

      cinematics.update(time);
      mapModule?.update(dt);
      const bossIntroActive = mapModule?.isIntroHolding?.() ?? false;
      const cameraCinematicActive = cameraRig.director.isActive();
      const freezeFrame =
        (mapModule?.shouldFreezePhysics?.() ?? false) || cinematics.shouldFreeze();

      // Playfield feedback during a cinematic freeze (flash-only strobe):
      // makes the freeze readable + points to the DMD. Driven by the
      // director's elapsed time → 0 when no clip is active (mix decays,
      // flash removed).
      const freezeFb = cinematicFreezeFeedback(
        cinematics.shouldFreeze() ? cinematics.activeElapsedMs(time) : -1,
        cinematics.activeDurationMs(),
        FREEZE_FEEDBACK,
      );
      freezeFeedbackStrobe.applyFlashOnly(freezeFb.on, freezeFb.mix);

      // Boss intro hold (rising edge: capture + freeze the ball).
      stepBossIntroHold(bossIntroHold, bossIntroActive, ballPhysicsInst, inputState);

      if (physicsWorld && !freezeFrame) {
        const world = physicsWorld;
        world.update(dt, {
          onBeforeStep: () => {
            // ── Flipper physics: kinematic targets set PER STEP ─────────────
            // Advancing the swing at render rate swept a double arc per step
            // at 120 Hz → the hull jumped over the ball (tunneling; no CCD on
            // kinematic bodies). Here: one swing step per world.step(), fixed
            // stepDt → constant arc.
            if (flipperSetup && flipperRig) {
              stepFlipperPhysics(flipperFrame, {
                input: inputState,
                leftPivot: flipperSetup.leftPivot,
                rightPivot: flipperSetup.rightPivot,
                leftObj: flipperSetup.leftObj,
                rightObj: flipperSetup.rightObj,
                leftBody: flipperRig.left.body,
                rightBody: flipperRig.right.body,
                leftOffset: flipperRig.left.offset,
                rightOffset: flipperRig.right.offset,
              }, PhysicsWorld.STEP_INTERVAL);
            }
          },
          onStep: () => {
            collisionProcessor?.process(world.eventQueue, gameStateRef.current);
            // Capture the post-step position for render interpolation
            // (prev/curr lerp bounds in syncToMeshInterpolated).
            ballPhysicsInst?.noteStepped();
          },
          onAfterSteps: () => {
            collisionProcessor?.flushPendingPhysics();
          },
        });
      }

      if (!freezeFrame && flipperSetup && flipperRig) {
        // ── Flipper visuals — AFTER the steps: the displayed Three pose
        // follows the smoothed swing at refresh rate; on the next physics
        // step, stepFlipperPhysics re-poses the pivot from the phys-swing
        // (applyFlipperSwing = absolute rotation.set, no accumulation).
        stepFlipperKinematics(flipperFrame, {
          input: inputState,
          leftPivot: flipperSetup.leftPivot,
          rightPivot: flipperSetup.rightPivot,
          leftObj: flipperSetup.leftObj,
          rightObj: flipperSetup.rightObj,
          leftOffset: flipperRig.left.offset,
          rightOffset: flipperRig.right.offset,
          leftFlashMats: flipperSetup.leftFlashMats,
          rightFlashMats: flipperSetup.rightFlashMats,
          leftDebug: flipperRig.left.debugMesh,
          rightDebug: flipperRig.right.debugMesh,
        }, dt);
      }

      if (
        !freezeFrame
        && ballPhysicsInst
        && gameStateRef.current === 'playing'
        && flipperSetup?.zones
      ) {
        // Launch assist: angVel derived from per-step physics deltas → fixed
        // stepDt, not the render dt.
        stepFlipperAssist(flipperFrame, ballPhysicsInst, flipperSetup.zones, PhysicsWorld.STEP_INTERVAL);
      }

      if (ballPhysicsInst && !freezeFrame) {
        diag.verbose = debugVisibleRef.current;
        const lost = diag.update(ballPhysicsInst.body, gameStateRef.current);
        if (lost && gameStateRef.current === "playing") {
          triggerBottomOut("lost_recovery");
        }
        if (debugVisibleRef.current && time - lastDebugPush > 100) {
          lastDebugPush = time;
          setDebugSnapshot({ ...diag.getSnapshot() });
        }
      }

      if (ballPhysicsInst && gameStateRef.current === "playing" && !freezeFrame) {
        mapModule?.applyBallMagnet?.();
      }

      if (ballMesh?.visible && ballPhysicsInst) {
        stepBallSync({
          ball: ballPhysicsInst,
          ballMesh,
          gameState: gameStateRef.current,
          freezeFrame,
          physicsReady,
          isDragging: ballDragController.isDragging,
          bossIntroActive,
          bossIntroBallPos: bossIntroHold.pos,
          layout: mapLayout,
          shooterLaneGate,
          stuckDetector,
          bottomOutDetector,
          triggerBottomOut,
          dt,
          alpha: physicsWorld?.interpolationAlpha ?? 1,
        });
      }

      plungerChargeUi.step(time, inputState.isChargingPlunger, inputState.chargeStartTime);

      if (plungerMesh && plungerRestZ > 0) {
        const pv = computePlungerVisual(inputState, time, plungerRestZ);
        inputState.plungerState = pv.plungerState;
        plungerMesh.position.z = pv.z;
        if (plungerBody) {
          plungerBody.setNextKinematicTranslation({
            x: mapLayout.spawns.ball.x,
            y: mapLayout.spawns.ball.y,
            z: pv.z,
          });
        }
      }

      // ── OrbitControls update ─────────────────────────────────────────────
      cameraRig.updateFrame(dt, { freeze: freezeFrame, cinematicActive: cameraCinematicActive });

      // ── Rapier debug render (all colliders) ─────────────────────────────
      if (debugMeshManager?.collidersOn && physicsWorld) {
        updateRapierDebugGeometry(rapierDebugGeo, physicsWorld.world.debugRender());
      }

      // ── Quality governor (frame time → tiers) ───────────────────────────
      quality.frame(dt * 1000);

      // ── Fire trail (intensity ∝ combo, max during fever) ────────────────
      if (ballTrail) {
        const feverNow = isFeverActive();
        const playing = !!ballMesh?.visible && gameStateRef.current === "playing";
        const intensity = computeTrailIntensity(playing, feverNow, comboRef.current);
        ballTrail.update(
          dt,
          ballMesh ? ballMesh.position : { x: 0, y: 0, z: 0 },
          intensity,
          { alternateWorld: atmosphereAlternateRef.current, fever: feverNow },
          camera.quaternion,
        );
      }

      // ── Screen shake: transient offset applied AFTER camera placement,
      // restored after render (no accumulation inside OrbitControls).
      const shake = screenShake.update(dt);
      camera.position.x += shake.x;
      camera.position.y += shake.y;
      renderer.render(scene, camera);
      camera.position.x -= shake.x;
      camera.position.y -= shake.y;
    };

    frameId = requestAnimationFrame(animate);

    // ── Resize ────────────────────────────────────────────────────────────────
    const detachResize = attachResizeHandler({
      mountEl,
      camera,
      renderer,
      cameraRig,
      getPlayfieldRoot: () => playfieldRootRef,
    });

    // ── Cleanup ───────────────────────────────────────────────────────────────
    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
      mapModule?.dispose();
      detachResize();
      ballDragController.dispose();
      cameraRig.dispose();
      if (keydownHandler) document.removeEventListener("keydown", keydownHandler);
      if (keyupHandler) document.removeEventListener("keyup", keyupHandler);
      if (mountEl.contains(renderer.domElement)) mountEl.removeChild(renderer.domElement);
      // bumperVisuals + garlands + bossReveals + nestMarker are disposed by
      // mapModule.dispose.
      ballTrail?.dispose();
      freezeFeedbackStrobe.dispose();
      shooterLaneGate?.dispose();
      shooterLaneGateRef.current = null;
      playfieldRootHandleRef.current = null;
      refitCameraRef.current = null;
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

  const rootClassName = cabinetMode
    ? "flex min-h-[100dvh] w-full items-center justify-center bg-black text-zinc-100"
    : IS_PORTRAIT_FILL
      ? "fixed inset-0 overflow-hidden bg-black text-zinc-100"
      : "relative min-h-screen bg-black text-zinc-100";

  const frameClassName = cabinetMode
    ? "relative overflow-hidden rounded-sm shadow-[0_0_80px_rgba(0,0,0,0.85)] ring-1 ring-zinc-800/40"
    : IS_PORTRAIT_FILL
      ? "relative h-full w-full overflow-hidden"
      : "relative min-h-screen w-full";

  const canvasClassName =
    cabinetMode || IS_PORTRAIT_FILL
      ? "absolute inset-0 h-full w-full touch-none outline-none focus:outline-none"
      : "h-screen w-full touch-none outline-none focus:outline-none";

  const plungerAnchor = IS_PORTRAIT_FILL
    ? playfieldToScreenPercentForMode(
        mapLayout.spawns.ball.x,
        mapLayout.spawns.ball.z,
        "portrait-fill",
      )
    : undefined;

  return (
    <div className={rootClassName}>
        <div className={frameClassName} style={cabinetFrameStyle}>
        <GameOverlay
          lives={lives}
          gameState={gameState}
          bootPhase={bootPhase}
          plungerCharge={plungerCharge}
          onResetBall={handleResetBall}
          initialLives={INITIAL_LIVES}
          bossHud={bossHud}
          scorePops={scorePops}
          alternateWorldActive={alternateWorldActive}
          alternateWorldHint={alternateWorldHint}
          atmosphereBannerLabel={mapLayout.atmosphere.bannerLabel}
          atmosphereHintLabel={mapLayout.atmosphere.hintLabel}
          attractTagline={mapManifest.attractTagline ?? mapManifest.name}
          bosses={mapBosses}
          cabinetMode={cabinetMode}
          portraitFill={IS_PORTRAIT_FILL}
          plungerAnchor={plungerAnchor}
          onAttractInteract={() => {
            if (physicsReady && !sessionStarted) beginSession();
          }}
          gameOverClaimUrl={gameOverClaimUrl}
          gameOverCode={gameOverCode}
          gameOverScore={finalScore}
          mapTheme={mapManifest.theme as CSSProperties | undefined}
          outro={mapManifest.outro}
          qrLogo={mapManifest.outro?.qrLogo}
        />

        <BallDebugOverlay snapshot={debugSnapshot} visible={debugVisible} />

        {debugVisible && IS_PORTRAIT_FILL && (
          <DebugPanel
            cameraTuning={cameraDebugTuning}
            onCameraTuningChange={handleCameraTuningChange}
          />
        )}

        {flipperPivotCoords && (
          <div className="pointer-events-none absolute right-2 top-2 z-[100] rounded-md bg-black/80 px-3.5 py-2 font-mono text-[11px] leading-[1.7] text-white">
            <div className="font-bold text-[#00ffff]">⬤ PIVOT GAUCHE</div>
            <div>x: {flipperPivotCoords.left.x}</div>
            <div>y: {flipperPivotCoords.left.y}</div>
            <div>z: {flipperPivotCoords.left.z}</div>
            <div className="mt-1.5 font-bold text-[#ff00ff]">⬤ PIVOT DROIT</div>
            <div>x: {flipperPivotCoords.right.x}</div>
            <div>y: {flipperPivotCoords.right.y}</div>
            <div>z: {flipperPivotCoords.right.z}</div>
          </div>
        )}

        <CinematicOverlay clip={cinematicClip} clipFamilies={mapManifest.clipFamilies} overlayFiles={mapManifest.overlayFiles} />

        <main
          ref={mountRef}
          onPointerDown={() => {
            if (physicsReady && !sessionStarted) beginSession();
          }}
          className={canvasClassName}
          tabIndex={0}
          aria-label="Terrain de flipper - Q/D ou fleches gauche/droite pour les flippers, maintenir ESPACE et relacher pour lancer"
        />
      </div>
    </div>
  );
}
