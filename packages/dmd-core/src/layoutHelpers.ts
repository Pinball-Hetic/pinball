import { FONT_5X7, drawText, measureText } from './fonts';
import { GRID_W, GRID_H } from './DmdRenderer';
import { DOT } from './palette';

export function centerX(width: number): number {
  return Math.round((GRID_W - width) / 2);
}

export function flickerSkip(clockMs: number, period: number, floor: number): boolean {
  return Math.sin(clockMs / period) < floor;
}

export function drawCentered(
  grid: Uint8Array,
  text: string,
  y: number,
  font: typeof FONT_5X7,
  color: number,
  spacing = 1,
  scale = 1,
): void {
  const x = centerX(measureText(text, font, spacing, scale));
  drawText(grid, GRID_W, x, y, text, font, color, spacing, scale);
}

export function drawFlash(grid: Uint8Array, label: string, value: string, color: number): void {
  if (!value) {
    const scale = measureText(label, FONT_5X7, 1, 2) <= GRID_W ? 2 : 1;
    drawCentered(grid, label, 9, FONT_5X7, color, 1, scale);
    return;
  }
  const oneLine = `${label} ${value}`;
  if (measureText(oneLine, FONT_5X7, 1, 2) <= GRID_W) {
    drawCentered(grid, oneLine, 9, FONT_5X7, color, 1, 2);
  } else {
    drawCentered(grid, label, 2, FONT_5X7, color, 1, 2);
    drawCentered(grid, value, 17, FONT_5X7, color, 1, 2);
  }
}

export function plot(grid: Uint8Array, x: number, y: number, color: number): void {
  const px = Math.round(x);
  const py = Math.round(y);
  if (px < 0 || px >= GRID_W || py < 0 || py >= GRID_H) return;
  grid[py * GRID_W + px] = color;
}

export function seeded(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export function fmtNum(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export function drawStarBorder(grid: Uint8Array, ms: number): void {
  const phase = Math.floor(ms / 350);
  for (let y = 0; y < GRID_H; y++) {
    const edgeY = y < 2 || y >= GRID_H - 2;
    for (let x = 0; x < GRID_W; x++) {
      const edgeX = x < 8 || x >= GRID_W - 8;
      if (!edgeY && !edgeX) continue;
      if (seeded(x * 7.1 + y * 131.3) >= 0.1) continue;
      const lit = (Math.floor(seeded(x + y * 3) * 4) + phase) % 4 === 0;
      if (!lit) continue;
      plot(grid, x, y, x % 2 ? DOT.score : DOT.marquee);
    }
  }
}

export function drawChenillard(grid: Uint8Array, clockMs: number, y: number): void {
  const off = Math.floor(clockMs / 60);
  for (let x = 0; x < GRID_W; x++) {
    if ((x + off) % 3 === 0) {
      plot(grid, x, y, ((x + off) >> 1) % 2 === 0 ? DOT.combo : DOT.multi);
    }
  }
}
