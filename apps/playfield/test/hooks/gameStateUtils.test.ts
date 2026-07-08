import { test, expect, spyOn, afterEach } from "bun:test";
import {
  computeMultiplier,
  nextMilestone,
  generatePlayerName,
  MULTIPLIER_THRESHOLDS,
  MILESTONES,
  MILESTONE_REPEAT_EVERY,
} from "../../src/hooks/gameStateUtils";

// --- computeMultiplier: buckets at thresholds [5,10,20,40] ---

test("computeMultiplier ×1 sous le premier seuil (0..4)", () => {
  expect(computeMultiplier(0)).toBe(1);
  expect(computeMultiplier(4)).toBe(1); // lower boundary: 4 < 5
});

test("computeMultiplier ×2 sur [5,9]", () => {
  expect(computeMultiplier(5)).toBe(2); // boundary: 5 enters the bucket
  expect(computeMultiplier(9)).toBe(2); // 9 < 10
});

test("computeMultiplier ×3 sur [10,19]", () => {
  expect(computeMultiplier(10)).toBe(3);
  expect(computeMultiplier(19)).toBe(3); // 19 < 20
});

test("computeMultiplier ×4 sur [20,39]", () => {
  expect(computeMultiplier(20)).toBe(4);
  expect(computeMultiplier(39)).toBe(4); // 39 < 40
});

test("computeMultiplier ×5 à 40 et au-delà", () => {
  expect(computeMultiplier(40)).toBe(5); // upper boundary: 40 -> x5
  expect(computeMultiplier(1000)).toBe(5);
});

// --- nextMilestone: milestone crossings ---

test("nextMilestone retourne null sans franchissement", () => {
  const passed = new Set<number>();
  expect(nextMilestone(0, 4_000, passed)).toBeNull();
  expect(passed.size).toBe(0);
});

test("nextMilestone franchit un seul palier", () => {
  const passed = new Set<number>();
  expect(nextMilestone(0, 6_000, passed)).toBe(5_000);
  expect(passed.has(5_000)).toBe(true);
});

test("nextMilestone retourne le plus haut palier franchi quand plusieurs sont traversés", () => {
  const passed = new Set<number>();
  // 0 -> 16000 crosses 5k and 15k; returns 15k, but 5k is recorded too.
  expect(nextMilestone(0, 16_000, passed)).toBe(15_000);
  expect(passed.has(5_000)).toBe(true);
  expect(passed.has(15_000)).toBe(true);
});

test("nextMilestone ne re-déclenche pas un palier déjà passé", () => {
  const passed = new Set<number>([5_000]);
  // 5k already passed -> ignored; 15k not crossed yet (next < 15k) -> null.
  expect(nextMilestone(0, 6_000, passed)).toBeNull();
});

test("nextMilestone borne inférieure exclusive / supérieure inclusive", () => {
  const passed = new Set<number>();
  // strict m > prev: prev=5000 does not include 5000.
  expect(nextMilestone(5_000, 14_000, passed)).toBeNull();
  // inclusive m <= next: next exactly at 15000 crosses it.
  expect(nextMilestone(14_000, 15_000, passed)).toBe(15_000);
});

test("nextMilestone gère le palier répétitif tous les 25k au-delà de 50k", () => {
  const passed = new Set<number>();
  // 30k -> 50k: crosses 50k (first repeating milestone).
  expect(nextMilestone(30_000, 50_000, passed)).toBe(50_000);
  expect(passed.has(50_000)).toBe(true);

  const passed2 = new Set<number>();
  // 50k -> 80k: crosses 75k (50k excluded because == prev).
  expect(nextMilestone(50_000, 80_000, passed2)).toBe(75_000);
  expect(passed2.has(75_000)).toBe(true);
});

test("nextMilestone retourne le plus haut répétitif quand plusieurs 25k sont franchis", () => {
  const passed = new Set<number>();
  // 40k -> 105k: crosses 50k, 75k, 100k -> highest = 100k.
  expect(nextMilestone(40_000, 105_000, passed)).toBe(100_000);
  expect(passed.has(50_000)).toBe(true);
  expect(passed.has(75_000)).toBe(true);
  expect(passed.has(100_000)).toBe(true);
});

// --- generatePlayerName: shape + charset (value via spy) ---

afterEach(() => {
  // Restore the Math.random spies set in the tests.
  (Math.random as unknown as { mockRestore?: () => void }).mockRestore?.();
});

test("generatePlayerName respecte le format PLAYER + 4 chiffres", () => {
  for (let i = 0; i < 50; i++) {
    expect(generatePlayerName()).toMatch(/^PLAYER\d{4}$/);
  }
});

test("generatePlayerName pad à gauche avec des zéros (random bas)", () => {
  spyOn(Math, "random").mockReturnValue(0);
  expect(generatePlayerName()).toBe("PLAYER0000");
});

test("generatePlayerName borne haute (random proche de 1)", () => {
  spyOn(Math, "random").mockReturnValue(0.99999);
  expect(generatePlayerName()).toBe("PLAYER9999");
});

// --- constant guards (source of truth for thresholds) ---

test("constantes exportées conformes au contrat", () => {
  expect(MULTIPLIER_THRESHOLDS).toEqual([5, 10, 20, 40]);
  expect(MILESTONES).toEqual([5_000, 15_000, 30_000]);
  expect(MILESTONE_REPEAT_EVERY).toBe(25_000);
});
