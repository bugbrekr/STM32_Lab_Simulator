import type { LoadedProgram } from './runtime';
import type { BoardInputs, PartsConfig } from './board/board';
import type { PauseState, SimSnapshot, VarNode } from './simulator';
import type { StepMode } from './runtime';

export type ToWorker =
  | { type: 'load'; program: LoadedProgram; settings: { printfFloat: boolean }; parts: Partial<PartsConfig>; inputs: Partial<BoardInputs>; breakpoints: { file: string; line: number }[]; startPaused?: boolean }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'step'; mode: StepMode }
  | { type: 'stop' }
  | { type: 'reset' }
  | { type: 'inputs'; inputs: Partial<BoardInputs> }
  | { type: 'parts'; parts: Partial<PartsConfig> }
  | { type: 'uart'; bytes: number[] }
  | { type: 'breakpoints'; list: { file: string; line: number }[] }
  | { type: 'speed'; value: number }
  | { type: 'watch'; exprs: string[] }
  | { type: 'traces'; pins: string[] };

export type FromWorker =
  | { type: 'snapshot'; snap: SimSnapshot; realtime: number; watches: VarNode[]; traces?: Record<string, [number, number][]> }
  | { type: 'paused'; state: PauseState | null; snap: SimSnapshot; watches: VarNode[]; globals: VarNode[] }
  | { type: 'stopped' };
