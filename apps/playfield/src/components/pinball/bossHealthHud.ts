import type { BossId } from "@pinball/game-engine";

export type BossHealthBarTheme = {
  shellClass: string;
  labelClass: string;
  trackClass: string;
  fillClass: string;
};

export const BOSS_HEALTH_BAR_THEMES = {
  demogorgon: {
    shellClass:
      "min-w-52 rounded border border-red-500/40 bg-black/70 px-4 py-2.5 backdrop-blur-sm",
    labelClass: "text-[10px] uppercase tracking-[0.35em] text-red-300/90",
    trackClass:
      "mt-2 h-2.5 w-full overflow-hidden rounded-full bg-red-950/80 ring-1 ring-red-500/25",
    fillClass:
      "h-full rounded-full bg-gradient-to-r from-red-700 to-red-400 shadow-[0_0_12px_rgba(255,60,60,0.65)] transition-[width] duration-300 ease-out",
  },
  vecna: {
    shellClass:
      "min-w-52 rounded border border-violet-500/45 bg-black/70 px-4 py-2.5 backdrop-blur-sm",
    labelClass: "text-[10px] uppercase tracking-[0.35em] text-violet-300/90",
    trackClass:
      "mt-2 h-2.5 w-full overflow-hidden rounded-full bg-violet-950/80 ring-1 ring-violet-500/30",
    fillClass:
      "h-full rounded-full bg-gradient-to-r from-violet-700 to-violet-400 shadow-[0_0_12px_rgba(160,80,255,0.6)] transition-[width] duration-300 ease-out",
  },
} satisfies Record<string, BossHealthBarTheme>;

export type BossHealthBarId = keyof typeof BOSS_HEALTH_BAR_THEMES;

export function bossUsesHealthBar(bossId: BossId): bossId is BossHealthBarId {
  return bossId in BOSS_HEALTH_BAR_THEMES;
}

export function bossHealthRatio(hits: number, maxHits: number): number {
  if (maxHits <= 0) return 0;
  return Math.max(0, Math.min(1, 1 - hits / maxHits));
}

export function bossHealthBarTheme(bossId: BossId): BossHealthBarTheme | null {
  if (!bossUsesHealthBar(bossId)) return null;
  return BOSS_HEALTH_BAR_THEMES[bossId];
}
