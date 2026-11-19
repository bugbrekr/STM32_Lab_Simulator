// Runtime for compiled C programs: memory, polling, interrupts, debugger hooks.
import { FLASH_BASE, FLASH_SIZE, FN_BASE, Program, RAM_BASE, RAM_SIZE, RODATA_BASE } from './cc/codegen';
import { CpuState, Fault, MCU } from './mcu/mcu';
import { createNatives } from './hal/natives';
import type { CType } from './cc/types';

export type Layouts = Record<string, Record<string, { off: number; size: number }>>;
export type LoadedProgram = Program & { layouts: Layouts };

type GenFn = (...args: number[]) => Generator<number, number | void, unknown>;

export interface PauseInfo {
  sid: number;
  scopeId: number;
  getLocals: (() => number[]) | null;
  depth: number;
  reason: 'breakpoint' | 'step' | 'pause';
}

export type StepMode = 'none' | 'into' | 'over' | 'out' | 'pause';

const RAM_END = RAM_BASE + RAM_SIZE;

export interface RuntimeSettings {
  printfFloat: boolean;
}

export class Runtime {
  S: CpuState;
  mcu: MCU;
  ram = new Uint8Array(RAM_SIZE);
  ramDV = new DataView(this.ram.buffer);
  flash = new Uint8Array(FLASH_SIZE);
  flashDV = new DataView(this.flash.buffer);
  B: Uint8Array;
  program: LoadedProgram;
  mod!: { init: () => Generator; fns: Record<number, GenFn>; user: Record<string, GenFn> };
  natives: Record<string, (...a: any[]) => unknown>;
  user: Record<string, GenFn> = {};
  R: Record<string, unknown>;
  // debugger
  step: StepMode = 'none';
  stepDepth = 0;
  pauseInfo: PauseInfo | null = null;
  bpActive = false;
  // misc state used by natives
  tickBase = 0;
  tickRunning = false;
  stdoutBuf: number[] = [];
  settings: RuntimeSettings = { printfFloat: false };
  randSeed = 1;
  isrDepth = 0;
  /** reported status, e.g. stuck in a handler */
  status = '';
  private warnedNull = false;

  constructor(program: LoadedProgram, mcu: MCU) {
    this.program = program;
    this.mcu = mcu;
    this.S = mcu.S;
    this.B = new Uint8Array(program.stmts.length + 1);
    const self = this;
    const ram = this.ram;
    const dv = this.ramDV;
    const RB = RAM_BASE;
    const slowRead = (a: number, size: number, signed: boolean): number => self.slowRead(a, size, signed);
    const slowWrite = (a: number, size: number, v: number) => self.slowWrite(a, size, v);
    const R: Record<string, unknown> = {
      B: this.B,
      ld8: (a: number) => (a >= RB && a < RAM_END ? ram[a - RB] : slowRead(a, 1, false)),
      ld8s: (a: number) => (a >= RB && a < RAM_END ? (ram[a - RB] << 24) >> 24 : slowRead(a, 1, true)),
      ld16: (a: number) => (a >= RB && a + 2 <= RAM_END ? dv.getUint16(a - RB, true) : slowRead(a, 2, false)),
      ld16s: (a: number) => (a >= RB && a + 2 <= RAM_END ? dv.getInt16(a - RB, true) : slowRead(a, 2, true)),
      ld32: (a: number) => (a >= RB && a + 4 <= RAM_END ? dv.getUint32(a - RB, true) : slowRead(a, 4, false)),
      ld32s: (a: number) => (a >= RB && a + 4 <= RAM_END ? dv.getInt32(a - RB, true) : slowRead(a, 4, true) | 0),
      ld64: (a: number) => (a >= RB && a + 8 <= RAM_END ? Number(dv.getBigUint64(a - RB, true)) : slowRead(a, 4, false) + slowRead(a + 4, 4, false) * 4294967296),
      ld64s: (a: number) => (a >= RB && a + 8 <= RAM_END ? Number(dv.getBigInt64(a - RB, true)) : slowRead(a, 4, false) + (slowRead(a + 4, 4, true) | 0) * 4294967296),
      ldf: (a: number) => {
        if (a >= RB && a + 4 <= RAM_END) return dv.getFloat32(a - RB, true);
        const tmp = new DataView(new ArrayBuffer(4));
        tmp.setUint32(0, slowRead(a, 4, false), true);
        return tmp.getFloat32(0, true);
      },
      ldd: (a: number) => {
        if (a >= RB && a + 8 <= RAM_END) return dv.getFloat64(a - RB, true);
        const tmp = new DataView(new ArrayBuffer(8));
        tmp.setUint32(0, slowRead(a, 4, false), true);
        tmp.setUint32(4, slowRead(a + 4, 4, false), true);
        return tmp.getFloat64(0, true);
      },
      st8: (a: number, v: number) => {
        if (a >= RB && a < RAM_END) ram[a - RB] = v;
        else slowWrite(a, 1, v);
        return v;
      },
      st16: (a: number, v: number) => {
        if (a >= RB && a + 2 <= RAM_END) dv.setUint16(a - RB, v, true);
        else slowWrite(a, 2, v);
        return v;
      },
      st32: (a: number, v: number) => {
        if (a >= RB && a + 4 <= RAM_END) dv.setUint32(a - RB, v >>> 0, true);
        else slowWrite(a, 4, v);
        return v;
      },
      st64: (a: number, v: number) => {
        const b = BigInt.asUintN(64, BigInt(Math.trunc(v)));
        if (a >= RB && a + 8 <= RAM_END) dv.setBigUint64(a - RB, b, true);
        else {
          slowWrite(a, 4, Number(b & 0xffffffffn));
          slowWrite(a + 4, 4, Number(b >> 32n));
        }
        return v;
      },
      stf: (a: number, v: number) => {
        if (a >= RB && a + 4 <= RAM_END) dv.setFloat32(a - RB, v, true);
        else {
          const tmp = new DataView(new ArrayBuffer(4));
          tmp.setFloat32(0, v, true);
          slowWrite(a, 4, tmp.getUint32(0, true));
        }
        return v;
      },
      std: (a: number, v: number) => {
        if (a >= RB && a + 8 <= RAM_END) dv.setFloat64(a - RB, v, true);
        else {
          const tmp = new DataView(new ArrayBuffer(8));
          tmp.setFloat64(0, v, true);
          slowWrite(a, 4, tmp.getUint32(0, true));
          slowWrite(a + 4, 4, tmp.getUint32(4, true));
        }
        return v;
      },
      memcpy: (d: number, s: number, n: number) => {
        if (d >= RB && d + n <= RAM_END && s >= RB && s + n <= RAM_END) ram.copyWithin(d - RB, s - RB, s - RB + n);
        else {
          const tmp: number[] = [];
          for (let i = 0; i < n; i++) tmp.push((R.ld8 as (a: number) => number)(s + i));
          for (let i = 0; i < n; i++) (R.st8 as (a: number, v: number) => number)(d + i, tmp[i]);
        }
        return d;
      },
      memset: (d: number, v: number, n: number) => {
        if (d >= RB && d + n <= RAM_END) ram.fill(v & 0xff, d - RB, d - RB + n);
        else for (let i = 0; i < n; i++) (R.st8 as (a: number, v: number) => number)(d + i, v);
        return d;
      },
      copyBytes: (d: number, bytes: number[]) => {
        for (let i = 0; i < bytes.length; i++) (R.st8 as (a: number, v: number) => number)(d + i, bytes[i]);
        return d;
      },
      sdiv: (a: number, b: number) => (b === 0 ? 0 : (a / b) | 0),
      udiv: (a: number, b: number) => (b === 0 ? 0 : Math.floor(a / b) >>> 0),
      smod: (a: number, b: number) => (b === 0 ? a : a % b | 0),
      umod: (a: number, b: number) => (b === 0 ? a : (a % b) >>> 0),
      f2s: (x: number) => (x !== x ? 0 : x >= 2147483647 ? 2147483647 : x <= -2147483648 ? -2147483648 : x | 0),
      f2u: (x: number) => (x !== x || x <= 0 ? 0 : x >= 4294967295 ? 4294967295 : Math.trunc(x) >>> 0),
      fr: Math.fround,
      W64: (v: number, signed: boolean) => {
        if (!Number.isFinite(v)) return 0;
        v = Math.trunc(v);
        if (Number.isSafeInteger(v) && (signed || v >= 0)) return v;
        const b = BigInt(v);
        return Number(signed ? BigInt.asIntN(64, b) : BigInt.asUintN(64, b));
      },
      T64: (x: number, signed: boolean) => {
        if (x !== x) return 0;
        if (signed) return Math.max(-9223372036854775808, Math.min(9223372036854775807, Math.trunc(x)));
        return x <= 0 ? 0 : Math.min(18446744073709551615, Math.trunc(x));
      },
      I64: (op: string, a: number, b: number, signed: boolean) => {
        const A = BigInt(Math.trunc(a));
        const Bv = BigInt(Math.trunc(b));
        let r: bigint;
        switch (op) {
          case '+': r = A + Bv; break;
          case '-': r = A - Bv; break;
          case '*': r = A * Bv; break;
          case '/': r = Bv === 0n ? 0n : A / Bv; break;
          case '%': r = Bv === 0n ? A : A % Bv; break;
          case '&': r = A & Bv; break;
          case '|': r = A | Bv; break;
          case '^': r = A ^ Bv; break;
          case '<<': r = A << (Bv & 63n); break;
          case '>>': r = (signed ? BigInt.asIntN(64, A) : BigInt.asUintN(64, A)) >> (Bv & 63n); break;
          default: r = 0n;
        }
        return Number(signed ? BigInt.asIntN(64, r) : BigInt.asUintN(64, r));
      },
      P: function* (sid: number, scopeId: number, getLocals: (() => number[]) | null) {
        yield* self.poll(sid, scopeId, getLocals);
      },
      stackOverflow: () => {
        throw new Fault('Stack overflow: the stack pointer ran into the global variables (too many nested calls or large local arrays)', 'stack');
      },
      callPtr: function* (addr: number, args: number[]) {
        return yield* self.callAddr(addr, args);
      },
      callExt: function* (name: string, args: number[]) {
        const f = self.user[name];
        if (f) return yield* f(...args);
        const n = self.natives[name];
        if (n) {
          const r = n(...args);
          if (r && typeof (r as Generator).next === 'function') return yield* r as Generator<number, number>;
          return r as number;
        }
        throw new Fault(`call to undefined function ${name}`);
      },
      fnAddr: (name: string) => {
        const f = self.program.funcs.find((x) => x.name === name);
        if (f) return FN_BASE + f.id * 4 + 1;
        const id = self.program.nativeIds[name];
        return id ? FN_BASE + id * 4 + 1 : 0;
      },
    };
    this.R = R;
    this.natives = createNatives(this);
  }

  // ---- memory slow paths ----
  slowRead(a: number, size: number, signed: boolean): number {
    a >>>= 0;
    let v: number;
    if (a < 0x00080000) {
      if (a < 4 && !this.warnedNull) {
        this.warnedNull = true;
        this.mcu.warn('null-read', `Read from address 0x${a.toString(16).padStart(8, '0')} — NULL pointer dereference? (reads return Flash contents on STM32)`);
      }
      v = this.flashRead(a, size);
    } else if (a >= FLASH_BASE && a + size <= FLASH_BASE + FLASH_SIZE) v = this.flashRead(a - FLASH_BASE, size);
    else if ((a >= 0x40000000 && a < 0x60000000) || a >= 0xe0000000) v = this.mcu.read(a, size);
    else if (a >= 0x1fff7a10 && a < 0x1fff7a20) v = [0x00350040, 0x3233510d, 0x34313739][(a - 0x1fff7a10) >> 2] ?? 0;
    else if (a === 0x1fff7a22) v = 512;
    else throw new Fault(`HardFault: bus error reading ${size * 8}-bit value at invalid address 0x${a.toString(16).toUpperCase().padStart(8, '0')}`);
    if (signed) {
      if (size === 1) return (v << 24) >> 24;
      if (size === 2) return (v << 16) >> 16;
      return v | 0;
    }
    return v >>> 0;
  }
  private flashRead(off: number, size: number) {
    if (size === 1) return this.flash[off];
    if (size === 2) return this.flashDV.getUint16(off, true);
    return this.flashDV.getUint32(off, true);
  }
  slowWrite(a: number, size: number, v: number) {
    a >>>= 0;
    if ((a >= 0x40000000 && a < 0x60000000) || a >= 0xe0000000) {
      this.mcu.write(a, size, v >>> 0);
      return;
    }
    if (a < 0x00080000) throw new Fault(`HardFault: write to address 0x${a.toString(16).toUpperCase().padStart(8, '0')} — NULL pointer write?`);
    if (a >= FLASH_BASE && a < FLASH_BASE + FLASH_SIZE) throw new Fault(`HardFault: write to Flash at 0x${a.toString(16).toUpperCase()} (string literals and const data are read-only)`);
    throw new Fault(`HardFault: bus error writing to invalid address 0x${a.toString(16).toUpperCase().padStart(8, '0')}`);
  }

  // ---- loading ----
  load() {
    const js = this.program.js;
    const factory = new Function('R', 'N', 'S', js) as (R: unknown, N: unknown, S: unknown) => typeof this.mod;
    this.mod = factory(this.R, this.natives, this.S);
    this.user = this.mod.user;
  }

  /** Reset memory and start a fresh main() generator. */
  start(): Generator<number, unknown, unknown> {
    this.ram.fill(0);
    this.flash.fill(0);
    // vector table: initial SP + reset handler
    this.flashDV.setUint32(0, RAM_END, true);
    this.flashDV.setUint32(4, FLASH_BASE + 0x1c1, true);
    this.flash.set(this.program.rodata, RODATA_BASE - FLASH_BASE);
    const S = this.S;
    S.sp = RAM_END;
    S.splim = Math.ceil(this.program.dataEnd / 8) * 8;
    S.d = 0;
    S.ln = 0;
    this.tickRunning = false;
    this.tickBase = 0;
    this.stdoutBuf = [];
    this.isrDepth = 0;
    this.status = '';
    this.pauseInfo = null;
    this.randSeed = 1;
    const mainF = this.program.funcs.find((f) => f.name === 'main' && !f.isStatic)!;
    const self = this;
    function* boot() {
      // Reset_Handler: copy .data, zero .bss (via __init), SystemInit, main
      S.c += 200;
      yield* self.mod.init() as Generator<number, unknown, unknown>;
      const r = yield* self.mod.fns[mainF.id]();
      return r;
    }
    return boot();
  }

  // ---- helpers for natives ----
  r8(a: number) { return (this.R.ld8 as (a: number) => number)(a); }
  r16(a: number) { return (this.R.ld16 as (a: number) => number)(a); }
  r32(a: number) { return (this.R.ld32 as (a: number) => number)(a); }
  w8(a: number, v: number) { (this.R.st8 as (a: number, v: number) => number)(a, v); }
  w16(a: number, v: number) { (this.R.st16 as (a: number, v: number) => number)(a, v); }
  w32(a: number, v: number) { (this.R.st32 as (a: number, v: number) => number)(a, v); }
  fieldAddr(ptr: number, type: string, path: string): number {
    const l = this.program.layouts[type]?.[path];
    if (!l) throw new Error(`layout ${type}.${path} missing`);
    return ptr + l.off;
  }
  fld(ptr: number, type: string, path: string): number {
    const l = this.program.layouts[type]?.[path];
    if (!l) throw new Error(`layout ${type}.${path} missing`);
    if (ptr === 0) throw new Fault(`HardFault: NULL ${type} pointer passed to HAL function`);
    const a = ptr + l.off;
    return l.size === 1 ? this.r8(a) : l.size === 2 ? this.r16(a) : this.r32(a);
  }
  setFld(ptr: number, type: string, path: string, v: number) {
    const l = this.program.layouts[type]?.[path];
    if (!l) throw new Error(`layout ${type}.${path} missing`);
    const a = ptr + l.off;
    if (l.size === 1) this.w8(a, v);
    else if (l.size === 2) this.w16(a, v);
    else this.w32(a, v);
  }
  cstr(a: number, max = 4096): string {
    let s = '';
    for (let i = 0; i < max; i++) {
      const c = this.r8(a + i);
      if (!c) break;
      s += String.fromCharCode(c);
    }
    return s;
  }
  cstrBytes(a: number, max = 4096): number[] {
    const out: number[] = [];
    for (let i = 0; i < max; i++) {
      const c = this.r8(a + i);
      if (!c) break;
      out.push(c);
    }
    return out;
  }
  globalAddr(name: string): number | null {
    const g = this.program.globals.find((x) => x.name === name);
    return g ? g.addr : null;
  }

  /** advance simulated time by seconds (busy wait), yielding as needed */
  *waitSeconds(sec: number): Generator<number, void, unknown> {
    const target = this.S.c + sec * this.mcu.sysclk();
    yield* this.waitCycles(target);
  }
  *waitCycles(targetC: number): Generator<number, void, unknown> {
    const S = this.S;
    while (S.c < targetC) {
      const next = Math.min(targetC, S.budget, S.evt);
      S.c = Math.max(S.c, Math.ceil(next));
      if (S.c >= S.budget || S.c >= S.evt) yield* this.poll(-1, -1, null);
    }
  }
  /** wait until cond() or deadline (seconds), returns true if cond met */
  *waitUntil(cond: () => boolean, timeoutSec: number): Generator<number, boolean, unknown> {
    const S = this.S;
    const target = timeoutSec === Infinity ? Infinity : S.c + timeoutSec * this.mcu.sysclk();
    while (!cond()) {
      if (S.c >= target) return false;
      const step = Math.min(target, S.budget, S.evt, S.c + this.mcu.sysclk() * 0.001);
      S.c = Math.max(S.c + 1, Math.ceil(step));
      yield* this.poll(-1, -1, null);
    }
    return true;
  }

  *callUser(name: string, args: number[]): Generator<number, number, unknown> {
    const f = this.user[name];
    if (!f) return 0;
    const r = yield* f(...args);
    return (r as number) ?? 0;
  }
  hasUser(name: string) {
    return !!this.user[name];
  }

  *callAddr(addr: number, args: number[]): Generator<number, number, unknown> {
    const id = ((addr >>> 0) - FN_BASE - 1) / 4;
    const f = this.mod.fns[id];
    if (f) return ((yield* f(...args)) as number) ?? 0;
    for (const [name, nid] of Object.entries(this.program.nativeIds)) {
      if (nid === id) {
        const r = this.natives[name](...args);
        if (r && typeof (r as Generator).next === 'function') return (yield* r as Generator<number, number>) ?? 0;
        return (r as number) ?? 0;
      }
    }
    throw new Fault(`HardFault: call through invalid function pointer 0x${(addr >>> 0).toString(16).toUpperCase().padStart(8, '0')}`);
  }

  // ---- polling / interrupts / debugger ----
  updateLim() {
    const S = this.S;
    if (this.step !== 'none' || this.bpActive) S.lim = this.step !== 'none' ? 0 : Math.min(S.budget, S.evt);
    else S.lim = Math.min(S.budget, S.evt);
  }

  *poll(sid: number, scopeId: number, getLocals: (() => number[]) | null): Generator<number, void, unknown> {
    const S = this.S;
    for (;;) {
      if (S.c >= S.evt) {
        this.mcu.processEvents();
        const irq = this.mcu.nvic.next();
        if (irq !== null) {
          yield* this.runIsr(irq);
          continue;
        }
      }
      if (sid >= 0 && this.shouldBreak(sid)) {
        this.pauseInfo = { sid, scopeId, getLocals, depth: S.d, reason: this.B[sid] && this.step === 'none' ? 'breakpoint' : this.step === 'pause' ? 'pause' : this.B[sid] ? 'breakpoint' : 'step' };
        this.step = 'none';
        this.updateLim();
        yield 1;
        this.pauseInfo = null;
        sid = -1; // don't re-break at the same statement
        continue;
      }
      if (S.c >= S.budget) {
        yield 0;
        continue;
      }
      break;
    }
    this.updateLim();
  }

  private shouldBreak(sid: number): boolean {
    if (this.isrDepth > 0 && this.step === 'over') return false;
    switch (this.step) {
      case 'into':
      case 'pause':
        return true;
      case 'over':
        if (this.S.d <= this.stepDepth) return true;
        break;
      case 'out':
        if (this.S.d < this.stepDepth) return true;
        break;
    }
    return this.B[sid] === 1;
  }

  *runIsr(irq: number): Generator<number, void, unknown> {
    const nvic = this.mcu.nvic;
    nvic.pending.delete(irq);
    nvic.active.push(irq);
    const name = this.mcu.irqHandlerName(irq);
    const f = this.user[name];
    this.S.c += 12;
    this.isrDepth++;
    try {
      if (!f) {
        this.status = `Default_Handler (no ${name} defined)`;
        throw new Fault(`Interrupt ${name.replace('_IRQHandler', '_IRQn')} fired but ${name}() is not defined — the CPU is stuck in Default_Handler (enable the interrupt in CubeMX NVIC settings so the handler is generated)`, 'user');
      }
      yield* f();
    } finally {
      this.isrDepth--;
      nvic.active.pop();
      this.S.c += 12;
      if (nvic.pending.size) this.mcu.irqMaybe();
    }
  }

  // ---- inspection ----
  readTyped(addr: number, t: CType): unknown {
    const R = this.R as Record<string, (a: number) => number>;
    try {
      switch (t.k) {
        case 'int':
          if (t.size === 1) return t.signed ? R.ld8s(addr) : R.ld8(addr);
          if (t.size === 2) return t.signed ? R.ld16s(addr) : R.ld16(addr);
          if (t.size === 4) return t.signed ? R.ld32s(addr) : R.ld32(addr);
          return t.signed ? R.ld64s(addr) : R.ld64(addr);
        case 'float':
          return t.size === 4 ? R.ldf(addr) : R.ldd(addr);
        case 'ptr':
          return R.ld32(addr);
        default:
          return null;
      }
    } catch {
      return null;
    }
  }
}
