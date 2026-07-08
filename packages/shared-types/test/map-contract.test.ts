import { test, expect, describe } from 'bun:test';
import { DEFAULT_MAP_ID, mapAssetUrl } from '../src/map-contract';

describe('DEFAULT_MAP_ID', () => {
  test('is strangerthings', () => {
    expect(DEFAULT_MAP_ID).toBe('strangerthings');
  });
});

describe('mapAssetUrl', () => {
  test('builds a /maps/<id>/<rel> url', () => {
    expect(mapAssetUrl('zelda', 'glb/board.glb')).toBe('/maps/zelda/glb/board.glb');
  });

  test('strips leading slashes from the relative path (pas de double slash)', () => {
    expect(mapAssetUrl('zelda', '/glb/board.glb')).toBe('/maps/zelda/glb/board.glb');
  });

  test('strips multiple leading slashes', () => {
    expect(mapAssetUrl('zelda', '///audio/theme.mp3')).toBe('/maps/zelda/audio/theme.mp3');
  });

  test('handles an empty relative path', () => {
    expect(mapAssetUrl('zelda', '')).toBe('/maps/zelda/');
  });

  test('does not touch inner slashes', () => {
    expect(mapAssetUrl('st', 'a/b/c.png')).toBe('/maps/st/a/b/c.png');
  });

  test('uses the provided mapId verbatim', () => {
    expect(mapAssetUrl('strangerthings', 'x.glb')).toBe('/maps/strangerthings/x.glb');
  });
});
