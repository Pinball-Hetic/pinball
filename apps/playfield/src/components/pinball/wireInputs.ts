import type { MutableRefObject } from "react";
import type {
  ButtonAction,
  ButtonId,
  ButtonInput,
  GameAction,
} from "@pinball/shared-types";
import { BUTTON_ACTION } from "@pinball/shared-types";
import type { GameEvent, CollisionEventProcessor } from "@pinball/game-engine";
import type { DevGameEventTrigger } from "@pinball/shared-types";
import { toGameEvent } from "./toGameEvent";
import type { ResolvedMap } from "@pinball/maps";
import type { GameState } from "@/hooks/useGameState";

type KeyboardMode = "direct" | "simulate-esp32" | "disabled";
type Bosses = ResolvedMap["layout"]["bosses"];

export const RESET_CHORD: readonly ButtonId[] = [
  "FRONT_LEFT_GREEN",
  "FRONT_LEFT_YELLOW",
  "FRONT_LEFT_RED",
];

export function createButtonChord(ids: readonly ButtonId[], onFire: () => void) {
  const down = new Set<ButtonId>();
  let fired = false;
  return (data: ButtonInput): void => {
    if (!ids.includes(data.id)) return;
    if (data.action === "DOWN") down.add(data.id);
    else down.delete(data.id);
    const all = down.size === ids.length;
    if (all && !fired) {
      fired = true;
      onFire();
    } else if (!all) {
      fired = false;
    }
  };
}

export interface PhysicalInputHandlersDeps {
  applyAction: (action: GameAction, btnAction: ButtonAction) => void;
  emit: (e: GameEvent) => void;
  mapBosses: Bosses;
  getCollisionProcessor: () => CollisionEventProcessor | null;
  getGameState: () => GameState;
  onCheatReset: () => void;
}

export function createPhysicalInputHandlers(d: PhysicalInputHandlersDeps) {
  const resetChord = createButtonChord(RESET_CHORD, d.onCheatReset);
  return {
    onButton: (data: ButtonInput) => {
      // Chord runs before the unmapped-button drop — its buttons have no action.
      resetChord(data);
      const action = BUTTON_ACTION[data.id];
      if (!action) return;
      d.applyAction(action, data.action);
    },
    onTilt: (data: unknown) => {
      console.log("[playfield] tilt reçu:", data, "— logique non implémentée");
    },
    onSensor: (data: unknown) => {
      console.log("[playfield] sensor reçu:", data, "— logique non implémentée");
    },
    onDevEvent: (trigger: DevGameEventTrigger) => {
      // Boss via the real state path, not a raw emit — else ghost boss
      // (visuals play but the fight is never armed).
      if (trigger.type === "BOSS_REVEAL" || trigger.type === "BOSS_TARGET_HIT") {
        const processor = d.getCollisionProcessor();
        const bossId = trigger.bossId ?? d.mapBosses[0]?.id;
        if (!processor || !bossId) return;
        const gameState = d.getGameState();
        if (trigger.type === "BOSS_REVEAL") {
          processor.debugRevealBoss(bossId, gameState);
        } else {
          const hits = Math.max(1, trigger.hitCount ?? 1);
          for (let i = 0; i < hits; i++) processor.debugBossTargetHit(bossId, gameState);
        }
        return;
      }
      const ev = toGameEvent(trigger, d.mapBosses);
      if (ev) d.emit(ev);
    },
  };
}

export interface DispatchButtonDeps {
  mode: KeyboardMode;
  isConnectedRef: MutableRefObject<boolean>;
  simulateButton: (data: { id: ButtonId; action: ButtonAction }) => void;
  onButton: (data: { id: ButtonId; action: ButtonAction }) => void;
}

export function createDispatchButton(deps: DispatchButtonDeps) {
  return (id: ButtonId, action: ButtonAction): void => {
    if (deps.mode === "disabled") return;
    if (deps.mode === "simulate-esp32") {
      if (deps.isConnectedRef.current) {
        deps.simulateButton({ id, action });
      } else {
        deps.onButton({ id, action });
      }
      return;
    }
    deps.onButton({ id, action });
  };
}
