import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore, getProject, FileRef } from '../store/store';
import { analyzeFile, FileAnalysis, usesOf, shortTitle, exampleAnalysis, Occurrence } from './analyze';
import { CAT_INFO, Snippet, SNIPPET_BY_ID } from './snippets';
import { revealLine, openExample } from '../app/controller';
import { EXAMPLES } from '../examples';
import './guide.css';

// ---------------- analysis cache ----------------
const cache = new Map<string, { key: string; a: FileAnalysis }>();
export function analysisFor(ref: FileRef | null): FileAnalysis | null {
  if (!ref) return null;
  const p = getProject(ref.projectId);
  const cur = p?.files[ref.path];
  const pristine = p?.lastGen?.[ref.path];
  if (cur === undefined || pristine === undefined || !/\.(c|h)$/.test(ref.path)) return null;
  const k = `${ref.projectId}:${ref.path}`;
  const key = cur.length + ':' + cur;
  const hit = cache.get(k);
  if (hit && hit.key === key) return hit.a;
  const a = analyzeFile(cur, pristine);
  cache.set(k, { key, a });
  return a;
}

export function openGuideCard(snippetId: string, line: number) {
  useStore.getState().set((s) => ({ bottomTab: 'guide', guideFocus: { snippetId, line, n: (s.guideFocus?.n ?? 0) + 1 } }));
}

export function toggleCheat(id: string) {
  useStore.getState().set((s) => ({ cheatSheet: s.cheatSheet.includes(id) ? s.cheatSheet.filter((x) => x !== id) : [...s.cheatSheet, id] }));
}

function CatChip({ s }: { s: Snippet }) {
  const c = CAT_INFO[s.cat];
  return (
    <span className="cat-chip" style={{ background: c.color }}>
      {c.label}
    </span>
  );
}

function Code({ code, startLine }: { code: string; startLine?: number }) {
  return (
    <pre className="g-code">
      {code.split('\n').map((l, i) => (
        <div key={i}>
          {startLine !== undefined && <span className="g-ln">{startLine + i}</span>}
          {l || ' '}
        </div>
      ))}
    </pre>
  );
}

// ---------------- practice (flashcard) ----------------
const normCode = (s: string) =>
  s
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, '').replace(/\s+/g, ''))
    .filter((l) => l && l !== '{' && l !== '}');

function Practice({ snippet, target, onClose }: { snippet: Snippet; target: string; onClose: () => void }) {
  const [text, setText] = useState('');
  const [result, setResult] = useState<null | { ok: boolean; rows: { want: string; got: string; ok: boolean }[] }>(null);
  const [show, setShow] = useState(false);
  const [hint, setHint] = useState(false);
  const check = () => {
    const want = normCode(target);
    const got = normCode(text);
    const rows = want.map((w, i) => ({ want: w, got: got[i] ?? '', ok: got[i] === w }));
    setResult({ ok: rows.every((r) => r.ok) && got.length === want.length, rows });
  };
  const wantLines = target.split('\n').filter((l) => l.trim() && l.trim() !== '{' && l.trim() !== '}');
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="g-modal" onClick={(e) => e.stopPropagation()}>
        <div className="g-modal-title">
          ✍ Practice: {snippet.title} <CatChip s={snippet} />
        </div>
        <div className="g-modal-body">
          <p>{snippet.what.replace(/`/g, '')}</p>
          <p className="g-remember">
            🧠 {hint ? snippet.remember : <button className="g-link" onClick={() => setHint(true)}>Show memory hook</button>}
          </p>
          <p className="dim">
            Type the code from memory ({wantLines.length} line{wantLines.length > 1 ? 's' : ''}). Spaces, braces and // comments don’t matter.
          </p>
          <textarea className="g-input" value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} autoFocus rows={Math.max(4, wantLines.length + 2)} />
          {result && (
            <div className={`g-result ${result.ok ? 'ok' : 'bad'}`}>
              {result.ok ? '✔ Correct — well done!' : '✖ Not quite. Lines that differ:'}
              {!result.ok &&
                result.rows
                  .filter((r) => !r.ok)
                  .slice(0, 6)
                  .map((r, i) => (
                    <div key={i} className="g-diff">
                      <div>
                        expected: <code>{r.want}</code>
                      </div>
                      <div>
                        you typed: <code>{r.got || '(nothing)'}</code>
                      </div>
                    </div>
                  ))}
            </div>
          )}
          {show && <Code code={target} />}
        </div>
        <div className="g-modal-btns">
          <button className="primary" onClick={check}>
            Check
          </button>
          <button onClick={() => setShow(!show)}>{show ? 'Hide answer' : 'Show answer'}</button>
          <button
            onClick={() => {
              setText('');
              setResult(null);
              setShow(false);
            }}
          >
            Try again
          </button>
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ---------------- peek at another experiment ----------------
function Peek({ exampleId, snippetId, onClose }: { exampleId: string; snippetId: string; onClose: () => void }) {
  const ex = EXAMPLES.find((e) => e.id === exampleId)!;
  const a = exampleAnalysis(exampleId)!;
  const occ = a.occurrences.filter((o) => o.snippet.id === snippetId);
  const lines = ex.mainC.split('\n');
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="g-modal" onClick={(e) => e.stopPropagation()}>
        <div className="g-modal-title">
          {SNIPPET_BY_ID[snippetId].title} — in {ex.title}
        </div>
        <div className="g-modal-body">
          {occ.map((o, i) => {
            const from = Math.max(1, o.start - 2);
            const to = Math.min(lines.length, o.end + 2);
            return (
              <div key={i} className="g-peek">
                <div className="dim">
                  main.c lines {o.start}–{o.end}
                </div>
                <pre className="g-code">
                  {lines.slice(from - 1, to).map((l, j) => (
                    <div key={j} className={from + j >= o.start && from + j <= o.end ? 'hl' : ''}>
                      <span className="g-ln">{from + j}</span>
                      {l || ' '}
                    </div>
                  ))}
                </pre>
              </div>
            );
          })}
        </div>
        <div className="g-modal-btns">
          <button
            className="primary"
            onClick={() => {
              const p = openExample(ex, 'ide');
              onClose();
              setTimeout(() => revealLine({ projectId: p.id, path: 'Core/Src/main.c' }, occ[0]?.start ?? 1), 200);
            }}
          >
            Open {shortTitle(ex.title)} as a new project
          </button>
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ---------------- card ----------------
function Card({ snippet, occs, file, exampleId, focused }: { snippet: Snippet; occs: Occurrence[]; file: FileRef; exampleId?: string; focused: boolean }) {
  const cheat = useStore((s) => s.cheatSheet);
  const [practice, setPractice] = useState(false);
  const [peek, setPeek] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focused) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [focused]);
  const uses = usesOf(snippet.id, exampleId);
  const saved = cheat.includes(snippet.id);
  const target = occs.length === 1 || !snippet.template ? occs[0].code : snippet.template;
  return (
    <div ref={ref} className={`g-card ${focused ? 'focused' : ''}`} style={{ borderLeftColor: CAT_INFO[snippet.cat].color }}>
      <div className="g-card-head">
        <CatChip s={snippet} />
        <b>{snippet.title}</b>
        <span className="spacer" />
        {occs.map((o) => (
          <button key={o.start} className="g-linechip" onClick={() => revealLine(file, o.start)} title="Show in editor">
            L{o.start}
            {o.end > o.start ? `–${o.end}` : ''}
          </button>
        ))}
      </div>
      <Code code={occs[0].code} startLine={occs[0].start} />
      <div className="g-what">{renderTicks(snippet.what)}</div>
      <div className="g-remember">🧠 {renderTicks(snippet.remember)}</div>
      <div className="g-uses">
        {uses.length ? (
          <>
            <span className="dim">Also used in:</span>
            {uses.map((u) => (
              <button key={u.exampleId} className="g-exchip" onClick={() => setPeek(u.exampleId)} title={`Lines ${u.occurrences.map((o) => o.start).join(', ')}`}>
                {shortTitle(u.title)} <span className="dim">×{u.occurrences.length}</span>
              </button>
            ))}
          </>
        ) : (
          <span className="dim">{exampleId ? 'Only in this experiment.' : 'Not used in the lab experiments.'}</span>
        )}
        <span className="spacer" />
        <button className="g-btn" onClick={() => setPractice(true)}>
          ✍ Practice
        </button>
        <button className={`g-btn ${saved ? 'on' : ''}`} onClick={() => toggleCheat(snippet.id)}>
          {saved ? '★ Saved' : '☆ Save to cheat sheet'}
        </button>
      </div>
      {practice && <Practice snippet={snippet} target={target} onClose={() => setPractice(false)} />}
      {peek && <Peek exampleId={peek} snippetId={snippet.id} onClose={() => setPeek(null)} />}
    </div>
  );
}

function renderTicks(s: string) {
  return s.split(/(`[^`]+`)/).map((part, i) => (part.startsWith('`') ? <code key={i}>{part.slice(1, -1)}</code> : <span key={i}>{part}</span>));
}

// ---------------- cheat sheet ----------------
function CheatSheet() {
  const cheat = useStore((s) => s.cheatSheet);
  const [copied, setCopied] = useState(false);
  const items = cheat.map((id) => SNIPPET_BY_ID[id]).filter(Boolean);
  const codeFor = (s: Snippet) => {
    if (s.template) return s.template;
    for (const ex of EXAMPLES) {
      const o = exampleAnalysis(ex.id)?.occurrences.find((x) => x.snippet.id === s.id);
      if (o) return o.code;
    }
    return '';
  };
  if (!items.length) return <div className="empty-hint">Your cheat sheet is empty. Click “☆ Save to cheat sheet” on any card in the Lab Guide to collect snippets you want to remember.</div>;
  const md = items.map((s) => `### ${s.title}\n\`\`\`c\n${codeFor(s)}\n\`\`\`\n${s.remember}\n`).join('\n');
  return (
    <div className="g-cheat">
      <div className="g-cheat-bar">
        <b>My cheat sheet ({items.length})</b>
        <span className="spacer" />
        <button
          className="g-btn"
          onClick={() => {
            navigator.clipboard?.writeText(md);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? '✔ Copied' : '⧉ Copy as Markdown'}
        </button>
      </div>
      <div className="g-cheat-grid">
        {items.map((s) => (
          <div key={s.id} className="g-cheat-item" style={{ borderTopColor: CAT_INFO[s.cat].color }}>
            <div className="g-card-head">
              <CatChip s={s} />
              <b>{s.title}</b>
              <span className="spacer" />
              <button className="g-x" onClick={() => toggleCheat(s.id)} title="Remove">
                ✕
              </button>
            </div>
            <Code code={codeFor(s)} />
            <div className="g-remember">🧠 {renderTicks(s.remember)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------- panel ----------------
export function LabGuide() {
  const activeFile = useStore((s) => s.activeFile);
  const projects = useStore((s) => s.projects);
  const highlight = useStore((s) => s.guideHighlight);
  const focus = useStore((s) => s.guideFocus);
  const cheatCount = useStore((s) => s.cheatSheet.length);
  const set = useStore((s) => s.set);
  const [tab, setTab] = useState<'file' | 'cheat'>('file');
  useEffect(() => {
    if (focus) setTab('file');
  }, [focus]);
  const p = getProject(activeFile?.projectId);
  const a = useMemo(() => analysisFor(activeFile), [activeFile, projects]); // eslint-disable-line react-hooks/exhaustive-deps
  const groups = useMemo(() => {
    if (!a) return [];
    const map = new Map<string, Occurrence[]>();
    for (const o of a.occurrences) {
      if (!map.has(o.snippet.id)) map.set(o.snippet.id, []);
      map.get(o.snippet.id)!.push(o);
    }
    return [...map.entries()];
  }, [a]);
  const focusedId = focus ? (a?.occurrences[a.lineOcc.get(focus.line) ?? -1]?.snippet.id ?? focus.snippetId) : null;
  return (
    <div className="guide">
      <div className="console-title">
        <span className={`g-tab ${tab === 'file' ? 'on' : ''}`} onClick={() => setTab('file')}>
          💡 Your code in {activeFile ? activeFile.path.split('/').pop() : '—'}
        </span>
        <span className={`g-tab ${tab === 'cheat' ? 'on' : ''}`} onClick={() => setTab('cheat')}>
          ★ Cheat sheet ({cheatCount})
        </span>
        <span className="spacer" />
        <label className="g-toggle">
          <input type="checkbox" checked={highlight} onChange={(e) => set({ guideHighlight: e.target.checked })} /> Highlight my code in the editor
        </label>
        <span className="g-legend">
          {Object.values(CAT_INFO).map((c) => (
            <span key={c.label}>
              <i style={{ background: c.color }} />
              {c.label}
            </span>
          ))}
        </span>
      </div>
      <div className="guide-body">
        {tab === 'cheat' ? (
          <CheatSheet />
        ) : !activeFile || !a ? (
          <div className="empty-hint">Open a C file of a project (e.g. Core/Src/main.c) to see the code you have to write, explained.</div>
        ) : groups.length === 0 ? (
          <div className="empty-hint">No user code yet — this file is exactly what CubeMX generated. Write your code between the USER CODE BEGIN/END comments and it will be explained here.</div>
        ) : (
          <>
            <div className="g-summary">
              You typed <b>{a.userLines.filter((u) => u.text.trim() && !/^[{}]$/.test(u.text.trim())).length}</b> lines in this file (highlighted in the editor); everything else was generated by CubeMX. Hover a highlighted line or click its 💡 in the gutter. {p?.exampleId ? '' : ''}
            </div>
            {groups.map(([id, occs]) => (
              <Card key={id} snippet={SNIPPET_BY_ID[id]} occs={occs} file={activeFile} exampleId={p?.exampleId} focused={focusedId === id} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
