import { test, expect, describe } from "bun:test";
import { createInputState } from "../../../src/components/pinball/createApplyAction";
import { createPlungerInput } from "../../../src/components/pinball/createPlungerInput";

function harness() {
  const state = createInputState();
  let clock = 1000;
  const calls = {
    startPlungerCharge: [] as number[],
    launchBall: [] as number[],
    setPlungerCharge: [] as (number | null)[],
  };
  const plunger = createPlungerInput({
    state,
    now: () => clock,
    startPlungerCharge: (t) => calls.startPlungerCharge.push(t),
    launchBall: (f) => calls.launchBall.push(f),
    setPlungerCharge: (v) => calls.setPlungerCharge.push(v),
  });
  return { plunger, state, calls, setNow: (v: number) => (clock = v) };
}

describe("createPlungerInput", () => {
  test("beginCharge amorce la charge à l'horloge courante", () => {
    const h = harness();
    h.setNow(2500);
    h.plunger.beginCharge();
    expect(h.state.isChargingPlunger).toBe(true);
    expect(h.state.chargeStartTime).toBe(2500);
    expect(h.calls.startPlungerCharge).toEqual([2500]);
    expect(h.plunger.isCharging()).toBe(true);
  });

  test("release lance la bille + reset l'état de charge", () => {
    const h = harness();
    h.plunger.beginCharge();
    h.plunger.release();
    expect(h.state.isChargingPlunger).toBe(false);
    expect(h.state.plungerState).toBe("releasing");
    expect(h.calls.launchBall.length).toBe(1);
    expect(h.calls.setPlungerCharge).toContain(null);
    expect(h.plunger.isCharging()).toBe(false);
  });

  test("le facteur de lancement croît avec la durée de charge", () => {
    const short = harness();
    short.plunger.beginCharge();
    short.setNow(1050);
    short.plunger.release();

    const long = harness();
    long.plunger.beginCharge();
    long.setNow(3000);
    long.plunger.release();

    expect(long.calls.launchBall[0]!).toBeGreaterThan(short.calls.launchBall[0]!);
  });

  test("isCharging reflète l'état sans le muter", () => {
    const h = harness();
    expect(h.plunger.isCharging()).toBe(false);
    h.plunger.beginCharge();
    expect(h.plunger.isCharging()).toBe(true);
  });
});
