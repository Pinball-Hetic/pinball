import type { MutableRefObject } from "react";
import type { ScoreUpdate, MapState, CinematicClip } from "@pinball/shared-types";
import type { ResolvedMap } from "@pinball/maps";
import type { ScoringCallbacks } from "@/hooks/useGameState";
import { useDmdOrchestrator, eventLabel } from "@/hooks/useDmdOrchestrator";

type Dmd = ReturnType<typeof useDmdOrchestrator>;
type Bosses = ResolvedMap["layout"]["bosses"];

export interface DmdScoreCallbackDeps {
  dmd: Dmd;
  mapBosses: Bosses;
  mapId: string;
  snapshot: (over?: Partial<ScoreUpdate>) => ScoreUpdate;
  buildMapState: (fever: boolean) => MapState;
  playCinematic: (clip: CinematicClip) => void;
  playerRef: MutableRefObject<string>;
  scoreRef: MutableRefObject<number>;
  atmosphereAlternateRef: MutableRefObject<boolean>;
  getMapCounters: () => Record<string, number | boolean>;
  setFinalScore: (score: number) => void;
  clearClaimQr: () => void;
  resetCinematics: () => void;
  resetAudio: () => void;
  resetMapModule: () => void;
  openShooterLaneGate: () => void;
}

// Deps are resolved lazily via `getDeps()` at call time: several collaborators
// (snapshot, mapStateExtraRef…) are declared AFTER the useGameState call, so
// reading them at render would hit a TDZ error.
export function createDmdScoreCallbacks(
  getDeps: () => DmdScoreCallbackDeps,
): Pick<
  ScoringCallbacks,
  | "onScoreEvent"
  | "onLifeLost"
  | "onLifeGained"
  | "onGameOver"
  | "onGameStart"
  | "onIdleReset"
  | "onAtmosphereChange"
  | "onFeverEnd"
> {
  return {
    onScoreEvent: ({ event, finalPoints, previousMultiplier, newMultiplier }) => {
      const d = getDeps();
      const snap = d.snapshot();
      d.dmd.emitScoreSnapshot(snap);
      d.dmd.pushScore(snap);

      const label = eventLabel(event, d.mapBosses);
      if (label) {
        d.dmd.pushEvent(label, finalPoints, snap);
      } else if (previousMultiplier !== newMultiplier) {
        d.dmd.pushMultiFlash(newMultiplier, snap.combo, snap);
      } else if (snap.combo > 1) {
        d.dmd.pushComboFlash(snap.combo, snap.multiplier, snap);
      }
    },

    onLifeLost: (livesRemaining) => {
      const d = getDeps();
      d.dmd.emitScoreSnapshot(d.snapshot({ combo: 0, multiplier: 1, lives: livesRemaining }));
      d.dmd.pushLifeLost(livesRemaining, d.scoreRef.current, d.playerRef.current);
      if (livesRemaining === 1) d.playCinematic("last_chance");
    },

    onLifeGained: (lives) => {
      const d = getDeps();
      const snap = d.snapshot({ lives });
      d.dmd.emitScoreSnapshot(snap);
      d.dmd.pushScore(snap);
    },

    onGameOver: (finalScore, stats) => {
      const d = getDeps();
      d.setFinalScore(finalScore);
      const counters: Record<string, number> = {};
      for (const [k, v] of Object.entries(d.getMapCounters())) {
        if (typeof v === "number") counters[k] = v;
      }
      d.dmd.emitGameOver(d.playerRef.current, finalScore, d.mapId, { ...stats, counters });
      d.dmd.pushCinematic("hall_of_fame");
    },

    onGameStart: () => {
      const d = getDeps();
      d.clearClaimQr();
      d.dmd.emitGameStart(d.playerRef.current);
      const snap = d.snapshot({ combo: 0, multiplier: 1 });
      d.dmd.emitScoreSnapshot(snap);
      d.dmd.pushScore(snap);
    },

    onIdleReset: () => {
      const d = getDeps();
      d.resetCinematics();
      d.resetAudio();
      d.resetMapModule();
      d.openShooterLaneGate();
      d.dmd.pushIntro(d.playerRef.current);
      d.dmd.emitScoreSnapshot(
        d.snapshot({ score: 0, combo: 0, multiplier: 1, lives: 3, mapState: d.buildMapState(false) }),
      );
    },

    onAtmosphereChange: (alternateWorldActive) => {
      const d = getDeps();
      d.dmd.setAtmosphere(alternateWorldActive);
      d.atmosphereAlternateRef.current = alternateWorldActive;
    },

    onFeverEnd: () => {
      const d = getDeps();
      const snap = d.snapshot({ mapState: d.buildMapState(false) });
      d.dmd.emitScoreSnapshot(snap);
      d.dmd.pushScore(snap);
    },
  };
}
