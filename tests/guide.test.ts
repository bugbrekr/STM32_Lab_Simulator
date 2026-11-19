import { describe, it, expect } from 'vitest';
import { EXAMPLES } from '../src/examples';
import { exampleAnalysis, usesOf, analyzeFile } from '../src/guide/analyze';
import { generatedFiles } from '../src/cubemx/codegen';

describe('Lab Guide analysis', () => {
  it('only the student-typed lines are flagged (generated code is not)', () => {
    for (const ex of EXAMPLES) {
      const a = exampleAnalysis(ex.id)!;
      const gen = generatedFiles(ex.config)['Core/Src/main.c'];
      // no flagged line is a CubeMX init statement
      for (const u of a.userLines) expect(u.text).not.toMatch(/huart2\.Init|hadc1\.Init|htim\d\.Init|RCC_OscInitStruct|GPIO_InitStruct\.Pin/);
      // a pristine file has no user lines
      expect(analyzeFile(gen, gen).userLines).toEqual([]);
    }
  });

  it('every typed statement is explained by a snippet', () => {
    for (const ex of EXAMPLES) {
      const a = exampleAnalysis(ex.id)!;
      const unexplained = a.userLines.filter((u) => {
        const t = u.text.trim();
        return t && !/^[{}]|^\/\*|^\*|^\/\/|^\}\s*else/.test(t) && !u.snippet;
      });
      expect(unexplained.map((u) => `${ex.id}:${u.line} ${u.text.trim()}`)).toEqual([]);
    }
  });

  it('expected snippets are recognised in each experiment', () => {
    const ids = (id: string) => new Set(exampleAnalysis(id)!.occurrences.map((o) => o.snippet.id));
    expect(ids('exp1')).toEqual(new Set(['gpio-toggle', 'hal-delay']));
    expect(ids('exp2').has('gpio-read-write')).toBe(true);
    for (const id of ['printf-redirect', 'adc-select-channel', 'adc-read', 'adc-scale', 'printf']) expect(ids('exp3').has(id)).toBe(true);
    for (const id of ['pt100-resistance', 'pt100-temperature', 'float-print-trick', 'adc-clamp']) expect(ids('exp4').has(id)).toBe(true);
    for (const id of ['servo-map', 'pwm-set-compare', 'pwm-start', 'sweep-loop']) expect(ids('exp5').has(id)).toBe(true);
    for (const id of ['stepper-dir', 'stepper-step', 'busy-wait', 'stepper-accel', 'stepper-mode']) expect(ids('exp6').has(id)).toBe(true);
    for (const id of ['hbridge-direction', 'pwm-duty-percent', 'pwm-set-compare', 'pwm-start']) expect(ids('exp7').has(id)).toBe(true);
  });

  it('shared snippets list the other experiments', () => {
    expect(usesOf('printf-redirect', 'exp3').map((u) => u.exampleId)).toEqual(['exp4']);
    expect(usesOf('pwm-start', 'exp5').map((u) => u.exampleId)).toEqual(['exp7']);
    expect(usesOf('hal-delay', 'exp1').map((u) => u.exampleId).sort()).toEqual(['exp3', 'exp4', 'exp5', 'exp6', 'exp7']);
    expect(usesOf('adc-read', 'exp4')[0].occurrences[0].start).toBe(84);
  });
});
