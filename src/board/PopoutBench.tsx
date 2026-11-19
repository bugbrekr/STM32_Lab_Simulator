import { useEffect, useState } from 'react';
import { BenchPanel } from './BenchPanel';
import type { BoardInputs, PartsConfig } from '../sim/board/board';
import type { SimSnapshot } from '../sim/simulator';

/** Bench in its own window; mirrors the main window via BroadcastChannel. */
export function PopoutBench() {
  const [snap, setSnap] = useState<SimSnapshot | null>(null);
  const [inputs, setInputs] = useState<BoardInputs>({ sw1: false, sw2: false, b1: false, light: 50, tempC: 25, power: true });
  const [parts, setParts] = useState<PartsConfig>({ motor1: false, motor2: false, stepper: false, servo1: false, servo2: false, pt100: false });
  const [status, setStatus] = useState('idle');
  const [ch] = useState(() => new BroadcastChannel('stm32sim-board'));
  useEffect(() => {
    document.title = 'Lab Bench — STM32 Simulator';
    ch.onmessage = (e) => {
      const d = e.data;
      if (d?.type === 'snap') {
        setSnap(d.snap);
        setStatus(d.status);
        setInputs(d.inputs);
        setParts(d.parts);
      }
      if (d?.type === 'state') {
        setInputs(d.inputs);
        setParts(d.parts);
        if (d.snap) setSnap(d.snap);
      }
    };
    ch.postMessage({ type: 'hello' });
    return () => ch.close();
  }, [ch]);
  const active = !!snap && status !== 'idle';
  return (
    <div style={{ height: '100vh' }}>
      <BenchPanel
        snap={snap}
        status={status}
        statusText={snap?.statusText ?? ''}
        inputs={inputs}
        parts={parts}
        active={active}
        onInputs={(p) => {
          setInputs((s) => ({ ...s, ...p }));
          ch.postMessage({ type: 'inputs', inputs: p });
        }}
        onParts={(p) => {
          setParts((s) => ({ ...s, ...p }));
          ch.postMessage({ type: 'parts', parts: p });
        }}
        onReset={() => ch.postMessage({ type: 'reset' })}
      />
    </div>
  );
}
