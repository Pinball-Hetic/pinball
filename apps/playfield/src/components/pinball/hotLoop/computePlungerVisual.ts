import { plungerChargeProgress, plungerLaunchFactor, PLUNGER_CHARGE_MS } from "@pinball/game-engine";
import type { PlungerState } from "../createApplyAction";

export const PLUNGER_CHARGE_UI_INTERVAL_MS = 40;

export function createPlungerChargeUi(push: (charge: number | null) => void) {
  let lastPushTime = 0;
  let active = false;

  return {
    step(time: number, isCharging: boolean, chargeStartTime: number): void {
      if (isCharging) {
        active = true;
        if (time - lastPushTime > PLUNGER_CHARGE_UI_INTERVAL_MS) {
          lastPushTime = time;
          push(plungerChargeProgress(time, chargeStartTime));
        }
        return;
      }
      if (active) {
        active = false;
        push(null);
      }
    },
  };
}

export interface PlungerVisualInput {
  isChargingPlunger: boolean;
  plungerState: PlungerState;
  chargeStartTime: number;
}

export interface PlungerVisualResult {
  z: number;
  plungerState: PlungerState;
}

export function computePlungerVisual(
  s: PlungerVisualInput,
  time: number,
  restZ: number,
): PlungerVisualResult {
  if (s.isChargingPlunger) {
    const t = plungerChargeProgress(time, s.chargeStartTime);
    return { z: restZ + plungerLaunchFactor(t) * 0.08, plungerState: s.plungerState };
  }
  if (s.plungerState === "releasing") {
    const advanced = time - s.chargeStartTime > PLUNGER_CHARGE_MS * 0.1;
    return { z: restZ - 0.015, plungerState: advanced ? "returning" : "releasing" };
  }
  if (s.plungerState === "returning") {
    return { z: restZ, plungerState: "idle" };
  }
  return { z: restZ, plungerState: s.plungerState };
}
