import { useState } from 'react';
import { useMx } from './PinoutConfig';
import { useStore, getProject } from '../store/store';

export function ProjectManager() {
  const [cfg, up] = useMx();
  const projectId = useStore((s) => s.mxProjectId);
  const project = getProject(projectId);
  const [tab, setTab] = useState<'project' | 'codegen' | 'advanced'>('project');
  const nameOk = /^[A-Za-z_][\w-]*$/.test(cfg.name) && cfg.name !== 'Untitled';
  return (
    <div className="pm-page">
      <div className="pm-side">
        {(['project', 'codegen', 'advanced'] as const).map((t) => (
          <div key={t} className={`pm-side-item ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>
            {{ project: 'Project', codegen: 'Code Generator', advanced: 'Advanced Settings' }[t]}
          </div>
        ))}
      </div>
      <div className="pm-main">
        {tab === 'project' && (
          <>
            <div className="pm-group">
              <div className="pm-group-title">Project Settings</div>
              <div className="pm-row">
                <label>Project Name</label>
                <input className={nameOk ? '' : 'bad'} value={cfg.name} disabled={!!project} onChange={(e) => up((c) => ({ ...c, name: e.target.value.replace(/\s/g, '_') }))} />
                {project && <span className="dim">(project already generated — name is fixed)</span>}
              </div>
              <div className="pm-row">
                <label>Project Location</label>
                <input disabled value="~/STM32CubeIDE/workspace_1.19.0" />
                <button disabled>Browse</button>
              </div>
              <div className="pm-row">
                <label>Application Structure</label>
                <select disabled>
                  <option>Advanced</option>
                </select>
                <label className="inline">
                  <input type="checkbox" disabled /> Do not generate the main()
                </label>
              </div>
              <div className="pm-row">
                <label>Toolchain Folder Location</label>
                <input disabled value={`~/STM32CubeIDE/workspace_1.19.0/${cfg.name}/`} />
              </div>
              <div className="pm-row">
                <label>Toolchain / IDE</label>
                <select value="STM32CubeIDE" disabled>
                  <option>STM32CubeIDE</option>
                </select>
                <label className="inline">
                  <input type="checkbox" checked disabled /> Generate Under Root
                </label>
              </div>
            </div>
            <div className="pm-group">
              <div className="pm-group-title">Linker Settings</div>
              <div className="pm-row">
                <label>Minimum Heap Size</label>
                <input disabled value="0x200" />
              </div>
              <div className="pm-row">
                <label>Minimum Stack Size</label>
                <input disabled value="0x400" />
              </div>
            </div>
            <div className="pm-group">
              <div className="pm-group-title">Mcu and Firmware Package</div>
              <div className="pm-row">
                <label>Mcu Reference</label>
                <input disabled value="STM32F401RETx" />
              </div>
              <div className="pm-row">
                <label>Firmware Package Name and Version</label>
                <input disabled value="STM32Cube FW_F4 V1.28.1" />
              </div>
            </div>
          </>
        )}
        {tab === 'codegen' && (
          <div className="pm-group">
            <div className="pm-group-title">STM32Cube MCU packages and embedded software packs</div>
            <label className="pm-chk">
              <input type="radio" disabled /> Copy all used libraries into the project folder
            </label>
            <label className="pm-chk">
              <input type="radio" checked disabled /> Copy only the necessary library files
            </label>
            <div className="pm-group-title">Generated files</div>
            <label className="pm-chk">
              <input type="checkbox" disabled /> Generate peripheral initialization as a pair of '.c/.h' files per peripheral
            </label>
            <label className="pm-chk">
              <input type="checkbox" disabled /> Backup previously generated files when re-generating
            </label>
            <label className="pm-chk">
              <input type="checkbox" checked disabled /> Keep User Code when re-generating
            </label>
            <label className="pm-chk">
              <input type="checkbox" checked disabled /> Delete previously generated files when not re-generated
            </label>
            <p className="dim">“Keep User Code” keeps only the code written between USER CODE BEGIN / USER CODE END comments.</p>
          </div>
        )}
        {tab === 'advanced' && (
          <div className="pm-group">
            <div className="pm-group-title">Driver Selector</div>
            <table className="mx-table small">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Function Name</th>
                  <th>Peripheral Instance Name</th>
                  <th>Driver</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>1</td>
                  <td>SystemClock_Config</td>
                  <td>RCC</td>
                  <td>HAL</td>
                </tr>
                <tr>
                  <td>2</td>
                  <td>MX_GPIO_Init</td>
                  <td>GPIO</td>
                  <td>HAL</td>
                </tr>
                {cfg.order.map((p, i) => (
                  <tr key={p}>
                    <td>{i + 3}</td>
                    <td>{p === 'USART2' ? 'MX_USART2_UART_Init' : `MX_${p}_Init`}</td>
                    <td>{p}</td>
                    <td>HAL</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
