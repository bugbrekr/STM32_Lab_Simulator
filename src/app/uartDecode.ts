// Decode transmitted UART frames as seen by a receiver at a given baud rate.
import type { UartByte } from '../sim/mcu/mcu';

export interface RxState {
  /** time (s) after which the receiver is idle and hunting for a start bit */
  busyUntil: number;
}

function frameBits(b: UartByte): number[] {
  const bits = [0];
  for (let i = 0; i < b.bits; i++) bits.push((b.byte >> i) & 1);
  if (b.parity !== 'none') {
    let ones = 0;
    for (let i = 0; i < 8; i++) ones += (b.byte >> i) & 1;
    // parity bit replaces MSB when 8-bit word with parity (M=0): approximate by appending
    bits.push(b.parity === 'even' ? ones & 1 : (ones & 1) ^ 1);
  }
  const stop = Math.max(1, Math.round(b.stop));
  for (let i = 0; i < stop; i++) bits.push(1);
  return bits;
}

/**
 * Returns decoded bytes. If baud rates match (±3%) and frame is 8N1-compatible, bytes are passed through.
 * Otherwise the line waveform is re-sampled like a real UART receiver would.
 */
export function decodeUart(bytes: UartByte[], rxBaud: number, st: RxState): number[] {
  const out: number[] = [];
  if (!bytes.length) return out;
  const allMatch = bytes.every((b) => b.baud > 0 && Math.abs(b.baud - rxBaud) / rxBaud < 0.03 && b.bits === 8 && b.parity === 'none');
  if (allMatch) {
    for (const b of bytes) out.push(b.byte);
    return out;
  }
  // Build waveform segments: [tStart, bitTime, bits[]]
  const frames = bytes.filter((b) => b.baud > 0).map((b) => ({ t: b.t, bt: 1 / b.baud, bits: frameBits(b) }));
  const level = (t: number): number => {
    // binary search for frame containing t
    let lo = 0;
    let hi = frames.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const f = frames[mid];
      const end = f.t + f.bits.length * f.bt;
      if (t < f.t) hi = mid - 1;
      else if (t >= end) lo = mid + 1;
      else return f.bits[Math.floor((t - f.t) / f.bt)];
    }
    return 1;
  };
  const rbt = 1 / rxBaud;
  // candidate falling edges: start bits of frames and 1->0 transitions inside frames
  const edges: number[] = [];
  for (const f of frames) {
    let prev = 1;
    f.bits.forEach((b, i) => {
      if (prev === 1 && b === 0) edges.push(f.t + i * f.bt);
      prev = b;
    });
  }
  edges.sort((a, b) => a - b);
  let busyUntil = st.busyUntil;
  for (const e of edges) {
    if (e < busyUntil) continue;
    if (level(e + rbt / 2) !== 0) continue; // glitch, not a valid start bit
    let v = 0;
    for (let i = 0; i < 8; i++) if (level(e + (1.5 + i) * rbt)) v |= 1 << i;
    const stopOk = level(e + 9.5 * rbt) === 1;
    out.push(stopOk ? v : v | 0x80);
    busyUntil = e + 9.5 * rbt;
  }
  st.busyUntil = busyUntil;
  return out;
}

/** Render bytes as terminal text (\r handling, non-printables as ·) */
export function bytesToText(bytes: number[]): string {
  let s = '';
  for (const b of bytes) {
    if (b === 13) continue;
    if (b === 10 || b === 9) s += String.fromCharCode(b);
    else if (b >= 32 && b < 127) s += String.fromCharCode(b);
    else if (b >= 160) s += String.fromCharCode(b);
    else s += '�';
  }
  return s;
}
