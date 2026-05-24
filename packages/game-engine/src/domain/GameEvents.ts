export type GameEvent =
  | { type: 'BUMPER_HIT'; bumperIndex: number; scoreIncrement: number }
  | { type: 'SLINGSHOT_HIT'; side: 'left' | 'right'; scoreIncrement: number }
  | { type: 'RAMP_HIT'; scoreIncrement: number }
  | { type: 'DROP_TARGET_HIT'; targetId: string; scoreIncrement: number }
  | { type: 'DROP_TARGET_COMPLETE'; side: 'left' | 'right'; scoreIncrement: number }
  | { type: 'DROP_TARGET_RESET' }
  | { type: 'ZONE_HIT'; zone: string; scoreIncrement: number }
  | { type: 'DEMOGORGON_REVEAL'; scoreIncrement: number }
  | { type: 'DEMOGORGON_DEFEATED'; scoreIncrement: number }
  | { type: 'DRAIN' }
  | { type: 'BALL_LAUNCHED' };

export type GameEventListener = (event: GameEvent) => void;
