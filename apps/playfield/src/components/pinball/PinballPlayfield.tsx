import { useEffect, useRef, useState, useCallback, type CSSProperties } from "react";
import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
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
  getBallRadius,
  BALL_MAX_SPEED,
  bottomOutLaneSepX,
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
  getEnvironmentBlur,
  createGltfLoader,
  ballCenterOnSurface,
  PlungerPhysics,
  type BossId,
  CinematicDirector,
  ScreenShake,
  PlayfieldCameraDirector,
  playfieldCameraUpForMode,
  parsePlayfieldViewMode,
  refitPlayfieldCamera,
  configureSurfaceCoefficients,
  configureBallRadius,
  DEFAULT_BALL_RADIUS,
  type PlayfieldCamFit,
  type PlayfieldCamera,
  DEFAULT_PLAYFIELD_CAMERA_DEBUG_TUNING,
  type PlayfieldCameraDebugTuning,
  BallTrail,
  QualityGovernor,
  PORTAL_ENTER_SCORE,
  ASSIST_SCORE,
  SCORE_BUMPER,
  SCORE_SLINGSHOT,
  SCORE_RAMP,
  SCORE_DROP_COMPLETE,
  type GameEvent,
  ShooterLaneGate,
} from "@pinball/game-engine";
import { getBossById } from "@pinball/game-engine";
import { getMapPackage, type ResolvedMap } from "@pinball/maps";
import { NoSignal } from "@pinball/ui";
import { MeshRoleResolver, LayoutResolver, type MapContext, type MapModule, type GameEventListener } from "@pinball/game-engine";
import type {
  ButtonAction,
  ButtonId,
  CinematicClip,
  DevGameEventTrigger,
  GameAction,
} from "@pinball/shared-types";
import { BUTTON_ACTION, CABINET_BUTTONS, clipFreezeMs, DEFAULT_MAP_ID } from "@pinball/shared-types";

const MAP_ID = process.env.NEXT_PUBLIC_MAP_ID ?? DEFAULT_MAP_ID;
// Résolu au niveau module (MAP_ID = constante build-time) — utilisé comme
// fallback si aucun mapId n'est fourni en prop.
const DEFAULT_RESOLVED_MAP = getMapPackage(MAP_ID);

// Mapping debug → GameEvent valide (valeurs par défaut depuis ScoringConstants).
function toGameEvent(d: DevGameEventTrigger, mapBosses: ResolvedMap['layout']['bosses']): GameEvent | null {
  switch (d.type) {
    case "BUMPER_HIT":
      return { type: "BUMPER_HIT", bumperIndex: 0, scoreIncrement: SCORE_BUMPER };
    case "SLINGSHOT_HIT":
      return { type: "SLINGSHOT_HIT", side: "left", scoreIncrement: SCORE_SLINGSHOT };
    case "RAMP_HIT":
      return { type: "RAMP_HIT", scoreIncrement: SCORE_RAMP };
    case "DROP_TARGET_COMPLETE":
      return { type: "DROP_TARGET_COMPLETE", side: "left", scoreIncrement: SCORE_DROP_COMPLETE };
    case "BOSS_REVEAL": {
      const bossId = d.bossId ?? mapBosses[0]?.id ?? "";
      return {
        type: "BOSS_REVEAL",
        bossId,
        scoreIncrement: getBossById(mapBosses, bossId)?.reveal.scoreIncrement ?? 150,
      };
    }
    case "BOSS_TARGET_HIT": {
      const bossId = d.bossId ?? mapBosses[0]?.id ?? "";
      return {
        type: "BOSS_TARGET_HIT",
        bossId,
        hitCount: d.hitCount ?? 1,
        scoreIncrement: getBossById(mapBosses, bossId)?.scoreTargetHit ?? 250,
      };
    }
    case "PORTAL_ENTER":
      return { type: "PORTAL_ENTER", scoreIncrement: PORTAL_ENTER_SCORE };
    case "ASSIST":
      return { type: "ASSIST", assistId: "assist", scoreIncrement: ASSIST_SCORE };
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
import { playfieldToScreenPercentForMode } from "@/utils/playfieldScreen";
import {
  notifyBootPhase,
  onPlayfieldReady,
  playMapCinematicSound,
  warmMapSounds,
  resetPinballAudioForNewGame,
  unlockPinballAudio,
} from "@/audio/pinballAudio";
import GameOverlay, { type PlayfieldBootPhase } from "./GameOverlay";
import CinematicOverlay from "./CinematicOverlay";
import BallDebugOverlay from "./BallDebugOverlay";
import DebugPanel from "./DebugPanel";


type AlternateWorldPersistence = "until_game_over" | "until_drain";
const ALTERNATE_WORLD_PERSISTENCE: AlternateWorldPersistence = "until_game_over";

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

const PLAYFIELD_VIEW_MODE = parsePlayfieldViewMode(process.env.NEXT_PUBLIC_PLAYFIELD_VIEW_MODE);
const IS_PORTRAIT_FILL = PLAYFIELD_VIEW_MODE === 'portrait-fill';

type PinballPlayfieldProps = {
  /** HUD + cadre portrait pour écran de flipper physique (`/pinball?cabinet`) */
  cabinetMode?: boolean;
  /** Id de la map à charger. Si absent → NEXT_PUBLIC_MAP_ID ou DEFAULT_MAP_ID. */
  mapId?: string;
};

// Garde NO SIGNAL : map introuvable → écran de veille plein écran (pas de
// crash). Wrapper sans hook → l'Inner (tous les hooks) n'est monté que si la
// map existe.
export default function PinballPlayfield(props: PinballPlayfieldProps) {
  const resolvedMap = props.mapId ? getMapPackage(props.mapId) : DEFAULT_RESOLVED_MAP;
  if (!resolvedMap) return <NoSignal reason={`MAP "${props.mapId ?? MAP_ID}" INTROUVABLE`} />;
  return <PinballPlayfieldInner {...props} resolvedMap={resolvedMap} />;
}

function PinballPlayfieldInner({ cabinetMode = false, resolvedMap }: PinballPlayfieldProps & { resolvedMap: ResolvedMap }) {
  // Boss, clips et sons dérivés de la map sélectionnée (prop — change au remount).
  const mapBosses = resolvedMap.layout.bosses ?? [];
  const mapClips = resolvedMap.manifest.clips;
  const mapSoundUrls: string[] = [
    ...mapBosses.map((b) => b.revealSoundUrl).filter((u): u is string => !!u),
    ...Object.values(resolvedMap.manifest.sounds ?? {}).map((s) => s.url),
  ];
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
  // Outro game-over : URL de claim (arrive async via game:registered) + score
  // figé affiché dans l'overlay. Le QR est rendu client-side (StyledQrCode).
  const [gameOverClaimUrl, setGameOverClaimUrl] = useState<string | null>(null);
  const [gameOverCode, setGameOverCode] = useState<string | null>(null);
  const [finalScore, setFinalScore] = useState(0);
  const physicsReadyRef = useRef(false);
  const sessionStartedRef = useRef(false);
  /** Appelé depuis le game loop quand la session démarre (affiche la balle). */
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

  const bootPhase: PlayfieldBootPhase = !physicsReady
    ? "loading"
    : !sessionStarted
      ? "attract"
      : "in_game";

  useEffect(() => {
    notifyBootPhase(bootPhase);
  }, [bootPhase]);

  const dmd = useDmdOrchestrator(mapClips, (d) => {
    setGameOverClaimUrl(d.claimUrl);
    setGameOverCode(d.code);
  });

  // Directeur de cinématiques (stable). Ref → accessible depuis les
  // callbacks render-scope (onLifeLost) et la boucle animate (useEffect).
  const cinematicsRef = useRef<CinematicDirector | null>(null);
  if (!cinematicsRef.current) cinematicsRef.current = new CinematicDirector();
  const cinematics = cinematicsRef.current;

  // Map résolue (garantie non-null par le garde NO SIGNAL du wrapper).
  const mapPackageRef = useRef<ResolvedMap>(resolvedMap);
  // Ref vers le module (accessible depuis les callbacks render-scope, ex. reset).
  const mapModuleRef = useRef<MapModule | null>(null);
  // emit (défini dans l'effet) exposé aux callbacks useGameState render-scope.
  const emitRef = useRef<GameEventListener | null>(null);
  const mapLayout = mapPackageRef.current.layout;
  const mapManifest = mapPackageRef.current.manifest;
  // manifest.glb est déjà une URL publique absolue (/maps/<id>/…).
  const playfieldUrl = mapManifest.glb;

  const playCinematic = useCallback(
    (
      clip: CinematicClip,
      opts?: { once?: boolean; value?: number; onEnd?: () => void },
    ): boolean => {
      const freezeMs = clipFreezeMs(mapManifest.clips, clip);
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
      const label = eventLabel(event, mapBosses);
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
      setFinalScore(finalScore); // le QR arrive ensuite via le callback (async)
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
      setGameOverClaimUrl(null); // évite un QR périmé qui flashe sur la partie suivante
      setGameOverCode(null);
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
    onAtmosphereChange: (alternateWorldActive) => {
      dmd.setAtmosphere(alternateWorldActive);
      atmosphereAlternateRef.current = alternateWorldActive;
    },
    onBossArmed: (bossId) => emitRef.current?.({ type: "BOSS_ARMED", bossId }),
    // le bonus map (lettres + complete + fever) géré par le module de map.
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
  }, {
    portalAnchor: mapLayout.sensors.portal,
    bumperAnchors: mapLayout.bumpers,
    atmosphereHintMs: mapLayout.atmosphere.hintMs,
    bosses: mapBosses,
  });

  // Patches de mapState poussés par le module de map (ctx.setMapState). Fusionnés
  // dans chaque snapshot. les compteurs map restent fournis par useGameState pour
  // l'instant (migreront dans le module en phase 4.3d).
  const mapStateExtraRef = useRef<Record<string, number | boolean>>({});

  // Construction unique du mapState injecté dans chaque snapshot DMD/score.
  // les compteurs map viennent du module de map (mapStateExtraRef) ;
  // fever reste piloté par useGameState (mécanisme multiplicateur).
  const buildMapState = (fever: boolean = isFeverActive()) => ({
    ...mapStateExtraRef.current,
    fever,
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

  const { callbacksRef: physicalInputsRef, simulateButton, isConnectedRef } = usePhysicalInputs();

  useEffect(() => {
    let cancelled = false;
    const mountEl = mountRef.current;
    if (!mountEl) return;

    // ── Config par-map — doit précéder tout setup physique / caméra ─────────
    configureSurfaceCoefficients(resolvedMap.layout.geometry.coefficients);
    configureBallRadius(mapManifest.ballRadius ?? DEFAULT_BALL_RADIUS);

    // ── Three.js setup ───────────────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#000000");
    const loader = createGltfLoader();

    const { clientWidth, clientHeight } = mountEl;
    const viewportAspect = clientWidth / Math.max(clientHeight, 1);
    const camera: PlayfieldCamera = new THREE.PerspectiveCamera(
      50,
      viewportAspect,
      0.001,
      100,
    );
    const cameraTarget = new THREE.Vector3();
    let playfieldCamFit: {
      fit: PlayfieldCamFit;
      camera: PlayfieldCamera;
      cameraTarget: THREE.Vector3;
      distance: number;
    } | null = null;
    const camCorners: THREE.Vector3[] = [];
    let orbitControls: OrbitControls | null = null;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    // Expose + tonemapping depuis la config de la map (pas de valeur globale).
    const rendering = mapManifest.rendering;
    configureGltfRenderer(renderer, rendering);

    // Environment map — uniquement pour les maps qui en ont besoin (rendering.useEnvironment).
    // ST original : pas d'envmap → matériaux sans reflets ambiants (état git d'origine).
    // Zelda : envmap active → or et gemmes très réfléchissants (effet Vectary).
    if (rendering?.useEnvironment) {
      const pmrem = new THREE.PMREMGenerator(renderer);
      pmrem.compileEquirectangularShader();
      scene.environment = pmrem.fromScene(new RoomEnvironment(), getEnvironmentBlur(rendering)).texture;
      pmrem.dispose();
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(clientWidth, clientHeight);
    renderer.shadowMap.enabled = false;
    mountEl.appendChild(renderer.domElement);

    // ─── Lumières — lues depuis manifest.rendering ─────────────────────────
    // Chaque map contrôle entièrement son setup d'éclairage. Pas de valeur
    // partagée ici : ST (froide/cinéma) et Zelda (chaude/overhead) divergent.
    const rl = rendering?.lights;
    const ambientLight = new THREE.AmbientLight(
      rl?.ambient.color    ?? 0xffffff,
      rl?.ambient.intensity ?? 0.35,
    );
    scene.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight(
      rl?.hemi.sky       ?? 0xfff8e8,
      rl?.hemi.ground    ?? 0x111108,
      rl?.hemi.intensity ?? 0.2,
    );
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(
      rl?.dir.color    ?? 0xffffff,
      rl?.dir.intensity ?? 2.5,
    );
    dirLight.position.set(rl?.dir.x ?? 0, rl?.dir.y ?? 0.48, rl?.dir.z ?? 0.88);
    dirLight.castShadow = false;
    scene.add(dirLight);

    const fillLight = new THREE.DirectionalLight(
      rl?.fill.color    ?? 0xffeedd,
      rl?.fill.intensity ?? 0.15,
    );
    fillLight.position.set(rl?.fill.x ?? -0.5, rl?.fill.y ?? 1, rl?.fill.z ?? -1);
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

    let cameraDirector: PlayfieldCameraDirector | null = null;

    const captureDirectorBase = (fit: PlayfieldCamFit, distance: number) => {
      if (!cameraDirector) return;
      if (cameraDirector.isActive()) cameraDirector.restore();
      cameraDirector.captureBase({
        camera,
        target: cameraTarget,
        dirToCamera: fit.dirToCamera,
        cameraUp: fit.cameraUp,
        distance,
        aspect: mountEl.clientWidth / Math.max(mountEl.clientHeight, 1),
      });
    };

    const syncPlayfieldCamera = (root: THREE.Object3D) => {
      const aspect = mountEl.clientWidth / Math.max(mountEl.clientHeight, 1);
      const { fit, distance, frameBox } = refitPlayfieldCamera(
        camera,
        root,
        PLAYFIELD_VIEW_MODE,
        cameraTarget,
        camCorners,
        cameraDebugTuningRef.current,
        aspect,
      );
      playfieldCamFit = { fit, camera, cameraTarget, distance };
      orbitControls?.target.copy(cameraTarget);
      captureDirectorBase(fit, distance);
      return frameBox;
    };
    refitCameraRef.current = syncPlayfieldCamera;

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
    let bossIntroHolding = false;
    const bossIntroBallPos = { x: 0, y: 0, z: 0 };


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
        if (cancelled) return; // StrictMode : démontage du 1er mount en vol
        const playfieldRoot = gltf.scene;
        playfieldRootRef = playfieldRoot;
        playfieldRootHandleRef.current = playfieldRoot;
        collectDisposables(playfieldRoot);
        modelRoot.add(playfieldRoot);
        removePinballmapUnusedMeshes(playfieldRoot);
        hidePinballmapDecorNodes(playfieldRoot);
        prepareGltfMaterialsForDisplay(playfieldRoot, rendering);

        // garlands + bumperVisuals créés par le module de map (cluster visuals),
        // récupérés après mapModule.setup (plus bas, après le monde physique).
        // nestMarker + reveals boss + bossReveals : créés/possédés
        // par le module de map (récupérés via le bridge, preload fait là-haut).
        ballTrail = new BallTrail();
        ballTrail.mount(scene);

        // ── Ball mesh ────────────────────────────────────────────────────────
        const ballGeo = new THREE.SphereGeometry(getBallRadius(), 24, 24);
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
          leftFlipperPivot = attachFlipperAtHinge(leftFlipper, "left", mapLayout.flipperPivots, pinballmap);
          leftFlipperObj = leftFlipper;
          leftFlashMats = collectFlashMats(leftFlipper);
        }
        if (rightFlipper && (rightFlipper as THREE.Mesh).isMesh) {
          rightFlipperPivot = attachFlipperAtHinge(rightFlipper, "right", mapLayout.flipperPivots, pinballmap);
          rightFlipperObj = rightFlipper;
          rightFlashMats = collectFlashMats(rightFlipper);
        }

        // Zones de garantie de lancement dérivées des bbox mesh (pose de repos).
        if (leftFlipperObj && rightFlipperObj) {
          flipperZones = computeFlipperZones(leftFlipperObj, rightFlipperObj, getBallRadius());
        }

        // ── Physics ──────────────────────────────────────────────────────────
        physicsWorld = await PhysicsWorld.create();
        if (cancelled) return; // bail avant colliders/bille — World nettoyé au cleanup
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
            enterAlternateWorld: () => collisionProcessor?.onAlternateWorldEntered(scoreRef.current),
            playSound: (id) => {
              const s = mapManifest.sounds?.[id];
              if (s) playMapCinematicSound(s.url, s.volume);
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
              alternateWorldActive: collisionProcessor?.isAlternateWorldActive() ?? false,
              normalWorldScoreBaseline: collisionProcessor?.getNormalWorldScoreBaseline() ?? 0,
              alternateWorldScoreBaseline: collisionProcessor?.getAlternateWorldScoreBaseline() ?? 0,
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
              atmosphereAlternateRef.current = active;
              // nestMarker géré par le module (réconciliation).
            },
            emitGameEvent: (e) => emit(e),
          };
          mapModule.setup(mapCtx);
        }
        // Préchargement asynchrone du module (ex. reveals boss) — bloque le
        // chargement comme avant.
        await mapModule?.preload?.();
        if (cancelled) return; // bail avant la création de la bille/colliders

        shooterLaneGate = new ShooterLaneGate();
        shooterLaneGate.bind(world, mapLayout.shooterLane);
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
        cameraDirector = new PlayfieldCameraDirector();
        cameraDirector.setViewMode(PLAYFIELD_VIEW_MODE);
        cameraDirector.setBosses(mapBosses);
        const camFrameBox = syncPlayfieldCamera(playfieldRoot);
        if (camera instanceof THREE.PerspectiveCamera) {
          const msz = camFrameBox.getSize(new THREE.Vector3());
          camera.near = Math.max(0.001, Math.min(msz.length() * 0.004, 0.25));
          camera.far = Math.max(80, msz.length() * 120);
          camera.updateProjectionMatrix();
        }
        const restoreBossCamera = () => {
          cameraDirector?.restore();
        };

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
        const releaseAlternateWorld = () => {
          restoreBossCamera();
          mapModule?.releaseWorld?.();
          collisionProcessor?.resetAlternateWorldSession();
          clearAlternateWorldSession();
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
          if (event.type === "DRAIN" || event.type === "BOTTOM_OUT") {
            restoreBossCamera();
          }
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
          else if (event.type === "BOSS_TARGET_HIT") {
            // Juice générique : tout hit de cible boss secoue l'écran.
            screenShake.add(0.5);
          }

          // BOSS_LOCKED_HIT (flash nid + « ENCORE X PTS ») : géré par le module.

          if (event.type === "BOSS_REVEAL") {
            cameraDirector?.play(event.bossId);
          }
          if (event.type === "BOSS_TARGET_HIT") {
            const boss = getBossById(mapBosses, event.bossId);
            if (boss && event.hitCount >= boss.targetHits) {
              cameraDirector?.playVictory(event.bossId);
            }
          }
          if (event.type === "RETURN_PORTAL_TRANSITION_END" || event.type === "WORLD_CYCLE_COMPLETE") {
            restoreBossCamera();
          }

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
              ALTERNATE_WORLD_PERSISTENCE === "until_drain" ||
              gameStateRef.current === "game_over"
            ) {
              releaseAlternateWorld();
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
            // Meshes GLB conventionnés en target_<id> (ex. target_left_1) ;
            // l'id de drop est drop_<id> → on retrouve le mesh visuel.
            const meshName = event.targetId.replace('drop_', 'target_');
            const mesh = playfieldRootRef?.getObjectByName(meshName);
            if (mesh) mesh.visible = false;
          }
          if (event.type === 'DROP_TARGET_COMPLETE' || event.type === 'DROP_TARGET_RESET') {
            for (const dt of mapLayout.dropTargets) {
              const mesh = playfieldRootRef?.getObjectByName(dt.id.replace('drop_', 'target_'));
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
        // haut via le bridge). Ses resets / setAlternateWorldActive / aimant
        // restent pilotés ici (flow transition + cycle de monde).

        // upsideDownAtmosphere créé/possédé par le module de map (récupéré
        // plus haut via le bridge). On garde ici le binding boss + les resets.
        // Le binding atmosphère du boss fait par le module (setup).

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

        // le reveal boss setEmit fait par le module (ctx.emitGameEvent).

        // ── Input handling ────────────────────────────────────────────────────
        console.log("[PinballPlayfield] KEYBOARD_MODE =", KEYBOARD_MODE);

        // Le callback métier (vrai effet sur le game loop). Source de vérité
        // unique : appelé soit par les events réseau `input:button`, soit
        // localement en mode `direct` via dispatchButton. Le mode
        // `simulate-esp32` n'appelle PAS ce callback directement — il émet sur
        // le réseau et c'est le broadcast server qui rappelle ce même
        // callback via socket.on('input:button').
        // Cœur métier : ferme sur les `let` leftTarget/rightTarget (~L600), donc
        // doit vivre dans cette closure (non hoistable). Reçoit l'ACTION jeu
        // (résolue depuis le bouton physique via BUTTON_ACTION), pas l'id brut.
        const applyAction = (action: GameAction, btnAction: ButtonAction) => {
          if (!sessionStartedRef.current) {
            if (
              btnAction === "DOWN"
              && physicsReadyRef.current
              && (action === "PLUNGE" || action === "START")
            ) {
              beginSessionRef.current();
              if (action === "PLUNGE" && gameStateRef.current === "idle") {
                plunger.startCharge(performance.now());
                isChargingPlunger = true;
                chargeStartTime = performance.now();
              }
            }
            return;
          }
          switch (action) {
            case "FLIP_LEFT":
              leftTarget = btnAction === "DOWN" ? 1 : 0;
              break;
            case "FLIP_RIGHT":
              rightTarget = btnAction === "DOWN" ? 1 : 0;
              break;
            case "PLUNGE": {
              if (btnAction === "DOWN") {
                debugLog(
                  `[Plunger] DOWN — gameState=${gameStateRef.current} physicsReady=${physicsReady} charging=${isChargingPlunger}`,
                );
                if (gameStateRef.current === "game_over") {
                  resetGame();
                  restoreBossCamera();
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
              break;
            }
            case "START":
              if (btnAction === "DOWN" && gameStateRef.current === "game_over") {
                resetGame();
                restoreBossCamera();
                collisionProcessor?.resetAllBossFights();
                collisionProcessor?.resetScoreBaselines();
                mapModule?.resetWorld?.();
                if (ballMesh) ballMesh.visible = true;
              }
              break;
          }
        };

        physicalInputsRef.current = {
          onButton: (data) => {
            const action = BUTTON_ACTION[data.id];
            if (!action) return; // bouton physique non mappé → ignoré
            applyAction(action, data.action);
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
            const ev = toGameEvent(d, mapBosses);
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

        // Clavier dev : dérive les ids physiques depuis l'action (DRY, survit à
        // un futur remap GPIO). Pas de littéral 'WHITE_LEFT' codé en dur ici.
        const idForAction = (a: GameAction): ButtonId =>
          CABINET_BUTTONS.find((b) => b.action === a)!.id;
        const KEY_LEFT = idForAction("FLIP_LEFT"); // WHITE_LEFT
        const KEY_RIGHT = idForAction("FLIP_RIGHT"); // WHITE_RIGHT
        const KEY_PLUNGE = idForAction("PLUNGE"); // PLUNGER

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
          if (e.key === "ArrowLeft" || e.key === "q" || e.key === "Q") dispatchButton(KEY_LEFT, "DOWN");
          if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") dispatchButton(KEY_RIGHT, "DOWN");
          if (e.key === " ") dispatchButton(KEY_PLUNGE, "DOWN");
        };

        const onKeyUp = (e: KeyboardEvent) => {
          if (["ArrowLeft", "ArrowRight", " "].includes(e.key)) e.preventDefault();
          if (e.key === "ArrowLeft" || e.key === "q" || e.key === "Q") dispatchButton(KEY_LEFT, "UP");
          if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") dispatchButton(KEY_RIGHT, "UP");
          if (e.key === " ") dispatchButton(KEY_PLUNGE, "UP");
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
        warmMapSounds(mapSoundUrls);
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
      // monde alternatif : update(dt) géré par mapModule.update.

      // Hint tardif du nid : géré par le module de map (mapModule.update).

      cinematics.update(time);
      mapModule?.update(dt);
      const bossIntroActive = mapModule?.isIntroHolding?.() ?? false;
      const cameraCinematicActive = cameraDirector?.isActive() ?? false;
      const freezeFrame =
        (mapModule?.shouldFreezePhysics?.() ?? false) || cinematics.shouldFreeze();

      if (bossIntroActive && !bossIntroHolding && ballPhysicsInst) {
        const p = ballPhysicsInst.body.translation();
        bossIntroBallPos.x = p.x;
        bossIntroBallPos.y = p.y;
        bossIntroBallPos.z = p.z;
        bossIntroHolding = true;
        leftTarget = 0;
        rightTarget = 0;
        ballPhysicsInst.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        ballPhysicsInst.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      }
      if (!bossIntroActive) {
        bossIntroHolding = false;
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
        world.update(
          dt,
          () => {
            collisionProcessor?.process(world.eventQueue, gameStateRef.current);
          },
          () => {
            collisionProcessor?.flushPendingPhysics();
          },
        );
      }

      if (
        !freezeFrame
        && ballPhysicsInst
        && gameStateRef.current === 'playing'
        && flipperZones
      ) {
        const pos = ballPhysicsInst.body.translation();
        const bx = pos.x;
        const bz = pos.z;
        const { left: lz, right: rz } = flipperZones;
        const angVelL = (leftSwing - prevLeftSwing) / dt;
        const angVelR = (rightSwing - prevRightSwing) / dt;
        const inLeft = bz > lz.zMin && bz < lz.zMax && bx > lz.xMin && bx < lz.xMax;
        const inRight = bz > rz.zMin && bz < rz.zMax && bx > rz.xMin && bx < rz.xMax;
        if (inLeft && angVelL > FLIPPER_MIN_LAUNCH_ANGVEL) {
          const vel = ballPhysicsInst.body.linvel();
          if (vel.z > FLIPPER_MIN_LAUNCH_VZ) {
            ballPhysicsInst.body.setLinvel({ x: vel.x, y: vel.y, z: FLIPPER_MIN_LAUNCH_VZ }, true);
            leftFlash = FLASH_DURATION;
          }
        }
        if (inRight && angVelR > FLIPPER_MIN_LAUNCH_ANGVEL) {
          const vel = ballPhysicsInst.body.linvel();
          if (vel.z > FLIPPER_MIN_LAUNCH_VZ) {
            ballPhysicsInst.body.setLinvel({ x: vel.x, y: vel.y, z: FLIPPER_MIN_LAUNCH_VZ }, true);
            rightFlash = FLASH_DURATION;
          }
        }
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
        if (bossIntroActive && gameStateRef.current === "playing") {
          ballPhysicsInst.body.setTranslation(
            { x: bossIntroBallPos.x, y: bossIntroBallPos.y, z: bossIntroBallPos.z },
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
        // la zone de sortie (Z <= mapLayout.shooterLane.leftWallTopZ) pour partir
        // naturellement dans le terrain.
        if (gameStateRef.current === "playing" && !ballMoveMode && !shooterLaneGate?.isClosed()) {
          const lp = ballPhysicsInst.body.translation();
          const inLaneStraight =
            lp.z > mapLayout.shooterLane.leftWallTopZ && lp.x > mapLayout.shooterLane.lockX;
          if (inLaneStraight) {
            ballPhysicsInst.body.setTranslation(
              { x: mapLayout.spawns.ball.x, y: lp.y, z: lp.z },
              true,
            );
            const lv = ballPhysicsInst.body.linvel();
            ballPhysicsInst.body.setLinvel({ x: 0, y: lv.y, z: lv.z }, true);
            const av = ballPhysicsInst.body.angvel();
            ballPhysicsInst.body.setAngvel({ x: av.x, y: 0, z: 0 }, true);
          } else if (lp.x < mapLayout.shooterLane.exitX) {
            shooterLaneGate?.close();
          }
        }

        // ── Surface snap : recolle la balle au sol incliné (logique en
        // game-engine, cf. computeSurfaceSnap). On lit pos/vel et on applique.
        if (gameStateRef.current === "playing" && !ballMoveMode) {
          const snap = computeSurfaceSnap(
            ballPhysicsInst.body.translation(),
            ballPhysicsInst.body.linvel(),
            mapLayout.shooterLane,
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
      cameraDirector?.update(dt);
      if (orbitControls && !freezeFrame && !cameraCinematicActive) orbitControls.update();

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
          { alternateWorld: atmosphereAlternateRef.current, fever: feverNow },
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
      if (w < 1 || h < 1) return;
      if (camera instanceof THREE.PerspectiveCamera) {
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      }
      if (playfieldRootRef) {
        syncPlayfieldCamera(playfieldRootRef);
      } else if (playfieldCamFit) {
        camera.up.copy(playfieldCameraUpForMode(PLAYFIELD_VIEW_MODE));
        camera.lookAt(cameraTarget);
      }
      renderer.setSize(w, h);
    };
    const resizeObserver = new ResizeObserver(() => handleResize());
    resizeObserver.observe(mountEl);
    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", handleResize);
    requestAnimationFrame(handleResize);

    // ── Cleanup ───────────────────────────────────────────────────────────────
    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
      mapModule?.dispose();
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", handleResize);
      resizeObserver.disconnect();
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
      cameraDirector?.dispose();
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
