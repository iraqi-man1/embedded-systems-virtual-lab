/**
 * I2C as seen on the wires, for controllers that bit-bang the bus: MicroPython's
 * SoftI2C, the zero-length writes `I2C.scan()` makes on the RP2040, software
 * I2C libraries on the AVR. Hardware I2C peripherals reach the devices at
 * protocol level; this decodes the controller's open-drain waveform instead
 * and answers for the devices on the bus, pulling SDA low to acknowledge and
 * to send the bits of bytes being read. Released lines read high (I2C modules
 * carry pull-up resistors) and devices never stretch the clock.
 */
import type { I2CDevice } from '../mcu/mcu';

type Phase = 'idle' | 'address' | 'write' | 'read' | 'ignore';

export class BitBangI2C {
  readonly devices: I2CDevice[] = [];
  /** Line levels (true = high). */
  sda = true;
  scl = true;
  /** A device pulls SDA low. */
  private deviceLow = false;
  private phase: Phase = 'idle';
  /** Clock pulses (rising edges) of the current byte. */
  private bits = 0;
  private byte = 0;
  /** In the acknowledge (9th) clock of a byte. */
  private ackSlot = false;
  /** Phase after the address byte's acknowledge. */
  private next: Phase = 'idle';
  private dev: I2CDevice | null = null;
  /** Byte a device is sending to the controller. */
  private sending = 0;
  private controllerAck = false;

  constructor(
    readonly sdaPins: string[],
    readonly sclPins: string[],
  ) {}

  /** The controller's drive changed: `sdaLow` / `sclLow` = it pulls that line low. */
  update(sdaLow: boolean, sclLow: boolean) {
    const scl = !sclLow;
    const sda = !(sdaLow || this.deviceLow);
    if (scl && this.scl && sda !== this.sda) {
      // SDA changing while SCL is high: START (falling) or STOP (rising).
      if (sda) this.stop();
      else this.start();
    } else if (scl && !this.scl) this.rising(sda);
    else if (!scl && this.scl) this.falling();
    this.scl = scl;
    this.sda = !(sdaLow || this.deviceLow);
  }

  reset() {
    this.sda = this.scl = true;
    this.deviceLow = this.ackSlot = false;
    this.phase = 'idle';
    this.dev = null;
  }

  private start() {
    // A repeated START keeps the device selected (register read after a register write).
    this.phase = 'address';
    this.bits = this.byte = 0;
    this.ackSlot = this.deviceLow = false;
  }

  private stop() {
    this.dev?.stop();
    this.reset();
  }

  /** SCL rises: the receiver samples SDA. */
  private rising(sda: boolean) {
    if (this.phase === 'idle' || this.phase === 'ignore') return;
    if (this.ackSlot) {
      if (this.phase === 'read') this.controllerAck = !sda;
      return;
    }
    if (this.phase !== 'read') this.byte = ((this.byte << 1) | (sda ? 1 : 0)) & 0xff;
    this.bits++;
  }

  /** SCL falls: SDA may change for the next bit. */
  private falling() {
    if (this.phase === 'idle' || this.phase === 'ignore') return;
    if (this.ackSlot) {
      // End of the acknowledge clock.
      this.ackSlot = this.deviceLow = false;
      this.bits = this.byte = 0;
      if (this.phase === 'address') {
        this.phase = this.next;
        if (this.phase === 'read') this.load();
      } else if (this.phase === 'read') {
        if (this.controllerAck) this.load();
        else this.phase = 'ignore'; // NACK: last byte, a STOP follows
      }
      return;
    }
    if (this.bits < 8) {
      // While sending, put the next bit on SDA (MSB first).
      if (this.phase === 'read') this.deviceLow = !((this.sending >> (7 - this.bits)) & 1);
      return;
    }
    // Eighth bit done: acknowledge slot.
    this.ackSlot = true;
    if (this.phase === 'address') {
      const address = this.byte >> 1;
      const read = !!(this.byte & 1);
      const dev = this.devices.find((d) => d.address === address) ?? null;
      const ack = !!dev && dev.connect(!read);
      this.dev = ack ? dev : null;
      this.next = ack ? (read ? 'read' : 'write') : 'ignore';
      this.deviceLow = ack;
    } else if (this.phase === 'write') {
      this.deviceLow = !!this.dev?.write(this.byte);
    } else {
      // Read: release SDA for the controller's ACK/NACK.
      this.deviceLow = false;
    }
  }

  /** Next byte from the device; its first bit goes on SDA right away. */
  private load() {
    this.sending = (this.dev?.read(true) ?? 0xff) & 0xff;
    this.deviceLow = !(this.sending & 0x80);
  }
}
