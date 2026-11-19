// Code generator: C AST -> JavaScript generator functions operating on a flat memory model.
import type { Expr, FuncDef, Init, Loc, Stmt, TranslationUnit, VarDecl, Designator } from './ast';
import { CError } from './lexer';
import { constEval, wrapInt } from './parser';
import {
  CType, DOUBLE, FLOAT, FuncT, INT, IntT, LLONG, UINT, ULLONG, VOID, arithCommon, isArith, isInt, isScalar, promote, ptr,
  sizeOf, typeName, unqual, CHAR, StructT,
} from './types';

export const FLASH_BASE = 0x08000000;
export const FLASH_SIZE = 512 * 1024;
export const RAM_BASE = 0x20000000;
export const RAM_SIZE = 96 * 1024;
export const FN_BASE = FLASH_BASE + 0x400; // fake function addresses
export const RODATA_BASE = FLASH_BASE + 0x10000;
export const STACK_SIZE = 0x2000;

export interface NativeMeta {
  /** generator native (may yield / call user code) */
  gen: boolean;
  /** cycle cost of the call */
  cost: number;
}

export interface VarInfo {
  name: string;
  type: CType;
  /** JS-local index into closure values, or -1 when memory-resident */
  js: number;
  /** frame offset when memory resident */
  off: number;
}

export interface ScopeInfo {
  fn: string;
  vars: VarInfo[];
}

export interface GlobalInfo {
  name: string;
  addr: number;
  type: CType;
  file: string;
  isStatic: boolean;
}

export interface FuncInfo {
  name: string;
  id: number;
  file: string;
  line: number;
  endLine: number;
  jsName: string;
  isStatic: boolean;
}

export interface Diag {
  file: string;
  line: number;
  col: number;
  severity: 'error' | 'warning';
  message: string;
}

export interface Program {
  js: string;
  stmts: { file: string; line: number }[];
  scopes: ScopeInfo[];
  globals: GlobalInfo[];
  funcs: FuncInfo[];
  nativeIds: Record<string, number>;
  rodata: Uint8Array;
  dataEnd: number;
  sizes: { text: number; data: number; bss: number };
  warnings: Diag[];
}

// ---- symbols ----
type Sym =
  | { k: 'local'; js: string; t: CType; idx: number }
  | { k: 'localmem'; off: number; t: CType }
  | { k: 'global'; key: string; t: CType }
  | { k: 'func'; key: string; t: FuncT; name: string };

interface GlobalSym {
  key: string;
  name: string;
  t: CType;
  addr: number;
  defined: boolean;
  hasInit: boolean;
  isStatic: boolean;
  file: string;
  loc: Loc;
}

interface FuncSym {
  key: string;
  name: string;
  t: FuncT;
  def: FuncDef | null;
  tu: number;
  isStatic: boolean;
  id: number;
  jsName: string;
}

// ---- expression results ----
type G =
  | { k: 'val'; code: string; t: CType; c: number }
  | { k: 'js'; name: string; t: CType; c: number }
  | { k: 'mem'; addr: string; t: CType; c: number }
  | { k: 'fn'; key: string; name: string; t: FuncT; c: number };

// Cycle costs (approximate Cortex-M4 at -O0, 2 flash wait states with ART accelerator)
const C_LOAD = 2;
const C_STORE = 1;
const C_ALU = 1;
const C_DIV = 7;
const C_FLT = 3;
const C_DBL = 30;
const C_BRANCH = 2;
const C_CALL = 6;
const C_CONST = 1;

function err(msg: string, loc: Loc): CError {
  return new CError(msg, loc.file, loc.line, loc.col);
}

function isStruct(t: CType): t is StructT {
  return t.k === 'struct';
}

function ldName(t: CType): string {
  if (t.k === 'ptr') return 'ld32';
  if (t.k === 'float') return t.size === 4 ? 'ldf' : 'ldd';
  if (t.k === 'int') {
    if (t.size === 1) return t.signed ? 'ld8s' : 'ld8';
    if (t.size === 2) return t.signed ? 'ld16s' : 'ld16';
    if (t.size === 4) return t.signed ? 'ld32s' : 'ld32';
    return t.signed ? 'ld64s' : 'ld64';
  }
  throw new Error('no load for ' + typeName(t));
}
function stName(t: CType): string {
  if (t.k === 'ptr') return 'st32';
  if (t.k === 'float') return t.size === 4 ? 'stf' : 'std';
  if (t.k === 'int') {
    if (t.size === 1) return 'st8';
    if (t.size === 2) return 'st16';
    if (t.size === 4) return 'st32';
    return 'st64';
  }
  throw new Error('no store for ' + typeName(t));
}

/** JS code converting value code of type `from` to type `to`. */
export function conv(code: string, from: CType, to: CType): string {
  from = unqual(from);
  to = unqual(to);
  if (to.k === 'void') return code;
  if (from.k === 'array' || from.k === 'func') from = UINT; // decayed address
  if (to.k === 'int') {
    if (to.bool) return `((${code})!=0?1:0)`;
    if (from.k === 'float') {
      if (to.size === 8) return `T64(${code},${to.signed})`;
      if (to.size === 4) return to.signed ? `f2s(${code})` : `f2u(${code})`;
      const inner = `f2s(${code})`;
      return narrow(inner, to);
    }
    if (from.k === 'int' && from.size === to.size && (from.signed === to.signed || false)) return code;
    if (from.k === 'int' && from.bool) {
      return code;
    }
    if (from.k === 'int' && from.size < to.size && to.size === 4) {
      // widening: value already fits, except signed->unsigned
      if (from.signed && !to.signed) return `((${code})>>>0)`;
      return code;
    }
    if (to.size === 8) {
      if (from.k === 'int' && from.size === 8) return `W64(${code},${to.signed})`;
      if (from.k === 'int' && !from.signed) return code;
      if (from.k === 'int' && from.signed && !to.signed) return `W64(${code},false)`;
      if (from.k === 'ptr') return code;
      return code;
    }
    return narrow(code, to);
  }
  if (to.k === 'float') {
    if (from.k === 'float' && from.size === to.size) return code;
    if (to.size === 4) return `fr(${code})`;
    return code;
  }
  if (to.k === 'ptr') {
    if (from.k === 'ptr') return code;
    if (from.k === 'float') return `f2u(${code})`;
    if (from.k === 'int' && !from.signed && from.size <= 4) return code;
    return `((${code})>>>0)`;
  }
  return code;
}

function narrow(code: string, to: IntT): string {
  switch (to.size) {
    case 1: return to.signed ? `((${code})<<24>>24)` : `((${code})&255)`;
    case 2: return to.signed ? `((${code})<<16>>16)` : `((${code})&65535)`;
    case 4: return to.signed ? `((${code})|0)` : `((${code})>>>0)`;
    default: return `W64(${code},${to.signed})`;
  }
}

function decay(t: CType): CType {
  if (t.k === 'array') return ptr(t.of);
  if (t.k === 'func') return ptr(t);
  return t;
}

const JS_RESERVED = new Set(['S', 'R', 'N', 'F']);

export class Codegen {
  private globals = new Map<string, GlobalSym>();
  private funcs = new Map<string, FuncSym>();
  private funcList: FuncSym[] = [];
  private dataTop = RAM_BASE;
  private rodata: number[] = [];
  private strCache = new Map<string, number>();
  private stmts: { file: string; line: number }[] = [];
  private scopes: ScopeInfo[] = [];
  private out: string[] = [];
  private initCode: string[] = [];
  private initTemps = 0;
  private warnings: Diag[] = [];
  private usedExternals = new Map<string, Loc>();
  private nativeIds: Record<string, number> = {};
  private textBytes = 0;
  private dataBytes = 0;
  private bssBytes = 0;

  // per-TU
  private tuIndex = 0;
  private tuScope = new Map<string, Sym>();
  private file = '';

  // per-function
  private fn: {
    name: string;
    def: FuncDef;
    jsLocals: string[];
    temps: number;
    frame: number;
    scopes: Map<string, Sym>[];
    addrTaken: Set<string>;
    localCount: number;
    ret: CType;
    jsVarList: { name: string; js: string; t: CType }[];
  } | null = null;

  constructor(private natives: Record<string, NativeMeta>) {
    let id = 1000;
    for (const n of Object.keys(natives)) this.nativeIds[n] = id++;
  }

  warn(msg: string, loc: Loc) {
    this.warnings.push({ file: loc.file, line: loc.line, col: loc.col, severity: 'warning', message: msg });
  }

  // ================= Phase 1: declarations =================
  declareTU(tu: TranslationUnit, tuIndex: number) {
    for (const item of tu.items) {
      if (item.k === 'func') {
        const d = item.def;
        const isStatic = d.storage === 'static';
        const key = isStatic ? `${d.name}@${tuIndex}` : d.name;
        const ex = this.funcs.get(key);
        if (ex && ex.def) {
          if (d.weak) continue;
          if (ex.def && !this.isWeakDef(ex)) throw err(`multiple definition of \`${d.name}'`, d.loc);
        }
        if (ex) {
          ex.def = d;
          ex.t = d.type;
          ex.tu = tuIndex;
        } else this.addFunc({ key, name: d.name, t: d.type, def: d, tu: tuIndex, isStatic, id: 0, jsName: '' });
      } else {
        const v = item.decl;
        if (v.storage === 'typedef') continue;
        if (v.type.k === 'func') continue; // prototype
        const isStatic = v.storage === 'static';
        const key = isStatic ? `${v.name}@${tuIndex}` : v.name;
        const isDef = v.storage !== 'extern' || v.init !== null;
        let g = this.globals.get(key);
        if (!g) {
          g = { key, name: v.name, t: v.type, addr: 0, defined: false, hasInit: false, isStatic, file: tu.file, loc: v.loc };
          this.globals.set(key, g);
        }
        if (isDef) {
          if (v.init && g.hasInit) throw err(`redefinition of '${v.name}'`, v.loc);
          if (g.defined && g.file !== tu.file && !isStatic) {
            // two tentative/strong definitions in different files
            if (v.init || g.hasInit) throw err(`multiple definition of \`${v.name}'`, v.loc);
          }
          if (g.t.k === 'array' && g.t.len === null) g.t = v.type;
          if (!g.defined) {
            g.t = v.type;
            g.defined = true;
            g.file = tu.file;
            g.loc = v.loc;
          }
          if (v.init) g.hasInit = true;
        } else if (g.t.k === 'array' && g.t.len === null && v.type.k === 'array' && v.type.len !== null) g.t = v.type;
      }
    }
  }

  private isWeakDef(f: FuncSym) {
    return !!f.def?.weak;
  }

  private addFunc(f: FuncSym) {
    f.id = this.funcList.length + 1;
    f.jsName = 'F_' + f.key.replace(/[^A-Za-z0-9_]/g, '_');
    this.funcs.set(f.key, f);
    this.funcList.push(f);
  }

  allocateGlobals() {
    for (const g of this.globals.values()) {
      if (!g.defined) continue;
      const size = sizeOf(g.t);
      if (size === 0 && g.t.k === 'struct') throw err(`storage size of '${g.name}' isn't known`, g.loc);
      const align = Math.min(8, Math.max(4, size >= 8 ? 8 : 4));
      this.dataTop = Math.ceil(this.dataTop / align) * align;
      g.addr = this.dataTop;
      this.dataTop += Math.max(size, 1);
      if (g.hasInit) this.dataBytes += size;
      else this.bssBytes += size;
    }
  }

  // ================= Phase 2: code =================
  genTU(tu: TranslationUnit, tuIndex: number) {
    this.tuIndex = tuIndex;
    this.tuScope = new Map();
    this.file = tu.file;
    for (const item of tu.items) {
      if (item.k === 'func') {
        const d = item.def;
        const key = d.storage === 'static' ? `${d.name}@${tuIndex}` : d.name;
        this.tuScope.set(d.name, { k: 'func', key, t: d.type, name: d.name });
        const f = this.funcs.get(key)!;
        if (f.def === d) this.genFunction(f);
      } else {
        const v = item.decl;
        if (v.storage === 'typedef') continue;
        if (v.type.k === 'func') {
          const existing = this.tuScope.get(v.name);
          const key = v.storage === 'static' ? `${v.name}@${tuIndex}` : v.name;
          if (!existing || existing.k !== 'func') {
            // static prototype refers to this TU's static def if it exists
            const k2 = this.funcs.has(`${v.name}@${tuIndex}`) ? `${v.name}@${tuIndex}` : key;
            this.tuScope.set(v.name, { k: 'func', key: k2, t: v.type as FuncT, name: v.name });
          }
          continue;
        }
        const key = v.storage === 'static' ? `${v.name}@${tuIndex}` : v.name;
        const g = this.globals.get(key)!;
        this.tuScope.set(v.name, { k: 'global', key, t: g.t });
        if (v.init) this.genGlobalInit(g, v);
      }
    }
  }

  private genGlobalInit(g: GlobalSym, v: VarDecl) {
    // global initializers run in __init before main
    const savedFn = this.fn;
    this.fn = {
      name: '__init',
      def: null as unknown as FuncDef,
      jsLocals: [],
      temps: this.initTemps,
      frame: 0,
      scopes: [],
      addrTaken: new Set(),
      localCount: 0,
      ret: VOID,
      jsVarList: [],
    };
    const lines: string[] = [];
    this.genInitializer(String(g.addr), g.t, v.init!, lines, v.loc);
    this.initTemps = this.fn.temps;
    this.fn = savedFn;
    this.initCode.push(...lines);
  }

  // ---------- strings ----------
  private strAddr(bytes: number[]): number {
    const key = bytes.join(',');
    const ex = this.strCache.get(key);
    if (ex !== undefined) return ex;
    while (this.rodata.length % 4) this.rodata.push(0);
    const addr = RODATA_BASE + this.rodata.length;
    this.rodata.push(...bytes, 0);
    this.strCache.set(key, addr);
    return addr;
  }

  // ---------- functions ----------
  private collectAddrTaken(s: Stmt | Expr | Init | null, set: Set<string>) {
    const visitE = (e: Expr): void => {
      switch (e.k) {
        case 'un':
          if (e.op === '&') {
            let x: Expr = e.e;
            while (x.k === 'member' && !x.arrow) x = x.e;
            while (x.k === 'index') x = x.a;
            if (x.k === 'id') set.add(x.name);
          }
          visitE(e.e);
          break;
        case 'bin': case 'assign': visitE(e.l); visitE(e.r); break;
        case 'incdec': case 'sizeof_e': case 'cast': visitE(e.e); break;
        case 'call': visitE(e.f); e.args.forEach(visitE); break;
        case 'index': visitE(e.a); visitE(e.i); break;
        case 'member': visitE(e.e); break;
        case 'cond': visitE(e.c); visitE(e.a); visitE(e.b); break;
        case 'comma': visitE(e.l); visitE(e.r); break;
        case 'compound': visitI(e.init); break;
      }
    };
    const visitI = (i: Init): void => {
      if (i.k === 'expr') visitE(i.e);
      else i.items.forEach((it) => visitI(it.init));
    };
    const visitS = (st: Stmt): void => {
      switch (st.k) {
        case 'expr': visitE(st.e); break;
        case 'decl': st.decls.forEach((d) => d.init && visitI(d.init)); break;
        case 'block': st.items.forEach(visitS); break;
        case 'if': visitE(st.c); visitS(st.then); if (st.else) visitS(st.else); break;
        case 'while': visitE(st.c); visitS(st.body); break;
        case 'dowhile': visitS(st.body); visitE(st.c); break;
        case 'for': if (st.init) visitS(st.init); if (st.c) visitE(st.c); if (st.step) visitE(st.step); visitS(st.body); break;
        case 'return': if (st.e) visitE(st.e); break;
        case 'switch': visitE(st.e); visitS(st.body); break;
        case 'case': visitE(st.e); visitS(st.body); break;
        case 'default': case 'label': visitS(st.body); break;
      }
    };
    if (s) visitS(s as Stmt);
  }

  private genFunction(f: FuncSym) {
    const d = f.def!;
    const addrTaken = new Set<string>();
    this.collectAddrTaken(d.body, addrTaken);
    this.fn = {
      name: d.name,
      def: d,
      jsLocals: [],
      temps: 0,
      frame: 0,
      scopes: [new Map()],
      addrTaken,
      localCount: 0,
      ret: d.type.ret,
      jsVarList: [],
    };
    const params: string[] = [];
    const prologue: string[] = [];
    d.type.params.forEach((pt, i) => {
      const pname = d.paramNames[i] || `__p${i}`;
      const jsP = `p${i}`;
      params.push(jsP);
      if (addrTaken.has(pname) || isStruct(pt)) {
        const off = this.allocFrame(pt);
        this.fn!.scopes[0].set(pname, { k: 'localmem', off, t: pt });
        this.fn!.jsVarList.push({ name: pname, js: '', t: pt });
        if (isStruct(pt)) prologue.push(`memcpy(fp+${off},${jsP},${sizeOf(pt)});`);
        else prologue.push(`${stName(pt)}(fp+${off},${jsP});`);
        (this.fn!.jsVarList[this.fn!.jsVarList.length - 1] as { off?: number }).off = off;
      } else {
        const js = this.newLocal(pname, pt);
        this.fn!.scopes[0].set(pname, { k: 'local', js, t: pt, idx: 0 });
        prologue.push(`${js}=${jsP};`);
      }
    });
    if (d.type.params.length === 0 && d.paramNames.length === 0) { /* (void) */ }
    const body = this.genBlockItems(d.body.items, true);
    const endSid = this.newStmt(d.body.endLoc);
    const fr = this.fn.frame;
    const frame = Math.ceil(fr / 8) * 8;
    const locals = this.fn.jsLocals.length ? `let ${this.fn.jsLocals.map((n) => `${n}=0`).join(',')};` : '';
    const temps = this.fn.temps ? `let ${Array.from({ length: this.fn.temps }, (_, i) => `$t${i}`).join(',')};` : '';
    const scopeId = this.makeScope(this.fn.scopes.flatMap((m) => [...m.entries()]));
    const src =
      `function* ${f.jsName}(${params.join(',')}){` +
      `${locals}${temps}` +
      `S.ls[S.d]=S.ln;S.d++;S.fs[S.d]=${f.id};` +
      (frame ? `const fp=(S.sp-=${frame});if(fp<S.splim)stackOverflow();` : `const fp=S.sp;`) +
      `try{${prologue.join('')}${body}` +
      `S.ln=${endSid};if(S.c>=S.lim||B[${endSid}])yield*P(${endSid},${scopeId},()=>[fp${this.closureVars()}]);` +
      `}finally{${frame ? `S.sp+=${frame};` : ''}S.d--;}` +
      `}`;
    this.out.push(src);
    this.textBytes += 16 + src.length / 6;
    this.fn = null;
  }

  private closureVars(): string {
    const vars: string[] = [];
    for (const sc of this.fn!.scopes) for (const s of sc.values()) if (s.k === 'local') vars.push(s.js);
    return vars.length ? ',' + vars.join(',') : '';
  }

  private makeScope(entries: [string, Sym][]): number {
    const vars: VarInfo[] = [];
    let jsIdx = 1;
    for (const [name, s] of entries) {
      if (s.k === 'local') vars.push({ name, type: s.t, js: jsIdx++, off: 0 });
      else if (s.k === 'localmem') vars.push({ name, type: s.t, js: -1, off: s.off });
    }
    this.scopes.push({ fn: this.fn?.name ?? '', vars });
    return this.scopes.length - 1;
  }

  private currentScopeId(): number {
    const entries: [string, Sym][] = [];
    const seen = new Map<string, number>();
    for (const sc of this.fn!.scopes) {
      for (const e of sc.entries()) {
        if (seen.has(e[0])) entries[seen.get(e[0])!] = e;
        else {
          seen.set(e[0], entries.length);
          entries.push(e);
        }
      }
    }
    // must match closureVars order: all JS locals in all scopes, in scope order
    const ordered: [string, Sym][] = [];
    for (const sc of this.fn!.scopes) for (const e of sc.entries()) ordered.push(e);
    const vars: VarInfo[] = [];
    let jsIdx = 1;
    const visible = new Set(entries.map((e) => e[1]));
    for (const [name, s] of ordered) {
      if (s.k === 'local') {
        if (visible.has(s)) vars.push({ name, type: s.t, js: jsIdx, off: 0 });
        jsIdx++;
      } else if (s.k === 'localmem' && visible.has(s)) vars.push({ name, type: s.t, js: -1, off: s.off });
    }
    const key = JSON.stringify(vars.map((v) => [v.name, v.js, v.off]));
    const cache = (this as unknown as { _scopeCache?: Map<string, number> });
    if (!cache._scopeCache) cache._scopeCache = new Map();
    const hit = cache._scopeCache.get(this.fn!.name + key);
    if (hit !== undefined) return hit;
    this.scopes.push({ fn: this.fn!.name, vars });
    cache._scopeCache.set(this.fn!.name + key, this.scopes.length - 1);
    return this.scopes.length - 1;
  }

  private newLocal(name: string, t: CType): string {
    const js = `v${this.fn!.localCount++}_${name}`;
    this.fn!.jsLocals.push(js);
    this.fn!.jsVarList.push({ name, js, t });
    return js;
  }

  private allocFrame(t: CType): number {
    const size = sizeOf(t);
    const a = Math.min(8, Math.max(4, size >= 8 ? 8 : 4));
    this.fn!.frame = Math.ceil(this.fn!.frame / a) * a;
    const off = this.fn!.frame;
    this.fn!.frame += Math.max(4, size);
    return off;
  }

  private temp(): string {
    return `$t${this.fn!.temps++}`;
  }

  private newStmt(loc: Loc): number {
    this.stmts.push({ file: loc.file, line: loc.line });
    return this.stmts.length - 1;
  }

  private stmtHead(loc: Loc, cost: number): string {
    const sid = this.newStmt(loc);
    const scopeId = this.currentScopeId();
    return `S.c+=${cost};S.ln=${sid};if(S.c>=S.lim||B[${sid}])yield*P(${sid},${scopeId},()=>[fp${this.closureVars()}]);`;
  }

  // ---------- statements ----------
  private genBlockItems(items: Stmt[], fnBody = false): string {
    if (!fnBody) this.fn!.scopes.push(new Map());
    let s = '';
    for (const st of items) s += this.genStmt(st);
    if (!fnBody) this.fn!.scopes.pop();
    return s;
  }

  private loops = 0;
  private switches = 0;

  private genStmt(st: Stmt): string {
    switch (st.k) {
      case 'empty':
        return '';
      case 'asm':
        return this.stmtHead(st.loc, 1);
      case 'expr': {
        const g = this.genExpr(st.e);
        const code = this.valueCode(g, true);
        return this.stmtHead(st.loc, g.c) + code + ';';
      }
      case 'decl':
        return st.decls.map((d) => this.genLocalDecl(d)).join('');
      case 'block':
        return '{' + this.genBlockItems(st.items) + '}';
      case 'if': {
        const c = this.genCond(st.c);
        let s = this.stmtHead(st.loc, c.c + C_BRANCH) + `if(${c.code}){${this.genScoped(st.then)}}`;
        if (st.else) s += `else{${this.genScoped(st.else)}}`;
        return s;
      }
      case 'while': {
        const c = this.genCond(st.c);
        this.loops++;
        const body = this.genScoped(st.body);
        this.loops--;
        return `for(;;){${this.stmtHead(st.loc, c.c + C_BRANCH)}if(!(${c.code}))break;${body}}`;
      }
      case 'dowhile': {
        this.loops++;
        const body = this.genScoped(st.body);
        this.loops--;
        const c = this.genCond(st.c);
        const sid = this.newStmt(st.c.loc);
        return `do{${body}S.c+=${c.c + C_BRANCH};S.ln=${sid};}while(${c.code});`;
      }
      case 'for': {
        this.fn!.scopes.push(new Map());
        const init = st.init ? this.genStmt(st.init) : '';
        const c = st.c ? this.genCond(st.c) : { code: '1', c: 0 };
        let step = '';
        let stepCost = 0;
        if (st.step) {
          const g = this.genExpr(st.step);
          step = this.valueCode(g, true);
          stepCost = g.c;
        }
        this.loops++;
        const body = this.genScoped(st.body);
        this.loops--;
        const head = this.stmtHead(st.loc, c.c + C_BRANCH);
        this.fn!.scopes.pop();
        return `{${init}for(;;${step ? `S.c+=${stepCost},${step}` : ''}){${head}if(!(${c.code}))break;${body}}}`;
      }
      case 'return': {
        if (!st.e) return this.stmtHead(st.loc, 3) + 'return;';
        const g = this.genExpr(st.e);
        const ret = this.fn!.ret;
        if (ret.k === 'void') return this.stmtHead(st.loc, g.c + 3) + this.valueCode(g, true) + ';return;';
        const v = this.assignConv(g, ret, st.e.loc, 'return');
        return this.stmtHead(st.loc, g.c + 3) + `return ${v};`;
      }
      case 'break':
        if (!this.loops && !this.switches) throw err('break statement not within loop or switch', st.loc);
        return this.stmtHead(st.loc, C_BRANCH) + 'break;';
      case 'continue':
        if (!this.loops) throw err('continue statement not within a loop', st.loc);
        return this.stmtHead(st.loc, C_BRANCH) + 'continue;';
      case 'switch': {
        const g = this.genExpr(st.e);
        const t = promote(this.rvType(g));
        if (!isInt(t)) throw err('switch quantity not an integer', st.loc);
        const v = conv(this.load(g), this.rvType(g), t);
        this.switches++;
        const body = st.body.k === 'block' ? st.body.items : [st.body];
        this.fn!.scopes.push(new Map());
        let s = '';
        const flatten = (x: Stmt) => {
          if (x.k === 'case') {
            const cv = this.constValue(x.e);
            if (cv === null) throw err('case label does not reduce to an integer constant', x.loc);
            s += `case ${conv(String(wrapInt(cv, t as IntT)), INT, t)}:`;
            flatten(x.body);
          } else if (x.k === 'default') {
            s += 'default:';
            flatten(x.body);
          } else s += this.genStmt(x);
        };
        for (const it of body) flatten(it);
        this.fn!.scopes.pop();
        this.switches--;
        return this.stmtHead(st.loc, g.c + 4) + `switch(${v}){${s}}`;
      }
      case 'case':
      case 'default':
        throw err(`'${st.k}' label not within a switch statement`, st.loc);
      case 'goto':
        throw err('goto is not supported by the simulator', st.loc);
      case 'label':
        this.warn(`label '${st.name}' defined but goto is not supported`, st.loc);
        return this.genStmt(st.body);
    }
  }

  private genScoped(st: Stmt): string {
    this.fn!.scopes.push(new Map());
    const s = this.genStmt(st);
    this.fn!.scopes.pop();
    return s;
  }

  private genCond(e: Expr): { code: string; c: number } {
    const g = this.genExpr(e);
    const t = this.rvType(g);
    if (!isScalar(t)) throw err(`used ${typeName(t)} type value where scalar is required`, e.loc);
    const v = this.load(g);
    return { code: t.k === 'float' ? `(${v})!=0` : v, c: g.c };
  }

  private genLocalDecl(d: VarDecl): string {
    const scope = this.fn!.scopes[this.fn!.scopes.length - 1];
    if (d.type.k === 'func') {
      scope.set(d.name, { k: 'func', key: this.funcKeyFor(d.name), t: d.type as FuncT, name: d.name });
      return '';
    }
    if (d.storage === 'extern') {
      const g = this.globals.get(d.name);
      if (!g) throw err(`undefined reference to \`${d.name}'`, d.loc);
      scope.set(d.name, { k: 'global', key: d.name, t: g.t });
      return '';
    }
    if (d.storage === 'static') {
      // static local -> unique global
      const key = `${this.fn!.name}.${d.name}@${this.tuIndex}.${this.globals.size}`;
      const size = sizeOf(d.type);
      this.dataTop = Math.ceil(this.dataTop / 4) * 4;
      const g: GlobalSym = { key, name: `${this.fn!.name}::${d.name}`, t: d.type, addr: this.dataTop, defined: true, hasInit: !!d.init, isStatic: true, file: this.file, loc: d.loc };
      this.dataTop += Math.max(4, size);
      this.globals.set(key, g);
      scope.set(d.name, { k: 'global', key, t: d.type });
      if (d.init) {
        const saved = this.fn;
        const lines: string[] = [];
        this.fn = { ...saved!, temps: this.initTemps, scopes: [new Map()], jsLocals: [] };
        this.genInitializer(String(g.addr), d.type, d.init, lines, d.loc);
        this.initTemps = this.fn.temps;
        this.fn = saved;
        this.initCode.push(...lines);
      }
      return '';
    }
    const t = d.type;
    if (sizeOf(t) === 0 && t.k !== 'array') throw err(`storage size of '${d.name}' isn't known`, d.loc);
    const memResident = this.fn!.addrTaken.has(d.name) || t.k === 'array' || t.k === 'struct';
    if (memResident) {
      const off = this.allocFrame(t);
      const sym: Sym = { k: 'localmem', off, t };
      if (!d.init) {
        scope.set(d.name, sym);
        return '';
      }
      const lines: string[] = [];
      scope.set(d.name, sym);
      const cost = this.genInitializer(`(fp+${off})`, t, d.init, lines, d.loc);
      return this.stmtHead(d.loc, cost) + lines.join('');
    }
    const js = this.newLocal(d.name, t);
    if (!d.init) {
      scope.set(d.name, { k: 'local', js, t, idx: 0 });
      return `${js}=0;`;
    }
    let initE: Expr;
    if (d.init.k === 'list') {
      const first = d.init.items[0];
      if (!first) initE = { k: 'num', v: 0, t: INT, loc: d.loc };
      else if (first.init.k !== 'expr') throw err('braces around scalar initializer', d.loc);
      else initE = first.init.e;
    } else initE = d.init.e;
    const g = this.genExpr(initE);
    const v = this.assignConv(g, t, initE.loc, 'initialization');
    scope.set(d.name, { k: 'local', js, t, idx: 0 });
    return this.stmtHead(d.loc, g.c + C_STORE) + `${js}=${v};`;
  }

  private funcKeyFor(name: string): string {
    if (this.funcs.has(`${name}@${this.tuIndex}`)) return `${name}@${this.tuIndex}`;
    return name;
  }

  /** Emit code initializing memory at addrCode with type t. Returns cycle cost. */
  private genInitializer(addrCode: string, t: CType, init: Init, lines: string[], loc: Loc): number {
    let cost = 0;
    if (t.k === 'array' || t.k === 'struct') {
      const size = sizeOf(t);
      // string literal into char array
      const strInit = this.stringInit(t, init);
      if (strInit) {
        lines.push(`memset(${addrCode},0,${size});`);
        const n = Math.min(strInit.length, t.k === 'array' && t.len !== null ? t.len : strInit.length);
        lines.push(`copyBytes(${addrCode},[${strInit.slice(0, n).join(',')}]);`);
        return Math.ceil(size / 4) * 2 + 4;
      }
      if (init.k === 'expr') {
        // struct copy initialisation
        const g = this.genExpr(init.e);
        const gt = this.rvType(g);
        if (t.k === 'struct' && gt.k === 'struct' && gt.def === t.def) {
          lines.push(`memcpy(${addrCode},${this.load(g)},${size});`);
          return g.c + size;
        }
        throw err(`invalid initializer`, loc);
      }
      lines.push(`memset(${addrCode},0,${size});`);
      cost += Math.ceil(size / 4) + 4;
      const items = init.items;
      const pos = { i: 0 };
      cost += this.fillAggregate(addrCode, t, items, pos, lines, true);
      if (pos.i < items.length) this.warn('excess elements in initializer', loc);
      return cost;
    }
    // scalar
    let e: Expr;
    if (init.k === 'list') {
      if (!init.items.length) return 0;
      const f = init.items[0].init;
      if (f.k !== 'expr') throw err('braces around scalar initializer', loc);
      e = f.e;
    } else e = init.e;
    const g = this.genExpr(e);
    lines.push(`${stName(t)}(${addrCode},${this.assignConv(g, t, e.loc, 'initialization')});`);
    return g.c + C_STORE;
  }

  private stringInit(t: CType, init: Init): number[] | null {
    if (t.k !== 'array' || t.of.k !== 'int' || t.of.size !== 1) return null;
    if (init.k === 'expr' && init.e.k === 'str') return init.e.bytes;
    if (init.k === 'list' && init.items.length === 1 && !init.items[0].desig.length) {
      const f = init.items[0].init;
      if (f.k === 'expr' && f.e.k === 'str') return f.e.bytes;
    }
    return null;
  }

  /** consume initializer items for aggregate t (braced = list belongs to this aggregate) */
  private fillAggregate(addr: string, t: CType, items: { desig: Designator[]; init: Init }[], pos: { i: number }, lines: string[], braced: boolean): number {
    let cost = 0;
    const members: { off: number; t: CType }[] = [];
    let fieldIndex = (name: string): number => -1;
    if (t.k === 'struct') {
      const fields = t.def.union ? t.def.fields.slice(0, 1) : t.def.fields;
      for (const f of fields) members.push({ off: f.offset, t: f.type });
      fieldIndex = (name) => t.def.fields.findIndex((f) => f.name === name);
    } else if (t.k === 'array') {
      const n = t.len ?? 0;
      const es = sizeOf(t.of);
      // lazily handle arrays; generate members on demand
      for (let i = 0; i < n; i++) members.push({ off: i * es, t: t.of });
    }
    let m = 0;
    while (pos.i < items.length && m <= members.length) {
      const it = items[pos.i];
      if (it.desig.length) {
        if (!braced && m > 0) return cost; // designator belongs to outer level
        const d0 = it.desig[0];
        if ('field' in d0) {
          if (t.k !== 'struct') throw err('field name not in record or union initializer', it.init.loc);
          const fi = fieldIndex(d0.field);
          if (fi < 0) throw err(`unknown field '${d0.field}' specified in initializer`, it.init.loc);
          if (t.def.union) {
            members[0] = { off: t.def.fields[fi].offset, t: t.def.fields[fi].type };
            m = 0;
          } else m = fi;
        } else {
          if (t.k !== 'array') throw err('array index in non-array initializer', it.init.loc);
          const idx = this.constValue(d0.index);
          if (idx === null) throw err('nonconstant array index in initializer', it.init.loc);
          m = idx;
        }
        if (m >= members.length) throw err('array index in initializer exceeds array bounds', it.init.loc);
        const mem = members[m];
        const subAddr = `(${addr}+${mem.off})`;
        if (it.desig.length > 1) {
          const sub = { desig: it.desig.slice(1), init: it.init };
          const p2 = { i: 0 };
          cost += this.fillAggregate(subAddr, mem.t, [sub], p2, lines, true);
          pos.i++;
        } else {
          cost += this.initMember(subAddr, mem.t, items, pos, lines);
        }
        m++;
        continue;
      }
      if (m >= members.length) break;
      const mem = members[m];
      cost += this.initMember(`(${addr}+${mem.off})`, mem.t, items, pos, lines);
      m++;
    }
    return cost;
  }

  private initMember(addr: string, mt: CType, items: { desig: Designator[]; init: Init }[], pos: { i: number }, lines: string[]): number {
    const it = items[pos.i];
    const init = it.init;
    if (mt.k === 'array' || mt.k === 'struct') {
      if (init.k === 'list') {
        pos.i++;
        const strInit = this.stringInit(mt, init);
        if (strInit) {
          lines.push(`copyBytes(${addr},[${strInit.join(',')}]);`);
          return strInit.length;
        }
        const p2 = { i: 0 };
        return this.fillAggregate(addr, mt, init.items, p2, lines, true);
      }
      const strInit = this.stringInit(mt, init);
      if (strInit) {
        pos.i++;
        lines.push(`copyBytes(${addr},[${strInit.slice(0, mt.k === 'array' && mt.len ? mt.len : strInit.length).join(',')}]);`);
        return strInit.length;
      }
      if (mt.k === 'struct' && init.k === 'expr') {
        const g = this.genExpr(init.e);
        const gt = this.rvType(g);
        if (gt.k === 'struct' && gt.def === mt.def) {
          pos.i++;
          lines.push(`memcpy(${addr},${this.load(g)},${sizeOf(mt)});`);
          return g.c + sizeOf(mt);
        }
      }
      // brace elision
      const strip = { desig: [], init } as { desig: Designator[]; init: Init };
      void strip;
      return this.fillAggregate(addr, mt, items, pos, lines, false);
    }
    pos.i++;
    if (init.k === 'list') {
      const f = init.items[0]?.init;
      if (!f) return 0;
      if (f.k !== 'expr') throw err('braces around scalar initializer', init.loc);
      const g = this.genExpr(f.e);
      lines.push(`${stName(mt)}(${addr},${this.assignConv(g, mt, f.e.loc, 'initialization')});`);
      return g.c + C_STORE;
    }
    const g = this.genExpr(init.e);
    lines.push(`${stName(mt)}(${addr},${this.assignConv(g, mt, init.e.loc, 'initialization')});`);
    return g.c + C_STORE;
  }

  private constValue(e: Expr): number | null {
    return constEval(e, (name) => {
      const s = this.lookup(name);
      if (s && (s.k === 'local' || s.k === 'localmem' || s.k === 'global')) return { type: s.t };
      return undefined;
    });
  }

  // ---------- expressions ----------
  private lookup(name: string): Sym | undefined {
    if (this.fn) {
      for (let i = this.fn.scopes.length - 1; i >= 0; i--) {
        const s = this.fn.scopes[i].get(name);
        if (s) return s;
      }
    }
    return this.tuScope.get(name);
  }

  /** type after lvalue conversion/decay */
  private rvType(g: G): CType {
    if (g.k === 'fn') return ptr(g.t);
    return decay(unqual(g.t));
  }

  /** Code for the rvalue of g. */
  private load(g: G): string {
    switch (g.k) {
      case 'val':
        return g.code;
      case 'js':
        return g.name;
      case 'mem': {
        const t = g.t;
        if (t.k === 'array' || t.k === 'struct') return g.addr;
        if (t.k === 'func') return g.addr;
        if (t.k === 'void') return `(${g.addr},0)`;
        return `${ldName(t)}(${g.addr})`;
      }
      case 'fn':
        return this.fnAddrCode(g.key, g.name);
    }
  }

  private fnAddrCode(key: string, name: string): string {
    const f = this.funcs.get(key);
    if (f && f.def) return String(FN_BASE + f.id * 4 + 1);
    if (this.natives[name]) return String(FN_BASE + this.nativeIds[name] * 4 + 1);
    this.usedExternals.set(name, { file: this.file, line: 0, col: 0 });
    return `fnAddr(${JSON.stringify(name)})`;
  }

  /** value code, used for expression statements (may discard) */
  private valueCode(g: G, discard: boolean): string {
    if (discard && g.k === 'mem' && g.t.k !== 'struct' && g.t.k !== 'array' && g.t.k !== 'void') {
      return `${ldName(g.t)}(${g.addr})`; // volatile reads still performed
    }
    return this.load(g);
  }

  private assignConv(g: G, to: CType, loc: Loc, ctx: string): string {
    const from = this.rvType(g);
    to = unqual(to);
    if (to.k === 'struct') {
      if (from.k !== 'struct' || from.def !== to.def) throw err(`incompatible types when ${ctx === 'return' ? 'returning' : 'assigning to'} type '${typeName(to)}' from type '${typeName(from)}'`, loc);
      return this.load(g);
    }
    if (to.k === 'ptr' && from.k === 'int' && !(g.k === 'val' && g.code === '0')) {
      if (!(g.k === 'val' && /^\d+$/.test(g.code) && Number(g.code) === 0)) this.warn(`${ctx} makes pointer from integer without a cast`, loc);
    } else if (to.k === 'int' && from.k === 'ptr' && !to.bool) {
      this.warn(`${ctx} makes integer from pointer without a cast`, loc);
    } else if (to.k === 'ptr' && from.k === 'ptr') {
      const a = unqual(to.to), b = unqual(from.to);
      if (a.k !== 'void' && b.k !== 'void' && !(a.k === b.k && (a.k !== 'struct' || (b as StructT).def === a.def)) && !(a.k === 'int' && b.k === 'int' && a.size === b.size)) {
        this.warn(`incompatible pointer types in ${ctx}`, loc);
      }
    } else if (!isScalar(to) && to.k !== 'void') {
      throw err(`incompatible types in ${ctx}`, loc);
    } else if (isScalar(to) && !isScalar(from)) {
      throw err(`incompatible types when ${ctx === 'return' ? 'returning' : 'assigning to'} type '${typeName(to)}' from type '${typeName(from)}'`, loc);
    }
    return conv(this.load(g), from, to);
  }

  private store(lv: G, valueCode: string, loc: Loc): string {
    if (lv.k === 'js') return `(${lv.name}=${valueCode})`;
    if (lv.k === 'mem') {
      if (lv.t.k === 'struct') return `memcpy(${lv.addr},${valueCode},${sizeOf(lv.t)})`;
      if (lv.t.k === 'array') throw err('assignment to expression with array type', loc);
      return `${stName(lv.t)}(${lv.addr},${valueCode})`;
    }
    throw err('lvalue required as left operand of assignment', loc);
  }

  private checkModifiable(g: G, loc: Loc) {
    if (g.k === 'val' || g.k === 'fn') throw err('lvalue required as left operand of assignment', loc);
    if (g.t.const) this.warn(`assignment of read-only location`, loc);
  }

  /** Make address code reusable (evaluate once). */
  private stable(addr: string): { pre: string; addr: string } {
    if (/^[\w$.]+$/.test(addr) || /^\(fp\+\d+\)$/.test(addr) || /^\d+$/.test(addr)) return { pre: '', addr };
    const t = this.temp();
    return { pre: `${t}=${addr},`, addr: t };
  }

  genExpr(e: Expr): G {
    switch (e.k) {
      case 'num': {
        const t = e.t;
        if (t.k === 'float') {
          const v = Object.is(e.v, -0) ? '-0' : String(e.v);
          return { k: 'val', code: v === 'Infinity' ? '(1/0)' : v, t, c: C_CONST };
        }
        return { k: 'val', code: e.v < 0 ? `(${e.v})` : String(e.v), t, c: C_CONST };
      }
      case 'str': {
        const addr = this.strAddr(e.bytes);
        return { k: 'mem', addr: String(addr), t: { k: 'array', of: CHAR, len: e.bytes.length + 1 }, c: C_CONST };
      }
      case 'id':
        return this.genId(e);
      case 'compound': {
        if (!this.fn) throw err('compound literal at file scope not supported', e.loc);
        const off = this.allocFrame(e.t);
        const lines: string[] = [];
        const c = this.genInitializer(`(fp+${off})`, e.t, e.init, lines, e.loc);
        const code = lines.length ? `(${lines.map((l) => l.replace(/;$/, '')).join(',')},fp+${off})` : `(fp+${off})`;
        return { k: 'mem', addr: code, t: e.t, c };
      }
      case 'sizeof_t': {
        if (e.t.k === 'struct' && !e.t.def.complete) throw err(`invalid application of 'sizeof' to incomplete type '${typeName(e.t)}'`, e.loc);
        return { k: 'val', code: String(sizeOf(e.t)), t: UINT, c: C_CONST };
      }
      case 'sizeof_e': {
        const savedTemps = this.fn?.temps;
        const savedFrame = this.fn?.frame;
        const g = this.genExpr(e.e);
        if (this.fn) {
          this.fn.temps = savedTemps!;
          this.fn.frame = savedFrame!;
        }
        const t = g.k === 'fn' ? g.t : g.t;
        return { k: 'val', code: String(sizeOf(t)), t: UINT, c: C_CONST };
      }
      case 'cast': {
        const g = this.genExpr(e.e);
        const to = e.t;
        if (to.k === 'void') return { k: 'val', code: `(${this.valueCode(g, true)},0)`, t: VOID, c: g.c };
        const from = this.rvType(g);
        if (!isScalar(to)) throw err(`conversion to non-scalar type requested`, e.loc);
        if (!isScalar(from)) throw err(`aggregate value used where a scalar was expected`, e.loc);
        const cc = (from.k === 'float') !== (to.k === 'float') ? 2 : 0;
        return { k: 'val', code: conv(this.load(g), from, to), t: unqual(to), c: g.c + cc };
      }
      case 'un':
        return this.genUnary(e);
      case 'incdec':
        return this.genIncDec(e);
      case 'bin':
        return this.genBinary(e);
      case 'assign':
        return this.genAssign(e);
      case 'cond': {
        const c = this.genCond(e.c);
        const a = this.genExpr(e.a);
        const b = this.genExpr(e.b);
        const ta = this.rvType(a), tb = this.rvType(b);
        let t: CType;
        if (isArith(ta) && isArith(tb)) t = arithCommon(ta, tb);
        else if (ta.k === 'void' || tb.k === 'void') t = VOID;
        else if (ta.k === 'ptr') t = ta;
        else if (tb.k === 'ptr') t = tb;
        else t = ta;
        const ac = t.k === 'void' ? this.valueCode(a, true) : conv(this.load(a), ta, t);
        const bc = t.k === 'void' ? this.valueCode(b, true) : conv(this.load(b), tb, t);
        if (t.k === 'struct') return { k: 'mem', addr: `(${c.code}?${ac}:${bc})`, t, c: c.c + Math.max(a.c, b.c) + C_BRANCH };
        return { k: 'val', code: `(${c.code}?${ac}:${bc})`, t, c: c.c + Math.max(a.c, b.c) + C_BRANCH };
      }
      case 'comma': {
        const l = this.genExpr(e.l);
        const r = this.genExpr(e.r);
        const rt = this.rvType(r);
        const code = `(${this.valueCode(l, true)},${this.load(r)})`;
        if (rt.k === 'struct') return { k: 'mem', addr: code, t: rt, c: l.c + r.c };
        return { k: 'val', code, t: rt, c: l.c + r.c };
      }
      case 'call':
        return this.genCall(e);
      case 'index': {
        const a = this.genExpr(e.a);
        const i = this.genExpr(e.i);
        let ta = this.rvType(a);
        let ti = this.rvType(i);
        let base = a, idx = i;
        if (ta.k !== 'ptr' && ti.k === 'ptr') {
          [base, idx] = [i, a];
          [ta, ti] = [ti, ta];
        }
        if (ta.k !== 'ptr') throw err('subscripted value is neither array nor pointer nor vector', e.loc);
        if (!isInt(ti)) throw err('array subscript is not an integer', e.loc);
        const el = ta.to;
        const es = sizeOf(el);
        const ic = conv(this.load(idx), ti, INT);
        const addr = /^\d+$/.test(ic) ? `(${this.load(base)}+${Number(ic) * es})` : `(${this.load(base)}+${es === 1 ? ic : `(${ic})*${es}`})`;
        return { k: 'mem', addr, t: el, c: a.c + i.c + C_ALU * 2 };
      }
      case 'member': {
        const b = this.genExpr(e.e);
        let st: CType;
        let baseAddr: string;
        if (e.arrow) {
          const t = this.rvType(b);
          if (t.k !== 'ptr' || unqual(t.to).k !== 'struct') throw err(`invalid type argument of '->' (have '${typeName(t)}')`, e.loc);
          st = t.to;
          baseAddr = this.load(b);
        } else {
          st = b.t;
          if (st.k !== 'struct') throw err(`request for member '${e.name}' in something not a structure or union`, e.loc);
          if (b.k === 'mem') baseAddr = b.addr;
          else baseAddr = this.load(b);
        }
        const sd = (st as StructT).def;
        if (!sd.complete) throw err(`dereferencing pointer to incomplete type '${typeName(st)}'`, e.loc);
        const f = sd.fields.find((x) => x.name === e.name);
        if (!f) throw err(`'${typeName(unqual(st))}' has no member named '${e.name}'`, e.loc);
        let ft = f.type;
        if (st.volatile && !ft.volatile) ft = { ...ft, volatile: true } as CType;
        if (st.const && !ft.const) ft = { ...ft, const: true } as CType;
        const addr = f.offset ? `(${baseAddr}+${f.offset})` : baseAddr;
        return { k: 'mem', addr, t: ft, c: b.c + (e.arrow ? C_LOAD : 0) };
      }
    }
  }

  private genId(e: Expr & { k: 'id' }): G {
    const s = this.lookup(e.name);
    if (!s) {
      if (this.natives[e.name] || this.funcs.has(e.name)) {
        // function used without declaration in this TU
        const t: FuncT = this.funcs.get(e.name)?.t ?? { k: 'func', ret: INT, params: [], variadic: false, oldStyle: true };
        return { k: 'fn', key: e.name, name: e.name, t, c: 0 };
      }
      throw err(`'${e.name}' undeclared (first use in this function)`, e.loc);
    }
    switch (s.k) {
      case 'local':
        return { k: 'js', name: s.js, t: s.t, c: C_LOAD };
      case 'localmem':
        return { k: 'mem', addr: `(fp+${s.off})`, t: s.t, c: C_LOAD };
      case 'global': {
        const g = this.globals.get(s.key)!;
        if (!g.defined) {
          throw err(`undefined reference to \`${e.name}'`, e.loc);
        }
        return { k: 'mem', addr: String(g.addr), t: g.t, c: C_LOAD + 1 };
      }
      case 'func':
        return { k: 'fn', key: s.key, name: s.name, t: s.t, c: 0 };
    }
  }

  private genUnary(e: Expr & { k: 'un' }): G {
    const g = this.genExpr(e.e);
    switch (e.op) {
      case '&': {
        if (g.k === 'fn') return { k: 'val', code: this.fnAddrCode(g.key, g.name), t: ptr(g.t), c: C_CONST };
        if (g.k !== 'mem') throw err('lvalue required as unary \'&\' operand', e.loc);
        return { k: 'val', code: g.addr, t: ptr(g.t), c: g.c - C_LOAD + C_ALU };
      }
      case '*': {
        const t = this.rvType(g);
        if (t.k !== 'ptr') throw err(`invalid type argument of unary '*' (have '${typeName(t)}')`, e.loc);
        if (t.to.k === 'func') return { k: 'val', code: this.load(g), t: t, c: g.c };
        if (t.to.k === 'void') this.warn("dereferencing 'void *' pointer", e.loc);
        return { k: 'mem', addr: this.load(g), t: t.to, c: g.c + C_LOAD };
      }
      case '+':
      case '-': {
        const t0 = this.rvType(g);
        if (!isArith(t0)) throw err(`wrong type argument to unary ${e.op === '-' ? 'minus' : 'plus'}`, e.loc);
        const t = promote(t0);
        const v = conv(this.load(g), t0, t);
        if (e.op === '+') return { k: 'val', code: v, t, c: g.c };
        if (t.k === 'float') return { k: 'val', code: `(-${wrapParen(v)})`, t, c: g.c + C_FLT };
        return { k: 'val', code: conv(`(-${wrapParen(v)})`, LLONG, t), t, c: g.c + C_ALU };
      }
      case '~': {
        const t0 = this.rvType(g);
        if (!isInt(t0)) throw err('wrong type argument to bit-complement', e.loc);
        const t = promote(t0) as IntT;
        const v = conv(this.load(g), t0, t);
        if (t.size === 8) return { k: 'val', code: `W64(-(${v})-1,${t.signed})`, t, c: g.c + C_ALU };
        return { k: 'val', code: t.signed ? `(~${wrapParen(v)})` : `((~${wrapParen(v)})>>>0)`, t, c: g.c + C_ALU };
      }
      case '!': {
        const t0 = this.rvType(g);
        if (!isScalar(t0)) throw err('wrong type argument to unary exclamation mark', e.loc);
        return { k: 'val', code: `(${this.load(g)}==0?1:0)`, t: INT, c: g.c + C_ALU + 1 };
      }
    }
    throw err(`unknown unary operator ${e.op}`, e.loc);
  }

  private genIncDec(e: Expr & { k: 'incdec' }): G {
    const g = this.genExpr(e.e);
    this.checkModifiable(g, e.loc);
    const t = unqual(g.t);
    if (!isScalar(t)) throw err(`wrong type argument to ${e.op === '++' ? 'increment' : 'decrement'}`, e.loc);
    const delta = t.k === 'ptr' ? sizeOf(t.to) : 1;
    const op = e.op === '++' ? '+' : '-';
    const calc = (cur: string) => (t.k === 'float' ? conv(`${cur}${op}1`, DOUBLE, t) : t.k === 'ptr' ? `((${cur}${op}${delta})>>>0)` : conv(`${cur}${op}1`, LLONG, t));
    const cost = g.c + C_ALU + C_STORE + (t.k === 'float' ? C_FLT : 0);
    if (g.k === 'js') {
      if (e.prefix) return { k: 'val', code: `(${g.name}=${calc(g.name)})`, t, c: cost };
      const tmp = this.temp();
      return { k: 'val', code: `(${tmp}=${g.name},${g.name}=${calc(tmp)},${tmp})`, t, c: cost };
    }
    if (g.k === 'mem') {
      const s = this.stable(g.addr);
      const ld = `${ldName(t)}(${s.addr})`;
      if (e.prefix) return { k: 'val', code: `(${s.pre}${stName(t)}(${s.addr},${calc(ld)}))`, t, c: cost };
      const tmp = this.temp();
      return { k: 'val', code: `(${s.pre}${tmp}=${ld},${stName(t)}(${s.addr},${calc(tmp)}),${tmp})`, t, c: cost };
    }
    throw err('lvalue required as increment operand', e.loc);
  }

  private arith(op: string, l: string, r: string, t: CType, loc: Loc): { code: string; c: number } {
    if (t.k === 'float') {
      const f = t.size === 4;
      const cc = f ? C_FLT : C_DBL;
      const wrap = (x: string) => (f ? `fr(${x})` : `(${x})`);
      switch (op) {
        case '+': case '-': case '*': case '/':
          return { code: wrap(`${l}${op}${r}`), c: op === '/' ? cc * 4 : cc };
        case '%':
          throw err('invalid operands to binary % (have float)', loc);
      }
      throw err(`invalid operands to binary ${op}`, loc);
    }
    const it = t as IntT;
    if (it.size === 8) {
      return { code: `I64(${JSON.stringify(op)},${l},${r},${it.signed})`, c: C_ALU * 4 };
    }
    const s = it.signed;
    const fix = (x: string) => (s ? `((${x})|0)` : `((${x})>>>0)`);
    switch (op) {
      case '+': case '-': return { code: fix(`${l}${op}${r}`), c: C_ALU };
      case '*': return { code: s ? `Math.imul(${l},${r})` : `(Math.imul(${l},${r})>>>0)`, c: C_ALU };
      case '/': return { code: s ? `sdiv(${l},${r})` : `udiv(${l},${r})`, c: C_DIV };
      case '%': return { code: s ? `smod(${l},${r})` : `umod(${l},${r})`, c: C_DIV + 2 };
      case '&': case '|': case '^': return { code: fix(`${l}${op}${r}`), c: C_ALU };
    }
    throw err(`invalid operator ${op}`, loc);
  }

  private genBinary(e: Expr & { k: 'bin' }): G {
    const op = e.op;
    if (op === '&&' || op === '||') {
      const l = this.genCond(e.l);
      const r = this.genCond(e.r);
      return { k: 'val', code: `((${l.code})${op}(${r.code})?1:0)`, t: INT, c: l.c + r.c + C_BRANCH };
    }
    const lg = this.genExpr(e.l);
    const rg = this.genExpr(e.r);
    const lt = this.rvType(lg);
    const rt = this.rvType(rg);
    const lc = this.load(lg);
    const rc = this.load(rg);
    const base = lg.c + rg.c;
    // pointer arithmetic
    if ((op === '+' || op === '-') && (lt.k === 'ptr' || rt.k === 'ptr')) {
      if (op === '-' && lt.k === 'ptr' && rt.k === 'ptr') {
        const es = sizeOf(lt.to) || 1;
        return { k: 'val', code: `(((${lc})-(${rc}))/${es}|0)`, t: INT, c: base + C_ALU * 2 };
      }
      const [p, pt, i, it] = lt.k === 'ptr' ? [lc, lt, rc, rt] : [rc, rt, lc, lt];
      if (!isInt(it)) throw err(`invalid operands to binary ${op} (have '${typeName(lt)}' and '${typeName(rt)}')`, e.loc);
      if (op === '-' && lt.k !== 'ptr') throw err('invalid operands to binary -', e.loc);
      const es = sizeOf((pt as { to: CType }).to) || 1;
      const ic = conv(i, it, INT);
      return { k: 'val', code: `((${p}${op}${es === 1 ? ic : `(${ic})*${es}`})>>>0)`, t: pt, c: base + C_ALU * 2 };
    }
    if (['<', '>', '<=', '>=', '==', '!='].includes(op)) {
      let ct: CType;
      if (isArith(lt) && isArith(rt)) ct = arithCommon(lt, rt);
      else if (lt.k === 'ptr' || rt.k === 'ptr') {
        ct = UINT;
        if (lt.k === 'ptr' && rt.k === 'int' && !(rg.k === 'val' && rg.code === '0')) this.warn('comparison between pointer and integer', e.loc);
        if (rt.k === 'ptr' && lt.k === 'int' && !(lg.k === 'val' && lg.code === '0')) this.warn('comparison between pointer and integer', e.loc);
      } else throw err(`invalid operands to binary ${op}`, e.loc);
      const jsop = op === '==' ? '===' : op === '!=' ? '!==' : op;
      const a = conv(lc, lt, ct);
      const b = conv(rc, rt, ct);
      if (isInt(ct) && ct.size === 4 && ((isInt(lt) && lt.signed && !ct.signed && !(lg.k === 'val' && /^\d+$/.test(lg.code))) || (isInt(rt) && rt.signed && !ct.signed && !(rg.k === 'val' && /^\d+$/.test(rg.code))))) {
        /* -Wsign-compare is only enabled by -Wextra (CubeIDE uses -Wall), so no warning */
      }
      return { k: 'val', code: `(${a}${jsop}${b}?1:0)`, t: INT, c: base + (ct.k === 'float' ? C_FLT : C_ALU) + 1 };
    }
    if (op === '<<' || op === '>>') {
      if (!isInt(lt) || !isInt(rt)) throw err(`invalid operands to binary ${op}`, e.loc);
      const t = promote(lt) as IntT;
      const a = conv(lc, lt, t);
      const b = conv(rc, rt, INT);
      if (t.size === 8) return { k: 'val', code: `I64(${JSON.stringify(op)},${a},${b},${t.signed})`, t, c: base + C_ALU * 2 };
      let code: string;
      if (op === '<<') code = t.signed ? `(${a}<<${b})` : `((${a}<<${b})>>>0)`;
      else code = t.signed ? `(${a}>>${b})` : `(${a}>>>${b})`;
      return { k: 'val', code, t, c: base + C_ALU };
    }
    if (!isArith(lt) || !isArith(rt)) throw err(`invalid operands to binary ${op} (have '${typeName(lt)}' and '${typeName(rt)}')`, e.loc);
    if ((op === '%' || op === '&' || op === '|' || op === '^') && (!isInt(lt) || !isInt(rt))) throw err(`invalid operands to binary ${op} (have '${typeName(lt)}' and '${typeName(rt)}')`, e.loc);
    const ct = arithCommon(lt, rt);
    const r = this.arith(op, conv(lc, lt, ct), conv(rc, rt, ct), ct, e.loc);
    if ((op === '/' || op === '%') && rg.k === 'val' && rg.code === '0' && isInt(ct)) this.warn('division by zero', e.loc);
    return { k: 'val', code: r.code, t: ct, c: base + r.c };
  }

  private genAssign(e: Expr & { k: 'assign' }): G {
    const lg = this.genExpr(e.l);
    this.checkModifiable(lg, e.loc);
    const lt = unqual(lg.t);
    if (lt.k === 'array') throw err('assignment to expression with array type', e.loc);
    const rg = this.genExpr(e.r);
    if (e.op === '=') {
      const v = this.assignConv(rg, lt, e.r.loc, 'assignment');
      const cost = lg.c - (lg.k === 'js' || lg.k === 'mem' ? C_LOAD : 0) + rg.c + C_STORE;
      if (lt.k === 'struct') {
        if (lg.k !== 'mem') throw err('invalid struct assignment', e.loc);
        return { k: 'mem', addr: `memcpy(${lg.addr},${v},${sizeOf(lt)})`, t: lt, c: cost + sizeOf(lt) / 2 };
      }
      return { k: 'val', code: this.store(lg, v, e.loc), t: lt, c: cost };
    }
    const op = e.op.slice(0, -1);
    const rt = this.rvType(rg);
    const rc = this.load(rg);
    let s = { pre: '', addr: '' };
    let cur: string;
    if (lg.k === 'js') cur = lg.name;
    else if (lg.k === 'mem') {
      s = this.stable(lg.addr);
      cur = `${ldName(lt)}(${s.addr})`;
    } else throw err('lvalue required as left operand of assignment', e.loc);
    let newv: string;
    let c: number;
    if (lt.k === 'ptr' && (op === '+' || op === '-')) {
      if (!isInt(rt)) throw err(`invalid operands to binary ${op}`, e.loc);
      newv = `((${cur}${op}(${conv(rc, rt, INT)})*${sizeOf(lt.to) || 1})>>>0)`;
      c = C_ALU * 2;
    } else if (op === '<<' || op === '>>') {
      const pt = promote(lt) as IntT;
      const a = conv(cur, lt, pt);
      const b = conv(rc, rt, INT);
      let code: string;
      if (pt.size === 8) code = `I64(${JSON.stringify(op)},${a},${b},${pt.signed})`;
      else if (op === '<<') code = pt.signed ? `(${a}<<${b})` : `((${a}<<${b})>>>0)`;
      else code = pt.signed ? `(${a}>>${b})` : `(${a}>>>${b})`;
      newv = conv(code, pt, lt);
      c = C_ALU;
    } else {
      if (!isArith(lt) || !isArith(rt)) throw err(`invalid operands to binary ${op}`, e.loc);
      const ct = arithCommon(lt, rt);
      const r = this.arith(op, conv(cur, lt, ct), conv(rc, rt, ct), ct, e.loc);
      newv = conv(r.code, ct, lt);
      c = r.c;
    }
    const cost = lg.c + rg.c + c + C_STORE;
    if (lg.k === 'js') return { k: 'val', code: `(${lg.name}=${newv})`, t: lt, c: cost };
    return { k: 'val', code: `(${s.pre}${stName(lt)}(${s.addr},${newv}))`, t: lt, c: cost };
  }

  private genCall(e: Expr & { k: 'call' }): G {
    let fg: G;
    if (e.f.k === 'id' && !this.lookup(e.f.name)) {
      // implicit declaration
      if (!this.natives[e.f.name] && !this.funcs.has(e.f.name)) {
        this.warn(`implicit declaration of function '${e.f.name}'`, e.loc);
        this.usedExternals.set(e.f.name, e.loc);
      } else if (!this.natives[e.f.name] || this.funcs.has(e.f.name)) {
        this.warn(`implicit declaration of function '${e.f.name}'`, e.loc);
      }
      const known = this.funcs.get(e.f.name)?.t;
      fg = { k: 'fn', key: e.f.name, name: e.f.name, t: known ?? { k: 'func', ret: INT, params: [], variadic: false, oldStyle: true }, c: 0 };
    } else fg = this.genExpr(e.f);
    let ft: FuncT;
    let direct: { key: string; name: string } | null = null;
    if (fg.k === 'fn') {
      ft = fg.t;
      direct = { key: fg.key, name: fg.name };
    } else {
      const t = this.rvType(fg);
      if (t.k === 'ptr' && t.to.k === 'func') ft = t.to;
      else throw err('called object is not a function or function pointer', e.loc);
    }
    const params = ft.params;
    if (!ft.oldStyle) {
      if (e.args.length < params.length) throw err(`too few arguments to function '${direct?.name ?? 'function pointer'}'`, e.loc);
      if (e.args.length > params.length && !ft.variadic) throw err(`too many arguments to function '${direct?.name ?? 'function pointer'}'`, e.loc);
    }
    let cost = C_CALL + fg.c;
    const fixed: string[] = [];
    const varArgs: string[] = [];
    e.args.forEach((a, i) => {
      const g = this.genExpr(a);
      cost += g.c + 1;
      if (i < params.length && !ft.oldStyle) {
        fixed.push(this.assignConv(g, params[i], a.loc, `passing argument ${i + 1} of '${direct?.name ?? 'function'}'`));
      } else {
        const t = this.rvType(g);
        let pt: CType = t;
        if (t.k === 'float') pt = DOUBLE;
        else if (t.k === 'int') pt = promote(t);
        if (t.k === 'struct') {
          // struct by value: pass address (callee copies)
          (ft.variadic ? varArgs : fixed).push(this.load(g));
        } else (ft.variadic && !ft.oldStyle ? varArgs : fixed).push(conv(this.load(g), t, pt));
      }
    });
    const args = [...fixed];
    if (ft.variadic && !ft.oldStyle) args.push(`[${varArgs.join(',')}]`);
    const ret = unqual(ft.ret);
    let code: string;
    if (direct) {
      const f = this.funcs.get(direct.key);
      if (f && f.def) code = `(yield*${f.jsName}(${args.join(',')}))`;
      else if (this.natives[direct.name]) {
        const n = this.natives[direct.name];
        cost += n.cost;
        code = n.gen ? `(yield*N.${direct.name}(${args.join(',')}))` : `N.${direct.name}(${args.join(',')})`;
      } else {
        this.usedExternals.set(direct.name, e.loc);
        code = `(yield*callExt(${JSON.stringify(direct.name)},[${args.join(',')}]))`;
      }
    } else {
      code = `(yield*callPtr(${this.load(fg)},[${args.join(',')}]))`;
    }
    if (ret.k === 'void') return { k: 'val', code, t: VOID, c: cost };
    if (ret.k === 'struct') return { k: 'mem', addr: code, t: ret, c: cost };
    return { k: 'val', code, t: ret, c: cost };
  }

  // ================= link =================
  link(): Program {
    const errors: CError[] = [];
    for (const [name, loc] of this.usedExternals) {
      const f = this.funcs.get(name);
      if ((f && f.def) || this.natives[name]) continue;
      const known = KNOWN_UNSUPPORTED.find((p) => name.startsWith(p));
      const msg = known ? `${name} is not supported by the simulator` : `undefined reference to \`${name}'`;
      errors.push(new CError(msg, loc.file, loc.line, loc.col));
    }
    if (!this.funcs.get('main')?.def) errors.push(new CError("undefined reference to `main'", 'startup_stm32f401retx.s', 1, 1));
    if (errors.length) throw errors[0];
    if (this.dataTop > RAM_BASE + RAM_SIZE - STACK_SIZE) throw new CError(`region \`RAM' overflowed by ${this.dataTop - (RAM_BASE + RAM_SIZE - STACK_SIZE)} bytes`, 'linker', 0, 0);

    const fnTable: string[] = [];
    for (const f of this.funcList) if (f.def) fnTable.push(`${f.id}:${f.jsName}`);
    const userNames: string[] = [];
    for (const f of this.funcList) if (f.def && !f.isStatic) userNames.push(`${JSON.stringify(f.name)}:${f.jsName}`);
    const initTemps = this.initTemps ? `let ${Array.from({ length: this.initTemps }, (_, i) => `$t${i}`).join(',')};` : '';
    const js =
      `"use strict";const {ld8,ld8s,ld16,ld16s,ld32,ld32s,ld64,ld64s,ldf,ldd,st8,st16,st32,st64,stf,std,memcpy,memset,copyBytes,` +
      `sdiv,udiv,smod,umod,f2s,f2u,fr,W64,T64,I64,P,stackOverflow,callPtr,callExt,fnAddr}=R;const B=R.B;\n` +
      this.out.join('\n') +
      `\nfunction* __init(){const fp=S.sp;${initTemps}${this.initCode.join('')}}` +
      `\nreturn {init:__init,fns:{${fnTable.join(',')}},user:{${userNames.join(',')}}};`;
    const funcs: FuncInfo[] = this.funcList
      .filter((f) => f.def)
      .map((f) => ({
        name: f.name,
        id: f.id,
        file: f.def!.loc.file,
        line: f.def!.loc.line,
        endLine: f.def!.body.endLoc.line,
        jsName: f.jsName,
        isStatic: f.isStatic,
      }));
    const globals: GlobalInfo[] = [...this.globals.values()]
      .filter((g) => g.defined)
      .map((g) => ({ name: g.name, addr: g.addr, type: g.t, file: g.file, isStatic: g.isStatic }));
    return {
      js,
      stmts: this.stmts,
      scopes: this.scopes,
      globals,
      funcs,
      nativeIds: this.nativeIds,
      rodata: Uint8Array.from(this.rodata),
      dataEnd: this.dataTop,
      sizes: { text: Math.round(this.textBytes + this.rodata.length + 4200), data: this.dataBytes + 12, bss: this.bssBytes + 1572 },
      warnings: this.warnings,
    };
  }
}

function wrapParen(s: string) {
  return /^[\w$.]+$/.test(s) ? s : `(${s})`;
}

const KNOWN_UNSUPPORTED = ['HAL_', 'LL_', '__HAL_', 'osKernel', 'osThread', 'xTask', 'vTask', 'sprintf', 'snprintf', 'sscanf', 'malloc', 'free', 'atof', 'strtod'];

void ULLONG;
void FLOAT;
