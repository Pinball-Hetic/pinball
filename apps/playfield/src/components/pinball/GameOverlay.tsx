interface GameOverlayProps {
  score: number;
  lives: number;
  gameState: "idle" | "playing" | "game_over";
  initialLives: number;
  cabinetMode?: boolean;
}

export default function GameOverlay({ score, lives, gameState, initialLives, cabinetMode = false }: GameOverlayProps) {
  void cabinetMode;
  const hintLine =
    gameState === "idle"
      ? "▶  Maintenir ESPACE — relâcher pour lancer"
      : gameState === "game_over"
        ? "ESPACE pour rejouer"
        : null;

  return (
    <>
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
