import { test, expect, describe } from "bun:test";
import type { ButtonAction, ButtonId, GameAction } from "@pinball/shared-types";
import { CABINET_BUTTONS } from "@pinball/shared-types";
import { createPhysicalInputHandlers, createDispatchButton } from "./wireInputs";

const mappedButton = CABINET_BUTTONS.find((b) => b.action)!;

describe("createPhysicalInputHandlers.onButton", () => {
  test("bouton mappé → applyAction(action jeu, DOWN/UP)", () => {
    const calls: [GameAction, ButtonAction][] = [];
    const h = createPhysicalInputHandlers({
      applyAction: (a, b) => calls.push([a, b]),
      emit: () => {},
      mapBosses: [],
    });
    h.onButton({ id: mappedButton.id, action: "DOWN" });
    expect(calls).toEqual([[mappedButton.action!, "DOWN"]]);
  });

  test("bouton non mappé → drop silencieux", () => {
    const unmapped = CABINET_BUTTONS.find((b) => !b.action);
    if (!unmapped) return; // tous mappés → rien à tester
    let called = 0;
    const h = createPhysicalInputHandlers({
      applyAction: () => (called += 1),
      emit: () => {},
      mapBosses: [],
    });
    h.onButton({ id: unmapped.id, action: "DOWN" });
    expect(called).toBe(0);
  });

  test("onDevEvent : trigger valide → emit du GameEvent traduit", () => {
    const emitted: unknown[] = [];
    const h = createPhysicalInputHandlers({
      applyAction: () => {},
      emit: (e) => emitted.push(e),
      mapBosses: [],
    });
    h.onDevEvent({ type: "BUMPER_HIT" } as Parameters<typeof h.onDevEvent>[0]);
    expect(emitted.length).toBe(1);
  });
});

describe("createDispatchButton", () => {
  const id = "PLUNGER" as ButtonId;
  const spy = () => {
    const calls = { sim: 0, local: 0 };
    return {
      calls,
      simulateButton: () => (calls.sim += 1),
      onButton: () => (calls.local += 1),
    };
  };

  test("disabled → aucun routage", () => {
    const s = spy();
    createDispatchButton({ mode: "disabled", isConnectedRef: { current: true }, ...s })(id, "DOWN");
    expect(s.calls).toEqual({ sim: 0, local: 0 });
  });

  test("direct → handler local", () => {
    const s = spy();
    createDispatchButton({ mode: "direct", isConnectedRef: { current: true }, ...s })(id, "DOWN");
    expect(s.calls).toEqual({ sim: 0, local: 1 });
  });

  test("simulate-esp32 connecté → réseau ; déconnecté → fallback local", () => {
    const on = spy();
    createDispatchButton({ mode: "simulate-esp32", isConnectedRef: { current: true }, ...on })(id, "DOWN");
    expect(on.calls).toEqual({ sim: 1, local: 0 });

    const off = spy();
    createDispatchButton({ mode: "simulate-esp32", isConnectedRef: { current: false }, ...off })(id, "DOWN");
    expect(off.calls).toEqual({ sim: 0, local: 1 });
  });
});
