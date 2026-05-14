export interface PlungerState {
  isCharging: boolean;
  chargeStartTime: number | null;
}

export class Plunger {
  private state: PlungerState = { isCharging: false, chargeStartTime: null };

  startCharge(now: number): void {
    this.state = { isCharging: true, chargeStartTime: now };
  }

  release(): PlungerState {
    const snapshot = { ...this.state };
    this.state = { isCharging: false, chargeStartTime: null };
    return snapshot;
  }

  getState(): Readonly<PlungerState> {
    return this.state;
  }
}
