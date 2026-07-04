// Screen shake — energy stacked by events, exponential decay.
// World-unit offset applied to the camera (transform-only, no new light).
// Direction is smoothed (interpolated between targets) to avoid the
// high-frequency noise of a per-frame Math.random.

const MAX_AMPLITUDE = 0.004 // world units
const DECAY_PER_S = 6
const RETARGET_MIN = 0.03
const RETARGET_VAR = 0.03

export interface ShakeOffset {
  x: number
  y: number
}

export class ScreenShake {
  private energy = 0
  private cur: ShakeOffset = { x: 0, y: 0 }
  private target: ShakeOffset = { x: 0, y: 0 }
  private retargetT = 0

  add(intensity: number): void {
    this.energy = Math.min(1, this.energy + intensity)
  }

  update(dt: number): ShakeOffset {
    this.energy = Math.max(0, this.energy - this.energy * DECAY_PER_S * dt)

    // Retarget direction occasionally (not every frame).
    this.retargetT -= dt
    if (this.retargetT <= 0) {
      const a = Math.random() * Math.PI * 2
      this.target.x = Math.cos(a)
      this.target.y = Math.sin(a)
      this.retargetT = RETARGET_MIN + Math.random() * RETARGET_VAR
    }

    // Smooth toward the target.
    const k = Math.min(1, dt * 30)
    this.cur.x += (this.target.x - this.cur.x) * k
    this.cur.y += (this.target.y - this.cur.y) * k

    const m = this.energy * MAX_AMPLITUDE
    return { x: this.cur.x * m, y: this.cur.y * m }
  }
}
