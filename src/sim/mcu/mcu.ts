// STM32F401 peripheral models and memory-mapped bus.
import { ADC_CHANNEL_PIN, AF_TABLE, GPIO_PINS, PORT_BASE, TIMERS, TIMER_INFO, TimerName, extiIrq, signalOfAf, IRQ_HANDLERS } from './pins';

export interface CpuState {
  /** cycle counter */
  c: number;
  /** poll limit = min(budget, evt) or 0 when stepping */
  lim: number;
  budget: number;
  evt: number;
  sp: number;
  splim: number;
  /** current statement id */
  ln: number;
  /** call depth */
  d: number;
  /** caller statement per depth */
  ls: Int32Array;
  /** function id per depth */
  fs: Int32Array;
}

export interface PinState {
  mode: 'input' | 'output' | 'af' | 'analog';
  /** digital level as seen on the pin right now */
  level: 0 | 1;
  /** for PWM outputs */
  pwm?: { freq: number; duty: number; signal: string };
  /** output driven by MCU (output/af push-pull) */
  driven: boolean;
  pull: 'none' | 'up' | 'down';
  openDrain: boolean;
  af?: string | null;
}

export interface BoardIO {
  /** external digital drive on an input pin, or null if floating/not driven */
  pinInput(pin: string, t: number): 0 | 1 | null;
  /** analog voltage on a pin (for ADC), or null if not driven */
  pinAnalog(pin: string, t: number): number | null;
  /** MCU output changed */
  onPinChange(pin: string, t: number): void;
}

export class Fault extends Error {
  constructor(msg: string, public kind: 'hardfault' | 'stack' | 'user' = 'hardfault') {
    super(msg);
  }
}

const HSI = 16e6;
const HSE = 8e6; // Nucleo: 8 MHz MCO from ST-LINK

type RegHook = (v: number) => void;

abstract class Periph {
  regs: Uint32Array;
  constructor(public name: string, public base: number, public mcu: MCU, size = 0x400) {
    this.regs = new Uint32Array(size / 4);
  }
  /** clock gate name: e.g. ['AHB1ENR', 0] */
  gate: [string, number] | null = null;
  reset() {
    this.regs.fill(0);
  }
  read(off: number): number {
    return this.regs[off >> 2] >>> 0;
  }
  write(off: number, v: number) {
    this.regs[off >> 2] = v;
  }
}

// ---------------- RCC ----------------
class RCC extends Periph {
  static OFF = { CR: 0x00, PLLCFGR: 0x04, CFGR: 0x08, CIR: 0x0c, AHB1RSTR: 0x10, APB1RSTR: 0x20, APB2RSTR: 0x24, AHB1ENR: 0x30, AHB2ENR: 0x34, APB1ENR: 0x40, APB2ENR: 0x44, BDCR: 0x70, CSR: 0x74, DCKCFGR: 0x8c };
  reset() {
    super.reset();
    this.regs[0] = 0x00000083; // HSION, HSIRDY
    this.regs[1] = 0x24003010;
    this.regs[0x74 >> 2] = 0x0e000000;
  }
  read(off: number) {
    if (off === 0x00) {
      let v = this.regs[0];
      // ready flags follow enables
      v = v & 1 ? v | 2 : v & ~2; // HSIRDY
      v = v & (1 << 16) ? v | (1 << 17) : v & ~(1 << 17); // HSERDY
      v = v & (1 << 24) ? v | (1 << 25) : v & ~(1 << 25); // PLLRDY
      return v >>> 0;
    }
    if (off === 0x08) {
      // SWS mirrors SW
      const v = this.regs[2];
      return ((v & ~0xc) | ((v & 3) << 2)) >>> 0;
    }
    return super.read(off);
  }
  write(off: number, v: number) {
    super.write(off, v);
    if (off === 0x00 || off === 0x04 || off === 0x08) this.mcu.clocksChanged();
  }
  enabled(reg: string, bit: number): boolean {
    const off = (RCC.OFF as Record<string, number>)[reg];
    return ((this.regs[off >> 2] >>> bit) & 1) === 1;
  }
}

// ---------------- simple register files ----------------
class RegFile extends Periph {}

// ---------------- GPIO ----------------
class GPIO extends Periph {
  constructor(public port: string, base: number, mcu: MCU) {
    super('GPIO' + port, base, mcu);
    const idx: Record<string, number> = { A: 0, B: 1, C: 2, D: 3, E: 4, H: 7 };
    this.gate = ['AHB1ENR', idx[port]];
  }
  reset() {
    super.reset();
    if (this.port === 'A') {
      this.regs[0] = 0xa8000000;
      this.regs[2] = 0x0c000000;
      this.regs[3] = 0x64000000;
      this.regs[8] = 0; // AFRL
      this.regs[9] = 0; // AFRH (PA13/14 AF0)
    } else if (this.port === 'B') {
      this.regs[0] = 0x00000280;
      this.regs[2] = 0x000000c0;
      this.regs[3] = 0x00000100;
    }
  }
  read(off: number) {
    if (off === 0x10) {
      let v = 0;
      for (let n = 0; n < 16; n++) {
        const name = `P${this.port}${n}`;
        if (this.mcu.pinExists(name) && this.mcu.pinLevel(name)) v |= 1 << n;
      }
      return v >>> 0;
    }
    if (off === 0x18) return 0;
    return super.read(off);
  }
  write(off: number, v: number) {
    v >>>= 0;
    const prev = this.regs.slice(0, 10);
    if (off === 0x10) return; // IDR read-only
    if (off === 0x18) {
      // BSRR
      const set = v & 0xffff;
      const reset = (v >>> 16) & 0xffff;
      this.regs[5] = (this.regs[5] & ~reset) | set;
      this.regs[5] &= 0xffff;
    } else if (off === 0x14) {
      this.regs[5] = v & 0xffff;
    } else super.write(off, v);
    // notify changed pins
    let changed = 0;
    if (prev[5] !== this.regs[5]) changed |= prev[5] ^ this.regs[5];
    for (const r of [0, 1, 3]) {
      const d = prev[r] ^ this.regs[r];
      if (!d) continue;
      for (let n = 0; n < 16; n++) {
        const w = r === 1 ? 1 : 3;
        const sh = r === 1 ? n : n * 2;
        if ((d >>> sh) & w) changed |= 1 << n;
      }
    }
    for (const r of [8, 9]) {
      const d = prev[r] ^ this.regs[r];
      if (!d) continue;
      for (let i = 0; i < 8; i++) if ((d >>> (i * 4)) & 0xf) changed |= 1 << (i + (r === 9 ? 8 : 0));
    }
    if (changed) {
      for (let n = 0; n < 16; n++) if (changed & (1 << n)) this.mcu.pinChanged(`P${this.port}${n}`);
    }
  }
  mode(n: number) {
    return (this.regs[0] >>> (n * 2)) & 3;
  }
  pull(n: number) {
    return (this.regs[3] >>> (n * 2)) & 3;
  }
  af(n: number) {
    return (this.regs[n < 8 ? 8 : 9] >>> ((n & 7) * 4)) & 0xf;
  }
  odr(n: number) {
    return (this.regs[5] >>> n) & 1;
  }
  od(n: number) {
    return (this.regs[1] >>> n) & 1;
  }
}

// ---------------- Timer ----------------
class Timer extends Periph {
  info: (typeof TIMER_INFO)[TimerName];
  // counter model
  private running = false;
  private t0 = 0; // time at cnt0
  private cnt0 = 0;
  private updEvt: number | null = null;
  constructor(public tname: TimerName, mcu: MCU) {
    super(tname, TIMER_INFO[tname].base, mcu);
    this.info = TIMER_INFO[tname];
    this.gate = this.info.rccBit;
  }
  reset() {
    super.reset();
    this.regs[0x2c >> 2] = this.info.bits === 32 ? 0xffffffff : 0xffff; // ARR
    this.running = false;
    this.cnt0 = 0;
    if (this.updEvt !== null) this.mcu.cancel(this.updEvt);
    this.updEvt = null;
  }
  get psc() { return this.regs[0x28 >> 2] & 0xffff; }
  get arr() { return this.regs[0x2c >> 2] >>> 0; }
  ccr(ch: number) { return this.regs[(0x34 >> 2) + ch - 1] >>> 0; }
  clk(): number { return this.mcu.timerClock(this.info.apb); }
  tickHz() { return this.clk() / (this.psc + 1); }
  periodTicks() { return this.arr + 1; }
  cnt(t: number) {
    if (!this.running) return this.cnt0;
    const ticks = Math.floor((t - this.t0) * this.tickHz() + 1e-9);
    const p = this.periodTicks();
    return (this.cnt0 + ticks) % p;
  }
  private rebase() {
    const t = this.mcu.now();
    this.cnt0 = this.cnt(t);
    this.t0 = t;
  }
  read(off: number) {
    if (off === 0x24) return this.cnt(this.mcu.now());
    return super.read(off);
  }
  write(off: number, v: number) {
    v >>>= 0;
    if (off === 0x10) {
      // SR: rc_w0
      this.regs[4] &= v;
      return;
    }
    const wasRunning = this.running;
    if (off === 0x24 || off === 0x28 || off === 0x2c) this.rebase();
    if (off === 0x14) {
      // EGR
      if (v & 1) {
        this.cnt0 = 0;
        this.t0 = this.mcu.now();
      }
      return;
    }
    if (off === 0x28 && this.info.bits === 16) v &= 0xffff;
    if (off === 0x2c && this.info.bits === 16) v &= 0xffff;
    if (off === 0x24) {
      this.cnt0 = v;
      this.t0 = this.mcu.now();
    }
    super.write(off, v);
    if (off === 0x00) {
      const en = (v & 1) === 1;
      if (en && !wasRunning) {
        this.t0 = this.mcu.now();
        this.running = true;
      } else if (!en && wasRunning) {
        this.rebase();
        this.running = false;
      }
    }
    this.scheduleUpdate();
    this.mcu.timerOutputsChanged(this.tname);
  }
  scheduleUpdate() {
    if (this.updEvt !== null) {
      this.mcu.cancel(this.updEvt);
      this.updEvt = null;
    }
    const dier = this.regs[0x0c >> 2];
    if (!this.running || !(dier & 1)) return;
    const t = this.mcu.now();
    const remaining = this.periodTicks() - this.cnt(t);
    const dt = remaining / this.tickHz();
    this.updEvt = this.mcu.schedule(t + Math.max(dt, 1e-9), () => {
      this.updEvt = null;
      this.regs[4] |= 1; // UIF
      if (this.regs[0x0c >> 2] & 1) this.mcu.nvic.setPending(this.info.irq);
      this.scheduleUpdate();
    });
  }
  /** channel output state for PWM */
  channelOut(ch: number): { enabled: boolean; freq: number; duty: number; level: 0 | 1 } {
    const ccer = this.regs[0x20 >> 2];
    const en = ((ccer >>> ((ch - 1) * 4)) & 1) === 1;
    const pol = ((ccer >>> ((ch - 1) * 4 + 1)) & 1) === 1;
    const moe = !this.info.advanced || ((this.regs[0x44 >> 2] >>> 15) & 1) === 1;
    const ccmr = this.regs[(ch <= 2 ? 0x18 : 0x1c) >> 2];
    const mode = (ccmr >>> (((ch - 1) & 1) * 8 + 4)) & 7;
    const p = this.periodTicks();
    const freq = this.running ? this.tickHz() / p : 0;
    let duty = 0;
    let level: 0 | 1 = 0;
    const ccr = this.ccr(ch);
    const cnt = this.cnt(this.mcu.now());
    switch (mode) {
      case 6: duty = Math.min(1, ccr / p); level = cnt < ccr ? 1 : 0; break; // PWM1
      case 7: duty = 1 - Math.min(1, ccr / p); level = cnt < ccr ? 0 : 1; break; // PWM2
      case 5: duty = 1; level = 1; break; // forced active
      case 4: duty = 0; level = 0; break; // forced inactive
      case 3: duty = 0.5; level = 0; break; // toggle
      default: duty = 0; level = 0;
    }
    if (!this.running && (mode === 6 || mode === 7)) {
      duty = level;
    }
    if (pol) {
      duty = 1 - duty;
      level = (1 - level) as 0 | 1;
    }
    const enabled = en && moe;
    if (!enabled) return { enabled: false, freq: 0, duty: 0, level: 0 };
    return { enabled, freq: mode >= 6 ? freq : 0, duty, level };
  }
}

// ---------------- ADC ----------------
class ADC extends Periph {
  private eocAt = 0;
  constructor(mcu: MCU) {
    super('ADC1', 0x40012000, mcu);
    this.gate = ['APB2ENR', 8];
  }
  common = new Uint32Array(4);
  read(off: number) {
    if (off >= 0x300) return this.common[(off - 0x300) >> 2] >>> 0;
    if (off === 0x4c) {
      const v = this.regs[0x4c >> 2];
      this.regs[0] &= ~2; // clear EOC
      if (this.regs[2] & 2) this.convert(); // continuous
      return v >>> 0;
    }
    return super.read(off);
  }
  write(off: number, v: number) {
    v >>>= 0;
    if (off >= 0x300) {
      this.common[(off - 0x300) >> 2] = v;
      return;
    }
    if (off === 0x00) {
      this.regs[0] &= v;
      return;
    }
    super.write(off, v & (off === 0x08 ? ~(1 << 30) : 0xffffffff));
    if (off === 0x08 && v & (1 << 30)) {
      if (!(v & 1) && !(this.regs[2] & 1)) {
        this.mcu.warn('adc-off', 'ADC1: conversion started but ADC is not enabled (ADON=0)');
        return;
      }
      this.convert();
    }
  }
  sampleCycles(ch: number): number {
    const table = [3, 15, 28, 56, 84, 112, 144, 480];
    const smp = ch >= 10 ? (this.regs[0x0c >> 2] >>> ((ch - 10) * 3)) & 7 : (this.regs[0x10 >> 2] >>> (ch * 3)) & 7;
    return table[smp];
  }
  adcClock() {
    const pre = (this.common[1] >>> 16) & 3;
    return this.mcu.clocks().pclk2 / (2 * (pre + 1));
  }
  conversionTime(): number {
    const ch = this.regs[0x34 >> 2] & 0x1f;
    return (this.sampleCycles(ch) + 12) / this.adcClock();
  }
  convert() {
    const ch = this.regs[0x34 >> 2] & 0x1f;
    const t = this.mcu.now();
    let v: number;
    if (ch === 18) v = 0.76 + (25 - 25) * 0.0025;
    else if (ch === 17) v = 1.21;
    else v = this.mcu.analogPin(ADC_CHANNEL_PIN[ch] ?? '', t);
    const res = (this.regs[1] >>> 24) & 3;
    const bits = [12, 10, 8, 6][res];
    const max = (1 << bits) - 1;
    const noise = this.mcu.adcNoise ? (Math.random() - 0.5) * 2 * (this.mcu.adcNoise * max) / 4095 : 0;
    let code = Math.round((v / 3.3) * max + noise);
    code = Math.max(0, Math.min(max, code));
    const align = (this.regs[2] >>> 11) & 1;
    if (align) code = code << (16 - bits);
    this.regs[0x4c >> 2] = code;
    this.regs[0] |= 2 | 0x10; // EOC | STRT
    this.eocAt = t + this.conversionTime();
    this.mcu.adcConversions++;
  }
}

// ---------------- USART ----------------
export interface UartByte {
  t: number;
  byte: number;
  baud: number;
  bits: number;
  parity: 'none' | 'even' | 'odd';
  stop: number;
}

class USART extends Periph {
  rxQueue: number[] = [];
  constructor(name: string, base: number, mcu: MCU, gate: [string, number], public apb: 1 | 2, public irq: number, public txPin: string, public rxPin: string, public af: number) {
    super(name, base, mcu);
    this.gate = gate;
  }
  reset() {
    super.reset();
    this.regs[0] = 0xc0; // TXE | TC
    this.rxQueue = [];
  }
  baud(): number {
    const brr = this.regs[2] & 0xffff;
    if (!brr) return 0;
    const fck = this.apb === 1 ? this.mcu.clocks().pclk1 : this.mcu.clocks().pclk2;
    const over8 = (this.regs[3] >>> 15) & 1;
    if (over8) {
      const div = ((brr & 0xfff0) | ((brr & 7) << 1)) / 16;
      return fck / (8 * div);
    }
    return (fck * 16) / (16 * brr);
  }
  read(off: number) {
    if (off === 0x00) {
      let v = this.regs[0] | 0xc0;
      if (this.rxQueue.length) v |= 0x20;
      else v &= ~0x20;
      return v >>> 0;
    }
    if (off === 0x04) {
      const b = this.rxQueue.shift();
      return b ?? 0;
    }
    return super.read(off);
  }
  write(off: number, v: number) {
    if (off === 0x04) {
      const cr1 = this.regs[3];
      if (!(cr1 & (1 << 13)) || !(cr1 & (1 << 3))) {
        this.mcu.warn(this.name + '-te', `${this.name}: write to DR while USART or transmitter disabled (UE/TE=0); byte dropped`);
        return;
      }
      this.mcu.uartTx(this, v & 0x1ff);
      return;
    }
    if (off === 0x00) {
      this.regs[0] &= v | ~0x60;
      return;
    }
    super.write(off, v);
  }
  pushRx(bytes: number[]) {
    for (const b of bytes) this.rxQueue.push(b & 0xff);
    if (this.rxQueue.length > 64) this.rxQueue.splice(0, this.rxQueue.length - 64);
    if (this.regs[3] & (1 << 5)) this.mcu.nvic.setPending(this.irq);
  }
  frame() {
    const cr1 = this.regs[3];
    const m = (cr1 >>> 12) & 1;
    const pce = (cr1 >>> 10) & 1;
    const ps = (cr1 >>> 9) & 1;
    const stopBits = [1, 0.5, 2, 1.5][(this.regs[4] >>> 12) & 3];
    return { bits: m ? 9 : 8, parity: (pce ? (ps ? 'odd' : 'even') : 'none') as 'none' | 'even' | 'odd', stop: stopBits };
  }
}

// ---------------- EXTI / SYSCFG / NVIC ----------------
class EXTI extends Periph {
  constructor(mcu: MCU) {
    super('EXTI', 0x40013c00, mcu);
  }
  write(off: number, v: number) {
    if (off === 0x14) {
      this.regs[5] &= ~v;
      return;
    }
    if (off === 0x10) {
      // SWIER
      for (let l = 0; l < 23; l++) if (v & (1 << l) && this.regs[0] & (1 << l)) this.trigger(l);
      return;
    }
    super.write(off, v);
  }
  edge(line: number, rising: boolean) {
    const imr = this.regs[0];
    const rt = this.regs[2];
    const ft = this.regs[3];
    if (!(imr & (1 << line))) return;
    if ((rising && rt & (1 << line)) || (!rising && ft & (1 << line))) this.trigger(line);
  }
  trigger(line: number) {
    this.regs[5] |= 1 << line;
    this.mcu.nvic.setPending(extiIrq(line));
  }
}

export class NVIC {
  enabled = new Set<number>();
  pending = new Set<number>();
  priority = new Map<number, number>();
  primask = false;
  active: number[] = [];
  constructor(private mcu: MCU) {}
  reset() {
    this.enabled.clear();
    this.pending.clear();
    this.priority.clear();
    this.primask = false;
    this.active = [];
  }
  setPending(irq: number) {
    this.pending.add(irq);
    this.mcu.irqMaybe();
  }
  /** next IRQ to service, if any */
  next(): number | null {
    if (this.primask || this.active.length) return null;
    let best: number | null = null;
    let bestP = 999;
    for (const irq of this.pending) {
      if (!this.enabled.has(irq)) continue;
      const p = this.priority.get(irq) ?? 0;
      if (p < bestP || (p === bestP && best !== null && irq < best)) {
        best = irq;
        bestP = p;
      }
    }
    return best;
  }
  read(off: number): number {
    // 0xE000E100 ISER, 0x180 ICER, 0x200 ISPR, 0x280 ICPR, 0x400 IPR
    if (off >= 0x100 && off < 0x120) return this.bits(this.enabled, (off - 0x100) >> 2);
    if (off >= 0x180 && off < 0x1a0) return this.bits(this.enabled, (off - 0x180) >> 2);
    if (off >= 0x200 && off < 0x220) return this.bits(this.pending, (off - 0x200) >> 2);
    if (off >= 0x280 && off < 0x2a0) return this.bits(this.pending, (off - 0x280) >> 2);
    if (off >= 0x400 && off < 0x4f0) {
      let v = 0;
      for (let i = 0; i < 4; i++) v |= ((this.priority.get(off - 0x400 + i) ?? 0) << 4) << (i * 8);
      return v >>> 0;
    }
    return 0;
  }
  write(off: number, v: number) {
    const apply = (set: Set<number>, word: number, add: boolean) => {
      for (let b = 0; b < 32; b++) if (v & (1 << b)) (add ? set.add(word * 32 + b) : set.delete(word * 32 + b));
    };
    if (off >= 0x100 && off < 0x120) {
      apply(this.enabled, (off - 0x100) >> 2, true);
      this.mcu.irqMaybe();
    } else if (off >= 0x180 && off < 0x1a0) apply(this.enabled, (off - 0x180) >> 2, false);
    else if (off >= 0x200 && off < 0x220) {
      apply(this.pending, (off - 0x200) >> 2, true);
      this.mcu.irqMaybe();
    } else if (off >= 0x280 && off < 0x2a0) apply(this.pending, (off - 0x280) >> 2, false);
    else if (off >= 0x400 && off < 0x4f0) {
      for (let i = 0; i < 4; i++) this.priority.set(off - 0x400 + i, ((v >>> (i * 8)) & 0xff) >> 4);
    }
  }
  private bits(set: Set<number>, word: number) {
    let v = 0;
    for (let b = 0; b < 32; b++) if (set.has(word * 32 + b)) v |= 1 << b;
    return v >>> 0;
  }
}

class SysTick {
  ctrl = 0;
  load = 0;
  loadAt = 0;
  constructor(private mcu: MCU) {}
  read(off: number) {
    if (off === 0x10) return this.ctrl | 0;
    if (off === 0x14) return this.load;
    if (off === 0x18) {
      const f = this.mcu.clocks().hclk;
      const ticks = Math.floor((this.mcu.now() - this.loadAt) * f);
      return this.load ? this.load - (ticks % (this.load + 1)) : 0;
    }
    if (off === 0x1c) return 0x40000000 | 10499;
    return 0;
  }
  write(off: number, v: number) {
    if (off === 0x10) this.ctrl = v;
    else if (off === 0x14) {
      this.load = v & 0xffffff;
      this.loadAt = this.mcu.now();
    } else if (off === 0x18) this.loadAt = this.mcu.now();
  }
}

// ---------------- MCU ----------------
interface SchedEvent {
  id: number;
  t: number;
  fn: () => void;
}

export interface Clocks {
  sysclk: number;
  hclk: number;
  pclk1: number;
  pclk2: number;
  src: 'HSI' | 'HSE' | 'PLL';
}

export class MCU {
  S: CpuState;
  rcc: RCC;
  gpio: Record<string, GPIO> = {};
  timers: Record<string, Timer> = {};
  adc: ADC;
  usart2: USART;
  usart1: USART;
  usart6: USART;
  exti: EXTI;
  syscfg: RegFile;
  pwr: RegFile;
  flash: RegFile;
  nvic: NVIC;
  systick: SysTick;
  scb = new Uint32Array(0x100);
  private periphMap = new Map<number, Periph>();
  private generic = new Map<number, RegFile>();

  // time base
  private f = HSI;
  private t0 = 0;
  private c0 = 0;
  private clk: Clocks = { sysclk: HSI, hclk: HSI, pclk1: HSI, pclk2: HSI, src: 'HSI' };

  // events
  private events: SchedEvent[] = [];
  private evtId = 0;

  board: BoardIO | null = null;
  adcNoise = 2;
  adcConversions = 0;
  warnings: string[] = [];
  private warned = new Set<string>();
  uartOut: UartByte[] = [];
  /** pin -> [t, level][] traces for the logic analyzer */
  traces = new Map<string, [number, number][]>();
  watchAll = true;
  irqCheck = false;
  /** cached pin state for change detection */
  private lastPin = new Map<string, string>();

  constructor(S: CpuState) {
    this.S = S;
    this.rcc = new RCC('RCC', 0x40023800, this);
    for (const p of ['A', 'B', 'C', 'D', 'E', 'H']) this.gpio[p] = new GPIO(p, PORT_BASE[p], this);
    for (const t of TIMERS) this.timers[t] = new Timer(t, this);
    this.adc = new ADC(this);
    this.usart2 = new USART('USART2', 0x40004400, this, ['APB1ENR', 17], 1, 38, 'PA2', 'PA3', 7);
    this.usart1 = new USART('USART1', 0x40011000, this, ['APB2ENR', 4], 2, 37, 'PA9', 'PA10', 7);
    this.usart6 = new USART('USART6', 0x40011400, this, ['APB2ENR', 5], 2, 71, 'PC6', 'PC7', 8);
    this.exti = new EXTI(this);
    this.syscfg = new RegFile('SYSCFG', 0x40013800, this);
    this.syscfg.gate = ['APB2ENR', 14];
    this.pwr = new RegFile('PWR', 0x40007000, this);
    this.pwr.gate = ['APB1ENR', 28];
    this.flash = new RegFile('FLASH', 0x40023c00, this);
    this.nvic = new NVIC(this);
    this.systick = new SysTick(this);
    const all: Periph[] = [this.rcc, ...Object.values(this.gpio), ...Object.values(this.timers), this.adc, this.usart2, this.usart1, this.usart6, this.exti, this.syscfg, this.pwr, this.flash];
    for (const p of all) this.periphMap.set(p.base >>> 10, p);
    this.reset();
  }

  reset() {
    for (const p of this.periphMap.values()) p.reset();
    this.generic.clear();
    this.nvic.reset();
    this.events = [];
    this.f = HSI;
    this.t0 = 0;
    this.c0 = 0;
    this.S.c = 0;
    this.clk = { sysclk: HSI, hclk: HSI, pclk1: HSI, pclk2: HSI, src: 'HSI' };
    this.uartOut = [];
    this.traces.clear();
    this.lastPin.clear();
    this.warned.clear();
    this.warnings = [];
    this.updateEvt();
  }

  warn(key: string, msg: string) {
    if (this.warned.has(key)) return;
    this.warned.add(key);
    this.warnings.push(msg);
  }

  // ---- time ----
  now(): number {
    return this.t0 + (this.S.c - this.c0) / this.f;
  }
  cyclesAt(t: number): number {
    return this.c0 + (t - this.t0) * this.f;
  }
  sysclk() {
    return this.f;
  }
  clocks(): Clocks {
    return this.clk;
  }
  timerClock(apb: 1 | 2) {
    const c = this.clk;
    const pclk = apb === 1 ? c.pclk1 : c.pclk2;
    return pclk === c.hclk ? pclk : pclk * 2;
  }

  clocksChanged() {
    const cr = this.rcc.regs[0];
    const pll = this.rcc.regs[1];
    const cfgr = this.rcc.regs[2];
    const sw = cfgr & 3;
    let sys = HSI;
    let src: Clocks['src'] = 'HSI';
    if (sw === 1 && cr & (1 << 16)) {
      sys = HSE;
      src = 'HSE';
    } else if (sw === 2 && cr & (1 << 24)) {
      const m = pll & 0x3f;
      const n = (pll >>> 6) & 0x1ff;
      const p = (((pll >>> 16) & 3) + 1) * 2;
      const in_ = (pll >>> 22) & 1 ? HSE : HSI;
      if (m >= 2 && n >= 50) {
        sys = ((in_ / m) * n) / p;
        src = 'PLL';
      }
    }
    const hpre = (cfgr >>> 4) & 0xf;
    const ahbDiv = hpre < 8 ? 1 : [2, 4, 8, 16, 64, 128, 256, 512][hpre - 8];
    const apbDiv = (x: number) => (x < 4 ? 1 : [2, 4, 8, 16][x - 4]);
    const hclk = sys / ahbDiv;
    const pclk1 = hclk / apbDiv((cfgr >>> 10) & 7);
    const pclk2 = hclk / apbDiv((cfgr >>> 13) & 7);
    if (sys > 84e6 + 1) this.warn('overclock', `SYSCLK ${(sys / 1e6).toFixed(1)} MHz exceeds the STM32F401 maximum of 84 MHz`);
    if (pclk1 > 42e6 + 1) this.warn('apb1', `APB1 clock ${(pclk1 / 1e6).toFixed(1)} MHz exceeds the 42 MHz maximum`);
    const nowT = this.now();
    this.t0 = nowT;
    this.c0 = this.S.c;
    this.f = hclk;
    this.clk = { sysclk: sys, hclk, pclk1, pclk2, src };
    this.updateEvt();
    for (const t of Object.values(this.timers)) {
      t.scheduleUpdate();
      this.timerOutputsChanged(t.tname);
    }
  }

  // ---- events ----
  schedule(t: number, fn: () => void): number {
    const id = ++this.evtId;
    this.events.push({ id, t, fn });
    this.events.sort((a, b) => a.t - b.t);
    this.updateEvt();
    return id;
  }
  cancel(id: number) {
    this.events = this.events.filter((e) => e.id !== id);
    this.updateEvt();
  }
  updateEvt() {
    const e = this.events[0];
    let c = e ? Math.ceil(this.cyclesAt(e.t)) : Infinity;
    if (this.irqCheck) c = this.S.c;
    this.S.evt = c;
  }
  /** process due events; returns true if any */
  processEvents(): void {
    const nowT = this.now() + 1e-12;
    while (this.events.length && this.events[0].t <= nowT) {
      const e = this.events.shift()!;
      e.fn();
    }
    this.irqCheck = false;
    this.updateEvt();
  }
  irqMaybe() {
    this.irqCheck = true;
    this.S.evt = this.S.c;
    if (this.S.lim > this.S.c) this.S.lim = this.S.c;
  }

  // ---- clock gating ----
  private gateOk(p: Periph, write: boolean, addr: number): boolean {
    if (!p.gate) return true;
    if (this.rcc.enabled(p.gate[0], p.gate[1])) return true;
    this.warn(`gate-${p.name}`, `${p.name} clock is not enabled: ${write ? 'write ignored' : 'read returns 0'} at 0x${addr.toString(16).toUpperCase()}. Did you forget __HAL_RCC_${p.name}_CLK_ENABLE()?`);
    return false;
  }

  // ---- bus ----
  read32(addr: number): number {
    if (addr >= 0xe0000000) return this.readSys(addr);
    const p = this.periphMap.get(addr >>> 10);
    if (p) {
      if (!this.gateOk(p, false, addr)) return 0;
      return p.read(addr & 0x3ff) >>> 0;
    }
    return this.genericReg(addr).read(addr & 0x3ff);
  }
  write32(addr: number, v: number) {
    if (addr >= 0xe0000000) return this.writeSys(addr, v >>> 0);
    const p = this.periphMap.get(addr >>> 10);
    if (p) {
      if (!this.gateOk(p, true, addr)) return;
      p.write(addr & 0x3ff, v >>> 0);
      return;
    }
    this.genericReg(addr).write(addr & 0x3ff, v >>> 0);
  }
  read(addr: number, size: number): number {
    const a = addr & ~3;
    const sh = (addr & 3) * 8;
    const w = this.read32(a);
    if (size === 4) return w;
    return (w >>> sh) & (size === 1 ? 0xff : 0xffff);
  }
  write(addr: number, size: number, v: number) {
    if (size === 4) return this.write32(addr & ~3, v);
    const a = addr & ~3;
    const sh = (addr & 3) * 8;
    const mask = (size === 1 ? 0xff : 0xffff) << sh;
    // peripherals usually replicate narrow writes; do read-modify-write except for write-only regs
    const p = this.periphMap.get(a >>> 10);
    const off = a & 0x3ff;
    if (p instanceof GPIO && off === 0x18) {
      this.write32(a, (v << sh) >>> 0);
      return;
    }
    if (p instanceof USART && off === 0x04) {
      this.write32(a, v & 0x1ff);
      return;
    }
    const cur = p ? p.regs[off >> 2] : this.read32(a);
    this.write32(a, ((cur & ~mask) | ((v << sh) & mask)) >>> 0);
  }
  private genericReg(addr: number): RegFile {
    const key = addr >>> 10;
    let r = this.generic.get(key);
    if (!r) {
      r = new RegFile('PERIPH', key << 10, this);
      this.generic.set(key, r);
      this.warn(`gen-${key}`, `Access to unsimulated peripheral at 0x${(key << 10).toString(16).toUpperCase()} (treated as plain registers)`);
    }
    return r;
  }
  private readSys(addr: number): number {
    if (addr >= 0xe000e010 && addr < 0xe000e020) return this.systick.read(addr - 0xe000e000);
    if (addr >= 0xe000e100 && addr < 0xe000e500) return this.nvic.read(addr - 0xe000e000);
    if (addr >= 0xe000ed00 && addr < 0xe000ee00) return this.scb[(addr - 0xe000ed00) >> 2] >>> 0;
    if (addr === 0xe0042000) return 0x10006433; // DBGMCU IDCODE (F401xE)
    return 0;
  }
  private writeSys(addr: number, v: number) {
    if (addr >= 0xe000e010 && addr < 0xe000e020) return this.systick.write(addr - 0xe000e000, v);
    if (addr >= 0xe000e100 && addr < 0xe000e500) return this.nvic.write(addr - 0xe000e000, v);
    if (addr >= 0xe000ed00 && addr < 0xe000ee00) {
      if (addr === 0xe000ed0c && (v >>> 16) === 0x05fa && v & 4) throw new Fault('System reset requested (NVIC_SystemReset)', 'user');
      this.scb[(addr - 0xe000ed00) >> 2] = v;
    }
  }

  // ---- pins ----
  pinExists(pin: string): boolean {
    return GPIO_PINS.includes(pin);
  }
  /** Full state of a pin as seen from the outside world */
  pinState(pin: string): PinState {
    const port = this.gpio[pin[1]];
    const n = parseInt(pin.slice(2), 10);
    const mode = port.mode(n);
    const pullBits = port.pull(n);
    const pull = pullBits === 1 ? 'up' : pullBits === 2 ? 'down' : 'none';
    const od = port.od(n) === 1;
    if (mode === 1) {
      const lv = port.odr(n) as 0 | 1;
      if (od && lv === 1) return { mode: 'output', level: this.externalLevel(pin, pull), driven: false, pull, openDrain: true };
      return { mode: 'output', level: lv, driven: true, pull, openDrain: od };
    }
    if (mode === 2) {
      const af = port.af(n);
      const sig = signalOfAf(pin, af);
      const out = this.afOutput(sig);
      if (out) return { mode: 'af', level: out.level, driven: true, pull, openDrain: od, pwm: out.pwm, af: sig };
      return { mode: 'af', level: this.externalLevel(pin, pull), driven: false, pull, openDrain: od, af: sig };
    }
    if (mode === 3) return { mode: 'analog', level: 0, driven: false, pull, openDrain: false };
    return { mode: 'input', level: this.externalLevel(pin, pull), driven: false, pull, openDrain: false };
  }
  private externalLevel(pin: string, pull: 'none' | 'up' | 'down'): 0 | 1 {
    const ext = this.board?.pinInput(pin, this.now()) ?? null;
    if (ext !== null) return ext;
    if (pull === 'up') return 1;
    return 0;
  }
  pinLevel(pin: string): 0 | 1 {
    return this.pinState(pin).level;
  }
  private afOutput(sig: string | null): { level: 0 | 1; pwm?: PinState['pwm'] } | null {
    if (!sig) return null;
    const m = /^(TIM\d+)_CH(\d)$/.exec(sig);
    if (m) {
      const t = this.timers[m[1]];
      if (!t) return null;
      const o = t.channelOut(Number(m[2]));
      if (!o.enabled) return { level: 0 };
      return { level: o.level, pwm: { freq: o.freq, duty: o.duty, signal: sig } };
    }
    if (/USART\d_TX/.test(sig)) return { level: 1 };
    return null;
  }
  /** analog voltage for ADC */
  analogPin(pin: string, t: number): number {
    if (!pin) return 0;
    const st = this.pinState(pin);
    if (st.mode === 'output' && st.driven) return st.level * 3.3;
    if (st.mode !== 'analog') this.warn(`adc-mode-${pin}`, `ADC samples ${pin} but the pin is not in analog mode (GPIO_MODE_ANALOG)`);
    const v = this.board?.pinAnalog(pin, t);
    if (v !== null && v !== undefined) return Math.max(0, Math.min(3.3, v));
    return st.level * 3.3;
  }
  pinChanged(pin: string) {
    const st = this.pinState(pin);
    const isPwm = !!(st.pwm && st.pwm.freq > 0);
    const key = isPwm ? `${st.mode}|p|${st.pwm!.freq.toFixed(3)}:${st.pwm!.duty.toFixed(5)}` : `${st.mode}|${st.level}`;
    const prevKey = this.lastPin.get(pin);
    if (prevKey === key) return;
    this.lastPin.set(pin, key);
    const t = this.now();
    if (this.watchAll) {
      let tr = this.traces.get(pin);
      if (!tr) this.traces.set(pin, (tr = []));
      const lv = st.pwm && st.pwm.freq > 0 ? 2 + st.pwm.duty : st.level;
      if (!tr.length || tr[tr.length - 1][1] !== lv) {
        tr.push([t, lv]);
        if (tr.length > 4000) tr.splice(0, tr.length - 3000);
      }
    }
    this.board?.onPinChange(pin, t);
    // EXTI on input edges
    if (prevKey && !isPwm) {
      const prevLevel = prevKey.split('|')[1] === '1';
      if (prevKey.split('|')[1] !== 'p' && prevLevel !== (st.level === 1)) this.extiEdge(pin, st.level === 1);
    }
  }
  /** record the current state of all pins without generating events */
  primePins() {
    for (const p of GPIO_PINS) {
      const st = this.pinState(p);
      const isPwm = !!(st.pwm && st.pwm.freq > 0);
      this.lastPin.set(p, isPwm ? `${st.mode}|p|${st.pwm!.freq.toFixed(3)}:${st.pwm!.duty.toFixed(5)}` : `${st.mode}|${st.level}`);
    }
  }
  /** external world changed an input */
  externalChanged(pin: string) {
    this.pinChanged(pin);
  }
  private extiEdge(pin: string, rising: boolean) {
    const n = parseInt(pin.slice(2), 10);
    const portIdx: Record<string, number> = { A: 0, B: 1, C: 2, D: 3, E: 4, H: 7 };
    const exticr = this.syscfg.regs[2 + (n >> 2)];
    const sel = (exticr >>> ((n & 3) * 4)) & 0xf;
    if (sel !== portIdx[pin[1]]) return;
    this.exti.edge(n, rising);
  }
  timerOutputsChanged(tname: string) {
    for (const [pin, afs] of Object.entries(AF_TABLE)) {
      for (const [, sig] of afs) {
        if (sig.startsWith(tname + '_CH')) {
          const port = this.gpio[pin[1]];
          const n = parseInt(pin.slice(2), 10);
          if (port.mode(n) === 2) this.pinChanged(pin);
        }
      }
    }
  }

  // ---- UART ----
  uartTx(u: USART, byte: number) {
    const baud = u.baud();
    const st = this.pinState(u.txPin);
    if (!(st.mode === 'af' && st.af === `${u.name}_TX`)) {
      this.warn(`${u.name}-pin`, `${u.name}: byte transmitted but ${u.txPin} is not configured as ${u.name}_TX (AF${u.af}). Check HAL_UART_MspInit.`);
      return;
    }
    const f = u.frame();
    this.uartOut.push({ t: this.now(), byte, baud, bits: f.bits, parity: f.parity, stop: f.stop });
    if (this.uartOut.length > 20000) this.uartOut.splice(0, 10000);
  }
  usartByName(name: string): USART | null {
    return name === 'USART2' ? this.usart2 : name === 'USART1' ? this.usart1 : name === 'USART6' ? this.usart6 : null;
  }

  // ---- IRQ ----
  irqHandlerName(irq: number): string {
    return IRQ_HANDLERS[irq] ?? `IRQ${irq}_Handler`;
  }
}

export type { USART, Timer, GPIO, ADC };
