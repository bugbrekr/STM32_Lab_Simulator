import type { CType } from './types';

export interface Loc {
  file: string;
  line: number;
  col: number;
}

export type Expr =
  | { k: 'num'; v: number; t: CType; loc: Loc }
  | { k: 'str'; bytes: number[]; loc: Loc }
  | { k: 'id'; name: string; loc: Loc }
  | { k: 'bin'; op: string; l: Expr; r: Expr; loc: Loc }
  | { k: 'assign'; op: string; l: Expr; r: Expr; loc: Loc }
  | { k: 'un'; op: string; e: Expr; loc: Loc }
  | { k: 'incdec'; op: '++' | '--'; prefix: boolean; e: Expr; loc: Loc }
  | { k: 'call'; f: Expr; args: Expr[]; loc: Loc }
  | { k: 'index'; a: Expr; i: Expr; loc: Loc }
  | { k: 'member'; e: Expr; name: string; arrow: boolean; loc: Loc }
  | { k: 'cast'; t: CType; e: Expr; loc: Loc }
  | { k: 'sizeof_t'; t: CType; loc: Loc }
  | { k: 'sizeof_e'; e: Expr; loc: Loc }
  | { k: 'cond'; c: Expr; a: Expr; b: Expr; loc: Loc }
  | { k: 'comma'; l: Expr; r: Expr; loc: Loc }
  | { k: 'compound'; t: CType; init: Init; loc: Loc };

export type Designator = { field: string } | { index: Expr };

export type Init =
  | { k: 'expr'; e: Expr; loc: Loc }
  | { k: 'list'; items: { desig: Designator[]; init: Init }[]; loc: Loc };

export interface VarDecl {
  name: string;
  type: CType;
  storage: 'static' | 'extern' | 'typedef' | null;
  init: Init | null;
  loc: Loc;
}

export type Stmt =
  | { k: 'expr'; e: Expr; loc: Loc }
  | { k: 'decl'; decls: VarDecl[]; loc: Loc }
  | { k: 'block'; items: Stmt[]; loc: Loc; endLoc: Loc }
  | { k: 'if'; c: Expr; then: Stmt; else: Stmt | null; loc: Loc }
  | { k: 'while'; c: Expr; body: Stmt; loc: Loc }
  | { k: 'dowhile'; body: Stmt; c: Expr; loc: Loc }
  | { k: 'for'; init: Stmt | null; c: Expr | null; step: Expr | null; body: Stmt; loc: Loc }
  | { k: 'return'; e: Expr | null; loc: Loc }
  | { k: 'break'; loc: Loc }
  | { k: 'continue'; loc: Loc }
  | { k: 'switch'; e: Expr; body: Stmt; loc: Loc }
  | { k: 'case'; e: Expr; body: Stmt; loc: Loc }
  | { k: 'default'; body: Stmt; loc: Loc }
  | { k: 'goto'; label: string; loc: Loc }
  | { k: 'label'; name: string; body: Stmt; loc: Loc }
  | { k: 'asm'; loc: Loc }
  | { k: 'empty'; loc: Loc };

export interface FuncDef {
  name: string;
  type: import('./types').FuncT;
  paramNames: string[];
  body: Stmt & { k: 'block' };
  storage: 'static' | 'extern' | null;
  weak: boolean;
  loc: Loc;
}

export type TopLevel = { k: 'var'; decl: VarDecl } | { k: 'func'; def: FuncDef };

export interface TranslationUnit {
  file: string;
  items: TopLevel[];
}
