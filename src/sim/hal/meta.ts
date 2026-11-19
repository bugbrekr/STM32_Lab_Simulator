// Native (simulator-implemented) functions: generator flag and cycle cost.
import type { NativeMeta } from '../cc/codegen';

const G = (cost: number): NativeMeta => ({ gen: true, cost });
const F = (cost: number): NativeMeta => ({ gen: false, cost });

export const NATIVE_META: Record<string, NativeMeta> = {
  // core
  HAL_Init: G(400), HAL_DeInit: G(100), HAL_InitTick: F(80), HAL_IncTick: F(10), HAL_Delay: G(40), HAL_GetTick: F(12),
  HAL_GetTickPrio: F(8), HAL_SuspendTick: F(10), HAL_ResumeTick: F(10), HAL_GetHalVersion: F(6), HAL_GetREVID: F(8),
  HAL_GetDEVID: F(8), HAL_GetUIDw0: F(8), HAL_MspInit: F(4), HAL_MspDeInit: F(4),
  // cortex
  HAL_NVIC_SetPriorityGrouping: F(30), HAL_NVIC_SetPriority: F(60), HAL_NVIC_EnableIRQ: F(20), HAL_NVIC_DisableIRQ: F(20),
  HAL_NVIC_SystemReset: F(20), HAL_SYSTICK_Config: F(40), HAL_SYSTICK_CLKSourceConfig: F(20), HAL_NVIC_SetPendingIRQ: F(20),
  HAL_NVIC_ClearPendingIRQ: F(20), HAL_SYSTICK_IRQHandler: G(10), HAL_SYSTICK_Callback: F(4),
  __disable_irq: F(1), __enable_irq: F(1), __NOP: F(1), __WFI: G(2), __WFE: G(2), __DSB: F(4), __ISB: F(4), __DMB: F(4), __SEV: F(1),
  __get_PRIMASK: F(2), __set_PRIMASK: F(2), __RBIT: F(1), __CLZ: F(1), __REV: F(1),
  NVIC_EnableIRQ: F(10), NVIC_DisableIRQ: F(10), NVIC_SetPriority: F(20), NVIC_SystemReset: F(10), SysTick_Config: F(30),
  SystemInit: F(60), SystemCoreClockUpdate: F(80),
  // rcc
  HAL_RCC_OscConfig: F(1500), HAL_RCC_ClockConfig: F(900), HAL_RCC_GetSysClockFreq: F(60), HAL_RCC_GetHCLKFreq: F(10),
  HAL_RCC_GetPCLK1Freq: F(30), HAL_RCC_GetPCLK2Freq: F(30), HAL_RCC_MCOConfig: F(100),
  // gpio
  HAL_GPIO_Init: F(160), HAL_GPIO_DeInit: F(120), HAL_GPIO_ReadPin: F(22), HAL_GPIO_WritePin: F(24), HAL_GPIO_TogglePin: F(28),
  HAL_GPIO_LockPin: F(40), HAL_GPIO_EXTI_IRQHandler: G(30), HAL_GPIO_EXTI_Callback: F(4),
  // adc
  HAL_ADC_Init: G(300), HAL_ADC_DeInit: G(100), HAL_ADC_MspInit: F(4), HAL_ADC_MspDeInit: F(4), HAL_ADC_ConfigChannel: F(110),
  HAL_ADC_Start: F(90), HAL_ADC_Stop: F(40), HAL_ADC_PollForConversion: F(60), HAL_ADC_GetValue: F(14), HAL_ADC_Start_IT: F(100),
  HAL_ADC_Stop_IT: F(50), HAL_ADC_IRQHandler: G(60), HAL_ADC_ConvCpltCallback: F(4), HAL_ADC_GetState: F(8), HAL_ADC_GetError: F(8),
  // tim
  HAL_TIM_Base_Init: G(200), HAL_TIM_Base_DeInit: G(100), HAL_TIM_Base_MspInit: F(4), HAL_TIM_Base_MspDeInit: F(4),
  HAL_TIM_Base_Start: F(50), HAL_TIM_Base_Stop: F(40), HAL_TIM_Base_Start_IT: F(60), HAL_TIM_Base_Stop_IT: F(50),
  HAL_TIM_PWM_Init: G(200), HAL_TIM_PWM_DeInit: G(100), HAL_TIM_PWM_MspInit: F(4), HAL_TIM_PWM_MspDeInit: F(4),
  HAL_TIM_PWM_ConfigChannel: F(160), HAL_TIM_PWM_Start: F(80), HAL_TIM_PWM_Stop: F(70), HAL_TIM_OC_Init: G(200),
  HAL_TIM_OC_MspInit: F(4), HAL_TIM_OC_ConfigChannel: F(140), HAL_TIM_OC_Start: F(80), HAL_TIM_OC_Stop: F(70),
  HAL_TIM_ConfigClockSource: F(90), HAL_TIMEx_MasterConfigSynchronization: F(60), HAL_TIMEx_ConfigBreakDeadTime: F(60),
  HAL_TIM_IRQHandler: G(80), HAL_TIM_PeriodElapsedCallback: F(4), HAL_TIM_Base_GetState: F(8),
  // uart
  HAL_UART_Init: G(300), HAL_UART_DeInit: G(100), HAL_UART_MspInit: F(4), HAL_UART_MspDeInit: F(4), HAL_UART_Transmit: G(60),
  HAL_UART_Receive: G(60), HAL_UART_Transmit_IT: F(80), HAL_UART_Receive_IT: F(80), HAL_UART_AbortReceive: F(40),
  HAL_UART_IRQHandler: G(80), HAL_UART_TxCpltCallback: F(4), HAL_UART_RxCpltCallback: F(4), HAL_UART_ErrorCallback: F(4),
  HAL_UART_GetState: F(8),
  // libc
  printf: G(900), sprintf: F(900), snprintf: F(900), puts: G(300), putchar: G(60), fflush: G(40), fputs: G(300), fputc: G(60),
  getchar: G(60), setvbuf: F(40),
  strlen: F(20), strcpy: F(30), strncpy: F(30), strcat: F(40), strncat: F(40), strcmp: F(30), strncmp: F(30), strchr: F(30),
  strstr: F(60), memset: F(30), memcpy: F(30), memmove: F(30), memcmp: F(30),
  abs: F(4), labs: F(4), atoi: F(60), atol: F(60), rand: F(40), srand: F(10),
  sqrt: F(400), sqrtf: F(20), pow: F(1800), powf: F(600), fabs: F(10), fabsf: F(4), sin: F(1500), sinf: F(400), cos: F(1500),
  cosf: F(400), tan: F(1800), tanf: F(500), atan: F(1500), atan2: F(1800), atan2f: F(500), exp: F(1500), log: F(1500),
  log10: F(1600), logf: F(400), floor: F(80), ceil: F(80), round: F(80), roundf: F(30), fmod: F(300),
};
