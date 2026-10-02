/** The bus decoder that lets bit-banged I2C (SoftI2C, I2C.scan on the RP2040) reach devices. */
import { describe, expect, it } from 'vitest';
import { BitBangI2C } from '../src/core/sim/models/bitBangI2C';
import type { I2CDevice } from '../src/core/sim/mcu/mcu';

/** An open-drain controller driving the bus the way MicroPython's soft I2C does. */
class Controller {
  private sdaLow = false;
  private sclLow = false;
  constructor(private bus: BitBangI2C) {
    bus.update(false, false);
  }
  private sda(low: boolean) {
    this.sdaLow = low;
    this.bus.update(this.sdaLow, this.sclLow);
  }
  private scl(low: boolean) {
    this.sclLow = low;
    this.bus.update(this.sdaLow, this.sclLow);
  }
  start() {
    this.sda(false);
    this.scl(false);
    this.sda(true); // SDA falls while SCL is high
    this.scl(true);
  }
  stop() {
    this.sda(true);
    this.scl(false);
    this.sda(false); // SDA rises while SCL is high
  }
  /** Returns true when the byte was acknowledged. */
  write(byte: number): boolean {
    for (let i = 7; i >= 0; i--) {
      this.sda(!((byte >> i) & 1));
      this.scl(false);
      this.scl(true);
    }
    this.sda(false);
    this.scl(false);
    const ack = !this.bus.sda;
    this.scl(true);
    return ack;
  }
  read(ack: boolean): number {
    this.sda(false);
    let byte = 0;
    for (let i = 0; i < 8; i++) {
      this.scl(false);
      byte = (byte << 1) | (this.bus.sda ? 1 : 0);
      this.scl(true);
    }
    this.sda(ack);
    this.scl(false);
    this.scl(true);
    this.sda(false);
    return byte;
  }
}

/** A register device (EEPROM-like): first byte written selects the register. */
function registerDevice(address: number) {
  const regs = new Uint8Array(256);
  let ptr = 0;
  let first = true;
  const log: string[] = [];
  const dev: I2CDevice = {
    address,
    connect(write) {
      log.push(write ? 'W' : 'R');
      first = write;
      return true;
    },
    write(b) {
      if (first) ptr = b;
      else regs[ptr++] = b;
      first = false;
      return true;
    },
    read() {
      log.push('read');
      return regs[ptr++];
    },
    stop() {
      log.push('stop');
    },
  };
  return { dev, regs, log };
}

function setup() {
  const bus = new BitBangI2C(['SDA'], ['SCL']);
  const d = registerDevice(0x50);
  bus.devices.push(d.dev);
  return { bus, c: new Controller(bus), ...d };
}

describe('bit-banged I2C', () => {
  it('acknowledges only the addresses of devices on the bus (scan)', () => {
    const { c } = setup();
    const found: number[] = [];
    for (let a = 0x08; a < 0x78; a++) {
      c.start();
      if (c.write(a << 1)) found.push(a);
      c.stop();
    }
    expect(found).toEqual([0x50]);
  });

  it('writes registers', () => {
    const { c, regs, log } = setup();
    c.start();
    expect([c.write(0xa0), c.write(0x10), c.write(0xab), c.write(0xcd)]).toEqual([true, true, true, true]);
    c.stop();
    expect([regs[0x10], regs[0x11]]).toEqual([0xab, 0xcd]);
    expect(log).toEqual(['W', 'stop']);
  });

  it('reads registers after a repeated START and stops sending after the NACK', () => {
    const { bus, c, regs, log } = setup();
    regs.set([0x12, 0x34, 0x56], 0x20);
    c.start();
    c.write(0xa0);
    c.write(0x20);
    c.start(); // repeated START
    expect(c.write(0xa1)).toBe(true);
    expect([c.read(true), c.read(true), c.read(false)]).toEqual([0x12, 0x34, 0x56]);
    c.stop();
    expect(log).toEqual(['W', 'R', 'read', 'read', 'read', 'stop']);
    // The bus is released afterwards.
    expect([bus.sda, bus.scl]).toEqual([true, true]);
  });
});
