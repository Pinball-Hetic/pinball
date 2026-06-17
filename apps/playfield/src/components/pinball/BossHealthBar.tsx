import { bossHealthRatio, type BossHealthBarTheme } from "./bossHealthHud";

type BossHealthBarProps = {
  label: string;
  hits: number;
  maxHits: number;
  theme: BossHealthBarTheme;
  bottomClass: string;
};

export default function BossHealthBar({
  label,
  hits,
  maxHits,
  theme,
  bottomClass,
}: BossHealthBarProps) {
  const width = `${bossHealthRatio(hits, maxHits) * 100}%`;

  return (
    <div
      className={`pointer-events-none absolute inset-x-0 ${bottomClass} z-10 flex justify-center`}
    >
      <div className={`text-center font-mono ${theme.shellClass}`}>
        <p className={theme.labelClass}>{label}</p>
        <div
          className={theme.trackClass}
          role="meter"
          aria-valuenow={maxHits - hits}
          aria-valuemin={0}
          aria-valuemax={maxHits}
        >
          <div className={theme.fillClass} style={{ width }} />
        </div>
      </div>
    </div>
  );
}
