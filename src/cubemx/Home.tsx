import { useState } from 'react';
import { useStore } from '../store/store';
import { defaultConfig, nucleoDefaults, MxConfig } from './model';
import { EXAMPLES } from '../examples';
import { openExample, openInMx } from '../app/controller';

const MCUS = [
  { part: 'STM32F401RETx', pkg: 'LQFP64', flash: '512 kBytes', ram: '96 kBytes', freq: '84 MHz', ok: true },
  { part: 'STM32F401RBTx', pkg: 'LQFP64', flash: '128 kBytes', ram: '64 kBytes', freq: '84 MHz', ok: false },
  { part: 'STM32F411RETx', pkg: 'LQFP64', flash: '512 kBytes', ram: '128 kBytes', freq: '100 MHz', ok: false },
  { part: 'STM32F446RETx', pkg: 'LQFP64', flash: '512 kBytes', ram: '128 kBytes', freq: '180 MHz', ok: false },
  { part: 'STM32F103RBTx', pkg: 'LQFP64', flash: '128 kBytes', ram: '20 kBytes', freq: '72 MHz', ok: false },
];
const BOARDS = [
  { name: 'NUCLEO-F401RE', mcu: 'STM32F401RETx', type: 'Nucleo64', ok: true },
  { name: 'NUCLEO-F411RE', mcu: 'STM32F411RETx', type: 'Nucleo64', ok: false },
  { name: 'NUCLEO-F446RE', mcu: 'STM32F446RETx', type: 'Nucleo64', ok: false },
  { name: 'NUCLEO-G071RB', mcu: 'STM32G071RBTx', type: 'Nucleo64', ok: false },
];

export function Home() {
  const set = useStore((s) => s.set);
  const projects = useStore((s) => s.projects);
  const [sel, setSel] = useState<null | 'mcu' | 'board' | 'example'>(null);
  const [pick, setPick] = useState<string>('STM32F401RETx');
  const [query, setQuery] = useState('STM32F401RE');
  const [ask, setAsk] = useState(false);

  const start = (cfg: MxConfig) => set({ mxPage: 'project', mxTab: 'pinout', mxConfig: cfg, mxProjectId: null, mxDirty: true, mxCategory: null });

  return (
    <div className="mx-home">
      <div className="home-col">
        <div className="home-box">
          <div className="home-box-title">Existing Projects</div>
          <div className="home-box-body">
            <div className="dim">Recent Opened Projects</div>
            {projects.length === 0 && <div className="dim" style={{ marginTop: 8 }}>No projects yet.</div>}
            {[...projects].reverse().map((p) => (
              <div key={p.id} className="recent" onClick={() => openInMx(p.id)}>
                <span className="ioc-ico">MX</span> {p.name}.ioc
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="home-col wide">
        <div className="home-box">
          <div className="home-box-title">New Project</div>
          <div className="home-box-body">
            <div className="np-title">I need to :</div>
            <div className="np-row">
              <span>Start My project from MCU</span>
              <button className="np-btn" onClick={() => setSel('mcu')}>
                ACCESS TO MCU SELECTOR
              </button>
            </div>
            <div className="np-row">
              <span>Start My project from ST Board</span>
              <button className="np-btn" onClick={() => setSel('board')}>
                ACCESS TO BOARD SELECTOR
              </button>
            </div>
            <div className="np-row">
              <span>Start My project from a Lab Experiment</span>
              <button className="np-btn" onClick={() => setSel('example')}>
                ACCESS TO LAB EXPERIMENTS
              </button>
            </div>
          </div>
        </div>
        <div className="home-box">
          <div className="home-box-title">About this simulator</div>
          <div className="home-box-body dim" style={{ lineHeight: 1.6 }}>
            This STM32CubeMX look-alike supports the <b>STM32F401RETx</b> (NUCLEO-F401RE) used in the lab: GPIO / EXTI, ADC1, TIM1–TIM5/TIM9–TIM11 (PWM), USART2 and the clock tree.
            Generated code opens in the STM32CubeIDE look-alike, where it runs on the simulated carrier board.
          </div>
        </div>
      </div>

      {sel && (
        <div className="modal-backdrop">
          <div className="selector">
            <div className="sel-head">
              <div className="sel-tabs">
                <span className={sel === 'mcu' ? 'on' : ''} onClick={() => setSel('mcu')}>
                  MCU/MPU Selector
                </span>
                <span className={sel === 'board' ? 'on' : ''} onClick={() => setSel('board')}>
                  Board Selector
                </span>
                <span className={sel === 'example' ? 'on' : ''} onClick={() => setSel('example')}>
                  Lab Experiments
                </span>
              </div>
              <span className="x" onClick={() => setSel(null)}>
                ✕
              </span>
            </div>
            <div className="sel-body">
              {sel !== 'example' && (
                <div className="sel-filter">
                  <b>{sel === 'mcu' ? 'Commercial Part Number' : 'Commercial Part Number'}</b>
                  <input value={query} onChange={(e) => setQuery(e.target.value)} />
                  <div className="dim" style={{ marginTop: 10 }}>
                    Only the STM32F401RE is available in this simulator.
                  </div>
                </div>
              )}
              <div className="sel-list">
                {sel === 'mcu' && (
                  <table className="mx-table">
                    <thead>
                      <tr>
                        <th>Commercial Part No</th>
                        <th>Package</th>
                        <th>Flash</th>
                        <th>RAM</th>
                        <th>Freq.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {MCUS.filter((m) => m.part.toLowerCase().includes(query.toLowerCase().slice(0, 9))).map((m) => (
                        <tr key={m.part} className={`${pick === m.part ? 'sel' : ''} ${m.ok ? '' : 'disabled'}`} onClick={() => m.ok && setPick(m.part)} onDoubleClick={() => m.ok && (setSel(null), start(defaultConfig('Untitled')))}>
                          <td>{m.part}</td>
                          <td>{m.pkg}</td>
                          <td>{m.flash}</td>
                          <td>{m.ram}</td>
                          <td>{m.freq}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {sel === 'board' && (
                  <div className="board-grid">
                    {BOARDS.map((b) => (
                      <div key={b.name} className={`board-card ${b.ok ? '' : 'disabled'} ${pick === b.name ? 'sel' : ''}`} onClick={() => b.ok && setPick(b.name)}>
                        <div className="board-img">
                          <div className="nucleo-mini">
                            <div className="st" />
                            <div className="mcu" />
                          </div>
                        </div>
                        <b>{b.name}</b>
                        <span className="dim">
                          {b.type} · {b.mcu}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {sel === 'example' && (
                  <div className="ex-list">
                    {EXAMPLES.map((ex) => (
                      <div key={ex.id} className="ex-row">
                        <div>
                          <b>{ex.title}</b>
                          <div className="dim">{ex.description}</div>
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            className="np-btn small"
                            onClick={() => {
                              setSel(null);
                              openExample(ex, 'mx');
                            }}
                          >
                            Open in CubeMX
                          </button>
                          <button
                            className="np-btn small"
                            onClick={() => {
                              setSel(null);
                              openExample(ex, 'ide');
                            }}
                          >
                            Open in CubeIDE
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {sel !== 'example' && (
              <div className="sel-foot">
                <span className="dim">{sel === 'mcu' ? 'STM32F401RETx — Arm Cortex-M4 MCU with FPU, 84 MHz, 512 KB Flash, 96 KB RAM' : 'NUCLEO-F401RE — STM32 Nucleo-64 development board with STM32F401RE MCU'}</span>
                <button
                  className="np-btn"
                  onClick={() => {
                    if (sel === 'mcu') {
                      setSel(null);
                      start(defaultConfig('Untitled'));
                    } else {
                      setSel(null);
                      setAsk(true);
                    }
                  }}
                >
                  Start Project
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      {ask && (
        <div className="modal-backdrop">
          <div className="mx-dlg">
            <div className="mx-dlg-title">Board Project Options:</div>
            <div className="mx-dlg-body">Initialize all peripherals with their default Mode ?</div>
            <div className="mx-dlg-btns">
              <button
                className="primary"
                onClick={() => {
                  setAsk(false);
                  start(nucleoDefaults('Untitled'));
                }}
              >
                Yes
              </button>
              <button
                onClick={() => {
                  setAsk(false);
                  start(defaultConfig('Untitled', 'NUCLEO-F401RE'));
                }}
              >
                No
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
