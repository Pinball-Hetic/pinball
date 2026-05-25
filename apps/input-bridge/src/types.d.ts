// @serialport/binding-mock@10.2.2 has a "types" field but no "types" condition
// in its "exports" map, so TS bundler resolution can't find the .d.ts. Shim it
// by re-declaring the surface we use.
declare module '@serialport/binding-mock' {
  import type { BindingInterface } from '@serialport/bindings-interface';

  export interface CreatePortOptions {
    echo?: boolean;
    record?: boolean;
    readyData?: Buffer;
    maxReadSize?: number;
  }

  export interface MockBindingInterface extends BindingInterface {
    reset(): void;
    createPort(path: string, opt?: CreatePortOptions): void;
  }

  export const MockBinding: MockBindingInterface;
}
