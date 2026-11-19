import { useEffect, useState } from 'react';
import { useStore, getProject } from '../store/store';
import { Home } from './Home';
import { PinoutConfig } from './PinoutConfig';
import { ClockConfig } from './ClockConfig';
import { ProjectManager } from './ProjectManager';
import { clockTree, pinStatus, MxConfig } from './model';
import { regenPreview } from '../project/project';
import { generateFromMx, openFile, setParts, defaultParts } from '../app/controller';
import { genIoc } from './codegen';
import { updateProject } from '../store/store';
import './mx.css';

type GenStage = null | { kind: 'name' } | { kind: 'lost'; lost: Record<string, string[]>; warnings: string[] } | { kind: 'warn'; warnings: string[] } | { kind: 'progress' } | { kind: 'done'; projectId: string; name: string } | { kind: 'clockerr' };

function configWarnings(c: MxConfig): string[] {
  const w: string[] = [];
  for (const pin of Object.keys(c.pins)) {
    if (pinStatus(c, pin) === 'partial') w.push(`${pin}: signal ${c.pins[pin].signal} is assigned but its peripheral mode is not configured (pin shown in orange).`);
  }
  if (c.usart2.mode === 'Asynchronous' && (!Object.values(c.pins).some((p) => p.signal === 'USART2_TX') || !Object.values(c.pins).some((p) => p.signal === 'USART2_RX'))) w.push('USART2: TX/RX pins are not both assigned.');
  return w;
}

export function CubeMX() {
  const page = useStore((s) => s.mxPage);
  const tab = useStore((s) => s.mxTab);
  const cfg = useStore((s) => s.mxConfig);
  const projectId = useStore((s) => s.mxProjectId);
  const dirty = useStore((s) => s.mxDirty);
  const set = useStore((s) => s.set);
  const app = useStore((s) => s.app);
  const [gen, setGen] = useState<GenStage>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const project = getProject(projectId);

  const startGenerate = () => {
    if (!cfg) return;
    if (!cfg.name || cfg.name === 'Untitled' || !/^[A-Za-z_][\w-]*$/.test(cfg.name)) {
      setGen({ kind: 'name' });
      set({ mxTab: 'project' });
      return;
    }
    if (clockTree(cfg.clock).errors.length) {
      setGen({ kind: 'clockerr' });
      return;
    }
    const warnings = configWarnings(cfg);
    if (project) {
      const rep = regenPreview(project, cfg);
      if (Object.keys(rep.lost).length) {
        setGen({ kind: 'lost', lost: rep.lost, warnings });
        return;
      }
    }
    if (warnings.length) {
      setGen({ kind: 'warn', warnings });
      return;
    }
    doGenerate();
  };

  const doGenerate = () => {
    if (!cfg) return;
    setGen({ kind: 'progress' });
    setTimeout(() => {
      const p = generateFromMx(cfg);
      if (!project) setParts({ ...defaultParts(), ...p.parts });
      setGen({ kind: 'done', projectId: p.id, name: p.name });
    }, 700);
  };

  const save = () => {
    if (!cfg || !project) return;
    updateProject(project.id, (p) => ({ ...p, mx: cfg, files: { ...p.files, [`${p.name}.ioc`]: genIoc({ ...cfg, name: p.name }) } }));
    set({ mxDirty: false });
  };

  useEffect(() => {
    if (app !== 'mx') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const title = cfg ? `${dirty ? '*' : ''}${project ? project.name + '.ioc' : 'Untitled'}: STM32F401RETx${cfg.board ? ` ${cfg.board}` : ''}` : '';

  return (
    <div className="mx" onClick={() => setMenu(null)}>
      <div className="mx-header">
        <div className="mx-logo">
          <span className="cube">◆</span>
          <span>
            STM32<b>CubeMX</b>
          </span>
        </div>
        <div className="mx-menus" onClick={(e) => e.stopPropagation()}>
          {['File', 'Window', 'Help'].map((m) => (
            <div key={m} className={`mx-menu ${menu === m ? 'open' : ''}`} onClick={() => setMenu(menu === m ? null : m)}>
              {m}
              {menu === m && m === 'File' && (
                <div className="mx-dropdown">
                  <div onClick={() => (setMenu(null), set({ mxPage: 'home', mxConfig: null, mxProjectId: null }))}>New Project…</div>
                  <div onClick={() => (setMenu(null), set({ mxPage: 'home' }))}>Load Project…</div>
                  <div className={!project ? 'disabled' : ''} onClick={() => (setMenu(null), save())}>
                    Save Project <span>Ctrl+S</span>
                  </div>
                  <div onClick={() => (setMenu(null), set({ mxPage: 'home', mxConfig: null, mxProjectId: null }))}>Close Project</div>
                </div>
              )}
              {menu === m && m === 'Window' && (
                <div className="mx-dropdown">
                  <div onClick={() => (setMenu(null), set({ app: 'ide' }))}>Switch to STM32CubeIDE</div>
                </div>
              )}
              {menu === m && m === 'Help' && (
                <div className="mx-dropdown">
                  <div onClick={() => setMenu(null)}>
                    Configure pins in <b>Pinout & Configuration</b>, set clocks, then <b>GENERATE CODE</b>.
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="mx-title">{title}</div>
        <div className="mx-social">
          <span title="ST">ST</span>
        </div>
      </div>
      {page === 'home' || !cfg ? (
        <Home />
      ) : (
        <>
          <div className="mx-crumbs">
            <span className="crumb" onClick={() => set({ mxPage: 'home' })}>
              Home
            </span>
            <span className="crumb">STM32F401RETx{cfg.board ? ` - ${cfg.board}` : ''}</span>
            <span className="crumb active">
              {project ? project.name : 'Untitled'}.ioc - {{ pinout: 'Pinout & Configuration', clock: 'Clock Configuration', project: 'Project Manager', tools: 'Tools' }[tab]}
            </span>
            <span className="spacer" />
            <button className="gen-btn" onClick={startGenerate}>
              GENERATE CODE
            </button>
          </div>
          <div className="mx-tabs">
            {(['pinout', 'clock', 'project', 'tools'] as const).map((t) => (
              <div key={t} className={`mx-tab ${tab === t ? 'active' : ''} ${t === 'tools' ? 'disabled' : ''}`} onClick={() => t !== 'tools' && set({ mxTab: t })}>
                {{ pinout: 'Pinout & Configuration', clock: 'Clock Configuration', project: 'Project Manager', tools: 'Tools' }[t]}
              </div>
            ))}
          </div>
          <div className="mx-body">
            {tab === 'pinout' && <PinoutConfig />}
            {tab === 'clock' && <ClockConfig />}
            {tab === 'project' && <ProjectManager />}
          </div>
        </>
      )}

      {gen && (
        <div className="modal-backdrop">
          <div className="mx-dlg">
            {gen.kind === 'name' && (
              <>
                <div className="mx-dlg-title">Project Settings</div>
                <div className="mx-dlg-body">Please set a valid Project Name (letters, digits, '_' or '-') in the Project Manager tab before generating code.</div>
                <div className="mx-dlg-btns">
                  <button onClick={() => setGen(null)}>OK</button>
                </div>
              </>
            )}
            {gen.kind === 'clockerr' && (
              <>
                <div className="mx-dlg-title">Clock Configuration</div>
                <div className="mx-dlg-body">The clock configuration has errors (fields shown in red in Clock Configuration). Fix them before generating code.</div>
                <div className="mx-dlg-btns">
                  <button onClick={() => (setGen(null), set({ mxTab: 'clock' }))}>Go to Clock Configuration</button>
                  <button onClick={() => setGen(null)}>Cancel</button>
                </div>
              </>
            )}
            {(gen.kind === 'lost' || gen.kind === 'warn') && (
              <>
                <div className="mx-dlg-title">{gen.kind === 'lost' ? 'Code outside USER CODE sections will be lost' : 'Warnings'}</div>
                <div className="mx-dlg-body">
                  {gen.kind === 'lost' && (
                    <>
                      <p>
                        CubeMX only keeps code written <b>between</b> <code>/* USER CODE BEGIN … */</code> and <code>/* USER CODE END … */</code> comments. These lines are outside those sections and
                        will be removed when the code is regenerated:
                      </p>
                      {Object.entries(gen.lost).map(([f, lines]) => (
                        <div key={f} className="lost-block">
                          <b>{f}</b>
                          <pre>{lines.slice(0, 40).join('\n') + (lines.length > 40 ? `\n… ${lines.length - 40} more` : '')}</pre>
                        </div>
                      ))}
                      <p className="dim">Tip: move your code into the matching USER CODE sections (e.g. USER CODE BEGIN 3 inside the while loop) so it survives regeneration.</p>
                    </>
                  )}
                  {gen.warnings.length > 0 && (
                    <>
                      <p>The configuration has warnings:</p>
                      <ul>
                        {gen.warnings.map((w) => (
                          <li key={w}>{w}</li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
                <div className="mx-dlg-btns">
                  <button className="primary" onClick={doGenerate}>
                    {gen.kind === 'lost' ? 'Generate anyway' : 'Yes, continue'}
                  </button>
                  <button onClick={() => setGen(null)}>Cancel</button>
                </div>
              </>
            )}
            {gen.kind === 'progress' && (
              <>
                <div className="mx-dlg-title">Code Generation</div>
                <div className="mx-dlg-body">
                  Generating code for STM32F401RETx…
                  <div className="progress">
                    <div className="bar" />
                  </div>
                </div>
              </>
            )}
            {gen.kind === 'done' && (
              <>
                <div className="mx-dlg-title">Code Generation</div>
                <div className="mx-dlg-body">
                  <p>The Code is successfully generated under :</p>
                  <p>
                    <code>~/STM32CubeIDE/workspace_1.19.0/{gen.name}</code>
                  </p>
                  <p className="dim">Project language : C</p>
                </div>
                <div className="mx-dlg-btns">
                  <button disabled>Open Folder</button>
                  <button
                    className="primary"
                    onClick={() => {
                      setGen(null);
                      openFile({ projectId: gen.projectId, path: 'Core/Src/main.c' });
                    }}
                  >
                    Open Project
                  </button>
                  <button onClick={() => setGen(null)}>Close</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
