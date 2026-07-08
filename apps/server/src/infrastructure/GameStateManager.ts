import { DEFAULT_MAP_ID } from '@pinball/shared-types';

export class GameStateManager {
  private currentMapId: string = DEFAULT_MAP_ID;

  getMapId(): string {
    return this.currentMapId;
  }

  setMapId(mapId: string): void {
    this.currentMapId = mapId;
  }
}
