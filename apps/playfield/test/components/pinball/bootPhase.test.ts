import { describe, expect, it } from "bun:test";
import { computeBootPhase, shouldAutoBeginSession } from "../../../src/components/pinball/bootPhase";

describe("computeBootPhase", () => {
  it("returns loading while physics is not ready", () => {
    expect(computeBootPhase({ physicsReady: false, sessionStarted: false })).toBe(
      "loading",
    );
    expect(computeBootPhase({ physicsReady: false, sessionStarted: true })).toBe(
      "loading",
    );
  });

  it("returns attract when physics is ready but session not started", () => {
    expect(computeBootPhase({ physicsReady: true, sessionStarted: false })).toBe(
      "attract",
    );
  });

  it("returns in_game once the session has started", () => {
    expect(computeBootPhase({ physicsReady: true, sessionStarted: true })).toBe(
      "in_game",
    );
  });
});

describe("shouldAutoBeginSession", () => {
  it("auto-begins only when physics is ready and no session yet", () => {
    expect(
      shouldAutoBeginSession({ physicsReady: true, sessionStarted: false }),
    ).toBe(true);
  });

  it("does not auto-begin before physics is ready", () => {
    expect(
      shouldAutoBeginSession({ physicsReady: false, sessionStarted: false }),
    ).toBe(false);
  });

  it("does not auto-begin once the session is already started", () => {
    expect(
      shouldAutoBeginSession({ physicsReady: true, sessionStarted: true }),
    ).toBe(false);
    expect(
      shouldAutoBeginSession({ physicsReady: false, sessionStarted: true }),
    ).toBe(false);
  });
});
