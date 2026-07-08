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

export function strangerthingsDecor(...lights: (DecorLights | null)[]): DecorLights[] {
  return lights.filter((d): d is DecorLights => d !== null);
}
