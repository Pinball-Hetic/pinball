import { isInBottomOutZone } from '../domain/PlayfieldGeometry';

export class DetectBottomOut {
  // laneSepX dérivé du spawn de la map (bottomOutLaneSepX(layout.spawns.ball.x)).
  constructor(private readonly laneSepX: number) {}

  check(pos: { x: number; z: number }): boolean {
    return isInBottomOutZone(pos.x, pos.z, this.laneSepX);
  }
}
