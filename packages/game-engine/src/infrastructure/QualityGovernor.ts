export interface QualityTier {
  dpr: number;
  trailMax: number;
  sporesOn: boolean;
}

const TIERS: QualityTier[] = [
  { dpr: 1.5, trailMax: 24, sporesOn: true },
  { dpr: 1.25, trailMax: 24, sporesOn: true },
  { dpr: 1.0, trailMax: 24, sporesOn: true },
  { dpr: 1.0, trailMax: 12, sporesOn: false },
  { dpr: 0.85, trailMax: 12, sporesOn: false },
  { dpr: 0.7, trailMax: 8, sporesOn: false },
];

const WINDOW = 60; // frames
const DOWN_MS = 19; // average above → step down
const UP_MS = 12; // below this for UP_HOLD_MS → step up
const UP_HOLD_MS = 5000;
const COOLDOWN_MS = 3000; // max 1 change / 3s

export class QualityGovernor {
  private index = 0;
  private samples: number[] = [];
  private cursor = 0;
  private clock = 0; // cumulative ms
  private lastChange = 0;
  private goodSince = 0; // ms when the average fell back under UP_MS

  constructor(private onChange: (tier: QualityTier) => void) {}

  current(): QualityTier {
    return TIERS[this.index];
  }

  frame(ms: number): void {
    this.clock += ms;
    if (this.samples.length < WINDOW) this.samples.push(ms);
    else this.samples[this.cursor] = ms;
    this.cursor = (this.cursor + 1) % WINDOW;
    if (this.samples.length < WINDOW) return;

    const avg = this.samples.reduce((s, v) => s + v, 0) / this.samples.length;

    if (this.clock - this.lastChange < COOLDOWN_MS) {
      // During cooldown the step-up timer does NOT run (otherwise it would
      // already be elapsed when cooldown ends → immediate step-up then
      // re-degradation = oscillation).
      this.goodSince = this.clock;
      return;
    }

    if (avg > DOWN_MS && this.index < TIERS.length - 1) {
      this.index += 1;
      this.lastChange = this.clock;
      this.goodSince = this.clock;
      console.log(`[QualityGovernor] ↓ cran ${this.index}`, this.current(), `(avg ${avg.toFixed(1)}ms)`);
      this.onChange(this.current());
      return;
    }

    if (avg < UP_MS && this.index > 0) {
      if (this.clock - this.goodSince >= UP_HOLD_MS) {
        this.index -= 1;
        this.lastChange = this.clock;
        this.goodSince = this.clock;
        console.log(`[QualityGovernor] ↑ cran ${this.index}`, this.current(), `(avg ${avg.toFixed(1)}ms)`);
        this.onChange(this.current());
      }
    } else {
      this.goodSince = this.clock;
    }
  }
}
