import { useState, useRef } from "react";
import { INITIAL_LIVES } from "@pinball/game-engine";
import type { GameEventListener } from "@pinball/game-engine";

export type GameState = "idle" | "playing" | "game_over";

export function useGameState() {
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(INITIAL_LIVES);
  const [gameState, setGameState] = useState<GameState>("idle");

  const scoreRef = useRef(0);
  const livesRef = useRef(INITIAL_LIVES);
  const gameStateRef = useRef<GameState>("idle");

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
    updateGameState("idle");
  };

  const buildEmit = (hideBall: () => void): GameEventListener =>
    (event) => {
      if ("scoreIncrement" in event && event.scoreIncrement) {
        scoreRef.current += event.scoreIncrement;
        setScore(scoreRef.current);
      }
      if (event.type === "DRAIN") {
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
    resetGame,
    buildEmit,
  };
}
