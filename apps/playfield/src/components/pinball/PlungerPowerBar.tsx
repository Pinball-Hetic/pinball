interface PlungerPowerBarProps {
  /** Progression de charge normalisée [0, 1]. */
  charge: number;
}

/**
 * Jauge verticale de puissance du plongeur (couloir droit de l'écran).
 */
export default function PlungerPowerBar({ charge }: PlungerPowerBarProps) {
  const pct = Math.round(charge * 100);
  const full = charge >= 0.995;

  return (
    <div
      className="pointer-events-none absolute right-4 top-1/2 z-20 flex -translate-y-1/2 flex-col items-center gap-2 sm:right-6"
      aria-label={`Puissance du lancement ${pct} pourcent`}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
    >
      <span className="font-mono text-[9px] uppercase tracking-[0.35em] text-zinc-500">
        Puissance
      </span>

      <div className="relative h-40 w-3 overflow-hidden rounded-full border border-zinc-700/80 bg-black/60 shadow-[inset_0_0_8px_rgba(0,0,0,0.8)] sm:h-48 sm:w-3.5">
        <div
          className={`absolute inset-x-0 bottom-0 rounded-full transition-[height] duration-75 ease-out ${
            full
              ? "bg-gradient-to-t from-amber-500 via-orange-400 to-yellow-200 shadow-[0_0_12px_rgba(251,191,36,0.75)]"
              : "bg-gradient-to-t from-amber-700 via-amber-500 to-amber-300"
          }`}
          style={{ height: `${Math.max(charge * 100, 2)}%` }}
        />
        {/* Repères 25 / 50 / 75 % */}
        {[25, 50, 75].map((mark) => (
          <div
            key={mark}
            className="absolute inset-x-0 border-t border-zinc-600/40"
            style={{ bottom: `${mark}%` }}
            aria-hidden
          />
        ))}
      </div>

      <span
        className={`font-mono text-xs tabular-nums ${
          full ? "font-bold text-amber-300 drop-shadow-[0_0_6px_rgba(251,191,36,0.6)]" : "text-zinc-400"
        }`}
      >
        {pct}%
      </span>

      {full && (
        <span className="animate-pulse font-mono text-[9px] uppercase tracking-[0.2em] text-amber-300/90">
          Max
        </span>
      )}
    </div>
  );
}
