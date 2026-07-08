import type { ButtonId } from './socket-events'

export type GameAction = 'FLIP_LEFT' | 'FLIP_RIGHT' | 'PLUNGE' | 'START'

export interface CabinetButton {
  id: ButtonId
  gpio: number
  activeLow: boolean // true = internal pull-up, button wired to GND
  action?: GameAction
}

export const CABINET_BUTTONS: readonly CabinetButton[] = [
  { id: 'BLACK_LEFT', gpio: 16, activeLow: true },
  { id: 'WHITE_LEFT', gpio: 4, activeLow: true, action: 'FLIP_LEFT' },
  { id: 'FRONT_LEFT_GREEN', gpio: 17, activeLow: true },
  { id: 'FRONT_LEFT_YELLOW', gpio: 18, activeLow: true },
  { id: 'FRONT_LEFT_RED', gpio: 19, activeLow: true },
  { id: 'BLACK_RIGHT', gpio: 13, activeLow: true },
  { id: 'WHITE_RIGHT', gpio: 25, activeLow: true, action: 'FLIP_RIGHT' },
  { id: 'FRONT_WHITE', gpio: 33, activeLow: true, action: 'PLUNGE' },
  { id: 'PLUNGER', gpio: 32, activeLow: true, action: 'PLUNGE' },
]

export const BUTTON_ACTION: Partial<Record<ButtonId, GameAction>> =
  Object.fromEntries(
    CABINET_BUTTONS.filter((btn) => btn.action).map((btn) => [btn.id, btn.action!]),
  )
