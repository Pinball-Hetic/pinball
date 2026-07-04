import { describe, expect, it } from "bun:test";
import {
  PORTAL_ENTER_SCORE,
  ASSIST_SCORE,
  SCORE_BUMPER,
  SCORE_SLINGSHOT,
  SCORE_RAMP,
  SCORE_DROP_COMPLETE,
} from "@pinball/game-engine";
import type { ResolvedMap } from "@pinball/maps";
import type { DevGameEventTrigger } from "@pinball/shared-types";
import { toGameEvent } from "./toGameEvent";

type Bosses = ResolvedMap["layout"]["bosses"];

// Minimal boss objects: toGameEvent only reads `id`, `reveal.scoreIncrement`
// and `scoreTargetHit`. Cast through `unknown` to satisfy the full type
// without rebuilding the heavy BossDefinition shape.
function bosses(...entries: Array<{ id: string; reveal: number; targetHit: number }>): Bosses {
  return entries.map((e) => ({
    id: e.id,
    reveal: { scoreIncrement: e.reveal },
    scoreTargetHit: e.targetHit,
  })) as unknown as Bosses;
}

const NO_BOSSES: Bosses = bosses();
const TWO_BOSSES: Bosses = bosses(
  { id: "demogorgon", reveal: 999, targetHit: 777 },
  { id: "mindflayer", reveal: 111, targetHit: 222 },
);

describe("toGameEvent", () => {
  it("maps BUMPER_HIT with default bumper index + score", () => {
    expect(toGameEvent({ type: "BUMPER_HIT" }, NO_BOSSES)).toEqual({
      type: "BUMPER_HIT",
      bumperIndex: 0,
      scoreIncrement: SCORE_BUMPER,
    });
  });

  it("maps SLINGSHOT_HIT (left, score)", () => {
    expect(toGameEvent({ type: "SLINGSHOT_HIT" }, NO_BOSSES)).toEqual({
      type: "SLINGSHOT_HIT",
      side: "left",
      scoreIncrement: SCORE_SLINGSHOT,
    });
  });

  it("maps RAMP_HIT", () => {
    expect(toGameEvent({ type: "RAMP_HIT" }, NO_BOSSES)).toEqual({
      type: "RAMP_HIT",
      scoreIncrement: SCORE_RAMP,
    });
  });

  it("maps DROP_TARGET_COMPLETE (left, score)", () => {
    expect(toGameEvent({ type: "DROP_TARGET_COMPLETE" }, NO_BOSSES)).toEqual({
      type: "DROP_TARGET_COMPLETE",
      side: "left",
      scoreIncrement: SCORE_DROP_COMPLETE,
    });
  });

  it("maps PORTAL_ENTER", () => {
    expect(toGameEvent({ type: "PORTAL_ENTER" }, NO_BOSSES)).toEqual({
      type: "PORTAL_ENTER",
      scoreIncrement: PORTAL_ENTER_SCORE,
    });
  });

  it("maps ASSIST with fixed assistId", () => {
    expect(toGameEvent({ type: "ASSIST" }, NO_BOSSES)).toEqual({
      type: "ASSIST",
      assistId: "assist",
      scoreIncrement: ASSIST_SCORE,
    });
  });

  it("maps DEBUG_ADD_SCORE to a ZONE_HIT with the requested amount", () => {
    expect(toGameEvent({ type: "DEBUG_ADD_SCORE", amount: 4242 }, NO_BOSSES)).toEqual({
      type: "ZONE_HIT",
      zone: "debug",
      scoreIncrement: 4242,
    });
  });

  it("maps DEBUG_ADD_SCORE with default amount when omitted", () => {
    expect(toGameEvent({ type: "DEBUG_ADD_SCORE" }, NO_BOSSES)).toEqual({
      type: "ZONE_HIT",
      zone: "debug",
      scoreIncrement: 1000,
    });
  });

  it("maps DRAIN", () => {
    expect(toGameEvent({ type: "DRAIN" }, NO_BOSSES)).toEqual({ type: "DRAIN" });
  });

  it("maps BOTTOM_OUT", () => {
    expect(toGameEvent({ type: "BOTTOM_OUT" }, NO_BOSSES)).toEqual({ type: "BOTTOM_OUT" });
  });

  it("maps BALL_LAUNCHED", () => {
    expect(toGameEvent({ type: "BALL_LAUNCHED" }, NO_BOSSES)).toEqual({ type: "BALL_LAUNCHED" });
  });

  describe("BOSS_REVEAL", () => {
    it("uses the explicit bossId and its reveal score", () => {
      expect(toGameEvent({ type: "BOSS_REVEAL", bossId: "mindflayer" }, TWO_BOSSES)).toEqual({
        type: "BOSS_REVEAL",
        bossId: "mindflayer",
        scoreIncrement: 111,
      });
    });

    it("falls back to the first boss id when bossId omitted", () => {
      expect(toGameEvent({ type: "BOSS_REVEAL" }, TWO_BOSSES)).toEqual({
        type: "BOSS_REVEAL",
        bossId: "demogorgon",
        scoreIncrement: 999,
      });
    });

    it("falls back to empty id and default reveal score when no bosses", () => {
      expect(toGameEvent({ type: "BOSS_REVEAL" }, NO_BOSSES)).toEqual({
        type: "BOSS_REVEAL",
        bossId: "",
        scoreIncrement: 150,
      });
    });

    it("uses default reveal score when bossId is unknown", () => {
      expect(toGameEvent({ type: "BOSS_REVEAL", bossId: "ghost" }, TWO_BOSSES)).toEqual({
        type: "BOSS_REVEAL",
        bossId: "ghost",
        scoreIncrement: 150,
      });
    });
  });

  describe("BOSS_TARGET_HIT", () => {
    it("uses explicit bossId, hitCount and target-hit score", () => {
      expect(
        toGameEvent({ type: "BOSS_TARGET_HIT", bossId: "mindflayer", hitCount: 3 }, TWO_BOSSES),
      ).toEqual({
        type: "BOSS_TARGET_HIT",
        bossId: "mindflayer",
        hitCount: 3,
        scoreIncrement: 222,
      });
    });

    it("falls back to first boss + hitCount 1 when omitted", () => {
      expect(toGameEvent({ type: "BOSS_TARGET_HIT" }, TWO_BOSSES)).toEqual({
        type: "BOSS_TARGET_HIT",
        bossId: "demogorgon",
        hitCount: 1,
        scoreIncrement: 777,
      });
    });

    it("falls back to empty id + default target-hit score when no bosses", () => {
      expect(toGameEvent({ type: "BOSS_TARGET_HIT" }, NO_BOSSES)).toEqual({
        type: "BOSS_TARGET_HIT",
        bossId: "",
        hitCount: 1,
        scoreIncrement: 250,
      });
    });

    it("uses default target-hit score when bossId is unknown", () => {
      expect(toGameEvent({ type: "BOSS_TARGET_HIT", bossId: "ghost" }, TWO_BOSSES)).toEqual({
        type: "BOSS_TARGET_HIT",
        bossId: "ghost",
        hitCount: 1,
        scoreIncrement: 250,
      });
    });
  });

  it("returns null for an unmapped/unknown trigger type (default branch)", () => {
    expect(
      toGameEvent({ type: "TOTALLY_UNKNOWN" } as unknown as DevGameEventTrigger, NO_BOSSES),
    ).toBeNull();
  });

  // Exhaustiveness net: this record is keyed by EVERY DevGameEventTrigger.type.
  // Adding a new type to the union without listing it here fails typecheck
  // (missing key); the runtime loop then asserts each maps to a non-null event,
  // so a forgotten switch case in toGameEvent is caught at test time too.
  const ALL_TYPES: Record<DevGameEventTrigger["type"], true> = {
    BUMPER_HIT: true,
    SLINGSHOT_HIT: true,
    RAMP_HIT: true,
    DROP_TARGET_COMPLETE: true,
    BOSS_REVEAL: true,
    BOSS_TARGET_HIT: true,
    PORTAL_ENTER: true,
    DRAIN: true,
    BOTTOM_OUT: true,
    BALL_LAUNCHED: true,
    ASSIST: true,
    DEBUG_ADD_SCORE: true,
  };

  it.each(Object.keys(ALL_TYPES) as Array<DevGameEventTrigger["type"]>)(
    "maps every trigger type to a non-null GameEvent: %s",
    (type) => {
      expect(toGameEvent({ type }, TWO_BOSSES)).not.toBeNull();
    },
  );
});
