/** Registers the built-in MCU emulator families. */
import { registerMcuFamily } from './mcu';
import { AvrEmulator } from './avr/avrEmulator';
import { Rp2040Emulator } from './rp2040/rp2040Emulator';

registerMcuFamily('avr', (def) => new AvrEmulator(def));
registerMcuFamily('rp2040', (def) => new Rp2040Emulator(def));
