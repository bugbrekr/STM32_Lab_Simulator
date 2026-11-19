import { useEffect, useRef } from 'react';
import * as monaco from 'monaco-editor/editor/editor.api';
import 'monaco-editor/languages/definitions/cpp/register';
import 'monaco-editor/languages/definitions/ini/register';
import 'monaco-editor/editor/contrib/find/browser/findController';
import 'monaco-editor/editor/contrib/folding/browser/folding';
import 'monaco-editor/editor/contrib/bracketMatching/browser/bracketMatching';
import 'monaco-editor/editor/contrib/wordHighlighter/browser/wordHighlighter';
import 'monaco-editor/editor/contrib/comment/browser/comment';
import 'monaco-editor/editor/contrib/linesOperations/browser/linesOperations';
import 'monaco-editor/editor/contrib/suggest/browser/suggestController';
import 'monaco-editor/editor/contrib/hover/browser/hoverContribution';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';
import { useStore, FileRef, getProject } from '../store/store';
import { saveFile, toggleBreakpoint, openInMx } from '../app/controller';
import { SYSTEM_HEADERS } from '../sim/headers';

(self as unknown as { MonacoEnvironment: unknown }).MonacoEnvironment = { getWorker: () => new EditorWorker() };

let themed = false;
function defineTheme() {
  if (themed) return;
  themed = true;
  monaco.editor.defineTheme('cubeide', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: '7f0055', fontStyle: 'bold' },
      { token: 'keyword.directive', foreground: '7f0055', fontStyle: 'bold' },
      { token: 'comment', foreground: '3f7f5f' },
      { token: 'string', foreground: '2a00ff' },
      { token: 'number', foreground: '000000' },
      { token: 'type', foreground: '005032', fontStyle: 'bold' },
      { token: 'identifier', foreground: '000000' },
    ],
    colors: {
      'editor.background': '#ffffff',
      'editor.lineHighlightBackground': '#e8f2fe',
      'editorLineNumber.foreground': '#787878',
      'editorGutter.background': '#f7f7f7',
    },
  });
  // completion: HAL functions & macros from headers
  const words = new Set<string>();
  for (const h of ['stm32f4xx_hal.h', 'stm32f4xx.h', 'stdio.h', 'string.h']) {
    for (const m of (SYSTEM_HEADERS[h] ?? '').matchAll(/\b(HAL_\w+|__HAL_\w+|GPIO_\w+|TIM_\w+|ADC_\w+|UART_\w+|RCC_\w+|printf|sprintf|snprintf|strlen|memset|memcpy|uint\d+_t|int\d+_t)\b/g)) words.add(m[1]);
  }
  const list = [...words].sort();
  monaco.languages.registerCompletionItemProvider('c', {
    provideCompletionItems(model, position) {
      const w = model.getWordUntilPosition(position);
      const range = new monaco.Range(position.lineNumber, w.startColumn, position.lineNumber, w.endColumn);
      return {
        suggestions: list
          .filter((x) => x.startsWith(w.word) && w.word.length >= 2)
          .slice(0, 200)
          .map((x) => ({ label: x, kind: /^HAL_|^printf|^sprintf|^str|^mem/.test(x) ? monaco.languages.CompletionItemKind.Function : monaco.languages.CompletionItemKind.Constant, insertText: x, range })),
      };
    },
  });
}

function uriOf(ref: FileRef) {
  return monaco.Uri.parse(`file:///${ref.projectId}/${ref.path}`);
}

export function getModel(ref: FileRef, content: string): monaco.editor.ITextModel {
  const uri = uriOf(ref);
  let m = monaco.editor.getModel(uri);
  if (!m) {
    const lang = /\.(c|h|s)$/.test(ref.path) ? 'c' : /\.ld$/.test(ref.path) ? 'plaintext' : /\.ioc$/.test(ref.path) ? 'ini' : 'plaintext';
    m = monaco.editor.createModel(content, lang, uri);
  }
  return m;
}

export function Editor() {
  const host = useRef<HTMLDivElement>(null);
  const ed = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const decos = useRef<monaco.editor.IEditorDecorationsCollection | null>(null);
  const activeFile = useStore((s) => s.activeFile);
  const projects = useStore((s) => s.projects);
  const problems = useStore((s) => s.problems);
  const pause = useStore((s) => s.sim.pause);
  const simProject = useStore((s) => s.sim.projectId);
  const faultLoc = useStore((s) => (s.sim.status === 'fault' ? s.sim.snap?.location : null));
  const reveal = useStore((s) => s.revealLine);
  const suppress = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef = useRef<FileRef | null>(null);

  useEffect(() => {
    defineTheme();
    const e = monaco.editor.create(host.current!, {
      theme: 'cubeide',
      fontFamily: "Consolas, 'Courier New', monospace",
      fontSize: 13,
      glyphMargin: true,
      automaticLayout: true,
      minimap: { enabled: false },
      tabSize: 2,
      insertSpaces: true,
      renderWhitespace: 'none',
      scrollBeyondLastLine: false,
      lineNumbersMinChars: 4,
      folding: true,
    });
    ed.current = e;
    decos.current = e.createDecorationsCollection([]);
    e.onMouseDown((ev) => {
      const t = ev.target;
      if ((t.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN || t.type === monaco.editor.MouseTargetType.GUTTER_LINE_DECORATIONS) && t.position && activeRef.current) {
        toggleBreakpoint(activeRef.current, t.position.lineNumber);
      }
    });
    e.onDidChangeModelContent(() => {
      if (suppress.current || !activeRef.current) return;
      const ref = activeRef.current;
      const value = e.getValue();
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => saveFile(ref, value), 200);
      useStore.getState().set((s) => ({ dirty: { ...s.dirty, [`${ref.projectId}:${ref.path}`]: true } }));
    });
    return () => e.dispose();
  }, []);

  // switch model when active file changes / external content changes
  useEffect(() => {
    const e = ed.current;
    if (!e) return;
    activeRef.current = activeFile;
    if (!activeFile) {
      e.setModel(null);
      return;
    }
    const p = getProject(activeFile.projectId);
    const content = p?.files[activeFile.path];
    if (content === undefined) {
      e.setModel(null);
      return;
    }
    const m = getModel(activeFile, content);
    if (m.getValue() !== content && !saveTimer.current) {
      suppress.current = true;
      m.pushEditOperations([], [{ range: m.getFullModelRange(), text: content }], () => null);
      suppress.current = false;
    }
    if (e.getModel() !== m) e.setModel(m);
    const readOnly = activeFile.path.startsWith('Drivers/') || activeFile.path.endsWith('.ioc') || activeFile.path.endsWith('.launch');
    e.updateOptions({ readOnly });
  }, [activeFile, projects]);

  // keep other models in sync with store (e.g. after code generation)
  useEffect(() => {
    for (const p of projects) {
      for (const [path, content] of Object.entries(p.files)) {
        const m = monaco.editor.getModel(uriOf({ projectId: p.id, path }));
        if (m && m.getValue() !== content && !(activeRef.current?.projectId === p.id && activeRef.current.path === path && saveTimer.current)) {
          suppress.current = true;
          m.pushEditOperations([], [{ range: m.getFullModelRange(), text: content }], () => null);
          suppress.current = false;
        }
      }
    }
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
  }, [projects]);

  // decorations: breakpoints, current line
  useEffect(() => {
    const e = ed.current;
    if (!e || !activeFile) return;
    const p = getProject(activeFile.projectId);
    const bps = p?.breakpoints?.[activeFile.path] ?? [];
    const d: monaco.editor.IModelDeltaDecoration[] = bps.map((l) => ({
      range: new monaco.Range(l, 1, l, 1),
      options: { glyphMarginClassName: 'bp-glyph', glyphMarginHoverMessage: { value: `Line breakpoint: ${activeFile.path.split('/').pop()} [line: ${l}]` } },
    }));
    if (pause && simProject === activeFile.projectId && pause.file === activeFile.path) {
      d.push({ range: new monaco.Range(pause.line, 1, pause.line, 1), options: { isWholeLine: true, className: 'cur-line', glyphMarginClassName: 'cur-arrow' } });
    }
    if (faultLoc && simProject === activeFile.projectId && faultLoc.file === activeFile.path) {
      d.push({ range: new monaco.Range(faultLoc.line, 1, faultLoc.line, 1), options: { isWholeLine: true, className: 'fault-line', glyphMarginClassName: 'fault-glyph' } });
    }
    decos.current?.set(d);
  }, [activeFile, projects, pause, simProject, faultLoc]);

  // markers from problems
  useEffect(() => {
    for (const m of monaco.editor.getModels()) monaco.editor.setModelMarkers(m, 'gcc', []);
    const pid = useStore.getState().activeProjectId;
    if (!pid) return;
    const byFile = new Map<string, monaco.editor.IMarkerData[]>();
    for (const d of problems) {
      if (!d.file || d.file.startsWith('<')) continue;
      const arr = byFile.get(d.file) ?? [];
      arr.push({ severity: d.severity === 'error' ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning, message: d.message, startLineNumber: d.line, startColumn: d.col, endLineNumber: d.line, endColumn: d.col + 6 });
      byFile.set(d.file, arr);
    }
    for (const [file, markers] of byFile) {
      const p = getProject(pid);
      if (!p || p.files[file] === undefined) continue;
      const m = getModel({ projectId: pid, path: file }, p.files[file]);
      monaco.editor.setModelMarkers(m, 'gcc', markers);
    }
  }, [problems, activeFile]);

  // reveal line requests
  useEffect(() => {
    const e = ed.current;
    if (!e || !reveal || !activeFile) return;
    if (reveal.file.projectId !== activeFile.projectId || reveal.file.path !== activeFile.path) return;
    setTimeout(() => {
      e.revealLineInCenterIfOutsideViewport(reveal.line);
      e.setPosition({ lineNumber: reveal.line, column: 1 });
    }, 0);
  }, [reveal, activeFile]);

  const isIoc = activeFile?.path.endsWith('.ioc');
  return (
    <div style={{ position: 'relative', height: '100%' }}>
      <div ref={host} style={{ position: 'absolute', inset: 0 }} />
      {isIoc && activeFile && (
        <div className="ioc-banner">
          This is the CubeMX configuration file. <button onClick={() => openInMx(activeFile.projectId)}>Open in STM32CubeMX</button>
        </div>
      )}
    </div>
  );
}
