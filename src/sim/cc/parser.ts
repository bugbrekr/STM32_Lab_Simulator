import { CError, Token, decodeLiteral } from './lexer';
import type { Expr, FuncDef, Init, Loc, Stmt, TopLevel, TranslationUnit, VarDecl, Designator } from './ast';
import {
  BOOL, CHAR, CType, DOUBLE, FLOAT, FuncT, INT, LLONG, LONG, SCHAR, SHORT, StructDef, UCHAR, UINT, ULLONG, ULONG, USHORT, VOID,
  layoutStruct, ptr, sizeOf, withQuals, IntT, alignOf,
} from './types';

type ScopeEntry =
  | { kind: 'typedef'; type: CType }
  | { kind: 'enum'; value: number }
  | { kind: 'var'; type: CType };

interface DeclSpec {
  type: CType;
  storage: 'static' | 'extern' | 'typedef' | null;
  inline: boolean;
  weak: boolean;
}

interface Declarator {
  name: string | null;
  loc: Loc;
  apply: (base: CType) => CType;
  /** parameter names of the outermost function declarator (for definitions) */
  paramNames?: string[];
}

const TYPE_KW = new Set([
  'void', 'char', 'short', 'int', 'long', 'float', 'double', 'signed', 'unsigned', '_Bool', 'struct', 'union', 'enum',
  'const', 'volatile', 'restrict', '__restrict', 'static', 'extern', 'typedef', 'auto', 'register', 'inline', '__inline',
  '__inline__', '__attribute__', '__extension__', '_Noreturn', '__volatile__', '__const',
]);

export const structTags = new Map<string, StructDef>();

export class Parser {
  private p = 0;
  private scopes: Map<string, ScopeEntry>[] = [new Map()];
  private tags: Map<string, StructDef>[] = [new Map()];
  private anon = 0;
  warnings: CError[] = [];

  constructor(private toks: Token[], private file: string) {
    if (!toks.length || toks[toks.length - 1].k !== 'eof') {
      const last = toks[toks.length - 1];
      this.toks = [...toks, { k: 'eof', v: '', file, line: last?.line ?? 1, col: last?.col ?? 1, ws: false, bol: true }];
    }
  }

  // ---------- token helpers ----------
  private get t(): Token {
    return this.toks[this.p];
  }
  private peek(n = 1): Token {
    return this.toks[Math.min(this.p + n, this.toks.length - 1)];
  }
  private loc(t: Token = this.t): Loc {
    return { file: t.file, line: t.line, col: t.col };
  }
  private err(msg: string, t: Token = this.t): CError {
    return new CError(msg, t.file, t.line, t.col);
  }
  private is(v: string): boolean {
    const t = this.t;
    return (t.k === 'punct' || t.k === 'id') && t.v === v;
  }
  private accept(v: string): boolean {
    if (this.is(v)) {
      this.p++;
      return true;
    }
    return false;
  }
  private expect(v: string, what?: string): Token {
    if (!this.is(v)) {
      const t = this.t;
      throw this.err(`expected '${v}'${what ? ' ' + what : ''} before ${t.k === 'eof' ? 'end of input' : `'${t.v}'`}`);
    }
    return this.toks[this.p++];
  }
  private ident(): Token {
    if (this.t.k !== 'id') throw this.err(`expected identifier before '${this.t.v}'`);
    return this.toks[this.p++];
  }

  // ---------- scopes ----------
  private pushScope() {
    this.scopes.push(new Map());
    this.tags.push(new Map());
  }
  private popScope() {
    this.scopes.pop();
    this.tags.pop();
  }
  private lookup(name: string): ScopeEntry | undefined {
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      const e = this.scopes[i].get(name);
      if (e) return e;
    }
    return undefined;
  }
  private define(name: string, e: ScopeEntry) {
    this.scopes[this.scopes.length - 1].set(name, e);
  }
  private lookupTag(tag: string): StructDef | undefined {
    for (let i = this.tags.length - 1; i >= 0; i--) {
      const e = this.tags[i].get(tag);
      if (e) return e;
    }
    return undefined;
  }
  private isTypedefName(t: Token): boolean {
    if (t.k !== 'id') return false;
    const e = this.lookup(t.v);
    return !!e && e.kind === 'typedef';
  }
  private isTypeStart(t: Token = this.t): boolean {
    if (t.k !== 'id') return false;
    return TYPE_KW.has(t.v) || this.isTypedefName(t);
  }

  // ---------- top level ----------
  parseTU(): TranslationUnit {
    const items: TopLevel[] = [];
    while (this.t.k !== 'eof') {
      if (this.accept(';')) continue;
      this.externalDecl(items);
    }
    return { file: this.file, items };
  }

  private skipAttributes() {
    while (this.is('__attribute__') || this.is('__extension__') || this.is('__asm__') || this.is('__asm')) {
      if (this.accept('__extension__')) continue;
      this.p++;
      this.expect('(');
      let depth = 1;
      while (depth > 0 && this.t.k !== 'eof') {
        if (this.is('(')) depth++;
        else if (this.is(')')) depth--;
        this.p++;
      }
    }
  }

  private attrsHaveWeak(start: number, end: number) {
    for (let i = start; i < end; i++) if (this.toks[i].v === 'weak' || this.toks[i].v === '__weak__') return true;
    return false;
  }

  private externalDecl(items: TopLevel[]) {
    const startTok = this.t;
    const spec = this.declSpecs(true);
    if (this.accept(';')) return; // struct/enum declaration only
    let first = true;
    for (;;) {
      const d = this.declarator(false);
      const attrStart = this.p;
      this.skipAttributes();
      const weakAttr = spec.weak || this.attrsHaveWeak(attrStart, this.p);
      if (!d.name) throw this.err('expected identifier or \'(\'');
      const type = d.apply(spec.type);
      if (first && type.k === 'func' && this.is('{')) {
        // function definition
        const names = d.paramNames ?? [];
        this.define(d.name, { kind: 'var', type });
        this.pushScope();
        type.params.forEach((pt, i) => names[i] && this.define(names[i], { kind: 'var', type: pt }));
        const body = this.block(false);
        this.popScope();
        items.push({
          k: 'func',
          def: { name: d.name, type, paramNames: names, body, storage: spec.storage === 'typedef' ? null : spec.storage, weak: weakAttr, loc: d.loc },
        });
        return;
      }
      first = false;
      if (spec.storage === 'typedef') {
        this.define(d.name, { kind: 'typedef', type });
        items.push({ k: 'var', decl: { name: d.name, type, storage: 'typedef', init: null, loc: d.loc } });
      } else {
        this.define(d.name, { kind: 'var', type });
        let init: Init | null = null;
        if (this.accept('=')) init = this.initializer();
        let t2 = type;
        if (t2.k === 'array' && t2.len === null && init) t2 = { ...t2, len: this.inferLen(init, t2) };
        if (t2 !== type) this.define(d.name, { kind: 'var', type: t2 });
        items.push({ k: 'var', decl: { name: d.name, type: t2, storage: spec.storage, init, loc: d.loc } });
      }
      if (this.accept(',')) continue;
      if (!this.is(';')) throw this.err(`expected ';', ',' or '=' before '${this.t.v}'`);
      this.p++;
      void startTok;
      return;
    }
  }

  private inferLen(init: Init, t: CType & { k: 'array' }): number {
    if (init.k === 'expr' && init.e.k === 'str') return init.e.bytes.length + 1;
    if (init.k === 'list') {
      if (init.items.length === 1 && init.items[0].init.k === 'expr' && init.items[0].init.e.k === 'str' && t.of.k === 'int' && t.of.size === 1) {
        return init.items[0].init.e.bytes.length + 1;
      }
      let idx = 0;
      let max = 0;
      for (const it of init.items) {
        if (it.desig.length && 'index' in it.desig[0]) idx = this.constInt(it.desig[0].index);
        idx++;
        max = Math.max(max, idx);
      }
      return max;
    }
    return 1;
  }

  // ---------- declaration specifiers ----------
  private declSpecs(allowStorage: boolean): DeclSpec {
    let storage: DeclSpec['storage'] = null;
    let inline = false;
    let weak = false;
    let isConst = false;
    let isVolatile = false;
    let base: CType | null = null;
    let signed: boolean | null = null;
    let longs = 0;
    let short = false;
    let intKw = false;
    let charKw = false;
    let sawAny = false;
    const startTok = this.t;
    for (;;) {
      const t = this.t;
      if (t.k !== 'id') break;
      const v = t.v;
      if (v === 'const' || v === '__const') { isConst = true; this.p++; sawAny = true; continue; }
      if (v === 'volatile' || v === '__volatile__') { isVolatile = true; this.p++; sawAny = true; continue; }
      if (v === 'restrict' || v === '__restrict' || v === 'auto' || v === 'register' || v === '_Noreturn' || v === '__extension__') { this.p++; sawAny = true; continue; }
      if (v === 'inline' || v === '__inline' || v === '__inline__') { inline = true; this.p++; sawAny = true; continue; }
      if (v === '__attribute__') {
        const s = this.p;
        this.skipAttributes();
        if (this.attrsHaveWeak(s, this.p)) weak = true;
        sawAny = true;
        continue;
      }
      if (v === 'static' || v === 'extern' || v === 'typedef') {
        if (!allowStorage && v !== 'static') throw this.err(`storage class specified for parameter`);
        if (storage && storage !== v) throw this.err('multiple storage classes in declaration specifiers');
        storage = v;
        this.p++;
        sawAny = true;
        continue;
      }
      if (v === 'signed' || v === '__signed__') { signed = true; this.p++; sawAny = true; continue; }
      if (v === 'unsigned') { signed = false; this.p++; sawAny = true; continue; }
      if (v === 'long') { longs++; this.p++; sawAny = true; continue; }
      if (v === 'short') { short = true; this.p++; sawAny = true; continue; }
      if (v === 'int') { intKw = true; this.p++; sawAny = true; continue; }
      if (v === 'char') { charKw = true; this.p++; sawAny = true; continue; }
      if (base) break;
      if (v === 'void') { base = VOID; this.p++; sawAny = true; continue; }
      if (v === '_Bool') { base = BOOL; this.p++; sawAny = true; continue; }
      if (v === 'float') { base = FLOAT; this.p++; sawAny = true; continue; }
      if (v === 'double') { base = DOUBLE; this.p++; sawAny = true; continue; }
      if (v === 'struct' || v === 'union') { base = this.structSpec(); sawAny = true; continue; }
      if (v === 'enum') { base = this.enumSpec(); sawAny = true; continue; }
      if (signed === null && longs === 0 && !short && !intKw && !charKw && this.isTypedefName(t)) {
        const e = this.lookup(v) as { kind: 'typedef'; type: CType };
        base = e.type;
        this.p++;
        sawAny = true;
        continue;
      }
      break;
    }
    if (!sawAny) throw this.err(`unknown type name '${startTok.v}'`, startTok);
    let type: CType;
    if (base) {
      if (base.k === 'float' && longs) type = DOUBLE;
      else type = base;
    } else if (charKw) type = signed === null ? CHAR : signed ? SCHAR : UCHAR;
    else if (short) type = signed === false ? USHORT : SHORT;
    else if (longs >= 2) type = signed === false ? ULLONG : LLONG;
    else if (longs === 1) type = signed === false ? ULONG : LONG;
    else if (intKw || signed !== null) type = signed === false ? UINT : INT;
    else {
      // implicit int
      this.warnings.push(new CError(`type defaults to 'int' in declaration`, startTok.file, startTok.line, startTok.col, 'warning'));
      type = INT;
    }
    type = withQuals(type, { const: isConst, volatile: isVolatile });
    return { type, storage, inline, weak };
  }

  private structSpec(): CType {
    const kw = this.toks[this.p++];
    const union = kw.v === 'union';
    this.skipAttributes();
    let tag: string | null = null;
    if (this.t.k === 'id' && !this.is('{')) tag = this.ident().v;
    this.skipAttributes();
    if (this.is('{')) {
      let def: StructDef | undefined = tag ? this.tags[this.tags.length - 1].get(tag) : undefined;
      if (def && def.complete) throw this.err(`redefinition of '${kw.v} ${tag}'`);
      if (!def) {
        def = { tag: tag ?? `<anonymous ${++this.anon}>`, union, fields: [], size: 0, align: 1, complete: false };
        if (tag) this.tags[this.tags.length - 1].set(tag, def);
      }
      this.p++;
      const members: { name: string; type: CType }[] = [];
      while (!this.accept('}')) {
        if (this.accept(';')) continue;
        const spec = this.declSpecs(false);
        if (this.is(';')) {
          // anonymous struct/union member: flatten
          if (spec.type.k === 'struct' && spec.type.def.tag.startsWith('<anonymous')) {
            const inner = spec.type.def;
            // place as a member with a hidden name, then expose its fields by flattening
            members.push({ name: `__anon${++this.anon}`, type: spec.type });
            void inner;
          }
          this.p++;
          continue;
        }
        for (;;) {
          const d = this.declarator(false);
          if (this.is(':')) throw this.err('bit-fields are not supported by the simulator');
          this.skipAttributes();
          if (!d.name) throw this.err('expected member name');
          members.push({ name: d.name, type: d.apply(spec.type) });
          if (this.accept(',')) continue;
          this.expect(';', 'at end of member declaration');
          break;
        }
      }
      this.skipAttributes();
      layoutStruct(def, members);
      // flatten anonymous members for lookup
      const flat: typeof def.fields = [];
      for (const f of def.fields) {
        if (f.name.startsWith('__anon') && f.type.k === 'struct') {
          for (const g of f.type.def.fields) flat.push({ name: g.name, type: g.type, offset: f.offset + g.offset });
        } else flat.push(f);
      }
      def.fields = flat;
      structTags.set(def.tag, def);
      return { k: 'struct', def };
    }
    if (!tag) throw this.err(`expected '{' after ${kw.v}`);
    let def = this.lookupTag(tag);
    if (!def) {
      def = { tag, union, fields: [], size: 0, align: 1, complete: false };
      this.tags[this.tags.length - 1].set(tag, def);
    }
    return { k: 'struct', def };
  }

  private enumSpec(): CType {
    this.p++;
    let tag: string | null = null;
    if (this.t.k === 'id' && !this.is('{')) tag = this.ident().v;
    const t: IntT = { ...INT, enumTag: tag ?? undefined };
    if (this.accept('{')) {
      let val = 0;
      while (!this.accept('}')) {
        const nm = this.ident();
        if (this.accept('=')) val = this.constInt(this.assignExpr());
        this.define(nm.v, { kind: 'enum', value: val });
        val++;
        if (!this.accept(',')) {
          this.expect('}');
          break;
        }
      }
    }
    return t;
  }

  // ---------- declarators ----------
  private declarator(abstract: boolean): Declarator {
    const ptrQuals: { const: boolean; volatile: boolean }[] = [];
    this.skipAttributes();
    while (this.is('*')) {
      this.p++;
      const q = { const: false, volatile: false };
      for (;;) {
        if (this.accept('const') || this.accept('__const')) q.const = true;
        else if (this.accept('volatile')) q.volatile = true;
        else if (this.accept('restrict') || this.accept('__restrict')) { /* ignore */ }
        else if (this.is('__attribute__')) this.skipAttributes();
        else break;
      }
      ptrQuals.push(q);
    }
    let inner: Declarator | null = null;
    let name: string | null = null;
    const loc = this.loc();
    if (this.is('(')) {
      const nxt = this.peek();
      const isNested = nxt.v === '*' || nxt.v === '(' || nxt.v === '[' || (nxt.k === 'id' && !this.isTypeStart(nxt) && !abstract) || nxt.v === '__attribute__';
      if (isNested && !(abstract && nxt.v === ')')) {
        this.p++;
        inner = this.declarator(abstract);
        this.expect(')');
      }
    } else if (this.t.k === 'id' && !this.isTypeStart()) {
      name = this.ident().v;
    } else if (!abstract && this.t.k === 'id' && this.isTypedefName(this.t)) {
      // redeclaring a typedef name as a variable in an inner scope
      name = this.ident().v;
    }
    type Suffix = { k: 'arr'; len: number | null } | { k: 'fn'; params: CType[]; names: string[]; variadic: boolean; oldStyle: boolean };
    const suffixes: Suffix[] = [];
    let paramNames: string[] | undefined;
    for (;;) {
      if (this.accept('[')) {
        while (this.accept('static') || this.accept('const') || this.accept('volatile') || this.accept('restrict')) { /* ignore */ }
        let len: number | null = null;
        if (!this.is(']')) len = this.constInt(this.assignExpr());
        this.expect(']');
        suffixes.push({ k: 'arr', len });
        continue;
      }
      if (this.is('(')) {
        this.p++;
        const params: CType[] = [];
        const names: string[] = [];
        let variadic = false;
        let oldStyle = false;
        if (this.is(')')) oldStyle = true;
        else if (this.is('void') && this.peek().v === ')') this.p++;
        else {
          this.pushScope();
          for (;;) {
            if (this.accept('...')) {
              variadic = true;
              break;
            }
            if (!this.isTypeStart()) {
              // K&R identifier list or unknown type
              if (this.t.k === 'id' && (this.peek().v === ',' || this.peek().v === ')')) {
                const nm = this.ident();
                this.warnings.push(new CError(`type of '${nm.v}' defaults to 'int'`, nm.file, nm.line, nm.col, 'warning'));
                params.push(INT);
                names.push(nm.v);
              } else throw this.err(`unknown type name '${this.t.v}'`);
            } else {
              const spec = this.declSpecs(false);
              const d = this.declarator(true);
              let pt = d.apply(spec.type);
              if (pt.k === 'array') pt = ptr(pt.of);
              else if (pt.k === 'func') pt = ptr(pt);
              params.push(pt);
              names.push(d.name ?? '');
              if (d.name) this.define(d.name, { kind: 'var', type: pt });
            }
            if (!this.accept(',')) break;
          }
          this.popScope();
        }
        this.expect(')');
        if (!paramNames) paramNames = names;
        suffixes.push({ k: 'fn', params, names, variadic, oldStyle });
        continue;
      }
      break;
    }
    const outerParamNames = inner ? inner.paramNames ?? paramNames : paramNames;
    return {
      name: inner ? inner.name : name,
      loc: inner ? inner.loc : loc,
      paramNames: outerParamNames,
      apply: (base: CType) => {
        let t = base;
        for (const q of ptrQuals) t = withQuals(ptr(t), q);
        for (let i = suffixes.length - 1; i >= 0; i--) {
          const s = suffixes[i];
          if (s.k === 'arr') t = { k: 'array', of: t, len: s.len };
          else t = { k: 'func', ret: t, params: s.params, variadic: s.variadic, oldStyle: s.oldStyle } as FuncT;
        }
        return inner ? inner.apply(t) : t;
      },
    };
  }

  private typeName(): CType {
    const spec = this.declSpecs(false);
    const d = this.declarator(true);
    return d.apply(spec.type);
  }

  // ---------- initializers ----------
  private initializer(): Init {
    const loc = this.loc();
    if (this.accept('{')) {
      const items: { desig: Designator[]; init: Init }[] = [];
      while (!this.accept('}')) {
        const desig: Designator[] = [];
        while (this.is('.') || this.is('[')) {
          if (this.accept('.')) desig.push({ field: this.ident().v });
          else {
            this.p++;
            desig.push({ index: this.condExpr() });
            this.expect(']');
          }
        }
        if (desig.length) this.expect('=');
        items.push({ desig, init: this.initializer() });
        if (!this.accept(',')) {
          this.expect('}');
          break;
        }
      }
      return { k: 'list', items, loc };
    }
    return { k: 'expr', e: this.assignExpr(), loc };
  }

  // ---------- statements ----------
  private block(newScope = true): Stmt & { k: 'block' } {
    const loc = this.loc();
    this.expect('{');
    if (newScope) this.pushScope();
    const items: Stmt[] = [];
    while (!this.is('}')) {
      if (this.t.k === 'eof') throw this.err("expected '}' at end of input");
      items.push(this.blockItem());
    }
    const endLoc = this.loc();
    this.p++;
    if (newScope) this.popScope();
    return { k: 'block', items, loc, endLoc };
  }

  private blockItem(): Stmt {
    if (this.isTypeStart() && !(this.t.k === 'id' && this.peek().v === ':' && !TYPE_KW.has(this.t.v))) {
      return this.localDecl();
    }
    return this.statement();
  }

  private localDecl(): Stmt {
    const loc = this.loc();
    const spec = this.declSpecs(true);
    const decls: VarDecl[] = [];
    if (this.accept(';')) return { k: 'decl', decls, loc };
    for (;;) {
      const d = this.declarator(false);
      this.skipAttributes();
      if (!d.name) throw this.err('expected identifier');
      let type = d.apply(spec.type);
      if (spec.storage === 'typedef') {
        this.define(d.name, { kind: 'typedef', type });
      } else {
        let init: Init | null = null;
        this.define(d.name, { kind: 'var', type });
        if (this.accept('=')) init = this.initializer();
        if (type.k === 'array' && type.len === null && init) {
          type = { ...type, len: this.inferLen(init, type) };
          this.define(d.name, { kind: 'var', type });
        }
        decls.push({ name: d.name, type, storage: spec.storage, init, loc: d.loc });
      }
      if (this.accept(',')) continue;
      this.expect(';', 'after declaration');
      break;
    }
    return { k: 'decl', decls, loc };
  }

  private statement(): Stmt {
    const loc = this.loc();
    const t = this.t;
    if (t.k === 'punct' && t.v === '{') return this.block();
    if (t.k === 'punct' && t.v === ';') {
      this.p++;
      return { k: 'empty', loc };
    }
    if (t.k === 'id') {
      switch (t.v) {
        case 'if': {
          this.p++;
          this.expect('(');
          const c = this.expr();
          this.expect(')');
          const then = this.subStatement();
          let els: Stmt | null = null;
          if (this.accept('else')) els = this.subStatement();
          return { k: 'if', c, then, else: els, loc };
        }
        case 'while': {
          this.p++;
          this.expect('(');
          const c = this.expr();
          this.expect(')');
          return { k: 'while', c, body: this.subStatement(), loc };
        }
        case 'do': {
          this.p++;
          const body = this.subStatement();
          this.expect('while');
          this.expect('(');
          const c = this.expr();
          this.expect(')');
          this.expect(';');
          return { k: 'dowhile', body, c, loc };
        }
        case 'for': {
          this.p++;
          this.expect('(');
          this.pushScope();
          let init: Stmt | null = null;
          if (this.accept(';')) init = null;
          else if (this.isTypeStart()) init = this.localDecl();
          else {
            const e = this.expr();
            this.expect(';');
            init = { k: 'expr', e, loc };
          }
          const c = this.is(';') ? null : this.expr();
          this.expect(';');
          const step = this.is(')') ? null : this.expr();
          this.expect(')');
          const body = this.subStatement();
          this.popScope();
          return { k: 'for', init, c, step, body, loc };
        }
        case 'return': {
          this.p++;
          const e = this.is(';') ? null : this.expr();
          this.expect(';', 'after return');
          return { k: 'return', e, loc };
        }
        case 'break':
          this.p++;
          this.expect(';');
          return { k: 'break', loc };
        case 'continue':
          this.p++;
          this.expect(';');
          return { k: 'continue', loc };
        case 'switch': {
          this.p++;
          this.expect('(');
          const e = this.expr();
          this.expect(')');
          return { k: 'switch', e, body: this.subStatement(), loc };
        }
        case 'case': {
          this.p++;
          const e = this.condExpr();
          this.expect(':');
          return { k: 'case', e, body: this.is('}') ? { k: 'empty', loc } : this.statement(), loc };
        }
        case 'default':
          this.p++;
          this.expect(':');
          return { k: 'default', body: this.is('}') ? { k: 'empty', loc } : this.statement(), loc };
        case 'goto': {
          this.p++;
          const l = this.ident().v;
          this.expect(';');
          return { k: 'goto', label: l, loc };
        }
        case '__asm':
        case '__asm__':
        case 'asm': {
          this.p++;
          while (this.accept('volatile') || this.accept('__volatile__')) { /* */ }
          this.expect('(');
          let depth = 1;
          while (depth > 0 && this.t.k !== 'eof') {
            if (this.is('(')) depth++;
            else if (this.is(')')) depth--;
            this.p++;
          }
          this.expect(';');
          this.warnings.push(new CError('inline assembly is ignored by the simulator', t.file, t.line, t.col, 'warning'));
          return { k: 'asm', loc };
        }
      }
      if (this.peek().v === ':' && this.peek().k === 'punct' && !this.isTypedefName(t)) {
        this.p += 2;
        return { k: 'label', name: t.v, body: this.is('}') ? { k: 'empty', loc } : this.statement(), loc };
      }
    }
    const e = this.expr();
    this.expect(';', 'after expression');
    return { k: 'expr', e, loc };
  }

  private subStatement(): Stmt {
    // a statement in its own scope (for declarations in if/while bodies)
    if (this.isTypeStart()) {
      this.pushScope();
      const s = this.localDecl();
      this.popScope();
      return s;
    }
    return this.statement();
  }

  // ---------- expressions ----------
  expr(): Expr {
    let e = this.assignExpr();
    while (this.is(',')) {
      const loc = this.loc();
      this.p++;
      e = { k: 'comma', l: e, r: this.assignExpr(), loc };
    }
    return e;
  }

  private assignExpr(): Expr {
    const l = this.condExpr();
    const t = this.t;
    if (t.k === 'punct' && ['=', '+=', '-=', '*=', '/=', '%=', '<<=', '>>=', '&=', '^=', '|='].includes(t.v)) {
      this.p++;
      const r = this.assignExpr();
      return { k: 'assign', op: t.v, l, r, loc: this.loc(t) };
    }
    return l;
  }

  private condExpr(): Expr {
    const c = this.binExpr(0);
    if (this.is('?')) {
      const loc = this.loc();
      this.p++;
      const a = this.expr();
      this.expect(':');
      const b = this.condExpr();
      return { k: 'cond', c, a, b, loc };
    }
    return c;
  }

  private static LEVELS = [['||'], ['&&'], ['|'], ['^'], ['&'], ['==', '!='], ['<', '>', '<=', '>='], ['<<', '>>'], ['+', '-'], ['*', '/', '%']];

  private binExpr(level: number): Expr {
    if (level >= Parser.LEVELS.length) return this.castExpr();
    let l = this.binExpr(level + 1);
    for (;;) {
      const t = this.t;
      if (t.k === 'punct' && Parser.LEVELS[level].includes(t.v)) {
        this.p++;
        const r = this.binExpr(level + 1);
        l = { k: 'bin', op: t.v, l, r, loc: this.loc(t) };
      } else return l;
    }
  }

  private castExpr(): Expr {
    if (this.is('(') && this.isTypeStart(this.peek())) {
      const loc = this.loc();
      this.p++;
      const t = this.typeName();
      this.expect(')');
      if (this.is('{')) {
        const init = this.initializer();
        return this.postfix({ k: 'compound', t, init, loc });
      }
      return { k: 'cast', t, e: this.castExpr(), loc };
    }
    return this.unary();
  }

  private unary(): Expr {
    const t = this.t;
    const loc = this.loc();
    if (t.k === 'punct') {
      if (t.v === '++' || t.v === '--') {
        this.p++;
        return { k: 'incdec', op: t.v, prefix: true, e: this.unary(), loc };
      }
      if (['-', '+', '!', '~', '*', '&'].includes(t.v)) {
        this.p++;
        return { k: 'un', op: t.v, e: this.castExpr(), loc };
      }
    }
    if (t.k === 'id' && (t.v === 'sizeof' || t.v === '_Alignof' || t.v === '__alignof__')) {
      this.p++;
      const isAlign = t.v !== 'sizeof';
      if (this.is('(') && this.isTypeStart(this.peek())) {
        this.p++;
        const ty = this.typeName();
        this.expect(')');
        if (isAlign) return { k: 'num', v: alignOf(ty), t: UINT, loc };
        return { k: 'sizeof_t', t: ty, loc };
      }
      const e = this.unary();
      return { k: 'sizeof_e', e, loc };
    }
    return this.postfix(this.primary());
  }

  private postfix(e: Expr): Expr {
    for (;;) {
      const t = this.t;
      if (t.k !== 'punct') return e;
      const loc = this.loc();
      if (t.v === '[') {
        this.p++;
        const i = this.expr();
        this.expect(']');
        e = { k: 'index', a: e, i, loc };
      } else if (t.v === '(') {
        this.p++;
        const args: Expr[] = [];
        if (!this.is(')')) {
          for (;;) {
            args.push(this.assignExpr());
            if (!this.accept(',')) break;
          }
        }
        this.expect(')');
        e = { k: 'call', f: e, args, loc };
      } else if (t.v === '.' || t.v === '->') {
        this.p++;
        const name = this.ident().v;
        e = { k: 'member', e, name, arrow: t.v === '->', loc };
      } else if (t.v === '++' || t.v === '--') {
        this.p++;
        e = { k: 'incdec', op: t.v, prefix: false, e, loc };
      } else return e;
    }
  }

  private primary(): Expr {
    const t = this.t;
    const loc = this.loc();
    switch (t.k) {
      case 'num':
        this.p++;
        return parseNumber(t);
      case 'char': {
        this.p++;
        const b = decodeLiteral(t.v);
        return { k: 'num', v: b[0] ?? 0, t: INT, loc };
      }
      case 'str': {
        const bytes: number[] = [];
        while (this.t.k === 'str') {
          bytes.push(...decodeLiteral(this.t.v));
          this.p++;
        }
        return { k: 'str', bytes, loc };
      }
      case 'id': {
        if (this.isTypeStart(t)) throw this.err(`expected expression before '${t.v}'`);
        this.p++;
        const e = this.lookup(t.v);
        if (e && e.kind === 'enum') return { k: 'num', v: e.value, t: INT, loc };
        return { k: 'id', name: t.v, loc };
      }
      case 'punct':
        if (t.v === '(') {
          this.p++;
          const e = this.expr();
          this.expect(')');
          return e;
        }
        throw this.err(`expected expression before '${t.v}' token`);
      case 'eof':
        throw this.err('expected expression at end of input');
    }
  }

  // ---------- constant evaluation ----------
  constInt(e: Expr): number {
    const v = constEval(e, (name) => {
      const s = this.lookup(name);
      if (s?.kind === 'enum') return { value: s.value };
      if (s?.kind === 'var') return { type: s.type };
      return undefined;
    });
    if (v === null) {
      throw new CError('expression is not an integer constant', e.loc.file, e.loc.line, e.loc.col);
    }
    return Math.trunc(v);
  }
}

export function parseNumber(t: Token): Expr {
  const loc = { file: t.file, line: t.line, col: t.col };
  const s = t.v;
  const isHex = /^0[xX]/.test(s);
  if (!isHex && /[.eE]/.test(s) || (isHex && /[pP]/.test(s))) {
    const isF = /[fF]$/.test(s);
    const body = s.replace(/[fFlL]$/, '');
    const v = isHex ? parseHexFloat(body) : Number(body);
    if (Number.isNaN(v)) throw new CError(`invalid floating constant '${s}'`, t.file, t.line, t.col);
    return { k: 'num', v: isF ? Math.fround(v) : v, t: isF ? FLOAT : DOUBLE, loc };
  }
  const m = /^(0[xX][0-9a-fA-F]+|0[bB][01]+|[0-9]+)([uUlL]*)$/.exec(s);
  if (!m) throw new CError(`invalid suffix on integer constant '${s}'`, t.file, t.line, t.col);
  const digits = m[1];
  const suf = m[2].toLowerCase();
  let v: number;
  if (/^0[xX]/.test(digits)) v = parseInt(digits.slice(2), 16);
  else if (/^0[bB]/.test(digits)) v = parseInt(digits.slice(2), 2);
  else if (digits.length > 1 && digits[0] === '0') v = parseInt(digits, 8);
  else v = parseInt(digits, 10);
  const u = suf.includes('u');
  const ll = suf.includes('ll');
  const decimal = !/^0/.test(digits) || digits === '0';
  let type: CType;
  if (ll) type = u ? ULLONG : LLONG;
  else if (u) type = v <= 0xffffffff ? UINT : ULLONG;
  else if (v <= 0x7fffffff) type = INT;
  else if (!decimal && v <= 0xffffffff) type = UINT;
  else type = LLONG;
  return { k: 'num', v, t: type, loc };
}

function parseHexFloat(s: string): number {
  const m = /^0[xX]([0-9a-fA-F]*)\.?([0-9a-fA-F]*)[pP]([+-]?\d+)$/.exec(s);
  if (!m) return NaN;
  const int = parseInt(m[1] || '0', 16);
  const frac = m[2] ? parseInt(m[2], 16) / 16 ** m[2].length : 0;
  return (int + frac) * 2 ** parseInt(m[3], 10);
}

export type ConstLookup = (name: string) => { value?: number; type?: CType } | undefined;

/** Evaluate an integer/float constant expression; returns null if not constant. */
export function constEval(e: Expr, lookup: ConstLookup): number | null {
  const ev = (x: Expr): number | null => {
    switch (x.k) {
      case 'num': return x.v;
      case 'id': {
        const r = lookup(x.name);
        return r && r.value !== undefined ? r.value : null;
      }
      case 'sizeof_t': return sizeOf(x.t);
      case 'sizeof_e': {
        const t = staticType(x.e, lookup);
        return t ? sizeOf(t) : null;
      }
      case 'cast': {
        const v = ev(x.e);
        if (v === null) return null;
        if (x.t.k === 'int') return wrapInt(v, x.t);
        if (x.t.k === 'float') return x.t.size === 4 ? Math.fround(v) : v;
        if (x.t.k === 'ptr') return v >>> 0;
        return null;
      }
      case 'un': {
        const v = ev(x.e);
        if (v === null) return null;
        switch (x.op) {
          case '-': return -v;
          case '+': return v;
          case '!': return v ? 0 : 1;
          case '~': return ~v;
        }
        return null;
      }
      case 'cond': {
        const c = ev(x.c);
        if (c === null) return null;
        return c ? ev(x.a) : ev(x.b);
      }
      case 'bin': {
        const l = ev(x.l);
        const r = ev(x.r);
        if (l === null || r === null) return null;
        switch (x.op) {
          case '+': return l + r;
          case '-': return l - r;
          case '*': return l * r;
          case '/': return r === 0 ? null : Number.isInteger(l) && Number.isInteger(r) ? Math.trunc(l / r) : l / r;
          case '%': return r === 0 ? null : l % r;
          case '<<': return l * 2 ** r;
          case '>>': return Math.floor(l / 2 ** r);
          case '&': return Number(BigInt.asIntN(64, BigInt(Math.trunc(l)) & BigInt(Math.trunc(r))));
          case '|': return Number(BigInt.asIntN(64, BigInt(Math.trunc(l)) | BigInt(Math.trunc(r))));
          case '^': return Number(BigInt.asIntN(64, BigInt(Math.trunc(l)) ^ BigInt(Math.trunc(r))));
          case '<': return +(l < r);
          case '>': return +(l > r);
          case '<=': return +(l <= r);
          case '>=': return +(l >= r);
          case '==': return +(l === r);
          case '!=': return +(l !== r);
          case '&&': return +(!!l && !!r);
          case '||': return +(!!l || !!r);
        }
        return null;
      }
      default:
        return null;
    }
  };
  return ev(e);
}

function staticType(e: Expr, lookup: ConstLookup): CType | null {
  switch (e.k) {
    case 'id': return lookup(e.name)?.type ?? null;
    case 'index': {
      const t = staticType(e.a, lookup);
      if (t && (t.k === 'array')) return t.of;
      if (t && t.k === 'ptr') return t.to;
      return null;
    }
    case 'un':
      if (e.op === '*') {
        const t = staticType(e.e, lookup);
        if (t && t.k === 'ptr') return t.to;
        if (t && t.k === 'array') return t.of;
      }
      return null;
    case 'str': return { k: 'array', of: CHAR, len: e.bytes.length + 1 };
    case 'member': {
      let t = staticType(e.e, lookup);
      if (!t) return null;
      if (e.arrow && t.k === 'ptr') t = t.to;
      if (t.k !== 'struct') return null;
      return t.def.fields.find((f) => f.name === e.name)?.type ?? null;
    }
    case 'num': return e.t;
    default: return null;
  }
}

export function wrapInt(v: number, t: IntT): number {
  if (t.bool) return v ? 1 : 0;
  if (t.size === 8) return Math.trunc(v);
  const bits = t.size * 8;
  const m = 2 ** bits;
  let r = Math.trunc(v) % m;
  if (r < 0) r += m;
  if (t.signed && r >= m / 2) r -= m;
  return r;
}
