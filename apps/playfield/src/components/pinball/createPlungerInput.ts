import { plungerChargeProgress, plungerLaunchFactor } from "@pinball/game-engine";
import type { InputState } from "./createApplyAction";

export interface PlungerInputDeps {
  state: InputState;
  now: () => number;
  startPlungerCharge: (t: number) => void;
  launchBall: (factor: number) => void;
  setPlungerCharge: (v: number | null) => void;
}

export interface PlungerInput {
  beginCharge(): void;
  release(): void;
  isCharging(): boolean;
}

// Mechanics only — game-state gating stays upstream in applyAction.
export function createPlungerInput(d: PlungerInputDeps): PlungerInput {
  return {
    beginCharge() {
      const t = d.now();
      d.startPlungerCharge(t);
      d.state.isChargingPlunger = true;
      d.state.chargeStartTime = t;
    },
    release() {
      d.state.isChargingPlunger = false;
      d.state.plungerState = "releasing";
      const progress = plungerChargeProgress(d.now(), d.state.chargeStartTime);
      const factor = plungerLaunchFactor(progress);
      d.setPlungerCharge(null);
      d.launchBall(factor);
    },
    isCharging() {
      return d.state.isChargingPlunger;
    },
  };
}
