import {
  getBossById,
  PORTAL_ENTER_SCORE,
  ASSIST_SCORE,
  SCORE_BUMPER,
  SCORE_SLINGSHOT,
  SCORE_RAMP,
  SCORE_DROP_COMPLETE,
  type GameEvent,
} from "@pinball/game-engine";
import { type ResolvedMap } from "@pinball/maps";
import type { DevGameEventTrigger } from "@pinball/shared-types";

export function toGameEvent(d: DevGameEventTrigger, mapBosses: ResolvedMap['layout']['bosses']): GameEvent | null {
  switch (d.type) {
    case "BUMPER_HIT":
      return { type: "BUMPER_HIT", bumperIndex: 0, scoreIncrement: SCORE_BUMPER };
    case "SLINGSHOT_HIT":
      return { type: "SLINGSHOT_HIT", side: "left", scoreIncrement: SCORE_SLINGSHOT };
    case "RAMP_HIT":
      return { type: "RAMP_HIT", scoreIncrement: SCORE_RAMP };
    case "DROP_TARGET_COMPLETE":
      return { type: "DROP_TARGET_COMPLETE", side: "left", scoreIncrement: SCORE_DROP_COMPLETE };
    case "BOSS_REVEAL": {
      const bossId = d.bossId ?? mapBosses[0]?.id ?? "";
      return {
        type: "BOSS_REVEAL",
        bossId,
        scoreIncrement: getBossById(mapBosses, bossId)?.reveal.scoreIncrement ?? 150,
      };
    }
    case "BOSS_TARGET_HIT": {
      const bossId = d.bossId ?? mapBosses[0]?.id ?? "";
      return {
        type: "BOSS_TARGET_HIT",
        bossId,
        hitCount: d.hitCount ?? 1,
        scoreIncrement: getBossById(mapBosses, bossId)?.scoreTargetHit ?? 250,
      };
    }
    case "PORTAL_ENTER":
      return { type: "PORTAL_ENTER", scoreIncrement: PORTAL_ENTER_SCORE };
    case "ASSIST":
      return { type: "ASSIST", assistId: "assist", scoreIncrement: ASSIST_SCORE };
    case "DEBUG_ADD_SCORE":
      return { type: "ZONE_HIT", zone: "debug", scoreIncrement: d.amount ?? 1000 };
    case "DRAIN":
      return { type: "DRAIN" };
    case "BOTTOM_OUT":
      return { type: "BOTTOM_OUT" };
    case "BALL_LAUNCHED":
      return { type: "BALL_LAUNCHED" };
    default: {
      const _exhaustive: never = d.type;
      void _exhaustive;
      return null;
    }
  }
}
