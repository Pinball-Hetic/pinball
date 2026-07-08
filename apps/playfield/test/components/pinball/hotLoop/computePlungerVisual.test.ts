import { test, expect, describe } from "bun:test";
import { PLUNGER_CHARGE_MS } from "@pinball/game-engine";
import { computePlungerVisual, type PlungerVisualInput } from "../../../../src/components/pinball/hotLoop/computePlungerVisual";

const REST = 0.24;
const base = (over: Partial<PlungerVisualInput> = {}): PlungerVisualInput => ({
  isChargingPlunger: false,
  plungerState: "idle",
  chargeStartTime: 0,
  ...over,
});

describe("computePlungerVisual — charge", () => {
  test("en charge : recul (z >= restZ), état inchangé", () => {
    const r = computePlungerVisual(
      base({ isChargingPlunger: true, chargeStartTime: 0 }),
      500,
      REST,
    );
    expect(r.z).toBeGreaterThanOrEqual(REST);
    expect(r.plungerState).toBe("idle");
  });

  test("recul croît avec le temps de charge", () => {
    const s = base({ isChargingPlunger: true, chargeStartTime: 0 });
    const early = computePlungerVisual(s, 100, REST).z;
    const late = computePlungerVisual(s, 800, REST).z;
    expect(late).toBeGreaterThan(early);
  });
});

describe("computePlungerVisual — FSM releasing → returning → idle", () => {
  test("releasing : coup avant (z < restZ), reste releasing avant 10% du temps", () => {
    const r = computePlungerVisual(
      base({ plungerState: "releasing", chargeStartTime: 1000 }),
      1000 + PLUNGER_CHARGE_MS * 0.05, // < 10%
      REST,
    );
    expect(r.z).toBeLessThan(REST);
    expect(r.plungerState).toBe("releasing");
  });

  test("releasing → returning après 10% du temps de charge", () => {
    const r = computePlungerVisual(
      base({ plungerState: "releasing", chargeStartTime: 1000 }),
      1000 + PLUNGER_CHARGE_MS * 0.2, // > 10%
      REST,
    );
    expect(r.plungerState).toBe("returning");
  });

  test("returning → idle au repos", () => {
    const r = computePlungerVisual(base({ plungerState: "returning" }), 5000, REST);
    expect(r.z).toBe(REST);
    expect(r.plungerState).toBe("idle");
  });

  test("idle : repos, état inchangé", () => {
    const r = computePlungerVisual(base({ plungerState: "idle" }), 5000, REST);
    expect(r.z).toBe(REST);
    expect(r.plungerState).toBe("idle");
  });
});
