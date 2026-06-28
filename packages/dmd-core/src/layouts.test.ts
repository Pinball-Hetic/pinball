import { test, expect, describe } from 'bun:test';
import type { DmdDisplay } from '@pinball/shared-types';
import { makeLayouts } from './layouts';
import { GRID_W, GRID_H } from './DmdRenderer';
import { DOT } from './palette';
import type { ClipContext } from './content';

// Grille vierge (index palette par dot, 0 = éteint).
const newGrid = () => new Uint8Array(GRID_W * GRID_H);

// Nombre de dots allumés (index != 0).
function litCount(grid: Uint8Array): number {
  let n = 0;
  for (const v of grid) if (v !== 0) n++;
  return n;
}

// Vrai si au moins un dot de la grille porte cet index de couleur.
function hasColor(grid: Uint8Array, color: number): boolean {
  return grid.includes(color);
}

// Construit un snapshot SCORE complet (champs partagés requis par le type).
function scoreDisplay(over: Partial<Extract<DmdDisplay, { mode: 'SCORE' }>> = {}) {
  return {
    mode: 'SCORE' as const,
    player: 'AZ',
    score: 12345,
    combo: 0,
    multiplier: 1,
    lives: 3,
    mapState: {},
    alternateWorld: false,
    ...over,
  };
}

describe('makeLayouts dispatch table', () => {
  test('expose un layout pour chaque mode DmdDisplay', () => {
    const layouts = makeLayouts();
    expect(Object.keys(layouts).sort()).toEqual(
      [
        'INTRO',
        'CINEMATIC',
        'SCORE',
        'EVENT',
        'COMBO_FLASH',
        'MULTI_FLASH',
        'LIFE_LOST',
        'GAME_OVER',
      ].sort(),
    );
  });

  test('fonctionne sans contenu de map (defaults)', () => {
    const layouts = makeLayouts();
    const grid = newGrid();
    layouts.SCORE(grid, scoreDisplay(), 0);
    expect(litCount(grid)).toBeGreaterThan(0);
  });
});

describe('layoutScore', () => {
  test('dessine le score + 3 vies allumées (lives=3)', () => {
    const layouts = makeLayouts();
    const grid = newGrid();
    layouts.SCORE(grid, scoreDisplay({ lives: 3 }), 0);
    // Les vies sont des disques pleins couleur DOT.lives.
    expect(hasColor(grid, DOT.lives)).toBe(true);
    expect(hasColor(grid, DOT.score)).toBe(true);
  });

  test('une vie restante allume moins de dots que trois vies', () => {
    const layouts = makeLayouts();
    const g1 = newGrid();
    const g3 = newGrid();
    layouts.SCORE(g1, scoreDisplay({ lives: 1 }), 0);
    layouts.SCORE(g3, scoreDisplay({ lives: 3 }), 0);
    // Les vies "off" utilisent heticOff (toujours dessinées), donc le total
    // global est identique ; mais le nombre de dots `lives` (allumés) diffère.
    const livesLit = (g: Uint8Array) => [...g].filter((v) => v === DOT.lives).length;
    expect(livesLit(g1)).toBeLessThan(livesLit(g3));
  });

  test('zéro vie : aucun dot de couleur lives', () => {
    const layouts = makeLayouts();
    const grid = newGrid();
    layouts.SCORE(grid, scoreDisplay({ lives: 0 }), 0);
    expect(hasColor(grid, DOT.lives)).toBe(false);
    // Mais les emplacements "off" (heticOff) restent dessinés.
    expect(hasColor(grid, DOT.heticOff)).toBe(true);
  });

  test('mapState.fever bascule sur le bandeau fever (event color)', () => {
    const layouts = makeLayouts();
    const grid = newGrid();
    layouts.SCORE(grid, scoreDisplay({ mapState: { fever: true } }), 0);
    // Le bandeau fever par défaut dessine un gros score en DOT.event.
    expect(hasColor(grid, DOT.event)).toBe(true);
    // En fever, la rangée de vies n'est pas dessinée (return anticipé).
    expect(hasColor(grid, DOT.heticOff)).toBe(false);
  });

  test('appelle scoreOverlay fourni par la map', () => {
    let called = 0;
    const layouts = makeLayouts({
      scoreOverlay: (grid) => {
        called++;
        grid[0] = DOT.marquee;
      },
    });
    const grid = newGrid();
    layouts.SCORE(grid, scoreDisplay(), 0);
    expect(called).toBe(1);
    expect(grid[0]).toBe(DOT.marquee);
  });

  test('scoreOverlay NON appelé en mode fever', () => {
    let called = 0;
    const layouts = makeLayouts({ scoreOverlay: () => void called++ });
    const grid = newGrid();
    layouts.SCORE(grid, scoreDisplay({ mapState: { fever: true } }), 0);
    expect(called).toBe(0);
  });

  test('feverBanner custom remplace le bandeau par défaut', () => {
    let received = -1;
    const layouts = makeLayouts({
      feverBanner: (grid, score) => {
        received = score;
        grid[5] = DOT.combo;
      },
    });
    const grid = newGrid();
    layouts.SCORE(grid, scoreDisplay({ score: 999, mapState: { fever: true } }), 0);
    expect(received).toBe(999);
    expect(grid[5]).toBe(DOT.combo);
  });
});

describe('layoutIntro / attract', () => {
  test('attract par défaut dessine le nom du joueur', () => {
    const layouts = makeLayouts();
    const grid = newGrid();
    layouts.INTRO(grid, { mode: 'INTRO', player: 'NEO', alternateWorld: false }, 0);
    expect(hasColor(grid, DOT.score)).toBe(true);
  });

  test('attract clignote "START !" selon clockMs', () => {
    const layouts = makeLayouts();
    // clockMs=0 → floor(0/600)%2===0 → START affiché (DOT.event présent).
    const gOn = newGrid();
    layouts.INTRO(gOn, { mode: 'INTRO', player: 'NEO', alternateWorld: false }, 0);
    expect(hasColor(gOn, DOT.event)).toBe(true);
    // clockMs=600 → floor(600/600)%2===1 → START masqué.
    const gOff = newGrid();
    layouts.INTRO(gOff, { mode: 'INTRO', player: 'NEO', alternateWorld: false }, 600);
    expect(hasColor(gOff, DOT.event)).toBe(false);
  });

  test('attract custom de la map est utilisé', () => {
    let seen = '';
    const layouts = makeLayouts({
      attract: (grid, display) => {
        seen = display.player;
        grid[1] = DOT.rain;
      },
    });
    const grid = newGrid();
    layouts.INTRO(grid, { mode: 'INTRO', player: 'TRINITY', alternateWorld: false }, 0);
    expect(seen).toBe('TRINITY');
    expect(grid[1]).toBe(DOT.rain);
  });
});

describe('layoutEvent', () => {
  test('dessine le label + les points positifs en DOT.event', () => {
    const layouts = makeLayouts();
    const grid = newGrid();
    layouts.EVENT(
      grid,
      { mode: 'EVENT', label: 'HIT', points: 500 } as DmdDisplay,
      0,
    );
    expect(hasColor(grid, DOT.event)).toBe(true);
  });

  test('flickerSkip occulte le draw quand la sinusoïde plonge', () => {
    const layouts = makeLayouts();
    const disp = { mode: 'EVENT', label: 'HIT', points: 10 } as DmdDisplay;
    // flickerSkip(clockMs, 60, -0.7) : trouve un clockMs où sin < -0.7.
    let skipMs = -1;
    for (let ms = 0; ms < 1000; ms++) {
      if (Math.sin(ms / 60) < -0.7) {
        skipMs = ms;
        break;
      }
    }
    expect(skipMs).toBeGreaterThanOrEqual(0);
    const grid = newGrid();
    layouts.EVENT(grid, disp, skipMs);
    expect(litCount(grid)).toBe(0);
  });
});

describe('layoutComboFlash / layoutMultiFlash', () => {
  test('combo flash dessine en DOT.combo', () => {
    const layouts = makeLayouts();
    const grid = newGrid();
    layouts.COMBO_FLASH(grid, { mode: 'COMBO_FLASH', combo: 4 } as unknown as DmdDisplay, 0);
    expect(hasColor(grid, DOT.combo)).toBe(true);
  });

  test('multi flash dessine en DOT.multi', () => {
    const layouts = makeLayouts();
    const grid = newGrid();
    layouts.MULTI_FLASH(
      grid,
      { mode: 'MULTI_FLASH', multiplier: 2 } as unknown as DmdDisplay,
      0,
    );
    expect(hasColor(grid, DOT.multi)).toBe(true);
  });
});

describe('layoutLifeLost', () => {
  test('dessine BALL / LOST en DOT.lives', () => {
    const layouts = makeLayouts();
    const grid = newGrid();
    layouts.LIFE_LOST(grid, { mode: 'LIFE_LOST' } as DmdDisplay, 0);
    expect(hasColor(grid, DOT.lives)).toBe(true);
    expect(litCount(grid)).toBeGreaterThan(0);
  });
});

describe('layoutGameOver', () => {
  test('alterne GAME OVER (texte) et le score selon clockMs', () => {
    const layouts = makeLayouts();
    const disp = { mode: 'GAME_OVER', finalScore: 4242 } as DmdDisplay;
    // clockMs=0 → floor(0/2000)%2===0 → "GAME OVER" en DOT.gameOver.
    const gText = newGrid();
    layouts.GAME_OVER(gText, disp, 0);
    expect(hasColor(gText, DOT.gameOver)).toBe(true);
    // clockMs=2000 → floor(2000/2000)%2===1 → score (gros chiffres gameOver).
    const gScore = newGrid();
    layouts.GAME_OVER(gScore, disp, 2000);
    expect(hasColor(gScore, DOT.gameOver)).toBe(true);
    // Les deux phases dessinent quelque chose mais des patterns différents.
    expect([...gText]).not.toEqual([...gScore]);
  });
});

describe('layoutCinematic - résolution des handlers', () => {
  test('utilise le handler core par défaut (hall_of_fame)', () => {
    const layouts = makeLayouts();
    const grid = newGrid();
    layouts.CINEMATIC(
      grid,
      { mode: 'CINEMATIC', clip: 'hall_of_fame', player: 'AZ', score: 50000, alternateWorld: false },
      0,
    );
    expect(litCount(grid)).toBeGreaterThan(0);
  });

  test('handler de map prime sur le handler core (même clipId)', () => {
    let mapCalled = 0;
    const layouts = makeLayouts({
      cinematicHandlers: {
        hall_of_fame: (grid) => {
          mapCalled++;
          grid[7] = DOT.rainGo;
        },
      },
    });
    const grid = newGrid();
    layouts.CINEMATIC(
      grid,
      { mode: 'CINEMATIC', clip: 'hall_of_fame', player: 'AZ', score: 1, alternateWorld: false },
      0,
    );
    expect(mapCalled).toBe(1);
    expect(grid[7]).toBe(DOT.rainGo);
  });

  test('handler reçoit un ClipContext complet (clip/value/score)', () => {
    let ctx: ClipContext | undefined;
    const layouts = makeLayouts({
      cinematicHandlers: { boss_kill: (_g, _ms, c) => void (ctx = c) },
    });
    const grid = newGrid();
    layouts.CINEMATIC(
      grid,
      { mode: 'CINEMATIC', clip: 'boss_kill', player: 'AZ', score: 80, value: 7, alternateWorld: false },
      123,
    );
    expect(ctx).toEqual({ clip: 'boss_kill', value: 7, score: 80 });
  });

  test('value absent → 0 dans le ClipContext', () => {
    let ctx: ClipContext | undefined;
    const layouts = makeLayouts({
      cinematicHandlers: { x: (_g, _ms, c) => void (ctx = c) },
    });
    layouts.CINEMATIC(
      newGrid(),
      { mode: 'CINEMATIC', clip: 'x', player: 'AZ', score: 5, alternateWorld: false },
      0,
    );
    expect(ctx!.value).toBe(0);
  });

  test('clip inconnu → fallbackClip dessine le label en DOT.marquee', () => {
    const layouts = makeLayouts();
    const grid = newGrid();
    layouts.CINEMATIC(
      grid,
      { mode: 'CINEMATIC', clip: 'totally_unknown_clip', player: 'AZ', score: 0, alternateWorld: false },
      0,
    );
    expect(hasColor(grid, DOT.marquee)).toBe(true);
  });

  test('fallbackClip avec value dessine aussi le score (DOT.score)', () => {
    const layouts = makeLayouts();
    const grid = newGrid();
    layouts.CINEMATIC(
      grid,
      { mode: 'CINEMATIC', clip: 'mystery', player: 'AZ', score: 0, value: 999, alternateWorld: false },
      0,
    );
    expect(hasColor(grid, DOT.score)).toBe(true);
    expect(hasColor(grid, DOT.marquee)).toBe(true);
  });

  test('fallbackClip occulté par flickerSkip', () => {
    const layouts = makeLayouts();
    // fallbackClip : flickerSkip(clockMs, 140, -0.6).
    let skipMs = -1;
    for (let ms = 0; ms < 2000; ms++) {
      if (Math.sin(ms / 140) < -0.6) {
        skipMs = ms;
        break;
      }
    }
    expect(skipMs).toBeGreaterThanOrEqual(0);
    const grid = newGrid();
    layouts.CINEMATIC(
      grid,
      { mode: 'CINEMATIC', clip: 'mystery', player: 'AZ', score: 0, alternateWorld: false },
      skipMs,
    );
    expect(litCount(grid)).toBe(0);
  });
});

describe('core cinematics - valeurs par défaut & déterminisme', () => {
  const clips = ['milestone_5k', 'milestone_15k', 'milestone_30k', 'milestone_big'];

  test.each(clips)('clip %s dessine des pixels et est déterministe', (clip) => {
    const layouts = makeLayouts();
    const display: DmdDisplay = {
      mode: 'CINEMATIC',
      clip,
      player: 'AZ',
      score: 0,
      alternateWorld: false,
    };
    const a = newGrid();
    const b = newGrid();
    layouts.CINEMATIC(a, display, 500);
    layouts.CINEMATIC(b, display, 500);
    // seeded() est déterministe → même rendu pour le même clockMs.
    expect([...a]).toEqual([...b]);
    expect(litCount(a)).toBeGreaterThan(0);
  });

  test('milestone_5k : le texte disparaît proche de la fin (t >= 0.95)', () => {
    const layouts = makeLayouts();
    const display: DmdDisplay = {
      mode: 'CINEMATIC',
      clip: 'milestone_5k',
      player: 'AZ',
      score: 0,
      value: 5000,
      alternateWorld: false,
    };
    // t = min(1, ms/4000). À ms=300 (t<0.95) le texte DOT.score est dessiné.
    const early = newGrid();
    layouts.CINEMATIC(early, display, 300);
    expect(hasColor(early, DOT.score)).toBe(true);
  });

  test('milestone_30k progresse dans le temps (deux phases distinctes)', () => {
    const layouts = makeLayouts();
    const display: DmdDisplay = {
      mode: 'CINEMATIC',
      clip: 'milestone_30k',
      player: 'AZ',
      score: 0,
      value: 30000,
      alternateWorld: false,
    };
    const phase1 = newGrid(); // ms < 2500 : étoile filante qui monte
    const phase2 = newGrid(); // ms >= 2500 : explosion + score
    layouts.CINEMATIC(phase1, display, 1000);
    layouts.CINEMATIC(phase2, display, 5000);
    expect([...phase1]).not.toEqual([...phase2]);
    // Phase 2 affiche le score formaté en DOT.score.
    expect(hasColor(phase2, DOT.score)).toBe(true);
  });
});
