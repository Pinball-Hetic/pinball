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
    const t = elapsed;

    albedoCtx.fillStyle = '#3a1018';
    albedoCtx.fillRect(0, 0, s, s);

    const nebulaBlobs = [
      { cx: 0.42, cy: 0.44, r: 0.42, inner: '#c04070', outer: '#00000000' },
      { cx: 0.58, cy: 0.56, r: 0.38, inner: '#9030a8', outer: '#00000000' },
      { cx: 0.5, cy: 0.5, r: 0.3, inner: '#e03050', outer: '#00000000' },
      { cx: 0.35, cy: 0.62, r: 0.28, inner: '#6020a0', outer: '#00000000' },
      { cx: 0.65, cy: 0.38, r: 0.25, inner: '#b02858', outer: '#00000000' },
    ];

    for (const blob of nebulaBlobs) {
      const ox = s * (blob.cx + Math.sin(t * 0.15 + blob.cx * 10) * 0.03);
      const oy = s * (blob.cy + Math.cos(t * 0.12 + blob.cy * 10) * 0.03);
      const grad = albedoCtx.createRadialGradient(ox, oy, 0, ox, oy, s * blob.r);
      grad.addColorStop(0, blob.inner);
      grad.addColorStop(1, blob.outer);
      albedoCtx.globalAlpha = 0.72;
      albedoCtx.fillStyle = grad;
      albedoCtx.fillRect(0, 0, s, s);
    }
    albedoCtx.globalAlpha = 1;

    const rimGrad = albedoCtx.createRadialGradient(s * 0.5, s * 0.5, s * 0.15, s * 0.5, s * 0.5, s * 0.52);
    rimGrad.addColorStop(0, '#00000000');
    rimGrad.addColorStop(0.7, '#00000000');
    rimGrad.addColorStop(1, '#6a1828');
    albedoCtx.fillStyle = rimGrad;
    albedoCtx.fillRect(0, 0, s, s);

    emissiveCtx.fillStyle = '#200810';
    emissiveCtx.fillRect(0, 0, s, s);

    const glowBlobs = [
      { cx: 0.5, cy: 0.5, r: 0.35, color: '#ff2244' },
      { cx: 0.42, cy: 0.44, r: 0.28, color: '#e83868' },
      { cx: 0.58, cy: 0.55, r: 0.25, color: '#cc40aa' },
    ];

    for (const blob of glowBlobs) {
      const ox = s * (blob.cx + Math.sin(t * 0.2 + blob.cx * 8) * 0.04);
      const oy = s * (blob.cy + Math.cos(t * 0.18 + blob.cy * 8) * 0.04);
      const grad = emissiveCtx.createRadialGradient(ox, oy, 0, ox, oy, s * blob.r);
      grad.addColorStop(0, blob.color);
      grad.addColorStop(0.55, '#c02040');
      grad.addColorStop(1, '#00000000');
      emissiveCtx.globalAlpha = 0.85;
      emissiveCtx.fillStyle = grad;
      emissiveCtx.fillRect(0, 0, s, s);
    }
    emissiveCtx.globalAlpha = 1;

    for (const vine of vines) {
      drawVineStroke(albedoCtx, vine, elapsed, '#5a1828', 0.35);
      drawVineStroke(emissiveCtx, vine, elapsed, '#802040', 0.3);
    }

    this.albedoMap.needsUpdate = true;
    this.emissiveMap.needsUpdate = true;
  }
}
