// C type model with ARM EABI sizes/alignment.

export type CType =
  | VoidT
  | IntT
  | FloatT
  | PtrT
  | ArrayT
  | StructT
  | FuncT;

export interface Quals {
  volatile?: boolean;
  const?: boolean;
}

export interface VoidT extends Quals { k: 'void' }
export interface IntT extends Quals {
  k: 'int';
  size: 1 | 2 | 4 | 8;
  signed: boolean;
  name: string;
  /** _Bool */
  bool?: boolean;
  /** enum type */
  enumTag?: string;
}
export interface FloatT extends Quals { k: 'float'; size: 4 | 8; name: string }
export interface PtrT extends Quals { k: 'ptr'; to: CType }
export interface ArrayT extends Quals { k: 'array'; of: CType; len: number | null }
export interface Field { name: string; type: CType; offset: number }
export interface StructDef {
  tag: string;
  union: boolean;
  fields: Field[];
  size: number;
  align: number;
  complete: boolean;
}
export interface StructT extends Quals { k: 'struct'; def: StructDef }
export interface FuncT extends Quals { k: 'func'; ret: CType; params: CType[]; variadic: boolean; oldStyle?: boolean }

export const VOID: VoidT = { k: 'void' };
export const BOOL: IntT = { k: 'int', size: 1, signed: false, name: '_Bool', bool: true };
export const CHAR: IntT = { k: 'int', size: 1, signed: false, name: 'char' }; // ARM: char is unsigned
export const SCHAR: IntT = { k: 'int', size: 1, signed: true, name: 'signed char' };
export const UCHAR: IntT = { k: 'int', size: 1, signed: false, name: 'unsigned char' };
export const SHORT: IntT = { k: 'int', size: 2, signed: true, name: 'short' };
export const USHORT: IntT = { k: 'int', size: 2, signed: false, name: 'unsigned short' };
export const INT: IntT = { k: 'int', size: 4, signed: true, name: 'int' };
export const UINT: IntT = { k: 'int', size: 4, signed: false, name: 'unsigned int' };
export const LONG: IntT = { k: 'int', size: 4, signed: true, name: 'long' };
export const ULONG: IntT = { k: 'int', size: 4, signed: false, name: 'unsigned long' };
export const LLONG: IntT = { k: 'int', size: 8, signed: true, name: 'long long' };
export const ULLONG: IntT = { k: 'int', size: 8, signed: false, name: 'unsigned long long' };
export const FLOAT: FloatT = { k: 'float', size: 4, name: 'float' };
export const DOUBLE: FloatT = { k: 'float', size: 8, name: 'double' };

export function ptr(to: CType): PtrT {
  return { k: 'ptr', to };
}

export function sizeOf(t: CType): number {
  switch (t.k) {
    case 'void': return 1;
    case 'int': return t.size;
    case 'float': return t.size;
    case 'ptr': return 4;
    case 'array': return t.len === null ? 0 : t.len * sizeOf(t.of);
    case 'struct': return t.def.size;
    case 'func': return 1;
  }
}

export function alignOf(t: CType): number {
  switch (t.k) {
    case 'void': return 1;
    case 'int': return t.size;
    case 'float': return t.size;
    case 'ptr': return 4;
    case 'array': return alignOf(t.of);
    case 'struct': return t.def.align;
    case 'func': return 4;
  }
}

export function layoutStruct(def: StructDef, members: { name: string; type: CType }[]) {
  let off = 0;
  let align = 1;
  let size = 0;
  def.fields = [];
  for (const m of members) {
    const a = alignOf(m.type);
    align = Math.max(align, a);
    if (def.union) {
      def.fields.push({ name: m.name, type: m.type, offset: 0 });
      size = Math.max(size, sizeOf(m.type));
    } else {
      off = Math.ceil(off / a) * a;
      def.fields.push({ name: m.name, type: m.type, offset: off });
      off += sizeOf(m.type);
      size = off;
    }
  }
  def.size = Math.ceil(size / align) * align;
  def.align = align;
  def.complete = true;
}

export function isInt(t: CType): t is IntT { return t.k === 'int'; }
export function isFloat(t: CType): t is FloatT { return t.k === 'float'; }
export function isArith(t: CType) { return t.k === 'int' || t.k === 'float'; }
export function isScalar(t: CType) { return t.k === 'int' || t.k === 'float' || t.k === 'ptr'; }
export function isPtrLike(t: CType) { return t.k === 'ptr' || t.k === 'array' || t.k === 'func'; }

export function unqual<T extends CType>(t: T): T {
  if (!t.volatile && !t.const) return t;
  const c = { ...t };
  delete c.volatile;
  delete c.const;
  return c;
}

export function withQuals<T extends CType>(t: T, q: Quals): T {
  if (!q.volatile && !q.const) return t;
  return { ...t, volatile: t.volatile || q.volatile, const: t.const || q.const };
}

export function typeName(t: CType): string {
  const q = (t.const ? 'const ' : '') + (t.volatile ? 'volatile ' : '');
  switch (t.k) {
    case 'void': return q + 'void';
    case 'int': return q + (t.enumTag ? `enum ${t.enumTag}` : t.name);
    case 'float': return q + t.name;
    case 'ptr':
      if (t.to.k === 'func') return `${typeName(t.to.ret)} (*)(${t.to.params.map(typeName).join(', ')})`;
      return `${typeName(t.to)} *` + (t.const ? ' const' : '');
    case 'array': return `${typeName(t.of)}[${t.len ?? ''}]`;
    case 'struct': return q + `${t.def.union ? 'union' : 'struct'} ${t.def.tag}`;
    case 'func': return `${typeName(t.ret)} (${t.params.map(typeName).join(', ')})`;
  }
}

/** Integer promotion */
export function promote(t: CType): CType {
  if (t.k === 'int' && t.size < 4) return INT;
  return t;
}

/** Usual arithmetic conversions */
export function arithCommon(a: CType, b: CType): CType {
  if (a.k === 'float' || b.k === 'float') {
    const sa = a.k === 'float' ? a.size : 0;
    const sb = b.k === 'float' ? b.size : 0;
    return Math.max(sa, sb) === 8 ? DOUBLE : FLOAT;
  }
  const pa = promote(a) as IntT;
  const pb = promote(b) as IntT;
  if (pa.size === 8 || pb.size === 8) {
    const uns = (pa.size === 8 && !pa.signed) || (pb.size === 8 && !pb.signed);
    return uns ? ULLONG : LLONG;
  }
  if (!pa.signed || !pb.signed) return UINT;
  return INT;
}

export function sameType(a: CType, b: CType): boolean {
  if (a.k !== b.k) return false;
  switch (a.k) {
    case 'void': return true;
    case 'int': { const bb = b as IntT; return a.size === bb.size && a.signed === bb.signed && !!a.bool === !!bb.bool; }
    case 'float': return a.size === (b as FloatT).size;
    case 'ptr': return sameType(a.to, (b as PtrT).to) || a.to.k === 'void' || (b as PtrT).to.k === 'void';
    case 'array': return sameType(a.of, (b as ArrayT).of);
    case 'struct': return a.def === (b as StructT).def;
    case 'func': {
      const bf = b as FuncT;
      if (a.oldStyle || bf.oldStyle) return sameType(a.ret, bf.ret);
      return sameType(a.ret, bf.ret) && a.params.length === bf.params.length && a.params.every((p, i) => sameType(p, bf.params[i]));
    }
  }
}
