import * as THREE from 'three';

const TEXTURE_SIZE = 256;
const PAINT_INTERVAL = 0.07;
const VINE_COUNT = 14;

type Vine = {
  seed: number;
  sx: number;
  sy: number;
  c1x: number;
  c1y: number;
  c2x: number;
  c2y: number;
  ex: number;
  ey: number;
  width: number;
  branchAt: number;
  branchAngle: number;
  branchLen: number;
};

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function createVines(size: number): Vine[] {
  const rand = seededRandom(90210);
  const vines: Vine[] = [];
  const margin = size * 0.08;

  for (let i = 0; i < VINE_COUNT; i++) {
    const edge = i % 4;
    let sx: number;
    let sy: number;
    let ex: number;
    let ey: number;

    if (edge === 0) {
      sx = margin + rand() * (size - margin * 2);
      sy = margin;
      ex = size * 0.35 + rand() * size * 0.3;
      ey = size * 0.55 + rand() * size * 0.35;
    } else if (edge === 1) {
      sx = size - margin;
      sy = margin + rand() * (size - margin * 2);
      ex = size * 0.35 + rand() * size * 0.3;
      ey = size * 0.35 + rand() * size * 0.35;
    } else if (edge === 2) {
      sx = margin + rand() * (size - margin * 2);
      sy = size - margin;
      ex = size * 0.25 + rand() * size * 0.5;
      ey = size * 0.25 + rand() * size * 0.35;
    } else {
      sx = margin;
      sy = margin + rand() * (size - margin * 2);
      ex = size * 0.45 + rand() * size * 0.35;
      ey = size * 0.4 + rand() * size * 0.35;
    }

    vines.push({
      seed: i * 17.3 + rand() * 100,
      sx,
      sy,
      c1x: sx + (ex - sx) * 0.25 + (rand() - 0.5) * size * 0.35,
      c1y: sy + (ey - sy) * 0.15 + (rand() - 0.5) * size * 0.35,
      c2x: sx + (ex - sx) * 0.65 + (rand() - 0.5) * size * 0.3,
      c2y: sy + (ey - sy) * 0.75 + (rand() - 0.5) * size * 0.3,
      ex,
      ey,
      width: 2.2 + rand() * 2.8,
      branchAt: 0.35 + rand() * 0.45,
      branchAngle: (rand() - 0.5) * Math.PI * 0.9,
      branchLen: size * (0.08 + rand() * 0.14),
    });
  }

  return vines;
}

function wiggle(value: number, t: number, seed: number, amp: number): number {
  return value + Math.sin(t * 1.15 + seed) * amp + Math.sin(t * 2.4 + seed * 1.7) * amp * 0.45;
}

function bezierPoint(
  t: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
): [number, number] {
  const u = 1 - t;
  const tt = t * t;
  const uu = u * u;
  const uuu = uu * u;
  const ttt = tt * t;
  return [
    uuu * x0 + 3 * uu * t * x1 + 3 * u * tt * x2 + ttt * x3,
    uuu * y0 + 3 * uu * t * y1 + 3 * u * tt * y2 + ttt * y3,
  ];
}

function drawVineStroke(
  ctx: CanvasRenderingContext2D,
  vine: Vine,
  t: number,
  strokeStyle: string | CanvasGradient,
  widthScale: number,
): void {
  const x0 = wiggle(vine.sx, t, vine.seed, 6);
  const y0 = wiggle(vine.sy, t, vine.seed + 1, 6);
  const x1 = wiggle(vine.c1x, t, vine.seed + 2, 10);
  const y1 = wiggle(vine.c1y, t, vine.seed + 3, 10);
  const x2 = wiggle(vine.c2x, t, vine.seed + 4, 9);
  const y2 = wiggle(vine.c2y, t, vine.seed + 5, 9);
  const x3 = wiggle(vine.ex, t, vine.seed + 6, 7);
  const y3 = wiggle(vine.ey, t, vine.seed + 7, 7);

  const pulse = 0.85 + Math.sin(t * 1.8 + vine.seed) * 0.15;
  const width = vine.width * widthScale * pulse;

  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.bezierCurveTo(x1, y1, x2, y2, x3, y3);
  ctx.stroke();

  const [bx, by] = bezierPoint(vine.branchAt, x0, y0, x1, y1, x2, y2, x3, y3);
  const grow = 0.7 + Math.sin(t * 1.3 + vine.seed * 0.5) * 0.3;
  const bl = vine.branchLen * grow;
  const angle = vine.branchAngle + Math.sin(t * 0.9 + vine.seed) * 0.35;
  const bx2 = bx + Math.cos(angle) * bl;
  const by2 = by + Math.sin(angle) * bl;
  const bMidX = bx + Math.cos(angle) * bl * 0.45 + Math.sin(t + vine.seed) * 4;
  const bMidY = by + Math.sin(angle) * bl * 0.45 + Math.cos(t * 1.1 + vine.seed) * 4;

  ctx.lineWidth = width * 0.65;
  ctx.beginPath();
  ctx.moveTo(bx, by);
  ctx.quadraticCurveTo(bMidX, bMidY, bx2, by2);
  ctx.stroke();
}

export class BumperVineTextures {
  readonly albedoMap: THREE.CanvasTexture;
  readonly emissiveMap: THREE.CanvasTexture;

  private readonly albedoCanvas: HTMLCanvasElement;
  private readonly emissiveCanvas: HTMLCanvasElement;
  private readonly albedoCtx: CanvasRenderingContext2D;
  private readonly emissiveCtx: CanvasRenderingContext2D;
  private readonly vines: Vine[];
  private lastPaintTime = -999;
  repainted = false;

  constructor() {
    this.albedoCanvas = document.createElement('canvas');
    this.albedoCanvas.width = TEXTURE_SIZE;
    this.albedoCanvas.height = TEXTURE_SIZE;
    this.emissiveCanvas = document.createElement('canvas');
    this.emissiveCanvas.width = TEXTURE_SIZE;
    this.emissiveCanvas.height = TEXTURE_SIZE;

    const albedoCtx = this.albedoCanvas.getContext('2d');
    const emissiveCtx = this.emissiveCanvas.getContext('2d');
    if (!albedoCtx || !emissiveCtx) {
      throw new Error('BumperVineTextures: canvas 2D context unavailable');
    }
    this.albedoCtx = albedoCtx;
    this.emissiveCtx = emissiveCtx;
    this.vines = createVines(TEXTURE_SIZE);

    this.albedoMap = new THREE.CanvasTexture(this.albedoCanvas);
    this.emissiveMap = new THREE.CanvasTexture(this.emissiveCanvas);
    for (const tex of [this.albedoMap, this.emissiveMap]) {
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
    }

    this.paint(0);
  }

  update(elapsed: number): void {
    this.repainted = false;
    if (elapsed - this.lastPaintTime >= PAINT_INTERVAL) {
      this.lastPaintTime = elapsed;
      this.paint(elapsed);
      this.repainted = true;
    }
  }

  cloneAlbedoMap(): THREE.CanvasTexture {
    const tex = this.albedoMap.clone();
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  cloneEmissiveMap(): THREE.CanvasTexture {
    const tex = this.emissiveMap.clone();
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  dispose(): void {
    this.albedoMap.dispose();
    this.emissiveMap.dispose();
  }

  private paint(elapsed: number): void {
    const { albedoCtx, emissiveCtx, vines } = this;
    const s = TEXTURE_SIZE;

    albedoCtx.fillStyle = '#3a1828';
    albedoCtx.fillRect(0, 0, s, s);

    const albedoGrad = albedoCtx.createRadialGradient(s * 0.5, s * 0.5, s * 0.05, s * 0.5, s * 0.5, s * 0.55);
    albedoGrad.addColorStop(0, '#5a2840');
    albedoGrad.addColorStop(1, '#281018');
    albedoCtx.fillStyle = albedoGrad;
    albedoCtx.fillRect(0, 0, s, s);

    emissiveCtx.fillStyle = '#180810';
    emissiveCtx.fillRect(0, 0, s, s);

    for (const vine of vines) {
      drawVineStroke(albedoCtx, vine, elapsed, '#6a3048', 1);
      drawVineStroke(albedoCtx, vine, elapsed + 0.4, '#4a2030', 0.55);

      const glow = emissiveCtx.createLinearGradient(vine.sx, vine.sy, vine.ex, vine.ey);
      glow.addColorStop(0, '#802040');
      glow.addColorStop(0.5, '#e83858');
      glow.addColorStop(1, '#b02848');
      drawVineStroke(emissiveCtx, vine, elapsed, glow, 1.15);
      drawVineStroke(emissiveCtx, vine, elapsed + 0.25, '#c03050', 0.45);
    }

    this.albedoMap.needsUpdate = true;
    this.emissiveMap.needsUpdate = true;
  }
}
