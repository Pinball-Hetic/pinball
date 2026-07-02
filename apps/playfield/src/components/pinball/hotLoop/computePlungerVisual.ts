import { plungerChargeProgress, plungerLaunchFactor, PLUNGER_CHARGE_MS } from "@pinball/game-engine";
import type { PlungerState } from "../createApplyAction";

// Throttle de la jauge UI de charge (React setState max ~25 Hz pour ne pas
// re-render à 60/120 Hz), + reset à null au relâchement. Stateful par design
// (dernier push + jauge affichée) — possédé par la closure d'init.
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
  /** position Z du mesh plongeur cette frame */
  z: number;
  /** état FSM après cette frame (transitions releasing→returning→idle) */
  plungerState: PlungerState;
}

// FSM visuelle du plongeur (pure) : calcule la position Z du mesh + la
// transition d'état pour une frame donnée. Extrait du hot loop → testable sans
// Three/Rapier. `restZ` = position de repos (>0). Behavior-preserving 1:1.
//
// - en charge : recul ∝ facteur de charge (pullback)
// - releasing : coup vers l'avant, puis → returning après 10% du temps de charge
// - returning : retour au repos → idle
// - idle : au repos
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
