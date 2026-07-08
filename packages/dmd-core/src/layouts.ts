import type { DmdDisplay } from '@pinball/shared-types';
import { mapStateFlag } from '@pinball/shared-types';
import { FONT_5X7, FONT_12X22, drawText } from './fonts';
import { GRID_W, GRID_H } from './DmdRenderer';
import { DOT } from './palette';
import { livesDisplay } from './livesDisplay';
import {
  drawCentered,
  drawFlash,
  flickerSkip,
  plot,
  seeded,
  fmtNum,
  drawStarBorder,
  drawChenillard,
} from './layoutHelpers';
import type { ClipContext, ClipHandler, DmdMapContent, ScoreDisplay } from './content';

type Variant<M extends DmdDisplay['mode']> = Extract<DmdDisplay, { mode: M }>;
export type LayoutFn = (grid: Uint8Array, display: DmdDisplay, clockMs: number) => void;

function drawLivesRow(grid: Uint8Array, lives: number, y: number): void {
  const view = livesDisplay(lives);
  if (view.kind === 'count') {
    drawText(grid, GRID_W, 2, y, String(view.value), FONT_5X7, DOT.lives);
    const dotX = 2 + (String(view.value).length * 6);
    drawText(grid, GRID_W, dotX, y, '●', FONT_5X7, DOT.lives);
    return;
  }
  for (let i = 0; i < view.total; i++) {
    const color = i < view.filled ? DOT.lives : DOT.heticOff;
    drawText(grid, GRID_W, 2 + i * 7, y, '●', FONT_5X7, color);
  }
}

function defaultFeverBanner(grid: Uint8Array, score: number, clockMs: number): void {
  drawChenillard(grid, clockMs, 0);
  drawChenillard(grid, -clockMs, GRID_H - 1);
  drawCentered(grid, String(score), 2, FONT_12X22, DOT.event);
}

function clipMilestone5k(grid: Uint8Array, value: number, ms: number): void {
  const t = Math.min(1, ms / 4000);
  const cx = GRID_W / 2;
  const cy = 12;
  const r = (1 - Math.pow(1 - Math.min(1, ms / 1500), 3)) * 26;
  const fade = ms > 3200 ? 1 - (ms - 3200) / 800 : 1;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    if (seeded(i) < fade) {
      plot(grid, cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.7, DOT.event);
    }
  }
  if (t < 0.95) drawCentered(grid, `${fmtNum(value)} !`, 22, FONT_5X7, DOT.score, 1, 2);
}

function clipMilestone15k(grid: Uint8Array, value: number, ms: number): void {
  const celebrate = ms > 3000;
  const active = Math.floor(ms / 120) % 3;
  for (let b = 0; b < 3; b++) {
    if (celebrate && b !== active) continue;
    if (b !== active && !celebrate) continue;
    const x0 = 12 + Math.floor(seeded(b * 7 + 1) * (GRID_W - 24));
    let x = x0;
    for (let y = 0; y < GRID_H; y++) {
      plot(grid, x, y, DOT.multi);
      x += seeded(b * 31 + y) < 0.5 ? -1 : 1;
    }
  }
  if (!celebrate) {
    drawCentered(grid, fmtNum(value), 4, FONT_5X7, DOT.score, 1, 3);
  } else {
    drawCentered(grid, fmtNum(value), 0, FONT_5X7, DOT.score, 1, 1);
    for (let i = 0; i < 14; i++) {
      plot(grid, seeded(i + Math.floor(ms / 200)) * GRID_W, seeded(i * 3) * GRID_H, DOT.event);
    }
  }
}

function clipMilestone30k(grid: Uint8Array, value: number, ms: number): void {
  const cx = GRID_W / 2;
  if (ms < 2500) {
    const y = GRID_H - (ms / 2500) * (GRID_H - 4);
    plot(grid, cx, y, DOT.event);
    plot(grid, cx - 1, y + 1, DOT.score);
    plot(grid, cx + 1, y + 1, DOT.score);
    plot(grid, cx, y + 2, DOT.lives);
    plot(grid, cx, y + 3, DOT.combo);
  } else {
    const et = (ms - 2500) / (13000 - 2500);
    for (let i = 0; i < 26; i++) {
      const a = seeded(i) * Math.PI * 2;
      const speed = 6 + seeded(i * 2) * 18;
      const x = cx + Math.cos(a) * speed * et * 2;
      const y = 4 + Math.sin(a) * speed * et + et * et * 30;
      plot(grid, x, y, seeded(i) > 0.5 ? DOT.event : DOT.score);
    }
    drawCentered(grid, fmtNum(value), 22, FONT_5X7, DOT.score, 1, 1);
  }
}

function clipMilestoneBig(grid: Uint8Array, value: number, ms: number): void {
  for (let e = 0; e < 5; e++) {
    const start = e * 1800;
    const local = ms - start;
    if (local < 0 || local > 2200) continue;
    const cx = 14 + seeded(value + e) * (GRID_W - 28);
    const cy = 6 + seeded(value + e * 5) * 16;
    const r = (local / 2200) * 14;
    const fade = 1 - local / 2200;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      if (seeded(i + e) < fade + 0.3) {
        plot(grid, cx + Math.cos(a) * r, cy + Math.sin(a) * r, i % 2 ? DOT.event : DOT.combo);
      }
    }
  }
  drawCentered(grid, fmtNum(value), 4, FONT_5X7, DOT.score, 1, 3);
}

function clipHallOfFame(grid: Uint8Array, score: number, clockMs: number): void {
  if (clockMs < 3500) {
    drawStarBorder(grid, clockMs);
    drawCentered(grid, 'HALL OF FAME', 13, FONT_5X7, DOT.marquee);
  } else {
    const t = Math.min(1, (clockMs - 3500) / 1500);
    const eased = 1 - Math.pow(1 - t, 3);
    const shown = Math.round(score * eased);
    drawCentered(grid, 'HALL OF FAME', 1, FONT_5X7, DOT.marquee);
    drawCentered(grid, String(shown), 9, FONT_12X22, DOT.score);
  }
}

const CORE_CINEMATICS: Record<string, ClipHandler> = {
  milestone_5k: (g, ms, c) => clipMilestone5k(g, c.value || 5000, ms),
  milestone_15k: (g, ms, c) => clipMilestone15k(g, c.value || 15000, ms),
  milestone_30k: (g, ms, c) => clipMilestone30k(g, c.value || 30000, ms),
  milestone_big: (g, ms, c) => clipMilestoneBig(g, c.value || 50000, ms),
  hall_of_fame: (g, ms, c) => clipHallOfFame(g, c.score, ms),
};

function fallbackClip(grid: Uint8Array, clockMs: number, ctx: ClipContext): void {
  if (flickerSkip(clockMs, 140, -0.6)) return;
  const label = ctx.clip.replace(/_/g, ' ').toUpperCase();
  if (ctx.value) {
    drawCentered(grid, label, 2, FONT_5X7, DOT.marquee);
    drawCentered(grid, String(ctx.value), 11, FONT_12X22, DOT.score);
  } else {
    drawCentered(grid, label, 13, FONT_5X7, DOT.marquee);
  }
}

function defaultAttract(grid: Uint8Array, display: { player: string }, clockMs: number): void {
  const name = display.player && display.player !== '—' ? display.player : 'PLAYER';
  drawCentered(grid, name, 6, FONT_5X7, DOT.score, 1, 2);
  if (Math.floor(clockMs / 600) % 2 === 0) {
    drawCentered(grid, 'START !', 18, FONT_5X7, DOT.event, 1, 2);
  }
}

export function makeLayouts(content: DmdMapContent = {}): Record<DmdDisplay['mode'], LayoutFn> {
  const attract = content.attract ?? defaultAttract;
  const feverBanner = content.feverBanner ?? defaultFeverBanner;

  function layoutScore(grid: Uint8Array, display: DmdDisplay, clockMs: number): void {
    const d = display as ScoreDisplay;
    if (mapStateFlag(d.mapState, 'fever')) {
      feverBanner(grid, d.score, clockMs);
      return;
    }
    drawCentered(grid, String(d.score), 1, FONT_12X22, DOT.score);
    drawLivesRow(grid, d.lives, 24);
    content.scoreOverlay?.(grid, d, clockMs);
  }

  function layoutIntro(grid: Uint8Array, display: DmdDisplay, clockMs: number): void {
    attract(grid, display as Variant<'INTRO'>, clockMs);
  }

  function layoutEvent(grid: Uint8Array, display: DmdDisplay, clockMs: number): void {
    const d = display as Variant<'EVENT'>;
    if (flickerSkip(clockMs, 60, -0.7)) return;
    drawFlash(grid, d.label, d.points > 0 ? `+${d.points}` : '', DOT.event);
  }

  function layoutComboFlash(grid: Uint8Array, display: DmdDisplay, clockMs: number): void {
    const d = display as Variant<'COMBO_FLASH'>;
    if (flickerSkip(clockMs, 90, -0.85)) return;
    drawFlash(grid, 'COMBO', `X${d.combo}`, DOT.combo);
  }

  function layoutMultiFlash(grid: Uint8Array, display: DmdDisplay, clockMs: number): void {
    const d = display as Variant<'MULTI_FLASH'>;
    if (flickerSkip(clockMs, 90, -0.85)) return;
    drawFlash(grid, 'MULTI', `X${d.multiplier}`, DOT.multi);
  }

  function layoutLifeLost(grid: Uint8Array): void {
    drawCentered(grid, 'BALL', 2, FONT_5X7, DOT.lives, 1, 2);
    drawCentered(grid, 'LOST', 16, FONT_5X7, DOT.lives, 1, 2);
  }

  function layoutGameOver(grid: Uint8Array, display: DmdDisplay, clockMs: number): void {
    const d = display as Variant<'GAME_OVER'>;
    if (Math.floor(clockMs / 2000) % 2 === 0) {
      drawCentered(grid, 'GAME', 1, FONT_5X7, DOT.gameOver, 1, 2);
      drawCentered(grid, 'OVER', 17, FONT_5X7, DOT.gameOver, 1, 2);
    } else {
      drawCentered(grid, String(d.finalScore), 5, FONT_12X22, DOT.gameOver);
    }
  }

  function layoutCinematic(grid: Uint8Array, display: DmdDisplay, clockMs: number): void {
    const d = display as Variant<'CINEMATIC'>;
    const ctx: ClipContext = { clip: d.clip, value: d.value ?? 0, score: d.score };
    const handler = content.cinematicHandlers?.[d.clip] ?? CORE_CINEMATICS[d.clip];
    if (handler) {
      handler(grid, clockMs, ctx);
      return;
    }
    fallbackClip(grid, clockMs, ctx);
  }

  return {
    INTRO: layoutIntro,
    CINEMATIC: layoutCinematic,
    SCORE: layoutScore,
    EVENT: layoutEvent,
    COMBO_FLASH: layoutComboFlash,
    MULTI_FLASH: layoutMultiFlash,
    LIFE_LOST: layoutLifeLost,
    GAME_OVER: layoutGameOver,
  };
}
