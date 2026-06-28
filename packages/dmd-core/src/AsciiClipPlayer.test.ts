import { test, expect, describe } from 'bun:test';
import {
  trimFrame,
  parseClip,
  drawClipFrame,
  blit,
  revealRadial,
  dissolve,
} from './AsciiClipPlayer';
import { GRID_W, GRID_H } from './DmdRenderer';

function emptyGrid(): Uint8Array {
  return new Uint8Array(GRID_W * GRID_H);
}

function litCount(grid: Uint8Array): number {
  let n = 0;
  for (const v of grid) if (v !== 0) n++;
  return n;
}

describe('trimFrame', () => {
  test('retire les lignes blanches de tête et de queue', () => {
    expect(trimFrame(['', '  ', 'AB', 'CD', '', ' '])).toEqual(['AB', 'CD']);
  });

  test('conserve les lignes blanches internes', () => {
    expect(trimFrame(['A', '', 'B'])).toEqual(['A', '', 'B']);
  });

  test('tableau entièrement blanc → vide', () => {
    expect(trimFrame(['', '  ', '   '])).toEqual([]);
  });

  test('tableau vide → vide', () => {
    expect(trimFrame([])).toEqual([]);
  });

  test('ne mute pas le tableau source', () => {
    const src = ['', 'X', ''];
    trimFrame(src);
    expect(src).toEqual(['', 'X', '']);
  });
});

describe('parseClip', () => {
  const charMap = { X: 1, O: 2 };

  test('fps par défaut = 8 quand absent', () => {
    const clip = parseClip('XX\nXX', charMap);
    expect(clip.fps).toBe(8);
  });

  test('lit le fps depuis le header # fps:', () => {
    const clip = parseClip('# fps: 12\nXX', charMap);
    expect(clip.fps).toBe(12);
  });

  test('découpe les frames sur les séparateurs ===', () => {
    const clip = parseClip('XX\n===\nOO\nOO', charMap);
    expect(clip.frames).toEqual([['XX'], ['OO', 'OO']]);
  });

  test('ignore les lignes de commentaire (#) autres que fps', () => {
    const clip = parseClip('# un commentaire\nXX', charMap);
    expect(clip.frames).toEqual([['XX']]);
  });

  test('trim chaque frame (lignes blanches de bord)', () => {
    const clip = parseClip('\n\nXX\n\n===\n\nOO\n', charMap);
    expect(clip.frames).toEqual([['XX'], ['OO']]);
  });

  test('frames vides ignorées (=== consécutifs)', () => {
    const clip = parseClip('XX\n===\n===\nOO', charMap);
    expect(clip.frames).toEqual([['XX'], ['OO']]);
  });

  test('gère les retours chariot \\r (CRLF)', () => {
    const clip = parseClip('# fps: 5\r\nXX\r\n===\r\nOO\r\n', charMap);
    expect(clip.fps).toBe(5);
    expect(clip.frames).toEqual([['XX'], ['OO']]);
  });

  test('renvoie le charMap fourni intact', () => {
    const clip = parseClip('XX', charMap);
    expect(clip.charMap).toBe(charMap);
  });

  test('source vide → aucune frame', () => {
    const clip = parseClip('', charMap);
    expect(clip.frames).toEqual([]);
  });

  test('dernière frame poussée même sans === final', () => {
    const clip = parseClip('XX\n===\nOO', charMap);
    expect(clip.frames.length).toBe(2);
  });
});

describe('blit', () => {
  test('centre une ligne unique sur la grille', () => {
    const grid = emptyGrid();
    blit(grid, ['X'], () => 5);
    // 1 ligne → y0 = (32-1)/2 = 15 ; 1 col → x0 = (96-1)/2 = 47
    expect(grid[15 * GRID_W + 47]).toBe(5);
    expect(litCount(grid)).toBe(1);
  });

  test('saute . et espace (cellules transparentes)', () => {
    const grid = emptyGrid();
    blit(grid, ['.X '], () => 3);
    // seule la cellule X est dessinée
    expect(litCount(grid)).toBe(1);
  });

  test('saute les cellules dont map renvoie 0', () => {
    const grid = emptyGrid();
    blit(grid, ['AB'], (ch) => (ch === 'A' ? 4 : 0));
    expect(litCount(grid)).toBe(1);
  });

  test('passe ch, x, y corrects à map', () => {
    const calls: Array<[string, number, number]> = [];
    blit(emptyGrid(), ['AB', 'CD'], (ch, x, y) => {
      calls.push([ch, x, y]);
      return 1;
    });
    expect(calls).toContainEqual(['A', 0, 0]);
    expect(calls).toContainEqual(['B', 1, 0]);
    expect(calls).toContainEqual(['C', 0, 1]);
    expect(calls).toContainEqual(['D', 1, 1]);
  });

  test('clippe les lignes hors grille (trop hautes)', () => {
    const grid = emptyGrid();
    const tall = Array.from({ length: GRID_H + 10 }, () => 'X');
    blit(grid, tall, () => 1);
    // aucune écriture hors [0, GRID_H)
    expect(litCount(grid)).toBe(GRID_H);
  });

  test('clippe les colonnes hors grille (ligne trop large)', () => {
    const grid = emptyGrid();
    const wide = 'X'.repeat(GRID_W + 20);
    blit(grid, [wide], () => 1);
    expect(litCount(grid)).toBe(GRID_W);
  });
});

describe('drawClipFrame', () => {
  const charMap = { X: 7 };
  const clip = parseClip('# fps: 10\nX\n===\nXX\n===\nXXX', charMap);

  test('clip vide → ne dessine rien', () => {
    const grid = emptyGrid();
    drawClipFrame(grid, parseClip('', charMap), 1000);
    expect(litCount(grid)).toBe(0);
  });

  test('t=0 → première frame', () => {
    const grid = emptyGrid();
    drawClipFrame(grid, clip, 0);
    expect(litCount(grid)).toBe(1); // frame 'X'
  });

  test('avance selon fps (10fps → 200ms = frame index 2)', () => {
    const grid = emptyGrid();
    drawClipFrame(grid, clip, 200); // floor(0.2*10)=2 → 'XXX'
    expect(litCount(grid)).toBe(3);
  });

  test('clampe au-delà de la dernière frame', () => {
    const grid = emptyGrid();
    drawClipFrame(grid, clip, 999999);
    expect(litCount(grid)).toBe(3); // dernière frame 'XXX'
  });

  test('elapsed négatif → clampe à la première frame', () => {
    const grid = emptyGrid();
    drawClipFrame(grid, clip, -500);
    expect(litCount(grid)).toBe(1);
  });
});

describe('revealRadial', () => {
  const frame = ['XXX', 'XXX', 'XXX'];
  const charMap = { X: 3, '!': 9 };

  test('t01=0 → rien révélé (ancre à dist 0, reveal 0)', () => {
    const grid = emptyGrid();
    revealRadial(grid, frame, charMap, 0);
    // reveal = 0, toute cellule dist>0 cachée. La cellule à l'ancre exacte
    // (centre-bas) a dist 0 = reveal → pas > reveal donc dessinée en front.
    expect(litCount(grid)).toBeLessThanOrEqual(1);
  });

  test('t01=1 → frame entièrement révélée', () => {
    const grid = emptyGrid();
    revealRadial(grid, frame, charMap, 1);
    expect(litCount(grid)).toBe(9);
  });

  test('clampe t01 > 1 comme t01 = 1', () => {
    const a = emptyGrid();
    const b = emptyGrid();
    revealRadial(a, frame, charMap, 1);
    revealRadial(b, frame, charMap, 5);
    expect(b).toEqual(a);
  });

  test('clampe t01 < 0 comme t01 = 0', () => {
    const a = emptyGrid();
    const b = emptyGrid();
    revealRadial(a, frame, charMap, 0);
    revealRadial(b, frame, charMap, -3);
    expect(b).toEqual(a);
  });

  test('le front utilise la couleur accent (!)', () => {
    const grid = emptyGrid();
    revealRadial(grid, frame, charMap, 0.5);
    // au moins une cellule de front en couleur accent (9)
    expect(Array.from(grid)).toContain(9);
  });
});

describe('dissolve', () => {
  const frame = ['XXXX', 'XXXX', 'XXXX', 'XXXX'];
  const charMap = { X: 3, ':': 6 };

  test('t01=0 → frame intacte (tous les seuils >= 0)', () => {
    const grid = emptyGrid();
    dissolve(grid, frame, charMap, 0);
    expect(litCount(grid)).toBe(16);
    // aucune cellule en poussière
    expect(Array.from(grid)).not.toContain(6);
  });

  test('t01=1 → quasi tout disparu (seules les cellules seuil>=0.9 restent en poussière)', () => {
    const grid = emptyGrid();
    dissolve(grid, frame, charMap, 1);
    // À t01=1, une cellule survit en poussière ssi threshold+0.1 >= 1,
    // soit threshold >= 0.9 (hash01 max ~0.999). Tout résidu est de la poussière.
    for (const v of grid) {
      if (v !== 0) expect(v).toBe(6);
    }
    expect(litCount(grid)).toBeLessThan(16);
  });

  test('t01 bien au-delà de 1 → totalement disparu', () => {
    const grid = emptyGrid();
    dissolve(grid, frame, charMap, 2);
    expect(litCount(grid)).toBe(0);
  });

  test('déterministe : même t01 → même rendu', () => {
    const a = emptyGrid();
    const b = emptyGrid();
    dissolve(a, frame, charMap, 0.5);
    dissolve(b, frame, charMap, 0.5);
    expect(b).toEqual(a);
  });

  test('phase poussière (:) visible à mi-parcours', () => {
    // À t01 intermédiaire, certaines cellules sont en (threshold, threshold+0.1].
    let found = false;
    for (let t = 0.05; t < 1 && !found; t += 0.05) {
      const grid = emptyGrid();
      dissolve(grid, frame, charMap, t);
      if (Array.from(grid).includes(6)) found = true;
    }
    expect(found).toBe(true);
  });
});
