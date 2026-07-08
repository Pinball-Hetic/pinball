import { useEffect } from "react";
import type { GameState } from "@/hooks/useGameState";

export const OUTRO_IDLE_TIMEOUT_MS = 20_000;

export function useOutroAutoExit(
  gameState: GameState,
  restart: () => void = () => window.location.reload(),
): void {
  useEffect(() => {
    if (gameState !== "game_over") return;
    const handle = window.setTimeout(restart, OUTRO_IDLE_TIMEOUT_MS);
    return () => window.clearTimeout(handle);
    // restart deliberately excluded from deps: the default arg is a fresh
    // closure each render and would reset the timer, so it never fires.
  }, [gameState]);
}
