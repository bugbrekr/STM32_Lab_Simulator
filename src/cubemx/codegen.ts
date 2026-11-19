// CubeMX-style code generation.
import { MxConfig, PinConfig, clockTree, isGpioSignal, labelIdent, pinsSorted, timerActive } from './model';
import { TIMERS, TIMER_INFO, TimerName, afOf, parsePin, IRQ_NAMES, extiIrq } from '../sim/mcu/pins';
import { DEFAULT_HAL_CONF } from '../sim/headers';

const YEAR = '2026';

function header(file: string, brief: string[]): string {
  return `/* USER CODE BEGIN Header */
/**
  ******************************************************************************
  * @file           : ${file}
${brief.map((b, i) => `  * ${i === 0 ? '@brief          : ' : '                  '}${b}`).join('\n')}
  ******************************************************************************
  * @attention
  *
  * Copyright (c) ${YEAR} STMicroelectronics.
  * All rights reserved.
  *
  * This software is licensed under terms that can be found in the LICENSE file
  * in the root directory of this software component.
  * If no LICENSE file comes with this software, it is provided AS-IS.
  *
  ******************************************************************************
  */
/* USER CODE END Header */`;
}

const uc = (name: string, indent = '') => `${indent}/* USER CODE BEGIN ${name} */\n\n${indent}/* USER CODE END ${name} */`;

function pinIdent(pin: string, p: PinConfig) {
  const id = labelIdent(p.label);
  const { n } = parsePin(pin);
  return id ? `${id}_Pin` : `GPIO_PIN_${n}`;
}
function portIdent(pin: string, p: PinConfig) {
  const id = labelIdent(p.label);
  return id ? `${id}_GPIO_Port` : `GPIO${pin[1]}`;
}

function activeTimers(c: MxConfig): TimerName[] {
  return TIMERS.filter((t) => timerActive(c.tims[t]));
}

function adcActive(c: MxConfig) {
  return c.adc1.channels.length > 0;
}
function usartActive(c: MxConfig) {
  return c.usart2.mode === 'Asynchronous';
}

/** Ports whose clocks MX_GPIO_Init enables, in package order. */
function usedPorts(c: MxConfig): string[] {
  const pins = pinsSorted(Object.keys(c.pins).filter((p) => /^P[A-H]\d+$/.test(p)));
  const ports: string[] = [];
  for (const p of pins) if (!ports.includes(p[1])) ports.push(p[1]);
  return ports;
}

function peripheralOrder(c: MxConfig): string[] {
  const active = new Set<string>();
  if (adcActive(c)) active.add('ADC1');
  if (usartActive(c)) active.add('USART2');
  for (const t of activeTimers(c)) active.add(t);
  const out = c.order.filter((p) => active.has(p));
  for (const p of active) if (!out.includes(p)) out.push(p);
  return out;
}

function initName(p: string) {
  if (p === 'USART2') return 'MX_USART2_UART_Init';
  return `MX_${p}_Init`;
}
function handleName(p: string) {
  if (p === 'ADC1') return 'hadc1';
  if (p === 'USART2') return 'huart2';
  return 'h' + p.toLowerCase();
}
function handleType(p: string) {
  if (p === 'ADC1') return 'ADC_HandleTypeDef';
  if (p === 'USART2') return 'UART_HandleTypeDef';
  return 'TIM_HandleTypeDef';
}

function timUsesPwm(c: MxConfig, t: TimerName) {
  return Object.values(c.tims[t].channels).some((ch) => ch.mode === 'PWM Generation');
}
function timHasOutputPins(c: MxConfig, t: TimerName) {
  return Object.entries(c.pins).some(([, p]) => p.signal.startsWith(t + '_CH'));
}

// ---------------- SystemClock_Config ----------------
function genSystemClock(c: MxConfig): string {
  const k = c.clock;
  const tree = clockTree(k);
  const usesPll = k.sysclkSource === 'PLLCLK';
  const usesHse = k.hseMode !== 'Disable' && (k.sysclkSource === 'HSE' || (usesPll && k.pllSource === 'HSE'));
  const oscTypes: string[] = [];
  if (usesHse) oscTypes.push('RCC_OSCILLATORTYPE_HSE');
  if (!usesHse || k.sysclkSource === 'HSI' || (usesPll && k.pllSource === 'HSI')) oscTypes.push('RCC_OSCILLATORTYPE_HSI');
  const lat = tree.hclk <= 30e6 ? 0 : tree.hclk <= 60e6 ? 1 : 2;
  const ahbDiv = `RCC_SYSCLK_DIV${k.ahb}`;
  const apb = (d: number) => `RCC_HCLK_DIV${d}`;
  let s = `/**
  * @brief System Clock Configuration
  * @retval None
  */
void SystemClock_Config(void)
{
  RCC_OscInitTypeDef RCC_OscInitStruct = {0};
  RCC_ClkInitTypeDef RCC_ClkInitStruct = {0};

  /** Configure the main internal regulator output voltage
  */
  __HAL_RCC_PWR_CLK_ENABLE();
  __HAL_PWR_VOLTAGESCALING_CONFIG(PWR_REGULATOR_VOLTAGE_SCALE2);

  /** Initializes the RCC Oscillators according to the specified parameters
  * in the RCC_OscInitTypeDef structure.
  */
  RCC_OscInitStruct.OscillatorType = ${oscTypes.join('|')};
`;
  if (usesHse) s += `  RCC_OscInitStruct.HSEState = ${k.hseMode === 'BYPASS Clock Source' ? 'RCC_HSE_BYPASS' : 'RCC_HSE_ON'};\n`;
  if (oscTypes.includes('RCC_OSCILLATORTYPE_HSI')) {
    s += `  RCC_OscInitStruct.HSIState = RCC_HSI_ON;\n  RCC_OscInitStruct.HSICalibrationValue = RCC_HSICALIBRATION_DEFAULT;\n`;
  }
  if (usesPll) {
    s += `  RCC_OscInitStruct.PLL.PLLState = RCC_PLL_ON;
  RCC_OscInitStruct.PLL.PLLSource = RCC_PLLSOURCE_${k.pllSource};
  RCC_OscInitStruct.PLL.PLLM = ${k.m};
  RCC_OscInitStruct.PLL.PLLN = ${k.n};
  RCC_OscInitStruct.PLL.PLLP = RCC_PLLP_DIV${k.p};
  RCC_OscInitStruct.PLL.PLLQ = ${k.q};
`;
  } else s += `  RCC_OscInitStruct.PLL.PLLState = RCC_PLL_NONE;\n`;
  s += `  if (HAL_RCC_OscConfig(&RCC_OscInitStruct) != HAL_OK)
  {
    Error_Handler();
  }

  /** Initializes the CPU, AHB and APB buses clocks
  */
  RCC_ClkInitStruct.ClockType = RCC_CLOCKTYPE_HCLK|RCC_CLOCKTYPE_SYSCLK
                              |RCC_CLOCKTYPE_PCLK1|RCC_CLOCKTYPE_PCLK2;
  RCC_ClkInitStruct.SYSCLKSource = RCC_SYSCLKSOURCE_${k.sysclkSource};
  RCC_ClkInitStruct.AHBCLKDivider = ${ahbDiv};
  RCC_ClkInitStruct.APB1CLKDivider = ${apb(k.apb1)};
  RCC_ClkInitStruct.APB2CLKDivider = ${apb(k.apb2)};

  if (HAL_RCC_ClockConfig(&RCC_ClkInitStruct, FLASH_LATENCY_${lat}) != HAL_OK)
  {
    Error_Handler();
  }
}
`;
  return s;
}

// ---------------- MX_ADC1_Init ----------------
function genAdc(c: MxConfig): string {
  const a = c.adc1;
  const ch = a.rankChannel ?? a.channels[0];
  return `/**
  * @brief ADC1 Initialization Function
  * @param None
  * @retval None
  */
static void MX_ADC1_Init(void)
{

  /* USER CODE BEGIN ADC1_Init 0 */

  /* USER CODE END ADC1_Init 0 */

  ADC_ChannelConfTypeDef sConfig = {0};

  /* USER CODE BEGIN ADC1_Init 1 */

  /* USER CODE END ADC1_Init 1 */

  /** Configure the global features of the ADC (Clock, Resolution, Data Alignment and number of conversion)
  */
  hadc1.Instance = ADC1;
  hadc1.Init.ClockPrescaler = ${a.clockPrescaler};
  hadc1.Init.Resolution = ${a.resolution};
  hadc1.Init.ScanConvMode = ${a.scan ? 'ENABLE' : 'DISABLE'};
  hadc1.Init.ContinuousConvMode = ${a.continuous ? 'ENABLE' : 'DISABLE'};
  hadc1.Init.DiscontinuousConvMode = ${a.discontinuous ? 'ENABLE' : 'DISABLE'};
  hadc1.Init.ExternalTrigConvEdge = ADC_EXTERNALTRIGCONVEDGE_NONE;
  hadc1.Init.ExternalTrigConv = ADC_SOFTWARE_START;
  hadc1.Init.DataAlign = ${a.dataAlign};
  hadc1.Init.NbrOfConversion = 1;
  hadc1.Init.DMAContinuousRequests = DISABLE;
  hadc1.Init.EOCSelection = ${a.eoc};
  if (HAL_ADC_Init(&hadc1) != HAL_OK)
  {
    Error_Handler();
  }

  /** Configure for the selected ADC regular channel its corresponding rank in the sequencer and its sample time.
  */
  sConfig.Channel = ADC_CHANNEL_${ch};
  sConfig.Rank = 1;
  sConfig.SamplingTime = ${a.samplingTime};
  if (HAL_ADC_ConfigChannel(&hadc1, &sConfig) != HAL_OK)
  {
    Error_Handler();
  }
  /* USER CODE BEGIN ADC1_Init 2 */

  /* USER CODE END ADC1_Init 2 */

}
`;
}

// ---------------- MX_TIMx_Init ----------------
function genTim(c: MxConfig, t: TimerName): string {
  const cfg = c.tims[t];
  const info = TIMER_INFO[t];
  const h = handleName(t);
  const internal = cfg.clockSource === 'Internal Clock';
  const pwmChs = ([1, 2, 3, 4] as const).filter((n) => cfg.channels[n].mode === 'PWM Generation');
  const ocChs = ([1, 2, 3, 4] as const).filter((n) => cfg.channels[n].mode === 'Output Compare No Output');
  const hasOut = pwmChs.length > 0 || ocChs.length > 0;
  let decl = '';
  if (internal) decl += `  TIM_ClockConfigTypeDef sClockSourceConfig = {0};\n`;
  if (hasOut || internal) decl += `  TIM_MasterConfigTypeDef sMasterConfig = {0};\n`;
  if (hasOut) decl += `  TIM_OC_InitTypeDef sConfigOC = {0};\n`;
  if (hasOut && info.advanced) decl += `  TIM_BreakDeadTimeConfigTypeDef sBreakDeadTimeConfig = {0};\n`;
  let s = `/**
  * @brief ${t} Initialization Function
  * @param None
  * @retval None
  */
static void MX_${t}_Init(void)
{

  /* USER CODE BEGIN ${t}_Init 0 */

  /* USER CODE END ${t}_Init 0 */

${decl}
  /* USER CODE BEGIN ${t}_Init 1 */

  /* USER CODE END ${t}_Init 1 */
  ${h}.Instance = ${t};
  ${h}.Init.Prescaler = ${cfg.prescaler};
  ${h}.Init.CounterMode = ${cfg.counterMode};
  ${h}.Init.Period = ${cfg.period};
  ${h}.Init.ClockDivision = ${cfg.clockDivision};
`;
  if (info.advanced) s += `  ${h}.Init.RepetitionCounter = ${cfg.repetition};\n`;
  s += `  ${h}.Init.AutoReloadPreload = ${cfg.autoReload};\n`;
  const errBlock = `  {\n    Error_Handler();\n  }\n`;
  if (internal) {
    s += `  if (HAL_TIM_Base_Init(&${h}) != HAL_OK)\n${errBlock}`;
    s += `  sClockSourceConfig.ClockSource = TIM_CLOCKSOURCE_INTERNAL;\n  if (HAL_TIM_ConfigClockSource(&${h}, &sClockSourceConfig) != HAL_OK)\n${errBlock}`;
  }
  if (pwmChs.length) s += `  if (HAL_TIM_PWM_Init(&${h}) != HAL_OK)\n${errBlock}`;
  else if (ocChs.length) s += `  if (HAL_TIM_OC_Init(&${h}) != HAL_OK)\n${errBlock}`;
  if (hasOut || internal) {
    s += `  sMasterConfig.MasterOutputTrigger = TIM_TRGO_RESET;\n  sMasterConfig.MasterSlaveMode = TIM_MASTERSLAVEMODE_DISABLE;\n  if (HAL_TIMEx_MasterConfigSynchronization(&${h}, &sMasterConfig) != HAL_OK)\n${errBlock}`;
  }
  let first = true;
  for (const n of [...pwmChs, ...ocChs]) {
    const ch = cfg.channels[n];
    const isPwm = ch.mode === 'PWM Generation';
    if (first) {
      s += `  sConfigOC.OCMode = ${isPwm ? ch.ocMode : 'TIM_OCMODE_TIMING'};\n  sConfigOC.Pulse = ${ch.pulse};\n  sConfigOC.OCPolarity = ${ch.polarity};\n`;
      if (info.advanced) s += `  sConfigOC.OCNPolarity = TIM_OCNPOLARITY_HIGH;\n`;
      s += `  sConfigOC.OCFastMode = ${ch.fast};\n`;
      if (info.advanced) s += `  sConfigOC.OCIdleState = TIM_OCIDLESTATE_RESET;\n  sConfigOC.OCNIdleState = TIM_OCNIDLESTATE_RESET;\n`;
      first = false;
    } else {
      s += `  sConfigOC.Pulse = ${ch.pulse};\n`;
    }
    s += `  if (HAL_TIM_${isPwm ? 'PWM' : 'OC'}_ConfigChannel(&${h}, &sConfigOC, TIM_CHANNEL_${n}) != HAL_OK)\n${errBlock}`;
  }
  if (hasOut && info.advanced) {
    s += `  sBreakDeadTimeConfig.OffStateRunMode = TIM_OSSR_DISABLE;
  sBreakDeadTimeConfig.OffStateIDLEMode = TIM_OSSI_DISABLE;
  sBreakDeadTimeConfig.LockLevel = TIM_LOCKLEVEL_OFF;
  sBreakDeadTimeConfig.DeadTime = 0;
  sBreakDeadTimeConfig.BreakState = TIM_BREAK_DISABLE;
  sBreakDeadTimeConfig.BreakPolarity = TIM_BREAKPOLARITY_HIGH;
  sBreakDeadTimeConfig.AutomaticOutput = TIM_AUTOMATICOUTPUT_DISABLE;
  if (HAL_TIMEx_ConfigBreakDeadTime(&${h}, &sBreakDeadTimeConfig) != HAL_OK)
${errBlock}`;
  }
  s += `  /* USER CODE BEGIN ${t}_Init 2 */\n\n  /* USER CODE END ${t}_Init 2 */\n`;
  if (pwmChs.length && timHasOutputPins(c, t)) s += `  HAL_TIM_MspPostInit(&${h});\n`;
  s += `\n}\n`;
  return s;
}

// ---------------- MX_USART2_UART_Init ----------------
function genUsart(c: MxConfig): string {
  const u = c.usart2;
  return `/**
  * @brief USART2 Initialization Function
  * @param None
  * @retval None
  */
static void MX_USART2_UART_Init(void)
{

  /* USER CODE BEGIN USART2_Init 0 */

  /* USER CODE END USART2_Init 0 */

  /* USER CODE BEGIN USART2_Init 1 */

  /* USER CODE END USART2_Init 1 */
  huart2.Instance = USART2;
  huart2.Init.BaudRate = ${u.baud};
  huart2.Init.WordLength = ${u.wordLength};
  huart2.Init.StopBits = ${u.stopBits};
  huart2.Init.Parity = ${u.parity};
  huart2.Init.Mode = ${u.direction};
  huart2.Init.HwFlowCtl = UART_HWCONTROL_NONE;
  huart2.Init.OverSampling = ${u.oversampling};
  if (HAL_UART_Init(&huart2) != HAL_OK)
  {
    Error_Handler();
  }
  /* USER CODE BEGIN USART2_Init 2 */

  /* USER CODE END USART2_Init 2 */

}
`;
}

// ---------------- MX_GPIO_Init ----------------
interface GpioGroup {
  port: string;
  pins: string[];
  kind: 'out' | 'in' | 'exti' | 'analog';
  cfg: PinConfig;
}

function gpioPins(c: MxConfig): string[] {
  return pinsSorted(Object.keys(c.pins).filter((p) => isGpioSignal(c.pins[p].signal)));
}

function gpioKind(p: PinConfig): GpioGroup['kind'] {
  if (p.signal === 'GPIO_Output') return 'out';
  if (p.signal === 'GPIO_Analog') return 'analog';
  if (p.signal.startsWith('GPIO_EXTI')) return 'exti';
  return 'in';
}

function gpioKey(p: PinConfig) {
  const k = gpioKind(p);
  if (k === 'out') return `out|${p.outMode}|${p.pull}|${p.speed}`;
  if (k === 'exti') return `exti|${p.extiMode}|${p.pull}`;
  if (k === 'analog') return 'analog';
  return `in|${p.pull}`;
}

function genGpio(c: MxConfig): string {
  const pins = gpioPins(c);
  const ports = usedPorts(c);
  let s = `/**
  * @brief GPIO Initialization Function
  * @param None
  * @retval None
  */
static void MX_GPIO_Init(void)
{
`;
  if (pins.length) s += `  GPIO_InitTypeDef GPIO_InitStruct = {0};\n`;
  s += `  /* USER CODE BEGIN MX_GPIO_Init_1 */\n\n  /* USER CODE END MX_GPIO_Init_1 */\n\n  /* GPIO Ports Clock Enable */\n`;
  for (const p of ports) s += `  __HAL_RCC_GPIO${p}_CLK_ENABLE();\n`;
  // output levels grouped by port+level
  const outs = pins.filter((p) => c.pins[p].signal === 'GPIO_Output');
  const levelGroups: { port: string; level: string; pins: string[] }[] = [];
  for (const p of outs) {
    const lv = c.pins[p].level ?? 'GPIO_PIN_RESET';
    let g = levelGroups.find((x) => x.port === p[1] && x.level === lv);
    if (!g) levelGroups.push((g = { port: p[1], level: lv, pins: [] }));
    g.pins.push(p);
  }
  for (const g of levelGroups) {
    const single = g.pins.length === 1;
    const port = single ? portIdent(g.pins[0], c.pins[g.pins[0]]) : `GPIO${g.port}`;
    s += `\n  /*Configure GPIO pin Output Level */\n  HAL_GPIO_WritePin(${port}, ${g.pins.map((p) => pinIdent(p, c.pins[p])).join('|')}, ${g.level});\n`;
  }
  // init groups
  const groups: GpioGroup[] = [];
  for (const p of pins) {
    const cfg = c.pins[p];
    const key = gpioKey(cfg);
    let g = groups.find((x) => x.port === p[1] && gpioKey(x.cfg) === key);
    if (!g) groups.push((g = { port: p[1], pins: [], kind: gpioKind(cfg), cfg }));
    g.pins.push(p);
  }
  for (const g of groups) {
    const names = g.pins.map((p) => (labelIdent(c.pins[p].label) ? `${labelIdent(c.pins[p].label)}_Pin` : p));
    const single = g.pins.length === 1;
    const port = single ? portIdent(g.pins[0], c.pins[g.pins[0]]) : `GPIO${g.port}`;
    s += `\n  /*Configure GPIO pin${single ? '' : 's'} : ${names.join(' ')} */\n`;
    s += `  GPIO_InitStruct.Pin = ${g.pins.map((p) => pinIdent(p, c.pins[p])).join('|')};\n`;
    const cfg = g.cfg;
    if (g.kind === 'out') {
      s += `  GPIO_InitStruct.Mode = ${cfg.outMode ?? 'GPIO_MODE_OUTPUT_PP'};\n  GPIO_InitStruct.Pull = ${cfg.pull ?? 'GPIO_NOPULL'};\n  GPIO_InitStruct.Speed = ${cfg.speed ?? 'GPIO_SPEED_FREQ_LOW'};\n`;
    } else if (g.kind === 'exti') {
      s += `  GPIO_InitStruct.Mode = ${cfg.extiMode ?? 'GPIO_MODE_IT_RISING'};\n  GPIO_InitStruct.Pull = ${cfg.pull ?? 'GPIO_NOPULL'};\n`;
    } else if (g.kind === 'analog') {
      s += `  GPIO_InitStruct.Mode = GPIO_MODE_ANALOG;\n  GPIO_InitStruct.Pull = GPIO_NOPULL;\n`;
    } else {
      s += `  GPIO_InitStruct.Mode = GPIO_MODE_INPUT;\n  GPIO_InitStruct.Pull = ${cfg.pull ?? 'GPIO_NOPULL'};\n`;
    }
    s += `  HAL_GPIO_Init(${port}, &GPIO_InitStruct);\n`;
  }
  // EXTI NVIC
  const irqs = extiIrqs(c);
  if (irqs.length) {
    s += `\n  /* EXTI interrupt init*/\n`;
    for (const irq of irqs) s += `  HAL_NVIC_SetPriority(${irq}, 0, 0);\n  HAL_NVIC_EnableIRQ(${irq});\n\n`;
    s = s.replace(/\n\n$/, '\n');
  }
  s += `\n  /* USER CODE BEGIN MX_GPIO_Init_2 */\n\n  /* USER CODE END MX_GPIO_Init_2 */\n}\n`;
  return s;
}

/** EXTI IRQ names enabled in NVIC for configured EXTI pins */
export function extiIrqs(c: MxConfig): string[] {
  const out: string[] = [];
  for (const [pin, p] of Object.entries(c.pins)) {
    if (!p.signal.startsWith('GPIO_EXTI')) continue;
    const irq = IRQ_NAMES[extiIrq(parsePin(pin).n)];
    if (c.extiNvic[irq] && !out.includes(irq)) out.push(irq);
  }
  return out.sort((a, b) => irqNum(a) - irqNum(b));
}
function irqNum(name: string) {
  for (const [k, v] of Object.entries(IRQ_NAMES)) if (v === name) return Number(k);
  return 999;
}

// ---------------- main.c ----------------
export function genMainC(c: MxConfig): string {
  const order = peripheralOrder(c);
  const handles = order.map((p) => `${handleType(p)} ${handleName(p)};\n`).join('\n');
  let s = header('main.c', ['Main program body']);
  s += `
/* Includes ------------------------------------------------------------------*/
#include "main.h"

/* Private includes ----------------------------------------------------------*/
${uc('Includes')}

/* Private typedef -----------------------------------------------------------*/
${uc('PTD')}

/* Private define ------------------------------------------------------------*/
${uc('PD')}

/* Private macro -------------------------------------------------------------*/
${uc('PM')}

/* Private variables ---------------------------------------------------------*/
${handles}
${uc('PV')}

/* Private function prototypes -----------------------------------------------*/
void SystemClock_Config(void);
static void MX_GPIO_Init(void);
${order.map((p) => `static void ${initName(p)}(void);\n`).join('')}${uc('PFP')}

/* Private user code ---------------------------------------------------------*/
${uc('0')}

/**
  * @brief  The application entry point.
  * @retval int
  */
int main(void)
{

  /* USER CODE BEGIN 1 */

  /* USER CODE END 1 */

  /* MCU Configuration--------------------------------------------------------*/

  /* Reset of all peripherals, Initializes the Flash interface and the Systick. */
  HAL_Init();

  /* USER CODE BEGIN Init */

  /* USER CODE END Init */

  /* Configure the system clock */
  SystemClock_Config();

  /* USER CODE BEGIN SysInit */

  /* USER CODE END SysInit */

  /* Initialize all configured peripherals */
  MX_GPIO_Init();
${order.map((p) => `  ${initName(p)}();\n`).join('')}  /* USER CODE BEGIN 2 */

  /* USER CODE END 2 */

  /* Infinite loop */
  /* USER CODE BEGIN WHILE */
  while (1)
  {
    /* USER CODE END WHILE */

    /* USER CODE BEGIN 3 */
  }
  /* USER CODE END 3 */
}

${genSystemClock(c)}
`;
  // CubeMX defines the init functions in a fixed peripheral order (ADC, TIMx, USART), independent of call order
  const rank = (p: string) => (p === 'ADC1' ? 0 : p.startsWith('TIM') ? 100 + Number(p.slice(3)) : 1000);
  for (const p of [...order].sort((a, b) => rank(a) - rank(b))) {
    if (p === 'ADC1') s += genAdc(c) + '\n';
    else if (p === 'USART2') s += genUsart(c) + '\n';
    else s += genTim(c, p as TimerName) + '\n';
  }
  s += genGpio(c);
  s += `
/* USER CODE BEGIN 4 */

/* USER CODE END 4 */

/**
  * @brief  This function is executed in case of error occurrence.
  * @retval None
  */
void Error_Handler(void)
{
  /* USER CODE BEGIN Error_Handler_Debug */
  /* User can add his own implementation to report the HAL error return state */
  __disable_irq();
  while (1)
  {
  }
  /* USER CODE END Error_Handler_Debug */
}
#ifdef USE_FULL_ASSERT
/**
  * @brief  Reports the name of the source file and the source line number
  *         where the assert_param error has occurred.
  * @param  file: pointer to the source file name
  * @param  line: assert_param error line source number
  * @retval None
  */
void assert_failed(uint8_t *file, uint32_t line)
{
  /* USER CODE BEGIN 6 */
  /* User can add his own implementation to report the file name and line number,
     ex: printf("Wrong parameters value: file %s on line %d\\r\\n", file, line) */
  /* USER CODE END 6 */
}
#endif /* USE_FULL_ASSERT */
`;
  return s;
}

// ---------------- main.h ----------------
export function genMainH(c: MxConfig): string {
  const pwmTimers = activeTimers(c).filter((t) => timUsesPwm(c, t) && timHasOutputPins(c, t));
  let defines = '';
  for (const pin of pinsSorted(Object.keys(c.pins))) {
    const p = c.pins[pin];
    const id = labelIdent(p.label);
    if (!id) continue;
    const { n } = parsePin(pin);
    defines += `#define ${id}_Pin GPIO_PIN_${n}\n#define ${id}_GPIO_Port GPIO${pin[1]}\n`;
    if (p.signal.startsWith('GPIO_EXTI')) defines += `#define ${id}_EXTI_IRQn ${IRQ_NAMES[extiIrq(n)]}\n`;
  }
  return `${header('main.h', ['Header for main.c file.', 'This file contains the common defines of the application.'])}

/* Define to prevent recursive inclusion -------------------------------------*/
#ifndef __MAIN_H
#define __MAIN_H

#ifdef __cplusplus
extern "C" {
#endif

/* Includes ------------------------------------------------------------------*/
#include "stm32f4xx_hal.h"

/* Private includes ----------------------------------------------------------*/
${uc('Includes')}

/* Exported types ------------------------------------------------------------*/
${uc('ET')}

/* Exported constants --------------------------------------------------------*/
${uc('EC')}

/* Exported macro ------------------------------------------------------------*/
${uc('EM')}
${pwmTimers.length ? '\nvoid HAL_TIM_MspPostInit(TIM_HandleTypeDef *htim);\n' : ''}
/* Exported functions prototypes ---------------------------------------------*/
void Error_Handler(void);

${uc('EFP')}

/* Private defines -----------------------------------------------------------*/
${defines}
/* USER CODE BEGIN Private defines */

/* USER CODE END Private defines */

#ifdef __cplusplus
}
#endif

#endif /* __MAIN_H */
`;
}

// ---------------- stm32f4xx_hal_msp.c ----------------
function afPinBlock(c: MxConfig, signals: string[], periph: string, modeLine: string, speed: string | null, afName: string | null): string {
  const pins = pinsSorted(Object.keys(c.pins).filter((p) => signals.includes(c.pins[p].signal)));
  if (!pins.length) return '';
  const ports: string[] = [];
  for (const p of pins) if (!ports.includes(p[1])) ports.push(p[1]);
  let s = '';
  for (const port of ports) s += `    __HAL_RCC_GPIO${port}_CLK_ENABLE();\n`;
  s += `    /**${periph} GPIO Configuration\n`;
  for (const p of pins) s += `    ${p.padEnd(13)}------> ${c.pins[p].signal}\n`;
  s += `    */\n`;
  for (const port of ports) {
    const pp = pins.filter((p) => p[1] === port);
    const single = pp.length === 1;
    s += `    GPIO_InitStruct.Pin = ${pp.map((p) => pinIdent(p, c.pins[p])).join('|')};\n`;
    s += `    GPIO_InitStruct.Mode = ${modeLine};\n    GPIO_InitStruct.Pull = GPIO_NOPULL;\n`;
    if (speed) s += `    GPIO_InitStruct.Speed = ${speed};\n`;
    if (afName) {
      const af = afOf(pp[0], c.pins[pp[0]].signal);
      s += `    GPIO_InitStruct.Alternate = GPIO_AF${af}_${afName};\n`;
    }
    s += `    HAL_GPIO_Init(${single ? portIdent(pp[0], c.pins[pp[0]]) : `GPIO${port}`}, &GPIO_InitStruct);\n\n`;
  }
  return s.replace(/\n\n$/, '\n');
}

export function genMspC(c: MxConfig): string {
  const timers = activeTimers(c);
  const pwmPost = timers.filter((t) => timUsesPwm(c, t) && timHasOutputPins(c, t));
  let s = `/* USER CODE BEGIN Header */
/**
  ******************************************************************************
  * @file         stm32f4xx_hal_msp.c
  * @brief        This file provides code for the MSP Initialization
  *               and de-Initialization codes.
  ******************************************************************************
  * @attention
  *
  * Copyright (c) ${YEAR} STMicroelectronics.
  * All rights reserved.
  *
  * This software is licensed under terms that can be found in the LICENSE file
  * in the root directory of this software component.
  * If no LICENSE file comes with this software, it is provided AS-IS.
  *
  ******************************************************************************
  */
/* USER CODE END Header */

/* Includes ------------------------------------------------------------------*/
#include "main.h"
/* USER CODE BEGIN Includes */

/* USER CODE END Includes */

/* Private typedef -----------------------------------------------------------*/
/* USER CODE BEGIN TD */

/* USER CODE END TD */

/* Private define ------------------------------------------------------------*/
/* USER CODE BEGIN Define */

/* USER CODE END Define */

/* Private macro -------------------------------------------------------------*/
/* USER CODE BEGIN Macro */

/* USER CODE END Macro */

/* Private variables ---------------------------------------------------------*/
/* USER CODE BEGIN PV */

/* USER CODE END PV */

/* Private function prototypes -----------------------------------------------*/
/* USER CODE BEGIN PFP */

/* USER CODE END PFP */

/* External functions --------------------------------------------------------*/
/* USER CODE BEGIN ExternalFunctions */

/* USER CODE END ExternalFunctions */

/* USER CODE BEGIN 0 */

/* USER CODE END 0 */
${pwmPost.length ? '\nvoid HAL_TIM_MspPostInit(TIM_HandleTypeDef *htim);\n' : ''}
/**
  * Initializes the Global MSP.
  */
void HAL_MspInit(void)
{

  /* USER CODE BEGIN MspInit 0 */

  /* USER CODE END MspInit 0 */

  __HAL_RCC_SYSCFG_CLK_ENABLE();
  __HAL_RCC_PWR_CLK_ENABLE();

  /* System interrupt init*/

  /* USER CODE BEGIN MspInit 1 */

  /* USER CODE END MspInit 1 */
}
`;
  if (adcActive(c)) {
    const sigs = c.adc1.channels.map((ch) => `ADC1_IN${ch}`);
    s += `
/**
  * @brief ADC MSP Initialization
  * This function configures the hardware resources used in this example
  * @param hadc: ADC handle pointer
  * @retval None
  */
void HAL_ADC_MspInit(ADC_HandleTypeDef* hadc)
{
  GPIO_InitTypeDef GPIO_InitStruct = {0};
  if(hadc->Instance==ADC1)
  {
    /* USER CODE BEGIN ADC1_MspInit 0 */

    /* USER CODE END ADC1_MspInit 0 */
    /* Peripheral clock enable */
    __HAL_RCC_ADC1_CLK_ENABLE();

${afPinBlock(c, sigs, 'ADC1', 'GPIO_MODE_ANALOG', null, null)}${c.adc1.nvic ? `\n    /* ADC1 interrupt Init */\n    HAL_NVIC_SetPriority(ADC_IRQn, 0, 0);\n    HAL_NVIC_EnableIRQ(ADC_IRQn);\n` : ''}    /* USER CODE BEGIN ADC1_MspInit 1 */

    /* USER CODE END ADC1_MspInit 1 */
  }

}

/**
  * @brief ADC MSP De-Initialization
  * This function freeze the hardware resources used in this example
  * @param hadc: ADC handle pointer
  * @retval None
  */
void HAL_ADC_MspDeInit(ADC_HandleTypeDef* hadc)
{
  if(hadc->Instance==ADC1)
  {
    /* USER CODE BEGIN ADC1_MspDeInit 0 */

    /* USER CODE END ADC1_MspDeInit 0 */
    /* Peripheral clock disable */
    __HAL_RCC_ADC1_CLK_DISABLE();

    /* USER CODE BEGIN ADC1_MspDeInit 1 */

    /* USER CODE END ADC1_MspDeInit 1 */
  }

}
`;
  }
  // timers: base vs pwm msp
  const baseTimers = timers.filter((t) => c.tims[t].clockSource === 'Internal Clock' || !Object.values(c.tims[t].channels).some((ch) => ch.mode !== 'Disable'));
  const pwmOnly = timers.filter((t) => !baseTimers.includes(t) && timUsesPwm(c, t));
  const ocOnly = timers.filter((t) => !baseTimers.includes(t) && !timUsesPwm(c, t));
  const timMsp = (kind: 'Base' | 'PWM' | 'OC', list: TimerName[], arg: string) => {
    if (!list.length) return '';
    let body = '';
    list.forEach((t, i) => {
      const irqName = TIMER_INFO[t].irqName.replace('_IRQHandler', '_IRQn');
      body += `  ${i === 0 ? 'if' : 'else if'}(${arg}->Instance==${t})\n  {\n    /* USER CODE BEGIN ${t}_MspInit 0 */\n\n    /* USER CODE END ${t}_MspInit 0 */\n    /* Peripheral clock enable */\n    __HAL_RCC_${t}_CLK_ENABLE();\n`;
      if (c.tims[t].nvic) body += `    /* ${t} interrupt Init */\n    HAL_NVIC_SetPriority(${irqName}, 0, 0);\n    HAL_NVIC_EnableIRQ(${irqName});\n`;
      body += `    /* USER CODE BEGIN ${t}_MspInit 1 */\n\n    /* USER CODE END ${t}_MspInit 1 */\n  }\n`;
    });
    return `
/**
  * @brief TIM_${kind} MSP Initialization
  * This function configures the hardware resources used in this example
  * @param ${arg}: TIM_${kind} handle pointer
  * @retval None
  */
void HAL_TIM_${kind}_MspInit(TIM_HandleTypeDef* ${arg})
{
${body}
}
`;
  };
  s += timMsp('Base', baseTimers, 'htim_base');
  s += timMsp('PWM', pwmOnly, 'htim_pwm');
  s += timMsp('OC', ocOnly, 'htim_oc');
  if (pwmPost.length) {
    let body = '';
    pwmPost.forEach((t, i) => {
      const sigs = [1, 2, 3, 4].map((n) => `${t}_CH${n}`);
      const af = Object.entries(c.pins).find(([, p]) => p.signal.startsWith(t + '_CH'));
      void af;
      body += `  ${i === 0 ? 'if' : 'else if'}(htim->Instance==${t})\n  {\n  /* USER CODE BEGIN ${t}_MspPostInit 0 */\n\n  /* USER CODE END ${t}_MspPostInit 0 */\n\n`;
      body += afPinBlock(c, sigs, t, 'GPIO_MODE_AF_PP', 'GPIO_SPEED_FREQ_LOW', t);
      body += `\n  /* USER CODE BEGIN ${t}_MspPostInit 1 */\n\n  /* USER CODE END ${t}_MspPostInit 1 */\n  }\n`;
    });
    s += `
void HAL_TIM_MspPostInit(TIM_HandleTypeDef* htim)
{
  GPIO_InitTypeDef GPIO_InitStruct = {0};
${body}
}
`;
  }
  if (usartActive(c)) {
    s += `
/**
  * @brief UART MSP Initialization
  * This function configures the hardware resources used in this example
  * @param huart: UART handle pointer
  * @retval None
  */
void HAL_UART_MspInit(UART_HandleTypeDef* huart)
{
  GPIO_InitTypeDef GPIO_InitStruct = {0};
  if(huart->Instance==USART2)
  {
    /* USER CODE BEGIN USART2_MspInit 0 */

    /* USER CODE END USART2_MspInit 0 */
    /* Peripheral clock enable */
    __HAL_RCC_USART2_CLK_ENABLE();

${afPinBlock(c, ['USART2_TX', 'USART2_RX'], 'USART2', 'GPIO_MODE_AF_PP', 'GPIO_SPEED_FREQ_VERY_HIGH', 'USART2')}${c.usart2.nvic ? `\n    /* USART2 interrupt Init */\n    HAL_NVIC_SetPriority(USART2_IRQn, 0, 0);\n    HAL_NVIC_EnableIRQ(USART2_IRQn);\n` : ''}    /* USER CODE BEGIN USART2_MspInit 1 */

    /* USER CODE END USART2_MspInit 1 */
  }

}

/**
  * @brief UART MSP De-Initialization
  * This function freeze the hardware resources used in this example
  * @param huart: UART handle pointer
  * @retval None
  */
void HAL_UART_MspDeInit(UART_HandleTypeDef* huart)
{
  if(huart->Instance==USART2)
  {
    /* USER CODE BEGIN USART2_MspDeInit 0 */

    /* USER CODE END USART2_MspDeInit 0 */
    /* Peripheral clock disable */
    __HAL_RCC_USART2_CLK_DISABLE();

    /* USER CODE BEGIN USART2_MspDeInit 1 */

    /* USER CODE END USART2_MspDeInit 1 */
  }

}
`;
  }
  s += `
/* USER CODE BEGIN 1 */

/* USER CODE END 1 */
`;
  return s;
}

// ---------------- stm32f4xx_it.c ----------------
export function genItC(c: MxConfig): string {
  const ext: string[] = [];
  const handlers: string[] = [];
  const irqHandler = (name: string, body: string) =>
    `/**\n  * @brief This function handles ${name.replace('_IRQHandler', '')} interrupt.\n  */\nvoid ${name}(void)\n{\n  /* USER CODE BEGIN ${name.replace('_IRQHandler', '_IRQn')} 0 */\n\n  /* USER CODE END ${name.replace('_IRQHandler', '_IRQn')} 0 */\n${body}  /* USER CODE BEGIN ${name.replace('_IRQHandler', '_IRQn')} 1 */\n\n  /* USER CODE END ${name.replace('_IRQHandler', '_IRQn')} 1 */\n}\n`;
  const entries: { irq: number; text: string }[] = [];
  if (adcActive(c) && c.adc1.nvic) {
    ext.push('extern ADC_HandleTypeDef hadc1;');
    entries.push({ irq: 18, text: irqHandler('ADC_IRQHandler', '  HAL_ADC_IRQHandler(&hadc1);\n') });
  }
  for (const t of activeTimers(c)) {
    if (!c.tims[t].nvic) continue;
    ext.push(`extern TIM_HandleTypeDef ${handleName(t)};`);
    entries.push({ irq: TIMER_INFO[t].irq, text: irqHandler(TIMER_INFO[t].irqName, `  HAL_TIM_IRQHandler(&${handleName(t)});\n`) });
  }
  if (usartActive(c) && c.usart2.nvic) {
    ext.push('extern UART_HandleTypeDef huart2;');
    entries.push({ irq: 38, text: irqHandler('USART2_IRQHandler', '  HAL_UART_IRQHandler(&huart2);\n') });
  }
  // EXTI
  const extiByIrq = new Map<string, string[]>();
  for (const pin of pinsSorted(Object.keys(c.pins))) {
    const p = c.pins[pin];
    if (!p.signal.startsWith('GPIO_EXTI')) continue;
    const irq = IRQ_NAMES[extiIrq(parsePin(pin).n)];
    if (!c.extiNvic[irq]) continue;
    if (!extiByIrq.has(irq)) extiByIrq.set(irq, []);
    extiByIrq.get(irq)!.push(pinIdent(pin, p));
  }
  for (const [irq, pins] of extiByIrq) {
    entries.push({ irq: irqNum(irq), text: irqHandler(irq.replace('_IRQn', '_IRQHandler'), pins.map((p) => `  HAL_GPIO_EXTI_IRQHandler(${p});\n`).join('')) });
  }
  entries.sort((a, b) => a.irq - b.irq);
  handlers.push(...entries.map((e) => e.text));
  const sys = (name: string, desc: string, loop: boolean, inner = '') =>
    `/**\n  * @brief This function handles ${desc}.\n  */\nvoid ${name}(void)\n{\n  /* USER CODE BEGIN ${name.replace('_Handler', '_IRQn')} 0 */\n\n  /* USER CODE END ${name.replace('_Handler', '_IRQn')} 0 */\n${inner}${loop ? `  while (1)\n  {\n    /* USER CODE BEGIN W1_${name.replace('_Handler', '_IRQn')} 0 */\n    /* USER CODE END W1_${name.replace('_Handler', '_IRQn')} 0 */\n  }\n` : `  /* USER CODE BEGIN ${name.replace('_Handler', '_IRQn')} 1 */\n\n  /* USER CODE END ${name.replace('_Handler', '_IRQn')} 1 */\n`}}\n`;
  return `/* USER CODE BEGIN Header */
/**
  ******************************************************************************
  * @file    stm32f4xx_it.c
  * @brief   Interrupt Service Routines.
  ******************************************************************************
  * @attention
  *
  * Copyright (c) ${YEAR} STMicroelectronics.
  * All rights reserved.
  *
  * This software is licensed under terms that can be found in the LICENSE file
  * in the root directory of this software component.
  * If no LICENSE file comes with this software, it is provided AS-IS.
  *
  ******************************************************************************
  */
/* USER CODE END Header */

/* Includes ------------------------------------------------------------------*/
#include "main.h"
#include "stm32f4xx_it.h"
/* Private includes ----------------------------------------------------------*/
/* USER CODE BEGIN Includes */
/* USER CODE END Includes */

/* Private typedef -----------------------------------------------------------*/
/* USER CODE BEGIN TD */

/* USER CODE END TD */

/* Private define ------------------------------------------------------------*/
/* USER CODE BEGIN PD */

/* USER CODE END PD */

/* Private macro -------------------------------------------------------------*/
/* USER CODE BEGIN PM */

/* USER CODE END PM */

/* Private variables ---------------------------------------------------------*/
/* USER CODE BEGIN PV */

/* USER CODE END PV */

/* Private function prototypes -----------------------------------------------*/
/* USER CODE BEGIN PFP */

/* USER CODE END PFP */

/* Private user code ---------------------------------------------------------*/
/* USER CODE BEGIN 0 */

/* USER CODE END 0 */

/* External variables --------------------------------------------------------*/
${ext.join('\n')}${ext.length ? '\n' : ''}/* USER CODE BEGIN EV */

/* USER CODE END EV */

/******************************************************************************/
/*           Cortex-M4 Processor Interruption and Exception Handlers          */
/******************************************************************************/
${sys('NMI_Handler', 'Non maskable interrupt', false)}
${sys('HardFault_Handler', 'Hard fault interrupt', true)}
${sys('MemManage_Handler', 'Memory management fault', true)}
${sys('BusFault_Handler', 'Pre-fetch fault, memory access fault', true)}
${sys('UsageFault_Handler', 'Undefined instruction or illegal state', true)}
${sys('SVC_Handler', 'System service call via SWI instruction', false)}
${sys('DebugMon_Handler', 'Debug monitor', false)}
${sys('PendSV_Handler', 'Pendable request for system service', false)}
${sys('SysTick_Handler', 'System tick timer', false, '  HAL_IncTick();\n')}
/******************************************************************************/
/* STM32F4xx Peripheral Interrupt Handlers                                    */
/* Add here the Interrupt Handlers for the used peripherals.                  */
/* For the available peripheral interrupt handler names,                      */
/* please refer to the startup file (startup_stm32f4xx.s).                    */
/******************************************************************************/

${handlers.join('\n')}
/* USER CODE BEGIN 1 */

/* USER CODE END 1 */
`;
}

export function genItH(c: MxConfig): string {
  const decls: string[] = ['NMI_Handler', 'HardFault_Handler', 'MemManage_Handler', 'BusFault_Handler', 'UsageFault_Handler', 'SVC_Handler', 'DebugMon_Handler', 'PendSV_Handler', 'SysTick_Handler'];
  if (adcActive(c) && c.adc1.nvic) decls.push('ADC_IRQHandler');
  for (const t of activeTimers(c)) if (c.tims[t].nvic) decls.push(TIMER_INFO[t].irqName);
  if (usartActive(c) && c.usart2.nvic) decls.push('USART2_IRQHandler');
  for (const irq of extiIrqs(c)) decls.push(irq.replace('_IRQn', '_IRQHandler'));
  return `/* USER CODE BEGIN Header */
/**
  ******************************************************************************
  * @file    stm32f4xx_it.h
  * @brief   This file contains the headers of the interrupt handlers.
  ******************************************************************************
  */
/* USER CODE END Header */

/* Define to prevent recursive inclusion -------------------------------------*/
#ifndef __STM32F4xx_IT_H
#define __STM32F4xx_IT_H

#ifdef __cplusplus
extern "C" {
#endif

/* Private includes ----------------------------------------------------------*/
/* USER CODE BEGIN Includes */

/* USER CODE END Includes */

/* Exported functions prototypes ---------------------------------------------*/
${[...new Set(decls)].map((d) => `void ${d}(void);`).join('\n')}
/* USER CODE BEGIN EFP */

/* USER CODE END EFP */

#ifdef __cplusplus
}
#endif

#endif /* __STM32F4xx_IT_H */
`;
}

// ---------------- .ioc ----------------
export function genIoc(c: MxConfig): string {
  const lines: string[] = ['#MicroXplorer Configuration settings - do not modify', 'CAD.formats=', 'File.Version=6', 'KeepUserPlacement=false'];
  const ips = ['NVIC', 'RCC', 'SYS', ...peripheralOrder(c)];
  ips.forEach((ip, i) => lines.push(`Mcu.IP${i}=${ip}`));
  lines.push(`Mcu.IPNb=${ips.length}`, 'Mcu.Family=STM32F4', 'Mcu.Name=STM32F401R(D-E)Tx', 'Mcu.Package=LQFP64', 'Mcu.UserName=STM32F401RETx', `Mcu.UserConstraints=`);
  const pins = pinsSorted(Object.keys(c.pins));
  pins.forEach((p, i) => lines.push(`Mcu.Pin${i}=${p}`));
  lines.push(`Mcu.PinsNb=${pins.length}`);
  if (c.board) lines.push(`board=${c.board}`);
  for (const p of pins) {
    const pc = c.pins[p];
    lines.push(`${p}.Signal=${pc.signal}`);
    if (pc.label) lines.push(`${p}.GPIO_Label=${pc.label}`);
    if (pc.pull) lines.push(`${p}.GPIO_PuPd=${pc.pull}`);
    if (pc.level) lines.push(`${p}.PinState=${pc.level}`);
    if (pc.outMode) lines.push(`${p}.GPIO_ModeDefaultOutputPP=${pc.outMode}`);
    if (pc.extiMode) lines.push(`${p}.GPIO_ModeDefaultEXTI=${pc.extiMode}`);
    if (pc.speed) lines.push(`${p}.GPIO_Speed=${pc.speed}`);
  }
  const tree = clockTree(c.clock);
  lines.push(`RCC.SYSCLKFreq_VALUE=${Math.round(tree.sysclk)}`, `RCC.HCLKFreq_Value=${Math.round(tree.hclk)}`, `RCC.APB1Freq_Value=${Math.round(tree.pclk1)}`, `RCC.APB2Freq_Value=${Math.round(tree.pclk2)}`);
  lines.push(`RCC.PLLM=${c.clock.m}`, `RCC.PLLN=${c.clock.n}`, `RCC.PLLP=RCC_PLLP_DIV${c.clock.p}`, `RCC.PLLQ=${c.clock.q}`, `RCC.SYSCLKSource=RCC_SYSCLKSOURCE_${c.clock.sysclkSource}`);
  if (adcActive(c)) lines.push(`ADC1.Channel-0\\#ChannelRegularConversion=ADC_CHANNEL_${c.adc1.rankChannel ?? c.adc1.channels[0]}`, `ADC1.ClockPrescaler=${c.adc1.clockPrescaler}`);
  for (const t of activeTimers(c)) lines.push(`${t}.Prescaler=${c.tims[t].prescaler}`, `${t}.Period=${c.tims[t].period}`);
  if (usartActive(c)) lines.push(`USART2.BaudRate=${c.usart2.baud}`, 'USART2.VirtualMode=VM_ASYNC');
  lines.push(`ProjectManager.ProjectName=${c.name}`, 'ProjectManager.TargetToolchain=STM32CubeIDE', 'ProjectManager.FirmwarePackage=STM32Cube FW_F4 V1.28.1', 'ProjectManager.NoMain=false');
  lines.push(`# simulator-config ${JSON.stringify(c)}`);
  return lines.join('\n') + '\n';
}

export function parseIoc(text: string): MxConfig | null {
  const m = /^# simulator-config (.*)$/m.exec(text);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

// ---------------- whole project ----------------
export function generatedFiles(c: MxConfig): Record<string, string> {
  return {
    'Core/Inc/main.h': genMainH(c),
    'Core/Inc/stm32f4xx_hal_conf.h': DEFAULT_HAL_CONF,
    'Core/Inc/stm32f4xx_it.h': genItH(c),
    'Core/Src/main.c': genMainC(c),
    'Core/Src/stm32f4xx_hal_msp.c': genMspC(c),
    'Core/Src/stm32f4xx_it.c': genItC(c),
  };
}

/** Files that are part of every project but not compiled by the simulator (display only). */
export function staticFiles(c: MxConfig): Record<string, string> {
  const name = c.name;
  return {
    'Core/Src/syscalls.c': SYSCALLS,
    'Core/Src/sysmem.c': SYSMEM,
    'Core/Src/system_stm32f4xx.c': '/* CMSIS Cortex-M4 Device Peripheral Access Layer System Source File.\n * Provided by the simulator (SystemCoreClock, SystemInit). */\n',
    'Core/Startup/startup_stm32f401retx.s': '/* Startup file: vector table, Reset_Handler (copies .data, zeroes .bss, calls SystemInit and main).\n * The simulator performs these steps internally. */\n',
    'Drivers/CMSIS/Include/core_cm4.h': '/* CMSIS Cortex-M4 core header (built into the simulator) */\n',
    'Drivers/CMSIS/Device/ST/STM32F4xx/Include/stm32f401xe.h': '/* STM32F401xE device header (built into the simulator) */\n',
    'Drivers/STM32F4xx_HAL_Driver/Inc/stm32f4xx_hal.h': '/* STM32F4 HAL (built into the simulator: GPIO, RCC, ADC, TIM, UART, CORTEX) */\n',
    'Drivers/STM32F4xx_HAL_Driver/Src/stm32f4xx_hal.c': '/* HAL core (implemented natively by the simulator) */\n',
    'Drivers/STM32F4xx_HAL_Driver/Src/stm32f4xx_hal_gpio.c': '/* HAL GPIO (implemented natively by the simulator) */\n',
    'Drivers/STM32F4xx_HAL_Driver/Src/stm32f4xx_hal_adc.c': '/* HAL ADC (implemented natively by the simulator) */\n',
    'Drivers/STM32F4xx_HAL_Driver/Src/stm32f4xx_hal_tim.c': '/* HAL TIM (implemented natively by the simulator) */\n',
    'Drivers/STM32F4xx_HAL_Driver/Src/stm32f4xx_hal_uart.c': '/* HAL UART (implemented natively by the simulator) */\n',
    'Drivers/STM32F4xx_HAL_Driver/Src/stm32f4xx_hal_rcc.c': '/* HAL RCC (implemented natively by the simulator) */\n',
    'STM32F401RETX_FLASH.ld': '/* Linker script: FLASH 512K @ 0x08000000, RAM 96K @ 0x20000000 */\n',
    [`${name} Debug.launch`]: '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n<launchConfiguration type="com.st.stm32cube.ide.mcu.debug.launch.launchConfigurationType"/>\n',
  };
}

const SYSCALLS = `/**
 ******************************************************************************
 * @file      syscalls.c
 * @brief     STM32CubeIDE Minimal System calls file
 *
 *            For more information about which c-functions
 *            need which of these lowlevel functions
 *            please consult the Newlib libc-manual
 ******************************************************************************
 */

/* Includes */
#include <stdio.h>

extern int __io_putchar(int ch) __attribute__((weak));
extern int __io_getchar(void) __attribute__((weak));

/*
 * _write() sends every character printed by printf() to __io_putchar().
 * Define __io_putchar() in main.c to redirect printf to a UART.
 * (The simulator implements this file internally.)
 */
`;

const SYSMEM = `/**
 ******************************************************************************
 * @file      sysmem.c
 * @brief     STM32CubeIDE System Memory calls file (_sbrk for malloc)
 ******************************************************************************
 */
`;

export const COMPILED_SOURCES = ['Core/Src/main.c', 'Core/Src/stm32f4xx_hal_msp.c', 'Core/Src/stm32f4xx_it.c'];

// ---------------- USER CODE merge ----------------
const BLOCK_RE = /\/\* USER CODE BEGIN ([^*]+?) \*\/([\s\S]*?)\/\* USER CODE END \1 \*\//g;

export function userBlocks(text: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const x of text.matchAll(BLOCK_RE)) m.set(x[1].trim(), x[2]);
  return m;
}

/** Replace USER CODE block contents of `fresh` with those from `old`. */
export function mergeUserCode(fresh: string, old: string): string {
  const blocks = userBlocks(old);
  return fresh.replace(BLOCK_RE, (all, name: string, _body: string) => {
    const k = name.trim();
    if (!blocks.has(k)) return all;
    return `/* USER CODE BEGIN ${name} */${blocks.get(k)}/* USER CODE END ${name} */`;
  });
}

function stripBlocks(text: string): string[] {
  return text
    .replace(BLOCK_RE, (_a, name: string) => `/* USER CODE BEGIN ${name} */ /* USER CODE END ${name} */`)
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

/**
 * Lines in `current` (outside USER CODE blocks) that are not in the pristine generated
 * file — they would be lost on regeneration. Also reports user blocks that disappear.
 */
export function lostCode(current: string, pristine: string, fresh: string): string[] {
  const base = new Map<string, number>();
  for (const l of stripBlocks(pristine)) base.set(l, (base.get(l) ?? 0) + 1);
  const lost: string[] = [];
  for (const l of stripBlocks(current)) {
    const n = base.get(l) ?? 0;
    if (n > 0) base.set(l, n - 1);
    else lost.push(l);
  }
  const freshBlocks = userBlocks(fresh);
  for (const [name, body] of userBlocks(current)) {
    if (!freshBlocks.has(name) && body.trim()) lost.push(`/* USER CODE ${name} */ ${body.trim().split('\n')[0]}…`);
  }
  return lost;
}
