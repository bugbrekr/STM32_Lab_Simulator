// CubeMX project configuration model.
import { TIMERS, TimerName, TIMER_INFO, adcChannelOfPin, AF_TABLE, pinNumber, GPIO_PINS, parsePin } from '../sim/mcu/pins';

export type GpioPull = 'GPIO_NOPULL' | 'GPIO_PULLUP' | 'GPIO_PULLDOWN';
export type GpioSpeed = 'GPIO_SPEED_FREQ_LOW' | 'GPIO_SPEED_FREQ_MEDIUM' | 'GPIO_SPEED_FREQ_HIGH' | 'GPIO_SPEED_FREQ_VERY_HIGH';
export type GpioOutMode = 'GPIO_MODE_OUTPUT_PP' | 'GPIO_MODE_OUTPUT_OD';
export type ExtiMode = 'GPIO_MODE_IT_RISING' | 'GPIO_MODE_IT_FALLING' | 'GPIO_MODE_IT_RISING_FALLING';

export interface PinConfig {
  signal: string;
  label?: string;
  level?: 'GPIO_PIN_RESET' | 'GPIO_PIN_SET';
  outMode?: GpioOutMode;
  extiMode?: ExtiMode;
  pull?: GpioPull;
  speed?: GpioSpeed;
}

export type ChannelMode = 'Disable' | 'PWM Generation' | 'Output Compare No Output';

export interface TimChannelCfg {
  mode: ChannelMode;
  ocMode: 'TIM_OCMODE_PWM1' | 'TIM_OCMODE_PWM2';
  pulse: string;
  polarity: 'TIM_OCPOLARITY_HIGH' | 'TIM_OCPOLARITY_LOW';
  fast: 'TIM_OCFAST_DISABLE' | 'TIM_OCFAST_ENABLE';
}

export interface TimCfg {
  clockSource: 'Disable' | 'Internal Clock';
  channels: Record<1 | 2 | 3 | 4, TimChannelCfg>;
  prescaler: string;
  counterMode: 'TIM_COUNTERMODE_UP' | 'TIM_COUNTERMODE_DOWN';
  period: string;
  clockDivision: 'TIM_CLOCKDIVISION_DIV1' | 'TIM_CLOCKDIVISION_DIV2' | 'TIM_CLOCKDIVISION_DIV4';
  autoReload: 'TIM_AUTORELOAD_PRELOAD_DISABLE' | 'TIM_AUTORELOAD_PRELOAD_ENABLE';
  repetition: string;
  nvic: boolean;
}

export interface AdcCfg {
  channels: number[];
  clockPrescaler: 'ADC_CLOCK_SYNC_PCLK_DIV2' | 'ADC_CLOCK_SYNC_PCLK_DIV4' | 'ADC_CLOCK_SYNC_PCLK_DIV6' | 'ADC_CLOCK_SYNC_PCLK_DIV8';
  resolution: 'ADC_RESOLUTION_12B' | 'ADC_RESOLUTION_10B' | 'ADC_RESOLUTION_8B' | 'ADC_RESOLUTION_6B';
  dataAlign: 'ADC_DATAALIGN_RIGHT' | 'ADC_DATAALIGN_LEFT';
  scan: boolean;
  continuous: boolean;
  discontinuous: boolean;
  eoc: 'ADC_EOC_SINGLE_CONV' | 'ADC_EOC_SEQ_CONV';
  samplingTime: string;
  rankChannel: number | null;
  nvic: boolean;
}

export interface UartCfg {
  mode: 'Disable' | 'Asynchronous';
  baud: number;
  wordLength: 'UART_WORDLENGTH_8B' | 'UART_WORDLENGTH_9B';
  parity: 'UART_PARITY_NONE' | 'UART_PARITY_EVEN' | 'UART_PARITY_ODD';
  stopBits: 'UART_STOPBITS_1' | 'UART_STOPBITS_2';
  direction: 'UART_MODE_TX_RX' | 'UART_MODE_TX' | 'UART_MODE_RX';
  oversampling: 'UART_OVERSAMPLING_16' | 'UART_OVERSAMPLING_8';
  nvic: boolean;
}

export interface ClockCfg {
  hseMode: 'Disable' | 'BYPASS Clock Source' | 'Crystal/Ceramic Resonator';
  pllSource: 'HSI' | 'HSE';
  sysclkSource: 'HSI' | 'HSE' | 'PLLCLK';
  m: number;
  n: number;
  p: 2 | 4 | 6 | 8;
  q: number;
  ahb: number;
  apb1: number;
  apb2: number;
}

export interface MxConfig {
  version: 1;
  name: string;
  board: 'NUCLEO-F401RE' | null;
  mcu: 'STM32F401RETx';
  pins: Record<string, PinConfig>;
  debug: 'Disable' | 'Serial Wire';
  adc1: AdcCfg;
  tims: Record<TimerName, TimCfg>;
  usart2: UartCfg;
  extiNvic: Record<string, boolean>;
  clock: ClockCfg;
  /** peripheral init order (MX_xxx_Init) */
  order: string[];
  toolchain: 'STM32CubeIDE';
}

export function defaultTim(): TimCfg {
  const ch = (): TimChannelCfg => ({ mode: 'Disable', ocMode: 'TIM_OCMODE_PWM1', pulse: '0', polarity: 'TIM_OCPOLARITY_HIGH', fast: 'TIM_OCFAST_DISABLE' });
  return {
    clockSource: 'Disable',
    channels: { 1: ch(), 2: ch(), 3: ch(), 4: ch() },
    prescaler: '0',
    counterMode: 'TIM_COUNTERMODE_UP',
    period: '65535',
    clockDivision: 'TIM_CLOCKDIVISION_DIV1',
    autoReload: 'TIM_AUTORELOAD_PRELOAD_DISABLE',
    repetition: '0',
    nvic: false,
  };
}

export function defaultConfig(name = 'Project', board: MxConfig['board'] = null): MxConfig {
  const tims = {} as Record<TimerName, TimCfg>;
  for (const t of TIMERS) {
    tims[t] = defaultTim();
    if (TIMER_INFO[t].bits === 32) tims[t].period = '4294967295';
  }
  return {
    version: 1,
    name,
    board,
    mcu: 'STM32F401RETx',
    pins: {},
    debug: 'Disable',
    adc1: {
      channels: [],
      clockPrescaler: 'ADC_CLOCK_SYNC_PCLK_DIV4',
      resolution: 'ADC_RESOLUTION_12B',
      dataAlign: 'ADC_DATAALIGN_RIGHT',
      scan: false,
      continuous: false,
      discontinuous: false,
      eoc: 'ADC_EOC_SINGLE_CONV',
      samplingTime: 'ADC_SAMPLETIME_3CYCLES',
      rankChannel: null,
      nvic: false,
    },
    tims,
    usart2: {
      mode: 'Disable',
      baud: 115200,
      wordLength: 'UART_WORDLENGTH_8B',
      parity: 'UART_PARITY_NONE',
      stopBits: 'UART_STOPBITS_1',
      direction: 'UART_MODE_TX_RX',
      oversampling: 'UART_OVERSAMPLING_16',
      nvic: false,
    },
    extiNvic: {},
    clock: { hseMode: 'Disable', pllSource: 'HSI', sysclkSource: 'HSI', m: 16, n: 336, p: 4, q: 7, ahb: 1, apb1: 1, apb2: 1 },
    order: [],
    toolchain: 'STM32CubeIDE',
  };
}

/** NUCLEO-F401RE defaults ("Initialize all peripherals with their default Mode? Yes") */
export function nucleoDefaults(name: string): MxConfig {
  const c = defaultConfig(name, 'NUCLEO-F401RE');
  c.pins.PC13 = { signal: 'GPIO_EXTI13', label: 'B1 [Blue PushButton]', extiMode: 'GPIO_MODE_IT_FALLING', pull: 'GPIO_NOPULL' };
  c.pins.PA5 = { signal: 'GPIO_Output', label: 'LD2 [Green Led]', level: 'GPIO_PIN_RESET', outMode: 'GPIO_MODE_OUTPUT_PP', pull: 'GPIO_NOPULL', speed: 'GPIO_SPEED_FREQ_LOW' };
  c.pins.PA2 = { signal: 'USART2_TX', label: 'USART_TX' };
  c.pins.PA3 = { signal: 'USART2_RX', label: 'USART_RX' };
  c.pins.PA13 = { signal: 'SYS_JTMS-SWDIO', label: 'TMS' };
  c.pins.PA14 = { signal: 'SYS_JTCK-SWCLK', label: 'TCK' };
  c.pins.PB3 = { signal: 'SYS_JTDO-SWO', label: 'SWO' };
  c.debug = 'Serial Wire';
  c.usart2.mode = 'Asynchronous';
  c.extiNvic['EXTI15_10_IRQn'] = true;
  c.clock = { hseMode: 'Disable', pllSource: 'HSI', sysclkSource: 'PLLCLK', m: 16, n: 336, p: 4, q: 7, ahb: 1, apb1: 2, apb2: 1 };
  c.order = ['USART2'];
  return c;
}

// ---------------- clock math ----------------
export function clockTree(c: ClockCfg) {
  const hsi = 16e6;
  const hse = 8e6;
  const pllIn = c.pllSource === 'HSE' ? hse : hsi;
  const vcoIn = pllIn / c.m;
  const vco = vcoIn * c.n;
  const pllP = vco / c.p;
  const pllQ = vco / c.q;
  const sysclk = c.sysclkSource === 'PLLCLK' ? pllP : c.sysclkSource === 'HSE' ? hse : hsi;
  const hclk = sysclk / c.ahb;
  const pclk1 = hclk / c.apb1;
  const pclk2 = hclk / c.apb2;
  const tim1 = c.apb1 === 1 ? pclk1 : pclk1 * 2;
  const tim2 = c.apb2 === 1 ? pclk2 : pclk2 * 2;
  const errors: string[] = [];
  const usesPll = c.sysclkSource === 'PLLCLK';
  if (usesPll && (vcoIn < 0.95e6 || vcoIn > 2.1e6)) errors.push('vcoIn');
  if (usesPll && (vco < 100e6 || vco > 432e6)) errors.push('vco');
  if (sysclk > 84e6) errors.push('sysclk');
  if (hclk > 84e6) errors.push('hclk');
  if (pclk1 > 42e6) errors.push('pclk1');
  if (pclk2 > 84e6) errors.push('pclk2');
  if ((c.sysclkSource === 'HSE' || c.pllSource === 'HSE') && c.hseMode === 'Disable' && (c.sysclkSource === 'HSE' || usesPll)) errors.push('hse');
  return { pllIn, vcoIn, vco, pllP, pllQ, sysclk, hclk, pclk1, pclk2, tim1, tim2, usb: pllQ, errors };
}

/** Find PLL settings for a requested HCLK (MHz). */
export function solveClock(c: ClockCfg, hclkMHz: number): ClockCfg | null {
  const pllIn = c.pllSource === 'HSE' ? 8 : 16;
  let best: ClockCfg | null = null;
  let bestScore = Infinity;
  const ahbs = [1, 2, 4, 8, 16, 64, 128, 256, 512];
  for (const ahb of ahbs) {
    const sys = hclkMHz * ahb;
    if (sys > 84) break;
    if (sys === 16 && c.pllSource === 'HSI') {
      const r: ClockCfg = { ...c, sysclkSource: 'HSI', ahb, apb1: 1, apb2: 1 };
      return r;
    }
    for (const p of [2, 4, 6, 8] as const) {
      for (let m = 2; m <= 63; m++) {
        const vin = pllIn / m;
        if (vin < 1 || vin > 2) continue;
        const n = Math.round((sys * p) / vin);
        if (n < 50 || n > 432) continue;
        const vco = vin * n;
        if (vco < 100 || vco > 432) continue;
        const got = vco / p;
        const err = Math.abs(got - sys);
        const score = err * 1000 + (vin === 2 ? 0 : 1) + p * 0.01;
        if (score < bestScore) {
          bestScore = score;
          let apb1 = 1;
          while (got / ahb / apb1 > 42) apb1 *= 2;
          best = { ...c, sysclkSource: 'PLLCLK', m, n, p, ahb, apb1, apb2: 1, q: Math.max(2, Math.ceil(vco / 48)) };
        }
      }
    }
    if (best && bestScore < 1) break;
  }
  return best;
}

// ---------------- pin helpers ----------------
export function pinPeripheral(signal: string): string | null {
  if (signal.startsWith('ADC1_')) return 'ADC1';
  const m = /^(TIM\d+)_/.exec(signal);
  if (m) return m[1];
  if (signal.startsWith('USART2_')) return 'USART2';
  if (signal.startsWith('SYS_')) return 'SYS';
  if (signal.startsWith('RCC_')) return 'RCC';
  return null;
}

export function isGpioSignal(sig: string) {
  return sig === 'GPIO_Input' || sig === 'GPIO_Output' || sig === 'GPIO_Analog' || sig.startsWith('GPIO_EXTI');
}

/** Is the peripheral mode for this pin configured (green) or only assigned (orange)? */
export function pinStatus(cfg: MxConfig, pin: string): 'free' | 'ok' | 'partial' {
  const p = cfg.pins[pin];
  if (!p || p.signal === 'Reset_State') return 'free';
  const sig = p.signal;
  if (isGpioSignal(sig)) return 'ok';
  if (sig.startsWith('ADC1_IN')) return cfg.adc1.channels.includes(Number(sig.slice(7))) ? 'ok' : 'partial';
  const t = /^(TIM\d+)_CH(\d)$/.exec(sig);
  if (t) return cfg.tims[t[1] as TimerName]?.channels[Number(t[2]) as 1].mode !== 'Disable' ? 'ok' : 'partial';
  if (sig.startsWith('USART2_')) return cfg.usart2.mode === 'Asynchronous' ? 'ok' : 'partial';
  if (sig.startsWith('SYS_')) return cfg.debug === 'Serial Wire' ? 'ok' : 'partial';
  if (sig.startsWith('RCC_OSC')) return cfg.clock.hseMode !== 'Disable' ? 'ok' : 'partial';
  return 'partial';
}

export function pinsWithSignal(cfg: MxConfig, signal: string): string[] {
  return Object.entries(cfg.pins)
    .filter(([, p]) => p.signal === signal)
    .map(([k]) => k);
}

/** Assign a signal to a pin and keep peripheral config consistent (like CubeMX does). */
export function assignSignal(cfg: MxConfig, pin: string, signal: string): MxConfig {
  const c = structuredClone(cfg);
  const prev = c.pins[pin];
  if (prev) unassignSideEffects(c, pin, prev.signal);
  if (signal === 'Reset_State') {
    delete c.pins[pin];
    return c;
  }
  // a signal can be on one pin only (except GPIO)
  if (!isGpioSignal(signal)) {
    for (const other of pinsWithSignal(c, signal)) {
      if (other !== pin) delete c.pins[other];
    }
  }
  const pc: PinConfig = { signal, label: prev?.label };
  if (signal === 'GPIO_Output') Object.assign(pc, { level: 'GPIO_PIN_RESET', outMode: 'GPIO_MODE_OUTPUT_PP', pull: 'GPIO_NOPULL', speed: 'GPIO_SPEED_FREQ_LOW' });
  if (signal === 'GPIO_Input') Object.assign(pc, { pull: 'GPIO_NOPULL' });
  if (signal.startsWith('GPIO_EXTI')) Object.assign(pc, { extiMode: 'GPIO_MODE_IT_RISING', pull: 'GPIO_NOPULL' });
  c.pins[pin] = pc;
  // side effects: enabling peripheral modes
  if (signal.startsWith('ADC1_IN')) {
    const ch = Number(signal.slice(7));
    if (!c.adc1.channels.includes(ch)) c.adc1.channels.push(ch);
    c.adc1.channels.sort((a, b) => a - b);
    if (c.adc1.rankChannel === null) c.adc1.rankChannel = ch;
    addOrder(c, 'ADC1');
  }
  if (signal.startsWith('USART2_')) {
    // CubeMX requires both pins, mode chosen in the peripheral panel
  }
  return c;
}

function unassignSideEffects(c: MxConfig, pin: string, signal: string) {
  if (signal.startsWith('ADC1_IN')) {
    const ch = Number(signal.slice(7));
    c.adc1.channels = c.adc1.channels.filter((x) => x !== ch);
    if (c.adc1.rankChannel === ch) c.adc1.rankChannel = c.adc1.channels[0] ?? null;
    if (!c.adc1.channels.length) removeOrder(c, 'ADC1');
  }
  const t = /^(TIM\d+)_CH(\d)$/.exec(signal);
  if (t) {
    const tim = c.tims[t[1] as TimerName];
    if (tim) tim.channels[Number(t[2]) as 1].mode = 'Disable';
    if (tim && !timerActive(tim)) removeOrder(c, t[1]);
  }
  if (signal.startsWith('USART2_')) {
    c.usart2.mode = 'Disable';
    removeOrder(c, 'USART2');
    for (const p of [...pinsWithSignal(c, 'USART2_TX'), ...pinsWithSignal(c, 'USART2_RX')]) if (p !== pin) delete c.pins[p];
  }
  if (signal.startsWith('GPIO_EXTI')) {
    // nothing
  }
  void pin;
}

export function timerActive(t: TimCfg): boolean {
  return t.clockSource !== 'Disable' || Object.values(t.channels).some((ch) => ch.mode !== 'Disable');
}

export function addOrder(c: MxConfig, p: string) {
  if (!c.order.includes(p)) c.order.push(p);
}
export function removeOrder(c: MxConfig, p: string) {
  c.order = c.order.filter((x) => x !== p);
}

/** Set a timer channel mode and assign default pin if none */
export function setTimerChannel(cfg: MxConfig, tim: TimerName, ch: 1 | 2 | 3 | 4, mode: ChannelMode): MxConfig {
  const c = structuredClone(cfg);
  c.tims[tim].channels[ch].mode = mode;
  const sig = `${tim}_CH${ch}`;
  if (mode !== 'Disable' && mode !== 'Output Compare No Output') {
    if (!pinsWithSignal(c, sig).length) {
      const candidates = GPIO_PINS.filter((p) => (AF_TABLE[p] ?? []).some(([, s]) => s === sig)).sort((a, b) => pinNumber(a) - pinNumber(b));
      const free = candidates.find((p) => !c.pins[p]) ?? candidates[0];
      if (free) c.pins[free] = { signal: sig, label: c.pins[free]?.label };
    }
  } else if (mode === 'Disable') {
    for (const p of pinsWithSignal(c, sig)) delete c.pins[p];
  }
  if (timerActive(c.tims[tim])) addOrder(c, tim);
  else removeOrder(c, tim);
  return c;
}

export function setTimerClockSource(cfg: MxConfig, tim: TimerName, src: TimCfg['clockSource']): MxConfig {
  const c = structuredClone(cfg);
  c.tims[tim].clockSource = src;
  if (timerActive(c.tims[tim])) addOrder(c, tim);
  else removeOrder(c, tim);
  return c;
}

export function setUsart2Mode(cfg: MxConfig, mode: UartCfg['mode']): MxConfig {
  const c = structuredClone(cfg);
  c.usart2.mode = mode;
  if (mode === 'Asynchronous') {
    if (!pinsWithSignal(c, 'USART2_TX').length) c.pins.PA2 = { signal: 'USART2_TX', label: c.pins.PA2?.label };
    if (!pinsWithSignal(c, 'USART2_RX').length) c.pins.PA3 = { signal: 'USART2_RX', label: c.pins.PA3?.label };
    addOrder(c, 'USART2');
  } else {
    for (const p of [...pinsWithSignal(c, 'USART2_TX'), ...pinsWithSignal(c, 'USART2_RX')]) delete c.pins[p];
    removeOrder(c, 'USART2');
  }
  return c;
}

export function setAdcChannel(cfg: MxConfig, ch: number, on: boolean): MxConfig {
  const pin = Object.entries({ 0: 'PA0', 1: 'PA1', 2: 'PA2', 3: 'PA3', 4: 'PA4', 5: 'PA5', 6: 'PA6', 7: 'PA7', 8: 'PB0', 9: 'PB1', 10: 'PC0', 11: 'PC1', 12: 'PC2', 13: 'PC3', 14: 'PC4', 15: 'PC5' } as Record<string, string>).find(([k]) => Number(k) === ch)?.[1];
  if (!pin) return cfg;
  if (on) return assignSignal(cfg, pin, `ADC1_IN${ch}`);
  if (cfg.pins[pin]?.signal === `ADC1_IN${ch}`) return assignSignal(cfg, pin, 'Reset_State');
  return cfg;
}

export function setDebug(cfg: MxConfig, mode: MxConfig['debug']): MxConfig {
  const c = structuredClone(cfg);
  c.debug = mode;
  if (mode === 'Serial Wire') {
    c.pins.PA13 = { signal: 'SYS_JTMS-SWDIO', label: c.pins.PA13?.label ?? (c.board ? 'TMS' : undefined) };
    c.pins.PA14 = { signal: 'SYS_JTCK-SWCLK', label: c.pins.PA14?.label ?? (c.board ? 'TCK' : undefined) };
  } else {
    for (const p of ['PA13', 'PA14']) if (c.pins[p]?.signal.startsWith('SYS_')) delete c.pins[p];
  }
  return c;
}

export function setHse(cfg: MxConfig, mode: ClockCfg['hseMode']): MxConfig {
  const c = structuredClone(cfg);
  c.clock.hseMode = mode;
  if (mode === 'Disable') {
    for (const p of ['PH0', 'PH1']) if (c.pins[p]?.signal.startsWith('RCC_OSC')) delete c.pins[p];
    if (c.clock.pllSource === 'HSE') c.clock.pllSource = 'HSI';
    if (c.clock.sysclkSource === 'HSE') c.clock.sysclkSource = 'HSI';
  } else {
    c.pins.PH0 = { signal: 'RCC_OSC_IN', label: c.pins.PH0?.label };
    if (mode === 'Crystal/Ceramic Resonator') c.pins.PH1 = { signal: 'RCC_OSC_OUT', label: c.pins.PH1?.label };
    else if (c.pins.PH1?.signal === 'RCC_OSC_OUT') delete c.pins.PH1;
  }
  return c;
}

/** Identifier prefix from a user label, e.g. "LD2 [Green Led]" -> "LD2" */
export function labelIdent(label: string | undefined): string | null {
  if (!label) return null;
  const base = label.trim().split(/[\s[]/)[0];
  const id = base.replace(/[^A-Za-z0-9_]/g, '_');
  if (!id) return null;
  return /^\d/.test(id) ? '_' + id : id;
}

export function pinsSorted(pins: string[]): string[] {
  return [...pins].sort((a, b) => pinNumber(a) - pinNumber(b));
}

export { adcChannelOfPin, parsePin };
