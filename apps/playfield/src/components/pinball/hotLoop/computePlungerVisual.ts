import { plungerChargeProgress, plungerLaunchFactor, PLUNGER_CHARGE_MS } from "@pinball/game-engine";
import type { PlungerState } from "../createApplyAction";

// Charge-gauge UI throttle (React setState capped at ~25 Hz to avoid
// re-rendering at 60/120 Hz), + reset to null on release. Stateful by design
// (last push + displayed gauge) — owned by the init closure.
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
  /** plunger mesh Z position this frame */
  z: number;
  /** FSM state after this frame (releasing→returning→idle transitions) */
  plungerState: PlungerState;
}

// Plunger visual FSM (pure): computes the mesh Z position + the state
// transition for a given frame. `restZ` = rest position (>0).
//
// - charging: pullback ∝ charge factor
// - releasing: forward strike, then → returning after 10% of the charge time
// - returning: back to rest → idle
// - idle: at rest
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
