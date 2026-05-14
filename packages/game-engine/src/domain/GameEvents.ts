export type GameEvent =
  | { type: 'BUMPER_HIT'; bumperIndex: number; scoreIncrement: number }
  | { type: 'SLINGSHOT_HIT' }
  | { type: 'DRAIN' }
  | { type: 'BALL_LAUNCHED' };

export type GameEventListener = (event: GameEvent) => void;
