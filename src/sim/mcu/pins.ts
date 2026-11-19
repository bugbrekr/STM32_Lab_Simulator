// STM32F401RE (LQFP64) pin data shared by the simulator and the CubeMX look-alike.

export type PortName = 'A' | 'B' | 'C' | 'D' | 'H';

export const LQFP64: string[] = [
  '', 'VBAT', 'PC13', 'PC14', 'PC15', 'PH0', 'PH1', 'NRST', 'PC0', 'PC1', 'PC2', 'PC3', 'VSSA', 'VDDA', 'PA0', 'PA1', 'PA2',
  'PA3', 'VSS', 'VDD', 'PA4', 'PA5', 'PA6', 'PA7', 'PC4', 'PC5', 'PB0', 'PB1', 'PB2', 'PB10', 'VCAP1', 'VSS', 'VDD',
  'PB12', 'PB13', 'PB14', 'PB15', 'PC6', 'PC7', 'PC8', 'PC9', 'PA8', 'PA9', 'PA10', 'PA11', 'PA12', 'PA13', 'VSS', 'VDD',
  'PA14', 'PA15', 'PC10', 'PC11', 'PC12', 'PD2', 'PB3', 'PB4', 'PB5', 'PB6', 'PB7', 'BOOT0', 'PB8', 'PB9', 'VSS', 'VDD',
];

export const GPIO_PINS = LQFP64.filter((p) => /^P[A-H]\d+$/.test(p));

export function pinNumber(pin: string): number {
  return LQFP64.indexOf(pin);
}

export function parsePin(pin: string): { port: PortName; n: number } {
  return { port: pin[1] as PortName, n: parseInt(pin.slice(2), 10) };
}

export const PORT_BASE: Record<string, number> = {
  A: 0x40020000,
  B: 0x40020400,
  C: 0x40020800,
  D: 0x40020c00,
  E: 0x40021000,
  H: 0x40021c00,
};

export const PORT_INDEX: Record<string, number> = { A: 0, B: 1, C: 2, D: 3, E: 4, H: 7 };

/** Alternate functions: pin -> [af, signal][] */
export const AF_TABLE: Record<string, [number, string][]> = {
  PA0: [[1, 'TIM2_CH1'], [2, 'TIM5_CH1'], [7, 'USART2_CTS']],
  PA1: [[1, 'TIM2_CH2'], [2, 'TIM5_CH2'], [7, 'USART2_RTS']],
  PA2: [[1, 'TIM2_CH3'], [2, 'TIM5_CH3'], [3, 'TIM9_CH1'], [7, 'USART2_TX']],
  PA3: [[1, 'TIM2_CH4'], [2, 'TIM5_CH4'], [3, 'TIM9_CH2'], [7, 'USART2_RX']],
  PA4: [[5, 'SPI1_NSS'], [7, 'USART2_CK']],
  PA5: [[1, 'TIM2_CH1'], [5, 'SPI1_SCK']],
  PA6: [[1, 'TIM1_BKIN'], [2, 'TIM3_CH1'], [5, 'SPI1_MISO']],
  PA7: [[1, 'TIM1_CH1N'], [2, 'TIM3_CH2'], [5, 'SPI1_MOSI']],
  PA8: [[0, 'RCC_MCO_1'], [1, 'TIM1_CH1'], [4, 'I2C3_SCL'], [7, 'USART1_CK']],
  PA9: [[1, 'TIM1_CH2'], [7, 'USART1_TX']],
  PA10: [[1, 'TIM1_CH3'], [7, 'USART1_RX']],
  PA11: [[1, 'TIM1_CH4'], [7, 'USART1_CTS'], [8, 'USART6_TX']],
  PA12: [[1, 'TIM1_ETR'], [7, 'USART1_RTS'], [8, 'USART6_RX']],
  PA13: [[0, 'SYS_JTMS-SWDIO']],
  PA14: [[0, 'SYS_JTCK-SWCLK']],
  PA15: [[0, 'SYS_JTDI'], [1, 'TIM2_CH1']],
  PB0: [[1, 'TIM1_CH2N'], [2, 'TIM3_CH3']],
  PB1: [[1, 'TIM1_CH3N'], [2, 'TIM3_CH4']],
  PB3: [[0, 'SYS_JTDO-SWO'], [1, 'TIM2_CH2']],
  PB4: [[0, 'SYS_JTRST'], [2, 'TIM3_CH1']],
  PB5: [[2, 'TIM3_CH2'], [4, 'I2C1_SMBA']],
  PB6: [[2, 'TIM4_CH1'], [4, 'I2C1_SCL'], [7, 'USART1_TX']],
  PB7: [[2, 'TIM4_CH2'], [4, 'I2C1_SDA'], [7, 'USART1_RX']],
  PB8: [[2, 'TIM4_CH3'], [3, 'TIM10_CH1'], [4, 'I2C1_SCL']],
  PB9: [[2, 'TIM4_CH4'], [3, 'TIM11_CH1'], [4, 'I2C1_SDA']],
  PB10: [[1, 'TIM2_CH3'], [4, 'I2C2_SCL']],
  PB12: [[1, 'TIM1_BKIN'], [4, 'I2C2_SMBA']],
  PB13: [[1, 'TIM1_CH1N']],
  PB14: [[1, 'TIM1_CH2N']],
  PB15: [[1, 'TIM1_CH3N']],
  PC6: [[2, 'TIM3_CH1'], [8, 'USART6_TX']],
  PC7: [[2, 'TIM3_CH2'], [8, 'USART6_RX']],
  PC8: [[2, 'TIM3_CH3']],
  PC9: [[0, 'RCC_MCO_2'], [2, 'TIM3_CH4']],
  PD2: [[2, 'TIM3_ETR']],
};

/** ADC1 channel -> pin */
export const ADC_CHANNEL_PIN: Record<number, string> = {
  0: 'PA0', 1: 'PA1', 2: 'PA2', 3: 'PA3', 4: 'PA4', 5: 'PA5', 6: 'PA6', 7: 'PA7', 8: 'PB0', 9: 'PB1',
  10: 'PC0', 11: 'PC1', 12: 'PC2', 13: 'PC3', 14: 'PC4', 15: 'PC5',
};

export function adcChannelOfPin(pin: string): number | null {
  for (const [ch, p] of Object.entries(ADC_CHANNEL_PIN)) if (p === pin) return Number(ch);
  return null;
}

/** Signals that a pin can take in the CubeMX pin menu. */
export function pinSignals(pin: string): string[] {
  const out = ['Reset_State', 'GPIO_Input', 'GPIO_Output', 'GPIO_Analog', `GPIO_EXTI${parsePin(pin).n}`];
  const ch = adcChannelOfPin(pin);
  if (ch !== null) out.push(`ADC1_IN${ch}`);
  for (const [, sig] of AF_TABLE[pin] ?? []) out.push(sig);
  if (pin === 'PH0') out.push('RCC_OSC_IN');
  if (pin === 'PH1') out.push('RCC_OSC_OUT');
  if (pin === 'PC14') out.push('RCC_OSC32_IN');
  if (pin === 'PC15') out.push('RCC_OSC32_OUT');
  return out;
}

export function afOf(pin: string, signal: string): number | null {
  const e = (AF_TABLE[pin] ?? []).find(([, s]) => s === signal);
  return e ? e[0] : null;
}

export function signalOfAf(pin: string, af: number): string | null {
  const e = (AF_TABLE[pin] ?? []).find(([a]) => a === af);
  return e ? e[1] : null;
}

export const TIMERS = ['TIM1', 'TIM2', 'TIM3', 'TIM4', 'TIM5', 'TIM9', 'TIM10', 'TIM11'] as const;
export type TimerName = (typeof TIMERS)[number];

export const TIMER_INFO: Record<TimerName, { base: number; apb: 1 | 2; channels: number; bits: 16 | 32; advanced: boolean; irq: number; irqName: string; rccBit: [string, number] }> = {
  TIM1: { base: 0x40010000, apb: 2, channels: 4, bits: 16, advanced: true, irq: 25, irqName: 'TIM1_UP_TIM10_IRQHandler', rccBit: ['APB2ENR', 0] },
  TIM2: { base: 0x40000000, apb: 1, channels: 4, bits: 32, advanced: false, irq: 28, irqName: 'TIM2_IRQHandler', rccBit: ['APB1ENR', 0] },
  TIM3: { base: 0x40000400, apb: 1, channels: 4, bits: 16, advanced: false, irq: 29, irqName: 'TIM3_IRQHandler', rccBit: ['APB1ENR', 1] },
  TIM4: { base: 0x40000800, apb: 1, channels: 4, bits: 16, advanced: false, irq: 30, irqName: 'TIM4_IRQHandler', rccBit: ['APB1ENR', 2] },
  TIM5: { base: 0x40000c00, apb: 1, channels: 4, bits: 32, advanced: false, irq: 50, irqName: 'TIM5_IRQHandler', rccBit: ['APB1ENR', 3] },
  TIM9: { base: 0x40014000, apb: 2, channels: 2, bits: 16, advanced: false, irq: 24, irqName: 'TIM1_BRK_TIM9_IRQHandler', rccBit: ['APB2ENR', 16] },
  TIM10: { base: 0x40014400, apb: 2, channels: 1, bits: 16, advanced: false, irq: 25, irqName: 'TIM1_UP_TIM10_IRQHandler', rccBit: ['APB2ENR', 17] },
  TIM11: { base: 0x40014800, apb: 2, channels: 1, bits: 16, advanced: false, irq: 26, irqName: 'TIM1_TRG_COM_TIM11_IRQHandler', rccBit: ['APB2ENR', 18] },
};

export const IRQ_HANDLERS: Record<number, string> = {
  6: 'EXTI0_IRQHandler', 7: 'EXTI1_IRQHandler', 8: 'EXTI2_IRQHandler', 9: 'EXTI3_IRQHandler', 10: 'EXTI4_IRQHandler',
  18: 'ADC_IRQHandler', 23: 'EXTI9_5_IRQHandler', 24: 'TIM1_BRK_TIM9_IRQHandler', 25: 'TIM1_UP_TIM10_IRQHandler',
  26: 'TIM1_TRG_COM_TIM11_IRQHandler', 27: 'TIM1_CC_IRQHandler', 28: 'TIM2_IRQHandler', 29: 'TIM3_IRQHandler', 30: 'TIM4_IRQHandler',
  37: 'USART1_IRQHandler', 38: 'USART2_IRQHandler', 40: 'EXTI15_10_IRQHandler', 50: 'TIM5_IRQHandler', 71: 'USART6_IRQHandler',
};

export const IRQ_NAMES: Record<number, string> = Object.fromEntries(Object.entries(IRQ_HANDLERS).map(([k, v]) => [k, v.replace('_IRQHandler', '_IRQn')]));

export function extiIrq(line: number): number {
  if (line <= 4) return 6 + line;
  if (line <= 9) return 23;
  return 40;
}
