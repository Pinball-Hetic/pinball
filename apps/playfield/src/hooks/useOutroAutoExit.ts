import { useEffect } from "react";
import type { GameState } from "@/hooks/useGameState";

// Délai d'inactivité sur l'écran outro/QR avant de recommencer le workflow
// depuis le début (reload → sélecteur de map). Libère la borne au joueur suivant.
export const OUTRO_IDLE_TIMEOUT_MS = 20_000;

// Auto-exit de l'outro/QR : après 20s en game_over, reload complet → boot
// pinball.tsx → MapSelectorScreen (ou attract de la map forcée en mono-map).
// Effet React sur `gameState` → robuste : contrairement à un timer dans la
// closure animate, il n'est PAS annulé par les echos de boutons réseau
// (simulate-esp32) qui arrivent après le game_over ; le cleanup ne joue qu'à la
// sortie réelle de game_over.
export function useOutroAutoExit(
  gameState: GameState,
  restart: () => void = () => window.location.reload(),
): void {
  useEffect(() => {
    if (gameState !== "game_over") return;
    const handle = window.setTimeout(restart, OUTRO_IDLE_TIMEOUT_MS);
    return () => window.clearTimeout(handle);
    // restart : identité stable attendue (défaut = reload) — pas une dep.
  }, [gameState]);
}
