import type { GameAction, ButtonAction } from "@pinball/shared-types";
import { plungerChargeProgress, plungerLaunchFactor } from "@pinball/game-engine";
import type { GameState } from "@/hooks/useGameState";

// État d'entrée mutable PARTAGÉ entre le routeur d'actions (createApplyAction)
// et la boucle animate (swing flippers + physique plunger). Un seul objet
// possédé par la closure d'init → pas de `let` éparpillés.
export type PlungerState = "idle" | "charging" | "releasing" | "returning";

export interface InputState {
  /** cible de swing flipper gauche : 1 = appuyé, 0 = relâché */
  leftTarget: number;
  /** cible de swing flipper droit : 1 = appuyé, 0 = relâché */
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
  /** horloge injectée (performance.now en prod) → testable */
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
  /** sortie outro/game-over → reload → sélecteur de map */
  restartWorkflow: () => void;
  debugLog: (...args: unknown[]) => void;
}

/**
 * Traduit une action de jeu (FLIP_LEFT/RIGHT, PLUNGE, START) en effets sur le
 * game loop. Source de vérité UNIQUE des effets d'entrée — appelée aussi bien
 * par les events réseau `input:button` que par le clavier dev. Keyé sur
 * l'ACTION (pas l'id physique) ; l'adaptateur ButtonId→GameAction vit en amont.
 *
 * Aucune dépendance Three.js / React : toute la collaboration passe par `deps`
 * (getters d'état, callbacks, horloge injectée) → unit-testable.
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
    // Avant le début de session : seuls PLUNGE/START (DOWN, physique prête)
    // démarrent la partie. PLUNGE en idle amorce aussi la charge du plongeur.
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
