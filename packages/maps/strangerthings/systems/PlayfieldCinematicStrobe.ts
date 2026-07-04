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

// ST uses the unified class and passes its lights/visuals (GarlandLights,
// BumperVisuals) via the decor port. This function folds the two nullable
// decors into a DecorLights array for `mount(root, config, decor)`.
export function strangerthingsDecor(...lights: (DecorLights | null)[]): DecorLights[] {
  return lights.filter((d): d is DecorLights => d !== null);
}
