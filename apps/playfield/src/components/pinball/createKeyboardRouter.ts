import type { MutableRefObject } from "react";
import type { ButtonId, ButtonAction } from "@pinball/shared-types";
import { gameKeyToAction, idForAction, isPreventDefaultKey } from "./keyboardMap";
import type { DebugMeshManager, PivotCoords } from "./debug/DebugMeshManager";

export interface KeyboardRouterDeps {
  /** unlocks audio on the first keydown (autoplay policy) */
  unlockAudio: () => void;
  /** routes a physical button (direct or simulate-esp32 mode) */
  dispatchButton: (id: ButtonId, action: ButtonAction) => void;
  debug: DebugMeshManager;
  setFlipperPivotCoords: (c: PivotCoords | null) => void;
  debugVisibleRef: MutableRefObject<boolean>;
  setDebugVisible: (v: boolean) => void;
  /** M: toggles ball-move mode (ballDragController) */
  toggleMoveMode: () => void;
  /** R: ball reset (dev only) */
  resetBall: () => void;
  /** process.env.NODE_ENV !== "production" (build-time) — gates the ball reset */
  isDev: boolean;
}

// Dev keyboard router: translates keydown/keyup into game actions (via
// keyboardMap) and debug toggles (H colliders / J diagnostics / M ball move /
// R reset). The Three side effects of the H toggle are isolated in
// DebugMeshManager → this router only routes. `H` always stays active,
// independent of KEYBOARD_MODE (handled upstream by dispatchButton).
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
    // Ball reset = DEV helper only (cf. GameOverlay). Absent in prod.
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
