import { CError } from './lexer';
import { Preprocessor } from './preprocessor';
import { Parser, structTags } from './parser';
import { Codegen, Diag, Program } from './codegen';
import { SYSTEM_HEADERS, SYSTEM_C } from '../headers';
import { NATIVE_META } from '../hal/meta';
import type { TranslationUnit } from './ast';
import type { CType } from './types';

export interface CompileResult {
  ok: boolean;
  program?: Program & { layouts: Record<string, Record<string, { off: number; size: number }>> };
  diags: Diag[];
  /** per-file list of included headers, for the build log */
  compiled: string[];
}

function dirname(p: string) {
  const i = p.lastIndexOf('/');
  return i < 0 ? '' : p.slice(0, i);
}
function join(a: string, b: string) {
  const parts = (a ? a + '/' + b : b).split('/');
  const out: string[] = [];
  for (const s of parts) {
    if (s === '..') out.pop();
    else if (s !== '.' && s !== '') out.push(s);
  }
  return out.join('/');
}

function toDiag(e: unknown): Diag {
  if (e instanceof CError) return { file: e.file, line: e.line, col: e.col, severity: e.severity, message: e.message };
  const m = e instanceof Error ? e.message : String(e);
  return { file: '', line: 0, col: 0, severity: 'error', message: 'internal compiler error: ' + m };
}

/**
 * Compile a project.
 * @param files all project files (path -> content)
 * @param sources which files to compile (.c)
 */
export function compileProject(files: Record<string, string>, sources: string[], includeDirs = ['Core/Inc']): CompileResult {
  structTags.clear();
  const diags: Diag[] = [];
  const readFile = (path: string, from: string, angled: boolean): [string, string] | undefined => {
    if (!angled) {
      const rel = join(dirname(from), path);
      if (files[rel] !== undefined) return [rel, files[rel]];
    }
    for (const d of includeDirs) {
      const p = join(d, path);
      if (files[p] !== undefined) return [p, files[p]];
    }
    const base = path.split('/').pop()!;
    if (SYSTEM_HEADERS[path] !== undefined) return [`<sys>/${path}`, SYSTEM_HEADERS[path]];
    if (SYSTEM_HEADERS[base] !== undefined) return [`<sys>/${base}`, SYSTEM_HEADERS[base]];
    return undefined;
  };
  const tus: TranslationUnit[] = [];
  const allSources: [string, string][] = sources.map((s) => [s, files[s]]);
  allSources.push(['<sys>/system_sim.c', SYSTEM_C]);
  for (const [path, content] of allSources) {
    if (content === undefined) {
      diags.push({ file: path, line: 0, col: 0, severity: 'error', message: `${path}: No such file` });
      continue;
    }
    try {
      const pp = new Preprocessor({
        readFile,
        defines: { USE_HAL_DRIVER: '1', STM32F401xE: '1', DEBUG: '1' },
        onWarning: (w) => diags.push(toDiag(w)),
      });
      const toks = pp.run(path, content);
      const parser = new Parser(toks, path);
      const tu = parser.parseTU();
      for (const w of parser.warnings) diags.push(toDiag(w));
      tus.push(tu);
    } catch (e) {
      diags.push(toDiag(e));
    }
  }
  if (diags.some((d) => d.severity === 'error')) return { ok: false, diags, compiled: sources };
  const cg = new Codegen(NATIVE_META);
  try {
    tus.forEach((tu, i) => cg.declareTU(tu, i));
    cg.allocateGlobals();
  } catch (e) {
    diags.push(toDiag(e));
    return { ok: false, diags, compiled: sources };
  }
  for (let i = 0; i < tus.length; i++) {
    try {
      cg.genTU(tus[i], i);
    } catch (e) {
      diags.push(toDiag(e));
    }
  }
  if (diags.some((d) => d.severity === 'error')) return { ok: false, diags, compiled: sources };
  let program: Program;
  try {
    program = cg.link();
  } catch (e) {
    const d = toDiag(e);
    diags.push(d);
    return { ok: false, diags, compiled: sources };
  }
  diags.push(...program.warnings);
  // sanity check generated JS
  try {
    new Function('R', 'N', 'S', program.js);
  } catch (e) {
    diags.push({ file: '', line: 0, col: 0, severity: 'error', message: 'internal compiler error (codegen): ' + (e as Error).message });
    return { ok: false, diags, compiled: sources };
  }
  const layouts: Record<string, Record<string, { off: number; size: number }>> = {};
  for (const [tag, def] of structTags) {
    if (!tag.startsWith('__')) continue;
    const flat: Record<string, { off: number; size: number }> = {};
    const walk = (fields: typeof def.fields, prefix: string, base: number) => {
      for (const f of fields) {
        const t: CType = f.type;
        if (t.k === 'struct') walk(t.def.fields, prefix + f.name + '.', base + f.offset);
        else flat[prefix + f.name] = { off: base + f.offset, size: t.k === 'int' ? t.size : t.k === 'array' ? 0 : 4 };
      }
    };
    walk(def.fields, '', 0);
    layouts[tag.slice(2)] = flat;
  }
  return { ok: true, program: { ...program, layouts }, diags: dedupe(diags), compiled: sources };
}

function dedupe(d: Diag[]): Diag[] {
  const seen = new Set<string>();
  return d.filter((x) => {
    const k = `${x.file}:${x.line}:${x.col}:${x.message}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
