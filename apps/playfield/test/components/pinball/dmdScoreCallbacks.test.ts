import { test, expect, describe, mock } from "bun:test";
import type { ScoreUpdate } from "@pinball/shared-types";
import { createDmdScoreCallbacks, type DmdScoreCallbackDeps } from "../../../src/components/pinball/dmdScoreCallbacks";

const SNAP: ScoreUpdate = {
  player: "P1",
  score: 1200,
  combo: 4,
  multiplier: 2,
  lives: 2,
  mapState: { fever: false },
};

function harness(over: Partial<DmdScoreCallbackDeps> = {}) {
  const dmd = {
    emitScoreSnapshot: mock(() => {}),
    pushScore: mock(() => {}),
    pushEvent: mock(() => {}),
    pushMultiFlash: mock(() => {}),
    pushComboFlash: mock(() => {}),
    pushLifeLost: mock(() => {}),
    emitGameOver: mock(() => {}),
    pushCinematic: mock(() => {}),
    emitGameStart: mock(() => {}),
    pushIntro: mock(() => {}),
    setAtmosphere: mock(() => {}),
  };
  const calls = {
    playCinematic: [] as string[],
    setFinalScore: [] as number[],
    clearClaimQr: 0,
    resets: [] as string[],
  };
  const deps: DmdScoreCallbackDeps = {
    dmd: dmd as unknown as DmdScoreCallbackDeps["dmd"],
    mapBosses: [],
    mapId: "strangerthings",
    snapshot: (o = {}) => ({ ...SNAP, ...o }),
    buildMapState: (fever) => ({ fever }),
    playCinematic: (c) => calls.playCinematic.push(c),
    playerRef: { current: "P1" },
    scoreRef: { current: 1200 },
    atmosphereAlternateRef: { current: false },
    getMapCounters: () => ({ hetic: 3, fever: true }),
    setFinalScore: (s) => calls.setFinalScore.push(s),
    clearClaimQr: () => (calls.clearClaimQr += 1),
    resetCinematics: () => calls.resets.push("cine"),
    resetAudio: () => calls.resets.push("audio"),
    resetMapModule: () => calls.resets.push("map"),
    openShooterLaneGate: () => calls.resets.push("gate"),
    ...over,
  };
  const cb = createDmdScoreCallbacks(() => deps);
  return { cb, dmd, calls, deps };
}

const scoreEvent = (over: Record<string, unknown> = {}) => ({
  event: { type: "BUMPER_HIT" as const, bumperIndex: 0, scoreIncrement: 100 },
  finalPoints: 100,
  previousCombo: 3,
  newCombo: 4,
  previousMultiplier: 2,
  newMultiplier: 2,
  ...over,
});

describe("onScoreEvent — priorité d'affichage", () => {
  test("snapshot toujours émis + poussé", () => {
    const h = harness();
    h.cb.onScoreEvent!(scoreEvent());
    expect(h.dmd.emitScoreSnapshot).toHaveBeenCalledTimes(1);
    expect(h.dmd.pushScore).toHaveBeenCalledTimes(1);
  });

  test("event labellisé (RAMP) → pushEvent, pas multi/combo", () => {
    const h = harness();
    h.cb.onScoreEvent!(
      scoreEvent({
        event: { type: "RAMP_HIT", scoreIncrement: 100 },
        previousMultiplier: 1,
        newMultiplier: 2, // even with multiplier changed, the label wins
      }),
    );
    expect(h.dmd.pushEvent).toHaveBeenCalledTimes(1);
    expect(h.dmd.pushMultiFlash).not.toHaveBeenCalled();
    expect(h.dmd.pushComboFlash).not.toHaveBeenCalled();
  });

  test("sans label + multiplier changé → pushMultiFlash", () => {
    const h = harness();
    h.cb.onScoreEvent!(
      scoreEvent({
        event: { type: "ZONE_HIT", zone: "", scoreIncrement: 10 },
        previousMultiplier: 1,
        newMultiplier: 2,
      }),
    );
    expect(h.dmd.pushMultiFlash).toHaveBeenCalledTimes(1);
    expect(h.dmd.pushComboFlash).not.toHaveBeenCalled();
  });

  test("sans label ni multi, combo > 1 → pushComboFlash", () => {
    const h = harness();
    h.cb.onScoreEvent!(scoreEvent({ event: { type: "ZONE_HIT", zone: "", scoreIncrement: 10 } }));
    expect(h.dmd.pushComboFlash).toHaveBeenCalledTimes(1);
  });
});

describe("onLifeLost", () => {
  test("snapshot combo/multi reset + pushLifeLost", () => {
    const h = harness();
    h.cb.onLifeLost!(2);
    const snap = h.dmd.emitScoreSnapshot.mock.calls[0][0] as ScoreUpdate;
    expect(snap.combo).toBe(0);
    expect(snap.multiplier).toBe(1);
    expect(snap.lives).toBe(2);
    expect(h.calls.playCinematic).toEqual([]);
  });

  test("dernière vie → cinématique last_chance", () => {
    const h = harness();
    h.cb.onLifeLost!(1);
    expect(h.calls.playCinematic).toEqual(["last_chance"]);
  });
});

describe("onGameOver", () => {
  test("counters : seuls les numbers du mapState partent au leaderboard", () => {
    const h = harness();
    h.cb.onGameOver!(5000, { maxCombo: 8, maxMultiplier: 3, counters: {}, durationS: 60 });
    expect(h.calls.setFinalScore).toEqual([5000]);
    const [player, score, mapId, stats] = h.dmd.emitGameOver.mock.calls[0] as unknown[];
    expect(player).toBe("P1");
    expect(score).toBe(5000);
    expect(mapId).toBe("strangerthings");
    expect((stats as { counters: Record<string, number> }).counters).toEqual({ hetic: 3 });
    expect(h.dmd.pushCinematic).toHaveBeenCalledWith("hall_of_fame");
  });
});

describe("onGameStart / onIdleReset / onFeverEnd", () => {
  test("onGameStart : purge le QR périmé + snapshot combo/multi reset", () => {
    const h = harness();
    h.cb.onGameStart!();
    expect(h.calls.clearClaimQr).toBe(1);
    const snap = h.dmd.emitScoreSnapshot.mock.calls[0][0] as ScoreUpdate;
    expect(snap.combo).toBe(0);
    expect(snap.multiplier).toBe(1);
  });

  test("onIdleReset : joue tous les hooks de reset + snapshot vierge", () => {
    const h = harness();
    h.cb.onIdleReset!();
    expect(h.calls.resets).toEqual(["cine", "audio", "map", "gate"]);
    expect(h.dmd.pushIntro).toHaveBeenCalledTimes(1);
    const snap = h.dmd.emitScoreSnapshot.mock.calls[0][0] as ScoreUpdate;
    expect(snap.score).toBe(0);
    expect(snap.lives).toBe(3);
    expect(snap.mapState).toEqual({ fever: false });
  });

  test("onFeverEnd : re-snapshot fever:false", () => {
    const h = harness();
    h.cb.onFeverEnd!();
    const snap = h.dmd.emitScoreSnapshot.mock.calls[0][0] as ScoreUpdate;
    expect(snap.mapState).toEqual({ fever: false });
    expect(h.dmd.pushScore).toHaveBeenCalledTimes(1);
  });
});

describe("onAtmosphereChange", () => {
  test("propage au DMD + met à jour la ref atmosphère", () => {
    const h = harness();
    h.cb.onAtmosphereChange!(true);
    expect(h.dmd.setAtmosphere).toHaveBeenCalledWith(true);
    expect(h.deps.atmosphereAlternateRef.current).toBe(true);
  });
});
