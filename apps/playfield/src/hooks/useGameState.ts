import { useState, useRef, useCallback, useEffect } from "react";
import {
  INITIAL_LIVES,
  bossThresholdMet,
  type BossId,
} from "@pinball/game-engine";
import { getBossById, type BossDefinition } from "@pinball/game-engine";
import type { GameEvent, GameEventListener } from "@pinball/game-engine";
import type { GameStats } from "@pinball/shared-types";
import {
  handlePinballSoundEvent,
  onMusicDrain,
  onMusicGameOver,
} from "../audio/pinballAudio";
import { playfieldToScreenPercent, jitterScreenPoint } from "../utils/playfieldScreen";
import {
  computeMultiplier,
  nextMilestone,
  generatePlayerName,
  COMBO_DECAY_MS,
} from "./gameStateUtils";

export type GameState = "idle" | "playing" | "game_over";

export type ScorePop = {
  id: number;
  amount: number;
  x: number;
  y: number;
  tone: "bumper" | "target";
};

export type BossHudEntry = {
  active: boolean;
  hits: number;
  victory: boolean;
  assistFlash: boolean;
};

export type BossHudState = Record<BossId, BossHudEntry>;

export interface ScoringCallbacks {
  onScoreEvent?: (info: {
    event: GameEvent;
    finalPoints: number;
    previousCombo: number;
    newCombo: number;
    previousMultiplier: number;
    newMultiplier: number;
  }) => void;
  onLifeLost?: (livesRemaining: number) => void;
  onGameOver?: (finalScore: number, stats: GameStats) => void;
  onGameStart?: () => void;
  onIdleReset?: () => void;
  onAtmosphereChange?: (alternateWorldActive: boolean) => void;
  onMilestone?: (threshold: number) => void;
  onBossArmed?: (bossId: BossId) => void; // palier franchi → le nid s'éveille (1×/partie)
  onFeverEnd?: () => void;
}


const initialBossHudEntry = (): BossHudEntry => ({
  active: false,
  hits: 0,
  victory: false,
  assistFlash: false,
});

const initialBossHud = (bosses: BossDefinition[]): BossHudState =>
  Object.fromEntries(bosses.map((b) => [b.id, initialBossHudEntry()])) as BossHudState;

export interface GameStateOptions {
  /** Ancre écran des pop de score portail (depuis layout.sensors.portal). */
  portalAnchor?: { x: number; z: number };
  /** Ancres écran des pop de score bumper (depuis layout.bumpers). */
  bumperAnchors?: { x: number; z: number }[];
  /** Délai avant le hint d'atmosphère (depuis layout.atmosphere.hintMs). */
  atmosphereHintMs?: number;
  /** Définitions de boss de la map active (layout.bosses). */
  bosses?: BossDefinition[];
}

export function useGameState(callbacks?: ScoringCallbacks, opts?: GameStateOptions) {
  const portalAnchor = opts?.portalAnchor ?? { x: 0, z: 0 };
  const bumperAnchors = opts?.bumperAnchors ?? [];
  const atmosphereHintMs = opts?.atmosphereHintMs ?? 45_000;
  const bosses = opts?.bosses ?? [];
  const bossIds = bosses.map((b) => b.id);
  // `callbacks` est un objet littéral recréé à chaque render → on le lit via
  // un ref pour ne PAS remettre l'interval 250ms (decay combo + expiration
  // fever) à zéro à chaque render (sinon il pourrait ne jamais se déclencher).
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(INITIAL_LIVES);
  const [gameState, setGameState] = useState<GameState>("idle");
  const [combo, setCombo] = useState(0);
  const [multiplier, setMultiplier] = useState(1);
  const [player, setPlayer] = useState<string>(() => generatePlayerName());
  const [bossHud, setBossHud] = useState<BossHudState>(() => initialBossHud(bosses));
  const [scorePops, setScorePops] = useState<ScorePop[]>([]);
  const [alternateWorldActive, setAlternateWorldActive] = useState(false);
  const [alternateWorldHint, setAlternateWorldHint] = useState(false);
  const [fever, setFever] = useState(false);

  const milestonesPassedRef = useRef<Set<number>>(new Set());
  const alternateWorldActiveRef = useRef(false);
  const normalWorldBaselineRef = useRef(0);
  const alternateWorldBaselineRef = useRef(0);
  const bossArmedFiredRef = useRef<Set<BossId>>(new Set());
  const feverUntilRef = useRef(0);
  const scoreRef = useRef(0);
  const livesRef = useRef(INITIAL_LIVES);
  const gameStateRef = useRef<GameState>("idle");
  const comboRef = useRef(0);
  const multiplierRef = useRef(1);
  const lastEventTimeRef = useRef(0);
  const playerRef = useRef(player);
  const victoryTimersRef = useRef<Partial<Record<BossId, number>>>({});
  // Timer du flash d'assist (générique : le boss propriétaire est déduit de
  // sa def via `assist`). Un seul assist actif à la fois.
  const assistTimerRef = useRef<number | null>(null);
  const scorePopIdRef = useRef(0);
  const scorePopTimersRef = useRef<Map<number, number>>(new Map());
  const alternateWorldHintTimerRef = useRef<number | null>(null);

  const maxComboRef = useRef(0);
  const maxMultiplierRef = useRef(1);
  const gameStartRef = useRef(0);

  useEffect(() => {
    playerRef.current = player;
  }, [player]);

  useEffect(() => {
    const tick = window.setInterval(() => {
      if (
        comboRef.current > 0 &&
        performance.now() - lastEventTimeRef.current > COMBO_DECAY_MS
      ) {
        comboRef.current = 0;
        multiplierRef.current = 1;
        setCombo(0);
        setMultiplier(1);
      }
      // Expiration du fever
      if (feverUntilRef.current && performance.now() > feverUntilRef.current) {
        feverUntilRef.current = 0;
        setFever(false);
        callbacksRef.current?.onFeverEnd?.();
      }
    }, 250);
    return () => window.clearInterval(tick);
  }, []);

  const isFeverActive = () => performance.now() < feverUntilRef.current;

  const startFever = (durationMs: number) => {
    feverUntilRef.current = performance.now() + durationMs;
    setFever(true);
  };

  const clearScorePops = useCallback(() => {
    for (const timer of scorePopTimersRef.current.values()) {
      window.clearTimeout(timer);
    }
    scorePopTimersRef.current.clear();
    setScorePops([]);
  }, []);

  const pushScorePop = useCallback((pop: Omit<ScorePop, "id">) => {
    const id = scorePopIdRef.current + 1;
    scorePopIdRef.current = id;
    setScorePops((prev) => [...prev, { ...pop, id }]);
    const timer = window.setTimeout(() => {
      scorePopTimersRef.current.delete(id);
      setScorePops((prev) => prev.filter((entry) => entry.id !== id));
    }, 900);
    scorePopTimersRef.current.set(id, timer);
  }, []);

  const clearAlternateWorldHint = useCallback(() => {
    if (alternateWorldHintTimerRef.current !== null) {
      window.clearTimeout(alternateWorldHintTimerRef.current);
      alternateWorldHintTimerRef.current = null;
    }
    setAlternateWorldHint(false);
  }, []);

  const clearBossHud = useCallback((id: BossId) => {
    const timer = victoryTimersRef.current[id];
    if (timer !== undefined) {
      window.clearTimeout(timer);
      delete victoryTimersRef.current[id];
    }
    // Annule le flash d'assist si CE boss en possède un (plus de nom en dur).
    const def = getBossById(bosses, id);
    if (def?.assist && assistTimerRef.current !== null) {
      window.clearTimeout(assistTimerRef.current);
      assistTimerRef.current = null;
    }
    setBossHud((prev) => ({ ...prev, [id]: initialBossHudEntry() }));
  }, [bosses]);

  const clearAllBossHud = useCallback(() => {
    for (const id of bossIds) {
      clearBossHud(id);
    }
  }, [clearBossHud]);

  const clearAlternateWorldSession = useCallback(() => {
    clearAlternateWorldHint();
    // Boss liés au monde alternatif (reveal gaté requiresAlternateWorld) : reset
    // HUD + ré-armement, sans nom en dur. Ils se ré-annoncent à la prochaine
    // entrée dans le monde alternatif.
    for (const def of bosses) {
      if (!def.reveal.requiresAlternateWorld) continue;
      clearBossHud(def.id);
      bossArmedFiredRef.current.delete(def.id);
    }
    callbacks?.onAtmosphereChange?.(false);
    setAlternateWorldActive(false);
    alternateWorldActiveRef.current = false;
    alternateWorldBaselineRef.current = 0;
  }, [clearAlternateWorldHint, clearBossHud, callbacks, bosses]);

  const updateGameState = (state: GameState) => {
    gameStateRef.current = state;
    setGameState(state);
  };

  const applyComboEvent = (now: number): { prevCombo: number; prevMult: number } => {
    const prevCombo = comboRef.current;
    const prevMult = multiplierRef.current;
    const isDecayed = prevCombo === 0 || now - lastEventTimeRef.current > COMBO_DECAY_MS;
    const nextCombo = isDecayed ? 1 : prevCombo + 1;
    const nextMult = computeMultiplier(nextCombo);
    comboRef.current = nextCombo;
    multiplierRef.current = nextMult;
    lastEventTimeRef.current = now;
    setCombo(nextCombo);
    if (nextMult !== prevMult) setMultiplier(nextMult);
    return { prevCombo, prevMult };
  };

  const handleDrain = (hideBall: () => void) => {
    const newLives = livesRef.current - 1;
    livesRef.current = newLives;
    setLives(newLives);
    if (newLives <= 0) {
      hideBall();
      onMusicGameOver();
      updateGameState("game_over");
      const stats: GameStats = {
        maxCombo: maxComboRef.current,
        maxMultiplier: maxMultiplierRef.current,
        // Counters remplis par PinballPlayfield depuis le mapState (alimenté par
        // le module de map). useGameState ne compte plus rien de ST.
        counters: {},
        durationS: gameStartRef.current
          ? Math.round((performance.now() - gameStartRef.current) / 1000)
          : 0,
      };
      callbacks?.onGameOver?.(scoreRef.current, stats);
    } else {
      onMusicDrain({ gameOver: false });
      updateGameState("idle");
      callbacks?.onLifeLost?.(newLives);
    }
  };

  const resetGame = () => {
    scoreRef.current = 0;
    setScore(0);
    livesRef.current = INITIAL_LIVES;
    setLives(INITIAL_LIVES);
    comboRef.current = 0;
    multiplierRef.current = 1;
    setCombo(0);
    setMultiplier(1);
    milestonesPassedRef.current.clear();
    bossArmedFiredRef.current.clear();
    alternateWorldActiveRef.current = false;
    normalWorldBaselineRef.current = 0;
    alternateWorldBaselineRef.current = 0;
    feverUntilRef.current = 0;
    setFever(false);
    lastEventTimeRef.current = 0;
    maxComboRef.current = 0;
    maxMultiplierRef.current = 1;
    gameStartRef.current = 0;
    const newName = generatePlayerName();
    setPlayer(newName);
    playerRef.current = newName;
    clearAllBossHud();
    clearScorePops();
    clearAlternateWorldSession();
    updateGameState("idle");
    callbacks?.onIdleReset?.();
  };

  const buildEmit = (hideBall: () => void): GameEventListener =>
    (event) => {
      handlePinballSoundEvent(event, bosses);

      const now = performance.now();

      if ("scoreIncrement" in event && event.scoreIncrement) {
        const comboChange = applyComboEvent(now);
        maxComboRef.current = Math.max(maxComboRef.current, comboRef.current);
        maxMultiplierRef.current = Math.max(
          maxMultiplierRef.current,
          multiplierRef.current,
        );
        // En fever le multiplier effectif est forcé à 5 (combo continue
        // de compter en arrière-plan).
        const mult = isFeverActive() ? 5 : multiplierRef.current;
        const finalPoints = event.scoreIncrement * mult;
        const prevScore = scoreRef.current;
        scoreRef.current += finalPoints;
        setScore(scoreRef.current);

        callbacks?.onScoreEvent?.({
          event,
          finalPoints,
          previousCombo: comboChange.prevCombo,
          newCombo: comboRef.current,
          previousMultiplier: comboChange.prevMult,
          newMultiplier: multiplierRef.current,
        });

        // Paliers de score (nextMilestone marque déjà tous les seuils franchis)
        const crossed = nextMilestone(prevScore, scoreRef.current, milestonesPassedRef.current);
        if (crossed) callbacks?.onMilestone?.(crossed);

        // Éveil du nid : palier de boss franchi → onBossArmed une fois par partie.
        // Le set garde l'unicité ; le gate monde alternatif/baseline est porté par
        // bossThresholdMet (générique pour tout boss, gate monde alternatif inclus).
        for (const id of bossIds) {
          if (bossArmedFiredRef.current.has(id)) continue;
          const def = getBossById(bosses, id); if (!def) continue;
          const met = bossThresholdMet(def, {
            totalScore: scoreRef.current,
            alternateWorldActive: alternateWorldActiveRef.current,
            normalWorldScoreBaseline: normalWorldBaselineRef.current,
            alternateWorldScoreBaseline: alternateWorldBaselineRef.current,
          });
          if (met) {
            bossArmedFiredRef.current.add(id);
            callbacks?.onBossArmed?.(id);
          }
        }
      }
      if (event.type === "BUMPER_HIT") {
        const bumper = bumperAnchors[event.bumperIndex];
        if (bumper) {
          const point = jitterScreenPoint(
            playfieldToScreenPercent(bumper.x, bumper.z),
          );
          pushScorePop({
            amount: event.scoreIncrement * multiplierRef.current,
            x: point.x,
            y: point.y,
            tone: "bumper",
          });
        }
      }
      if (event.type === "BOSS_TARGET_HIT") {
        const def = getBossById(bosses, event.bossId); if (!def) return;
        const point = jitterScreenPoint(
          playfieldToScreenPercent(def.target.x, def.target.z),
          4,
        );
        pushScorePop({
          amount: event.scoreIncrement * multiplierRef.current,
          x: point.x,
          y: point.y,
          tone: "target",
        });
        const victory = event.hitCount >= def.targetHits;
        // Compteur "boss vaincus" : tenu par le module de map (mapState).
        setBossHud((prev) => ({
          ...prev,
          [event.bossId]: {
            ...prev[event.bossId],
            active: true,
            hits: event.hitCount,
            victory,
            assistFlash: false,
          },
        }));
        if (victory) {
          const existing = victoryTimersRef.current[event.bossId];
          if (existing !== undefined) {
            window.clearTimeout(existing);
          }
          victoryTimersRef.current[event.bossId] = window.setTimeout(() => {
            delete victoryTimersRef.current[event.bossId];
            setBossHud((prev) => ({
              ...prev,
              [event.bossId]: initialBossHudEntry(),
            }));
          }, def.hud.victoryClearMs);
        }
      }
      if (event.type === "BOSS_REVEAL") {
        const existing = victoryTimersRef.current[event.bossId];
        if (existing !== undefined) {
          window.clearTimeout(existing);
          delete victoryTimersRef.current[event.bossId];
        }
        setBossHud((prev) => ({
          ...prev,
          [event.bossId]: {
            active: true,
            hits: 0,
            victory: false,
            assistFlash: false,
          },
        }));
      }
      if (event.type === "ASSIST") {
        // Boss propriétaire de l'assist déduit de sa def (assist.id), pas en dur.
        const assistBoss = bosses.find((b) => b.assist?.id === event.assistId);
        if (assistBoss) {
          const bossId = assistBoss.id;
          setBossHud((prev) => ({
            ...prev,
            [bossId]: { ...prev[bossId], active: true, assistFlash: true },
          }));
          if (assistTimerRef.current !== null) {
            window.clearTimeout(assistTimerRef.current);
          }
          assistTimerRef.current = window.setTimeout(() => {
            assistTimerRef.current = null;
            setBossHud((prev) => ({
              ...prev,
              [bossId]: { ...prev[bossId], assistFlash: false },
            }));
          }, 900);
        }
      }
      if (event.type === "DRAIN" || event.type === "BOTTOM_OUT") {
        comboRef.current = 0;
        multiplierRef.current = 1;
        setCombo(0);
        setMultiplier(1);
        clearScorePops();
        handleDrain(hideBall);
        if (livesRef.current <= 0) {
          clearAllBossHud();
        }
      }
      // DROP_TARGET_COMPLETE (compteur de collecte + cinématiques) : géré par
      // le module de map.
      if (event.type === "BALL_LAUNCHED") {
        if (gameStartRef.current === 0) gameStartRef.current = now;
        if (gameStateRef.current === "idle") callbacks?.onGameStart?.();
        updateGameState("playing");
      }
      if (event.type === "PORTAL_ENTER") {
        // Compteur "portals" : tenu par le module de map (mapState).
        const point = jitterScreenPoint(
          playfieldToScreenPercent(portalAnchor.x, portalAnchor.z),
          3,
        );
        pushScorePop({
          amount: event.scoreIncrement * multiplierRef.current,
          x: point.x,
          y: point.y,
          tone: "target",
        });
      }
      if (event.type === "RETURN_PORTAL_ENTER") {
        const point = jitterScreenPoint(
          playfieldToScreenPercent(portalAnchor.x, portalAnchor.z),
          3,
        );
        pushScorePop({
          amount: event.scoreIncrement * multiplierRef.current,
          x: point.x,
          y: point.y,
          tone: "target",
        });
      }
      if (event.type === "PORTAL_TRANSITION_END") {
        setAlternateWorldActive(true);
        alternateWorldActiveRef.current = true;
        alternateWorldBaselineRef.current = scoreRef.current;
        setAlternateWorldHint(true);
        if (alternateWorldHintTimerRef.current !== null) {
          window.clearTimeout(alternateWorldHintTimerRef.current);
        }
        alternateWorldHintTimerRef.current = window.setTimeout(() => {
          alternateWorldHintTimerRef.current = null;
          setAlternateWorldHint(false);
        }, atmosphereHintMs);
        callbacks?.onAtmosphereChange?.(true);
      }
      if (event.type === "RETURN_PORTAL_TRANSITION_END") {
        setAlternateWorldActive(false);
        setAlternateWorldHint(false);
        if (alternateWorldHintTimerRef.current !== null) {
          window.clearTimeout(alternateWorldHintTimerRef.current);
          alternateWorldHintTimerRef.current = null;
        }
        callbacks?.onAtmosphereChange?.(false);
      }
      if (event.type === "WORLD_CYCLE_COMPLETE") {
        clearAllBossHud();
        normalWorldBaselineRef.current = scoreRef.current;
        alternateWorldActiveRef.current = false;
        alternateWorldBaselineRef.current = 0;
        bossArmedFiredRef.current.clear();
      }
    };

  return {
    score,
    lives,
    gameState,
    gameStateRef,
    combo,
    multiplier,
    player,
    scoreRef,
    livesRef,
    comboRef,
    multiplierRef,
    playerRef,
    bossHud,
    scorePops,
    alternateWorldActive,
    alternateWorldHint,
    fever,
    isFeverActive,
    startFever,
    clearAlternateWorldSession,
    resetGame,
    buildEmit,
  };
}
