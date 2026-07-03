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

// Boutons du cheat-code reset-bille : les 3 boutons de façade gauche (non
// mappés à une action jeu) pressés SIMULTANÉMENT → reset de la bille. Secours
// borne quand la bille est coincée hors de portée du stuck-detector.
export const RESET_CHORD: readonly ButtonId[] = [
  "FRONT_LEFT_GREEN",
  "FRONT_LEFT_YELLOW",
  "FRONT_LEFT_RED",
];

/**
 * Détecteur d'accord (chord) : suit l'état DOWN/UP des boutons donnés et tire
 * `onFire` sur le FRONT MONTANT du « tous enfoncés ». Ne re-tire pas tant
 * qu'au moins un bouton n'est pas relâché (pas de répétition en maintien). Pur.
 */
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
  /** live — assigné après le câblage gameplay ; requis pour les triggers boss debug */
  getCollisionProcessor: () => CollisionEventProcessor | null;
  getGameState: () => GameState;
  /** cheat-code RESET_CHORD (3 boutons façade gauche simultanés) → reset bille */
  onCheatReset: () => void;
}

// Handlers des events physiques réseau (input:*). onButton traduit l'id
// physique → action jeu via BUTTON_ACTION (drop si non mappé) puis délègue à
// applyAction (source de vérité unique). onDevEvent injecte dans le emit
// EXISTANT → chaîne complète (cinématiques, gel, DMD, backglass) ;
// DRAIN/BOTTOM_OUT passent par les vrais use-cases. Tilt/sensor : loggés
// (logique non implémentée — TODO Fliphetic).
export function createPhysicalInputHandlers(d: PhysicalInputHandlersDeps) {
  const resetChord = createButtonChord(RESET_CHORD, d.onCheatReset);
  return {
    onButton: (data: ButtonInput) => {
      // Cheat-code AVANT le filtre « non mappé » : les boutons de l'accord
      // n'ont volontairement pas d'action jeu.
      resetChord(data);
      const action = BUTTON_ACTION[data.id];
      if (!action) return; // bouton physique non mappé → ignoré
      d.applyAction(action, data.action);
    },
    onTilt: (data: unknown) => {
      console.log("[playfield] tilt reçu:", data, "— logique non implémentée");
    },
    onSensor: (data: unknown) => {
      console.log("[playfield] sensor reçu:", data, "— logique non implémentée");
    },
    onDevEvent: (trigger: DevGameEventTrigger) => {
      // Triggers boss : passent par le VRAI chemin d'état (BossFightManager via
      // le processor), pas par un event brut — sinon boss fantôme (visuels
      // joués mais combat jamais armé → aucune interaction avec les billes).
      if (trigger.type === "BOSS_REVEAL" || trigger.type === "BOSS_TARGET_HIT") {
        const processor = d.getCollisionProcessor();
        const bossId = trigger.bossId ?? d.mapBosses[0]?.id;
        if (!processor || !bossId) return;
        const gameState = d.getGameState();
        if (trigger.type === "BOSS_REVEAL") {
          processor.debugRevealBoss(bossId, gameState);
        } else {
          // hitCount N = N vrais hits (le sensor gère maxHits/défaite).
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
  /** handler local (mode direct + fallback simulate sans socket) */
  onButton: (data: { id: ButtonId; action: ButtonAction }) => void;
}

// Route un bouton (clavier dev) selon le mode : direct → handler local ;
// simulate-esp32 → boucle réseau complète via le server (fallback local si le
// socket n'est pas prêt — évite un plongeur mort) ; disabled → ignoré.
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
