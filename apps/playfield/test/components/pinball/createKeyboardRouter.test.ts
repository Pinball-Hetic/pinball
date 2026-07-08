import { test, expect, describe } from "bun:test";
import type { ButtonId, ButtonAction } from "@pinball/shared-types";
import { createKeyboardRouter, type KeyboardRouterDeps } from "../../../src/components/pinball/createKeyboardRouter";
import { idForAction } from "../../../src/components/pinball/keyboardMap";
import type { DebugMeshManager } from "../../../src/components/pinball/debug/DebugMeshManager";

function harness(over: Partial<KeyboardRouterDeps> = {}) {
  const calls = {
    dispatch: [] as { id: ButtonId; action: ButtonAction }[],
    unlockAudio: 0,
    toggleColliders: 0,
    setPivotCoords: 0,
    toggleMoveMode: 0,
    resetBall: 0,
    setDebugVisible: [] as boolean[],
  };
  const debugVisibleRef = { current: false };
  const debug = {
    collidersOn: false,
    toggleColliders: () => {
      calls.toggleColliders += 1;
      return null;
    },
  } as unknown as DebugMeshManager;

  const router = createKeyboardRouter({
    unlockAudio: () => (calls.unlockAudio += 1),
    dispatchButton: (id, action) => calls.dispatch.push({ id, action }),
    debug,
    setFlipperPivotCoords: () => (calls.setPivotCoords += 1),
    debugVisibleRef,
    setDebugVisible: (v) => calls.setDebugVisible.push(v),
    toggleMoveMode: () => (calls.toggleMoveMode += 1),
    resetBall: () => (calls.resetBall += 1),
    isDev: true,
    ...over,
  });
  return { router, calls, debugVisibleRef };
}

const key = (k: string, repeat = false): KeyboardEvent =>
  ({ key: k, repeat, preventDefault: () => {} }) as KeyboardEvent;

describe("createKeyboardRouter — routage jeu", () => {
  test("flèches/q/d/espace → dispatchButton avec l'id physique + DOWN/UP", () => {
    const h = harness();
    h.router.onKeyDown(key("q"));
    h.router.onKeyUp(key("q"));
    expect(h.calls.dispatch).toEqual([
      { id: idForAction("FLIP_LEFT"), action: "DOWN" },
      { id: idForAction("FLIP_LEFT"), action: "UP" },
    ]);
  });

  test("espace → PLUNGE", () => {
    const h = harness();
    h.router.onKeyDown(key(" "));
    expect(h.calls.dispatch).toEqual([{ id: idForAction("PLUNGE"), action: "DOWN" }]);
  });

  test("e.repeat → aucun dispatch (anti-répétition)", () => {
    const h = harness();
    h.router.onKeyDown(key("q", true));
    expect(h.calls.dispatch.length).toBe(0);
  });

  test("unlockAudio appelé à chaque keydown", () => {
    const h = harness();
    h.router.onKeyDown(key("q"));
    expect(h.calls.unlockAudio).toBe(1);
  });
});

describe("createKeyboardRouter — toggles debug (pas de dispatch jeu)", () => {
  test("H → toggleColliders + setFlipperPivotCoords, aucun dispatch", () => {
    const h = harness();
    h.router.onKeyDown(key("H"));
    expect(h.calls.toggleColliders).toBe(1);
    expect(h.calls.setPivotCoords).toBe(1);
    expect(h.calls.dispatch.length).toBe(0);
  });

  test("J → toggle debugVisibleRef + setDebugVisible", () => {
    const h = harness();
    h.router.onKeyDown(key("j"));
    expect(h.debugVisibleRef.current).toBe(true);
    expect(h.calls.setDebugVisible).toEqual([true]);
  });

  test("M → toggleMoveMode", () => {
    const h = harness();
    h.router.onKeyDown(key("m"));
    expect(h.calls.toggleMoveMode).toBe(1);
  });

  test("R → resetBall en dev, ignoré si isDev=false", () => {
    const dev = harness({ isDev: true });
    dev.router.onKeyDown(key("r"));
    expect(dev.calls.resetBall).toBe(1);

    const prod = harness({ isDev: false });
    prod.router.onKeyDown(key("r"));
    expect(prod.calls.resetBall).toBe(0);
  });
});
