/** Intel HEX loader. Returns the number of bytes written. */
export function loadIntelHex(source: string, target: Uint8Array): number {
  let base = 0;
  let maxAddr = 0;
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line[0] !== ':') throw new Error(`Invalid HEX record: ${line.slice(0, 20)}`);
    const bytes = new Uint8Array(line.length / 2 - 0.5);
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(line.substr(1 + i * 2, 2), 16);
    const len = bytes[0];
    const addr = (bytes[1] << 8) | bytes[2];
    const type = bytes[3];
    let sum = 0;
    for (let i = 0; i < len + 5; i++) sum = (sum + bytes[i]) & 0xff;
    if (sum !== 0) throw new Error(`HEX checksum error at address ${addr.toString(16)}`);
    switch (type) {
      case 0x00: {
        const start = base + addr;
        if (start + len > target.length) throw new Error('Firmware does not fit in flash');
        target.set(bytes.subarray(4, 4 + len), start);
        maxAddr = Math.max(maxAddr, start + len);
        break;
      }
      case 0x01:
        return maxAddr;
      case 0x02:
        base = ((bytes[4] << 8) | bytes[5]) << 4;
        break;
      case 0x04:
        base = ((bytes[4] << 8) | bytes[5]) << 16;
        break;
      default:
        break; // start address records are irrelevant for AVR
    }
  }
  return maxAddr;
}
