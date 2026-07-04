import { test, expect, describe } from "bun:test";
import type { GameAction } from "@pinball/shared-types";
import { CABINET_BUTTONS } from "@pinball/shared-types";
import { idForAction, gameKeyToAction, isPreventDefaultKey } from "./keyboardMap";

describe("idForAction", () => {
  test("retourne l'id physique mappé pour les actions câblées", () => {
    for (const action of ["FLIP_LEFT", "FLIP_RIGHT", "PLUNGE"] as GameAction[]) {
      const id = idForAction(action);
      const btn = CABINET_BUTTONS.find((b) => b.id === id);
      expect(btn?.action).toBe(action);
    }
  });

  test("fail-fast : throw explicite si l'action n'est pas mappée", () => {
    expect(() => idForAction("NOT_AN_ACTION" as GameAction)).toThrow(
      /aucun bouton CABINET_BUTTONS/,
    );
  });
});

describe("gameKeyToAction", () => {
  test("flèches + q/d/espace → actions de jeu (majuscule incluse)", () => {
    expect(gameKeyToAction("ArrowLeft")).toBe("FLIP_LEFT");
    expect(gameKeyToAction("q")).toBe("FLIP_LEFT");
    expect(gameKeyToAction("Q")).toBe("FLIP_LEFT");
    expect(gameKeyToAction("ArrowRight")).toBe("FLIP_RIGHT");
    expect(gameKeyToAction("d")).toBe("FLIP_RIGHT");
    expect(gameKeyToAction("D")).toBe("FLIP_RIGHT");
    expect(gameKeyToAction(" ")).toBe("PLUNGE");
  });

  test("touches non-jeu → null (debug H/J/M/R + inconnues)", () => {
    for (const k of ["h", "H", "j", "J", "m", "M", "r", "R", "z", "Enter"]) {
      expect(gameKeyToAction(k)).toBeNull();
    }
  });
});

describe("isPreventDefaultKey", () => {
  test("flèches + espace = true, reste = false", () => {
    expect(isPreventDefaultKey("ArrowLeft")).toBe(true);
    expect(isPreventDefaultKey("ArrowRight")).toBe(true);
    expect(isPreventDefaultKey(" ")).toBe(true);
    expect(isPreventDefaultKey("q")).toBe(false);
    expect(isPreventDefaultKey("h")).toBe(false);
  });
});
