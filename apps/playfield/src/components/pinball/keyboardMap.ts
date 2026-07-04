import type { GameAction, ButtonId } from "@pinball/shared-types";
import { CABINET_BUTTONS } from "@pinball/shared-types";

// Resolves the physical id of the button mapped to a game action (survives a
// GPIO remap, no hardcoded 'WHITE_LEFT' literal). Fail-fast: if the action is
// no longer wired in CABINET_BUTTONS, throw explicitly instead of a `!` that
// crashed silently later.
export function idForAction(action: GameAction): ButtonId {
  const btn = CABINET_BUTTONS.find((b) => b.action === action);
  if (!btn) {
    throw new Error(
      `[keyboardMap] aucun bouton CABINET_BUTTONS mappé à l'action "${action}"`,
    );
  }
  return btn.id;
}

// Dev keyboard keys → game action. null = non-game key (ignored by the
// router; the H/J/M/R debug toggles are handled separately). The DOWN/UP
// direction comes from the caller (keydown vs keyup) — this table only maps
// key to action.
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

// Keys whose default browser behavior the router must cancel (arrow/space
// scrolling).
export function isPreventDefaultKey(key: string): boolean {
  return key === "ArrowLeft" || key === "ArrowRight" || key === " ";
}
