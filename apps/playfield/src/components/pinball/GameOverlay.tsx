import { DEMOGORGON_TARGET_HITS } from "@pinball/game-engine";
import type { DemogorgonHud, ScorePop } from "../../hooks/useGameState";
import ScorePopFeedback from "./ScorePopFeedback";

interface GameOverlayProps {
  score: number;
  lives: number;
  gameState: "idle" | "playing" | "game_over";
  initialLives: number;
  demogorgonHud: DemogorgonHud;
  scorePops: ScorePop[];
  upsideDownActive: boolean;
  cabinetMode?: boolean;
}

export default function GameOverlay({
  score,
  lives,
  gameState,
  initialLives,
  demogorgonHud,
  scorePops,
  upsideDownActive,
  cabinetMode = false,
}: GameOverlayProps) {
  void cabinetMode;
  const hintLine =
    gameState === "idle"
      ? "▶  Maintenir ESPACE — relâcher pour lancer"
      : gameState === "game_over"
        ? "ESPACE pour rejouer"
        : null;

  const showDemogorgonHud =
    gameState === "playing" && demogorgonHud.active;

  const showUpsideDownBanner =
    gameState === "playing" && upsideDownActive;

  return (
    <>
      <ScorePopFeedback pops={scorePops} />

      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between px-5 pt-4">
        <div className="font-mono space-y-1.5">
          <div className="text-3xl font-bold tabular-nums tracking-widest drop-shadow-[0_0_8px_rgba(255,180,0,0.6)]">
            {String(score).padStart(7, "0")}
          </div>
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
        </div>
        <div className="text-right font-mono text-[10px] text-zinc-500 space-y-0.5 leading-relaxed">
          <div>Q / ← — Flipper gauche</div>
          <div>D / → — Flipper droit</div>
          <div>ESPACE — Charger / lancer</div>
          <div>H — Debug colliders</div>
        </div>
      </header>

      {showUpsideDownBanner && (
        <div className="pointer-events-none absolute inset-x-0 top-[4.75rem] z-10 flex justify-center">
          <div className="rounded border border-violet-500/25 bg-black/45 px-3 py-1 font-mono backdrop-blur-sm">
            <p className="text-[10px] uppercase tracking-[0.45em] text-violet-300/80 drop-shadow-[0_0_10px_rgba(140,80,200,0.45)]">
              Upside Down
            </p>
          </div>
        </div>
      )}

      {showDemogorgonHud && demogorgonHud.elevenFlash && !demogorgonHud.victory && (
        <div className="pointer-events-none absolute inset-x-0 top-24 z-10 flex justify-center">
          <p className="font-mono text-sm font-bold uppercase tracking-[0.25em] text-violet-300 drop-shadow-[0_0_14px_rgba(180,100,255,0.85)] sm:text-base">
            Eleven +100
          </p>
        </div>
      )}

      {showDemogorgonHud && !demogorgonHud.victory && (
        <div className="pointer-events-none absolute inset-x-0 bottom-8 z-10 flex justify-center">
          <div className="rounded border border-red-500/40 bg-black/70 px-4 py-2 text-center font-mono backdrop-blur-sm">
            <p className="text-[10px] uppercase tracking-[0.35em] text-red-300/90">
              Cible Demogorgon
            </p>
            <p className="mt-1 text-xl font-bold tabular-nums text-red-400 drop-shadow-[0_0_10px_rgba(255,60,60,0.7)]">
              {demogorgonHud.hits} / {DEMOGORGON_TARGET_HITS}
            </p>
          </div>
        </div>
      )}

      {showDemogorgonHud && demogorgonHud.victory && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <p className="font-mono text-2xl font-bold uppercase tracking-[0.2em] text-amber-300 drop-shadow-[0_0_20px_rgba(255,200,80,0.9)] sm:text-3xl">
            Demogorgon vaincu !
          </p>
        </div>
      )}

      {(gameState === "idle" || gameState === "game_over") && (
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-4">
          {gameState === "game_over" && (
            <p className="font-mono text-4xl font-bold uppercase tracking-[0.25em] text-red-400 drop-shadow-[0_0_16px_rgba(239,68,68,0.8)]">
              Game Over
            </p>
          )}
          {hintLine && (
            <p className="animate-pulse font-mono text-sm uppercase tracking-[0.3em] text-zinc-400">
              {hintLine}
            </p>
          )}
        </div>
      )}
    </>
  );
}
