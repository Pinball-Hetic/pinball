import { test, expect, describe } from 'bun:test';
import {
  centerX,
  flickerSkip,
  drawCentered,
  drawFlash,
  plot,
  seeded,
  fmtNum,
  drawStarBorder,
  drawChenillard,
} from './layoutHelpers';
import { GRID_W, GRID_H } from './DmdRenderer';
import { FONT_5X7, measureText } from './fonts';
import { DOT } from './palette';

const newGrid = () => new Uint8Array(GRID_W * GRID_H);
const at = (g: Uint8Array, x: number, y: number) => g[y * GRID_W + x];
const litCount = (g: Uint8Array) => g.reduce((n, v) => (v ? n + 1 : n), 0);

describe('centerX', () => {
  test('centre une largeur paire dans la grille', () => {
    // (96 - 10) / 2 = 43
    expect(centerX(10)).toBe(43);
  });

  test('arrondit une largeur impaire', () => {
    // (96 - 5) / 2 = 45.5 → round → 46
    expect(centerX(5)).toBe(46);
  });

  test('largeur nulle = moitié de la grille', () => {
    expect(centerX(0)).toBe(GRID_W / 2);
  });

  test('largeur supérieure à la grille donne un x négatif', () => {
    expect(centerX(GRID_W + 20)).toBe(-10);
  });
});

describe('flickerSkip', () => {
  test('vrai quand la sinusoïde plonge sous le floor', () => {
    // sin(clock/period) at its trough. clock=period*(3π/2) → sin ≈ -1 < 0
    const clock = (3 * Math.PI) / 2 * 100;
    expect(flickerSkip(clock, 100, 0)).toBe(true);
  });

  test('faux quand la sinusoïde est au-dessus du floor', () => {
    // sin(period*(π/2)/period) = sin(π/2) = 1, not < 0
    const clock = (Math.PI / 2) * 100;
    expect(flickerSkip(clock, 100, 0)).toBe(false);
  });

  test('floor très haut occulte presque toujours', () => {
    expect(flickerSkip(0, 100, 2)).toBe(true);
  });

  test('floor très bas n occulte jamais', () => {
    expect(flickerSkip((3 * Math.PI) / 2 * 100, 100, -2)).toBe(false);
  });
});

describe('plot', () => {
  test('écrit la couleur à la position arrondie', () => {
    const g = newGrid();
    plot(g, 5, 3, DOT.score);
    expect(at(g, 5, 3)).toBe(DOT.score);
    expect(litCount(g)).toBe(1);
  });

  test('arrondit les coordonnées flottantes', () => {
    const g = newGrid();
    plot(g, 5.6, 3.4, DOT.combo);
    expect(at(g, 6, 3)).toBe(DOT.combo);
  });

  test('ignore un x hors borne droite', () => {
    const g = newGrid();
    plot(g, GRID_W, 0, DOT.score);
    expect(litCount(g)).toBe(0);
  });

  test('ignore un x négatif', () => {
    const g = newGrid();
    plot(g, -1, 0, DOT.score);
    expect(litCount(g)).toBe(0);
  });

  test('ignore un y hors borne basse', () => {
    const g = newGrid();
    plot(g, 0, GRID_H, DOT.score);
    expect(litCount(g)).toBe(0);
  });

  test('ignore un y négatif', () => {
    const g = newGrid();
    plot(g, 0, -1, DOT.score);
    expect(litCount(g)).toBe(0);
  });

  test('dessine sur le dernier dot valide (coin bas-droit)', () => {
    const g = newGrid();
    plot(g, GRID_W - 1, GRID_H - 1, DOT.multi);
    expect(at(g, GRID_W - 1, GRID_H - 1)).toBe(DOT.multi);
  });
});

describe('seeded', () => {
  test('déterministe pour une même entrée', () => {
    expect(seeded(42)).toBe(seeded(42));
  });

  test('renvoie une valeur dans [0, 1)', () => {
    for (const n of [0, 1, 7.5, 42, 1000, -3]) {
      const v = seeded(n);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  test('des entrées différentes donnent des sorties différentes', () => {
    expect(seeded(1)).not.toBe(seeded(2));
  });
});

describe('fmtNum', () => {
  test('laisse intacts les nombres < 1000', () => {
    expect(fmtNum(0)).toBe('0');
    expect(fmtNum(999)).toBe('999');
  });

  test('insère un espace tous les 3 chiffres', () => {
    expect(fmtNum(1000)).toBe('1 000');
    expect(fmtNum(1234567)).toBe('1 234 567');
  });

  test('gère exactement 4 chiffres', () => {
    expect(fmtNum(9999)).toBe('9 999');
  });

  test('gère 6 chiffres (frontière groupe)', () => {
    expect(fmtNum(123456)).toBe('123 456');
  });
});

describe('drawCentered', () => {
  test('dessine le texte centré horizontalement', () => {
    const g = newGrid();
    drawCentered(g, 'A', 0, FONT_5X7, DOT.score);
    // 'A' width 5 → centerX(5) = 46. The glyph occupies columns 46..50.
    expect(litCount(g)).toBeGreaterThan(0);
    // No column before the starting x may be lit.
    const startX = centerX(measureText('A', FONT_5X7, 1, 1));
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < startX; x++) {
        expect(at(g, x, y)).toBe(0);
      }
    }
  });

  test('chaîne vide ne dessine rien', () => {
    const g = newGrid();
    drawCentered(g, '', 5, FONT_5X7, DOT.score);
    expect(litCount(g)).toBe(0);
  });
});

describe('drawFlash', () => {
  test('label seul (sans valeur) tient en scale 2 si possible', () => {
    const g = newGrid();
    drawFlash(g, 'GO', '', DOT.event);
    expect(litCount(g)).toBeGreaterThan(0);
    // all lit cells carry the given color
    for (const v of g) if (v) expect(v).toBe(DOT.event);
  });

  test('label seul trop large retombe en scale 1', () => {
    const g1 = newGrid();
    const g2 = newGrid();
    // label whose scale-2 width exceeds GRID_W → scale 1
    const longLabel = 'GAMEOVERXX';
    expect(measureText(longLabel, FONT_5X7, 1, 2)).toBeGreaterThan(GRID_W);
    drawFlash(g1, longLabel, '', DOT.gameOver);
    // a version that fits at scale 2
    drawFlash(g2, 'OK', '', DOT.gameOver);
    expect(litCount(g1)).toBeGreaterThan(0);
    expect(litCount(g2)).toBeGreaterThan(0);
  });

  test('label + valeur courts tiennent sur une ligne', () => {
    const g = newGrid();
    drawFlash(g, 'X', 'Y', DOT.score);
    const oneLine = 'X Y';
    expect(measureText(oneLine, FONT_5X7, 1, 2)).toBeLessThanOrEqual(GRID_W);
    expect(litCount(g)).toBeGreaterThan(0);
  });

  test('label + valeur trop longs passent sur deux lignes', () => {
    const g = newGrid();
    const label = 'COMBO';
    const value = 'XXXX';
    // one line at scale 2 overflows → two lines y=2 and y=17
    expect(measureText(`${label} ${value}`, FONT_5X7, 1, 2)).toBeGreaterThan(GRID_W);
    drawFlash(g, label, value, DOT.combo);
    // dots present in both the top zone (y<10) and the bottom zone (y>=17)
    let topLit = false;
    let bottomLit = false;
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        if (!at(g, x, y)) continue;
        if (y < 12) topLit = true;
        if (y >= 17) bottomLit = true;
      }
    }
    expect(topLit).toBe(true);
    expect(bottomLit).toBe(true);
  });
});

describe('drawStarBorder', () => {
  test('n allume que les bords (jamais le centre)', () => {
    const g = newGrid();
    drawStarBorder(g, 0);
    for (let y = 0; y < GRID_H; y++) {
      const edgeY = y < 2 || y >= GRID_H - 2;
      for (let x = 0; x < GRID_W; x++) {
        const edgeX = x < 8 || x >= GRID_W - 8;
        if (!edgeY && !edgeX && at(g, x, y)) {
          throw new Error(`dot allumé au centre (${x},${y})`);
        }
      }
    }
  });

  test('déterministe pour un même ms', () => {
    const a = newGrid();
    const b = newGrid();
    drawStarBorder(a, 700);
    drawStarBorder(b, 700);
    expect(a).toEqual(b);
  });

  test('les couleurs proviennent de la palette étoile', () => {
    const g = newGrid();
    drawStarBorder(g, 0);
    for (const v of g) {
      if (v) expect([DOT.score, DOT.marquee]).toContain(v);
    }
  });
});

describe('drawChenillard', () => {
  test('allume une fraction de la rangée ciblée uniquement', () => {
    const g = newGrid();
    const row = 10;
    drawChenillard(g, 0, row);
    // every lit dot is on the requested row
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        if (at(g, x, y)) expect(y).toBe(row);
      }
    }
    expect(litCount(g)).toBeGreaterThan(0);
  });

  test('motif 1 dot sur 3 (off=0)', () => {
    const g = newGrid();
    drawChenillard(g, 0, 0);
    for (let x = 0; x < GRID_W; x++) {
      if (x % 3 === 0) expect(at(g, x, 0)).not.toBe(0);
      else expect(at(g, x, 0)).toBe(0);
    }
  });

  test('utilise les couleurs combo et multi', () => {
    const g = newGrid();
    drawChenillard(g, 0, 0);
    for (const v of g) {
      if (v) expect([DOT.combo, DOT.multi]).toContain(v);
    }
  });

  test('le défilement décale le motif dans le temps', () => {
    const a = newGrid();
    const b = newGrid();
    drawChenillard(a, 0, 0);
    // clock=180 → off = floor(180/60) = 3 → pattern shift
    drawChenillard(b, 180, 0);
    expect(a).not.toEqual(b);
  });
});
