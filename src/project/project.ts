// Project model shared by CubeMX, CubeIDE and the simulator.
import { MxConfig } from '../cubemx/model';
import { COMPILED_SOURCES, generatedFiles, genIoc, mergeUserCode, staticFiles, lostCode } from '../cubemx/codegen';
import { compileProject, CompileResult } from '../sim/cc/compile';
import type { PartsConfig } from '../sim/board/board';
import type { Example } from '../examples';

export interface ProjectSettings {
  printfFloat: boolean;
}

export interface Project {
  id: string;
  name: string;
  mx: MxConfig;
  files: Record<string, string>;
  /** pristine generated output (for detecting code outside USER CODE blocks) */
  lastGen: Record<string, string>;
  settings: ProjectSettings;
  parts: Partial<PartsConfig>;
  breakpoints: Record<string, number[]>;
  created: number;
  exampleId?: string;
}

export function iocName(p: { name: string }) {
  return `${p.name}.ioc`;
}

export function newProjectFromConfig(cfg: MxConfig, id = cryptoId()): Project {
  const gen = generatedFiles(cfg);
  return {
    id,
    name: cfg.name,
    mx: cfg,
    files: { ...staticFiles(cfg), ...gen, [`${cfg.name}.ioc`]: genIoc(cfg) },
    lastGen: gen,
    settings: { printfFloat: false },
    parts: {},
    breakpoints: {},
    created: Date.now(),
  };
}

export function projectFromExample(ex: Example, id = cryptoId()): Project {
  const p = newProjectFromConfig(structuredClone(ex.config), id);
  p.files['Core/Src/main.c'] = ex.mainC;
  p.parts = { ...ex.parts };
  p.settings.printfFloat = !!ex.printfFloat;
  p.exampleId = ex.id;
  return p;
}

export interface RegenReport {
  lost: Record<string, string[]>;
}

/** What would be lost if we regenerate with cfg. */
export function regenPreview(p: Project, cfg: MxConfig): RegenReport {
  const fresh = generatedFiles(cfg);
  const lost: Record<string, string[]> = {};
  for (const [path, text] of Object.entries(fresh)) {
    const cur = p.files[path];
    const pristine = p.lastGen[path];
    if (cur === undefined || pristine === undefined) continue;
    const l = lostCode(cur, pristine, text);
    if (l.length) lost[path] = l;
  }
  return { lost };
}

/** Regenerate code, keeping USER CODE sections. */
export function regenerate(p: Project, cfg: MxConfig): Project {
  const fresh = generatedFiles(cfg);
  const files = { ...p.files };
  for (const [path, text] of Object.entries(fresh)) {
    const cur = files[path];
    files[path] = cur !== undefined ? mergeUserCode(text, cur) : text;
  }
  if (cfg.name !== p.name) {
    delete files[`${p.name}.ioc`];
    delete files[`${p.name} Debug.launch`];
    Object.assign(files, staticFiles(cfg));
  }
  files[`${cfg.name}.ioc`] = genIoc(cfg);
  return { ...p, name: cfg.name, mx: cfg, files, lastGen: fresh };
}

export function buildProject(p: Project): CompileResult {
  return compileProject(p.files, COMPILED_SOURCES.filter((s) => p.files[s] !== undefined));
}

export function cryptoId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
