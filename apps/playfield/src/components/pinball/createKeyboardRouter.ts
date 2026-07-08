import type { MutableRefObject } from "react";
import type { ButtonId, ButtonAction } from "@pinball/shared-types";
import { gameKeyToAction, idForAction, isPreventDefaultKey } from "./keyboardMap";
import type { DebugMeshManager, PivotCoords } from "./debug/DebugMeshManager";

export interface KeyboardRouterDeps {
  unlockAudio: () => void;
  dispatchButton: (id: ButtonId, action: ButtonAction) => void;
  debug: DebugMeshManager;
  setFlipperPivotCoords: (c: PivotCoords | null) => void;
  debugVisibleRef: MutableRefObject<boolean>;
  setDebugVisible: (v: boolean) => void;
  toggleMoveMode: () => void;
  resetBall: () => void;
  isDev: boolean;
}

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
