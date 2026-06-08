import type { ScorePop } from "../../hooks/useGameState";

interface ScorePopFeedbackProps {
  pops: ScorePop[];
}

export default function ScorePopFeedback({ pops }: ScorePopFeedbackProps) {
  if (pops.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      {pops.map((pop) => (
        <div
          key={pop.id}
          className={`score-pop-rise absolute font-mono text-lg font-bold tabular-nums sm:text-xl ${
            pop.tone === "target"
              ? "text-red-300 drop-shadow-[0_0_12px_rgba(255,80,80,0.95)]"
              : "text-amber-300 drop-shadow-[0_0_10px_rgba(255,190,60,0.9)]"
          }`}
          style={{ left: `${pop.x}%`, top: `${pop.y}%` }}
        >
          +{pop.amount}
        </div>
      ))}
    </div>
  );
}
