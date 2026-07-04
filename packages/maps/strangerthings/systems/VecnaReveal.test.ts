import { test, expect, describe, beforeEach } from 'bun:test';
import * as THREE from 'three';
import type { GameEvent } from '@pinball/game-engine';
import { getBossDefinition } from '../bosses';
import { VecnaReveal } from './VecnaReveal';

const VICTORY_DURATION = 0.65;
const WALK_STEP = 5; // > VECNA_WALK_DURATION so isWalkPathComplete() flips
const SETTLE_STEP = 2; // > settle facing duration so updateSettle() completes

const REVEAL: GameEvent = { type: 'BOSS_REVEAL', bossId: 'vecna' };

function hit(hitCount: number): GameEvent {
  return { type: 'BOSS_TARGET_HIT', bossId: 'vecna', hitCount };
}

// Drives the reveal through walk → settle → fight so onGameEvent hits are
// accepted by the phase machine (onHit only counts during 'fight').
function driveToFight(reveal: VecnaReveal): void {
  reveal.onGameEvent(REVEAL); // idle → walk
  reveal.update(WALK_STEP); // walk → settle (walkPathComplete)
  reveal.update(SETTLE_STEP); // settle → fight (settleComplete)
  reveal.update(0); // in fight
}

describe('VecnaReveal onFightEnd timing (regression)', () => {
  let reveal: VecnaReveal;
  let root: THREE.Group;
  let camera: THREE.Camera;
  let fightEndCalls: number;

  beforeEach(() => {
    reveal = new VecnaReveal();
    root = new THREE.Group();
    camera = new THREE.PerspectiveCamera();
    fightEndCalls = 0;
    reveal.setup({
      root,
      camera,
      garlandLights: null,
      bumperVisuals: null,
      onFightEnd: () => {
        fightEndCalls += 1;
      },
    });
  });

  test('killing blow does NOT fire onFightEnd immediately (still in victory anim)', () => {
    driveToFight(reveal);
    const targetHits = getBossDefinition('vecna').targetHits;

    reveal.onGameEvent(hit(targetHits)); // reaches victory threshold
    expect(fightEndCalls).toBe(0);

    // Part-way through the victory animation: still not ended.
    reveal.update(VICTORY_DURATION / 2);
    expect(fightEndCalls).toBe(0);
  });

  test('onFightEnd fires exactly once when the victory sequence completes', () => {
    driveToFight(reveal);
    reveal.onGameEvent(hit(getBossDefinition('vecna').targetHits));

    // Advance past the full victory duration → finishedVictory → hideBoss.
    reveal.update(VICTORY_DURATION + 0.01);
    expect(fightEndCalls).toBe(1);

    // Further ticks must not re-fire (machine reset to idle by hideBoss).
    reveal.update(1);
    expect(fightEndCalls).toBe(1);
  });
});
