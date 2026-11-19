/// <reference lib="webworker" />
// Web Worker hosting the simulator, paced to real time.
import { Simulator } from './simulator';
import type { FromWorker, ToWorker } from './protocol';

const sim = new Simulator();
let active = false; // a program is loaded and not stopped
let speed = 1;
let wallStart = 0;
let simStart = 0;
let lastSnap = 0;
let watches: string[] = [];
let tracePins: string[] = [];
let realtime = 1;
let rtWall = 0;
let rtSim = 0;
let scheduled = false;

const post = (m: FromWorker) => (self as unknown as Worker).postMessage(m);
const channel = new MessageChannel();
channel.port1.onmessage = () => {
  scheduled = false;
  loop();
};
function schedule(delay = 0) {
  if (scheduled) return;
  scheduled = true;
  if (delay > 0) setTimeout(() => {
    scheduled = false;
    loop();
  }, delay);
  else channel.port2.postMessage(0);
}

function resync() {
  wallStart = performance.now();
  simStart = sim.mcu.now();
  rtWall = wallStart;
  rtSim = simStart;
}

function evalWatches() {
  return watches.map((w) => sim.evalExpr(w));
}

function traceData() {
  if (!tracePins.length) return undefined;
  const out: Record<string, [number, number][]> = {};
  for (const p of tracePins) out[p] = (sim.mcu.traces.get(p) ?? []).slice(-1500);
  return out;
}

function sendSnapshot() {
  const snap = sim.snapshot();
  post({ type: 'snapshot', snap, realtime, watches: evalWatches(), traces: traceData() });
}

function sendPaused() {
  const snap = sim.snapshot();
  post({ type: 'paused', state: sim.pauseState(), snap, watches: evalWatches(), globals: sim.globals() });
}

function loop() {
  if (!active) return;
  if (sim.status !== 'running') {
    sendSnapshot();
    return;
  }
  const t0 = performance.now();
  const targetT = simStart + ((t0 - wallStart) / 1000) * speed;
  let ran = false;
  while (sim.status === 'running' && performance.now() - t0 < 14) {
    const now = sim.mcu.now();
    if (now >= targetT) break;
    const dt = Math.min(targetT - now, 0.002);
    sim.runSlice(Math.max(200, dt * sim.mcu.sysclk()));
    ran = true;
  }
  const wall = performance.now();
  // real-time factor (smoothed)
  if (wall - rtWall > 500) {
    realtime = (sim.mcu.now() - rtSim) / ((wall - rtWall) / 1000) / speed;
    rtWall = wall;
    rtSim = sim.mcu.now();
  }
  // if we fell far behind, don't try to catch up
  if (targetT - sim.mcu.now() > 0.2 * speed) {
    simStart = sim.mcu.now();
    wallStart = wall;
  }
  if ((sim.status as string) === 'paused') {
    sendPaused();
    return;
  }
  if (wall - lastSnap > 33 || sim.status !== 'running') {
    lastSnap = wall;
    sendSnapshot();
  }
  if (sim.status !== 'running') return;
  // ahead of real time? sleep a little
  const ahead = sim.mcu.now() - (simStart + ((performance.now() - wallStart) / 1000) * speed);
  schedule(ran && ahead > 0.004 ? Math.min(15, (ahead * 1000) / speed) : ahead > 0.001 ? 2 : 0);
}

self.onmessage = (e: MessageEvent<ToWorker>) => {
  const m = e.data;
  switch (m.type) {
    case 'load':
      sim.setParts(m.parts);
      sim.board.setInputs(m.inputs);
      sim.load(m.program, m.settings);
      sim.setBreakpoints(m.breakpoints);
      active = true;
      realtime = 1;
      resync();
      if (m.startPaused) sim.stepMode('into');
      schedule();
      break;
    case 'pause':
      sim.requestPause();
      schedule();
      break;
    case 'resume':
      sim.resume();
      resync();
      schedule();
      break;
    case 'step':
      sim.stepMode(m.mode);
      resync();
      schedule();
      break;
    case 'stop':
      active = false;
      sim.status = 'idle';
      post({ type: 'stopped' });
      break;
    case 'reset':
      sim.reset();
      resync();
      schedule();
      break;
    case 'inputs':
      sim.setInputs(m.inputs);
      if (sim.status !== 'running') sendSnapshot();
      break;
    case 'parts':
      sim.setParts(m.parts);
      sendSnapshot();
      break;
    case 'uart':
      sim.uartInput(m.bytes);
      break;
    case 'breakpoints':
      sim.setBreakpoints(m.list);
      break;
    case 'speed':
      speed = m.value;
      resync();
      break;
    case 'watch':
      watches = m.exprs;
      if (sim.status === 'paused') sendPaused();
      break;
    case 'traces':
      tracePins = m.pins;
      break;
  }
};
