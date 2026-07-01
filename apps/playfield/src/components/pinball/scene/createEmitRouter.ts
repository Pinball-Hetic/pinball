import type * as THREE from "three";
import {
  getBossById,
  type BossDefinition,
  type BallDiagnostics,
  type BottomOutBall,
  type CollisionEventProcessor,
  type GameEvent,
  type GameEventListener,
  type MapLayout,
  type MapModule,
  type ScreenShake,
  type ShooterLaneGate,
} from "@pinball/game-engine";
import type { GameState } from "@/hooks/useGameState";
import type { PlayfieldCameraRig } from "./PlayfieldCameraRig";
import type { DmdOrchestrator } from "@/hooks/useDmdOrchestrator";

type AlternateWorldPersistence = "until_game_over" | "until_drain";

export interface EmitRouterDeps {
  /** Emit de base (buildEmit) — scoring/vies/reset react-scope. */
  baseEmit: GameEventListener;
  /** Module de la map (optionnel selon la map). */
  mapModule: MapModule | null;
  /** Accès paresseux au processor (assigné après le factory). */
  getCollisionProcessor: () => CollisionEventProcessor | null;
  cameraRig: PlayfieldCameraRig;
  dmd: DmdOrchestrator;
  screenShake: ScreenShake;
  diag: BallDiagnostics;
  /** Accès paresseux au verrou couloir (assigné après le factory). */
  getShooterLaneGate: () => ShooterLaneGate | null;
  /** Accès paresseux à la racine playfield (assignée au chargement GLB). */
  getPlayfieldRoot: () => THREE.Object3D | null;
  mapLayout: MapLayout;
  mapBosses: BossDefinition[];
  /** Accès paresseux au use-case bottom-out (assigné après le factory). */
  getBottomOutBallUC: () => BottomOutBall | null;
  /** Libère le monde alternatif (react-scope : restoreBossCamera + clear session). */
  releaseAlternateWorld: () => void;
  livesRef: { current: number };
  gameStateRef: { current: GameState };
  scoreRef: { current: number };
  ALTERNATE_WORLD_PERSISTENCE: AlternateWorldPersistence;
}

/**
 * Routeur d'events du game loop (le « god-router »). Extrait verbatim du
 * `useEffect` de PinballPlayfield : ferme sur ses collaborateurs via l'objet
 * `deps` (getters paresseux pour les `let` assignés plus tard dans l'effet).
 *
 * Non pure : mute des meshes THREE (drop targets), pilote Rapier via le
 * processor, la caméra cinématique et le DMD. Vit dans la glue apps/playfield,
 * pas dans game-engine.
 */
export function createEmitRouter(deps: EmitRouterDeps): GameEventListener {
  const {
    baseEmit,
    mapModule,
    getCollisionProcessor,
    cameraRig,
    dmd,
    screenShake,
    diag,
    getShooterLaneGate,
    getPlayfieldRoot,
    mapLayout,
    mapBosses,
    getBottomOutBallUC,
    releaseAlternateWorld,
    livesRef,
    gameStateRef,
    scoreRef,
    ALTERNATE_WORLD_PERSISTENCE,
  } = deps;

  const restoreBossCamera = () => {
    cameraRig.restoreBoss();
  };

  /**
   * Sink d'events injecté dans le CollisionEventProcessor et le game loop.
   *
   * Ordre GARANTI de fan-out par event (contrat — voir aussi le JSDoc du
   * paramètre `emit` de CollisionEventProcessor) :
   *
   *   1. mapModule.onPreDrain(livesPré-décrément) — DRAIN/BOTTOM_OUT uniquement.
   *   2. baseEmit (useGameState) — scoring, décrément de vie, reset.
   *   3. mapModule.onGameEvent — visuels, bascule de monde, reveals de boss.
   *
   * L'invariant porteur est le split 1 avant 2 : `onPreDrain` s'exécute AVANT
   * que `baseEmit` ne lise/décrémente les vies, afin qu'une map puisse
   * accorder une vie de sauvetage sur la dernière bille (elle voit le compte
   * pré-décrément). Ne pas déplacer ces trois appels les uns par rapport aux
   * autres. Les effets react-scope suivants (screen shake, caméra, DMD,
   * cleanup) observent l'état post-scoring et sont hors-contrat entre eux.
   */
  const emit: GameEventListener = (event: GameEvent) => {
    const collisionProcessor = getCollisionProcessor();

    // ── Phase 1 : pré-drain (sauvetage dernière vie) ─────────────────────
    // La map peut accorder une vie AVANT le décrément (handleDrain) pour
    // éviter le game over. On lui passe le compte de vies pré-décrément
    // (livesRef n'est pas encore modifié par baseEmit).
    if (event.type === "DRAIN" || event.type === "BOTTOM_OUT") {
      mapModule?.onPreDrain?.(livesRef.current);
    }

    // ── Phase 2 : baseEmit (scoring / vies / reset, react-scope) ─────────
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

    // ── Phase 3 : mapModule.onGameEvent (observe l'état post-scoring) ────
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
      cameraRig.director.play(event.bossId);
    }
    if (event.type === "BOSS_TARGET_HIT") {
      const boss = getBossById(mapBosses, event.bossId);
      if (boss && event.hitCount >= boss.targetHits) {
        cameraRig.director.playVictory(event.bossId);
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
      getBottomOutBallUC()?.resetLatch();
    }
    if (event.type === "DRAIN" || event.type === "BOTTOM_OUT") {
      getShooterLaneGate()?.open();
    }
    if (event.type === 'DROP_TARGET_HIT') {
      // Meshes GLB conventionnés en target_<id> (ex. target_left_1) ;
      // l'id de drop est drop_<id> → on retrouve le mesh visuel.
      const meshName = event.targetId.replace('drop_', 'target_');
      const mesh = getPlayfieldRoot()?.getObjectByName(meshName);
      if (mesh) mesh.visible = false;
    }
    if (event.type === 'DROP_TARGET_COMPLETE' || event.type === 'DROP_TARGET_RESET') {
      for (const dt of mapLayout.dropTargets) {
        const mesh = getPlayfieldRoot()?.getObjectByName(dt.id.replace('drop_', 'target_'));
        if (mesh) mesh.visible = true;
      }
    }

    // État des marqueurs de nid : recalculé par le module de map.
  };

  return emit;
}
