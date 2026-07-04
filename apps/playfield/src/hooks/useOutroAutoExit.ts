import { useEffect } from "react";
import type { GameState } from "@/hooks/useGameState";

// Idle delay on the outro/QR screen before restarting the workflow from the
// start (reload → map selector). Frees the cabinet for the next player.
export const OUTRO_IDLE_TIMEOUT_MS = 20_000;

// Outro/QR auto-exit: after 20s in game_over, full reload → pinball.tsx boot
// → MapSelectorScreen (or forced-map attract in mono-map). A React effect on
// `gameState` is robust: unlike a timer in the animate closure, it is NOT
// cancelled by network button echoes (simulate-esp32) arriving after
// game_over; the cleanup only runs on a real exit from game_over.
export function useOutroAutoExit(
  gameState: GameState,
  restart: () => void = () => window.location.reload(),
): void {
  useEffect(() => {
    if (gameState !== "game_over") return;
    const handle = window.setTimeout(restart, OUTRO_IDLE_TIMEOUT_MS);
    return () => window.clearTimeout(handle);
    // restart: stable identity expected (default = reload) — not a dep.
  }, [gameState]);
}
