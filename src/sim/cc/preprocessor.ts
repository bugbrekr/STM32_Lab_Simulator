import { CError, Token, lex, decodeLiteral } from './lexer';

interface Macro {
  name: string;
  fn: boolean;
  params: string[];
  variadic: boolean;
  body: Token[];
}

export interface PPOptions {
  /** Resolve an include. Returns [resolvedPath, content] or undefined. */
  readFile: (path: string, fromFile: string, angled: boolean) => [string, string] | undefined;
  defines?: Record<string, string>;
  onWarning?: (e: CError) => void;
}

interface Cond {
  active: boolean; // currently emitting
  taken: boolean; // some branch already taken
  parentActive: boolean;
  sawElse: boolean;
}

function cloneTok(t: Token, over: Partial<Token>): Token {
  return { ...t, ...over };
}

export class Preprocessor {
  macros = new Map<string, Macro>();
  private once = new Set<string>();
  private depth = 0;
  includedFiles: string[] = [];

  constructor(private opts: PPOptions) {
    const predefined: Record<string, string> = {
      __STDC__: '1',
      __STDC_VERSION__: '201112L',
      __GNUC__: '13',
      __ARM_ARCH: '7',
      __arm__: '1',
      __thumb__: '1',
      __ARM_FP: '4',
      __SIM__: '1',
      ...opts.defines,
    };
    for (const [k, v] of Object.entries(predefined)) this.defineFromText(k, v);
  }

  defineFromText(name: string, value: string) {
    const body = lex(value, '<command-line>').filter((t) => t.k !== 'eof');
    this.macros.set(name, { name, fn: false, params: [], variadic: false, body });
  }

  run(file: string, src: string): Token[] {
    const out: Token[] = [];
    this.processFile(file, src, out);
    return out;
  }

  private processFile(file: string, src: string, out: Token[]) {
    if (this.depth > 40) throw new CError('#include nested too deeply', file, 1, 1);
    this.depth++;
    this.includedFiles.push(file);
    const toks = lex(src, file);
    const conds: Cond[] = [];
    let pending: Token[] = [];
    const active = () => conds.length === 0 || conds[conds.length - 1].active;
    const flush = () => {
      if (pending.length) {
        for (const t of this.expand(pending)) out.push(t);
        pending = [];
      }
    };
    let i = 0;
    while (i < toks.length) {
      const t = toks[i];
      if (t.k === 'eof') break;
      if (t.bol && t.k === 'punct' && t.v === '#') {
        // gather directive line
        const line: Token[] = [];
        i++;
        while (i < toks.length && !toks[i].bol && toks[i].k !== 'eof') line.push(toks[i++]);
        const name = line[0]?.v ?? '';
        const rest = line.slice(1);
        // conditional directives are processed even when inactive
        if (name === 'if' || name === 'ifdef' || name === 'ifndef') {
          const parentActive = active();
          let val = false;
          if (parentActive) {
            if (name === 'if') val = this.evalCond(rest, t);
            else {
              if (!rest[0] || rest[0].k !== 'id') throw new CError(`no macro name given in #${name} directive`, t.file, t.line, t.col);
              const def = this.macros.has(rest[0].v);
              val = name === 'ifdef' ? def : !def;
            }
          }
          conds.push({ active: parentActive && val, taken: val, parentActive, sawElse: false });
          continue;
        }
        if (name === 'elif') {
          const c = conds[conds.length - 1];
          if (!c) throw new CError('#elif without #if', t.file, t.line, t.col);
          if (c.sawElse) throw new CError('#elif after #else', t.file, t.line, t.col);
          if (c.parentActive && !c.taken) {
            const v = this.evalCond(rest, t);
            c.active = v;
            c.taken = v;
          } else c.active = false;
          continue;
        }
        if (name === 'else') {
          const c = conds[conds.length - 1];
          if (!c) throw new CError('#else without #if', t.file, t.line, t.col);
          c.sawElse = true;
          c.active = c.parentActive && !c.taken;
          c.taken = true;
          continue;
        }
        if (name === 'endif') {
          if (!conds.length) throw new CError('#endif without #if', t.file, t.line, t.col);
          conds.pop();
          continue;
        }
        if (!active()) continue;
        flush();
        this.directive(name, rest, t, out, file);
        continue;
      }
      if (active()) pending.push(t);
      i++;
    }
    if (conds.length) throw new CError('unterminated #if', file, toks[toks.length - 1].line, 1);
    flush();
    this.depth--;
  }

  private directive(name: string, rest: Token[], hashTok: Token, out: Token[], file: string) {
    switch (name) {
      case '':
        return;
      case 'define': {
        const nm = rest[0];
        if (!nm || nm.k !== 'id') throw new CError('macro names must be identifiers', hashTok.file, hashTok.line, hashTok.col);
        let body: Token[];
        let fn = false;
        const params: string[] = [];
        let variadic = false;
        if (rest[1] && rest[1].v === '(' && !rest[1].ws) {
          fn = true;
          let j = 2;
          while (j < rest.length && rest[j].v !== ')') {
            const p = rest[j];
            if (p.v === '...') {
              variadic = true;
              params.push('__VA_ARGS__');
            } else if (p.k === 'id') params.push(p.v);
            else if (p.v !== ',') throw new CError(`expected parameter name, found "${p.v}"`, p.file, p.line, p.col);
            j++;
          }
          body = rest.slice(j + 1);
        } else body = rest.slice(1);
        this.macros.set(nm.v, { name: nm.v, fn, params, variadic, body });
        return;
      }
      case 'undef':
        if (rest[0]) this.macros.delete(rest[0].v);
        return;
      case 'include': {
        let angled = false;
        let path: string;
        let toks = rest;
        if (toks[0] && toks[0].k !== 'str' && toks[0].v !== '<') toks = this.expand(toks);
        if (toks[0]?.k === 'str') path = toks[0].v.slice(1, -1);
        else if (toks[0]?.v === '<') {
          angled = true;
          path = '';
          for (let j = 1; j < toks.length && toks[j].v !== '>'; j++) path += (toks[j].ws && path ? ' ' : '') + toks[j].v;
        } else throw new CError('#include expects "FILENAME" or <FILENAME>', hashTok.file, hashTok.line, hashTok.col);
        const r = this.opts.readFile(path, file, angled);
        if (!r) throw new CError(`${path}: No such file or directory`, hashTok.file, hashTok.line, hashTok.col);
        if (this.once.has(r[0])) return;
        this.processFile(r[0], r[1], out);
        return;
      }
      case 'pragma':
        if (rest[0]?.v === 'once') this.once.add(file);
        return;
      case 'error': {
        const msg = rest.map((t) => (t.ws ? ' ' : '') + t.v).join('').trim();
        throw new CError(`#error ${msg}`, hashTok.file, hashTok.line, hashTok.col);
      }
      case 'warning': {
        const msg = rest.map((t) => (t.ws ? ' ' : '') + t.v).join('').trim();
        this.opts.onWarning?.(new CError(`#warning ${msg}`, hashTok.file, hashTok.line, hashTok.col, 'warning'));
        return;
      }
      case 'line':
        return;
      default:
        throw new CError(`invalid preprocessing directive #${name}`, hashTok.file, hashTok.line, hashTok.col);
    }
  }

  private evalCond(rest: Token[], at: Token): boolean {
    // replace defined X / defined(X)
    const toks: Token[] = [];
    for (let j = 0; j < rest.length; j++) {
      const t = rest[j];
      if (t.k === 'id' && t.v === 'defined') {
        let nm: Token | undefined;
        if (rest[j + 1]?.v === '(') {
          nm = rest[j + 2];
          j += 3;
        } else {
          nm = rest[j + 1];
          j += 1;
        }
        toks.push(cloneTok(t, { k: 'num', v: nm && this.macros.has(nm.v) ? '1' : '0' }));
      } else toks.push(t);
    }
    const ex = this.expand(toks).map((t) => (t.k === 'id' ? cloneTok(t, { k: 'num', v: t.v === 'true' ? '1' : '0' }) : t));
    let p = 0;
    const err = (m: string) => new CError(m, at.file, at.line, at.col);
    const peek = () => ex[p]?.v;
    const num = (t: Token): number => {
      if (t.k === 'char') return decodeLiteral(t.v)[0] ?? 0;
      const s = t.v.replace(/[uUlL]+$/, '');
      if (/^0[xX]/.test(s)) return parseInt(s, 16);
      if (/^0[bB]/.test(s)) return parseInt(s.slice(2), 2);
      if (/^0[0-7]+$/.test(s)) return parseInt(s, 8);
      const v = Number(s);
      if (Number.isNaN(v)) throw err(`invalid number "${t.v}" in #if`);
      return v;
    };
    const primary = (): number => {
      const t = ex[p++];
      if (!t) throw err('#if with no expression');
      if (t.v === '(') {
        const v = cond();
        if (ex[p++]?.v !== ')') throw err("missing ')' in expression");
        return v;
      }
      if (t.v === '!') return primary() ? 0 : 1;
      if (t.v === '~') return ~primary();
      if (t.v === '-') return -primary();
      if (t.v === '+') return +primary();
      if (t.k === 'num' || t.k === 'char') return num(t);
      throw err(`token "${t.v}" is not valid in preprocessor expressions`);
    };
    const levels: string[][] = [['*', '/', '%'], ['+', '-'], ['<<', '>>'], ['<', '>', '<=', '>='], ['==', '!='], ['&'], ['^'], ['|'], ['&&'], ['||']];
    const bin = (lvl: number): number => {
      if (lvl < 0) return primary();
      let l = bin(lvl - 1);
      while (p < ex.length && levels[lvl].includes(peek())) {
        const op = ex[p++].v;
        if (op === '&&') {
          const r = bin(lvl - 1);
          l = l && r ? 1 : 0;
          continue;
        }
        if (op === '||') {
          const r = bin(lvl - 1);
          l = l || r ? 1 : 0;
          continue;
        }
        const r = bin(lvl - 1);
        switch (op) {
          case '*': l = l * r; break;
          case '/': if (r === 0) throw err('division by zero in #if'); l = Math.trunc(l / r); break;
          case '%': if (r === 0) throw err('division by zero in #if'); l = l % r; break;
          case '+': l = l + r; break;
          case '-': l = l - r; break;
          case '<<': l = l * 2 ** r; break;
          case '>>': l = Math.floor(l / 2 ** r); break;
          case '<': l = +(l < r); break;
          case '>': l = +(l > r); break;
          case '<=': l = +(l <= r); break;
          case '>=': l = +(l >= r); break;
          case '==': l = +(l === r); break;
          case '!=': l = +(l !== r); break;
          case '&': l = Number(BigInt.asIntN(64, BigInt(Math.trunc(l)) & BigInt(Math.trunc(r)))); break;
          case '^': l = Number(BigInt.asIntN(64, BigInt(Math.trunc(l)) ^ BigInt(Math.trunc(r)))); break;
          case '|': l = Number(BigInt.asIntN(64, BigInt(Math.trunc(l)) | BigInt(Math.trunc(r)))); break;
        }
      }
      return l;
    };
    const cond = (): number => {
      const c = bin(levels.length - 1);
      if (peek() === '?') {
        p++;
        const a = cond();
        if (ex[p++]?.v !== ':') throw err("expected ':' in #if");
        const b = cond();
        return c ? a : b;
      }
      return c;
    };
    const v = cond();
    if (p < ex.length) throw err(`missing binary operator before token "${ex[p].v}"`);
    return v !== 0;
  }

  /** Fully macro-expand a token list. */
  expand(input: Token[]): Token[] {
    const out: Token[] = [];
    // stack holds tokens in reverse order (pop from end = next token)
    const stack: Token[] = input.slice().reverse();
    while (stack.length) {
      const t = stack.pop()!;
      if (t.k !== 'id') {
        out.push(t);
        continue;
      }
      if (t.v === '__LINE__') {
        out.push(cloneTok(t, { k: 'num', v: String(t.line) }));
        continue;
      }
      if (t.v === '__FILE__') {
        out.push(cloneTok(t, { k: 'str', v: JSON.stringify(t.file) }));
        continue;
      }
      const m = this.macros.get(t.v);
      if (!m || t.hide?.has(t.v)) {
        out.push(t);
        continue;
      }
      if (!m.fn) {
        const hs = new Set(t.hide ?? []);
        hs.add(m.name);
        const body = m.body.map((b, idx) => cloneTok(b, { file: t.file, line: t.line, col: t.col, hide: new Set([...hs, ...(b.hide ?? [])]), ws: idx === 0 ? t.ws : b.ws, bol: false }));
        const pasted = this.paste(body, t);
        for (let j = pasted.length - 1; j >= 0; j--) stack.push(pasted[j]);
        continue;
      }
      // function-like: need '('
      if (stack.length === 0 || stack[stack.length - 1].v !== '(') {
        out.push(t);
        continue;
      }
      stack.pop(); // (
      const args: Token[][] = [[]];
      let depth = 0;
      let closed = false;
      while (stack.length) {
        const a = stack.pop()!;
        if (a.v === '(' && a.k === 'punct') depth++;
        else if (a.v === ')' && a.k === 'punct') {
          if (depth === 0) {
            closed = true;
            break;
          }
          depth--;
        } else if (a.v === ',' && a.k === 'punct' && depth === 0) {
          if (!(m.variadic && args.length === m.params.length)) {
            args.push([]);
            continue;
          }
        }
        args[args.length - 1].push(a);
      }
      if (!closed) throw new CError(`unterminated argument list invoking macro "${m.name}"`, t.file, t.line, t.col);
      if (m.params.length === 0 && args.length === 1 && args[0].length === 0) args.length = 0;
      if (m.variadic && args.length === m.params.length - 1) args.push([]);
      if (args.length !== m.params.length) {
        throw new CError(`macro "${m.name}" requires ${m.params.length} arguments, but ${args.length} given`, t.file, t.line, t.col);
      }
      const hs = new Set(t.hide ?? []);
      hs.add(m.name);
      const body = this.subst(m, args, hs, t);
      for (let j = body.length - 1; j >= 0; j--) stack.push(body[j]);
    }
    return out;
  }

  private subst(m: Macro, args: Token[][], hs: Set<string>, at: Token): Token[] {
    const res: Token[] = [];
    const pIndex = (v: string) => m.params.indexOf(v);
    const expandedCache = new Map<number, Token[]>();
    const body = m.body;
    for (let j = 0; j < body.length; j++) {
      const b = body[j];
      if (b.v === '#' && b.k === 'punct' && body[j + 1] && pIndex(body[j + 1].v) >= 0) {
        const arg = args[pIndex(body[j + 1].v)];
        const s = arg.map((x, idx) => (idx > 0 && x.ws ? ' ' : '') + x.v).join('');
        res.push(cloneTok(b, { k: 'str', v: JSON.stringify(s), ws: b.ws }));
        j++;
        continue;
      }
      const pi = b.k === 'id' ? pIndex(b.v) : -1;
      if (pi >= 0) {
        const nextIsPaste = body[j + 1]?.v === '##';
        const prevIsPaste = body[j - 1]?.v === '##';
        let toks: Token[];
        if (nextIsPaste || prevIsPaste) toks = args[pi];
        else {
          if (!expandedCache.has(pi)) expandedCache.set(pi, this.expand(args[pi]));
          toks = expandedCache.get(pi)!;
        }
        if (toks.length === 0 && (nextIsPaste || prevIsPaste)) {
          res.push(cloneTok(b, { k: 'punct', v: '', ws: b.ws })); // placemarker
        } else toks.forEach((x, idx) => res.push(cloneTok(x, { ws: idx === 0 ? b.ws : x.ws })));
        continue;
      }
      res.push(b);
    }
    const located = res.map((x) => cloneTok(x, { file: at.file, line: at.line, col: at.col, bol: false, hide: new Set([...hs, ...(x.hide ?? [])]) }));
    if (located.length) located[0] = cloneTok(located[0], { ws: at.ws });
    return this.paste(located, at).filter((x) => !(x.k === 'punct' && x.v === ''));
  }

  private paste(toks: Token[], at: Token): Token[] {
    if (!toks.some((t) => t.v === '##' && t.k === 'punct')) return toks;
    const out: Token[] = [];
    for (let j = 0; j < toks.length; j++) {
      const t = toks[j];
      if (t.v === '##' && t.k === 'punct' && out.length && j + 1 < toks.length) {
        const l = out.pop()!;
        const r = toks[++j];
        const text = l.v + r.v;
        if (text === '') {
          out.push(cloneTok(l, { v: '' }));
          continue;
        }
        const lexed = lex(text, at.file).filter((x) => x.k !== 'eof');
        if (lexed.length !== 1) throw new CError(`pasting "${l.v}" and "${r.v}" does not give a valid preprocessing token`, at.file, at.line, at.col);
        out.push(cloneTok(l, { k: lexed[0].k, v: lexed[0].v }));
        continue;
      }
      out.push(t);
    }
    return out;
  }
}
