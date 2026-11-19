// C lexer producing preprocessing tokens.

export type TokKind = 'id' | 'num' | 'char' | 'str' | 'punct' | 'eof';

export interface Token {
  k: TokKind;
  v: string;
  file: string;
  line: number;
  col: number;
  /** preceded by whitespace */
  ws: boolean;
  /** first token on a line */
  bol: boolean;
  /** macro names this token must not be expanded by (hide set) */
  hide?: Set<string>;
}

export class CError extends Error {
  constructor(
    msg: string,
    public file: string,
    public line: number,
    public col: number,
    public severity: 'error' | 'warning' = 'error',
  ) {
    super(msg);
  }
}

const PUNCTS = [
  '%:%:', '...', '<<=', '>>=',
  '->', '++', '--', '<<', '>>', '<=', '>=', '==', '!=', '&&', '||', '*=', '/=', '%=', '+=', '-=', '&=', '^=', '|=', '##',
  '[', ']', '(', ')', '{', '}', '.', '&', '*', '+', '-', '~', '!', '/', '%', '<', '>', '^', '|', '?', ':', ';', '=', ',', '#',
];

function isIdStart(c: string) {
  return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_' || c === '$';
}
function isIdChar(c: string) {
  return isIdStart(c) || (c >= '0' && c <= '9');
}
function isDigit(c: string) {
  return c >= '0' && c <= '9';
}

export function lex(src: string, file: string): Token[] {
  // Splice backslash-newlines but keep line counting correct by tracking positions.
  const out: Token[] = [];
  let i = 0;
  let line = 1;
  let col = 1;
  let ws = false;
  let bol = true;
  const n = src.length;

  const adv = (k = 1) => {
    for (let j = 0; j < k; j++) {
      if (src[i] === '\n') {
        line++;
        col = 1;
      } else col++;
      i++;
    }
  };
  // skip backslash-newline sequences
  const skipSplices = () => {
    while (src[i] === '\\' && (src[i + 1] === '\n' || (src[i + 1] === '\r' && src[i + 2] === '\n'))) {
      adv(src[i + 1] === '\r' ? 3 : 2);
    }
  };

  while (i < n) {
    skipSplices();
    if (i >= n) break;
    const c = src[i];
    if (c === '\n') {
      adv();
      bol = true;
      ws = false;
      continue;
    }
    if (c === ' ' || c === '\t' || c === '\r' || c === '\f' || c === '\v') {
      adv();
      ws = true;
      continue;
    }
    if (c === '/' && src[i + 1] === '/') {
      while (i < n && src[i] !== '\n') {
        if (src[i] === '\\' && src[i + 1] === '\n') adv(2);
        else adv();
      }
      ws = true;
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const sl = line, sc = col;
      adv(2);
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) adv();
      if (i >= n) throw new CError('unterminated comment', file, sl, sc);
      adv(2);
      ws = true;
      continue;
    }
    const tl = line, tc = col;
    const push = (k: TokKind, v: string) => {
      out.push({ k, v, file, line: tl, col: tc, ws, bol });
      ws = false;
      bol = false;
    };
    if (isIdStart(c)) {
      let s = '';
      while (i < n) {
        skipSplices();
        if (i < n && isIdChar(src[i])) {
          s += src[i];
          adv();
        } else break;
      }
      // wide/utf8 string/char prefixes
      if ((s === 'L' || s === 'u8' || s === 'u' || s === 'U') && (src[i] === '"' || src[i] === "'")) {
        // fallthrough into string lexing with prefix dropped
        const q = src[i];
        const v = lexQuoted(q);
        push(q === '"' ? 'str' : 'char', v);
        continue;
      }
      push('id', s);
      continue;
    }
    if (isDigit(c) || (c === '.' && isDigit(src[i + 1] ?? ''))) {
      // pp-number
      let s = '';
      while (i < n) {
        const ch = src[i];
        if (isIdChar(ch) || ch === '.') {
          s += ch;
          adv();
          if ((ch === 'e' || ch === 'E' || ch === 'p' || ch === 'P') && (src[i] === '+' || src[i] === '-')) {
            if (!/^0[xX]/.test(s) || ch === 'p' || ch === 'P') {
              s += src[i];
              adv();
            }
          }
        } else break;
      }
      push('num', s);
      continue;
    }
    if (c === '"' || c === "'") {
      const v = lexQuoted(c);
      push(c === '"' ? 'str' : 'char', v);
      continue;
    }
    let matched = '';
    for (const p of PUNCTS) {
      if (src.startsWith(p, i)) {
        matched = p;
        break;
      }
    }
    if (!matched) {
      throw new CError(`stray '${c}' in program`, file, tl, tc);
    }
    adv(matched.length);
    push('punct', matched === '%:%:' ? '##' : matched);
  }
  out.push({ k: 'eof', v: '', file, line, col, ws: false, bol: true });
  return out;

  function lexQuoted(q: string): string {
    const sl = line, sc = col;
    let s = q;
    adv();
    while (i < n && src[i] !== q) {
      if (src[i] === '\n') throw new CError(`missing terminating ${q} character`, file, sl, sc);
      if (src[i] === '\\') {
        if (src[i + 1] === '\n') {
          adv(2);
          continue;
        }
        s += src[i];
        adv();
      }
      s += src[i];
      adv();
    }
    if (i >= n) throw new CError(`missing terminating ${q} character`, file, sl, sc);
    s += q;
    adv();
    return s;
  }
}

/** Decode the body of a C string/char literal (including quotes) into code units. */
export function decodeLiteral(lit: string): number[] {
  const body = lit.slice(1, -1);
  const out: number[] = [];
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c !== '\\') {
      const code = body.charCodeAt(i);
      if (code < 0x80) out.push(code);
      else {
        // UTF-8 encode
        const bytes = new TextEncoder().encode(c);
        for (const b of bytes) out.push(b);
      }
      continue;
    }
    i++;
    const e = body[i];
    switch (e) {
      case 'n': out.push(10); break;
      case 't': out.push(9); break;
      case 'r': out.push(13); break;
      case '0': case '1': case '2': case '3': case '4': case '5': case '6': case '7': {
        let s = e;
        while (s.length < 3 && /[0-7]/.test(body[i + 1] ?? '')) s += body[++i];
        out.push(parseInt(s, 8) & 0xff);
        break;
      }
      case 'x': {
        let s = '';
        while (/[0-9a-fA-F]/.test(body[i + 1] ?? '')) s += body[++i];
        out.push(parseInt(s || '0', 16) & 0xff);
        break;
      }
      case 'a': out.push(7); break;
      case 'b': out.push(8); break;
      case 'f': out.push(12); break;
      case 'v': out.push(11); break;
      case 'e': out.push(27); break;
      default: out.push(e.charCodeAt(0));
    }
  }
  return out;
}
