// Find the lines a student typed (vs. CubeMX-generated code) and tag them with snippets.
import { classifyLine, Snippet, SNIPPET_BY_ID } from './snippets';
import { EXAMPLES } from '../examples';
import { generatedFiles } from '../cubemx/codegen';

export interface UserLine {
  line: number; // 1-based
  text: string;
  snippet: Snippet | null;
}

export interface Occurrence {
  snippet: Snippet;
  /** 1-based inclusive line range */
  start: number;
  end: number;
  lines: number[];
  code: string;
}

export interface FileAnalysis {
  userLines: UserLine[];
  occurrences: Occurrence[];
  /** line -> occurrence index */
  lineOcc: Map<number, number>;
}

const norm = (l: string) => l.trim().replace(/\s+/g, ' ');

/** Line numbers (1-based) of `current` that are not part of `pristine`, using an LCS on non-blank lines. */
export function userLineNumbers(current: string, pristine: string): number[] {
  const a = current.split('\n');
  const b = pristine.split('\n');
  const ai: number[] = [];
  const av: string[] = [];
  a.forEach((l, i) => {
    if (l.trim()) {
      ai.push(i);
      av.push(norm(l));
    }
  });
  const bv = b.map(norm).filter((l) => l);
  const n = av.length;
  const m = bv.length;
  // LCS table (Uint16 is enough for lab-size files)
  const dp = new Uint16Array((n + 1) * (m + 1));
  const W = m + 1;
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * W + j] = av[i] === bv[j] ? dp[(i + 1) * W + j + 1] + 1 : Math.max(dp[(i + 1) * W + j], dp[i * W + j + 1]);
    }
  }
  const out: number[] = [];
  let i = 0;
  let j = 0;
  while (i < n) {
    if (j < m && av[i] === bv[j]) {
      i++;
      j++;
    } else if (j < m && dp[(i + 1) * W + j] < dp[i * W + j + 1]) j++;
    else {
      out.push(ai[i] + 1);
      i++;
    }
  }
  return out;
}

export function analyzeFile(current: string, pristine: string | undefined): FileAnalysis {
  const lines = current.split('\n');
  const nums = pristine === undefined ? [] : userLineNumbers(current, pristine);
  const userLines: UserLine[] = nums.map((n) => ({ line: n, text: lines[n - 1], snippet: classifyLine(lines[n - 1].trim(), current) }));
  // group consecutive lines with the same snippet (unclassified lines like braces/comments join the previous group)
  const occurrences: Occurrence[] = [];
  const lineOcc = new Map<number, number>();
  let cur: Occurrence | null = null;
  let prevLine = -10;
  for (const u of userLines) {
    const adjacent = u.line - prevLine <= 2;
    if (!u.snippet) {
      if (cur && adjacent && /^[{}]|^\/\/|^\}\s*else/.test(u.text.trim())) {
        cur.end = u.line;
        cur.lines.push(u.line);
        lineOcc.set(u.line, occurrences.length - 1);
      }
      prevLine = u.line;
      continue;
    }
    if (cur && adjacent && cur.snippet.id === u.snippet.id) {
      cur.end = u.line;
      cur.lines.push(u.line);
    } else {
      cur = { snippet: u.snippet, start: u.line, end: u.line, lines: [u.line], code: '' };
      occurrences.push(cur);
    }
    lineOcc.set(u.line, occurrences.length - 1);
    prevLine = u.line;
  }
  for (const o of occurrences) {
    // trim trailing braces from the displayed code
    o.code = o.lines.map((n) => lines[n - 1]).join('\n');
    o.code = dedent(o.code);
  }
  return { userLines, occurrences, lineOcc };
}

function dedent(s: string): string {
  const ls = s.split('\n');
  const ind = Math.min(...ls.filter((l) => l.trim()).map((l) => /^[\t ]*/.exec(l)![0].replace(/\t/g, '  ').length));
  return ls.map((l) => l.replace(/\t/g, '  ').slice(Number.isFinite(ind) ? ind : 0)).join('\n');
}

// ---------------- cross-experiment index ----------------
export interface ExampleUse {
  exampleId: string;
  title: string;
  occurrences: { start: number; end: number; code: string }[];
}

let index: Map<string, ExampleUse[]> | null = null;
let exAnalyses: Map<string, FileAnalysis> | null = null;

export function exampleAnalysis(exampleId: string): FileAnalysis | null {
  buildIndex();
  return exAnalyses!.get(exampleId) ?? null;
}

function buildIndex() {
  if (index) return;
  index = new Map();
  exAnalyses = new Map();
  for (const ex of EXAMPLES) {
    const a = analyzeFile(ex.mainC, generatedFiles(ex.config)['Core/Src/main.c']);
    exAnalyses.set(ex.id, a);
    for (const o of a.occurrences) {
      let list = index.get(o.snippet.id);
      if (!list) index.set(o.snippet.id, (list = []));
      let use = list.find((u) => u.exampleId === ex.id);
      if (!use) list.push((use = { exampleId: ex.id, title: ex.title, occurrences: [] }));
      use.occurrences.push({ start: o.start, end: o.end, code: o.code });
    }
  }
}

/** Experiments using the snippet (excluding `exceptExampleId`). */
export function usesOf(snippetId: string, exceptExampleId?: string): ExampleUse[] {
  buildIndex();
  return (index!.get(snippetId) ?? []).filter((u) => u.exampleId !== exceptExampleId);
}

export function shortTitle(title: string) {
  return title.split('—')[0].trim();
}

export { SNIPPET_BY_ID };
