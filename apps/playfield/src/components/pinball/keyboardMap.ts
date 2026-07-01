import type { GameAction, ButtonId } from "@pinball/shared-types";
import { CABINET_BUTTONS } from "@pinball/shared-types";

// Résout l'id physique du bouton mappé à une action de jeu (DRY — survit à un
// remap GPIO, pas de littéral 'WHITE_LEFT' codé en dur). Fail-fast : si l'action
// n'est plus câblée dans CABINET_BUTTONS, throw explicite au lieu du `!` qui
// crashait silencieusement plus loin.
export function idForAction(action: GameAction): ButtonId {
  const btn = CABINET_BUTTONS.find((b) => b.action === action);
  if (!btn) {
    throw new Error(
      `[keyboardMap] aucun bouton CABINET_BUTTONS mappé à l'action "${action}"`,
    );
  }
  return btn.id;
}

// Touches clavier dev → action de jeu. null = touche non-jeu (ignorée par le
// routeur ; les toggles debug H/J/M/R sont gérés séparément). Le sens DOWN/UP
// est fourni par l'appelant (keydown vs keyup) — cette table ne mappe que la
// touche vers l'action.
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

// Touches dont le routeur doit annuler le comportement navigateur par défaut
// (scroll flèches / espace).
export function isPreventDefaultKey(key: string): boolean {
  return key === "ArrowLeft" || key === "ArrowRight" || key === " ";
}
