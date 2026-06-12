import { BOSS_IDS, getBossDefinition } from "@/map/activeMapBosses";
import type { BossHudState, ScorePop } from "../../hooks/useGameState";
import ScorePopFeedback from "./ScorePopFeedback";
import PlungerPowerBar from "./PlungerPowerBar";

export type PlayfieldBootPhase = "loading" | "attract" | "in_game";

interface GameOverlayProps {
  lives: number;
  gameState: "idle" | "playing" | "game_over";
  bootPhase: PlayfieldBootPhase;
  plungerCharge: number | null;
  onResetBall?: () => void;
  initialLives: number;
  bossHud: BossHudState;
  scorePops: ScorePop[];
  alternateWorldActive: boolean;
  upsideDownHint: boolean;
  atmosphereBannerLabel: string;
  atmosphereHintLabel: string;
  attractTagline: string;
  cabinetMode?: boolean;
  onAttractInteract?: () => void;
}

export default function GameOverlay({
  lives,
  gameState,
  bootPhase,
  plungerCharge,
  onResetBall,
  initialLives,
  bossHud,
  scorePops,
  alternateWorldActive,
  upsideDownHint,
  atmosphereBannerLabel,
  atmosphereHintLabel,
  attractTagline,
  cabinetMode = false,
  onAttractInteract,
}: GameOverlayProps) {
  void cabinetMode;

  const showHud = bootPhase === "in_game";
  const showLaunchHint =
    bootPhase === "in_game" && gameState === "idle" && plungerCharge === null;
  const showPowerBar =
    bootPhase === "in_game" && gameState === "idle" && plungerCharge !== null;
  const showGameOver = bootPhase === "in_game" && gameState === "game_over";

  const showResetBall =
    bootPhase === "in_game" && gameState !== "game_over" && plungerCharge === null;

  const showUpsideDownBanner =
    bootPhase === "in_game" && gameState === "playing" && alternateWorldActive;

  const showUpsideDownHint =
    bootPhase === "in_game" && gameState === "playing" && upsideDownHint;

  return (
    <>
      <ScorePopFeedback pops={scorePops} />

      {showHud && (
        <header className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between px-5 pt-4">
          <div className="font-mono space-y-1.5">
            <div className="flex gap-1.5 text-lg">
              {Array.from({ length: initialLives }).map((_, i) => (
                <span
                  key={i}
                  className="transition-opacity duration-300"
                  style={{ opacity: i < lives ? 1 : 0.2 }}
                >
                  ●
                </span>
              ))}
            </div>
            {showResetBall && onResetBall && (
              <button
                type="button"
                onClick={onResetBall}
                className="pointer-events-auto mt-2 rounded border border-red-500/35 bg-black/60 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-red-300/90 backdrop-blur-sm transition hover:border-red-400/50 hover:bg-black/80 hover:text-red-200 active:scale-[0.98]"
              >
                Reset balle — R (−1 vie)
              </button>
            )}
          </div>
          <div className="text-right font-mono text-[10px] text-zinc-500 space-y-0.5 leading-relaxed">
            <div>Q / ← — Flipper gauche</div>
            <div>D / → — Flipper droit</div>
            <div>ESPACE — Charger / lancer</div>
            <div>R — Reset balle (−1 vie)</div>
            <div>H — Debug colliders</div>
          </div>
        </header>
      )}

      {showUpsideDownBanner && (
        <div className="pointer-events-none absolute inset-x-0 top-[4.75rem] z-10 flex justify-center">
          <div className="rounded border border-violet-500/25 bg-black/45 px-3 py-1 font-mono backdrop-blur-sm">
            <p className="text-[10px] uppercase tracking-[0.45em] text-violet-300/80 drop-shadow-[0_0_10px_rgba(140,80,200,0.45)]">
              {atmosphereBannerLabel}
            </p>
          </div>
        </div>
      )}

      {showUpsideDownHint && (
        <div className="pointer-events-none absolute inset-x-0 bottom-24 z-10 flex justify-center px-6">
          <p className="animate-pulse text-center font-mono text-xs uppercase tracking-[0.22em] text-violet-200/75 drop-shadow-[0_0_12px_rgba(150,90,220,0.55)] sm:text-sm">
            {atmosphereHintLabel}
          </p>
        </div>
      )}

      {BOSS_IDS.map((bossId) => {
        const def = getBossDefinition(bossId);
        const hud = bossHud[bossId];
        const showBossHud =
          bootPhase === "in_game" &&
          gameState === "playing" &&
          hud.active &&
          (!def.hud.requiresAlternateWorld || alternateWorldActive);

        if (!showBossHud) return null;

        return (
          <div key={bossId}>
            {hud.assistFlash && def.hud.assistLabel && !hud.victory && (
              <div className="pointer-events-none absolute inset-x-0 top-24 z-10 flex justify-center">
                <p className="font-mono text-sm font-bold uppercase tracking-[0.25em] text-violet-300 drop-shadow-[0_0_14px_rgba(180,100,255,0.85)] sm:text-base">
                  {def.hud.assistLabel}
                </p>
              </div>
            )}

            {!hud.victory && (
              <div
                className={`pointer-events-none absolute inset-x-0 ${def.hud.bottomClass} z-10 flex justify-center`}
              >
                <div
                  className={`rounded border ${def.hud.borderClass} bg-black/70 px-4 py-2 text-center font-mono backdrop-blur-sm`}
                >
                  <p className={`text-[10px] uppercase tracking-[0.35em] ${def.hud.subtitleClass}`}>
                    {def.hud.label}
                  </p>
                  <p className={`mt-1 text-xl font-bold tabular-nums ${def.hud.hitsClass}`}>
                    {hud.hits} / {def.targetHits}
                  </p>
                </div>
              </div>
            )}

            {hud.victory && (
              <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
                <p className={`font-mono text-2xl font-bold uppercase tracking-[0.2em] sm:text-3xl ${def.hud.victoryClass}`}>
                  {def.hud.victoryLabel}
                </p>
              </div>
            )}
          </div>
        );
      })}

      {bootPhase === "loading" && (
        <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-6 bg-[#0a0e18]/92 backdrop-blur-sm">
          <div
            className="h-10 w-10 animate-spin rounded-full border-2 border-zinc-700 border-t-amber-400/90"
            aria-hidden
          />
          <div className="text-center font-mono">
            <p className="text-xs uppercase tracking-[0.45em] text-zinc-500">
              Chargement
            </p>
            <p className="mt-2 text-sm text-zinc-400">
              Préparation du plateau…
            </p>
          </div>
        </div>
      )}

      {bootPhase === "attract" && (
        <div
          className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-8 bg-gradient-to-b from-[#0a0e18]/75 via-[#0a0e18]/55 to-[#0a0e18]/85 px-6 backdrop-blur-[2px]"
          onPointerDown={onAttractInteract}
        >
          <div className="text-center">
            <p className="font-mono text-[10px] uppercase tracking-[0.55em] text-red-400/80">
              {attractTagline}
            </p>
            <h1 className="mt-3 font-mono text-4xl font-bold uppercase tracking-[0.18em] text-zinc-100 drop-shadow-[0_0_24px_rgba(255,180,0,0.35)] sm:text-5xl">
              Pinball
            </h1>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-zinc-400">
              Le plateau est prêt. Entrez dans la partie pour lancer la balle.
            </p>
          </div>

          <div className="flex flex-col items-center gap-3">
            <div className="rounded-full border border-amber-500/30 bg-black/50 px-6 py-3 font-mono backdrop-blur-sm">
              <p className="animate-pulse text-sm uppercase tracking-[0.28em] text-amber-200/90">
                ESPACE ou START pour jouer
              </p>
            </div>
            <p className="text-[10px] uppercase tracking-[0.22em] text-zinc-600">
              ou cliquez sur le plateau
            </p>
          </div>

          <div className="absolute bottom-8 text-center font-mono text-[10px] text-zinc-600 space-y-1 leading-relaxed">
            <p>Q / D — Flippers</p>
            <p>ESPACE (en jeu) — Charger puis relâcher pour lancer</p>
          </div>
        </div>
      )}

      {showGameOver && (
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-black/40 backdrop-blur-[1px]">
          <p className="font-mono text-4xl font-bold uppercase tracking-[0.25em] text-red-400 drop-shadow-[0_0_16px_rgba(239,68,68,0.8)]">
            Game Over
          </p>
          <p className="animate-pulse font-mono text-sm uppercase tracking-[0.3em] text-zinc-400">
            ESPACE pour rejouer
          </p>
        </div>
      )}

      {showPowerBar && <PlungerPowerBar charge={plungerCharge} />}

      {showPowerBar && (
        <div className="pointer-events-none absolute inset-x-0 bottom-6 z-10 flex justify-center px-4">
          <p className="animate-pulse font-mono text-[11px] uppercase tracking-[0.22em] text-amber-200/80">
            Relâcher ESPACE pour lancer
          </p>
        </div>
      )}

      {showLaunchHint && (
        <div className="pointer-events-none absolute inset-x-0 bottom-6 z-10 flex flex-col items-center gap-2 px-4">
          {lives < initialLives && (
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-zinc-500">
              Bille perdue — {lives} vie{lives > 1 ? "s" : ""} restante{lives > 1 ? "s" : ""}
            </p>
          )}
          <div className="rounded-full border border-zinc-700/60 bg-black/55 px-5 py-2 font-mono backdrop-blur-sm">
            <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-300">
              Maintenir <span className="text-amber-300/90">ESPACE</span> — relâcher pour lancer
            </p>
          </div>
        </div>
      )}
    </>
  );
}
