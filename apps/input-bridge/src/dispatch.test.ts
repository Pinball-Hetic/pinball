import { test, expect, describe, mock } from 'bun:test';
import type { ButtonId, ButtonAction } from '@pinball/shared-types';
import { handleLine, createSocketEmitter, type BridgeEmitter, type InputSocket } from './dispatch';

function fakeEmitter() {
  const buttons: Array<{ id: ButtonId; action: ButtonAction }> = [];
  const tilts: number[] = [];
  const sensors: Array<{ id: string; value: number }> = [];
  const emitter: BridgeEmitter = {
    button(id, action) {
      buttons.push({ id, action });
    },
    tilt() {
      tilts.push(1);
    },
    sensor(id, value) {
      sensors.push({ id, value });
    },
  };
  return { emitter, buttons, tilts, sensors };
}

describe('handleLine — dispatch parse → emitter', () => {
  test('ligne bouton valide → emitter.button', () => {
    const { emitter, buttons, tilts, sensors } = fakeEmitter();
    handleLine('BTN:WHITE_LEFT:DOWN', emitter);
    expect(buttons).toEqual([{ id: 'WHITE_LEFT', action: 'DOWN' }]);
    expect(tilts).toHaveLength(0);
    expect(sensors).toHaveLength(0);
  });

  test('ligne tilt valide → emitter.tilt', () => {
    const { emitter, buttons, tilts, sensors } = fakeEmitter();
    handleLine('TILT:TRIGGERED', emitter);
    expect(tilts).toHaveLength(1);
    expect(buttons).toHaveLength(0);
    expect(sensors).toHaveLength(0);
  });

  test('ligne sensor valide → emitter.sensor', () => {
    const { emitter, buttons, tilts, sensors } = fakeEmitter();
    handleLine('SENSOR:PLUNGER:512', emitter);
    expect(sensors).toEqual([{ id: 'PLUNGER', value: 512 }]);
    expect(buttons).toHaveLength(0);
    expect(tilts).toHaveLength(0);
  });

  test('ligne inconnue → aucun emit', () => {
    const { emitter, buttons, tilts, sensors } = fakeEmitter();
    handleLine('BOOT noise from esp32', emitter);
    expect(buttons).toHaveLength(0);
    expect(tilts).toHaveLength(0);
    expect(sensors).toHaveLength(0);
  });

  test('ligne vide (parseLine → null) → aucun emit', () => {
    const { emitter, buttons, tilts, sensors } = fakeEmitter();
    handleLine('   ', emitter);
    expect(buttons).toHaveLength(0);
    expect(tilts).toHaveLength(0);
    expect(sensors).toHaveLength(0);
  });

  test('trim + dispatch (chemin parser → button)', () => {
    const { emitter, buttons } = fakeEmitter();
    handleLine('  BTN:PLUNGER:UP  ', emitter);
    expect(buttons).toEqual([{ id: 'PLUNGER', action: 'UP' }]);
  });
});

describe('createSocketEmitter — adaptateur socket', () => {
  test('button émet input:button avec le payload typé', () => {
    const emit = mock<InputSocket['emit']>(() => undefined);
    const emitter = createSocketEmitter({ emit } as unknown as InputSocket);
    emitter.button('WHITE_RIGHT', 'DOWN');
    expect(emit).toHaveBeenCalledWith('input:button', {
      id: 'WHITE_RIGHT',
      action: 'DOWN',
    });
  });

  test('tilt émet input:tilt TRIGGERED', () => {
    const emit = mock<InputSocket['emit']>(() => undefined);
    const emitter = createSocketEmitter({ emit } as unknown as InputSocket);
    emitter.tilt();
    expect(emit).toHaveBeenCalledWith('input:tilt', { state: 'TRIGGERED' });
  });

  test('sensor émet input:sensor avec id+value', () => {
    const emit = mock<InputSocket['emit']>(() => undefined);
    const emitter = createSocketEmitter({ emit } as unknown as InputSocket);
    emitter.sensor('PLUNGER', 42);
    expect(emit).toHaveBeenCalledWith('input:sensor', { id: 'PLUNGER', value: 42 });
  });
});
