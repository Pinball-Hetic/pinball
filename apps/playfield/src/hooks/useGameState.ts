import { useState, useRef, useCallback } from "react";
import {
  INITIAL_LIVES,
  DEMOGORGON_TARGET_HITS,
  BUMPER_POSITIONS,
  DEMOGORGON_TARGET,
} from "@pinball/game-engine";
import type { GameEventListener } from "@pinball/game-engine";
import { handlePinballSoundEvent } from "../audio/PinballSounds";
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

const initialDemogorgonHud = (): DemogorgonHud => ({
  active: false,
  hits: 0,
  victory: false,
  elevenFlash: false,
});

export function useGameState() {
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(INITIAL_LIVES);
  const [gameState, setGameState] = useState<GameState>("idle");
  const [demogorgonHud, setDemogorgonHud] = useState<DemogorgonHud>(initialDemogorgonHud);
  const [scorePops, setScorePops] = useState<ScorePop[]>([]);

  const scoreRef = useRef(0);
  const livesRef = useRef(INITIAL_LIVES);
  const gameStateRef = useRef<GameState>("idle");
  const victoryTimerRef = useRef<number | null>(null);
  const elevenTimerRef = useRef<number | null>(null);
  const scorePopIdRef = useRef(0);
  const scorePopTimersRef = useRef<Map<number, number>>(new Map());

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

  const handleDrain = (hideBall: () => void) => {
    const newLives = livesRef.current - 1;
    livesRef.current = newLives;
    setLives(newLives);
    if (newLives <= 0) {
      hideBall();
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
    clearDemogorgonHud();
    clearScorePops();
    updateGameState("idle");
  };

  const buildEmit = (hideBall: () => void): GameEventListener =>
    (event) => {
      handlePinballSoundEvent(event);

      if ("scoreIncrement" in event && event.scoreIncrement) {
        scoreRef.current += event.scoreIncrement;
        setScore(scoreRef.current);
      }
      if (event.type === "BUMPER_HIT") {
        const bumper = BUMPER_POSITIONS[event.bumperIndex];
        if (bumper) {
          const point = jitterScreenPoint(
            playfieldToScreenPercent(bumper.x, bumper.z),
          );
          pushScorePop({
            amount: event.scoreIncrement,
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
          amount: event.scoreIncrement,
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
      if (event.type === "DRAIN") {
        clearDemogorgonHud();
        clearScorePops();
        handleDrain(hideBall);
      }
      if (event.type === "BALL_LAUNCHED") {
        updateGameState("playing");
      }
    };

  return {
    score,
    lives,
    gameState,
    gameStateRef,
    demogorgonHud,
    scorePops,
    resetGame,
    buildEmit,
  };
}
