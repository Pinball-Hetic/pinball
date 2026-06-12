import type { MapModule } from '@pinball/game-engine'

// Module de comportement Stranger Things. L'extraction du comportement ST
// (visuals, upside down, bosses, hetic) depuis PinballPlayfield se fait
// progressivement (phase 4.3), validée en jeu. Vide pour l'instant : le
// pipeline (setup/onGameEvent/update/dispose) tourne mais ne fait rien →
// comportement strictement identique tant qu'on n'y déplace rien.
export function createModule(): MapModule {
  return {
    setup(): void {},
    onGameEvent(): void {},
    update(): void {},
    onGameReset(): void {},
    dispose(): void {},
  }
}
