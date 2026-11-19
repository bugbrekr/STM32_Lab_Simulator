import { useEffect, useRef, useState } from 'react';
import { useStore, getProject, updateProject } from '../store/store';
import { Editor } from './Editor';
import { ProjectExplorer } from './ProjectExplorer';
import { BottomPanel } from './BottomPanel';
import { Icon } from './icons';
import BenchPanel from '../board/BenchPanel';
import {
  build, runTarget, stopTarget, pauseTarget, resumeTarget, stepTarget, resetTarget, closeFile, openFile, openExample, setInputs, setParts, setSpeed, serialConnect, revealLine,
} from '../app/controller';
import { EXAMPLES } from '../examples';
import './ide.css';

type Menu = 'file' | 'edit' | 'project' | 'run' | 'window' | 'help' | null;

const launchConfigured = new Set<string>();

function SerialDialog({ onClose }: { onClose: () => void }) {
  const serial = useStore((s) => s.serial);
  const [step, setStep] = useState<1 | 2>(1);
  const [baud, setBaud] = useState(serial.baud);
  const [port, setPort] = useState(serial.port);
  const [name, setName] = useState('Nucleo VCP');
  return (
    <div className="modal-backdrop">
      <div className="dlg">
        <div className="dlg-title">{step === 1 ? 'Select Remote Connection' : 'New Connection'}</div>
        <div className="dlg-body">
          {step === 1 ? (
            <>
              <p>Connection Type:</p>
              <select defaultValue="serial" style={{ width: '100%' }}>
                <option value="serial">Serial Port</option>
                <option disabled>Telnet</option>
                <option disabled>SSH</option>
              </select>
              <p>Connection name:</p>
              <div style={{ display: 'flex', gap: 6 }}>
                <select style={{ flex: 1 }} value={name} onChange={(e) => setName(e.target.value)}>
                  <option>{name}</option>
                </select>
                <button onClick={() => setStep(2)}>New...</button>
              </div>
              <p className="dim">
                Settings: {port}, {baud} baud, 8 data bits, no parity, 1 stop bit
              </p>
            </>
          ) : (
            <div className="form-grid">
              <label>Connection name:</label>
              <input value={name} onChange={(e) => setName(e.target.value)} />
              <label>Serial port:</label>
              <select value={port} onChange={(e) => setPort(e.target.value)}>
                <option value="/dev/ttyACM0">/dev/ttyACM0 — STLink Virtual COM Port (NUCLEO-F401RE)</option>
                <option value="COM3">COM3 — STMicroelectronics STLink Virtual COM Port</option>
              </select>
              <label>Baud rate:</label>
              <select value={baud} onChange={(e) => setBaud(Number(e.target.value))}>
                {[1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600].map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
              <label>Data size:</label>
              <select defaultValue="8">
                <option>8</option>
                <option disabled>7</option>
              </select>
              <label>Parity:</label>
              <select defaultValue="None">
                <option>None</option>
              </select>
              <label>Stop bits:</label>
              <select defaultValue="1">
                <option>1</option>
              </select>
              <label>Timeout (sec):</label>
              <input defaultValue="0" />
            </div>
          )}
        </div>
        <div className="dlg-buttons">
          {step === 2 && <button onClick={() => setStep(1)}>Back</button>}
          <button
            className="primary"
            onClick={() => {
              if (step === 2) setStep(1);
              else {
                serialConnect(port, baud);
                onClose();
              }
            }}
          >
            {step === 2 ? 'Finish' : 'OK'}
          </button>
          <button onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function PropertiesDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const p = getProject(id);
  const [pf, setPf] = useState(!!p?.settings.printfFloat);
  if (!p) return null;
  return (
    <div className="modal-backdrop">
      <div className="dlg wide">
        <div className="dlg-title">Properties for {p.name}</div>
        <div className="dlg-body props">
          <div className="props-tree">
            <div>Resource</div>
            <div>▾ C/C++ Build</div>
            <div className="sel" style={{ paddingLeft: 24 }}>
              Settings
            </div>
            <div>C/C++ General</div>
            <div>Run/Debug Settings</div>
          </div>
          <div className="props-page">
            <div className="props-head">Settings — Configuration: Debug [ Active ]</div>
            <div className="tabs-mini">
              <span className="on">Tool Settings</span>
              <span>Build Steps</span>
              <span>Build Artifact</span>
            </div>
            <div className="props-sub">
              <b>MCU Settings</b>
              <div className="form-grid">
                <label>MCU</label>
                <input disabled value="STM32F401RETx" />
                <label>Board</label>
                <input disabled value="NUCLEO-F401RE" />
                <label>Floating-point unit</label>
                <select disabled>
                  <option>FPv4-SP-D16</option>
                </select>
                <label>Floating-point ABI</label>
                <select disabled>
                  <option>Hardware implementation (-mfloat-abi=hard)</option>
                </select>
                <label>Instruction set</label>
                <select disabled>
                  <option>Thumb2</option>
                </select>
                <label>Runtime library</label>
                <select disabled>
                  <option>Reduced C (--specs=nano.specs)</option>
                </select>
              </div>
              <label className="chk">
                <input type="checkbox" checked={pf} onChange={(e) => setPf(e.target.checked)} /> Use float with printf from newlib-nano (-u _printf_float)
              </label>
              <label className="chk">
                <input type="checkbox" disabled /> Use float with scanf from newlib-nano (-u _scanf_float)
              </label>
              <p className="dim">Without “printf float”, %f in printf prints nothing (newlib-nano). Enabling it adds ~10 KB of code.</p>
            </div>
          </div>
        </div>
        <div className="dlg-buttons">
          <button
            className="primary"
            onClick={() => {
              updateProject(id, (x) => ({ ...x, settings: { ...x.settings, printfFloat: pf } }));
              onClose();
            }}
          >
            Apply and Close
          </button>
          <button onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function LaunchDialog({ id, debug, onOk, onClose }: { id: string; debug: boolean; onOk: () => void; onClose: () => void }) {
  const p = getProject(id);
  if (!p) return null;
  return (
    <div className="modal-backdrop">
      <div className="dlg wide">
        <div className="dlg-title">Edit Configuration</div>
        <div className="dlg-body">
          <div className="form-grid">
            <label>Name:</label>
            <input readOnly value={`${p.name} Debug`} />
            <label>Project:</label>
            <input readOnly value={p.name} />
            <label>C/C++ Application:</label>
            <input readOnly value={`Debug/${p.name}.elf`} />
            <label>Debug probe:</label>
            <select defaultValue="stlink">
              <option value="stlink">ST-LINK (ST-LINK GDB server)</option>
              <option disabled>ST-LINK (OpenOCD)</option>
            </select>
            <label>Interface:</label>
            <select defaultValue="swd">
              <option value="swd">SWD</option>
            </select>
            <label>ST-LINK S/N:</label>
            <input readOnly value="066DFF515055657867252529 (NUCLEO-F401RE)" />
            <label>Reset behaviour:</label>
            <select defaultValue="connect">
              <option value="connect">Connect under reset</option>
            </select>
          </div>
          <p className="dim">{debug ? 'The debugger halts at the first line of main(). Use Resume (F8) to run.' : 'Run mode programs the board and lets it run.'}</p>
        </div>
        <div className="dlg-buttons">
          <button className="primary" onClick={onOk}>
            OK
          </button>
          <button onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function DebugView() {
  const pause = useStore((s) => s.sim.pause);
  const status = useStore((s) => s.sim.status);
  const pid = useStore((s) => s.sim.projectId);
  const p = getProject(pid);
  return (
    <div className="debugview">
      <div className="pane-title">
        <Icon name="debug" /> Debug
      </div>
      <div className="dv-body">
        <div className="tree-row">
          <Icon name="debug" /> {p?.name} Debug [STM32 C/C++ Application]
        </div>
        <div className="tree-row" style={{ paddingLeft: 18 }}>
          {p?.name}.elf
        </div>
        <div className="tree-row" style={{ paddingLeft: 32 }}>
          Thread #1 [main] 1 [core: 0] ({status === 'paused' ? `Suspended : ${pause?.reason === 'breakpoint' ? 'Breakpoint' : 'Step'}` : status === 'running' ? 'Running' : status})
        </div>
        {status === 'paused' &&
          pause?.stack.map((f, i) => (
            <div key={i} className={`tree-row ${i === 0 ? 'sel' : ''}`} style={{ paddingLeft: 46 }} onClick={() => pid && f.file && revealLine({ projectId: pid, path: f.file }, f.line)}>
              ≡ {f.fn}() at {f.file.split('/').pop()}:{f.line}
            </div>
          ))}
      </div>
    </div>
  );
}

export function CubeIDE() {
  const [menu, setMenu] = useState<Menu>(null);
  const [serialDlg, setSerialDlg] = useState(false);
  const [propsDlg, setPropsDlg] = useState<string | null>(null);
  const [launch, setLaunch] = useState<{ id: string; debug: boolean } | null>(null);
  const [about, setAbout] = useState(false);
  const s = useStore();
  const app = s.app;
  const sim = s.sim;
  const activeProject = getProject(s.activeProjectId);
  const dragging = useRef(false);

  const doRun = (debug: boolean) => {
    const id = s.activeProjectId;
    if (!id) {
      alert('Select a project in the Project Explorer first.');
      return;
    }
    if (!launchConfigured.has(id)) setLaunch({ id, debug });
    else runTarget(debug, id);
  };

  useEffect(() => {
    const h = () => setSerialDlg(true);
    window.addEventListener('open-serial-dialog', h);
    return () => window.removeEventListener('open-serial-dialog', h);
  }, []);

  useEffect(() => {
    if (app !== 'ide') return;
    const onKey = (e: KeyboardEvent) => {
      const st = useStore.getState();
      if (e.ctrlKey && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        build();
      } else if (e.ctrlKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        st.set({ dirty: {} });
      } else if (e.key === 'F11' && e.ctrlKey) {
        e.preventDefault();
        doRun(false);
      } else if (e.key === 'F11') {
        e.preventDefault();
        doRun(true);
      } else if (e.key === 'F8' && st.sim.active) {
        e.preventDefault();
        resumeTarget();
      } else if (e.key === 'F5' && st.sim.status === 'paused') {
        e.preventDefault();
        stepTarget('into');
      } else if (e.key === 'F6' && st.sim.status === 'paused') {
        e.preventDefault();
        stepTarget('over');
      } else if (e.key === 'F7' && st.sim.status === 'paused') {
        e.preventDefault();
        stepTarget('out');
      } else if (e.key === 'F2' && e.ctrlKey && st.sim.active) {
        e.preventDefault();
        stopTarget();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const paused = sim.status === 'paused';
  const dbg = sim.active && sim.debugging;
  const files = s.openFiles;
  const af = s.activeFile;
  const dirty = s.dirty;

  const menuItem = (label: string, action: () => void, shortcut?: string, disabled?: boolean) => (
    <div
      className={`mi ${disabled ? 'disabled' : ''}`}
      onClick={() => {
        if (disabled) return;
        setMenu(null);
        action();
      }}
    >
      <span>{label}</span>
      {shortcut && <span className="sc">{shortcut}</span>}
    </div>
  );

  return (
    <div className="ide" onClick={() => menu && setMenu(null)}>
      <div className="menubar" onClick={(e) => e.stopPropagation()}>
        {(['file', 'edit', 'project', 'run', 'window', 'help'] as const).map((m) => (
          <div key={m} className={`menu ${menu === m ? 'open' : ''}`} onClick={() => setMenu(menu === m ? null : m)} onMouseEnter={() => menu && setMenu(m)}>
            {{ file: 'File', edit: 'Edit', project: 'Project', run: 'Run', window: 'Window', help: 'Help' }[m]}
            {menu === m && (
              <div className="dropdown" onClick={(e) => e.stopPropagation()}>
                {m === 'file' && (
                  <>
                    {menuItem('New ▸ STM32 Project (opens STM32CubeMX)', () => s.set({ app: 'mx', mxPage: 'home' }))}
                    <div className="mi sub">
                      <span>Open Lab Experiment ▸</span>
                      <div className="subdrop">
                        {EXAMPLES.map((ex) => (
                          <div key={ex.id} className="mi" onClick={() => (setMenu(null), openExample(ex, 'ide'))}>
                            {ex.title}
                          </div>
                        ))}
                      </div>
                    </div>
                    <hr />
                    {menuItem('Save', () => s.set({ dirty: {} }), 'Ctrl+S')}
                    {menuItem('Close', () => af && closeFile(af), 'Ctrl+W', !af)}
                    {menuItem('Close All', () => s.set({ openFiles: [], activeFile: null }))}
                    <hr />
                    {menuItem('Properties', () => s.activeProjectId && setPropsDlg(s.activeProjectId), 'Alt+Enter', !s.activeProjectId)}
                  </>
                )}
                {m === 'edit' && (
                  <>
                    {menuItem('Undo', () => document.execCommand('undo'), 'Ctrl+Z')}
                    {menuItem('Redo', () => document.execCommand('redo'), 'Ctrl+Y')}
                    <hr />
                    {menuItem('Find/Replace…', () => undefined, 'Ctrl+F')}
                  </>
                )}
                {m === 'project' && (
                  <>
                    {menuItem('Build Project', () => build(), 'Ctrl+B', !s.activeProjectId)}
                    {menuItem('Build All', () => s.projects.forEach((p) => build(p.id)))}
                    {menuItem('Clean…', () => s.set({ buildLog: [{ text: `Cleaning ${activeProject?.name ?? ''}… done.`, kind: 'info' }] }))}
                    <hr />
                    {menuItem('Generate Code (open .ioc in CubeMX)', () => activeProject && useStore.getState().set({ app: 'mx' }), undefined, !activeProject)}
                    {menuItem('Properties', () => s.activeProjectId && setPropsDlg(s.activeProjectId), undefined, !s.activeProjectId)}
                  </>
                )}
                {m === 'run' && (
                  <>
                    {menuItem('Run', () => doRun(false), 'Ctrl+F11')}
                    {menuItem('Debug', () => doRun(true), 'F11')}
                    <hr />
                    {menuItem('Resume', resumeTarget, 'F8', !paused)}
                    {menuItem('Suspend', pauseTarget, undefined, !(dbg && !paused))}
                    {menuItem('Terminate', stopTarget, 'Ctrl+F2', !sim.active)}
                    {menuItem('Step Into', () => stepTarget('into'), 'F5', !paused)}
                    {menuItem('Step Over', () => stepTarget('over'), 'F6', !paused)}
                    {menuItem('Step Return', () => stepTarget('out'), 'F7', !paused)}
                    {menuItem('Reset the chip and restart', resetTarget, undefined, !sim.active)}
                    <hr />
                    {menuItem('Run Configurations…', () => s.activeProjectId && setLaunch({ id: s.activeProjectId, debug: false }), undefined, !s.activeProjectId)}
                  </>
                )}
                {m === 'window' && (
                  <>
                    {menuItem(`${s.boardVisible ? 'Hide' : 'Show'} Lab Bench (board view)`, () => s.set({ boardVisible: !s.boardVisible }))}
                    {menuItem('Open Lab Bench in new window', () => window.open(`${location.pathname}?view=board`, 'stm32bench', 'width=1200,height=800'))}
                    <hr />
                    {menuItem(`${s.guideHighlight ? 'Hide' : 'Highlight'} my code (Lab Guide)`, () => s.set({ guideHighlight: !s.guideHighlight }))}
                    {menuItem('Show View ▸ Lab Guide', () => s.set({ bottomTab: 'guide' }))}
                    {menuItem('Show View ▸ Console', () => s.set({ bottomTab: 'console' }))}
                    {menuItem('Show View ▸ Problems', () => s.set({ bottomTab: 'problems' }))}
                    {menuItem('Show View ▸ Live Expressions', () => s.set({ bottomTab: 'live' }))}
                    {menuItem('Show View ▸ Logic Analyzer', () => s.set({ bottomTab: 'logic' }))}
                    {menuItem('Show View ▸ Serial (Command Shell Console)', () => (s.set({ bottomTab: 'console', consoleView: 'serial' }), !s.serial.open && setSerialDlg(true)))}
                  </>
                )}
                {m === 'help' && (
                  <>
                    {menuItem('About STM32CubeIDE (simulator)', () => setAbout(true))}
                    {menuItem('Keyboard shortcuts', () => setAbout(true))}
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="toolbar">
        <button title="New STM32 Project" onClick={() => s.set({ app: 'mx', mxPage: 'home' })}>
          <Icon name="new" />
        </button>
        <button title="Save (Ctrl+S)" onClick={() => s.set({ dirty: {} })}>
          <Icon name="save" />
        </button>
        <span className="sep" />
        <button title="Build (Ctrl+B)" onClick={() => build()} disabled={!s.activeProjectId}>
          <Icon name="build" />
        </button>
        <span className="sep" />
        <button title="Debug (F11)" onClick={() => doRun(true)} disabled={!s.activeProjectId}>
          <Icon name="debug" />
        </button>
        <button title="Run (Ctrl+F11)" onClick={() => doRun(false)} disabled={!s.activeProjectId}>
          <Icon name="run" />
        </button>
        <span className="sep" />
        <button title="Resume (F8)" onClick={resumeTarget} disabled={!paused}>
          <Icon name="resume" />
        </button>
        <button title="Suspend" onClick={pauseTarget} disabled={!(dbg && !paused)}>
          <Icon name="suspend" />
        </button>
        <button title="Terminate (Ctrl+F2)" onClick={stopTarget} disabled={!sim.active}>
          <Icon name="terminate" />
        </button>
        <button title="Reset the chip and restart debug session" onClick={resetTarget} disabled={!sim.active}>
          <Icon name="reset" />
        </button>
        <span className="sep" />
        <button title="Step Into (F5)" onClick={() => stepTarget('into')} disabled={!paused}>
          <Icon name="stepinto" />
        </button>
        <button title="Step Over (F6)" onClick={() => stepTarget('over')} disabled={!paused}>
          <Icon name="stepover" />
        </button>
        <button title="Step Return (F7)" onClick={() => stepTarget('out')} disabled={!paused}>
          <Icon name="stepreturn" />
        </button>
        <span className="sep" />
        <button title="Open serial console (Command Shell Console)" onClick={() => (s.set({ bottomTab: 'console', consoleView: 'serial' }), !s.serial.open && setSerialDlg(true))}>
          <Icon name="console" /> <span className="tbtext">Serial</span>
        </button>
        <button
          title="Lab Guide: highlight and explain the code you type"
          className={s.guideHighlight ? 'on' : ''}
          onClick={() => s.set({ guideHighlight: !s.guideHighlight || s.bottomTab !== 'guide', bottomTab: 'guide' })}
        >
          💡 <span className="tbtext">Lab Guide</span>
        </button>
        <button title="Show/Hide the Lab Bench" onClick={() => s.set({ boardVisible: !s.boardVisible })} className={s.boardVisible ? 'on' : ''}>
          <Icon name="board" /> <span className="tbtext">Lab Bench</span>
        </button>
        <span className="spacer" />
        <div className="perspectives">
          <span className={!dbg ? 'on' : ''}>C/C++</span>
          <span className={dbg ? 'on' : ''}>Debug</span>
        </div>
      </div>

      <div className="ide-main">
        <div className="left">
          <div className="pane-title">Project Explorer</div>
          <div className="pane-body">
            <ProjectExplorer onProperties={(id) => setPropsDlg(id)} />
          </div>
          {sim.active && sim.debugging && <DebugView />}
        </div>
        <div className="center">
          <div className="editor-tabs">
            {files.map((f) => {
              const p = getProject(f.projectId);
              const k = `${f.projectId}:${f.path}`;
              const act = af && af.projectId === f.projectId && af.path === f.path;
              return (
                <div key={k} className={`etab ${act ? 'active' : ''}`} onClick={() => openFile(f)} title={`${p?.name}/${f.path}`}>
                  <Icon name={f.path.endsWith('.h') ? 'hfile' : f.path.endsWith('.ioc') ? 'ioc' : 'cfile'} />
                  {dirty[k] ? '*' : ''}
                  {f.path.split('/').pop()}
                  <span
                    className="x"
                    onClick={(e) => {
                      e.stopPropagation();
                      closeFile(f);
                    }}
                  >
                    ×
                  </span>
                </div>
              );
            })}
          </div>
          <div className="editor-area">
            <Editor />
            {!af && (
              <div className="welcome">
                <h2>STM32CubeIDE (simulator)</h2>
                <p>Open a file from the Project Explorer, or start with a lab experiment:</p>
                <div className="ex-grid">
                  {EXAMPLES.map((ex) => (
                    <div key={ex.id} className="ex-card" onClick={() => openExample(ex, 'ide')}>
                      <b>{ex.title}</b>
                      <span>{ex.description}</span>
                    </div>
                  ))}
                </div>
                <p className="dim">
                  Workflow: <b>STM32CubeMX</b> (configure pins → Generate Code) → <b>STM32CubeIDE</b> (write code → Build 🔨 → Run ▶ / Debug 🐞) → watch the <b>Lab Bench</b>. Use the <b>Serial</b> console to read UART output.
                </p>
              </div>
            )}
          </div>
          <div
            className="hsplit"
            onPointerDown={(e) => {
              dragging.current = true;
              (e.target as Element).setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (!dragging.current) return;
              const h = Math.max(120, Math.min(window.innerHeight - 220, window.innerHeight - e.clientY - 22));
              s.set({ bottomHeight: h });
            }}
            onPointerUp={() => (dragging.current = false)}
          />
          <div className="bottom-host" style={{ height: s.bottomHeight }}>
            <BottomPanel />
          </div>
        </div>
        {s.boardVisible && (
          <>
            <div
              className="splitter"
              onPointerDown={(e) => {
                dragging.current = true;
                (e.target as Element).setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                if (!dragging.current) return;
                const w = Math.max(320, Math.min(window.innerWidth - 500, window.innerWidth - e.clientX));
                s.set({ boardWidth: w });
              }}
              onPointerUp={() => (dragging.current = false)}
            />
            <div className="right" style={{ width: s.boardWidth }}>
              <BenchPanel
                snap={sim.snap}
                status={sim.status}
                statusText={sim.statusText}
                inputs={s.inputs}
                parts={s.parts}
                active={sim.active}
                flashing={sim.flashing}
                realtime={sim.realtime}
                speed={sim.speed}
                onInputs={setInputs}
                onParts={setParts}
                onReset={resetTarget}
                onSpeed={setSpeed}
                onPopout={() => window.open(`${location.pathname}?view=board`, 'stm32bench', 'width=1200,height=800')}
                onHide={() => s.set({ boardVisible: false })}
              />
            </div>
          </>
        )}
      </div>
      <div className="statusbar">
        <span>{af ? `${getProject(af.projectId)?.name}/${af.path}` : ''}</span>
        <span className="spacer" />
        {sim.active && (
          <span>
            {sim.status === 'running' ? '● Running' : sim.status === 'paused' ? '❚❚ Suspended' : sim.status === 'fault' ? '✖ Fault' : sim.status} @ {((sim.snap?.sysclk ?? 16e6) / 1e6).toFixed(0)} MHz
          </span>
        )}
        <span>Writable</span>
        <span>Smart Insert</span>
      </div>

      {serialDlg && <SerialDialog onClose={() => setSerialDlg(false)} />}
      {propsDlg && <PropertiesDialog id={propsDlg} onClose={() => setPropsDlg(null)} />}
      {launch && (
        <LaunchDialog
          id={launch.id}
          debug={launch.debug}
          onClose={() => setLaunch(null)}
          onOk={() => {
            launchConfigured.add(launch.id);
            const l = launch;
            setLaunch(null);
            runTarget(l.debug, l.id);
          }}
        />
      )}
      {about && (
        <div className="modal-backdrop" onClick={() => setAbout(false)}>
          <div className="dlg wide" onClick={(e) => e.stopPropagation()}>
            <div className="dlg-title">About this simulator</div>
            <div className="dlg-body">
              <p>
                A look-alike of STM32CubeIDE for practising the Microcontrollers lab. Code is compiled by a built-in C compiler and runs on a simulated STM32F401RE
                (84 MHz Cortex-M4 with cycle-estimated timing) connected to the lab carrier board.
              </p>
              <table className="grid">
                <tbody>
                  {[
                    ['Ctrl+B', 'Build project'],
                    ['F11', 'Debug (halts at main)'],
                    ['Ctrl+F11', 'Run'],
                    ['F8', 'Resume'],
                    ['F5 / F6 / F7', 'Step Into / Over / Return'],
                    ['Ctrl+F2', 'Terminate'],
                    ['Click left margin', 'Toggle breakpoint'],
                  ].map(([k, v]) => (
                    <tr key={k}>
                      <td>
                        <b>{k}</b>
                      </td>
                      <td>{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="dim">Supported HAL: GPIO, EXTI, RCC, ADC (poll/IT), TIM (base/PWM/IT), UART (poll/IT), printf via __io_putchar/_write.</p>
            </div>
            <div className="dlg-buttons">
              <button className="primary" onClick={() => setAbout(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
