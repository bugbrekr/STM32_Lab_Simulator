import { describe, it, expect } from 'vitest';
import { EXAMPLES } from '../src/examples';
import { buildProject, projectFromExample, regenPreview } from '../src/project/project';
import { Simulator } from '../src/sim/simulator';
import { generatedFiles, lostCode } from '../src/cubemx/codegen';

function boot(id: string, opts: { printfFloat?: boolean } = {}) {
  const ex = EXAMPLES.find((e) => e.id === id)!;
  const p = projectFromExample(ex);
  const r = buildProject(p);
  if (!r.ok) throw new Error(r.diags.map((d) => `${d.file}:${d.line}:${d.col}: ${d.severity}: ${d.message}`).join('\n'));
  const sim = new Simulator();
  sim.mcu.adcNoise = 0;
  sim.setParts(p.parts);
  sim.load(r.program!, { printfFloat: opts.printfFloat ?? false });
  return { sim, r, p };
}

function serial(sim: Simulator): string {
  return sim.mcu.uartOut.map((b) => String.fromCharCode(b.byte)).join('');
}

describe('code generation matches CubeMX output', () => {
  for (const ex of EXAMPLES) {
    it(`${ex.id}: generated skeleton only differs by user code`, () => {
      const gen = generatedFiles(ex.config)['Core/Src/main.c'];
      const lost = lostCode(ex.mainC, gen, gen);
      // print for inspection
      if (lost.length) console.log(`${ex.id} lines outside USER CODE:\n  ` + lost.join('\n  '));
      // generated init code must be present verbatim: no generated line missing from the research file
      const missing = lostCode(gen, ex.mainC, ex.mainC).filter((l) => !l.startsWith('/* USER CODE'));
      expect(missing).toEqual([]);
    });
  }
});

describe('experiments run on the simulated board', () => {
  it('Exp1 blinks LD2, LED1, LED2 with 500 ms spacing', () => {
    const { sim } = boot('exp1');
    sim.runFor(0.25);
    expect(sim.status).toBe('running');
    expect(sim.mcu.sysclk()).toBeCloseTo(84e6, -3);
    const states: string[] = [];
    for (let i = 0; i < 7; i++) {
      sim.runFor(0.5);
      const s = sim.snapshot();
      states.push(`${s.board.leds.LD2}${s.board.leds.LED1}${s.board.leds.LED2}`);
    }
    // after each 500ms one more LED toggles: A5, B7, C13 in sequence
    expect(states.slice(0, 6)).toEqual(['110', '111', '011', '001', '000', '100']);
  });

  it('Exp2 LED1 follows SW2', () => {
    const { sim } = boot('exp2');
    sim.runFor(0.05);
    expect(sim.snapshot().board.leds.LED1).toBe(0);
    sim.setInputs({ sw2: true });
    sim.runFor(0.01);
    expect(sim.snapshot().board.leds.LED1).toBe(1);
    sim.setInputs({ sw2: false });
    sim.runFor(0.01);
    expect(sim.snapshot().board.leds.LED1).toBe(0);
  });

  it('Exp3 prints LDR readings that follow the light level', () => {
    const { sim } = boot('exp3');
    sim.setInputs({ light: 10 });
    sim.runFor(0.35);
    const dark = serial(sim);
    expect(dark).toMatch(/RAW ADC: \d{4} \r\nLEVEL: \d+% \r\n/);
    const darkLevel = Number(/LEVEL: (\d+)%/.exec(dark)![1]);
    sim.mcu.uartOut = [];
    sim.setInputs({ light: 90 });
    sim.runFor(0.35);
    const bright = serial(sim);
    const brightLevel = Number(/LEVEL: (\d+)%/.exec(bright)![1]);
    expect(brightLevel).toBeGreaterThan(darkLevel + 30);
  });

  it('Exp4 prints the PT100 temperature', () => {
    const { sim } = boot('exp4');
    sim.setInputs({ tempC: 25 });
    sim.runFor(1.6);
    const out = serial(sim);
    expect(out).toContain('PT100 ACTIVE \r\n');
    const m = [...out.matchAll(/TEMP : (-?\d+)\.(\d) C/g)];
    expect(m.length).toBeGreaterThan(0);
    const t = Number(m[m.length - 1][1]) + Number(m[m.length - 1][2]) / 10;
    expect(Math.abs(t - 25)).toBeLessThan(2.5);
    sim.mcu.uartOut = [];
    sim.setInputs({ tempC: 80 });
    sim.runFor(0.6);
    const m2 = [...serial(sim).matchAll(/TEMP : (-?\d+)\.(\d) C/g)];
    const t2 = Number(m2[m2.length - 1][1]);
    expect(Math.abs(t2 - 80)).toBeLessThan(3);
  });

  it('Exp5 sweeps the servo with 50 Hz PWM', () => {
    const { sim } = boot('exp5');
    sim.runFor(0.1);
    const s0 = sim.snapshot();
    expect(s0.pins.PA10.pwm?.freq).toBeCloseTo(50, 1);
    let maxAngle = 0;
    let maxPulse = 0;
    let anyOut = false;
    for (let i = 0; i < 100; i++) {
      sim.runFor(0.1);
      const s = sim.snapshot();
      maxAngle = Math.max(maxAngle, s.board.servos[1].angle);
      maxPulse = Math.max(maxPulse, s.board.servos[1].pulseUs);
      anyOut ||= s.board.servos[1].outOfRange;
    }
    expect(maxAngle).toBeGreaterThan(170);
    expect(maxPulse).toBeLessThan(2550);
    expect(anyOut).toBe(false);
  });

  it('Exp6 steps the stepper 200 steps forward and back', () => {
    const { sim } = boot('exp6');
    let maxSteps = 0;
    let homeToggles = 0;
    let lastHome = true;
    let tForward = -1;
    for (let i = 0; i < 300; i++) {
      sim.runFor(0.01);
      const st = sim.snapshot().board.stepper;
      if (st.steps > maxSteps) maxSteps = st.steps;
      if (st.steps === 200 && tForward < 0) tForward = sim.mcu.now();
      if (st.home !== lastHome) homeToggles++;
      lastHome = st.home;
    }
    expect(maxSteps).toBe(200);
    expect(homeToggles).toBeGreaterThan(10);
    // 200 steps with ~1 ms per step => roughly 0.2 s
    expect(tForward).toBeGreaterThan(0.12);
    expect(tForward).toBeLessThan(0.4);
    sim.runFor(1.5);
    expect(sim.snapshot().board.stepper.steps).toBeLessThan(200);
  });

  it('Exp7 ramps the DC motor speed with 20 kHz PWM', () => {
    const { sim } = boot('exp7');
    sim.runFor(2.5);
    const s = sim.snapshot();
    expect(s.pins.PC8.pwm?.freq).toBeCloseTo(20000, -1);
    expect(s.board.motors[0].mode).toBe('forward');
    expect(s.board.motors[0].rpm).toBeGreaterThan(100);
    sim.runFor(5);
    let sawReverse = false;
    for (let i = 0; i < 40; i++) {
      sim.runFor(0.25);
      if (sim.snapshot().board.motors[0].rpm < -50) sawReverse = true;
    }
    expect(sawReverse).toBe(true);
    // power off: motor stops
    sim.setInputs({ power: false });
    sim.runFor(2);
    expect(Math.abs(sim.snapshot().board.motors[0].rpm)).toBeLessThan(5);
  });

  it('regeneration warns about code outside USER CODE blocks (Exp1)', () => {
    const ex = EXAMPLES.find((e) => e.id === 'exp1')!;
    const p = projectFromExample(ex);
    const rep = regenPreview(p, ex.config);
    expect(rep.lost['Core/Src/main.c']?.some((l) => l.includes('HAL_GPIO_TogglePin'))).toBe(true);
  });
});
