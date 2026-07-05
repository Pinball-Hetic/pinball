import type { GameAction, ButtonAction } from "@pinball/shared-types";
import type { GameState } from "@/hooks/useGameState";
import { createPlungerInput, type PlungerInput } from "./createPlungerInput";

export type PlungerState = "idle" | "charging" | "releasing" | "returning";

export interface InputState {
  leftTarget: number;
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
  now: () => number;
  isSessionStarted: () => boolean;
  isPhysicsReady: () => boolean;
  getGameState: () => GameState;
  beginSession: () => void;
  startPlungerCharge: (t: number) => void;
  launchBall: (factor: number) => void;
  setPlungerCharge: (v: number | null) => void;
  restartWorkflow: () => void;
  debugLog: (...args: unknown[]) => void;
}

const SESSION_START_ACTIONS: ReadonlySet<GameAction> = new Set(["PLUNGE", "START"]);

interface ActionContext {
  state: InputState;
  getGameState: () => GameState;
  isPhysicsReady: () => boolean;
  restartWorkflow: () => void;
  plunger: PlungerInput;
  debugLog: (...args: unknown[]) => void;
}

function handlePlunge(btnAction: ButtonAction, ctx: ActionContext): void {
  if (btnAction === "DOWN") {
    if (ctx.getGameState() === "game_over") {
      ctx.restartWorkflow();
      return;
    }
    if (ctx.getGameState() === "idle" && ctx.isPhysicsReady()) {
      ctx.plunger.beginCharge();
    } else {
      ctx.debugLog(`[Plunger] DOWN ignoré — idle + physicsReady requis (gameState=${ctx.getGameState()})`);
    }
    return;
  }
  if (ctx.plunger.isCharging() && ctx.getGameState() === "idle") {
    ctx.plunger.release();
  } else {
    ctx.debugLog(`[Plunger] UP ignoré — pas en charge ou pas idle (charging=${ctx.plunger.isCharging()})`);
  }
}

const ACTION_HANDLERS: Record<GameAction, (btnAction: ButtonAction, ctx: ActionContext) => void> = {
  FLIP_LEFT: (btnAction, ctx) => {
    ctx.state.leftTarget = btnAction === "DOWN" ? 1 : 0;
  },
  FLIP_RIGHT: (btnAction, ctx) => {
    ctx.state.rightTarget = btnAction === "DOWN" ? 1 : 0;
  },
  PLUNGE: handlePlunge,
  START: (btnAction, ctx) => {
    if (btnAction === "DOWN" && ctx.getGameState() === "game_over") ctx.restartWorkflow();
  },
};

export function createApplyAction(deps: ApplyActionDeps) {
  const plunger = createPlungerInput({
    state: deps.state,
    now: deps.now,
    startPlungerCharge: deps.startPlungerCharge,
    launchBall: deps.launchBall,
    setPlungerCharge: deps.setPlungerCharge,
  });

  const ctx: ActionContext = {
    state: deps.state,
    getGameState: deps.getGameState,
    isPhysicsReady: deps.isPhysicsReady,
    restartWorkflow: deps.restartWorkflow,
    plunger,
    debugLog: deps.debugLog,
  };

  return function applyAction(action: GameAction, btnAction: ButtonAction): void {
    if (!deps.isSessionStarted()) {
      if (btnAction === "DOWN" && deps.isPhysicsReady() && SESSION_START_ACTIONS.has(action)) {
        deps.beginSession();
        if (action === "PLUNGE" && deps.getGameState() === "idle") plunger.beginCharge();
      }
      return;
    }

    ACTION_HANDLERS[action](btnAction, ctx);
  };
}
