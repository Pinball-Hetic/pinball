import type { MutableRefObject } from "react";
import type { ButtonId, ButtonAction } from "@pinball/shared-types";
import { gameKeyToAction, idForAction, isPreventDefaultKey } from "./keyboardMap";
import type { DebugMeshManager, PivotCoords } from "./debug/DebugMeshManager";

export interface KeyboardRouterDeps {
  /** débloque l'audio au premier keydown (autoplay policy) */
  unlockAudio: () => void;
  /** route un bouton physique (mode direct ou simulate-esp32) */
  dispatchButton: (id: ButtonId, action: ButtonAction) => void;
  debug: DebugMeshManager;
  setFlipperPivotCoords: (c: PivotCoords | null) => void;
  debugVisibleRef: MutableRefObject<boolean>;
  setDebugVisible: (v: boolean) => void;
  /** M : bascule le mode déplacement bille (ballDragController) */
  toggleMoveMode: () => void;
  /** R : reset bille (dev only) */
  resetBall: () => void;
  /** process.env.NODE_ENV !== "production" (build-time) — gate le reset-bille */
  isDev: boolean;
}

// Routeur clavier dev : traduit les keydown/keyup en actions de jeu (via
// keyboardMap) et en toggles debug (H colliders / J diagnostics / M déplacement
// bille / R reset). Les side-effects Three du toggle H sont isolés dans
// DebugMeshManager → ce routeur ne fait que router. `H` reste toujours actif,
// indépendant du KEYBOARD_MODE (géré en amont par dispatchButton).
export function createKeyboardRouter(deps: KeyboardRouterDeps): {
  onKeyDown: (e: KeyboardEvent) => void;
  onKeyUp: (e: KeyboardEvent) => void;
} {
  const onKeyDown = (e: KeyboardEvent) => {
    if (isPreventDefaultKey(e.key)) e.preventDefault();
    deps.unlockAudio();
    if (e.repeat) return;

    if (e.key === "h" || e.key === "H") {
      deps.setFlipperPivotCoords(deps.debug.toggleColliders());
      return;
    }
    if (e.key === "j" || e.key === "J") {
      deps.debugVisibleRef.current = !deps.debugVisibleRef.current;
      deps.setDebugVisible(deps.debugVisibleRef.current);
      return;
    }
    if (e.key === "m" || e.key === "M") {
      deps.toggleMoveMode();
      return;
    }
    // Reset-balle = aide DEV uniquement (cf. GameOverlay). Absente en prod.
    if ((e.key === "r" || e.key === "R") && deps.isDev) {
      deps.resetBall();
      return;
    }

    const action = gameKeyToAction(e.key);
    if (action) deps.dispatchButton(idForAction(action), "DOWN");
  };

  const onKeyUp = (e: KeyboardEvent) => {
    if (isPreventDefaultKey(e.key)) e.preventDefault();
    const action = gameKeyToAction(e.key);
    if (action) deps.dispatchButton(idForAction(action), "UP");
  };

  return { onKeyDown, onKeyUp };
}
