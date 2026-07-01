import { plungerChargeProgress, plungerLaunchFactor, PLUNGER_CHARGE_MS } from "@pinball/game-engine";
import type { PlungerState } from "../createApplyAction";

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
