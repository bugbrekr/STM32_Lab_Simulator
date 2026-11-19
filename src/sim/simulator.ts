// High-level simulator: runtime + MCU + carrier board, headless-capable.
import { CpuState, Fault, MCU, UartByte } from './mcu/mcu';
import { CarrierBoard, BoardSnapshot, BoardInputs, PartsConfig } from './board/board';
import { LoadedProgram, Runtime, RuntimeSettings, StepMode } from './runtime';
import { GPIO_PINS } from './mcu/pins';
import type { CType } from './cc/types';

export type SimStatus = 'idle' | 'running' | 'paused' | 'halted' | 'fault';

export interface VarNode {
  name: string;
  type: string;
  value: string;
  addr?: number;
  children?: VarNode[];
}

export interface PinSnap {
  mode: string;
  level: number;
  pwm?: { freq: number; duty: number; signal: string };
  af?: string | null;
}

export interface SimSnapshot {
  t: number;
  cycles: number;
  sysclk: number;
  status: SimStatus;
  statusText: string;
  location: { file: string; line: number; fn: string } | null;
  board: BoardSnapshot;
  pins: Record<string, PinSnap>;
  uart: UartByte[];
  warnings: string[];
  adcConversions: number;
}

export interface PauseState {
  file: string;
  line: number;
  fn: string;
  reason: string;
  locals: VarNode[];
  stack: { fn: string; file: string; line: number }[];
}

function hex(v: number, w = 8) {
  return '0x' + (v >>> 0).toString(16).toUpperCase().padStart(w, '0');
}

export function typeStr(t: CType): string {
  switch (t.k) {
    case 'void': return 'void';
    case 'int': return t.enumTag ? `enum ${t.enumTag}` : t.name;
    case 'float': return t.name;
    case 'ptr': return typeStr(t.to) + ' *';
    case 'array': return `${typeStr(t.of)} [${t.len ?? ''}]`;
    case 'struct': return t.def.tag.startsWith('<') ? (t.def.union ? 'union' : 'struct') + ' {...}' : t.def.tag.replace(/^__/, '');
    case 'func': return 'function';
  }
}

export class Simulator {
  S: CpuState = { c: 0, lim: 0, budget: 0, evt: Infinity, sp: 0, splim: 0, ln: 0, d: 0, ls: new Int32Array(512), fs: new Int32Array(512) };
  mcu = new MCU(this.S);
  board = new CarrierBoard();
  rt: Runtime | null = null;
  gen: Generator<number, unknown, unknown> | null = null;
  status: SimStatus = 'idle';
  statusText = '';
  faultLoc: { file: string; line: number; fn: string } | null = null;
  settings: RuntimeSettings = { printfFloat: false };
  private breakpoints: { file: string; line: number }[] = [];
  private uartCursor = 0;
  onReset?: () => void;

  constructor() {
    this.board.attach(this.mcu);
  }

  load(program: LoadedProgram, settings?: Partial<RuntimeSettings>) {
    Object.assign(this.settings, settings ?? {});
    this.rt = new Runtime(program, this.mcu);
    this.rt.settings = this.settings;
    this.rt.load();
    this.applyBreakpoints();
    this.reset();
  }

  reset() {
    if (!this.rt) return;
    this.mcu.reset();
    this.board.resetTime();
    this.mcu.primePins();
    this.board.refreshAll();
    this.uartCursor = 0;
    this.gen = this.rt.start();
    this.rt.step = 'none';
    this.status = 'running';
    this.statusText = '';
    this.faultLoc = null;
    this.onReset?.();
  }

  // ---------- execution ----------
  /** Execute up to maxCycles. Returns current status. */
  runSlice(maxCycles: number): SimStatus {
    if (!this.rt || !this.gen || this.status === 'halted' || this.status === 'fault') return this.status;
    const S = this.S;
    S.budget = S.c + Math.max(1, Math.floor(maxCycles));
    this.rt.updateLim();
    if (this.status === 'paused') this.status = 'running';
    try {
      const r = this.gen.next();
      if (r.done) {
        this.status = 'halted';
        this.statusText = `main() returned ${r.value ?? 0} — on a real MCU execution would fall into an infinite loop`;
      } else if (r.value === 1) {
        this.status = 'paused';
      }
    } catch (e) {
      this.handleError(e);
    }
    return this.status;
  }

  private handleError(e: unknown) {
    const loc = this.currentLocation();
    if (e instanceof Fault) {
      if (e.kind === 'user' && /System reset requested/.test(e.message)) {
        this.reset();
        return;
      }
      this.status = 'fault';
      this.statusText = e.message;
      this.faultLoc = loc;
      return;
    }
    if (e instanceof RangeError && /call stack/i.test(e.message)) {
      this.status = 'fault';
      this.statusText = 'Stack overflow: too much recursion';
      this.faultLoc = loc;
      return;
    }
    this.status = 'fault';
    this.statusText = 'Simulator internal error: ' + (e instanceof Error ? e.message : String(e));
    this.faultLoc = loc;
    console.error(e);
  }

  /** Run for a given amount of simulated time (headless). */
  runFor(seconds: number, maxSliceSec = 0.001): SimStatus {
    const target = this.mcu.now() + seconds;
    let guard = 0;
    while (this.mcu.now() < target - 1e-12) {
      const remaining = target - this.mcu.now();
      const st = this.runSlice(Math.max(1, Math.ceil(Math.min(remaining, maxSliceSec) * this.mcu.sysclk())));
      if (st !== 'running') break;
      if (++guard > 50_000_000) break;
    }
    this.board.update(this.mcu.now());
    return this.status;
  }

  // ---------- debugger ----------
  setBreakpoints(bps: { file: string; line: number }[]) {
    this.breakpoints = bps;
    this.applyBreakpoints();
  }
  private applyBreakpoints() {
    const rt = this.rt;
    if (!rt) return;
    rt.B.fill(0);
    const stmts = rt.program.stmts;
    for (const bp of this.breakpoints) {
      let found = false;
      for (let delta = 0; delta < 6 && !found; delta++) {
        stmts.forEach((s, i) => {
          if (s.file === bp.file && s.line === bp.line + delta) {
            rt.B[i] = 1;
            found = true;
          }
        });
      }
    }
    rt.bpActive = this.breakpoints.length > 0;
    rt.updateLim();
  }
  /** breakpoints after mapping to real statement lines */
  resolvedBreakpoints(): { file: string; line: number }[] {
    const rt = this.rt;
    if (!rt) return [];
    const out: { file: string; line: number }[] = [];
    rt.B.forEach((b, i) => {
      if (b) out.push(rt.program.stmts[i]);
    });
    return out;
  }
  requestPause() {
    if (!this.rt) return;
    this.rt.step = 'pause';
    this.rt.updateLim();
  }
  stepMode(mode: StepMode) {
    if (!this.rt) return;
    this.rt.step = mode;
    this.rt.stepDepth = this.S.d;
    this.rt.updateLim();
    if (this.status === 'paused') this.status = 'running';
  }
  resume() {
    if (!this.rt) return;
    this.rt.step = 'none';
    this.rt.updateLim();
    if (this.status === 'paused') this.status = 'running';
  }

  currentLocation(): { file: string; line: number; fn: string } | null {
    const rt = this.rt;
    if (!rt) return null;
    const st = rt.program.stmts[this.S.ln];
    const fid = this.S.fs[this.S.d];
    const fn = rt.program.funcs.find((f) => f.id === fid)?.name ?? '';
    if (!st) return null;
    return { file: st.file, line: st.line, fn };
  }

  pauseState(): PauseState | null {
    const rt = this.rt;
    if (!rt || !rt.pauseInfo) return null;
    const pi = rt.pauseInfo;
    const st = rt.program.stmts[pi.sid];
    const loc = this.currentLocation();
    const vals = pi.getLocals ? pi.getLocals() : [];
    const fp = vals[0] ?? this.S.sp;
    const scope = rt.program.scopes[pi.scopeId];
    const locals: VarNode[] = [];
    if (scope) {
      for (const v of scope.vars) {
        if (v.js >= 0) locals.push(this.formatValue(v.name, v.type, null, vals[v.js]));
        else locals.push(this.formatValue(v.name, v.type, fp + v.off, undefined));
      }
    }
    const stack: PauseState['stack'] = [];
    for (let d = this.S.d; d >= 1; d--) {
      const fid = this.S.fs[d];
      const f = rt.program.funcs.find((x) => x.id === fid);
      const sid = d === this.S.d ? pi.sid : this.S.ls[d];
      const s = rt.program.stmts[sid];
      stack.push({ fn: f?.name ?? '??', file: s?.file ?? '', line: s?.line ?? 0 });
    }
    return { file: st?.file ?? '', line: st?.line ?? 0, fn: loc?.fn ?? '', reason: pi.reason, locals, stack };
  }

  formatValue(name: string, t: CType, addr: number | null, jsVal: number | undefined, depth = 0): VarNode {
    const rt = this.rt!;
    const type = typeStr(t);
    const read = (): number | null => (jsVal !== undefined ? jsVal : addr !== null ? (rt.readTyped(addr, t) as number | null) : null);
    switch (t.k) {
      case 'int': {
        const v = read();
        if (v === null) return { name, type, value: '<unavailable>' };
        let s = String(v);
        if (t.size === 1 && v >= 32 && v < 127 && !t.enumTag && (t.name === 'char' || t.name === 'unsigned char' || t.name === 'signed char')) s += ` '${String.fromCharCode(v)}'`;
        return { name, type, value: s, addr: addr ?? undefined };
      }
      case 'float': {
        const v = read();
        if (v === null) return { name, type, value: '<unavailable>' };
        return { name, type, value: Number.isInteger(v) ? v.toFixed(1) : String(t.size === 4 ? Number(v.toPrecision(8)) : v), addr: addr ?? undefined };
      }
      case 'ptr': {
        const v = read();
        if (v === null) return { name, type, value: '<unavailable>' };
        let extra = '';
        if (t.to.k === 'int' && t.to.size === 1 && v) {
          try {
            extra = ` "${rt.cstr(v, 64).replace(/\n/g, '\\n').replace(/\r/g, '\\r')}"`;
          } catch {
            /* ignore */
          }
        }
        const node: VarNode = { name, type, value: hex(v) + extra, addr: addr ?? undefined };
        if (t.to.k === 'struct' && v && depth < 2) {
          node.children = t.to.def.fields.map((f) => this.formatValue(f.name, f.type, v + f.offset, undefined, depth + 1));
        }
        return node;
      }
      case 'array': {
        if (addr === null) return { name, type, value: '' };
        const n = Math.min(t.len ?? 0, 64);
        const es = t.of.k === 'int' ? t.of.size : t.of.k === 'float' ? t.of.size : t.of.k === 'ptr' ? 4 : t.of.k === 'struct' ? t.of.def.size : 4;
        const children: VarNode[] = [];
        if (depth < 3) for (let i = 0; i < n; i++) children.push(this.formatValue(`[${i}]`, t.of, addr + i * es, undefined, depth + 1));
        let value = '';
        if (t.of.k === 'int' && t.of.size === 1) {
          try {
            value = `"${rt.cstr(addr, t.len ?? 64).replace(/\n/g, '\\n').replace(/\r/g, '\\r')}"`;
          } catch {
            /* ignore */
          }
        }
        return { name, type, value, addr, children };
      }
      case 'struct': {
        if (addr === null) return { name, type, value: '{...}' };
        const children = depth < 3 ? t.def.fields.map((f) => this.formatValue(f.name, f.type, addr + f.offset, undefined, depth + 1)) : [];
        return { name, type, value: '{...}', addr, children };
      }
      default:
        return { name, type, value: '' };
    }
  }

  globals(names?: string[]): VarNode[] {
    const rt = this.rt;
    if (!rt) return [];
    const list = rt.program.globals.filter((g) => !g.file.startsWith('<sys>') && (!names || names.includes(g.name)));
    return list.map((g) => this.formatValue(g.name, g.type, g.addr, undefined));
  }

  /** Evaluate a simple watch expression: global name with optional .field / [index] / -> chain */
  evalExpr(expr: string): VarNode {
    const rt = this.rt;
    if (!rt) return { name: expr, type: '', value: '<no program>' };
    const m = /^\s*([A-Za-z_]\w*)(.*)$/.exec(expr);
    if (!m) return { name: expr, type: '', value: '<invalid expression>' };
    const g = rt.program.globals.find((x) => x.name === m[1]);
    if (!g) {
      // try current locals when paused
      const ps = this.pauseState();
      const loc = ps?.locals.find((l) => l.name === m[1]);
      if (loc && !m[2].trim()) return { ...loc, name: expr };
      return { name: expr, type: '', value: `<'${m[1]}' not found>` };
    }
    let t: CType = g.type;
    let addr = g.addr;
    let rest = m[2];
    while (rest.trim()) {
      let mm: RegExpExecArray | null;
      if ((mm = /^\s*\.\s*([A-Za-z_]\w*)(.*)$/.exec(rest))) {
        if (t.k !== 'struct') return { name: expr, type: '', value: '<not a struct>' };
        const f = t.def.fields.find((x) => x.name === mm![1]);
        if (!f) return { name: expr, type: '', value: `<no member ${mm[1]}>` };
        addr += f.offset;
        t = f.type;
        rest = mm[2];
      } else if ((mm = /^\s*->\s*([A-Za-z_]\w*)(.*)$/.exec(rest))) {
        if (t.k !== 'ptr' || t.to.k !== 'struct') return { name: expr, type: '', value: '<not a struct pointer>' };
        const p = rt.readTyped(addr, t) as number;
        const f = t.to.def.fields.find((x) => x.name === mm![1]);
        if (!f) return { name: expr, type: '', value: `<no member ${mm[1]}>` };
        addr = p + f.offset;
        t = f.type;
        rest = mm[2];
      } else if ((mm = /^\s*\[\s*(\d+)\s*\](.*)$/.exec(rest))) {
        const i = Number(mm[1]);
        if (t.k === 'array') {
          const es = t.of.k === 'struct' ? t.of.def.size : t.of.k === 'int' || t.of.k === 'float' ? t.of.size : 4;
          addr += i * es;
          t = t.of;
        } else if (t.k === 'ptr') {
          const p = rt.readTyped(addr, t) as number;
          const es = t.to.k === 'struct' ? t.to.def.size : t.to.k === 'int' || t.to.k === 'float' ? t.to.size : 4;
          addr = p + i * es;
          t = t.to;
        } else return { name: expr, type: '', value: '<not an array>' };
        rest = mm[2];
      } else return { name: expr, type: '', value: '<unsupported expression>' };
    }
    return this.formatValue(expr, t, addr, undefined);
  }

  // ---------- IO ----------
  uartInput(bytes: number[]) {
    this.mcu.usart2.pushRx(bytes);
  }
  setInputs(p: Partial<BoardInputs>) {
    this.board.setInputs(p);
  }
  setParts(p: Partial<PartsConfig>) {
    Object.assign(this.board.parts, p);
  }

  snapshot(): SimSnapshot {
    const t = this.mcu.now();
    const pins: Record<string, PinSnap> = {};
    for (const p of GPIO_PINS) {
      const st = this.mcu.pinState(p);
      pins[p] = { mode: st.mode, level: st.level, pwm: st.pwm, af: st.af };
    }
    const uart = this.mcu.uartOut.slice(this.uartCursor);
    this.uartCursor = this.mcu.uartOut.length;
    if (this.mcu.uartOut.length > 5000) {
      this.mcu.uartOut.splice(0, this.mcu.uartOut.length);
      this.uartCursor = 0;
    }
    const loc = this.status === 'fault' ? this.faultLoc : this.currentLocation();
    let statusText = this.statusText;
    if (this.status === 'running' && loc?.fn === 'Error_Handler') statusText = 'Program is stuck in Error_Handler() — a HAL init function returned an error';
    const warnings = this.mcu.warnings.splice(0);
    return {
      t,
      cycles: this.S.c,
      sysclk: this.mcu.sysclk(),
      status: this.status,
      statusText,
      location: loc,
      board: this.board.snapshot(t),
      pins,
      uart,
      warnings,
      adcConversions: this.mcu.adcConversions,
    };
  }
}
