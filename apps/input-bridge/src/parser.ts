import type { ButtonId, ButtonAction } from '@pinball/shared-types';
import { CABINET_BUTTONS } from '@pinball/shared-types';

export type ParsedLine =
  | { kind: 'button'; id: ButtonId; action: ButtonAction }
  | { kind: 'tilt' }
  | { kind: 'sensor'; id: string; value: number }
  | { kind: 'unknown'; line: string };

const VALID_BUTTON_IDS: readonly ButtonId[] = CABINET_BUTTONS.map((b) => b.id);

export function isButtonId(value: string): value is ButtonId {
  return (VALID_BUTTON_IDS as readonly string[]).includes(value);
}

export function parseLine(raw: string): ParsedLine | null {
  const line = raw.trim();
  if (!line) return null;
  const parts = line.split(':');

  if (parts[0] === 'BTN' && parts.length === 3) {
    const id = parts[1];
    const action = parts[2];
    if (!isButtonId(id)) return { kind: 'unknown', line };
    if (action !== 'DOWN' && action !== 'UP') return { kind: 'unknown', line };
    return { kind: 'button', id, action };
  }

  if (parts[0] === 'TILT' && parts[1] === 'TRIGGERED' && parts.length === 2) {
    return { kind: 'tilt' };
  }

  if (parts[0] === 'SENSOR' && parts.length === 3) {
    const value = Number(parts[2]);
    if (Number.isNaN(value)) return { kind: 'unknown', line };
    return { kind: 'sensor', id: parts[1], value };
  }

  return { kind: 'unknown', line };
}
