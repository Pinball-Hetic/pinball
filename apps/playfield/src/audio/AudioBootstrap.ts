import type { SamplePlayer } from "./SamplePlayer";

type BootstrapDeps = {
  samples: SamplePlayer;
  onGestureUnlock: () => void;
  warmAssets: () => void;
};

let bootstrapInstalled = false;

export function installAudioBootstrap(deps: BootstrapDeps): void {
  if (bootstrapInstalled || typeof window === "undefined") return;
  bootstrapInstalled = true;

  deps.samples.ensureContext();
  deps.warmAssets();

  const onGesture = () => {
    void deps.samples.resumeContext();
    deps.onGestureUnlock();
    for (const event of GESTURE_EVENTS) {
      document.removeEventListener(event, onGesture, true);
    }
  };

  for (const event of GESTURE_EVENTS) {
    document.addEventListener(event, onGesture, { capture: true, passive: true });
  }
}

const GESTURE_EVENTS = ["pointerdown", "touchstart", "keydown"] as const;
