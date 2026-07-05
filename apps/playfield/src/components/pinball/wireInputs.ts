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

// Cheat code: 3 unmapped left-facade buttons pressed together → ball reset.
// Cabinet rescue when the ball is stuck out of the stuck-detector's reach.
export const RESET_CHORD: readonly ButtonId[] = [
  "FRONT_LEFT_GREEN",
  "FRONT_LEFT_YELLOW",
  "FRONT_LEFT_RED",
];

// Fires on the RISING edge of "all pressed"; re-arms only once a button is
// released (no repeat while held).
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
  /** live — assigned after gameplay wiring; required for debug boss triggers */
  getCollisionProcessor: () => CollisionEventProcessor | null;
  getGameState: () => GameState;
  onCheatReset: () => void;
}

// Handlers for physical network events (input:*). onDevEvent reuses the real
// emit chain (cinematics/freeze/DMD/backglass, use-cases for DRAIN/BOTTOM_OUT).
// Tilt/sensor: logged only — logic not implemented (Fliphetic TODO).
export function createPhysicalInputHandlers(d: PhysicalInputHandlersDeps) {
  const resetChord = createButtonChord(RESET_CHORD, d.onCheatReset);
  return {
    onButton: (data: ButtonInput) => {
      // Cheat code BEFORE the "unmapped" filter: the chord buttons
      // intentionally have no game action.
      resetChord(data);
      const action = BUTTON_ACTION[data.id];
      if (!action) return; // unmapped physical button → ignored
      d.applyAction(action, data.action);
    },
    onTilt: (data: unknown) => {
      console.log("[playfield] tilt reçu:", data, "— logique non implémentée");
    },
    onSensor: (data: unknown) => {
      console.log("[playfield] sensor reçu:", data, "— logique non implémentée");
    },
    onDevEvent: (trigger: DevGameEventTrigger) => {
      // Boss triggers go through the REAL state path (BossFightManager via
      // the processor), not a raw event — otherwise ghost boss (visuals play
      // but the fight is never armed → no ball interaction).
      if (trigger.type === "BOSS_REVEAL" || trigger.type === "BOSS_TARGET_HIT") {
        const processor = d.getCollisionProcessor();
        const bossId = trigger.bossId ?? d.mapBosses[0]?.id;
        if (!processor || !bossId) return;
        const gameState = d.getGameState();
        if (trigger.type === "BOSS_REVEAL") {
          processor.debugRevealBoss(bossId, gameState);
        } else {
          // hitCount N = N real hits (the sensor handles maxHits/defeat).
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
  /** local handler (direct mode + simulate fallback without socket) */
  onButton: (data: { id: ButtonId; action: ButtonAction }) => void;
}

// Routes a (dev keyboard) button by mode: direct → local handler;
// simulate-esp32 → full network loop through the server (local fallback when
// the socket isn't ready — avoids a dead plunger); disabled → ignored.
export function createDispatchButton(d: DispatchButtonDeps) {
  return (id: ButtonId, action: ButtonAction): void => {
    if (d.mode === "disabled") return;
    if (d.mode === "simulate-esp32") {
      if (d.isConnectedRef.current) {
        d.simulateButton({ id, action });
      } else {
        d.onButton({ id, action });
      }
      return;
    }
    d.onButton({ id, action });
  };
}
