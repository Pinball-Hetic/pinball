import { test, expect } from 'bun:test';
import { AlternateWorldState } from './AlternateWorldState';

test('starts inactive with zeroed baselines and score', () => {
  const s = new AlternateWorldState();
  expect(s.isActive()).toBe(false);
  expect(s.getNormalWorldScoreBaseline()).toBe(0);
  expect(s.getAlternateWorldScoreBaseline()).toBe(0);
  expect(s.getLastTotalScore()).toBe(0);
});

test('enter() activates and sets the alternate-world baseline only', () => {
  const s = new AlternateWorldState();
  s.completeCycle(1200); // establishes a normal baseline first
  s.enter(5000);
  expect(s.isActive()).toBe(true);
  expect(s.getAlternateWorldScoreBaseline()).toBe(5000);
  expect(s.getNormalWorldScoreBaseline()).toBe(1200); // untouched by enter()
});

test('resetSession() clears active + alternate baseline, keeps normal baseline', () => {
  const s = new AlternateWorldState();
  s.completeCycle(1200);
  s.enter(5000);
  s.resetSession();
  expect(s.isActive()).toBe(false);
  expect(s.getAlternateWorldScoreBaseline()).toBe(0);
  expect(s.getNormalWorldScoreBaseline()).toBe(1200);
});

test('resetScoreBaselines() zeroes both baselines but not active flag', () => {
  const s = new AlternateWorldState();
  s.completeCycle(1200);
  s.enter(5000);
  s.resetScoreBaselines();
  expect(s.getNormalWorldScoreBaseline()).toBe(0);
  expect(s.getAlternateWorldScoreBaseline()).toBe(0);
  expect(s.isActive()).toBe(true); // completeCycle set false, enter set true — untouched here
});

test('completeCycle() deactivates, clears alternate baseline, sets normal baseline', () => {
  const s = new AlternateWorldState();
  s.enter(5000);
  s.completeCycle(9000);
  expect(s.isActive()).toBe(false);
  expect(s.getAlternateWorldScoreBaseline()).toBe(0);
  expect(s.getNormalWorldScoreBaseline()).toBe(9000);
});

test('setLastTotalScore() feeds gateContext totalScore', () => {
  const s = new AlternateWorldState();
  s.setLastTotalScore(4200);
  expect(s.getLastTotalScore()).toBe(4200);
  expect(s.gateContext().totalScore).toBe(4200);
});

test('gateContext() mirrors current state', () => {
  const s = new AlternateWorldState();
  s.completeCycle(1000);
  s.enter(3000);
  s.setLastTotalScore(7500);
  expect(s.gateContext()).toEqual({
    totalScore: 7500,
    alternateWorldActive: true,
    normalWorldScoreBaseline: 1000,
    alternateWorldScoreBaseline: 3000,
  });
});
