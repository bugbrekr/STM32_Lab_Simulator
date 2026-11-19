import { useEffect, useRef, useState } from 'react';
import { useStore, getProject } from '../store/store';
import { revealLine, serialSend, serialClear, serialDisconnect, setWatches, setLogicPins, toggleBreakpoint } from '../app/controller';
import type { VarNode } from '../sim/simulator';
import { Icon } from './icons';
import { GPIO_PINS } from '../sim/mcu/pins';

function VarTree({ nodes, depth = 0 }: { nodes: VarNode[]; depth?: number }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  return (
    <>
      {nodes.map((n, i) => {
        const k = n.name + i;
        const has = !!n.children?.length;
        return (
          <div key={k}>
            <div className="var-row" style={{ paddingLeft: 6 + depth * 14 }}>
              <span className="twisty" onClick={() => has && setOpen((o) => ({ ...o, [k]: !o[k] }))}>
                {has ? (open[k] ? '▾' : '▸') : ' '}
              </span>
              <span className="vname">{n.name}</span>
              <span className="vtype">{n.type}</span>
              <span className="vval">{n.value}</span>
            </div>
            {has && open[k] && <VarTree nodes={n.children!} depth={depth + 1} />}
          </div>
        );
      })}
    </>
  );
}

function ConsoleView() {
  const view = useStore((s) => s.consoleView);
  const buildLog = useStore((s) => s.buildLog);
  const debugLog = useStore((s) => s.debugLog);
  const serial = useStore((s) => s.serial);
  const set = useStore((s) => s.set);
  const activeProjectId = useStore((s) => s.activeProjectId);
  const ref = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState('');
  useEffect(() => {
    if (view === 'serial' && serial.scrollLock) return;
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [buildLog, debugLog, serial.text, view, serial.scrollLock]);
  if (view === 'serial') {
    return (
      <div className="console-wrap">
        <div className="console-title">
          <Icon name="console" /> {serial.open ? `Command Shell Console — Serial: ${serial.port.split('/').pop()} (${serial.baud} 8N1) CONNECTED` : 'Command Shell Console — <disconnected>'}
          <span className="spacer" />
          <button title="Clear Console" onClick={serialClear}>
            <Icon name="clear" />
          </button>
          <button title="Scroll Lock" className={serial.scrollLock ? 'on' : ''} onClick={() => set({ serial: { ...serial, scrollLock: !serial.scrollLock } })}>
            <Icon name="lock" />
          </button>
          {serial.open ? (
            <button title="Disconnect" onClick={serialDisconnect}>
              Disconnect
            </button>
          ) : (
            <button title="Connect" onClick={() => window.dispatchEvent(new CustomEvent('open-serial-dialog'))}>
              <Icon name="plug" /> Connect…
            </button>
          )}
        </div>
        <div className="console serial" ref={ref}>
          {serial.text}
          {serial.open && <span className="cursor">▌</span>}
        </div>
        <form
          className="serial-input"
          onSubmit={(e) => {
            e.preventDefault();
            serialSend(input);
            setInput('');
          }}
        >
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={serial.open ? 'Type here and press Enter to send to the board (USART2 RX)' : 'Not connected'} disabled={!serial.open} />
          <select value={serial.lineEnding} onChange={(e) => set({ serial: { ...serial, lineEnding: e.target.value as 'none' | 'lf' | 'crlf' } })}>
            <option value="none">No line ending</option>
            <option value="lf">LF</option>
            <option value="crlf">CR+LF</option>
          </select>
        </form>
      </div>
    );
  }
  const lines = view === 'build' ? buildLog : debugLog;
  const p = getProject(activeProjectId);
  return (
    <div className="console-wrap">
      <div className="console-title">
        <Icon name="console" /> {view === 'build' ? `CDT Build Console [${p?.name ?? ''}]` : `${p?.name ?? ''} Debug [STM32 C/C++ Application] ST-LINK (ST-LINK GDB server)`}
        <span className="spacer" />
        <button title="Clear Console" onClick={() => set(view === 'build' ? { buildLog: [] } : { debugLog: [] })}>
          <Icon name="clear" />
        </button>
      </div>
      <div className="console" ref={ref}>
        {lines.map((l, i) => (
          <div
            key={i}
            className={`cl ${l.kind} ${l.file ? 'link' : ''}`}
            onClick={() => {
              if (l.file && l.line && activeProjectId) revealLine({ projectId: activeProjectId, path: l.file }, l.line);
            }}
          >
            {l.text || ' '}
          </div>
        ))}
      </div>
    </div>
  );
}

function Problems() {
  const problems = useStore((s) => s.problems);
  const pid = useStore((s) => s.activeProjectId);
  const errors = problems.filter((p) => p.severity === 'error');
  const warnings = problems.filter((p) => p.severity === 'warning');
  return (
    <div className="table-wrap">
      <div className="console-title">
        {errors.length} errors, {warnings.length} warnings, 0 others
      </div>
      <table className="grid">
        <thead>
          <tr>
            <th style={{ width: '55%' }}>Description</th>
            <th>Resource</th>
            <th>Path</th>
            <th>Location</th>
            <th>Type</th>
          </tr>
        </thead>
        <tbody>
          {problems.map((d, i) => (
            <tr key={i} onDoubleClick={() => pid && d.file && revealLine({ projectId: pid, path: d.file }, d.line)}>
              <td>
                <span className={d.severity === 'error' ? 'err-dot' : 'warn-dot'}>{d.severity === 'error' ? '✖' : '⚠'}</span> {d.message}
              </td>
              <td>{d.file.split('/').pop()}</td>
              <td>{d.file.includes('/') ? '/' + d.file.split('/').slice(0, -1).join('/') : ''}</td>
              <td>line {d.line}</td>
              <td>C/C++ Problem</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Variables() {
  const pause = useStore((s) => s.sim.pause);
  const globals = useStore((s) => s.sim.globals);
  const status = useStore((s) => s.sim.status);
  if (status !== 'paused' || !pause) return <div className="empty-hint">Variables are shown when the program is suspended (breakpoint or Suspend).</div>;
  return (
    <div className="table-wrap">
      <div className="var-row head">
        <span className="twisty" />
        <span className="vname">Name</span>
        <span className="vtype">Type</span>
        <span className="vval">Value</span>
      </div>
      <VarTree nodes={pause.locals} />
      <div className="var-section">Globals</div>
      <VarTree nodes={globals} />
    </div>
  );
}

function Breakpoints() {
  const projects = useStore((s) => s.projects);
  const pid = useStore((s) => s.activeProjectId);
  const p = projects.find((x) => x.id === pid);
  if (!p) return <div className="empty-hint">No project selected.</div>;
  const list = Object.entries(p.breakpoints ?? {}).flatMap(([f, ls]) => ls.map((l) => ({ f, l })));
  if (!list.length) return <div className="empty-hint">No breakpoints. Double-click/click in the editor's left margin to add one.</div>;
  return (
    <div className="table-wrap">
      {list.map(({ f, l }) => (
        <div key={`${f}:${l}`} className="var-row" onDoubleClick={() => revealLine({ projectId: p.id, path: f }, l)}>
          <span className="bp-dot" />
          <span className="vname">
            {f.split('/').pop()} [line: {l}]
          </span>
          <span className="spacer" />
          <button className="mini" onClick={() => toggleBreakpoint({ projectId: p.id, path: f }, l)}>
            Remove
          </button>
        </div>
      ))}
    </div>
  );
}

function LiveExpressions() {
  const exprs = useStore((s) => s.watchExprs);
  const watches = useStore((s) => s.sim.watches);
  const active = useStore((s) => s.sim.active);
  const [text, setText] = useState('');
  return (
    <div className="table-wrap">
      <div className="var-row head">
        <span className="twisty" />
        <span className="vname">Expression</span>
        <span className="vtype">Type</span>
        <span className="vval">Value</span>
      </div>
      {exprs.map((e, i) => {
        const w = watches[i];
        return (
          <div key={e + i}>
            <div className="var-row">
              <span className="twisty" />
              <span className="vname">{e}</span>
              <span className="vtype">{w?.type ?? ''}</span>
              <span className="vval">{active ? w?.value ?? '…' : '<not running>'}</span>
              <button className="mini" onClick={() => setWatches(exprs.filter((_, j) => j !== i))}>
                ✕
              </button>
            </div>
            {active && w?.children && <VarTree nodes={w.children} depth={1} />}
          </div>
        );
      })}
      <form
        className="var-row"
        onSubmit={(ev) => {
          ev.preventDefault();
          if (text.trim()) setWatches([...exprs, text.trim()]);
          setText('');
        }}
      >
        <span className="twisty">✚</span>
        <input className="add-expr" value={text} onChange={(e) => setText(e.target.value)} placeholder="Add new expression (global variable, e.g. temperatureC or htim1.Init.Period)" />
      </form>
    </div>
  );
}

function LogicAnalyzer() {
  const pins = useStore((s) => s.logicPins);
  const traces = useStore((s) => s.sim.traces);
  const snap = useStore((s) => s.sim.snap);
  const [win, setWin] = useState(2);
  const [picker, setPicker] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const W = c.clientWidth;
    const H = c.clientHeight;
    c.width = W * dpr;
    c.height = H * dpr;
    const g = c.getContext('2d')!;
    g.scale(dpr, dpr);
    g.fillStyle = '#0e1116';
    g.fillRect(0, 0, W, H);
    const t1 = snap?.t ?? 0;
    const t0 = t1 - win;
    const left = 64;
    const rowH = Math.max(22, Math.min(40, (H - 20) / Math.max(1, pins.length)));
    const x = (t: number) => left + ((t - t0) / win) * (W - left - 8);
    // grid
    g.strokeStyle = '#222a33';
    g.fillStyle = '#6b7685';
    g.font = '10px monospace';
    for (let i = 0; i <= 10; i++) {
      const tx = left + (i / 10) * (W - left - 8);
      g.beginPath();
      g.moveTo(tx, 0);
      g.lineTo(tx, H - 14);
      g.stroke();
      if (i % 2 === 0) g.fillText(`${((i / 10 - 1) * win * 1000).toFixed(0)}ms`, tx - 14, H - 3);
    }
    pins.forEach((pin, r) => {
      const y0 = 6 + r * rowH;
      const hi = y0 + 4;
      const lo = y0 + rowH - 6;
      g.fillStyle = '#c9d4e3';
      g.font = '11px monospace';
      g.fillText(pin, 8, (hi + lo) / 2 + 4);
      const tr = traces[pin] ?? [];
      const cur = snap?.pins[pin];
      const pts = tr.filter((p) => p[0] >= t0 - 10);
      let prevT = t0;
      let prevV = 0;
      // find value at t0
      for (const p of tr) if (p[0] <= t0) prevV = p[1];
      const seg = (ta: number, tb: number, v: number) => {
        const xa = Math.max(left, x(ta));
        const xb = Math.min(W - 8, x(tb));
        if (xb <= xa) return;
        if (v >= 2) {
          const duty = v - 2;
          g.fillStyle = 'rgba(80,200,255,0.25)';
          g.fillRect(xa, hi, xb - xa, lo - hi);
          g.strokeStyle = '#4fc3ff';
          g.strokeRect(xa, hi, xb - xa, lo - hi);
          if (xb - xa > 60) {
            g.fillStyle = '#9fe0ff';
            g.font = '10px monospace';
            g.fillText(`PWM ${(duty * 100).toFixed(1)}%`, xa + 4, (hi + lo) / 2 + 3);
          }
        } else {
          g.strokeStyle = '#5dff8f';
          g.lineWidth = 1.5;
          g.beginPath();
          g.moveTo(xa, v ? hi : lo);
          g.lineTo(xb, v ? hi : lo);
          g.stroke();
        }
      };
      for (const [t, v] of pts) {
        if (t < t0) continue;
        seg(prevT, t, prevV);
        // edge
        if (prevV < 2 && v < 2 && prevV !== v) {
          g.strokeStyle = '#5dff8f';
          g.beginPath();
          g.moveTo(x(t), hi);
          g.lineTo(x(t), lo);
          g.stroke();
        }
        prevT = t;
        prevV = v;
      }
      seg(prevT, t1, cur?.pwm && cur.pwm.freq > 0 ? 2 + cur.pwm.duty : prevV);
      g.strokeStyle = '#1b222b';
      g.beginPath();
      g.moveTo(0, y0 + rowH);
      g.lineTo(W, y0 + rowH);
      g.stroke();
    });
  }, [traces, snap, pins, win]);
  return (
    <div className="logic">
      <div className="console-title">
        Logic analyzer (simulator) — window
        <select value={win} onChange={(e) => setWin(Number(e.target.value))}>
          {[0.01, 0.05, 0.2, 0.5, 1, 2, 5, 10].map((v) => (
            <option key={v} value={v}>
              {v >= 1 ? `${v} s` : `${v * 1000} ms`}
            </option>
          ))}
        </select>
        <button onClick={() => setPicker(!picker)}>Pins…</button>
        <span className="spacer" />
        <span style={{ opacity: 0.7 }}>PWM outputs are shown as shaded bands with their duty cycle</span>
      </div>
      {picker && (
        <div className="pin-picker">
          {GPIO_PINS.map((p) => (
            <label key={p}>
              <input type="checkbox" checked={pins.includes(p)} onChange={(e) => setLogicPins(e.target.checked ? [...pins, p] : pins.filter((x) => x !== p))} />
              {p}
            </label>
          ))}
        </div>
      )}
      <canvas ref={canvas} className="logic-canvas" />
    </div>
  );
}

export function BottomPanel() {
  const tab = useStore((s) => s.bottomTab);
  const set = useStore((s) => s.set);
  const view = useStore((s) => s.consoleView);
  const problems = useStore((s) => s.problems);
  const serialOpen = useStore((s) => s.serial.open);
  const [menu, setMenu] = useState(false);
  const tabs: [typeof tab, string][] = [
    ['problems', `Problems${problems.length ? ` (${problems.length})` : ''}`],
    ['console', 'Console'],
    ['variables', 'Variables'],
    ['breakpoints', 'Breakpoints'],
    ['live', 'Live Expressions'],
    ['logic', 'Logic Analyzer'],
  ];
  return (
    <div className="bottom">
      <div className="view-tabs">
        {tabs.map(([k, l]) => (
          <div key={k} className={`vtab ${tab === k ? 'active' : ''}`} onClick={() => set({ bottomTab: k })}>
            {l}
          </div>
        ))}
        <span className="spacer" />
        {tab === 'console' && (
          <div className="console-switch">
            <button onClick={() => setMenu(!menu)} title="Open Console">
              <Icon name="console" /> {view === 'build' ? 'CDT Build Console' : view === 'serial' ? 'Command Shell Console' : 'Debugger Console'} ▾
            </button>
            {menu && (
              <div className="ctx-menu" style={{ right: 0, top: 24 }} onMouseLeave={() => setMenu(false)}>
                <div onClick={() => (set({ consoleView: 'build' }), setMenu(false))}>CDT Build Console</div>
                <div
                  onClick={() => {
                    set({ consoleView: 'serial' });
                    setMenu(false);
                    if (!serialOpen) window.dispatchEvent(new CustomEvent('open-serial-dialog'));
                  }}
                >
                  Command Shell Console (Serial Port)
                </div>
                <div onClick={() => (set({ consoleView: 'debug' }), setMenu(false))}>ST-LINK GDB Server / Debugger Console</div>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="bottom-body">
        {tab === 'console' && <ConsoleView />}
        {tab === 'problems' && <Problems />}
        {tab === 'variables' && <Variables />}
        {tab === 'breakpoints' && <Breakpoints />}
        {tab === 'live' && <LiveExpressions />}
        {tab === 'logic' && <LogicAnalyzer />}
      </div>
    </div>
  );
}
