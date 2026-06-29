import { DEFAULT_MAP_ID } from '@pinball/shared-types';

/**
 * Holds the current server-side game state.
 * Replaces the mutable global `let currentMapId` that lived in index.ts.
 */
export class GameStateManager {
  private currentMapId: string = DEFAULT_MAP_ID;

  getMapId(): string {
    return this.currentMapId;
  }

  setMapId(mapId: string): void {
    this.currentMapId = mapId;
  }
}
