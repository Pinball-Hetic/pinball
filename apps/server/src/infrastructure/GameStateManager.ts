import { DEFAULT_MAP_ID } from '@pinball/shared-types';

/**
 * Encapsule l'état applicatif du serveur.
 * SRP : une seule responsabilité — gérer l'état courant de la partie.
 * Remplace le `let currentMapId` global mutable qui vivait dans index.ts.
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
