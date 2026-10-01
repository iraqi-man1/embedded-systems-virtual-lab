/** Registers the built-in MCU emulator families. */
import { registerMcuFamily } from './mcu';
import { AvrEmulator } from './avr/avrEmulator';

registerMcuFamily('avr', (def) => new AvrEmulator(def));
