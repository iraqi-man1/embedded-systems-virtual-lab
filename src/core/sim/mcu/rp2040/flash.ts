/**
 * The Pico's QSPI flash chip (a W25Q16-style serial NOR flash) behind the
 * RP2040's SSI controller. rp2040js reads flash through the XIP window but
 * does not emulate programming it, which MicroPython needs for its file
 * system. The boot ROM's flash routines frame each command by forcing the
 * chip select through IO_QSPI and exchange bytes through SSI DR0; this
 * models both, so erase and page-program change the flash array.
 */
import { BasePeripheral, type RP2040 } from 'rp2040js';

const SECTOR = 4096;

/** Serial NOR flash command decoder; the memory is the chip's flash array. */
export class SerialFlash {
  private cmd = -1;
  private addr = 0;
  private addrBytes = 0;
  private dummy = 0;
  private writeEnabled = false;
  private index = 0;
  constructor(private memory: Uint8Array) {}

  /** Chip select released: the command ends. */
  deselect() {
    if (this.cmd === 0x02 || this.cmd === 0x20 || this.cmd === 0x52 || this.cmd === 0xd8 || this.cmd === 0x60 || this.cmd === 0xc7) this.writeEnabled = false;
    this.cmd = -1;
  }

  /** One byte in, one byte out (full duplex). */
  transfer(byte: number): number {
    if (this.cmd < 0) {
      this.cmd = byte;
      this.addr = 0;
      this.addrBytes = 0;
      this.index = 0;
      this.dummy = 0;
      switch (byte) {
        case 0x06:
          this.writeEnabled = true;
          break;
        case 0x04:
          this.writeEnabled = false;
          break;
        case 0x60:
        case 0xc7:
          if (this.writeEnabled) this.memory.fill(0xff);
          break;
      }
      return 0;
    }
    switch (this.cmd) {
      case 0x05: // read status 1: never busy; WEL in bit 1
        return this.writeEnabled ? 0x02 : 0x00;
      case 0x35: // read status 2 (QE set)
        return 0x02;
      case 0x9f: {
        // JEDEC ID: Winbond W25Q16 (2 MB)
        const id = [0xef, 0x40, 0x15];
        return id[this.index++] ?? 0;
      }
      case 0x4b: {
        // Unique ID: 4 dummy bytes, then 8 ID bytes.
        const i = this.index++;
        return i < 4 ? 0 : [0xe6, 0x60, 0x58, 0x38, 0x83, 0x34, 0x43, 0x2f][i - 4] ?? 0;
      }
      case 0x02: // page program: 3 address bytes, then data (NOR: bits only go 1 -> 0)
        if (this.addrBytes < 3) return this.address(byte);
        if (this.writeEnabled && this.addr < this.memory.length) {
          const page = this.addr & ~0xff;
          const at = page | ((this.addr + this.index++) & 0xff);
          this.memory[at] &= byte;
        }
        return 0;
      case 0x20: // 4 KB sector erase
      case 0x52: // 32 KB block erase
      case 0xd8: // 64 KB block erase
        if (this.addrBytes < 3) {
          this.address(byte);
          if (this.addrBytes === 3 && this.writeEnabled) {
            const size = this.cmd === 0x20 ? SECTOR : this.cmd === 0x52 ? 32 * 1024 : 64 * 1024;
            const start = this.addr & ~(size - 1);
            this.memory.fill(0xff, start, Math.min(this.memory.length, start + size));
          }
        }
        return 0;
      case 0x03: // read data
      case 0x0b: // fast read (one dummy byte)
        if (this.addrBytes < 3) return this.address(byte);
        if (this.cmd === 0x0b && this.dummy < 1) {
          this.dummy++;
          return 0;
        }
        return this.memory[(this.addr + this.index++) % this.memory.length];
      default:
        return 0;
    }
  }

  private address(byte: number): number {
    this.addr = ((this.addr << 8) | byte) >>> 0;
    this.addrBytes++;
    return 0;
  }
}

const SSI_TXFLR = 0x20;
const SSI_RXFLR = 0x24;
const SSI_SR = 0x28;
const SSI_DR0 = 0x60;
const SR_TFNF = 0x02;
const SR_TFE = 0x04;
const SR_RFNE = 0x08;

/** SSI controller: registers kept as written; DR0 exchanges bytes with the flash while it is selected. */
export class FlashSsi extends BasePeripheral {
  private regs = new Map<number, number>();
  private rx: number[] = [];
  selected = false;

  constructor(
    rp2040: RP2040,
    private flash: SerialFlash,
  ) {
    super(rp2040, 'SSI');
  }

  readUint32(offset: number): number {
    switch (offset) {
      case SSI_TXFLR:
        return 0;
      case SSI_RXFLR:
        return this.rx.length;
      case SSI_SR:
        return SR_TFE | SR_TFNF | (this.rx.length ? SR_RFNE : 0);
      case SSI_DR0:
        return this.rx.length ? this.rx.shift()! : 0;
      case 0x58:
        return 0x51535049; // IDR
      case 0x5c:
        return 0x3430312a; // SSI_COMP_VERSION
      default:
        return this.regs.get(offset) ?? 0;
    }
  }

  writeUint32(offset: number, value: number) {
    if (offset === SSI_DR0) {
      // SPI is full duplex: every byte sent clocks one byte back. Only bytes sent while software
      // holds the chip select (the ROM's flash routines) reach the flash; the rest (boot2's
      // set-up, clocking the flash out of XIP mode) read as 0, i.e. "ready".
      this.rx.push(this.selected ? this.flash.transfer(value & 0xff) : 0);
      if (this.rx.length > 16) this.rx.shift();
      return;
    }
    if (offset === 0x08 && !(value & 1)) this.rx = []; // SSIENR off flushes the FIFOs
    this.regs.set(offset, value >>> 0);
  }
}

/** IO_QSPI: only the chip-select override matters (OUTOVER of GPIO_QSPI_SS_CTRL). */
export class QspiIo extends BasePeripheral {
  private regs = new Map<number, number>();

  constructor(
    rp2040: RP2040,
    private ssi: FlashSsi,
    private flash: SerialFlash,
  ) {
    super(rp2040, 'IO_QSPI');
  }

  readUint32(offset: number): number {
    return this.regs.get(offset) ?? 0;
  }

  writeUint32(offset: number, value: number) {
    this.regs.set(offset, value >>> 0);
    if (offset === 0x0c) {
      // OUTOVER: 2 = drive low (selected), 3 = drive high (released), 0 = normal.
      const selected = ((value >>> 8) & 3) === 2;
      if (this.ssi.selected && !selected) this.flash.deselect();
      this.ssi.selected = selected;
    }
  }
}

/** Replaces rp2040js' SSI and IO_QSPI stubs so the flash can be erased and programmed. */
export function attachFlash(chip: RP2040) {
  const flash = new SerialFlash(chip.flash);
  const ssi = new FlashSsi(chip, flash);
  const peripherals = chip.peripherals as Record<number, BasePeripheral>;
  peripherals[0x18000] = ssi;
  peripherals[0x40018] = new QspiIo(chip, ssi, flash);
}
