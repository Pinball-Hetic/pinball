export function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function easeIn(t: number): number {
  return t * t * t;
}

export function strobeOn(t: number, hz: number): boolean {
  return Math.sin(t * hz * Math.PI * 2) > 0;
}
