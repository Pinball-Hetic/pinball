import {
  PlayfieldCinematicStrobe,
  type DecorLights,
  type PlayfieldCinematicStrobeConfig,
} from '@pinball/game-engine';

export {
  PlayfieldCinematicStrobe,
  type DecorLights,
  type PlayfieldCinematicStrobeConfig,
};

// Plus de wrapper : ST utilise la classe unifiée et passe ses lumières/visuels
// (GarlandLights, BumperVisuals) via le port décor. Cette fonction folde les
// deux décors nullables en un tableau DecorLights pour `mount(root, config, decor)`.
export function strangerthingsDecor(...lights: (DecorLights | null)[]): DecorLights[] {
  return lights.filter((d): d is DecorLights => d !== null);
}
