import { test, expect, describe } from "bun:test";
import type { ButtonAction, ButtonId, GameAction } from "@pinball/shared-types";
import { CABINET_BUTTONS } from "@pinball/shared-types";
import type { CollisionEventProcessor } from "@pinball/game-engine";
import {
  createPhysicalInputHandlers,
  createDispatchButton,
  type PhysicalInputHandlersDeps,
} from "./wireInputs";

const mappedButton = CABINET_BUTTONS.find((b) => b.action)!;

function handlersHarness(over: Partial<PhysicalInputHandlersDeps> = {}) {
  const calls = {
    apply: [] as [GameAction, ButtonAction][],
    emitted: [] as unknown[],
    reveals: [] as string[],
    hits: [] as string[],
  };
  const processor = {
    debugRevealBoss: (id: string) => calls.reveals.push(id),
    debugBossTargetHit: (id: string) => calls.hits.push(id),
  } as unknown as CollisionEventProcessor;
  const h = createPhysicalInputHandlers({
    applyAction: (a, b) => calls.apply.push([a, b]),
    emit: (e) => calls.emitted.push(e),
    mapBosses: [{ id: "demogorgon" } as PhysicalInputHandlersDeps["mapBosses"][number]],
    getCollisionProcessor: () => processor,
    getGameState: () => "playing",
    ...over,
  });
  return { h, calls };
}

describe("createPhysicalInputHandlers.onButton", () => {
  test("bouton mappé → applyAction(action jeu, DOWN/UP)", () => {
    const { h, calls } = handlersHarness();
    h.onButton({ id: mappedButton.id, action: "DOWN" });
    expect(calls.apply).toEqual([[mappedButton.action!, "DOWN"]]);
  });

  test("bouton non mappé → drop silencieux", () => {
    const unmapped = CABINET_BUTTONS.find((b) => !b.action);
    if (!unmapped) return; // tous mappés → rien à tester
    const { h, calls } = handlersHarness();
    h.onButton({ id: unmapped.id, action: "DOWN" });
    expect(calls.apply.length).toBe(0);
  });

  test("onDevEvent : trigger valide → emit du GameEvent traduit", () => {
    const { h, calls } = handlersHarness();
    h.onDevEvent({ type: "BUMPER_HIT" } as Parameters<typeof h.onDevEvent>[0]);
    expect(calls.emitted.length).toBe(1);
  });
});

describe("createPhysicalInputHandlers — triggers boss debug (vrai chemin d'état)", () => {
  const dev = (t: Record<string, unknown>) => t as Parameters<ReturnType<typeof createPhysicalInputHandlers>["onDevEvent"]>[0];

  test("BOSS_REVEAL → processor.debugRevealBoss, PAS d'event brut (boss fantôme)", () => {
    const { h, calls } = handlersHarness();
    h.onDevEvent(dev({ type: "BOSS_REVEAL", bossId: "vecna" }));
    expect(calls.reveals).toEqual(["vecna"]);
    expect(calls.emitted.length).toBe(0);
  });

  test("BOSS_REVEAL sans bossId → premier boss de la map", () => {
    const { h, calls } = handlersHarness();
    h.onDevEvent(dev({ type: "BOSS_REVEAL" }));
    expect(calls.reveals).toEqual(["demogorgon"]);
  });

  test("BOSS_TARGET_HIT hitCount=3 → 3 vrais hits via le processor", () => {
    const { h, calls } = handlersHarness();
    h.onDevEvent(dev({ type: "BOSS_TARGET_HIT", bossId: "vecna", hitCount: 3 }));
    expect(calls.hits).toEqual(["vecna", "vecna", "vecna"]);
    expect(calls.emitted.length).toBe(0);
  });

  test("processor absent (init pas fini) → no-op sans crash", () => {
    const { h, calls } = handlersHarness({ getCollisionProcessor: () => null });
    h.onDevEvent(dev({ type: "BOSS_REVEAL", bossId: "vecna" }));
    expect(calls.reveals).toEqual([]);
    expect(calls.emitted.length).toBe(0);
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
