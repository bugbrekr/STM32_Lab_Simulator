import { useEffect } from 'react';
import { useStore } from '../store/store';
import { CubeMX } from '../cubemx/CubeMX';
import { CubeIDE } from '../cubeide/CubeIDE';
import { initController } from './controller';

export function App() {
  const app = useStore((s) => s.app);
  const set = useStore((s) => s.set);
  const simActive = useStore((s) => s.sim.active);
  const status = useStore((s) => s.sim.status);
  useEffect(() => {
    initController();
  }, []);
  return (
    <div className="shell">
      <div className="taskbar">
        <span className="brand">STM32 Lab Simulator</span>
        <div className={`task ${app === 'mx' ? 'active' : ''}`} onClick={() => set({ app: 'mx' })}>
          <span className="ico" style={{ background: '#03234b' }}>
            MX
          </span>
          STM32CubeMX
        </div>
        <div className={`task ${app === 'ide' ? 'active' : ''}`} onClick={() => set({ app: 'ide' })}>
          <span className="ico" style={{ background: '#3cb4e6' }}>
            IDE
          </span>
          STM32CubeIDE
        </div>
        <span className="spacer" />
        <span className="hint">{simActive ? `Target: NUCLEO-F401RE — ${status}` : 'Target: NUCLEO-F401RE (connected via ST-LINK)'}</span>
      </div>
      <div className="app-host">
        <div className="app" style={{ display: app === 'mx' ? 'block' : 'none' }}>
          <CubeMX />
        </div>
        <div className="app" style={{ display: app === 'ide' ? 'block' : 'none' }}>
          <CubeIDE />
        </div>
      </div>
    </div>
  );
}
