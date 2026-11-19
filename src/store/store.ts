import { create } from 'zustand';
import type { Project } from '../project/project';
import type { MxConfig } from '../cubemx/model';
import type { Diag } from '../sim/cc/codegen';
import type { BoardInputs, PartsConfig } from '../sim/board/board';
import type { PauseState, SimSnapshot, VarNode } from '../sim/simulator';

export type AppName = 'mx' | 'ide';

export interface ConsoleLine {
  text: string;
  kind: 'info' | 'cmd' | 'error' | 'warning' | 'success' | 'dim';
  file?: string;
  line?: number;
}

export interface FileRef {
  projectId: string;
  path: string;
}

export interface SimUi {
  active: boolean;
  debugging: boolean;
  projectId: string | null;
  status: SimSnapshot['status'];
  statusText: string;
  snap: SimSnapshot | null;
  pause: PauseState | null;
  realtime: number;
  speed: number;
  watches: VarNode[];
  globals: VarNode[];
  flashing: boolean;
  traces: Record<string, [number, number][]>;
}

export interface SerialUi {
  open: boolean;
  port: string;
  baud: number;
  text: string;
  scrollLock: boolean;
  localEcho: boolean;
  lineEnding: 'none' | 'lf' | 'crlf';
}

export interface Store {
  app: AppName;
  projects: Project[];
  activeProjectId: string | null;
  // cubemx
  mxPage: 'home' | 'project';
  mxTab: 'pinout' | 'clock' | 'project' | 'tools';
  mxConfig: MxConfig | null;
  mxProjectId: string | null;
  mxCategory: string | null;
  mxDirty: boolean;
  // ide
  openFiles: FileRef[];
  activeFile: FileRef | null;
  revealLine: { file: FileRef; line: number; n: number } | null;
  buildLog: ConsoleLine[];
  problems: Diag[];
  bottomTab: 'console' | 'problems' | 'live' | 'variables' | 'breakpoints' | 'logic';
  consoleView: 'build' | 'serial' | 'debug';
  debugLog: ConsoleLine[];
  serial: SerialUi;
  sim: SimUi;
  inputs: BoardInputs;
  parts: PartsConfig;
  watchExprs: string[];
  dirty: Record<string, boolean>;
  boardVisible: boolean;
  boardWidth: number;
  logicPins: string[];
  set: (p: Partial<Store> | ((s: Store) => Partial<Store>)) => void;
}

const LS_KEY = 'stm32sim.projects.v1';
const LS_UI = 'stm32sim.ui.v1';

function loadProjects(): Project[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return [];
}

function loadUi(): Partial<Store> {
  try {
    const raw = localStorage.getItem(LS_UI);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return {};
}

const ui = loadUi();

export const useStore = create<Store>((set) => ({
  app: (ui.app as AppName) ?? 'mx',
  projects: loadProjects(),
  activeProjectId: (ui.activeProjectId as string) ?? null,
  mxPage: 'home',
  mxTab: 'pinout',
  mxConfig: null,
  mxProjectId: null,
  mxCategory: null,
  mxDirty: false,
  openFiles: (ui.openFiles as FileRef[]) ?? [],
  activeFile: (ui.activeFile as FileRef) ?? null,
  revealLine: null,
  buildLog: [],
  problems: [],
  bottomTab: 'console',
  consoleView: 'build',
  debugLog: [],
  serial: { open: false, port: '/dev/ttyACM0', baud: 115200, text: '', scrollLock: false, localEcho: false, lineEnding: 'crlf' },
  sim: { active: false, debugging: false, projectId: null, status: 'idle', statusText: '', snap: null, pause: null, realtime: 1, speed: 1, watches: [], globals: [], flashing: false, traces: {} },
  inputs: { sw1: false, sw2: false, b1: false, light: 50, tempC: 25, power: true },
  parts: { motor1: false, motor2: false, stepper: false, servo1: false, servo2: false, pt100: false },
  watchExprs: (ui.watchExprs as string[]) ?? [],
  dirty: {},
  boardVisible: (ui.boardVisible as boolean) ?? true,
  boardWidth: (ui.boardWidth as number) ?? 640,
  logicPins: (ui.logicPins as string[]) ?? ['PA5', 'PB7', 'PA6', 'PA7', 'PA10', 'PC8'],
  set: (p) => set(p as never),
}));

let saveTimer: ReturnType<typeof setTimeout> | null = null;
useStore.subscribe((s, prev) => {
  if (s.projects !== prev.projects) {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(useStore.getState().projects));
      } catch {
        /* quota */
      }
    }, 400);
  }
  if (s.app !== prev.app || s.activeProjectId !== prev.activeProjectId || s.openFiles !== prev.openFiles || s.activeFile !== prev.activeFile || s.watchExprs !== prev.watchExprs || s.boardVisible !== prev.boardVisible || s.boardWidth !== prev.boardWidth || s.logicPins !== prev.logicPins) {
    try {
      localStorage.setItem(
        LS_UI,
        JSON.stringify({ app: s.app, activeProjectId: s.activeProjectId, openFiles: s.openFiles, activeFile: s.activeFile, watchExprs: s.watchExprs, boardVisible: s.boardVisible, boardWidth: s.boardWidth, logicPins: s.logicPins }),
      );
    } catch {
      /* ignore */
    }
  }
});

export function getProject(id: string | null | undefined): Project | undefined {
  if (!id) return undefined;
  return useStore.getState().projects.find((p) => p.id === id);
}

export function updateProject(id: string, fn: (p: Project) => Project) {
  useStore.getState().set((s) => ({ projects: s.projects.map((p) => (p.id === id ? fn(p) : p)) }));
}
