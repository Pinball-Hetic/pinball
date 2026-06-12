import { useState, useRef, useCallback, useEffect } from "react";
import {
  INITIAL_LIVES,
  bossThresholdMet,
  type BossId,
  UPSIDE_DOWN_HINT_MS,
} from "@pinball/game-engine";
import { BOSS_IDS, getBossDefinition } from "@/map/activeMapBosses";
import type { GameEvent, GameEventListener } from "@pinball/game-engine";
import type { GameStats } from "@pinball/shared-types";
import { handlePinballSoundEvent, playGameOverSound } from "../audio/pinballAudio";
import { playfieldToScreenPercent, jitterScreenPoint } from "../utils/playfieldScreen";

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
  onAtmosphereChange?: (upsideDownActive: boolean) => void;
  onMilestone?: (threshold: number) => void;
  onBossArmed?: (bossId: BossId) => void; // palier franchi → le nid s'éveille (1×/partie)
  onHeticLetter?: (letterIndex: number) => void; // 1-4
  onHeticComplete?: () => void;
  onFeverEnd?: () => void;
}

const COMBO_DECAY_MS = 2000;
const MULTIPLIER_THRESHOLDS = [5, 10, 20, 40] as const;

const MILESTONES = [5_000, 15_000, 30_000];
const MILESTONE_REPEAT_EVERY = 25_000; // au-delà de 50k

// Plus haut seuil de {5k,15k,30k,50k,75k,100k,…} franchi entre prev et next.
// Marque TOUS les seuils franchis dans `passed` (sinon les seuils intermédiaires
// non retournés re-déclencheraient au prochain event) et renvoie le plus haut.
function nextMilestone(prev: number, next: number, passed: Set<number>): number | null {
  let crossed: number | null = null;
  const mark = (m: number) => {
    if (m > prev && m <= next && !passed.has(m)) {
      passed.add(m);
      if (crossed === null || m > crossed) crossed = m;
    }
  };
  for (const m of MILESTONES) mark(m);
  // Répétition tous les 25k au-delà de 50k.
  for (let m = 50_000; m <= next; m += MILESTONE_REPEAT_EVERY) mark(m);
  return crossed;
}

function computeMultiplier(combo: number): number {
  if (combo < MULTIPLIER_THRESHOLDS[0]) return 1;
  if (combo < MULTIPLIER_THRESHOLDS[1]) return 2;
  if (combo < MULTIPLIER_THRESHOLDS[2]) return 3;
  if (combo < MULTIPLIER_THRESHOLDS[3]) return 4;
  return 5;
}

function generatePlayerName(): string {
  const n = Math.floor(Math.random() * 10000).toString().padStart(4, "0");
  return `PLAYER${n}`;
}

const initialBossHudEntry = (): BossHudEntry => ({
  active: false,
  hits: 0,
  victory: false,
  assistFlash: false,
});

const initialBossHud = (): BossHudState =>
  Object.fromEntries(BOSS_IDS.map((id) => [id, initialBossHudEntry()])) as BossHudState;

export interface GameStateOptions {
  /** Ancre écran des pop de score portail (depuis layout.sensors.portal). */
  portalAnchor?: { x: number; z: number };
  /** Ancres écran des pop de score bumper (depuis layout.bumpers). */
  bumperAnchors?: { x: number; z: number }[];
}

export function useGameState(callbacks?: ScoringCallbacks, opts?: GameStateOptions) {
  const portalAnchor = opts?.portalAnchor ?? { x: 0, z: 0 };
  const bumperAnchors = opts?.bumperAnchors ?? [];
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
  const [bossHud, setBossHud] = useState<BossHudState>(initialBossHud);
  const [scorePops, setScorePops] = useState<ScorePop[]>([]);
  const [upsideDownActive, setUpsideDownActive] = useState(false);
  const [upsideDownHint, setUpsideDownHint] = useState(false);
  const [fever, setFever] = useState(false);

  const milestonesPassedRef = useRef<Set<number>>(new Set());
  const upsideDownActiveRef = useRef(false);
  const normalWorldBaselineRef = useRef(0);
  const upsideDownBaselineRef = useRef(0);
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
  const elevenTimerRef = useRef<number | null>(null);
  const scorePopIdRef = useRef(0);
  const scorePopTimersRef = useRef<Map<number, number>>(new Map());
  const upsideDownHintTimerRef = useRef<number | null>(null);

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

  const clearUpsideDownHint = useCallback(() => {
    if (upsideDownHintTimerRef.current !== null) {
      window.clearTimeout(upsideDownHintTimerRef.current);
      upsideDownHintTimerRef.current = null;
    }
    setUpsideDownHint(false);
  }, []);

  const clearBossHud = useCallback((id: BossId) => {
    const timer = victoryTimersRef.current[id];
    if (timer !== undefined) {
      window.clearTimeout(timer);
      delete victoryTimersRef.current[id];
    }
    if (id === "demogorgon" && elevenTimerRef.current !== null) {
      window.clearTimeout(elevenTimerRef.current);
      elevenTimerRef.current = null;
    }
    setBossHud((prev) => ({ ...prev, [id]: initialBossHudEntry() }));
  }, []);

  const clearAllBossHud = useCallback(() => {
    for (const id of BOSS_IDS) {
      clearBossHud(id);
    }
  }, [clearBossHud]);

  const clearUpsideDownSession = useCallback(() => {
    clearUpsideDownHint();
    clearBossHud("vecna");
    callbacks?.onAtmosphereChange?.(false);
    setUpsideDownActive(false);
    upsideDownActiveRef.current = false;
    upsideDownBaselineRef.current = 0;
    // Le nid de vecna pourra se ré-annoncer à la prochaine entrée Upside Down.
    bossArmedFiredRef.current.delete("vecna");
  }, [clearUpsideDownHint, clearBossHud, callbacks]);

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
      playGameOverSound();
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
    upsideDownActiveRef.current = false;
    normalWorldBaselineRef.current = 0;
    upsideDownBaselineRef.current = 0;
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
    clearUpsideDownSession();
    updateGameState("idle");
    callbacks?.onIdleReset?.();
  };

  const buildEmit = (hideBall: () => void): GameEventListener =>
    (event) => {
      handlePinballSoundEvent(event);

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
        // Le set garde l'unicité ; le gate Upside Down/baseline est porté par
        // bossThresholdMet (généricité demogorgon + vecna).
        for (const id of BOSS_IDS) {
          if (bossArmedFiredRef.current.has(id)) continue;
          const def = getBossDefinition(id);
          const met = bossThresholdMet(def, {
            totalScore: scoreRef.current,
            upsideDownActive: upsideDownActiveRef.current,
            normalWorldScoreBaseline: normalWorldBaselineRef.current,
            upsideDownScoreBaseline: upsideDownBaselineRef.current,
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
        const def = getBossDefinition(event.bossId);
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
        setBossHud((prev) => ({
          ...prev,
          demogorgon: {
            ...prev.demogorgon,
            active: true,
            assistFlash: true,
          },
        }));
        if (elevenTimerRef.current !== null) {
          window.clearTimeout(elevenTimerRef.current);
        }
        elevenTimerRef.current = window.setTimeout(() => {
          elevenTimerRef.current = null;
          setBossHud((prev) => ({
            ...prev,
            demogorgon: { ...prev.demogorgon, assistFlash: false },
          }));
        }, 900);
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
      // DROP_TARGET_COMPLETE (compteur hetic + cinématiques) : géré par le
      // module de map.
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
        setUpsideDownActive(true);
        upsideDownActiveRef.current = true;
        upsideDownBaselineRef.current = scoreRef.current;
        setUpsideDownHint(true);
        if (upsideDownHintTimerRef.current !== null) {
          window.clearTimeout(upsideDownHintTimerRef.current);
        }
        upsideDownHintTimerRef.current = window.setTimeout(() => {
          upsideDownHintTimerRef.current = null;
          setUpsideDownHint(false);
        }, UPSIDE_DOWN_HINT_MS);
        callbacks?.onAtmosphereChange?.(true);
      }
      if (event.type === "RETURN_PORTAL_TRANSITION_END") {
        setUpsideDownActive(false);
        setUpsideDownHint(false);
        if (upsideDownHintTimerRef.current !== null) {
          window.clearTimeout(upsideDownHintTimerRef.current);
          upsideDownHintTimerRef.current = null;
        }
        callbacks?.onAtmosphereChange?.(false);
      }
      if (event.type === "WORLD_CYCLE_COMPLETE") {
        clearAllBossHud();
        normalWorldBaselineRef.current = scoreRef.current;
        upsideDownActiveRef.current = false;
        upsideDownBaselineRef.current = 0;
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
    upsideDownActive,
    upsideDownHint,
    fever,
    isFeverActive,
    startFever,
    clearUpsideDownSession,
    resetGame,
    buildEmit,
  };
}
