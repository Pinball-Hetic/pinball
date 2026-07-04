// Playfield boot phase: pure derivation from two progress booleans. The map
// is already selected upstream, so there is no blocking "attract" screen:
// as soon as physics is ready the session starts automatically (ball
// auto-spawns in the shooter lane, ready to launch). The "attract" phase only
// remains as a transient state between `physicsReady` and the auto-start
// tick.

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

// Auto-spawn: the session must start on its own once physics is ready and no
// session is active yet. No START/SPACE required.
export function shouldAutoBeginSession({
  physicsReady,
  sessionStarted,
}: BootPhaseInput): boolean {
  return physicsReady && !sessionStarted;
}
