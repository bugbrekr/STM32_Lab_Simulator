// Glue between UI, project store and the simulator worker.
import { useStore, getProject, updateProject, ConsoleLine, FileRef } from '../store/store';
import { buildProject, Project, projectFromExample, newProjectFromConfig, regenerate } from '../project/project';
import type { FromWorker, ToWorker } from '../sim/protocol';
import { decodeUart, bytesToText, RxState } from './uartDecode';
import type { Example } from '../examples';
import type { BoardInputs, PartsConfig } from '../sim/board/board';
import type { MxConfig } from '../cubemx/model';
import type { LoadedProgram } from '../sim/runtime';
import type { StepMode } from '../sim/runtime';

let worker: Worker | null = null;
const rx: RxState = { busyUntil: 0 };
const bc: BroadcastChannel | null = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('stm32sim-board') : null;
let lastProgram: { projectId: string; program: LoadedProgram; stamp: string } | null = null;

const S = () => useStore.getState();
const set = (p: Parameters<ReturnType<typeof useStore.getState>['set']>[0]) => S().set(p);

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('../sim/worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e: MessageEvent<FromWorker>) => onWorker(e.data);
  return worker;
}
function send(m: ToWorker) {
  getWorker().postMessage(m);
}

// ---------------- worker events ----------------
function onWorker(m: FromWorker) {
  if (m.type === 'stopped') return;
  const snap = m.snap;
  // serial
  if (snap.uart.length) {
    const st = S();
    if (st.serial.open) {
      const bytes = decodeUart(snap.uart, st.serial.baud, rx);
      let text = st.serial.text + bytesToText(bytes);
      if (text.length > 60000) text = text.slice(text.length - 50000);
      set({ serial: { ...st.serial, text } });
    }
  }
  if (snap.warnings.length || snap.board.warnings.length) {
    appendDebug([...snap.warnings, ...snap.board.warnings].map((w) => ({ text: '⚠ ' + w, kind: 'warning' as const })));
  }
  const sim = S().sim;
  if (m.type === 'snapshot') {
    set({ sim: { ...sim, snap, status: snap.status, statusText: snap.statusText, realtime: m.realtime, watches: m.watches, pause: snap.status === 'paused' ? sim.pause : null, traces: m.traces ?? sim.traces } });
    if (snap.status === 'fault' && sim.status !== 'fault') {
      appendDebug([{ text: `✖ ${snap.statusText}${snap.location ? `  (${snap.location.fn}() at ${snap.location.file.split('/').pop()}:${snap.location.line})` : ''}`, kind: 'error', file: snap.location?.file, line: snap.location?.line }]);
      if (snap.location && sim.projectId) revealLine({ projectId: sim.projectId, path: snap.location.file }, snap.location.line);
    }
    if (snap.status === 'halted' && sim.status !== 'halted') appendDebug([{ text: snap.statusText, kind: 'warning' }]);
  } else if (m.type === 'paused') {
    set({ sim: { ...sim, snap, status: 'paused', pause: m.state, watches: m.watches, globals: m.globals } });
    if (m.state && sim.projectId) revealLine({ projectId: sim.projectId, path: m.state.file }, m.state.line);
  }
  bc?.postMessage({ type: 'snap', snap, inputs: S().inputs, parts: S().parts, status: snap.status });
}

bc &&
  (bc.onmessage = (e) => {
    const d = e.data;
    if (d?.type === 'inputs') setInputs(d.inputs);
    if (d?.type === 'parts') setParts(d.parts);
    if (d?.type === 'hello') bc.postMessage({ type: 'state', inputs: S().inputs, parts: S().parts, snap: S().sim.snap });
    if (d?.type === 'reset') resetTarget();
  });

// ---------------- console helpers ----------------
function appendBuild(lines: ConsoleLine[], clear = false) {
  set((s) => ({ buildLog: clear ? lines : [...s.buildLog, ...lines] }));
}
export function appendDebug(lines: ConsoleLine[]) {
  set((s) => {
    const all = [...s.debugLog, ...lines];
    return { debugLog: all.length > 800 ? all.slice(all.length - 600) : all };
  });
}

function ts() {
  const d = new Date();
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map((x) => String(x).padStart(2, '0')).join(':');
}

// ---------------- files ----------------
export function openFile(ref: FileRef) {
  const s = S();
  const exists = s.openFiles.some((f) => f.projectId === ref.projectId && f.path === ref.path);
  set({ openFiles: exists ? s.openFiles : [...s.openFiles, ref], activeFile: ref, activeProjectId: ref.projectId, app: 'ide' });
}

export function closeFile(ref: FileRef) {
  const s = S();
  const files = s.openFiles.filter((f) => !(f.projectId === ref.projectId && f.path === ref.path));
  const active = s.activeFile && s.activeFile.projectId === ref.projectId && s.activeFile.path === ref.path ? files[files.length - 1] ?? null : s.activeFile;
  set({ openFiles: files, activeFile: active });
}

export function revealLine(ref: FileRef, line: number) {
  const p = getProject(ref.projectId);
  if (!p || p.files[ref.path] === undefined) return;
  openFile(ref);
  set((s) => ({ revealLine: { file: ref, line, n: (s.revealLine?.n ?? 0) + 1 } }));
}

export function saveFile(ref: FileRef, content: string) {
  updateProject(ref.projectId, (p) => ({ ...p, files: { ...p.files, [ref.path]: content } }));
}

// ---------------- projects ----------------
export function addProject(p: Project) {
  set((s) => {
    // unique name
    let name = p.name;
    let i = 1;
    const names = new Set(s.projects.map((x) => x.name));
    while (names.has(name)) name = `${p.name}_${i++}`;
    const proj = name === p.name ? p : renameProject(p, name);
    return { projects: [...s.projects, proj], activeProjectId: proj.id };
  });
  return S().projects[S().projects.length - 1];
}

function renameProject(p: Project, name: string): Project {
  const cfg = { ...p.mx, name };
  const r = regenerate(p, cfg);
  return r;
}

export function openExample(ex: Example, target: 'ide' | 'mx' = 'ide') {
  const p = addProject(projectFromExample(ex));
  setParts({ ...defaultParts(), ...p.parts });
  if (target === 'ide') {
    openFile({ projectId: p.id, path: 'Core/Src/main.c' });
    set({ bottomTab: 'guide' });
  }
  else openInMx(p.id);
  return p;
}

export function deleteProject(id: string) {
  set((s) => ({
    projects: s.projects.filter((p) => p.id !== id),
    openFiles: s.openFiles.filter((f) => f.projectId !== id),
    activeFile: s.activeFile?.projectId === id ? null : s.activeFile,
    activeProjectId: s.activeProjectId === id ? null : s.activeProjectId,
  }));
  if (S().sim.projectId === id) stopTarget();
}

export function openInMx(projectId: string) {
  const p = getProject(projectId);
  if (!p) return;
  set({ app: 'mx', mxPage: 'project', mxTab: 'pinout', mxConfig: structuredClone(p.mx), mxProjectId: p.id, mxDirty: false, mxCategory: null });
}

/** Create or update the project from the current CubeMX config and open it in the IDE. */
export function generateFromMx(cfg: MxConfig): Project {
  const s = S();
  let p: Project;
  const existing = getProject(s.mxProjectId);
  if (existing) {
    p = regenerate(existing, cfg);
    updateProject(existing.id, () => p);
  } else {
    p = addProject(newProjectFromConfig(cfg));
  }
  set({ mxProjectId: p.id, mxDirty: false, mxConfig: structuredClone(p.mx) });
  // clear stale build
  if (lastProgram?.projectId === p.id) lastProgram = null;
  return p;
}

export function defaultParts(): PartsConfig {
  return { motor1: false, motor2: false, stepper: false, servo1: false, servo2: false, pt100: false };
}

// ---------------- build ----------------
export interface BuildOutcome {
  ok: boolean;
  program?: LoadedProgram;
}

function stampOf(p: Project) {
  return JSON.stringify([p.files['Core/Src/main.c'], p.files['Core/Src/stm32f4xx_hal_msp.c'], p.files['Core/Src/stm32f4xx_it.c'], p.files['Core/Inc/main.h'], p.settings]);
}

export function build(projectId: string | null = S().activeProjectId): BuildOutcome {
  const p = getProject(projectId);
  if (!p) {
    appendBuild([{ text: 'No project selected. Select a project in the Project Explorer.', kind: 'error' }], true);
    return { ok: false };
  }
  set({ consoleView: 'build', bottomTab: 'console' });
  const t0 = performance.now();
  const lines: ConsoleLine[] = [{ text: `${ts()} **** Incremental Build of configuration Debug for project ${p.name} ****`, kind: 'info' }, { text: 'make -j16 all ', kind: 'cmd' }];
  const flags = `-mcpu=cortex-m4 -std=gnu11 -g3 -DDEBUG -DUSE_HAL_DRIVER -DSTM32F401xE -c -I../Core/Inc -I../Drivers/STM32F4xx_HAL_Driver/Inc -I../Drivers/STM32F4xx_HAL_Driver/Inc/Legacy -I../Drivers/CMSIS/Device/ST/STM32F4xx/Include -I../Drivers/CMSIS/Include -O0 -ffunction-sections -fdata-sections -Wall -fstack-usage -fcyclomatic-complexity --specs=nano.specs -mfpu=fpv4-sp-d16 -mfloat-abi=hard -mthumb`;
  const r = buildProject(p);
  for (const src of r.compiled) {
    const obj = src.replace(/\.c$/, '.o');
    lines.push({ text: `arm-none-eabi-gcc "../${src}" ${flags} -MMD -MP -MF"${src.replace(/\.c$/, '.d')}" -MT"${obj}" -o "${obj}"`, kind: 'cmd' });
    const diags = r.diags.filter((d) => d.file === src || (d.file && !d.file.startsWith('<sys>') && src === 'Core/Src/main.c' && !r.compiled.includes(d.file)));
    for (const d of diags) lines.push({ text: `../${d.file}:${d.line}:${d.col}: ${d.severity}: ${d.message}`, kind: d.severity === 'error' ? 'error' : 'warning', file: d.file, line: d.line });
  }
  const sysDiags = r.diags.filter((d) => !d.file || d.file.startsWith('<sys>') || d.file === 'linker' || d.file.endsWith('.s'));
  for (const d of sysDiags) lines.push({ text: `${d.file ? d.file + ': ' : ''}${d.severity}: ${d.message}`, kind: d.severity === 'error' ? 'error' : 'warning' });
  const errors = r.diags.filter((d) => d.severity === 'error').length;
  const warnings = r.diags.filter((d) => d.severity === 'warning').length;
  const ms = Math.round(performance.now() - t0 + 300 + Math.random() * 400);
  if (r.ok && r.program) {
    const elf = `${p.name}.elf`;
    lines.push({ text: `arm-none-eabi-gcc -o "${elf}" @"objects.list"   -mcpu=cortex-m4 -T"../STM32F401RETX_FLASH.ld" --specs=nosys.specs -Wl,-Map="${p.name}.map" -Wl,--gc-sections -static ${p.settings.printfFloat ? '-u _printf_float ' : ''}--specs=nano.specs -mfpu=fpv4-sp-d16 -mfloat-abi=hard -mthumb -Wl,--start-group -lc -lm -Wl,--end-group`, kind: 'cmd' });
    lines.push({ text: `Finished building target: ${elf}`, kind: 'info' }, { text: ' ', kind: 'info' });
    lines.push({ text: `arm-none-eabi-size  ${elf} `, kind: 'cmd' }, { text: `arm-none-eabi-objdump -h -S ${elf}  > "${p.name}.list"`, kind: 'cmd' });
    const { text, data, bss } = r.program.sizes;
    const textSize = text + (p.settings.printfFloat ? 9800 : 0);
    const dec = textSize + data + bss;
    lines.push({ text: '   text\t   data\t    bss\t    dec\t    hex\tfilename', kind: 'info' });
    lines.push({ text: `${String(textSize).padStart(7)}\t${String(data).padStart(7)}\t${String(bss).padStart(7)}\t${String(dec).padStart(7)}\t${dec.toString(16).padStart(7)}\t${elf}`, kind: 'info' });
    lines.push({ text: 'Finished building: default.size.stdout', kind: 'info' }, { text: ' ', kind: 'info' }, { text: `Finished building: ${p.name}.list`, kind: 'info' }, { text: ' ', kind: 'info' });
    lines.push({ text: `${ts()} Build Finished. ${errors} errors, ${warnings} warnings. (took ${ms}ms)`, kind: 'success' });
    lastProgram = { projectId: p.id, program: r.program, stamp: stampOf(p) };
  } else {
    lines.push({ text: `make: *** [Core/Src/subdir.mk:34: Core/Src/main.o] Error 1`, kind: 'error' });
    lines.push({ text: `"make -j16 all" terminated with exit code 2. Build might be incomplete.`, kind: 'error' });
    lines.push({ text: `${ts()} Build Failed. ${errors} errors, ${warnings} warnings. (took ${ms}ms)`, kind: 'error' });
  }
  appendBuild(lines, true);
  set({ problems: r.diags.filter((d) => d.file !== '' || d.severity === 'error') });
  if (!r.ok) set({ bottomTab: 'console', consoleView: 'build' });
  return { ok: r.ok, program: r.program };
}

// ---------------- run / debug ----------------
export async function runTarget(debug: boolean, projectId: string | null = S().activeProjectId) {
  const p = getProject(projectId);
  if (!p) return;
  let prog = lastProgram && lastProgram.projectId === p.id && lastProgram.stamp === stampOf(p) ? lastProgram.program : null;
  if (!prog) {
    const r = build(p.id);
    if (!r.ok || !r.program) return;
    prog = r.program;
  }
  const s = S();
  set({ sim: { ...s.sim, flashing: true, active: false, status: 'idle', statusText: '', pause: null, debugging: debug, projectId: p.id }, consoleView: 'debug', bottomTab: 'console' });
  appendDebug(
    [
      { text: 'STMicroelectronics ST-LINK GDB server. Version 7.10.0', kind: 'dim' },
      { text: 'Copyright (c) 2025, STMicroelectronics. All rights reserved.', kind: 'dim' },
      { text: '', kind: 'dim' },
      { text: 'Target voltage: 3.26 V', kind: 'dim' },
      { text: 'Device ID: 0x433 (STM32F401xD/xE)', kind: 'dim' },
      { text: 'Flash size: 512 KBytes', kind: 'dim' },
      { text: `Memory programming...`, kind: 'info' },
      { text: `Opening and parsing file: ${p.name}.elf`, kind: 'info' },
      { text: '  File          : ' + p.name + '.elf', kind: 'dim' },
      { text: `  Size          : ${(prog.sizes.text / 1024).toFixed(2)} KB`, kind: 'dim' },
      { text: '  Address       : 0x08000000', kind: 'dim' },
      { text: 'Erasing memory corresponding to segment 0:', kind: 'info' },
      { text: 'Download in Progress:', kind: 'info' },
    ],
  );
  await new Promise((r) => setTimeout(r, 450 + Math.min(600, prog!.sizes.text / 40)));
  appendDebug([
    { text: 'File download complete', kind: 'info' },
    { text: 'Verifying ...', kind: 'info' },
    { text: 'Download verified successfully', kind: 'success' },
    { text: debug ? 'Debugger connected — target halted at main()' : 'Target is running (Run mode). Use Terminate to stop.', kind: 'info' },
  ]);
  const bps = debug ? breakpointList(p) : [];
  send({ type: 'load', program: prog, settings: p.settings, parts: S().parts, inputs: S().inputs, breakpoints: bps, startPaused: false });
  if (debug) {
    // halt at first line of main like CubeIDE (temporary breakpoint at main)
    const mainLine = findMainLine(p);
    if (mainLine) send({ type: 'breakpoints', list: [...bps, { file: 'Core/Src/main.c', line: mainLine }] });
    tempMainBp = mainLine;
  }
  rx.busyUntil = 0;
  const s2 = S();
  set({ sim: { ...s2.sim, flashing: false, active: true, status: 'running', debugging: debug, projectId: p.id, pause: null } });
}

let tempMainBp: number | null = null;

function findMainLine(p: Project): number | null {
  const src = p.files['Core/Src/main.c'] ?? '';
  const lines = src.split('\n');
  const i = lines.findIndex((l) => /^\s*int\s+main\s*\(/.test(l));
  if (i < 0) return null;
  for (let j = i + 1; j < lines.length; j++) {
    const t = lines[j].trim();
    if (t && t !== '{' && !t.startsWith('/*') && !t.startsWith('//') && !t.startsWith('*')) return j + 1;
  }
  return null;
}

export function breakpointList(p: Project): { file: string; line: number }[] {
  const out: { file: string; line: number }[] = [];
  for (const [file, lines] of Object.entries(p.breakpoints ?? {})) for (const line of lines) out.push({ file, line });
  return out;
}

function clearTempBp() {
  if (tempMainBp === null) return;
  tempMainBp = null;
  const p = getProject(S().sim.projectId);
  if (p) send({ type: 'breakpoints', list: S().sim.debugging ? breakpointList(p) : [] });
}

export function stopTarget() {
  if (!worker) return;
  send({ type: 'stop' });
  const s = S();
  set({ sim: { ...s.sim, active: false, status: 'idle', statusText: '', pause: null, debugging: false, snap: null } });
  appendDebug([{ text: 'Debug session terminated.', kind: 'dim' }]);
}
export function pauseTarget() {
  send({ type: 'pause' });
}
export function resumeTarget() {
  clearTempBp();
  set((s) => ({ sim: { ...s.sim, pause: null, status: 'running' } }));
  send({ type: 'resume' });
}
export function stepTarget(mode: StepMode) {
  clearTempBp();
  set((s) => ({ sim: { ...s.sim, pause: null, status: 'running' } }));
  send({ type: 'step', mode });
}
export function resetTarget() {
  if (!S().sim.active) return;
  rx.busyUntil = 0;
  send({ type: 'reset' });
  appendDebug([{ text: 'Target reset.', kind: 'dim' }]);
}
export function setSpeed(v: number) {
  set((s) => ({ sim: { ...s.sim, speed: v } }));
  send({ type: 'speed', value: v });
}

export function toggleBreakpoint(ref: FileRef, line: number) {
  updateProject(ref.projectId, (p) => {
    const cur = new Set(p.breakpoints?.[ref.path] ?? []);
    if (cur.has(line)) cur.delete(line);
    else cur.add(line);
    return { ...p, breakpoints: { ...p.breakpoints, [ref.path]: [...cur].sort((a, b) => a - b) } };
  });
  const s = S();
  const p = getProject(ref.projectId);
  if (p && s.sim.active && s.sim.debugging && s.sim.projectId === ref.projectId) {
    send({ type: 'breakpoints', list: [...breakpointList(p), ...(tempMainBp ? [{ file: 'Core/Src/main.c', line: tempMainBp }] : [])] });
  }
}

export function setWatches(exprs: string[]) {
  set({ watchExprs: exprs });
  send({ type: 'watch', exprs });
}

export function setLogicPins(pins: string[]) {
  set({ logicPins: pins });
  if (worker) send({ type: 'traces', pins });
}

// ---------------- board IO ----------------
export function setInputs(p: Partial<BoardInputs>) {
  set((s) => ({ inputs: { ...s.inputs, ...p } }));
  if (worker) send({ type: 'inputs', inputs: p });
  bc?.postMessage({ type: 'state', inputs: S().inputs, parts: S().parts, snap: S().sim.snap });
}
export function setParts(p: Partial<PartsConfig>) {
  set((s) => ({ parts: { ...s.parts, ...p } }));
  if (worker) send({ type: 'parts', parts: p });
  const id = S().activeProjectId;
  if (id) updateProject(id, (pr) => ({ ...pr, parts: { ...pr.parts, ...p } }));
  bc?.postMessage({ type: 'state', inputs: S().inputs, parts: S().parts, snap: S().sim.snap });
}

// ---------------- serial ----------------
export function serialConnect(port: string, baud: number) {
  rx.busyUntil = 0;
  set((s) => ({ serial: { ...s.serial, open: true, port, baud, text: s.serial.text }, consoleView: 'serial', bottomTab: 'console' }));
}
export function serialDisconnect() {
  set((s) => ({ serial: { ...s.serial, open: false } }));
}
export function serialClear() {
  set((s) => ({ serial: { ...s.serial, text: '' } }));
}
export function serialSend(text: string) {
  const s = S().serial;
  if (!s.open) return;
  const end = s.lineEnding === 'crlf' ? '\r\n' : s.lineEnding === 'lf' ? '\n' : '';
  const bytes = Array.from(new TextEncoder().encode(text + end));
  send({ type: 'uart', bytes });
  if (s.localEcho) set((st) => ({ serial: { ...st.serial, text: st.serial.text + text + '\n' } }));
}

// keep worker watches/traces in sync once created
export function initController() {
  const s = S();
  getWorker();
  send({ type: 'watch', exprs: s.watchExprs });
  send({ type: 'traces', pins: s.logicPins });
  const p = getProject(s.activeProjectId);
  if (p) set({ parts: { ...defaultParts(), ...p.parts } });
}

export function activateProject(id: string) {
  const p = getProject(id);
  set({ activeProjectId: id });
  if (p && !S().sim.active) setParts({ ...defaultParts(), ...p.parts });
}
