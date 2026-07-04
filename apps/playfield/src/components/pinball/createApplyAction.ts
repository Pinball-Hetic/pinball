import type { GameAction, ButtonAction } from "@pinball/shared-types";
import { plungerChargeProgress, plungerLaunchFactor } from "@pinball/game-engine";
import type { GameState } from "@/hooks/useGameState";

// Mutable input state SHARED between the action router (createApplyAction)
// and the animate loop (flipper swing + plunger physics). Single object owned
// by the init closure.
export type PlungerState = "idle" | "charging" | "releasing" | "returning";

export interface InputState {
  /** left flipper swing target: 1 = pressed, 0 = released */
  leftTarget: number;
  /** right flipper swing target: 1 = pressed, 0 = released */
  rightTarget: number;
  isChargingPlunger: boolean;
  plungerState: PlungerState;
  chargeStartTime: number;
}

export function createInputState(): InputState {
  return {
    leftTarget: 0,
    rightTarget: 0,
    isChargingPlunger: false,
    plungerState: "idle",
    chargeStartTime: 0,
  };
}

export interface ApplyActionDeps {
  state: InputState;
  /** injected clock (performance.now in prod) — tests pass a fake */
  now: () => number;
  isSessionStarted: () => boolean;
  isPhysicsReady: () => boolean;
  getGameState: () => GameState;
  beginSession: () => void;
  /** plunger.startCharge(t) */
  startPlungerCharge: (t: number) => void;
  /** launchBallUC?.execute(factor) */
  launchBall: (factor: number) => void;
  setPlungerCharge: (v: number | null) => void;
  /** outro/game-over exit → reload → map selector */
  restartWorkflow: () => void;
  debugLog: (...args: unknown[]) => void;
}

/**
 * Translates a game action (FLIP_LEFT/RIGHT, PLUNGE, START) into game-loop
 * effects. SINGLE source of truth for input effects — called by
 * `input:button` network events as well as the dev keyboard. Keyed on the
 * ACTION (not the physical id); the ButtonId→GameAction adapter lives
 * upstream.
 *
 * No Three.js / React dependency: all collaboration goes through `deps`
 * (state getters, callbacks, injected clock).
 */
export function createApplyAction(deps: ApplyActionDeps) {
  const {
    state,
    now,
    isSessionStarted,
    isPhysicsReady,
    getGameState,
    beginSession,
    startPlungerCharge,
    launchBall,
    setPlungerCharge,
    restartWorkflow,
    debugLog,
  } = deps;

  return function applyAction(action: GameAction, btnAction: ButtonAction): void {
    // Before the session starts: only PLUNGE/START (DOWN, physics ready)
    // start the game. PLUNGE while idle also primes the plunger charge.
    if (!isSessionStarted()) {
      if (
        btnAction === "DOWN"
        && isPhysicsReady()
        && (action === "PLUNGE" || action === "START")
      ) {
        beginSession();
        if (action === "PLUNGE" && getGameState() === "idle") {
          const t = now();
          startPlungerCharge(t);
          state.isChargingPlunger = true;
          state.chargeStartTime = t;
        }
      }
      return;
    }

    switch (action) {
      case "FLIP_LEFT":
        state.leftTarget = btnAction === "DOWN" ? 1 : 0;
        break;
      case "FLIP_RIGHT":
        state.rightTarget = btnAction === "DOWN" ? 1 : 0;
        break;
      case "PLUNGE": {
        if (btnAction === "DOWN") {
          debugLog(
            `[Plunger] DOWN — gameState=${getGameState()} charging=${state.isChargingPlunger}`,
          );
          if (getGameState() === "game_over") {
            restartWorkflow();
            return;
          }
          if (getGameState() === "idle" && isPhysicsReady()) {
            const t = now();
            startPlungerCharge(t);
            state.isChargingPlunger = true;
            state.chargeStartTime = t;
          } else {
            debugLog(
              `[Plunger] DOWN ignoré — charge impossible (idle + physicsReady requis). ` +
                `gameState=${getGameState()}`,
            );
          }
        } else if (state.isChargingPlunger && getGameState() === "idle") {
          state.isChargingPlunger = false;
          state.plungerState = "releasing";
          const t = plungerChargeProgress(now(), state.chargeStartTime);
          const factor = plungerLaunchFactor(t);
          setPlungerCharge(null);
          debugLog(`[Plunger] RELEASE — factor=${factor.toFixed(2)} → lancement`);
          launchBall(factor);
        } else {
          debugLog(
            `[Plunger] UP ignoré — pas en charge ou pas idle. ` +
              `charging=${state.isChargingPlunger} gameState=${getGameState()}`,
          );
        }
        break;
      }
      case "START":
        if (btnAction === "DOWN" && getGameState() === "game_over") {
          restartWorkflow();
        }
        break;
    }
  };
}
