export type PlayfieldBootPhase = "loading" | "attract" | "in_game";

export interface BootPhaseInput {
  physicsReady: boolean;
  sessionStarted: boolean;
}

export function computeBootPhase({
  physicsReady,
  sessionStarted,
}: BootPhaseInput): PlayfieldBootPhase {
  if (!physicsReady) return "loading";
  if (!sessionStarted) return "attract";
  return "in_game";
}

export function shouldAutoBeginSession({
  physicsReady,
  sessionStarted,
}: BootPhaseInput): boolean {
  return physicsReady && !sessionStarted;
}
