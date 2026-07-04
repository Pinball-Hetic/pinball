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
  /** map counters (mapStateExtraRef.current) — only numbers go to the leaderboard */
  getMapCounters: () => Record<string, number | boolean>;
  setFinalScore: (score: number) => void;
  clearClaimQr: () => void;
  /** reset hooks run on the return to idle (replay) */
  resetCinematics: () => void;
  resetAudio: () => void;
  resetMapModule: () => void;
  openShooterLaneGate: () => void;
}

/**
 * useGameState → DMD/backglass callbacks: score snapshots, display priority
 * (EVENT > MULTI > COMBO), lives, game over (stats + map counters),
 * intro/reset. Deps are resolved LAZILY via `getDeps()` at call time
 * (post-render) — required: several collaborators (snapshot,
 * mapStateExtraRef…) are declared AFTER the useGameState call in the
 * component (TDZ at render otherwise).
 */
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

      // Every event switches the display. Exclusive, by decreasing
      // priority: labeled event → EVENT; new multiplier → MULTI; otherwise
      // ongoing combo → COMBO.
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
      // Last life in play → 1.2s breather (no freeze: ball already drained).
      if (livesRemaining === 1) d.playCinematic("last_chance");
    },

    onLifeGained: (lives) => {
      // Refresh the DMD immediately with the real counter — otherwise it
      // desyncs until the next score event (especially past 3 lives).
      const d = getDeps();
      const snap = d.snapshot({ lives });
      d.dmd.emitScoreSnapshot(snap);
      d.dmd.pushScore(snap);
    },

    onGameOver: (finalScore, stats) => {
      const d = getDeps();
      d.setFinalScore(finalScore); // the QR arrives later via game:registered (async)
      // Map counters: only numbers go to the leaderboard.
      const counters: Record<string, number> = {};
      for (const [k, v] of Object.entries(d.getMapCounters())) {
        if (typeof v === "number") counters[k] = v;
      }
      // No GAME_OVER display on the DMD: keep the last SCORE until the
      // reset (INTRO). emitGameOver feeds the backglass/leaderboard.
      d.dmd.emitGameOver(d.playerRef.current, finalScore, d.mapId, { ...stats, counters });
      // Pushed on EVERY game over; the backglass knows the rank → fanfare or recap.
      d.dmd.pushCinematic("hall_of_fame");
    },

    onGameStart: () => {
      const d = getDeps();
      d.clearClaimQr(); // avoids a stale QR flashing on the next game
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
      // Re-emit a fever:false snapshot so DMD/backglass settle back.
      const d = getDeps();
      const snap = d.snapshot({ mapState: d.buildMapState(false) });
      d.dmd.emitScoreSnapshot(snap);
      d.dmd.pushScore(snap);
    },
  };
}
