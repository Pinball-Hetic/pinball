import { useEffect, useRef, useState, useCallback, type CSSProperties } from "react";
import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { ConvexGeometry } from "three/examples/jsm/geometries/ConvexGeometry.js";
import {
  PhysicsWorld,
  BallPhysics,
  Plunger,
  LaunchBall,
  BumperHit,
  BumpHit,
  DrainBall,
  BottomOutBall,
  DetectBottomOut,
  BALL_RADIUS,
  BALL_MAX_SPEED,
  bottomOutLaneSepX,
  SHOOTER_LANE_LEFT_WALL_TOP_Z,
  SHOOTER_LANE_LOCK_X,
  SHOOTER_LANE_EXIT_X,
  WALL_LEFT_X,
  WALL_RIGHT_X,
  WALL_BOTTOM_Z,
  WALL_TOP_Z,
  PLAYFIELD_SURFACE_Y,
  INITIAL_LIVES,
  PLUNGER_CHARGE_MS,
  plungerChargeProgress,
  plungerLaunchFactor,
  SWING_RAD,
  SWING_SMOOTH,
  FLIPPER_RESTITUTION,
  FLIPPER_FRICTION,
  FLIPPER_MIN_LAUNCH_VZ,
  FLIPPER_MIN_LAUNCH_ANGVEL,
  computeSurfaceSnap,
  PlayfieldTrimeshBuilder,
  PlayfieldColliderFactory,
  resolvePlayfieldFlippers,
  attachFlipperAtHinge,
  applyFlipperSwing,
  computeFlipperZones,
  type FlipperZones,
  type FlipperPivot,
  CollisionEventProcessor,
  StuckBallDetector,
  BallDiagnostics,
  type BallDiagnosticsSnapshot,
  findObjectByNormalizedName,
  removePinballmapUnusedMeshes,
  hidePinballmapDecorNodes,
  prepareGltfMaterialsForDisplay,
  configureGltfRenderer,
  createGltfLoader,
  ballCenterOnSurface,
  PlungerPhysics,
  type BossId,
  CinematicDirector,
  ScreenShake,
  BallTrail,
  QualityGovernor,
  PORTAL_ENTER_SCORE,
  ELEVEN_ASSIST_SCORE,
  SCORE_BUMPER,
  SCORE_SLINGSHOT,
  SCORE_RAMP,
  SCORE_DROP_COMPLETE,
  SCORE_DEMOGORGON_REVEAL,
  SCORE_DEMOGORGON_TARGET,
  type GameEvent,
  ShooterLaneGate,
} from "@pinball/game-engine";
import { getMapPackage, type ResolvedMap } from "@pinball/maps";
import { NoSignal } from "@pinball/ui";
import { MeshRoleResolver, LayoutResolver, type MapContext, type MapModule, type GameEventListener } from "@pinball/game-engine";
import type {
  ButtonAction,
  ButtonId,
  CinematicClip,
  DevGameEventTrigger,
} from "@pinball/shared-types";
import { clipFreezeMs } from "@pinball/shared-types";

const MAP_ID = process.env.NEXT_PUBLIC_MAP_ID ?? "strangerthings";
// Résolu au niveau module (MAP_ID = constante build-time) → permet un garde
// NO SIGNAL en 1ère ligne du composant, avant tout hook.
const RESOLVED_MAP = getMapPackage(MAP_ID);

// Mapping debug → GameEvent valide (valeurs par défaut depuis ScoringConstants).
function toGameEvent(d: DevGameEventTrigger): GameEvent | null {
  switch (d.type) {
    case "BUMPER_HIT":
      return { type: "BUMPER_HIT", bumperIndex: 0, scoreIncrement: SCORE_BUMPER };
    case "SLINGSHOT_HIT":
      return { type: "SLINGSHOT_HIT", side: "left", scoreIncrement: SCORE_SLINGSHOT };
    case "RAMP_HIT":
      return { type: "RAMP_HIT", scoreIncrement: SCORE_RAMP };
    case "DROP_TARGET_COMPLETE":
      return { type: "DROP_TARGET_COMPLETE", side: "left", scoreIncrement: SCORE_DROP_COMPLETE };
    case "DEMOGORGON_REVEAL":
      return { type: "BOSS_REVEAL", bossId: "demogorgon", scoreIncrement: SCORE_DEMOGORGON_REVEAL };
    case "DEMOGORGON_TARGET_HIT":
      return {
        type: "BOSS_TARGET_HIT",
        bossId: "demogorgon",
        hitCount: d.hitCount ?? 1,
        scoreIncrement: SCORE_DEMOGORGON_TARGET,
      };
    case "PORTAL_ENTER":
      return { type: "PORTAL_ENTER", scoreIncrement: PORTAL_ENTER_SCORE };
    case "ELEVEN_ASSIST":
      return { type: "ASSIST", assistId: "eleven", scoreIncrement: ELEVEN_ASSIST_SCORE };
    case "DEBUG_ADD_SCORE":
      // Score brut → le pipeline score/paliers réagit naturellement.
      return { type: "ZONE_HIT", zone: "debug", scoreIncrement: d.amount ?? 1000 };
    case "DRAIN":
      return { type: "DRAIN" };
    case "BOTTOM_OUT":
      return { type: "BOTTOM_OUT" };
    case "BALL_LAUNCHED":
      return { type: "BALL_LAUNCHED" };
    default:
      return null;
  }
}
import { useGameState } from "@/hooks/useGameState";
import { useDmdOrchestrator, eventLabel } from "@/hooks/useDmdOrchestrator";
import { usePhysicalInputs } from "@/hooks/usePhysicalInputs";
import {
  notifyBootPhase,
  onPlayfieldReady,
  playUpsideDownAppearSound,
  resetPinballAudioForNewGame,
  unlockPinballAudio,
} from "@/audio/pinballAudio";
import GameOverlay, { type PlayfieldBootPhase } from "./GameOverlay";
import CinematicOverlay from "./CinematicOverlay";
import BallDebugOverlay from "./BallDebugOverlay";


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

// Garde NO SIGNAL : map introuvable → écran de veille plein écran (pas de
// crash). Wrapper sans hook → l'Inner (tous les hooks) n'est monté que si la
// map existe.
export default function PinballPlayfield(props: PinballPlayfieldProps) {
  if (!RESOLVED_MAP) return <NoSignal reason={`MAP "${MAP_ID}" INTROUVABLE`} />;
  return <PinballPlayfieldInner {...props} />;
}

function PinballPlayfieldInner({ cabinetMode = false }: PinballPlayfieldProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);

  const [debugSnapshot, setDebugSnapshot] = useState<BallDiagnosticsSnapshot | null>(null);
  const [debugVisible, setDebugVisible] = useState(false);
  // Overlay cinématique DOM (un re-render par cinématique, pas par frame).
  const [cinematicClip, setCinematicClip] = useState<CinematicClip | null>(null);
  const debugVisibleRef = useRef(false);

  const [flipperPivotCoords, setFlipperPivotCoords] = useState<{
    left:  { x: number; y: number; z: number };
    right: { x: number; y: number; z: number };
  } | null>(null);

  const [physicsReady, setPhysicsReady] = useState(false);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [plungerCharge, setPlungerCharge] = useState<number | null>(null);
  const physicsReadyRef = useRef(false);
  const sessionStartedRef = useRef(false);
  /** Appelé depuis le game loop quand la session démarre (affiche la balle). */
  const onSessionStartRef = useRef<(() => void) | null>(null);

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

  const bootPhase: PlayfieldBootPhase = !physicsReady
    ? "loading"
    : !sessionStarted
      ? "attract"
      : "in_game";

  useEffect(() => {
    notifyBootPhase(bootPhase);
  }, [bootPhase]);

  const dmd = useDmdOrchestrator();

  // Directeur de cinématiques (stable). Ref → accessible depuis les
  // callbacks render-scope (onLifeLost) et la boucle animate (useEffect).
  const cinematicsRef = useRef<CinematicDirector | null>(null);
  if (!cinematicsRef.current) cinematicsRef.current = new CinematicDirector();
  const cinematics = cinematicsRef.current;

  // Map résolue (garantie non-null par le garde NO SIGNAL du wrapper).
  const mapPackageRef = useRef<ResolvedMap>(RESOLVED_MAP!);
  // Ref vers le module (accessible depuis les callbacks render-scope, ex. reset).
  const mapModuleRef = useRef<MapModule | null>(null);
  // emit (défini dans l'effet) exposé aux callbacks useGameState render-scope.
  const emitRef = useRef<GameEventListener | null>(null);
  const mapLayout = mapPackageRef.current.layout;
  const mapManifest = mapPackageRef.current.manifest;
  const playfieldUrl = `/${mapManifest.glb}`;

  const playCinematic = useCallback(
    (
      clip: CinematicClip,
      opts?: { once?: boolean; value?: number; onEnd?: () => void },
    ): boolean => {
      const freezeMs = clipFreezeMs(clip);
      // Clip avec gel → passe par le director (pause physique). Sans gel
      // (freeze 0) → simple push DMD, le jeu continue.
      if (freezeMs > 0) {
        const accepted = cinematics.play(
          {
            id: clip,
            durationMs: freezeMs,
            freezePhysics: true,
            onEnd: () => {
              setCinematicClip(null); // overlay DOM masqué à la reprise
              opts?.onEnd?.();
            },
          },
          { once: opts?.once },
        );
        if (!accepted) return false;
        setCinematicClip(clip); // overlay DOM visible pendant le gel
      } else {
        opts?.onEnd?.();
      }
      dmd.pushCinematic(clip, opts?.value); // duration SHOW gérée par l'orchestrator
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
    upsideDownActive,
    upsideDownHint,
    scoreRef,
    livesRef,
    comboRef,
    multiplierRef,
    playerRef,
    isFeverActive,
    startFever,
    clearUpsideDownSession,
    resetGame,
    buildEmit,
  } = useGameState({
    onScoreEvent: ({ event, finalPoints, previousMultiplier, newMultiplier }) => {
      const snap = {
        player: playerRef.current,
        score: scoreRef.current,
        combo: comboRef.current,
        multiplier: multiplierRef.current,
        lives: livesRef.current,
        mapState: buildMapState(),
      };

      dmd.emitScoreSnapshot(snap);
      dmd.pushScore(snap);

      // Chaque event fait switcher l'affichage. Exclusif, par priorité
      // décroissante : event labellisé → EVENT ; nouveau multiplier →
      // MULTI ; sinon combo en cours → COMBO.
      const label = eventLabel(event);
      if (label) {
        dmd.pushEvent(label, finalPoints, snap);
      } else if (previousMultiplier !== newMultiplier) {
        dmd.pushMultiFlash(newMultiplier, snap.combo, snap);
      } else if (snap.combo > 1) {
        dmd.pushComboFlash(snap.combo, snap.multiplier, snap);
      }
    },
    onLifeLost: (livesRemaining) => {
      const snap = {
        player: playerRef.current,
        score: scoreRef.current,
        combo: 0,
        multiplier: 1,
        lives: livesRemaining,
        mapState: buildMapState(),
      };
      dmd.emitScoreSnapshot(snap);
      dmd.pushLifeLost(livesRemaining, scoreRef.current, playerRef.current);
      // Dernière vie engagée → respiration 1.2s (pas de gel : bille déjà drainée).
      if (livesRemaining === 1) playCinematic('last_chance');
    },
    onGameOver: (finalScore, stats) => {
      // Counters spécifiques map : récupérés du mapState (alimenté par le
      // module). useGameState ne compte plus rien de ST.
      const counters: Record<string, number> = {};
      for (const [k, v] of Object.entries(mapStateExtraRef.current)) {
        if (typeof v === "number") counters[k] = v;
      }
      // Pas d'affichage GAME_OVER sur le DMD : on garde le dernier SCORE
      // jusqu'au reset (INTRO). emitGameOver sert au backglass/leaderboard.
      dmd.emitGameOver(playerRef.current, finalScore, MAP_ID, { ...stats, counters });
      // Clip poussé à CHAQUE game over ; DMD/backglass décident de
      // l'ampleur (le backglass connaît le rang → fanfare ou recap).
      dmd.pushCinematic('hall_of_fame');
    },
    onGameStart: () => {
      dmd.emitGameStart(playerRef.current);
      const snap = {
        player: playerRef.current,
        score: scoreRef.current,
        combo: 0,
        multiplier: 1,
        lives: livesRef.current,
        mapState: buildMapState(),
      };
      dmd.emitScoreSnapshot(snap);
      dmd.pushScore(snap);
    },
    onIdleReset: () => {
      cinematics.resetGame();
      resetPinballAudioForNewGame();
      mapModuleRef.current?.onGameReset();
      shooterLaneGateRef.current?.open();
      dmd.pushIntro(playerRef.current);
      dmd.emitScoreSnapshot({
        player: playerRef.current,
        score: 0,
        combo: 0,
        multiplier: 1,
        lives: 3,
        mapState: buildMapState(false),
      });
    },
    onAtmosphereChange: (upsideDownActive) => {
      dmd.setAtmosphere(upsideDownActive);
      atmosphereUpsideRef.current = upsideDownActive;
      // nestMarker.setUpsideDown géré par le module (réconciliation onGameEvent).
    },
    // milestones + boss-armed (cinématiques/celebrate/shake/hint) gérés par le
    // module de map (events MILESTONE / BOSS_ARMED).
    onMilestone: (threshold) => emitRef.current?.({ type: "MILESTONE", threshold }),
    onBossArmed: (bossId) => emitRef.current?.({ type: "BOSS_ARMED", bossId }),
    // hetic (lettres + complete + fever) géré par le module de map.
    onFeverEnd: () => {
      // Re-émet un snapshot fever:false pour que DMD/backglass retombent.
      const snap = {
        player: playerRef.current,
        score: scoreRef.current,
        combo: comboRef.current,
        multiplier: multiplierRef.current,
        lives: livesRef.current,
        mapState: buildMapState(false),
      };
      dmd.emitScoreSnapshot(snap);
      dmd.pushScore(snap);
    },
  }, { portalAnchor: mapLayout.sensors.portal, bumperAnchors: mapLayout.bumpers });

  // Patches de mapState poussés par le module de map (ctx.setMapState). Fusionnés
  // dans chaque snapshot. hetic/fever restent fournis par useGameState pour
  // l'instant (migreront dans le module en phase 4.3d).
  const mapStateExtraRef = useRef<Record<string, number | boolean>>({});

  // Construction unique du mapState injecté dans chaque snapshot DMD/score.
  // hetic/demogorgons/portals viennent du module de map (mapStateExtraRef) ;
  // fever reste piloté par useGameState (mécanisme multiplicateur).
  const buildMapState = (fever: boolean = isFeverActive()) => ({
    ...mapStateExtraRef.current,
    fever,
  });

  const shooterLaneGateRef = useRef<ShooterLaneGate | null>(null);
  const screenShakeRef = useRef<ScreenShake | null>(null);
  if (!screenShakeRef.current) screenShakeRef.current = new ScreenShake();
  const atmosphereUpsideRef = useRef(false);

  useEffect(() => {
    dmd.pushIntro(playerRef.current);
  }, []);

  const resetBallRef = useRef<(() => void) | null>(null);
  const handleResetBall = useCallback(() => {
    resetBallRef.current?.();
  }, []);

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
    // Démarrage à 1.5 (HiDPI plafonné) ; le QualityGovernor ajuste ensuite
    // selon le frame time (1.5 → 1.25 → 1.0 → 1.0 + trail réduit/spores off).
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(clientWidth, clientHeight);
    // Shadows désactivées : avec 13+ PointLights (guirlandes + bumpers) dans
    // le shader, chaque pixel paie déjà lourd. La shadow map (cast + receive
    // sur tous les meshes GLB) ajoutait un pass de rendu entier + lookups PCF.
    renderer.shadowMap.enabled = false;
    mountEl.appendChild(renderer.domElement);

    // Lumière ambiante minimale pour éviter les noirs purs dans les ombres
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.25);
    scene.add(ambientLight);
    // HemiLight à 0 — conservé uniquement pour la compatibilité UpsideDownAtmosphere
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x111111, 0);
    scene.add(hemiLight);
    // Spot blanc principal depuis la position caméra (PLAYFIELD_VIEW_DIR : y=0.48, z=0.88)
    const dirLight = new THREE.DirectionalLight(0xffffff, 2.8);
    dirLight.position.set(0, 0.48, 0.88);
    dirLight.castShadow = false;
    scene.add(dirLight);
    // FillLight à 0 — conservé pour UpsideDownAtmosphere
    const fillLight = new THREE.DirectionalLight(0xffffff, 0);
    fillLight.position.set(0, 1, -1);
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
    let flipperZones: FlipperZones | null = null;
    let leftSwing = 0, rightSwing = 0;
    let prevLeftSwing = 0, prevRightSwing = 0;
    let leftTarget = 0, rightTarget = 0;

    // ── Juice : screen shake + hit-flash flippers ───────────────────────────
    const screenShake = screenShakeRef.current!;
    type FlashMat = { mat: THREE.MeshStandardMaterial; emissive: THREE.Color; intensity: number };
    let leftFlashMats: FlashMat[] = [];
    let rightFlashMats: FlashMat[] = [];
    let leftFlash = 0;
    let rightFlash = 0;
    const FLASH_DURATION = 0.08; // retour en 80ms
    const FLASH_INTENSITY = 1.2;
    const _flashColor = new THREE.Color(0xfff0e0); // blanc chaud
    const collectFlashMats = (obj: THREE.Object3D): FlashMat[] => {
      const out: FlashMat[] = [];
      obj.traverse((c) => {
        if (!(c instanceof THREE.Mesh)) return;
        const mats = Array.isArray(c.material) ? c.material : [c.material];
        for (const m of mats) {
          if (m instanceof THREE.MeshStandardMaterial) {
            out.push({ mat: m, emissive: m.emissive.clone(), intensity: m.emissiveIntensity });
          }
        }
      });
      return out;
    };
    const applyFlash = (mats: FlashMat[], t: number) => {
      const f = t > 0 ? t / FLASH_DURATION : 0;
      for (const fm of mats) {
        if (f > 0) {
          fm.mat.emissive.copy(fm.emissive).lerp(_flashColor, f);
          fm.mat.emissiveIntensity = fm.intensity + FLASH_INTENSITY * f;
        } else {
          fm.mat.emissive.copy(fm.emissive);
          fm.mat.emissiveIntensity = fm.intensity;
        }
      }
    };

    // ── Physics / game objects ───────────────────────────────────────────────
    let ballMesh: THREE.Object3D | null = null;
    let playfieldRootRef: THREE.Object3D | null = null;
    let physicsWorld: PhysicsWorld | null = null;
    let ballPhysicsInst: BallPhysics | null = null;
    let launchBallUC: LaunchBall | null = null;
    let bumperHitUC: BumperHit | null = null;
    let bumpHitUC: BumpHit | null = null;
    let drainBallUC: DrainBall | null = null;
    let bottomOutBallUC: BottomOutBall | null = null;
    let collisionProcessor: CollisionEventProcessor | null = null;
    const mapModule: MapModule | null = mapPackageRef.current?.module?.() ?? null;
    mapModuleRef.current = mapModule;
    // Hoisté : le MapContext (construit tôt) le référence via closures, mais il
    // n'est assigné qu'une fois le pipeline d'events prêt (plus bas).
    let emit: GameEventListener;
    let ballTrail: BallTrail | null = null;
    let shooterLaneGate: ShooterLaneGate | null = null;

    // Gouverneur de qualité : ajuste pixelRatio + flags selon le frame time.
    const quality = new QualityGovernor((tier) => {
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, tier.dpr));
      renderer.setSize(
        mountRef.current?.clientWidth ?? clientWidth,
        mountRef.current?.clientHeight ?? clientHeight,
      );
      ballTrail?.setMaxSprites(tier.trailMax);
      mapModuleRef.current?.setSporesEnabled?.(tier.sporesOn);
    });
    let leftFlipperBody: RAPIER.RigidBody | null = null;
    let rightFlipperBody: RAPIER.RigidBody | null = null;
    // Offset local (mesh-origin → geoCenter) — positionne le body cinématique
    // au vrai centre géométrique du mesh et pas à l'origine du groupe parent.
    const leftFlipperBodyOffset  = new THREE.Vector3();
    const rightFlipperBodyOffset = new THREE.Vector3();
    let isChargingPlunger = false;
    let chargeStartTime = 0;
    let physicsReady = false;
    let prevFrameTime = 0;
    let lastPlungerChargeUiPush = 0;
    let plungerChargeUiActive = false;
    let vecnaIntroHolding = false;
    const vecnaIntroBallPos = { x: 0, y: 0, z: 0 };


    // ── Flipper collider debug wireframes ────────────────────────────────────
    let leftFlipperDebug: THREE.Mesh | null = null;
    let rightFlipperDebug: THREE.Mesh | null = null;

    // ── Flipper pivot debug markers (sphères visibles avec H) ────────────────
    let leftPivotMarker: THREE.Mesh | null = null;
    let rightPivotMarker: THREE.Mesh | null = null;

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
    const bottomOutDetector = new DetectBottomOut(bottomOutLaneSepX(mapLayout.spawns.ball.x));
    const diag = new BallDiagnostics(mapLayout);
    let lastDebugPush = 0;

    // ── Debug : déplacer la bille à la souris (toggle `M`) ───────────────────
    // Drag la bille n'importe où sur le tapis pour tester les coincements.
    // Pendant le drag : orbit désactivé, vitesse forcée à 0 (suit le curseur),
    // locks du couloir bypassés. Au relâché : la physique reprend.
    let ballMoveMode = false;
    let ballDragging = false;
    const dragRaycaster = new THREE.Raycaster();
    const dragPointer = new THREE.Vector2();

    const moveBallToPointer = (clientX: number, clientY: number) => {
      if (!ballPhysicsInst || !playfieldRootRef) return;
      const rect = renderer.domElement.getBoundingClientRect();
      dragPointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      dragPointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      dragRaycaster.setFromCamera(dragPointer, camera);
      const hits = dragRaycaster.intersectObject(playfieldRootRef, true);
      if (!hits.length) return;
      const p = hits[0].point;
      ballPhysicsInst.body.setTranslation(
        { x: p.x, y: ballCenterOnSurface(p.z), z: p.z },
        true,
      );
      ballPhysicsInst.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      ballPhysicsInst.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      if (ballMesh) ballMesh.visible = true;
    };

    const onBallDragDown = (e: PointerEvent) => {
      if (!ballMoveMode) return;
      ballDragging = true;
      if (orbitControls) orbitControls.enabled = false;
      moveBallToPointer(e.clientX, e.clientY);
    };
    const onBallDragMove = (e: PointerEvent) => {
      if (!ballDragging) return;
      moveBallToPointer(e.clientX, e.clientY);
    };
    const onBallDragUp = () => {
      if (!ballDragging) return;
      ballDragging = false;
      if (orbitControls) orbitControls.enabled = true;
    };
    renderer.domElement.addEventListener("pointerdown", onBallDragDown);
    window.addEventListener("pointermove", onBallDragMove);
    window.addEventListener("pointerup", onBallDragUp);

    // Logs de diagnostic gérés par le toggle HUD `[J]` → silence total en prod.
    const debugLog = (...args: unknown[]) => {
      if (!debugVisibleRef.current) return;
      // eslint-disable-next-line no-console
      console.info(...args);
    };

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
          return await loader.loadAsync(playfieldUrl);
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
        hidePinballmapDecorNodes(playfieldRoot);
        prepareGltfMaterialsForDisplay(playfieldRoot);

        // garlands + bumperVisuals créés par le module de map (cluster visuals),
        // récupérés après mapModule.setup (plus bas, après le monde physique).
        // nestMarker + demogorgon/vecna reveals + bossReveals : créés/possédés
        // par le module de map (récupérés via le bridge, preload fait là-haut).
        ballTrail = new BallTrail();
        ballTrail.mount(scene);

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

        // resolvePlayfieldFlippers gère en priorité le nouveau format (flipper-left / flipper-right)
        // puis le format héritage (flipper.001 unique splitté géométriquement).
        const flipperSetup = resolvePlayfieldFlippers(playfieldRoot);

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
          leftFlashMats = collectFlashMats(leftFlipper);
        }
        if (rightFlipper && (rightFlipper as THREE.Mesh).isMesh) {
          rightFlipperPivot = attachFlipperAtHinge(rightFlipper, "right", pinballmap);
          rightFlipperObj = rightFlipper;
          rightFlashMats = collectFlashMats(rightFlipper);
        }

        // Zones de garantie de lancement dérivées des bbox mesh (pose de repos).
        if (leftFlipperObj && rightFlipperObj) {
          flipperZones = computeFlipperZones(leftFlipperObj, rightFlipperObj, BALL_RADIUS);
        }

        // ── Physics ──────────────────────────────────────────────────────────
        physicsWorld = await PhysicsWorld.create();
        const world = physicsWorld.world;
        // colliderMap créé ici (avant le ctx) pour être injecté dans le module.
        const colliderMap = new Map<number, string>();

        // ── MapContext : construit TÔT (avant UpsideDownTransition L~1034) pour
        // que module.setup puisse créer ses systèmes avant qu'ils soient
        // consommés. emit est hoisté (assigné plus bas) → utilisé via closures.
        if (mapModule) {
          const mapCtx: MapContext = {
            scene,
            root: playfieldRoot,
            camera,
            physics: physicsWorld,
            layout: mapLayout,
            manifest: mapManifest,
            colliderMap,
            get ball() {
              return ballPhysicsInst;
            },
            get ballMesh() {
              return ballMesh;
            },
            resetPortalTrigger: () => collisionProcessor?.resetPortalTrigger(),
            completeWorldCycle: () => collisionProcessor?.completeWorldCycle(scoreRef.current),
            resetStuck: () => stuckDetector.reset(),
            enterUpsideDown: () => collisionProcessor?.onUpsideDownEntered(scoreRef.current),
            playSound: (id) => {
              if (id === "upside_down_appear") playUpsideDownAppearSound();
            },
            refreshScoreSnapshot: () => {
              const snap = {
                player: playerRef.current,
                score: scoreRef.current,
                combo: comboRef.current,
                multiplier: multiplierRef.current,
                lives: livesRef.current,
                mapState: buildMapState(),
              };
              dmd.emitScoreSnapshot(snap);
              dmd.pushScore(snap);
            },
            screenShake: (amount) => screenShakeRef.current?.add(amount),
            isFeverActive: () => isFeverActive(),
            gameState: () => gameStateRef.current,
            lighting: {
              renderer,
              ambient: ambientLight,
              hemi: hemiLight,
              dir: dirLight,
              fill: fillLight,
            },
            resolve: (name) => findObjectByNormalizedName(playfieldRoot, name) ?? null,
            setPortalGateOpen: (open) => collisionProcessor?.setPortalOpen(open),
            setBossFightActive: (bossId, active) =>
              collisionProcessor?.setBossFightActive(bossId as BossId, active),
            setBossTargetArmed: (bossId, armed) =>
              collisionProcessor?.setBossTargetArmed(bossId as BossId, armed),
            bossGateContext: () => ({
              totalScore: scoreRef.current,
              upsideDownActive: collisionProcessor?.isUpsideDownActive() ?? false,
              normalWorldScoreBaseline: collisionProcessor?.getNormalWorldScoreBaseline() ?? 0,
              upsideDownScoreBaseline: collisionProcessor?.getUpsideDownScoreBaseline() ?? 0,
            }),
            isBossTriggered: (bossId) =>
              collisionProcessor?.isBossTriggered(bossId as BossId) ?? false,
            addScore: (points, label) =>
              emit({ type: "ZONE_HIT", zone: label ?? "", scoreIncrement: points }),
            setMapState: (patch) => {
              Object.assign(mapStateExtraRef.current, patch);
            },
            forceMultiplier: (_value, durationMs) => startFever(durationMs),
            pushDmdEvent: (label, points) =>
              dmd.pushEvent(label, points, {
                player: playerRef.current,
                score: scoreRef.current,
                combo: comboRef.current,
                multiplier: multiplierRef.current,
                lives: livesRef.current,
                mapState: buildMapState(),
              }),
            playCinematic: (clipId, opts) => playCinematic(clipId, opts),
            setAtmosphere: (active) => {
              dmd.setAtmosphere(active);
              atmosphereUpsideRef.current = active;
              // nestMarker.setUpsideDown géré par le module (réconciliation).
            },
            emitGameEvent: (e) => emit(e),
          };
          mapModule.setup(mapCtx);
        }
        // Préchargement asynchrone du module (ex. reveals boss) — bloque le
        // chargement comme avant.
        await mapModule?.preload?.();

        shooterLaneGate = new ShooterLaneGate();
        shooterLaneGate.bind(world);
        shooterLaneGateRef.current = shooterLaneGate;

        modelRoot.updateMatrixWorld(true);

        // GLB conventionné role-driven : les murs (wall_/lane_) sont des
        // trimeshes classés par rôle ; le sol/bumpers/sensors/couloir sont
        // analytiques (positions du layout).
        const meshResolver = new MeshRoleResolver(mapManifest.meshAliases);
        PlayfieldTrimeshBuilder.buildRoleDriven(
          playfieldRoot,
          world,
          meshResolver,
          mapManifest.elements ?? {},
        );
        // Phase 3.4 — drop targets dérivés du GLB (deltas ≤ 0.7 mm validés en
        // jeu) ; bumpers gardés au littéral (centre Box3 ≠ collider tuné). Le
        // log de comparaison reste actif pour surveiller la dérive au réexport.
        const derivedLayout = LayoutResolver.deriveAndCompare(playfieldRoot, meshResolver, mapLayout);
        const resolvedLayout = LayoutResolver.withDerivedDropTargets(mapLayout, derivedLayout);
        PlayfieldColliderFactory.createForMap(world, resolvedLayout, colliderMap);

        // upsideDownTransition créé/possédé par le module (récupéré via le
        // bridge). L'orchestration (isActive/start, cycle de monde) reste ici
        // car elle pilote la bille (spawns).

        ballPhysicsInst = new BallPhysics(world, mapLayout);

        // ── Flipper : corps cinématique + convex hull ─────────────────────────
        const makeFlipperBody = (
          flipper: THREE.Mesh | null,
          debugColor: number,
        ): { body: RAPIER.RigidBody | null; debugMesh: THREE.Mesh | null; localOffset: THREE.Vector3 } => {
          if (!flipper) return { body: null, debugMesh: null, localOffset: new THREE.Vector3() };
          flipper.updateMatrixWorld(true);
          const meshOrigin = new THREE.Vector3();
          const worldQuat  = new THREE.Quaternion();
          flipper.getWorldPosition(meshOrigin);
          flipper.getWorldQuaternion(worldQuat);
          const invWorldQuat = worldQuat.clone().invert();
          const posAttr = flipper.geometry.attributes.position as THREE.BufferAttribute;
          const n = posAttr.count;
          const v = new THREE.Vector3();

          // Centre géométrique réel (pas l'origine du groupe parent)
          let wSumX = 0, wSumY = 0, wSumZ = 0;
          for (let i = 0; i < n; i++) {
            v.fromBufferAttribute(posAttr, i).applyMatrix4(flipper.matrixWorld);
            wSumX += v.x; wSumY += v.y; wSumZ += v.z;
          }
          const geoCenter = new THREE.Vector3(wSumX / n, wSumY / n, wSumZ / n);
          const localOffset = geoCenter.clone().sub(meshOrigin).applyQuaternion(invWorldQuat);

          // Vertices en espace body-local (centré sur geoCenter)
          const localPts: THREE.Vector3[] = [];
          const raw: number[] = [];
          for (let i = 0; i < n; i++) {
            v.fromBufferAttribute(posAttr, i).applyMatrix4(flipper.matrixWorld);
            v.sub(geoCenter).applyQuaternion(invWorldQuat);
            localPts.push(v.clone());
            raw.push(v.x, v.y, v.z);
          }

          const body = world.createRigidBody(
            RAPIER.RigidBodyDesc.kinematicPositionBased()
              .setTranslation(geoCenter.x, geoCenter.y, geoCenter.z)
              .setRotation({ x: worldQuat.x, y: worldQuat.y, z: worldQuat.z, w: worldQuat.w }),
          );

          const hullDesc = RAPIER.ColliderDesc.convexHull(new Float32Array(raw));
          if (hullDesc) {
            world.createCollider(
              hullDesc
                .setRestitution(FLIPPER_RESTITUTION)
                .setFriction(FLIPPER_FRICTION)
                .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
              body,
            );
          }

          const convexGeo = new ConvexGeometry(localPts);
          const convexMat = new THREE.MeshBasicMaterial({
            color: debugColor, wireframe: true, transparent: true, opacity: 0.85, depthTest: false,
          });
          const debugMesh = new THREE.Mesh(convexGeo, convexMat);
          debugMesh.renderOrder = 999;
          debugMesh.visible = false;
          scene.add(debugMesh);
          disposableGeos.push(convexGeo);
          disposableMats.push(convexMat);

          return { body, debugMesh, localOffset };
        };

        const leftResult  = makeFlipperBody(leftFlipper  as THREE.Mesh | null, 0x00ffff);
        const rightResult = makeFlipperBody(rightFlipper as THREE.Mesh | null, 0xff00ff);
        leftFlipperBody  = leftResult.body;
        rightFlipperBody = rightResult.body;
        leftFlipperDebug  = leftResult.debugMesh;
        rightFlipperDebug = rightResult.debugMesh;
        leftFlipperBodyOffset.copy(leftResult.localOffset);
        rightFlipperBodyOffset.copy(rightResult.localOffset);

        // ── Pivot debug markers — sphères visibles quand H est actif ─────────
        {
          const pivotGeo = new THREE.SphereGeometry(0.008, 12, 12);
          const pivotMatL = new THREE.MeshBasicMaterial({ color: 0x00ffff, depthTest: false });
          const pivotMatR = new THREE.MeshBasicMaterial({ color: 0xff00ff, depthTest: false });
          disposableGeos.push(pivotGeo);
          disposableMats.push(pivotMatL, pivotMatR);

          if (leftFlipperPivot) {
            const wp = new THREE.Vector3();
            leftFlipperPivot.pivot.getWorldPosition(wp);
            leftPivotMarker = new THREE.Mesh(pivotGeo, pivotMatL);
            leftPivotMarker.position.copy(wp);
            leftPivotMarker.renderOrder = 1000;
            leftPivotMarker.visible = false;
            scene.add(leftPivotMarker);
          }
          if (rightFlipperPivot) {
            const wp = new THREE.Vector3();
            rightFlipperPivot.pivot.getWorldPosition(wp);
            rightPivotMarker = new THREE.Mesh(pivotGeo, pivotMatR);
            rightPivotMarker.position.copy(wp);
            rightPivotMarker.renderOrder = 1000;
            rightPivotMarker.visible = false;
            scene.add(rightPivotMarker);
          }
        }

        ballPhysicsInst.setSpawnPosition(mapLayout.spawns.ball.x, mapLayout.spawns.ball.y, mapLayout.spawns.ball.z);
        ballPhysicsInst.body.wakeUp();

        // ── Plunger visual + kinematic body ──────────────────────────────────
        const PLUNGER_RADIUS = 0.010;
        plungerRestZ = 0.240;

        const pgeo = new THREE.CylinderGeometry(PLUNGER_RADIUS, PLUNGER_RADIUS * 1.3, 0.04, 12);
        const pmat = new THREE.MeshStandardMaterial({ color: 0xddaa00, metalness: 0.9, roughness: 0.15 });
        const pmesh = new THREE.Mesh(pgeo, pmat);
        pmesh.rotation.x = Math.PI / 2;
        pmesh.position.set(mapLayout.spawns.ball.x, mapLayout.spawns.ball.y, plungerRestZ);
        scene.add(pmesh);
        plungerMesh = pmesh;
        disposableGeos.push(pgeo);
        disposableMats.push(pmat);

        plungerBody = PlungerPhysics.createBody(world, {
          x: mapLayout.spawns.ball.x,
          y: mapLayout.spawns.ball.y,
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

        const baseEmit = buildEmit(() => {
          if (ballMesh) ballMesh.visible = false;
          diag.noteReset("game_over_hide");
        });
        const releaseUpsideDownWorld = () => {
          mapModule?.releaseWorld?.();
          collisionProcessor?.resetUpsideDownSession();
          clearUpsideDownSession();
        };
        // Réconciliation des marqueurs de nid : gérée par le module de map
        // (fin de mapModule.onGameEvent, après chaque event).
        emit = (event) => {
          baseEmit(event);
          if (
            "scoreIncrement" in event
            && event.scoreIncrement
            && gameStateRef.current === "playing"
          ) {
            collisionProcessor?.tryAllBossReveals(scoreRef.current, gameStateRef.current);
          }
          diag.noteEvent(event.type);
          if (event.type === "DRAIN") diag.noteReset("drain");
          if (event.type === "BOTTOM_OUT") diag.noteReset("bottom_out");
          if (event.type === "BALL_LAUNCHED") diag.noteReset("launch");
          // bumperVisuals + garlands : onGameEvent géré par le module de map.
          // bossReveals + upsideDownPortal + upsideDownAtmosphere : onGameEvent
          // géré par le module de map.
          mapModule?.onGameEvent(event);

          // ── Screen shake par event (juice) ───────────────────────────────────
          if (event.type === "BUMPER_HIT") screenShake.add(0.25);
          else if (event.type === "SLINGSHOT_HIT") screenShake.add(0.2);
          else if (event.type === "DROP_TARGET_HIT") screenShake.add(0.35);
          else if (event.type === "DROP_TARGET_COMPLETE") screenShake.add(0.6);
          else if (event.type === "BOSS_TARGET_HIT" && event.bossId === "demogorgon") {
            screenShake.add(0.5);
          }

          // BOSS_LOCKED_HIT (flash nid + « ENCORE X PTS ») : géré par le module.

          // Cinématiques boss Demogorgon (reveal + victoire) : gérées par le
          // module de map (mapModule.onGameEvent).
          if (
            (event.type === "DRAIN" || event.type === "BOTTOM_OUT")
            && gameStateRef.current === "game_over"
          ) {
            collisionProcessor?.resetAllBossFights();
            collisionProcessor?.resetScoreBaselines();
            // bossReveals.endAllFights géré par le module (DRAIN/BOTTOM_OUT game-over).
          }
          if (event.type === "DRAIN" || event.type === "BOTTOM_OUT") {
            if (
              UPSIDE_DOWN_PERSISTENCE === "until_drain" ||
              gameStateRef.current === "game_over"
            ) {
              releaseUpsideDownWorld();
            }
          }
          if (event.type === "PORTAL_ENTER") {
            // Bascule de monde gérée par le module (mapModule.onGameEvent).
            dmd.pushCinematic("portal_swallow");
          }
          if (event.type === "RETURN_PORTAL_ENTER") {
            dmd.pushCinematic("portal_swallow");
          }
          // PORTAL_TRANSITION_END (portail actif + baseline + nid) géré par le
          // module de map.
          if (event.type === "BALL_LAUNCHED") {
            collisionProcessor?.resetPortalTrigger();
            bottomOutBallUC?.resetLatch();
          }
          if (event.type === "DRAIN" || event.type === "BOTTOM_OUT") {
            shooterLaneGate?.open();
          }
          if (event.type === 'DROP_TARGET_HIT') {
            const meshName = event.targetId.replace('drop_', 'drop_target_');
            const mesh = playfieldRootRef?.getObjectByName(meshName);
            if (mesh) mesh.visible = false;
          }
          if (event.type === 'DROP_TARGET_COMPLETE' || event.type === 'DROP_TARGET_RESET') {
            for (const dt of mapLayout.dropTargets) {
              const mesh = playfieldRootRef?.getObjectByName(dt.id.replace('drop_', 'drop_target_'));
              if (mesh) mesh.visible = true;
            }
          }

          // État des marqueurs de nid : recalculé par le module de map.
        };
        emitRef.current = emit; // expose aux callbacks useGameState (milestone/boss-armed)
        launchBallUC = new LaunchBall(ballPhysicsInst, plunger, emit);
        bumperHitUC = new BumperHit(ballPhysicsInst, emit);
        bumpHitUC = new BumpHit(ballPhysicsInst, emit);
        drainBallUC = new DrainBall(ballPhysicsInst, emit);
        bottomOutBallUC = new BottomOutBall(ballPhysicsInst, emit);

        collisionProcessor = new CollisionEventProcessor(
          mapLayout,
          colliderMap,
          bumperHitUC,
          bumpHitUC,
          drainBallUC,
          bottomOutBallUC,
          emit,
        );

        // upsideDownPortal créé/possédé par le module de map (récupéré plus
        // haut via le bridge). Ses resets / setUpsideDownActive / aimant
        // restent pilotés ici (flow transition + cycle de monde).

        // upsideDownAtmosphere créé/possédé par le module de map (récupéré
        // plus haut via le bridge). On garde ici le binding vecna + les resets.
        // vecnaReveal.bindUpsideDownAtmosphere fait par le module (setup).

        // onPortalEnter / onReturnPortalEnter (bascule de monde) gérés par le
        // module de map (mapModule.onGameEvent sur PORTAL_ENTER/RETURN_PORTAL_ENTER).

        resetBallRef.current = () => {
          if (!drainBallUC || !sessionStartedRef.current) return;
          if (gameStateRef.current === "game_over") return;
          isChargingPlunger = false;
          plungerState = "idle";
          setPlungerCharge(null);
          stuckDetector.reset();
          bottomOutBallUC?.resetLatch();
          if (ballMesh) ballMesh.visible = true;
          drainBallUC.execute();
        };

        // demogorgonReveal.setEmit fait par le module (ctx.emitGameEvent).

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
            if (!sessionStartedRef.current) {
              if (
                data.action === "DOWN"
                && physicsReadyRef.current
                && (data.id === "PLUNGER" || data.id === "START")
              ) {
                beginSessionRef.current();
                if (data.id === "PLUNGER" && gameStateRef.current === "idle") {
                  plunger.startCharge(performance.now());
                  isChargingPlunger = true;
                  chargeStartTime = performance.now();
                }
              }
              return;
            }
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
                debugLog(
                  `[Plunger] DOWN — gameState=${gameStateRef.current} physicsReady=${physicsReady} charging=${isChargingPlunger}`,
                );
                if (gameStateRef.current === "game_over") {
                  resetGame();
                  collisionProcessor?.resetAllBossFights();
                  collisionProcessor?.resetScoreBaselines();
                  mapModule?.resetWorld?.();
                  if (ballMesh) ballMesh.visible = true;
                  return;
                }
                if (gameStateRef.current === "idle" && physicsReadyRef.current) {
                  plunger.startCharge(performance.now());
                  isChargingPlunger = true;
                  chargeStartTime = performance.now();
                } else {
                  debugLog(
                    `[Plunger] DOWN ignoré — charge impossible (idle requis + physicsReady). ` +
                      `gameState=${gameStateRef.current} physicsReady=${physicsReady}`,
                  );
                }
              } else if (isChargingPlunger && gameStateRef.current === "idle") {
                isChargingPlunger = false;
                plungerState = "releasing";
                const t = plungerChargeProgress(performance.now(), chargeStartTime);
                const factor = plungerLaunchFactor(t);
                setPlungerCharge(null);
                debugLog(`[Plunger] RELEASE — factor=${factor.toFixed(2)} → lancement`);
                launchBallUC?.execute(factor);
              } else {
                debugLog(
                  `[Plunger] UP ignoré — pas en charge ou pas idle. ` +
                    `charging=${isChargingPlunger} gameState=${gameStateRef.current}`,
                );
              }
              return;
            }
            if (data.id === "START") {
              if (data.action === "DOWN" && gameStateRef.current === "game_over") {
                resetGame();
                collisionProcessor?.resetAllBossFights();
                collisionProcessor?.resetScoreBaselines();
                mapModule?.resetWorld?.();
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
          onDevEvent: (d) => {
            // Injecte dans le emit wrapper EXISTANT → chaîne complète
            // (cinématiques, gel, DMD, backglass). DRAIN/BOTTOM_OUT
            // appellent les vrais use-cases → la bille reset réellement.
            const ev = toGameEvent(d);
            if (ev) emit(ev);
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
            if (leftPivotMarker)   leftPivotMarker.visible   = debugCollidersOn;
            if (rightPivotMarker)  rightPivotMarker.visible  = debugCollidersOn;
            if (debugCollidersOn && leftFlipperPivot && rightFlipperPivot) {
              const lp = new THREE.Vector3();
              const rp = new THREE.Vector3();
              leftFlipperPivot.pivot.getWorldPosition(lp);
              rightFlipperPivot.pivot.getWorldPosition(rp);
              const fmt = (v: THREE.Vector3) => ({
                x: +v.x.toFixed(4), y: +v.y.toFixed(4), z: +v.z.toFixed(4),
              });
              setFlipperPivotCoords({ left: fmt(lp), right: fmt(rp) });
            } else {
              setFlipperPivotCoords(null);
            }
            return;
          }
          if (e.key === "j" || e.key === "J") {
            debugVisibleRef.current = !debugVisibleRef.current;
            setDebugVisible(debugVisibleRef.current);
            return;
          }
          if (e.key === "m" || e.key === "M") {
            ballMoveMode = !ballMoveMode;
            if (!ballMoveMode && ballDragging) {
              ballDragging = false;
              if (orbitControls) orbitControls.enabled = true;
            }
            return;
          }
          if (e.key === "r" || e.key === "R") {
            resetBallRef.current?.();
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

        onSessionStartRef.current = () => {
          if (ballMesh) ballMesh.visible = true;
        };

        if (cancelled) return;

        document.addEventListener("keydown", onKeyDown);
        document.addEventListener("keyup", onKeyUp);

        (physicsWorld as PhysicsWorld & { _onKeyDown?: typeof onKeyDown; _onKeyUp?: typeof onKeyUp })._onKeyDown = onKeyDown;
        (physicsWorld as PhysicsWorld & { _onKeyDown?: typeof onKeyDown; _onKeyUp?: typeof onKeyUp })._onKeyUp = onKeyUp;

        if (ballMesh) ballMesh.visible = false;
        physicsReady = true;
        physicsReadyRef.current = true;
        setPhysicsReady(true);
        onPlayfieldReady();
        debugLog("[PinballPlayfield] physicsReady = true (plateau chargé, en attente START)");
      } catch (err) {
        console.error("[Playfield] Erreur chargement :", err);
      }
    };

    void init();

    const syncFlipperBody = (
      body: RAPIER.RigidBody | null,
      flipper: THREE.Object3D | null,
      localOffset: THREE.Vector3,
    ) => {
      if (!body || !flipper) return;
      flipper.updateMatrixWorld(true);
      const wp = new THREE.Vector3();
      const wq = new THREE.Quaternion();
      flipper.getWorldPosition(wp);
      flipper.getWorldQuaternion(wq);
      const worldOffset = localOffset.clone().applyQuaternion(wq);
      wp.add(worldOffset);
      body.setNextKinematicTranslation({ x: wp.x, y: wp.y, z: wp.z });
      body.setNextKinematicRotation({ x: wq.x, y: wq.y, z: wq.z, w: wq.w });
    };

    // ── Render loop ───────────────────────────────────────────────────────────
    let frameId: number;

    const animate = (time: number) => {
      frameId = requestAnimationFrame(animate);

      const dt = prevFrameTime > 0 ? Math.min((time - prevFrameTime) / 1000, 0.05) : 0.016;
      prevFrameTime = time;

      // visuals + garlands (incl. setFever via ctx.isFeverActive) + bosses +
      // upside-down : update(dt) géré par mapModule.update.

      // Hint tardif du nid : géré par le module de map (mapModule.update).

      cinematics.update(time);
      mapModule?.update(dt);
      // Gel + intro boss pilotés par le module (shouldFreezePhysics inclut
      // transition + intro vecna). transition.update est dans mapModule.update.
      const vecnaIntroActive = mapModule?.isIntroHolding?.() ?? false;
      const freezeFrame = (mapModule?.shouldFreezePhysics?.() ?? false) || cinematics.shouldFreeze();

      if (vecnaIntroActive && !vecnaIntroHolding && ballPhysicsInst) {
        const p = ballPhysicsInst.body.translation();
        vecnaIntroBallPos.x = p.x;
        vecnaIntroBallPos.y = p.y;
        vecnaIntroBallPos.z = p.z;
        vecnaIntroHolding = true;
        leftTarget = 0;
        rightTarget = 0;
        ballPhysicsInst.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        ballPhysicsInst.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      }
      if (!vecnaIntroActive) {
        vecnaIntroHolding = false;
      }

      if (!freezeFrame) {
        // ── Flipper cinématique : Three.js → Rapier ───────────────────────────
        // Lissage normalisé à 60 FPS : Math.pow(1 - SWING_SMOOTH, dt * 60)
        // reproduit exactement le comportement 60 Hz sur tous les écrans
        // (120 Hz → decay plus petit par frame, même vitesse angulaire réelle).
        prevLeftSwing  = leftSwing;
        prevRightSwing = rightSwing;
        const swingDecay = 1 - Math.pow(1 - SWING_SMOOTH, dt * 60);
        leftSwing  += (leftTarget  * SWING_RAD - leftSwing)  * swingDecay;
        rightSwing += (rightTarget * SWING_RAD - rightSwing) * swingDecay;
        if (leftFlipperPivot)  applyFlipperSwing(leftFlipperPivot,  leftSwing);
        if (rightFlipperPivot) applyFlipperSwing(rightFlipperPivot, rightSwing);

        syncFlipperBody(leftFlipperBody,  leftFlipperObj,  leftFlipperBodyOffset);
        syncFlipperBody(rightFlipperBody, rightFlipperObj, rightFlipperBodyOffset);

        // ── Garantie de vitesse minimale ─────────────────────────────────────
        // Le contact cinématique est quasi nul près de la charnière.
        // Quand le flipper est en train de monter ET que la balle est dans la
        // zone flipper, on garantit une vitesse -Z minimale sans override si la
        // physique fait déjà mieux.
        // Seuil normalisé en vitesse angulaire (rad/s) : 0.004 * 60 = 0.24 rad/s,
        // indépendant du fps (évite que le seuil ne se déclenche jamais à 120+ Hz).
        if (ballPhysicsInst && gameStateRef.current === 'playing' && flipperZones) {
          const bp = ballPhysicsInst.body.translation();
          const bv = ballPhysicsInst.body.linvel();
          const { left: lz, right: rz } = flipperZones;
          const angVelL = (leftSwing  - prevLeftSwing) / dt;
          const angVelR = (rightSwing - prevRightSwing) / dt;
          const inLeft  = bp.z > lz.zMin && bp.z < lz.zMax && bp.x > lz.xMin && bp.x < lz.xMax;
          const inRight = bp.z > rz.zMin && bp.z < rz.zMax && bp.x > rz.xMin && bp.x < rz.xMax;
          if (inLeft && angVelL > FLIPPER_MIN_LAUNCH_ANGVEL && bv.z > FLIPPER_MIN_LAUNCH_VZ) {
            ballPhysicsInst.body.setLinvel({ x: bv.x, y: bv.y, z: FLIPPER_MIN_LAUNCH_VZ }, true);
            leftFlash = FLASH_DURATION; // hit-flash à la frappe
          }
          if (inRight && angVelR > FLIPPER_MIN_LAUNCH_ANGVEL && bv.z > FLIPPER_MIN_LAUNCH_VZ) {
            ballPhysicsInst.body.setLinvel({ x: bv.x, y: bv.y, z: FLIPPER_MIN_LAUNCH_VZ }, true);
            rightFlash = FLASH_DURATION;
          }
        }

        // Décroissance + application du hit-flash flippers.
        if (leftFlash > 0) leftFlash = Math.max(0, leftFlash - dt);
        if (rightFlash > 0) rightFlash = Math.max(0, rightFlash - dt);
        applyFlash(leftFlashMats, leftFlash);
        applyFlash(rightFlashMats, rightFlash);

        // ── Debug wireframes ─────────────────────────────────────────────────
        if (leftFlipperDebug && leftFlipperObj) {
          const wp = new THREE.Vector3(); const wq = new THREE.Quaternion();
          leftFlipperObj.getWorldPosition(wp); leftFlipperObj.getWorldQuaternion(wq);
          wp.add(leftFlipperBodyOffset.clone().applyQuaternion(wq));
          leftFlipperDebug.position.copy(wp); leftFlipperDebug.quaternion.copy(wq);
        }
        if (rightFlipperDebug && rightFlipperObj) {
          const wp = new THREE.Vector3(); const wq = new THREE.Quaternion();
          rightFlipperObj.getWorldPosition(wp); rightFlipperObj.getWorldQuaternion(wq);
          wp.add(rightFlipperBodyOffset.clone().applyQuaternion(wq));
          rightFlipperDebug.position.copy(wp); rightFlipperDebug.quaternion.copy(wq);
        }
      }

      if (physicsWorld && !freezeFrame) {
        const world = physicsWorld;
        world.update(dt, () => {
          collisionProcessor?.process(world.eventQueue, gameStateRef.current);
        });
      }

      if (ballPhysicsInst && !freezeFrame) {
        diag.verbose = debugVisibleRef.current;
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

      if (ballPhysicsInst && gameStateRef.current === "playing" && !freezeFrame) {
        mapModule?.applyBallMagnet?.();
      }

      // Ball sync
      if (ballMesh?.visible && ballPhysicsInst) {
        if (vecnaIntroActive && gameStateRef.current === "playing") {
          ballPhysicsInst.body.setTranslation(
            { x: vecnaIntroBallPos.x, y: vecnaIntroBallPos.y, z: vecnaIntroBallPos.z },
            true,
          );
          ballPhysicsInst.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
          ballPhysicsInst.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
          ballPhysicsInst.syncToMesh(ballMesh);
        } else if (!freezeFrame) {
        // Balle figée au spawn tant qu'on est idle, Y COMPRIS pendant la charge
        // du plongeur : sinon la gravité/inclinaison la fait glisser contre le
        // mur droit (frottement → ralentissement au lancement).
        if (gameStateRef.current === "idle" && physicsReady && !ballMoveMode) {
          const z = mapLayout.spawns.ball.z;
          ballPhysicsInst.body.setTranslation(
            { x: mapLayout.spawns.ball.x, y: ballCenterOnSurface(z), z },
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
        if (gameStateRef.current === "playing" && !ballMoveMode && !shooterLaneGate?.isClosed()) {
          const lp = ballPhysicsInst.body.translation();
          const inLaneStraight =
            lp.z > SHOOTER_LANE_LEFT_WALL_TOP_Z && lp.x > SHOOTER_LANE_LOCK_X;
          if (inLaneStraight) {
            ballPhysicsInst.body.setTranslation(
              { x: mapLayout.spawns.ball.x, y: lp.y, z: lp.z },
              true,
            );
            const lv = ballPhysicsInst.body.linvel();
            ballPhysicsInst.body.setLinvel({ x: 0, y: lv.y, z: lv.z }, true);
            const av = ballPhysicsInst.body.angvel();
            ballPhysicsInst.body.setAngvel({ x: av.x, y: 0, z: 0 }, true);
          } else if (lp.x < SHOOTER_LANE_EXIT_X) {
            shooterLaneGate?.close();
          }
        }

        // ── Surface snap : recolle la balle au sol incliné (logique en
        // game-engine, cf. computeSurfaceSnap). On lit pos/vel et on applique.
        if (gameStateRef.current === "playing" && !ballMoveMode) {
          const snap = computeSurfaceSnap(
            ballPhysicsInst.body.translation(),
            ballPhysicsInst.body.linvel(),
          );
          if (snap) {
            ballPhysicsInst.body.setTranslation(snap.translation, true);
            if (snap.linvel) ballPhysicsInst.body.setLinvel(snap.linvel, true);
          }
        }

        ballPhysicsInst.syncToMesh(ballMesh);

        // Clamp ball speed
        const bVelClamp = ballPhysicsInst.body.linvel();
        const speed = Math.sqrt(bVelClamp.x ** 2 + bVelClamp.y ** 2 + bVelClamp.z ** 2);
        if (speed > BALL_MAX_SPEED) {
          const scale = BALL_MAX_SPEED / speed;
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
      }

      // Plunger animation + jauge UI
      if (isChargingPlunger) {
        const t = plungerChargeProgress(time, chargeStartTime);
        plungerChargeUiActive = true;
        if (time - lastPlungerChargeUiPush > 40) {
          lastPlungerChargeUiPush = time;
          setPlungerCharge(t);
        }
      } else if (plungerChargeUiActive) {
        plungerChargeUiActive = false;
        setPlungerCharge(null);
      }

      if (plungerMesh && plungerRestZ > 0) {
        let plungerZ = plungerRestZ;
        if (isChargingPlunger) {
          const t = plungerChargeProgress(time, chargeStartTime);
          const pullback = plungerLaunchFactor(t) * 0.08;
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
            x: mapLayout.spawns.ball.x,
            y: mapLayout.spawns.ball.y,
            z: plungerZ,
          });
        }
      }

      // ── OrbitControls update ─────────────────────────────────────────────
      if (orbitControls && !freezeFrame) orbitControls.update();

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

      // ── Gouverneur de qualité (frame time → crans) ──────────────────────
      quality.frame(dt * 1000);

      // ── Traînée de feu (intensité ∝ combo, max en fever) ────────────────
      if (ballTrail) {
        const feverNow = isFeverActive();
        const playing = ballMesh?.visible && gameStateRef.current === "playing";
        const intensity = !playing
          ? 0
          : feverNow
            ? 1
            : Math.max(0, Math.min(1, (comboRef.current - 3) / 7));
        ballTrail.update(
          dt,
          ballMesh ? ballMesh.position : { x: 0, y: 0, z: 0 },
          intensity,
          { upsideDown: atmosphereUpsideRef.current, fever: feverNow },
          camera.quaternion,
        );
      }

      // ── Screen shake : offset transitoire appliqué APRÈS le placement
      // caméra, restauré après le rendu (pas d'accumulation côté OrbitControls).
      const shake = screenShake.update(dt);
      camera.position.x += shake.x;
      camera.position.y += shake.y;
      renderer.render(scene, camera);
      camera.position.x -= shake.x;
      camera.position.y -= shake.y;
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
      mapModule?.dispose();
      window.removeEventListener("resize", handleResize);
      renderer.domElement.removeEventListener("pointerdown", onBallDragDown);
      window.removeEventListener("pointermove", onBallDragMove);
      window.removeEventListener("pointerup", onBallDragUp);
      orbitControls?.dispose();
      const pw = physicsWorld as (PhysicsWorld & { _onKeyDown?: (e: KeyboardEvent) => void; _onKeyUp?: (e: KeyboardEvent) => void }) | null;
      if (pw?._onKeyDown) document.removeEventListener("keydown", pw._onKeyDown);
      if (pw?._onKeyUp) document.removeEventListener("keyup", pw._onKeyUp);
      if (mountEl.contains(renderer.domElement)) mountEl.removeChild(renderer.domElement);
      // bumperVisuals + garlands + bossReveals + nestMarker : dispose géré par
      // mapModule.dispose.
      ballTrail?.dispose();
      shooterLaneGate?.dispose();
      shooterLaneGateRef.current = null;
      // upsideDownPortal + transition + atmosphere : dispose géré par
      // mapModule.dispose.
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
          lives={lives}
          gameState={gameState}
          bootPhase={bootPhase}
          plungerCharge={plungerCharge}
          onResetBall={handleResetBall}
          initialLives={INITIAL_LIVES}
          bossHud={bossHud}
          scorePops={scorePops}
          upsideDownActive={upsideDownActive}
          upsideDownHint={upsideDownHint}
          cabinetMode={cabinetMode}
          onAttractInteract={() => {
            if (physicsReady && !sessionStarted) beginSession();
          }}
        />

        <BallDebugOverlay snapshot={debugSnapshot} visible={debugVisible} />

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

        <CinematicOverlay clip={cinematicClip} />

        <main
          ref={mountRef}
          onPointerDown={() => {
            if (physicsReady && !sessionStarted) beginSession();
          }}
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
