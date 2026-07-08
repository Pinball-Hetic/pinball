import { test, expect, describe } from "bun:test";
import {
  createApplyAction,
  createInputState,
  type ApplyActionDeps,
  type InputState,
} from "../../../src/components/pinball/createApplyAction";
import type { GameState } from "@/hooks/useGameState";

interface Harness {
  apply: ReturnType<typeof createApplyAction>;
  state: InputState;
  calls: {
    beginSession: number;
    startPlungerCharge: number[];
    launchBall: number[];
    setPlungerCharge: (number | null)[];
    restartWorkflow: number;
  };
  set: {
    sessionStarted: (v: boolean) => void;
    physicsReady: (v: boolean) => void;
    gameState: (v: GameState) => void;
    now: (v: number) => void;
  };
}

function harness(over: Partial<ApplyActionDeps> = {}): Harness {
  const state = createInputState();
  let sessionStarted = true;
  let physicsReady = true;
  let gameState: GameState = "idle";
  let clock = 1000;
  const calls = {
    beginSession: 0,
    startPlungerCharge: [] as number[],
    launchBall: [] as number[],
    setPlungerCharge: [] as (number | null)[],
    restartWorkflow: 0,
  };
  const apply = createApplyAction({
    state,
    now: () => clock,
    isSessionStarted: () => sessionStarted,
    isPhysicsReady: () => physicsReady,
    getGameState: () => gameState,
    beginSession: () => {
      calls.beginSession += 1;
    },
    startPlungerCharge: (t) => calls.startPlungerCharge.push(t),
    launchBall: (f) => calls.launchBall.push(f),
    setPlungerCharge: (v) => calls.setPlungerCharge.push(v),
    restartWorkflow: () => {
      calls.restartWorkflow += 1;
    },
    debugLog: () => {},
    ...over,
  });
  return {
    apply,
    state,
    calls,
    set: {
      sessionStarted: (v) => (sessionStarted = v),
      physicsReady: (v) => (physicsReady = v),
      gameState: (v) => (gameState = v),
      now: (v) => (clock = v),
    },
  };
}

describe("createApplyAction — flippers", () => {
  test("FLIP_LEFT/RIGHT DOWN pose la cible à 1, UP à 0", () => {
    const h = harness();
    h.apply("FLIP_LEFT", "DOWN");
    expect(h.state.leftTarget).toBe(1);
    h.apply("FLIP_LEFT", "UP");
    expect(h.state.leftTarget).toBe(0);
    h.apply("FLIP_RIGHT", "DOWN");
    expect(h.state.rightTarget).toBe(1);
    // does NOT affect the other flipper
    expect(h.state.leftTarget).toBe(0);
  });
});

describe("createApplyAction — gating avant session", () => {
  test("hors session, PLUNGE DOWN (physique prête) démarre la session + amorce la charge en idle", () => {
    const h = harness();
    h.set.sessionStarted(false);
    h.apply("PLUNGE", "DOWN");
    expect(h.calls.beginSession).toBe(1);
    expect(h.calls.startPlungerCharge).toEqual([1000]);
    expect(h.state.isChargingPlunger).toBe(true);
    expect(h.state.chargeStartTime).toBe(1000);
  });

  test("hors session, FLIP ne démarre rien", () => {
    const h = harness();
    h.set.sessionStarted(false);
    h.apply("FLIP_LEFT", "DOWN");
    expect(h.calls.beginSession).toBe(0);
    expect(h.state.leftTarget).toBe(0);
  });

  test("hors session, physique non prête → aucun démarrage", () => {
    const h = harness();
    h.set.sessionStarted(false);
    h.set.physicsReady(false);
    h.apply("START", "DOWN");
    expect(h.calls.beginSession).toBe(0);
  });
});

describe("createApplyAction — plunger", () => {
  test("PLUNGE DOWN en idle amorce la charge", () => {
    const h = harness();
    h.set.now(2500);
    h.apply("PLUNGE", "DOWN");
    expect(h.state.isChargingPlunger).toBe(true);
    expect(h.state.chargeStartTime).toBe(2500);
    expect(h.calls.startPlungerCharge).toEqual([2500]);
  });

  test("PLUNGE UP en charge → release : lance la bille + reset UI charge", () => {
    const h = harness();
    h.apply("PLUNGE", "DOWN");
    h.apply("PLUNGE", "UP");
    expect(h.state.isChargingPlunger).toBe(false);
    expect(h.state.plungerState).toBe("releasing");
    expect(h.calls.launchBall.length).toBe(1);
    expect(h.calls.setPlungerCharge).toContain(null);
  });

  test("PLUNGE UP sans charge → no-op (pas de lancement)", () => {
    const h = harness();
    h.apply("PLUNGE", "UP");
    expect(h.calls.launchBall.length).toBe(0);
  });
});

describe("createApplyAction — game over", () => {
  test("PLUNGE DOWN en game_over → restartWorkflow (pas de charge)", () => {
    const h = harness();
    h.set.gameState("game_over");
    h.apply("PLUNGE", "DOWN");
    expect(h.calls.restartWorkflow).toBe(1);
    expect(h.state.isChargingPlunger).toBe(false);
  });

  test("START DOWN en game_over → restartWorkflow", () => {
    const h = harness();
    h.set.gameState("game_over");
    h.apply("START", "DOWN");
    expect(h.calls.restartWorkflow).toBe(1);
  });

  test("START DOWN hors game_over → no-op", () => {
    const h = harness();
    h.apply("START", "DOWN");
    expect(h.calls.restartWorkflow).toBe(0);
  });
});
