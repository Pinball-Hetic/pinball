import { useState, useRef, useCallback, useEffect } from "react";
import {
  INITIAL_LIVES,
  DEMOGORGON_TARGET_HITS,
  VECNA_TARGET_HITS,
  BUMPER_POSITIONS,
  DEMOGORGON_TARGET,
  VECNA_TARGET,
  PORTAL_UPSIDE_DOWN,
  UPSIDE_DOWN_HINT_MS,
} from "@pinball/game-engine";
import type { GameEvent, GameEventListener } from "@pinball/game-engine";
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

export type DemogorgonHud = {
  active: boolean;
  hits: number;
  victory: boolean;
  elevenFlash: boolean;
};

export type VecnaHud = {
  active: boolean;
  hits: number;
  victory: boolean;
};

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
  onGameOver?: (finalScore: number) => void;
  onGameStart?: () => void;
  onIdleReset?: () => void;
  onAtmosphereChange?: (upsideDownActive: boolean) => void;
}

const COMBO_DECAY_MS = 2000;
const MULTIPLIER_THRESHOLDS = [5, 10, 20, 40] as const;

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

const initialDemogorgonHud = (): DemogorgonHud => ({
  active: false,
  hits: 0,
  victory: false,
  elevenFlash: false,
});

const initialVecnaHud = (): VecnaHud => ({
  active: false,
  hits: 0,
  victory: false,
});

export function useGameState(callbacks?: ScoringCallbacks) {
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(INITIAL_LIVES);
  const [gameState, setGameState] = useState<GameState>("idle");
  const [combo, setCombo] = useState(0);
  const [multiplier, setMultiplier] = useState(1);
  const [player, setPlayer] = useState<string>(() => generatePlayerName());
  const [demogorgonHud, setDemogorgonHud] = useState<DemogorgonHud>(initialDemogorgonHud);
  const [vecnaHud, setVecnaHud] = useState<VecnaHud>(initialVecnaHud);
  const [scorePops, setScorePops] = useState<ScorePop[]>([]);
  const [upsideDownActive, setUpsideDownActive] = useState(false);
  const [upsideDownHint, setUpsideDownHint] = useState(false);
  const [hetic, setHetic] = useState(0);

  const heticRef = useRef(0);
  const scoreRef = useRef(0);
  const livesRef = useRef(INITIAL_LIVES);
  const gameStateRef = useRef<GameState>("idle");
  const comboRef = useRef(0);
  const multiplierRef = useRef(1);
  const lastEventTimeRef = useRef(0);
  const playerRef = useRef(player);
  const victoryTimerRef = useRef<number | null>(null);
  const vecnaVictoryTimerRef = useRef<number | null>(null);
  const elevenTimerRef = useRef<number | null>(null);
  const scorePopIdRef = useRef(0);
  const scorePopTimersRef = useRef<Map<number, number>>(new Map());
  const upsideDownHintTimerRef = useRef<number | null>(null);

  // Sync ref to state when player change
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
    }, 250);
    return () => window.clearInterval(tick);
  }, []);

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

  const clearVecnaHud = useCallback(() => {
    if (vecnaVictoryTimerRef.current !== null) {
      window.clearTimeout(vecnaVictoryTimerRef.current);
      vecnaVictoryTimerRef.current = null;
    }
    setVecnaHud(initialVecnaHud());
  }, []);

  const clearUpsideDownSession = useCallback(() => {
    clearUpsideDownHint();
    clearVecnaHud();
    callbacks?.onAtmosphereChange?.(false);
    setUpsideDownActive(false);
  }, [clearUpsideDownHint, clearVecnaHud, callbacks]);

  const clearDemogorgonHud = useCallback(() => {
    if (victoryTimerRef.current !== null) {
      window.clearTimeout(victoryTimerRef.current);
      victoryTimerRef.current = null;
    }
    if (elevenTimerRef.current !== null) {
      window.clearTimeout(elevenTimerRef.current);
      elevenTimerRef.current = null;
    }
    setDemogorgonHud(initialDemogorgonHud());
  }, []);

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
      callbacks?.onGameOver?.(scoreRef.current);
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
    heticRef.current = 0;
    setHetic(0);
    lastEventTimeRef.current = 0;
    const newName = generatePlayerName();
    setPlayer(newName);
    playerRef.current = newName;
    clearDemogorgonHud();
    clearVecnaHud();
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
        const finalPoints = event.scoreIncrement * multiplierRef.current;
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
      }
      if (event.type === "BUMPER_HIT") {
        const bumper = BUMPER_POSITIONS[event.bumperIndex];
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
      if (event.type === "DEMOGORGON_TARGET_HIT") {
        const point = jitterScreenPoint(
          playfieldToScreenPercent(DEMOGORGON_TARGET.x, DEMOGORGON_TARGET.z),
          4,
        );
        pushScorePop({
          amount: event.scoreIncrement * multiplierRef.current,
          x: point.x,
          y: point.y,
          tone: "target",
        });
        const victory = event.hitCount >= DEMOGORGON_TARGET_HITS;
        setDemogorgonHud((prev) => ({
          ...prev,
          active: true,
          hits: event.hitCount,
          victory,
          elevenFlash: false,
        }));
        if (victory) {
          victoryTimerRef.current = window.setTimeout(() => {
            victoryTimerRef.current = null;
            setDemogorgonHud(initialDemogorgonHud());
          }, 1400);
        }
      }
      if (event.type === "DEMOGORGON_REVEAL") {
        if (victoryTimerRef.current !== null) {
          window.clearTimeout(victoryTimerRef.current);
          victoryTimerRef.current = null;
        }
        setDemogorgonHud({ active: true, hits: 0, victory: false, elevenFlash: false });
      }
      if (event.type === "VECNA_TARGET_HIT") {
        const point = jitterScreenPoint(
          playfieldToScreenPercent(VECNA_TARGET.x, VECNA_TARGET.z),
          4,
        );
        pushScorePop({
          amount: event.scoreIncrement * multiplierRef.current,
          x: point.x,
          y: point.y,
          tone: "target",
        });
        const victory = event.hitCount >= VECNA_TARGET_HITS;
        setVecnaHud((prev) => ({
          ...prev,
          active: true,
          hits: event.hitCount,
          victory,
        }));
        if (victory) {
          vecnaVictoryTimerRef.current = window.setTimeout(() => {
            vecnaVictoryTimerRef.current = null;
            setVecnaHud(initialVecnaHud());
          }, 1600);
        }
      }
      if (event.type === "VECNA_REVEAL") {
        if (vecnaVictoryTimerRef.current !== null) {
          window.clearTimeout(vecnaVictoryTimerRef.current);
          vecnaVictoryTimerRef.current = null;
        }
        setVecnaHud({ active: true, hits: 0, victory: false });
      }
      if (event.type === "ELEVEN_ASSIST") {
        setDemogorgonHud((prev) => ({
          ...prev,
          active: true,
          elevenFlash: true,
        }));
        if (elevenTimerRef.current !== null) {
          window.clearTimeout(elevenTimerRef.current);
        }
        elevenTimerRef.current = window.setTimeout(() => {
          elevenTimerRef.current = null;
          setDemogorgonHud((prev) => ({ ...prev, elevenFlash: false }));
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
          clearDemogorgonHud();
          clearVecnaHud();
        }
      }
      if (event.type === "DROP_TARGET_COMPLETE") {
        if (heticRef.current < 5) {
          heticRef.current += 1;
          setHetic(heticRef.current);
        }
      }
      if (event.type === "BALL_LAUNCHED") {
        if (gameStateRef.current === "idle") callbacks?.onGameStart?.();
        updateGameState("playing");
      }
      if (event.type === "PORTAL_ENTER") {
        const point = jitterScreenPoint(
          playfieldToScreenPercent(PORTAL_UPSIDE_DOWN.x, PORTAL_UPSIDE_DOWN.z),
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
    demogorgonHud,
    vecnaHud,
    scorePops,
    upsideDownActive,
    upsideDownHint,
    hetic,
    heticRef,
    clearUpsideDownSession,
    resetGame,
    buildEmit,
  };
}
