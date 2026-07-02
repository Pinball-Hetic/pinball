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
  /** compteurs map (mapStateExtraRef.current) — seuls les numbers partent au leaderboard */
  getMapCounters: () => Record<string, number | boolean>;
  setFinalScore: (score: number) => void;
  clearClaimQr: () => void;
  /** hooks de remise à zéro jouées au retour idle (replay) */
  resetCinematics: () => void;
  resetAudio: () => void;
  resetMapModule: () => void;
  openShooterLaneGate: () => void;
}

/**
 * Callbacks useGameState → DMD/backglass : snapshots de score, priorité
 * d'affichage (EVENT > MULTI > COMBO), vies, game over (stats + counters map),
 * intro/reset. Déps résolues PARESSEUSEMENT via `getDeps()` à l'invocation
 * (post-render) — indispensable : plusieurs collaborateurs (snapshot,
 * mapStateExtraRef…) sont déclarés APRÈS l'appel useGameState dans le
 * composant (TDZ au render sinon). Extrait + testé (spies).
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

      // Chaque event fait switcher l'affichage. Exclusif, par priorité
      // décroissante : event labellisé → EVENT ; nouveau multiplier →
      // MULTI ; sinon combo en cours → COMBO.
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
      // Dernière vie engagée → respiration 1.2s (pas de gel : bille déjà drainée).
      if (livesRemaining === 1) d.playCinematic("last_chance");
    },

    onLifeGained: (lives) => {
      // Rafraîchir immédiatement le DMD avec le vrai compteur — sinon désync
      // jusqu'au prochain event de score (surtout au-delà de 3 vies).
      const d = getDeps();
      const snap = d.snapshot({ lives });
      d.dmd.emitScoreSnapshot(snap);
      d.dmd.pushScore(snap);
    },

    onGameOver: (finalScore, stats) => {
      const d = getDeps();
      d.setFinalScore(finalScore); // le QR arrive ensuite via game:registered (async)
      // Counters map : seuls les numbers partent au leaderboard.
      const counters: Record<string, number> = {};
      for (const [k, v] of Object.entries(d.getMapCounters())) {
        if (typeof v === "number") counters[k] = v;
      }
      // Pas d'affichage GAME_OVER sur le DMD : on garde le dernier SCORE
      // jusqu'au reset (INTRO). emitGameOver sert au backglass/leaderboard.
      d.dmd.emitGameOver(d.playerRef.current, finalScore, d.mapId, { ...stats, counters });
      // Poussé à CHAQUE game over ; le backglass connaît le rang → fanfare ou recap.
      d.dmd.pushCinematic("hall_of_fame");
    },

    onGameStart: () => {
      const d = getDeps();
      d.clearClaimQr(); // évite un QR périmé qui flashe sur la partie suivante
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
      // Re-émet un snapshot fever:false pour que DMD/backglass retombent.
      const d = getDeps();
      const snap = d.snapshot({ mapState: d.buildMapState(false) });
      d.dmd.emitScoreSnapshot(snap);
      d.dmd.pushScore(snap);
    },
  };
}
