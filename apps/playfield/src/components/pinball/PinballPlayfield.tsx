import { useEffect, useRef, useState, useCallback, type CSSProperties } from "react";
import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
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
  INITIAL_LIVES,
  plungerChargeProgress,
  type FlipperZones,
  type FlipperPivot,
  CollisionEventProcessor,
  StuckBallDetector,
  BallDiagnostics,
  type BallDiagnosticsSnapshot,
  type BallResetReason,
  removePinballmapUnusedMeshes,
  hidePinballmapDecorNodes,
  prepareGltfMaterialsForDisplay,
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
  type FlashMat,
} from "@pinball/game-engine";
import { getMapPackage, type ResolvedMap } from "@pinball/maps";
import { NoSignal } from "@pinball/ui";
import { type MapModule, type GameEventListener } from "@pinball/game-engine";
import type {
  ButtonAction,
  ButtonId,
  CinematicClip,
} from "@pinball/shared-types";
import { BUTTON_ACTION, clipFreezeMs, DEFAULT_MAP_ID } from "@pinball/shared-types";

const MAP_ID = process.env.NEXT_PUBLIC_MAP_ID ?? DEFAULT_MAP_ID;
// Résolu au niveau module (MAP_ID = constante build-time) — utilisé comme
// fallback si aucun mapId n'est fourni en prop.
const DEFAULT_RESOLVED_MAP = getMapPackage(MAP_ID);

import { createPlayfieldScene } from "./scene/createPlayfieldScene";
import { BallDragController } from "./scene/BallDragController";
import { PlayfieldCameraRig } from "./scene/PlayfieldCameraRig";
import { createEmitRouter } from "./scene/createEmitRouter";
import { toGameEvent } from "./toGameEvent";
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
  setMapAudioUrls,
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
import { buildFlipperBodies } from "./physics/buildFlipperBodies";
import { buildPlungerBody } from "./physics/buildPlungerBody";
import { createKeyboardRouter } from "./createKeyboardRouter";
import { DebugMeshManager } from "./debug/DebugMeshManager";
import { createMapContext } from "./createMapContext";
import { computePlungerVisual } from "./hotLoop/computePlungerVisual";
import { computeFrameDt, computeTrailIntensity } from "./hotLoop/frameMath";
import { buildPlayfieldColliders } from "./physics/buildPlayfieldColliders";
import { setupFlippers } from "./physics/setupFlippers";
import { stepBallSync } from "./hotLoop/stepBallSync";
import {
  createFlipperFrameState,
  stepFlipperKinematics,
  stepFlipperAssist,
} from "./hotLoop/flipperFrame";
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

// Délai d'inactivité sur l'écran outro/QR avant de recommencer le workflow
// depuis le début (reload → sélecteur de map). Libère la borne au joueur suivant.
const OUTRO_IDLE_TIMEOUT_MS = 20_000;

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
  // Brancher les URLs audio de la map (effet de bord → useEffect, pas dans le
  // corps de rendu qui rejoue à chaque render).
  useEffect(() => {
    setMapAudioUrls(
      resolvedMap.manifest.ambientMusic,
      resolvedMap.manifest.gameOverSound,
      resolvedMap.manifest.alternateWorldMusicUrl,
      resolvedMap.manifest.alternateWorldMusicVolume,
    );
  }, [
    resolvedMap.manifest.ambientMusic,
    resolvedMap.manifest.gameOverSound,
    resolvedMap.manifest.alternateWorldMusicUrl,
    resolvedMap.manifest.alternateWorldMusicVolume,
  ]);
  const mapSoundUrls: string[] = [
    ...mapBosses.map((b) => b.revealSoundUrl).filter((u): u is string => !!u),
    ...mapBosses.map((b) => b.latePhaseSoundUrl).filter((u): u is string => !!u),
    ...mapBosses.map((b) => b.victoryMusicUrl).filter((u): u is string => !!u),
    ...(resolvedMap.manifest.alternateWorldMusicUrl ? [resolvedMap.manifest.alternateWorldMusicUrl] : []),
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

  const bootPhase: PlayfieldBootPhase = computeBootPhase({
    physicsReady,
    sessionStarted,
  });

  useEffect(() => {
    notifyBootPhase(bootPhase);
  }, [bootPhase]);

  // Auto-spawn : la map étant déjà sélectionnée en amont, dès que la physique
  // est prête on démarre la session sans attendre START/ESPACE. La balle
  // apparaît alors dans le couloir plongeur, prête à être lancée.
  useEffect(() => {
    if (shouldAutoBeginSession({ physicsReady, sessionStarted })) {
      beginSessionRef.current();
    }
  }, [physicsReady, sessionStarted]);

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
    buildEmit,
    addLife,
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
    onLifeGained: (lives) => {
      // Vie gagnée (rescue/bonus map) : rafraîchir immédiatement le DMD avec le
      // vrai compteur — sans ça le DMD reste sur l'ancien nombre jusqu'au
      // prochain event de score (désync, surtout au-delà de 3 vies).
      const snap = {
        player: playerRef.current,
        score: scoreRef.current,
        combo: comboRef.current,
        multiplier: multiplierRef.current,
        lives,
        mapState: buildMapState(),
      };
      dmd.emitScoreSnapshot(snap);
      dmd.pushScore(snap);
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
      dmd.emitGameOver(playerRef.current, finalScore, mapManifest.id, { ...stats, counters });
      // Clip poussé à CHAQUE game over ; DMD/backglass décident de
      // l'ampleur (le backglass connaît le rang → fanfare ou recap).
      dmd.pushCinematic('hall_of_fame');
      // L'auto-exit de l'outro/QR (20s → reload → sélecteur) est géré par un
      // effet React sur gameState (cf. plus bas), pas ici.
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
    // milestones + boss-armed (cinématiques/celebrate/shake/hint) gérés par le
    // module de map (events MILESTONE / BOSS_ARMED).
    onMilestone: (threshold) => emitRef.current?.({ type: "MILESTONE", threshold }),
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

  // Outro/QR auto-exit : après 20s en game_over, on recommence le workflow
  // depuis le début (reload → sélecteur de map, ou attract de la map forcée en
  // mono-map). Effet React sur `gameState` → robuste : contrairement à
  // l'ancien timer dans la closure animate, il n'est PAS annulé par les echos
  // de boutons réseau (simulate-esp32) qui arrivaient après le game_over. Le
  // cleanup ne s'exécute qu'à la sortie réelle de game_over (donc jamais tant
  // qu'on est sur l'outro).
  useEffect(() => {
    if (gameState !== "game_over") return;
    const handle = window.setTimeout(
      () => window.location.reload(),
      OUTRO_IDLE_TIMEOUT_MS,
    );
    return () => window.clearTimeout(handle);
  }, [gameState]);

  const { callbacksRef: physicalInputsRef, simulateButton, isConnectedRef } = usePhysicalInputs();

  useEffect(() => {
    let cancelled = false;
    const mountEl = mountRef.current;
    if (!mountEl) return;

    // ── Config par-map — doit précéder tout setup physique / caméra ─────────
    configureSurfaceCoefficients(resolvedMap.layout.geometry.coefficients);
    configureBallRadius(mapManifest.ballRadius ?? DEFAULT_BALL_RADIUS);

    // ── Three.js setup ───────────────────────────────────────────────────────
    // Bootstrap scène/renderer/env/lumières/caméra délégué au factory (SRP).
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
    let leftFlipperPivot: FlipperPivot | null = null;
    let rightFlipperPivot: FlipperPivot | null = null;
    let leftFlipperObj: THREE.Object3D | null = null;
    let rightFlipperObj: THREE.Object3D | null = null;
    let flipperZones: FlipperZones | null = null;
    // Accumulateurs de frame flippers (swing lissé + hit-flash) — un seul objet,
    // muté par les steps du hot loop. Cf. hotLoop/flipperFrame.ts.
    const flipperFrame = createFlipperFrameState();
    // État d'entrée mutable partagé (flippers + plunger) — possédé ici, muté par
    // applyAction ET lu par la boucle animate. Cf. createApplyAction.ts.
    const inputState: InputState = createInputState();

    // ── Juice : screen shake + hit-flash flippers ───────────────────────────
    const screenShake = screenShakeRef.current!;
    let leftFlashMats: FlashMat[] = [];
    let rightFlashMats: FlashMat[] = [];

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

    // Feedback playfield pendant le gel des cinématiques (ex. gain de lettre
    // HETIC) : un flash strobé rend le freeze lisible comme intentionnel et
    // pointe vers le DMD, plutôt qu'une scène morte figée. Flash-only (pas de
    // voile noir) — le DMD porte le contenu. Tunable via FREEZE_FEEDBACK.
    const freezeFeedbackStrobe = new PlayfieldCinematicStrobe();
    const FREEZE_FEEDBACK: CinematicFreezeFeedbackConfig = {
      hz: 9,
      maxMix: 0.85,
      activeFraction: 0.75,
      fadeOutFraction: 0.4,
    };

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
    let physicsReady = false;
    // Handlers clavier stockés en scope-effet (pas de monkeypatch sur
    // physicsWorld) → cleanup sûr même si init() est annulé avant le câblage.
    let keydownHandler: ((e: KeyboardEvent) => void) | null = null;
    let keyupHandler: ((e: KeyboardEvent) => void) | null = null;
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
    // Façade des meshes debug (état collidersOn + toggle H) — assignée après la
    // construction des hulls/pivots flippers (buildFlipperBodies).
    let debugMeshManager: DebugMeshManager | null = null;

    const stuckDetector = new StuckBallDetector();
    const bottomOutDetector = new DetectBottomOut();
    const diag = new BallDiagnostics(mapLayout);
    let lastDebugPush = 0;

    // Point de déclenchement UNIQUE du bottom-out : quelle que soit la source de
    // détection (capteur Rapier, balle perdue, coincée, ou zone géométrique sous
    // les flippers), c'est ici qu'on décide → un seul execute (idempotent via le
    // latch de BottomOutBall) + journalisation de la cause. Supprime les trois
    // sites de déclenchement dupliqués dans la boucle animate.
    const triggerBottomOut = (reason: BallResetReason) => {
      bottomOutBallUC?.execute();
      diag.noteReset(reason);
    };

    // ── Debug : déplacer la bille à la souris (toggle `M`) ───────────────────
    // Drag la bille n'importe où sur le tapis pour tester les coincements.
    // Pendant le drag : orbit désactivé, vitesse forcée à 0 (suit le curseur),
    // locks du couloir bypassés. Au relâché : la physique reprend.
    const ballDragController = new BallDragController({
      renderer,
      camera,
      getPlayfieldRoot: () => playfieldRootRef,
      getBall: () => ballPhysicsInst,
      getBallMesh: () => ballMesh,
      getOrbitControls: () => cameraRig.orbit,
    });
    ballDragController.attach();

    // Logs de diagnostic gérés par le toggle HUD `[J]` → silence total en prod.
    const debugLog = (...args: unknown[]) => {
      if (!debugVisibleRef.current) return;
      // eslint-disable-next-line no-console
      console.info(...args);
    };

    // ── Plunger kinematic ────────────────────────────────────────────────────
    let plungerBody: RAPIER.RigidBody | null = null;
    let plungerMesh: THREE.Mesh | null = null;
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

        // Feedback de gel : flash au centre du playfield. Monté sur modelRoot
        // (repère scène) pour ne dépendre d'aucun mesh de map.
        const { leftX, rightX, topZ, bottomZ } = mapLayout.geometry.bounds;
        freezeFeedbackStrobe.mount(modelRoot, {
          flashColor: 0xffffff,
          flashIntensity: 2.6,
          flashDistance: 0.9,
          flashPosition: new THREE.Vector3(
            (leftX + rightX) / 2,
            1.15,
            (topZ + bottomZ) / 2,
          ),
        });

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

        // Résolution + attache des flippers extraite (physics/setupFlippers.ts).
        const flippers = setupFlippers(playfieldRoot, mapLayout.flipperPivots, getBallRadius());
        leftFlipperPivot = flippers.leftPivot;
        rightFlipperPivot = flippers.rightPivot;
        leftFlipperObj = flippers.leftObj;
        rightFlipperObj = flippers.rightObj;
        leftFlashMats = flippers.leftFlashMats;
        rightFlashMats = flippers.rightFlashMats;
        if (flippers.zones) flipperZones = flippers.zones;

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
          // MapContext extrait (createMapContext.ts). Les forward-refs
          // (ball/ballMesh/collisionProcessor/emit, assignés plus bas) sont
          // passés en getters live-bound.
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
        // Préchargement asynchrone du module (ex. reveals boss) — bloque le
        // chargement comme avant.
        await mapModule?.preload?.();
        if (cancelled) return; // bail avant la création de la bille/colliders

        shooterLaneGate = new ShooterLaneGate();
        shooterLaneGate.bind(world, mapLayout.shooterLane);
        shooterLaneGateRef.current = shooterLaneGate;

        modelRoot.updateMatrixWorld(true);

        // GLB role-driven : trimeshes (murs/couloir) + drop targets dérivés +
        // colliders analytiques (sol/bumpers/sensors). Extrait dans
        // physics/buildPlayfieldColliders.ts (side-effects world + colliderMap).
        buildPlayfieldColliders({
          world,
          root: playfieldRoot,
          manifest: mapManifest,
          layout: mapLayout,
          colliderMap,
        });

        // upsideDownTransition créé/possédé par le module (récupéré via le
        // bridge). L'orchestration (isActive/start, cycle de monde) reste ici
        // car elle pilote la bille (spawns).

        ballPhysicsInst = new BallPhysics(world, mapLayout);

        // ── Flipper : corps cinématiques + hulls debug + pivot markers ────────
        // Construction extraite (physics/buildFlipperBodies.ts) — les refs
        // retournées sont assignées dans les vars de closure lues par animate.
        const flipperBodies = buildFlipperBodies({
          world,
          scene,
          leftFlipper: flippers.leftMesh as THREE.Mesh | null,
          rightFlipper: flippers.rightMesh as THREE.Mesh | null,
          leftPivot: leftFlipperPivot,
          rightPivot: rightFlipperPivot,
          disposableGeos,
          disposableMats,
        });
        leftFlipperBody  = flipperBodies.left.body;
        rightFlipperBody = flipperBodies.right.body;
        leftFlipperDebug  = flipperBodies.left.debugMesh;
        rightFlipperDebug = flipperBodies.right.debugMesh;
        leftFlipperBodyOffset.copy(flipperBodies.left.offset);
        rightFlipperBodyOffset.copy(flipperBodies.right.offset);
        leftPivotMarker  = flipperBodies.leftPivotMarker;
        rightPivotMarker = flipperBodies.rightPivotMarker;

        debugMeshManager = new DebugMeshManager(
          {
            colliders: rapierDebugLines,
            leftHull: leftFlipperDebug,
            rightHull: rightFlipperDebug,
            leftPivotMarker,
            rightPivotMarker,
          },
          () => ({ left: leftFlipperPivot, right: rightFlipperPivot }),
        );

        ballPhysicsInst.setSpawnPosition(mapLayout.spawns.ball.x, mapLayout.spawns.ball.y, mapLayout.spawns.ball.z);
        ballPhysicsInst.body.wakeUp();

        // ── Plunger visual + kinematic body ──────────────────────────────────
        // Setup extrait (physics/buildPlungerBody.ts). animate lit
        // mesh/body/restZ après assignation.
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

        // ── Caméra cabine fixe (non rotatable) — tapis jouable uniquement ───────
        modelRoot.updateMatrixWorld(true);
        cameraRig.director.setBosses(mapBosses);
        const camFrameBox = cameraRig.syncToRoot(playfieldRoot);
        cameraRig.applyNearFar(camFrameBox);
        const restoreBossCamera = () => {
          cameraRig.restoreBoss();
        };

        // ── OrbitControls — caméra libre ─────────────────────────────────────
        cameraRig.attachOrbit(renderer.domElement);

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
        // (fin de mapModule.onGameEvent, après chaque event). Le routage
        // (pre-drain, reveals/victory caméra, screen-shake, cinématiques
        // portail, drop-target mesh, release monde alternatif) est délégué au
        // factory createEmitRouter — collaborateurs `let` accédés en paresseux.
        emit = createEmitRouter({
          baseEmit,
          mapModule,
          getCollisionProcessor: () => collisionProcessor,
          cameraRig,
          dmd,
          screenShake,
          diag,
          getShooterLaneGate: () => shooterLaneGate,
          getPlayfieldRoot: () => playfieldRootRef,
          mapLayout,
          mapBosses,
          getBottomOutBallUC: () => bottomOutBallUC,
          getDrainBallUC: () => drainBallUC,
          releaseAlternateWorld,
          livesRef,
          gameStateRef,
          scoreRef,
          ALTERNATE_WORLD_PERSISTENCE,
        });
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
          inputState.isChargingPlunger = false;
          inputState.plungerState = "idle";
          setPlungerCharge(null);
          stuckDetector.reset();
          bottomOutBallUC?.resetLatch();
          if (ballMesh) ballMesh.visible = true;
          // Reset manuel (touche R / game-over-hide) : réarme le latch drain
          // pour rester répétable, puis force le drain.
          drainBallUC.resetLatch();
          drainBallUC.execute();
        };

        // le reveal boss setEmit fait par le module (ctx.emitGameEvent).

        // ── Input handling ────────────────────────────────────────────────────
        console.log("[PinballPlayfield] KEYBOARD_MODE =", KEYBOARD_MODE);

        // Sortie de l'écran outro/QR (game over) → recommencer le workflow
        // DEPUIS LE DÉBUT : reload complet → boot pinball.tsx → MapSelectorScreen
        // (multi-map) ou attract de la map forcée (mono-map Fliphetic via
        // NEXT_PUBLIC_MAP_ID), avec un état moteur/sockets/refs vierge. Même
        // chemin pour le replay manuel (START/PLUNGE) et l'auto-exit 20s (effet
        // React) — on ne rejoue jamais la même map en place.
        const restartWorkflow = () => window.location.reload();

        // Routeur d'actions de jeu → effets (flippers/plunger/reset). Source de
        // vérité unique, appelée par les events réseau `input:button` comme par
        // le clavier dev. Logique extraite + testée (createApplyAction.ts) ;
        // toute la collaboration passe par des getters/callbacks + l'objet
        // `inputState` partagé avec la boucle animate.
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

        // Clavier dev : mapping key→action + résolution de l'id physique
        // extraits + testés (keyboardMap.ts, idForAction fail-fast).
        // Routeur clavier dev extrait (createKeyboardRouter.ts) : jeu (via
        // keyboardMap) + toggles debug (H via DebugMeshManager, J/M/R).
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

      // visuals + garlands (incl. setFever via ctx.isFeverActive) + bosses +
      // monde alternatif : update(dt) géré par mapModule.update.

      // Hint tardif du nid : géré par le module de map (mapModule.update).

      cinematics.update(time);
      mapModule?.update(dt);
      const bossIntroActive = mapModule?.isIntroHolding?.() ?? false;
      const cameraCinematicActive = cameraRig.director.isActive();
      const freezeFrame =
        (mapModule?.shouldFreezePhysics?.() ?? false) || cinematics.shouldFreeze();

      // Feedback playfield pendant un gel de cinématique (flash-only strobé) :
      // rend le freeze lisible + pointe vers le DMD. Piloté par le temps écoulé
      // du director → 0 quand aucun clip n'est actif (mix retombe, flash retiré).
      const freezeFb = cinematicFreezeFeedback(
        cinematics.shouldFreeze() ? cinematics.activeElapsedMs(time) : -1,
        cinematics.activeDurationMs(),
        FREEZE_FEEDBACK,
      );
      freezeFeedbackStrobe.applyFlashOnly(freezeFb.on, freezeFb.mix);

      if (bossIntroActive && !bossIntroHolding && ballPhysicsInst) {
        const p = ballPhysicsInst.body.translation();
        bossIntroBallPos.x = p.x;
        bossIntroBallPos.y = p.y;
        bossIntroBallPos.z = p.z;
        bossIntroHolding = true;
        inputState.leftTarget = 0;
        inputState.rightTarget = 0;
        ballPhysicsInst.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        ballPhysicsInst.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      }
      if (!bossIntroActive) {
        bossIntroHolding = false;
      }

      if (!freezeFrame) {
        // ── Flipper cinématique : Three.js → Rapier (hotLoop/flipperFrame) ────
        stepFlipperKinematics(flipperFrame, {
          input: inputState,
          leftPivot: leftFlipperPivot,
          rightPivot: rightFlipperPivot,
          leftObj: leftFlipperObj,
          rightObj: rightFlipperObj,
          leftBody: leftFlipperBody,
          rightBody: rightFlipperBody,
          leftOffset: leftFlipperBodyOffset,
          rightOffset: rightFlipperBodyOffset,
          leftFlashMats,
          rightFlashMats,
          leftDebug: leftFlipperDebug,
          rightDebug: rightFlipperDebug,
        }, dt);
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
        // Assistance de lancement (hotLoop/flipperFrame).
        stepFlipperAssist(flipperFrame, ballPhysicsInst, flipperZones, dt);
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

      // Ball sync (orchestration extraite : hotLoop/stepBallSync.ts).
      if (ballMesh?.visible && ballPhysicsInst) {
        stepBallSync({
          ball: ballPhysicsInst,
          ballMesh,
          gameState: gameStateRef.current,
          freezeFrame,
          physicsReady,
          isMoveMode: ballDragController.isMoveMode,
          bossIntroActive,
          bossIntroBallPos,
          layout: mapLayout,
          shooterLaneGate,
          stuckDetector,
          bottomOutDetector,
          triggerBottomOut,
          dt,
        });
      }

      // Plunger animation + jauge UI
      if (inputState.isChargingPlunger) {
        const t = plungerChargeProgress(time, inputState.chargeStartTime);
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
        // FSM visuelle extraite (hotLoop/computePlungerVisual, pure + testée).
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

      // ── Rapier debug render (tous colliders) ─────────────────────────────
      if (debugMeshManager?.collidersOn && physicsWorld) {
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
        cameraRig.syncToRoot(playfieldRootRef);
      } else {
        cameraRig.applyViewUpFallback();
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
      ballDragController.dispose();
      cameraRig.dispose();
      if (keydownHandler) document.removeEventListener("keydown", keydownHandler);
      if (keyupHandler) document.removeEventListener("keyup", keyupHandler);
      if (mountEl.contains(renderer.domElement)) mountEl.removeChild(renderer.domElement);
      // bumperVisuals + garlands + bossReveals + nestMarker : dispose géré par
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
