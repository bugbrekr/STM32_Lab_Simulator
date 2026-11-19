import React from 'react';
import { BoardView } from './BoardView';
import type { BoardInputs, PartsConfig } from '../sim/board/board';
import type { SimSnapshot } from '../sim/simulator';

const DRAWER: { kind: string; label: string; keys: (keyof PartsConfig)[]; icon: string }[] = [
  { kind: 'dc', label: 'DC motor', keys: ['motor1', 'motor2'], icon: '⚙' },
  { kind: 'stepper', label: 'Stepper', keys: ['stepper'], icon: '◼' },
  { kind: 'servo', label: 'Servo', keys: ['servo2', 'servo1'], icon: '◧' },
  { kind: 'pt100', label: 'PT100', keys: ['pt100'], icon: '🌡' },
];

const SLOT_NAMES: Record<keyof PartsConfig, string> = {
  motor1: 'MOTOR1',
  motor2: 'MOTOR2',
  stepper: 'STEPPER',
  servo1: 'Servo PB3',
  servo2: 'Servo PA10',
  pt100: 'TEMP (PA0)',
};

export interface BenchProps {
  snap: SimSnapshot | null;
  status: string;
  statusText: string;
  inputs: BoardInputs;
  parts: PartsConfig;
  active: boolean;
  flashing?: boolean;
  realtime?: number;
  speed?: number;
  onInputs: (p: Partial<BoardInputs>) => void;
  onParts: (p: Partial<PartsConfig>) => void;
  onReset?: () => void;
  onSpeed?: (v: number) => void;
  onPopout?: () => void;
  onHide?: () => void;
}

function fmtTime(t: number) {
  if (t < 60) return t.toFixed(3) + ' s';
  const m = Math.floor(t / 60);
  return `${m}:${(t - m * 60).toFixed(1).padStart(4, '0')}`;
}

export function BenchPanel(p: BenchProps) {
  const { snap, inputs, parts } = p;
  const running = p.active && !!snap;
  const statusCls = p.active ? p.status : 'idle';
  const label = !p.active ? (p.flashing ? 'FLASHING' : 'NOT RUNNING') : p.status.toUpperCase();
  return (
    <div className="bench">
      <div className="bench-top">
        <span className="title">Lab Bench — NUCLEO-F401RE + Carrier</span>
        <span className={`bench-status ${statusCls}`}>{label}</span>
        {running && snap && (
          <span style={{ opacity: 0.8 }}>
            t = {fmtTime(snap.t)} · {(snap.sysclk / 1e6).toFixed(0)} MHz{p.realtime !== undefined ? ` · ${(p.realtime * 100).toFixed(0)}% real-time` : ''}
          </span>
        )}
        <span className="spacer" />
        {p.onSpeed && (
          <label title="Simulation speed">
            Speed{' '}
            <select value={p.speed ?? 1} onChange={(e) => p.onSpeed!(Number(e.target.value))}>
              {[0.1, 0.25, 0.5, 1, 2, 5, 10].map((v) => (
                <option key={v} value={v}>
                  {v}×
                </option>
              ))}
            </select>
          </label>
        )}
        {p.onPopout && (
          <button onClick={p.onPopout} title="Open the bench in a separate window">
            ⧉ Pop out
          </button>
        )}
        {p.onHide && (
          <button onClick={p.onHide} title="Hide bench">
            ✕
          </button>
        )}
      </div>
      <div className="bench-canvas">
        <BoardView snap={running ? snap : null} inputs={inputs} parts={parts} running={running} flashing={p.flashing} onInputs={p.onInputs} onParts={p.onParts} onReset={p.onReset} />
      </div>
      {p.statusText && <div className={`bench-status-text ${p.status === 'fault' ? '' : 'info'}`}>{p.statusText}</div>}
      <div className="bench-controls">
        <label title="Light falling on the LDR (PA1)">
          ☀ Light
          <input type="range" min={0} max={100} value={inputs.light} onChange={(e) => p.onInputs({ light: Number(e.target.value) })} />
          <span style={{ width: 70 }}>{(0.1 * Math.pow(10, (inputs.light / 100) * 5)).toFixed(inputs.light < 20 ? 1 : 0)} lux</span>
        </label>
        <label title="Temperature at the PT100 probe (PA0)">
          🌡 PT100
          <input type="range" min={-20} max={150} step={0.5} value={inputs.tempC} onChange={(e) => p.onInputs({ tempC: Number(e.target.value) })} />
          <span style={{ width: 54 }}>{inputs.tempC.toFixed(1)} °C</span>
        </label>
        <label>
          <button onMouseDown={() => p.onInputs({ sw1: true })} onMouseUp={() => p.onInputs({ sw1: false })} onMouseLeave={() => inputs.sw1 && p.onInputs({ sw1: false })}>
            SW1 (PB13)
          </button>
          <button onMouseDown={() => p.onInputs({ sw2: true })} onMouseUp={() => p.onInputs({ sw2: false })} onMouseLeave={() => inputs.sw2 && p.onInputs({ sw2: false })}>
            SW2 (PB14)
          </button>
          <button onMouseDown={() => p.onInputs({ b1: true })} onMouseUp={() => p.onInputs({ b1: false })} onMouseLeave={() => inputs.b1 && p.onInputs({ b1: false })}>
            B1 USER
          </button>
          {p.onReset && <button onClick={p.onReset}>RESET</button>}
        </label>
        <label>
          <input type="checkbox" checked={inputs.power} onChange={(e) => p.onInputs({ power: e.target.checked })} />
          Carrier power (12 V / 6.5 V / 5 V)
        </label>
        <div className="drawer">
          <span style={{ opacity: 0.75 }}>Parts (drag onto the board, or click to attach):</span>
          {DRAWER.map((d) =>
            d.keys.map((k) => (
              <span
                key={k}
                className={`chipbtn ${parts[k] ? 'on' : ''}`}
                draggable={!parts[k]}
                onDragStart={(e) => {
                  e.dataTransfer.setData(`part/${d.kind}`, k);
                  e.dataTransfer.effectAllowed = 'copy';
                }}
                onClick={() => p.onParts({ [k]: !parts[k] })}
                title={parts[k] ? `Connected to ${SLOT_NAMES[k]} — click to disconnect` : `Connect a ${d.label} to ${SLOT_NAMES[k]}`}
              >
                {d.icon} {d.label} → {SLOT_NAMES[k]} {parts[k] ? '✓' : ''}
              </span>
            )),
          )}
        </div>
      </div>
    </div>
  );
}

export default React.memo(BenchPanel);
