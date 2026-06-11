// Screen shake — énergie empilée par les events, decay exponentiel.
// Offset en unités monde appliqué à la caméra (transform-only, pas de
// nouvelle lumière). Direction lissée (interpolation entre cibles) pour
// éviter le bruit haute fréquence d'un Math.random par frame.

const MAX_AMPLITUDE = 0.004 // unités monde
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

    // Nouvelle cible directionnelle ponctuellement (pas chaque frame).
    this.retargetT -= dt
    if (this.retargetT <= 0) {
      const a = Math.random() * Math.PI * 2
      this.target.x = Math.cos(a)
      this.target.y = Math.sin(a)
      this.retargetT = RETARGET_MIN + Math.random() * RETARGET_VAR
    }

    // Lissage vers la cible.
    const k = Math.min(1, dt * 30)
    this.cur.x += (this.target.x - this.cur.x) * k
    this.cur.y += (this.target.y - this.cur.y) * k

    const m = this.energy * MAX_AMPLITUDE
    return { x: this.cur.x * m, y: this.cur.y * m }
  }
}
