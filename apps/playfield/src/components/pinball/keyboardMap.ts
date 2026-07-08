import type { GameAction, ButtonId } from "@pinball/shared-types";
import { CABINET_BUTTONS } from "@pinball/shared-types";

export function idForAction(action: GameAction): ButtonId {
  const btn = CABINET_BUTTONS.find((b) => b.action === action);
  if (!btn) {
    throw new Error(
      `[keyboardMap] aucun bouton CABINET_BUTTONS mappé à l'action "${action}"`,
    );
  }
  return btn.id;
}

const KEY_TO_ACTION: Readonly<Record<string, GameAction>> = {
  ArrowLeft: "FLIP_LEFT",
  q: "FLIP_LEFT",
  Q: "FLIP_LEFT",
  ArrowRight: "FLIP_RIGHT",
  d: "FLIP_RIGHT",
  D: "FLIP_RIGHT",
  " ": "PLUNGE",
};

export function gameKeyToAction(key: string): GameAction | null {
  return KEY_TO_ACTION[key] ?? null;
}

export function isPreventDefaultKey(key: string): boolean {
  return key === "ArrowLeft" || key === "ArrowRight" || key === " ";
}
