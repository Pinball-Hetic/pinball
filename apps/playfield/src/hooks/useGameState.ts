import { useState, useRef, useCallback } from "react";
import { INITIAL_LIVES, DEMOGORGON_TARGET_HITS } from "@pinball/game-engine";
import type { GameEventListener } from "@pinball/game-engine";
import { handlePinballSoundEvent } from "../audio/PinballSounds";

export type GameState = "idle" | "playing" | "game_over";

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

  const scoreRef = useRef(0);
  const livesRef = useRef(INITIAL_LIVES);
  const gameStateRef = useRef<GameState>("idle");
  const victoryTimerRef = useRef<number | null>(null);
  const elevenTimerRef = useRef<number | null>(null);

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
    updateGameState("idle");
  };

  const buildEmit = (hideBall: () => void): GameEventListener =>
    (event) => {
      handlePinballSoundEvent(event);

      if ("scoreIncrement" in event && event.scoreIncrement) {
        scoreRef.current += event.scoreIncrement;
        setScore(scoreRef.current);
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
      if (event.type === "DEMOGORGON_TARGET_HIT") {
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
      if (event.type === "DRAIN") {
        clearDemogorgonHud();
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
    resetGame,
    buildEmit,
  };
}
