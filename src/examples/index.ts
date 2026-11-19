// Lab experiments as ready-made projects (CubeMX config + main.c).
import exp1 from '../../research/Exp1_LED.c?raw';
import exp2 from '../../research/Exp2_Button.c?raw';
import exp3 from '../../research/Exp3_LDR.c?raw';
import exp4 from '../../research/Exp4_PT100.c?raw';
import exp5 from '../../research/Exp5_Servo.c?raw';
import exp6 from '../../research/Exp6_Stepper.c?raw';
import exp7 from '../../research/Exp7_DC_PWM.c?raw';
import { MxConfig, PinConfig, defaultConfig, setTimerChannel, setTimerClockSource, setUsart2Mode, assignSignal } from '../cubemx/model';
import type { PartsConfig } from '../sim/board/board';

export interface Example {
  id: string;
  title: string;
  description: string;
  config: MxConfig;
  mainC: string;
  parts: Partial<PartsConfig>;
  printfFloat?: boolean;
  hint: string;
}

const CLOCK_84: MxConfig['clock'] = { hseMode: 'Disable', pllSource: 'HSI', sysclkSource: 'PLLCLK', m: 8, n: 84, p: 2, q: 4, ahb: 1, apb1: 2, apb2: 1 };

const OUT: Omit<PinConfig, 'signal'> = { level: 'GPIO_PIN_RESET', outMode: 'GPIO_MODE_OUTPUT_PP', pull: 'GPIO_NOPULL', speed: 'GPIO_SPEED_FREQ_LOW' };

function base(name: string): MxConfig {
  const c = defaultConfig(name);
  c.clock = { ...CLOCK_84 };
  return c;
}

function exp1Config(): MxConfig {
  const c = base('Exp1_LED');
  for (const p of ['PC13', 'PC14', 'PA5', 'PB7']) c.pins[p] = { signal: 'GPIO_Output', ...OUT };
  return c;
}
function exp2Config(): MxConfig {
  const c = base('Exp2_Button');
  c.pins.PB14 = { signal: 'GPIO_Input', pull: 'GPIO_NOPULL' };
  c.pins.PB7 = { signal: 'GPIO_Output', ...OUT };
  return c;
}
function exp3Config(): MxConfig {
  let c = base('Exp3_LDR');
  c = assignSignal(c, 'PA1', 'ADC1_IN1');
  c = setUsart2Mode(c, 'Asynchronous');
  return c;
}
function exp4Config(): MxConfig {
  let c = base('Exp4_PT100');
  c = setUsart2Mode(c, 'Asynchronous');
  c = assignSignal(c, 'PA0', 'ADC1_IN0');
  return c;
}
function exp5Config(): MxConfig {
  let c = base('Exp5_Servo');
  c = setTimerChannel(c, 'TIM1', 3, 'PWM Generation');
  c.tims.TIM1.prescaler = '200-1';
  c.tims.TIM1.period = '8400-1';
  return c;
}
function exp6Config(): MxConfig {
  const c = base('Exp6_Stepper');
  for (const p of ['PA5', 'PA6', 'PA7']) c.pins[p] = { signal: 'GPIO_Output', ...OUT };
  c.pins.PC5 = { signal: 'GPIO_Input', pull: 'GPIO_PULLUP' };
  c.pins.PC9 = { signal: 'GPIO_Output', ...OUT };
  c.pins.PB5 = { signal: 'GPIO_Output', ...OUT };
  return c;
}
function exp7Config(): MxConfig {
  let c = base('Exp7_DC_PWM');
  c = setTimerClockSource(c, 'TIM3', 'Internal Clock');
  c = setTimerChannel(c, 'TIM3', 3, 'PWM Generation');
  c.tims.TIM3.prescaler = '0';
  c.tims.TIM3.period = '4200-1';
  c = assignSignal(c, 'PC8', 'TIM3_CH3');
  c.pins.PC7 = { signal: 'GPIO_Output', ...OUT };
  c.pins.PB6 = { signal: 'GPIO_Output', ...OUT };
  return c;
}

export const EXAMPLES: Example[] = [
  {
    id: 'exp1',
    title: 'Exp 1 — LED blinking',
    description: 'Toggle the Nucleo LD2 (PA5) and carrier LEDs LED1 (PB7) and LED2 (PC13) every 500 ms.',
    config: exp1Config(),
    mainC: exp1,
    parts: {},
    hint: 'Watch LD2 on the Nucleo and LED1/LED2 on the carrier board.',
  },
  {
    id: 'exp2',
    title: 'Exp 2 — Push button',
    description: 'LED1 (PB7) follows push button SW2 (PB14).',
    config: exp2Config(),
    mainC: exp2,
    parts: {},
    hint: 'Hold SW2 (PB14) on the carrier board to light LED1.',
  },
  {
    id: 'exp3',
    title: 'Exp 3 — LDR (ADC)',
    description: 'Read the LDR on PA1 (ADC1_IN1) and print the light level over USART2.',
    config: exp3Config(),
    mainC: exp3,
    parts: {},
    hint: 'Open the serial console (115200 baud) and move the light slider.',
  },
  {
    id: 'exp4',
    title: 'Exp 4 — PT100 temperature',
    description: 'Read the PT100 RTD on PA0 (ADC1_IN0) and print the temperature over USART2.',
    config: exp4Config(),
    mainC: exp4,
    parts: { pt100: true },
    hint: 'Open the serial console (115200 baud) and change the PT100 temperature.',
  },
  {
    id: 'exp5',
    title: 'Exp 5 — Servo motor (PWM)',
    description: 'Sweep a servo on CN2 (PA10, TIM1_CH3) from 0° to 180° and back using 50 Hz PWM.',
    config: exp5Config(),
    mainC: exp5,
    parts: { servo2: true },
    hint: 'The servo is plugged into the PA10 servo header (CN2).',
  },
  {
    id: 'exp6',
    title: 'Exp 6 — Stepper motor',
    description: 'Drive the stepper through the DRV8825 driver: 200 steps forward, 200 steps back.',
    config: exp6Config(),
    mainC: exp6,
    parts: { stepper: true },
    hint: 'The stepper is connected to the STEPPER MOTOR terminal (CN11).',
  },
  {
    id: 'exp7',
    title: 'Exp 7 — DC motor speed (PWM)',
    description: 'Control DC motor speed and direction through the MOTOR1 H-bridge: 20 kHz PWM on PC8 (TIM3_CH3), direction on INA (PB6)/INB (PC7).',
    config: exp7Config(),
    mainC: exp7,
    parts: { motor1: true },
    hint: 'The DC motor is connected to the MOTOR1 terminal (CN9). Make sure the 12 V power switch is ON.',
  },
];
