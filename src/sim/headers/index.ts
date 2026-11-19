// Virtual system headers for the simulator's C compiler.

const STDINT = `#ifndef _STDINT_H
#define _STDINT_H
typedef signed char int8_t;
typedef unsigned char uint8_t;
typedef short int16_t;
typedef unsigned short uint16_t;
typedef long int32_t;
typedef unsigned long uint32_t;
typedef long long int64_t;
typedef unsigned long long uint64_t;
typedef int8_t int_least8_t; typedef uint8_t uint_least8_t;
typedef int16_t int_least16_t; typedef uint16_t uint_least16_t;
typedef int32_t int_least32_t; typedef uint32_t uint_least32_t;
typedef int int_fast8_t; typedef unsigned int uint_fast8_t;
typedef int int_fast16_t; typedef unsigned int uint_fast16_t;
typedef int int_fast32_t; typedef unsigned int uint_fast32_t;
typedef int intptr_t;
typedef unsigned int uintptr_t;
typedef long long intmax_t;
typedef unsigned long long uintmax_t;
#define INT8_MIN (-128)
#define INT8_MAX 127
#define UINT8_MAX 255
#define INT16_MIN (-32768)
#define INT16_MAX 32767
#define UINT16_MAX 65535
#define INT32_MIN (-2147483647L-1)
#define INT32_MAX 2147483647L
#define UINT32_MAX 4294967295UL
#define INT64_MAX 9223372036854775807LL
#define UINT64_MAX 18446744073709551615ULL
#endif
`;

const STDDEF = `#ifndef _STDDEF_H
#define _STDDEF_H
typedef unsigned int size_t;
typedef int ptrdiff_t;
typedef unsigned int wchar_t;
#ifndef NULL
#define NULL ((void*)0)
#endif
#define offsetof(type, member) ((size_t)&(((type*)0)->member))
#endif
`;

const STDBOOL = `#ifndef _STDBOOL_H
#define _STDBOOL_H
#define bool _Bool
#define true 1
#define false 0
#define __bool_true_false_are_defined 1
#endif
`;

const STDIO = `#ifndef _STDIO_H
#define _STDIO_H
#include <stddef.h>
#include <stdarg.h>
typedef struct __sFILE { int _fileno; } FILE;
#define stdin ((FILE*)0x08000010)
#define stdout ((FILE*)0x08000014)
#define stderr ((FILE*)0x08000018)
#define EOF (-1)
#define BUFSIZ 1024
int printf(const char *fmt, ...);
int sprintf(char *str, const char *fmt, ...);
int snprintf(char *str, size_t size, const char *fmt, ...);
int puts(const char *s);
int putchar(int c);
int fflush(FILE *stream);
int fputs(const char *s, FILE *stream);
int fputc(int c, FILE *stream);
int getchar(void);
void setvbuf(FILE *stream, char *buf, int mode, size_t size);
#define _IONBF 2
#define _IOLBF 1
#define _IOFBF 0
#endif
`;

const STDARG = `#ifndef _STDARG_H
#define _STDARG_H
typedef char* va_list;
#endif
`;

const STRING = `#ifndef _STRING_H
#define _STRING_H
#include <stddef.h>
size_t strlen(const char *s);
char *strcpy(char *dst, const char *src);
char *strncpy(char *dst, const char *src, size_t n);
char *strcat(char *dst, const char *src);
char *strncat(char *dst, const char *src, size_t n);
int strcmp(const char *a, const char *b);
int strncmp(const char *a, const char *b, size_t n);
char *strchr(const char *s, int c);
char *strstr(const char *h, const char *n);
void *memset(void *s, int c, size_t n);
void *memcpy(void *dst, const void *src, size_t n);
void *memmove(void *dst, const void *src, size_t n);
int memcmp(const void *a, const void *b, size_t n);
#endif
`;

const STDLIB = `#ifndef _STDLIB_H
#define _STDLIB_H
#include <stddef.h>
int abs(int x);
long labs(long x);
int atoi(const char *s);
long atol(const char *s);
int rand(void);
void srand(unsigned int seed);
#define RAND_MAX 2147483647
#define EXIT_SUCCESS 0
#define EXIT_FAILURE 1
#endif
`;

const MATH = `#ifndef _MATH_H
#define _MATH_H
double sqrt(double x); float sqrtf(float x);
double pow(double x, double y); float powf(float x, float y);
double fabs(double x); float fabsf(float x);
double sin(double x); float sinf(float x);
double cos(double x); float cosf(float x);
double tan(double x); float tanf(float x);
double atan(double x); double atan2(double y, double x); float atan2f(float y, float x);
double exp(double x); double log(double x); double log10(double x); float logf(float x);
double floor(double x); double ceil(double x); double round(double x); float roundf(float x);
double fmod(double x, double y);
#define M_PI 3.14159265358979323846
#define NAN (0.0f/0.0f)
#define INFINITY (1.0f/0.0f)
#endif
`;

function bits(prefix: string, count: number, f: (i: number) => string): string {
  let s = '';
  for (let i = 0; i < count; i++) s += `#define ${prefix}${i} ${f(i)}\n`;
  return s;
}

const DEVICE = `#ifndef __STM32F401xE_H
#define __STM32F401xE_H
#include <stdint.h>
#define __IO volatile
#define __I volatile const
#define __O volatile
#define __IM volatile const
#define __OM volatile
#define __IOM volatile
#define __STATIC_INLINE static inline
#define __INLINE inline
#define __weak __attribute__((weak))
#define __packed
#define __ALIGN_BEGIN
#define __ALIGN_END
#define __NOINLINE
#define __RAM_FUNC
#define UNUSED(X) (void)X
#define __NVIC_PRIO_BITS 4U
#define STM32F401xE 1
#define STM32F4 1

typedef enum { RESET = 0U, SET = !RESET } FlagStatus, ITStatus;
typedef enum { DISABLE = 0U, ENABLE = !DISABLE } FunctionalState;
typedef enum { SUCCESS = 0U, ERROR = !SUCCESS } ErrorStatus;

typedef enum {
  NonMaskableInt_IRQn = -14, HardFault_IRQn = -13, MemoryManagement_IRQn = -12, BusFault_IRQn = -11, UsageFault_IRQn = -10,
  SVCall_IRQn = -5, DebugMonitor_IRQn = -4, PendSV_IRQn = -2, SysTick_IRQn = -1,
  WWDG_IRQn = 0, PVD_IRQn = 1, TAMP_STAMP_IRQn = 2, RTC_WKUP_IRQn = 3, FLASH_IRQn = 4, RCC_IRQn = 5,
  EXTI0_IRQn = 6, EXTI1_IRQn = 7, EXTI2_IRQn = 8, EXTI3_IRQn = 9, EXTI4_IRQn = 10,
  ADC_IRQn = 18, EXTI9_5_IRQn = 23, TIM1_BRK_TIM9_IRQn = 24, TIM1_UP_TIM10_IRQn = 25, TIM1_TRG_COM_TIM11_IRQn = 26,
  TIM1_CC_IRQn = 27, TIM2_IRQn = 28, TIM3_IRQn = 29, TIM4_IRQn = 30, I2C1_EV_IRQn = 31, I2C1_ER_IRQn = 32,
  SPI1_IRQn = 35, USART1_IRQn = 37, USART2_IRQn = 38, EXTI15_10_IRQn = 40, RTC_Alarm_IRQn = 41, TIM5_IRQn = 50, USART6_IRQn = 71
} IRQn_Type;

typedef struct { __IO uint32_t MODER; __IO uint32_t OTYPER; __IO uint32_t OSPEEDR; __IO uint32_t PUPDR; __IO uint32_t IDR; __IO uint32_t ODR; __IO uint32_t BSRR; __IO uint32_t LCKR; __IO uint32_t AFR[2]; } GPIO_TypeDef;
typedef struct { __IO uint32_t SR; __IO uint32_t CR1; __IO uint32_t CR2; __IO uint32_t SMPR1; __IO uint32_t SMPR2; __IO uint32_t JOFR1; __IO uint32_t JOFR2; __IO uint32_t JOFR3; __IO uint32_t JOFR4; __IO uint32_t HTR; __IO uint32_t LTR; __IO uint32_t SQR1; __IO uint32_t SQR2; __IO uint32_t SQR3; __IO uint32_t JSQR; __IO uint32_t JDR1; __IO uint32_t JDR2; __IO uint32_t JDR3; __IO uint32_t JDR4; __IO uint32_t DR; } ADC_TypeDef;
typedef struct { __IO uint32_t CSR; __IO uint32_t CCR; __IO uint32_t CDR; } ADC_Common_TypeDef;
typedef struct { __IO uint32_t CR1; __IO uint32_t CR2; __IO uint32_t SMCR; __IO uint32_t DIER; __IO uint32_t SR; __IO uint32_t EGR; __IO uint32_t CCMR1; __IO uint32_t CCMR2; __IO uint32_t CCER; __IO uint32_t CNT; __IO uint32_t PSC; __IO uint32_t ARR; __IO uint32_t RCR; __IO uint32_t CCR1; __IO uint32_t CCR2; __IO uint32_t CCR3; __IO uint32_t CCR4; __IO uint32_t BDTR; __IO uint32_t DCR; __IO uint32_t DMAR; __IO uint32_t OR; } TIM_TypeDef;
typedef struct { __IO uint32_t SR; __IO uint32_t DR; __IO uint32_t BRR; __IO uint32_t CR1; __IO uint32_t CR2; __IO uint32_t CR3; __IO uint32_t GTPR; } USART_TypeDef;
typedef struct { __IO uint32_t CR; __IO uint32_t PLLCFGR; __IO uint32_t CFGR; __IO uint32_t CIR; __IO uint32_t AHB1RSTR; __IO uint32_t AHB2RSTR; uint32_t RESERVED0[2]; __IO uint32_t APB1RSTR; __IO uint32_t APB2RSTR; uint32_t RESERVED1[2]; __IO uint32_t AHB1ENR; __IO uint32_t AHB2ENR; uint32_t RESERVED2[2]; __IO uint32_t APB1ENR; __IO uint32_t APB2ENR; uint32_t RESERVED3[2]; __IO uint32_t AHB1LPENR; __IO uint32_t AHB2LPENR; uint32_t RESERVED4[2]; __IO uint32_t APB1LPENR; __IO uint32_t APB2LPENR; uint32_t RESERVED5[2]; __IO uint32_t BDCR; __IO uint32_t CSR; uint32_t RESERVED6[2]; __IO uint32_t SSCGR; __IO uint32_t PLLI2SCFGR; uint32_t RESERVED7; __IO uint32_t DCKCFGR; } RCC_TypeDef;
typedef struct { __IO uint32_t CR; __IO uint32_t CSR; } PWR_TypeDef;
typedef struct { __IO uint32_t ACR; __IO uint32_t KEYR; __IO uint32_t OPTKEYR; __IO uint32_t SR; __IO uint32_t CR; __IO uint32_t OPTCR; } FLASH_TypeDef;
typedef struct { __IO uint32_t MEMRMP; __IO uint32_t PMC; __IO uint32_t EXTICR[4]; uint32_t RESERVED[2]; __IO uint32_t CMPCR; } SYSCFG_TypeDef;
typedef struct { __IO uint32_t IMR; __IO uint32_t EMR; __IO uint32_t RTSR; __IO uint32_t FTSR; __IO uint32_t SWIER; __IO uint32_t PR; } EXTI_TypeDef;
typedef struct { __IO uint32_t CTRL; __IO uint32_t LOAD; __IO uint32_t VAL; __I uint32_t CALIB; } SysTick_Type;
typedef struct { __I uint32_t CPUID; __IO uint32_t ICSR; __IO uint32_t VTOR; __IO uint32_t AIRCR; __IO uint32_t SCR; __IO uint32_t CCR; __IO uint8_t SHP[12]; __IO uint32_t SHCSR; } SCB_Type;
typedef struct { __IO uint32_t ISER[8]; uint32_t RESERVED0[24]; __IO uint32_t ICER[8]; uint32_t RSERVED1[24]; __IO uint32_t ISPR[8]; uint32_t RESERVED2[24]; __IO uint32_t ICPR[8]; uint32_t RESERVED3[24]; __IO uint32_t IABR[8]; uint32_t RESERVED4[56]; __IO uint8_t IP[240]; } NVIC_Type;
typedef struct { __IO uint32_t SR; __IO uint32_t CR1; __IO uint32_t CR2; } DMA_Stream_TypeDef;

#define FLASH_BASE 0x08000000UL
#define SRAM1_BASE 0x20000000UL
#define PERIPH_BASE 0x40000000UL
#define APB1PERIPH_BASE PERIPH_BASE
#define APB2PERIPH_BASE (PERIPH_BASE + 0x00010000UL)
#define AHB1PERIPH_BASE (PERIPH_BASE + 0x00020000UL)
#define TIM2_BASE (APB1PERIPH_BASE + 0x0000UL)
#define TIM3_BASE (APB1PERIPH_BASE + 0x0400UL)
#define TIM4_BASE (APB1PERIPH_BASE + 0x0800UL)
#define TIM5_BASE (APB1PERIPH_BASE + 0x0C00UL)
#define USART2_BASE (APB1PERIPH_BASE + 0x4400UL)
#define I2C1_BASE (APB1PERIPH_BASE + 0x5400UL)
#define PWR_BASE (APB1PERIPH_BASE + 0x7000UL)
#define TIM1_BASE (APB2PERIPH_BASE + 0x0000UL)
#define USART1_BASE (APB2PERIPH_BASE + 0x1000UL)
#define USART6_BASE (APB2PERIPH_BASE + 0x1400UL)
#define ADC1_BASE (APB2PERIPH_BASE + 0x2000UL)
#define ADC1_COMMON_BASE (APB2PERIPH_BASE + 0x2300UL)
#define SYSCFG_BASE (APB2PERIPH_BASE + 0x3800UL)
#define EXTI_BASE (APB2PERIPH_BASE + 0x3C00UL)
#define TIM9_BASE (APB2PERIPH_BASE + 0x4000UL)
#define TIM10_BASE (APB2PERIPH_BASE + 0x4400UL)
#define TIM11_BASE (APB2PERIPH_BASE + 0x4800UL)
#define GPIOA_BASE (AHB1PERIPH_BASE + 0x0000UL)
#define GPIOB_BASE (AHB1PERIPH_BASE + 0x0400UL)
#define GPIOC_BASE (AHB1PERIPH_BASE + 0x0800UL)
#define GPIOD_BASE (AHB1PERIPH_BASE + 0x0C00UL)
#define GPIOE_BASE (AHB1PERIPH_BASE + 0x1000UL)
#define GPIOH_BASE (AHB1PERIPH_BASE + 0x1C00UL)
#define RCC_BASE (AHB1PERIPH_BASE + 0x3800UL)
#define FLASH_R_BASE (AHB1PERIPH_BASE + 0x3C00UL)
#define SysTick_BASE (0xE000E010UL)
#define NVIC_BASE (0xE000E100UL)
#define SCB_BASE (0xE000ED00UL)

#define TIM2 ((TIM_TypeDef *) TIM2_BASE)
#define TIM3 ((TIM_TypeDef *) TIM3_BASE)
#define TIM4 ((TIM_TypeDef *) TIM4_BASE)
#define TIM5 ((TIM_TypeDef *) TIM5_BASE)
#define USART2 ((USART_TypeDef *) USART2_BASE)
#define PWR ((PWR_TypeDef *) PWR_BASE)
#define TIM1 ((TIM_TypeDef *) TIM1_BASE)
#define USART1 ((USART_TypeDef *) USART1_BASE)
#define USART6 ((USART_TypeDef *) USART6_BASE)
#define ADC1 ((ADC_TypeDef *) ADC1_BASE)
#define ADC1_COMMON ((ADC_Common_TypeDef *) ADC1_COMMON_BASE)
#define ADC ADC1_COMMON
#define SYSCFG ((SYSCFG_TypeDef *) SYSCFG_BASE)
#define EXTI ((EXTI_TypeDef *) EXTI_BASE)
#define TIM9 ((TIM_TypeDef *) TIM9_BASE)
#define TIM10 ((TIM_TypeDef *) TIM10_BASE)
#define TIM11 ((TIM_TypeDef *) TIM11_BASE)
#define GPIOA ((GPIO_TypeDef *) GPIOA_BASE)
#define GPIOB ((GPIO_TypeDef *) GPIOB_BASE)
#define GPIOC ((GPIO_TypeDef *) GPIOC_BASE)
#define GPIOD ((GPIO_TypeDef *) GPIOD_BASE)
#define GPIOE ((GPIO_TypeDef *) GPIOE_BASE)
#define GPIOH ((GPIO_TypeDef *) GPIOH_BASE)
#define RCC ((RCC_TypeDef *) RCC_BASE)
#define FLASH ((FLASH_TypeDef *) FLASH_R_BASE)
#define SysTick ((SysTick_Type *) SysTick_BASE)
#define NVIC ((NVIC_Type *) NVIC_BASE)
#define SCB ((SCB_Type *) SCB_BASE)

#define SET_BIT(REG, BIT) ((REG) |= (BIT))
#define CLEAR_BIT(REG, BIT) ((REG) &= ~(BIT))
#define READ_BIT(REG, BIT) ((REG) & (BIT))
#define CLEAR_REG(REG) ((REG) = (0x0))
#define WRITE_REG(REG, VAL) ((REG) = (VAL))
#define READ_REG(REG) ((REG))
#define MODIFY_REG(REG, CLEARMASK, SETMASK) WRITE_REG((REG), (((READ_REG(REG)) & (~(CLEARMASK))) | (SETMASK)))
#define POSITION_VAL(VAL) (__CLZ(__RBIT(VAL)))

/* RCC bits */
#define RCC_CR_HSION (1UL << 0)
#define RCC_CR_HSIRDY (1UL << 1)
#define RCC_CR_HSEON (1UL << 16)
#define RCC_CR_HSERDY (1UL << 17)
#define RCC_CR_HSEBYP (1UL << 18)
#define RCC_CR_PLLON (1UL << 24)
#define RCC_CR_PLLRDY (1UL << 25)
#define RCC_CFGR_SW (3UL << 0)
#define RCC_CFGR_SW_HSI 0UL
#define RCC_CFGR_SW_HSE 1UL
#define RCC_CFGR_SW_PLL 2UL
#define RCC_CFGR_SWS (3UL << 2)
#define RCC_CFGR_HPRE (0xFUL << 4)
#define RCC_CFGR_PPRE1 (7UL << 10)
#define RCC_CFGR_PPRE2 (7UL << 13)
#define RCC_PLLCFGR_PLLSRC (1UL << 22)
#define RCC_AHB1ENR_GPIOAEN (1UL << 0)
#define RCC_AHB1ENR_GPIOBEN (1UL << 1)
#define RCC_AHB1ENR_GPIOCEN (1UL << 2)
#define RCC_AHB1ENR_GPIODEN (1UL << 3)
#define RCC_AHB1ENR_GPIOEEN (1UL << 4)
#define RCC_AHB1ENR_GPIOHEN (1UL << 7)
#define RCC_AHB1ENR_DMA1EN (1UL << 21)
#define RCC_AHB1ENR_DMA2EN (1UL << 22)
#define RCC_APB1ENR_TIM2EN (1UL << 0)
#define RCC_APB1ENR_TIM3EN (1UL << 1)
#define RCC_APB1ENR_TIM4EN (1UL << 2)
#define RCC_APB1ENR_TIM5EN (1UL << 3)
#define RCC_APB1ENR_USART2EN (1UL << 17)
#define RCC_APB1ENR_I2C1EN (1UL << 21)
#define RCC_APB1ENR_PWREN (1UL << 28)
#define RCC_APB2ENR_TIM1EN (1UL << 0)
#define RCC_APB2ENR_USART1EN (1UL << 4)
#define RCC_APB2ENR_USART6EN (1UL << 5)
#define RCC_APB2ENR_ADC1EN (1UL << 8)
#define RCC_APB2ENR_SYSCFGEN (1UL << 14)
#define RCC_APB2ENR_TIM9EN (1UL << 16)
#define RCC_APB2ENR_TIM10EN (1UL << 17)
#define RCC_APB2ENR_TIM11EN (1UL << 18)
#define PWR_CR_VOS (3UL << 14)
#define PWR_CR_VOS_0 (1UL << 14)
#define PWR_CR_VOS_1 (1UL << 15)
#define FLASH_ACR_LATENCY (0xFUL << 0)
#define FLASH_ACR_PRFTEN (1UL << 8)
#define FLASH_ACR_ICEN (1UL << 9)
#define FLASH_ACR_DCEN (1UL << 10)

/* GPIO bits */
${bits('GPIO_ODR_OD', 16, (i) => `(1UL << ${i})`)}${bits('GPIO_ODR_ODR_', 16, (i) => `(1UL << ${i})`)}${bits('GPIO_IDR_ID', 16, (i) => `(1UL << ${i})`)}${bits('GPIO_IDR_IDR_', 16, (i) => `(1UL << ${i})`)}${bits('GPIO_BSRR_BS', 16, (i) => `(1UL << ${i})`)}${bits('GPIO_BSRR_BR', 16, (i) => `(1UL << ${i + 16})`)}${bits('GPIO_BSRR_BS_', 16, (i) => `(1UL << ${i})`)}${bits('GPIO_BSRR_BR_', 16, (i) => `(1UL << ${i + 16})`)}${bits('GPIO_MODER_MODER', 16, (i) => `(3UL << ${i * 2})`)}${bits('GPIO_MODER_MODE', 16, (i) => `(3UL << ${i * 2})`)}${Array.from({ length: 16 }, (_, i) => `#define GPIO_MODER_MODER${i}_0 (1UL << ${i * 2})\n#define GPIO_MODER_MODER${i}_1 (2UL << ${i * 2})\n#define GPIO_MODER_MODE${i}_0 (1UL << ${i * 2})\n#define GPIO_MODER_MODE${i}_1 (2UL << ${i * 2})\n#define GPIO_PUPDR_PUPD${i}_0 (1UL << ${i * 2})\n#define GPIO_PUPDR_PUPD${i}_1 (2UL << ${i * 2})\n`).join('')}
/* TIM bits */
#define TIM_CR1_CEN (1UL << 0)
#define TIM_CR1_UDIS (1UL << 1)
#define TIM_CR1_URS (1UL << 2)
#define TIM_CR1_OPM (1UL << 3)
#define TIM_CR1_DIR (1UL << 4)
#define TIM_CR1_ARPE (1UL << 7)
#define TIM_DIER_UIE (1UL << 0)
#define TIM_DIER_CC1IE (1UL << 1)
#define TIM_SR_UIF (1UL << 0)
#define TIM_SR_CC1IF (1UL << 1)
#define TIM_EGR_UG (1UL << 0)
#define TIM_CCER_CC1E (1UL << 0)
#define TIM_CCER_CC1P (1UL << 1)
#define TIM_CCER_CC2E (1UL << 4)
#define TIM_CCER_CC2P (1UL << 5)
#define TIM_CCER_CC3E (1UL << 8)
#define TIM_CCER_CC3P (1UL << 9)
#define TIM_CCER_CC4E (1UL << 12)
#define TIM_CCER_CC4P (1UL << 13)
#define TIM_CCMR1_OC1M (7UL << 4)
#define TIM_CCMR1_OC1M_1 (2UL << 4)
#define TIM_CCMR1_OC1M_2 (4UL << 4)
#define TIM_CCMR1_OC1PE (1UL << 3)
#define TIM_CCMR1_OC2M (7UL << 12)
#define TIM_CCMR1_OC2M_1 (2UL << 12)
#define TIM_CCMR1_OC2M_2 (4UL << 12)
#define TIM_CCMR1_OC2PE (1UL << 11)
#define TIM_CCMR2_OC3M (7UL << 4)
#define TIM_CCMR2_OC3M_1 (2UL << 4)
#define TIM_CCMR2_OC3M_2 (4UL << 4)
#define TIM_CCMR2_OC3PE (1UL << 3)
#define TIM_CCMR2_OC4M (7UL << 12)
#define TIM_CCMR2_OC4M_1 (2UL << 12)
#define TIM_CCMR2_OC4M_2 (4UL << 12)
#define TIM_CCMR2_OC4PE (1UL << 11)
#define TIM_BDTR_MOE (1UL << 15)
#define TIM_BDTR_AOE (1UL << 14)
#define TIM_SMCR_SMS (7UL << 0)
#define TIM_SMCR_ECE (1UL << 14)
#define TIM_SMCR_ETPS_0 (1UL << 12)
#define TIM_CR2_MMS (7UL << 4)
#define TIM_SMCR_MSM (1UL << 7)
/* ADC bits */
#define ADC_SR_AWD (1UL << 0)
#define ADC_SR_EOC (1UL << 1)
#define ADC_SR_JEOC (1UL << 2)
#define ADC_SR_JSTRT (1UL << 3)
#define ADC_SR_STRT (1UL << 4)
#define ADC_SR_OVR (1UL << 5)
#define ADC_CR1_EOCIE (1UL << 5)
#define ADC_CR1_SCAN (1UL << 8)
#define ADC_CR1_RES (3UL << 24)
#define ADC_CR1_RES_0 (1UL << 24)
#define ADC_CR1_RES_1 (2UL << 24)
#define ADC_CR2_ADON (1UL << 0)
#define ADC_CR2_CONT (1UL << 1)
#define ADC_CR2_DMA (1UL << 8)
#define ADC_CR2_DDS (1UL << 9)
#define ADC_CR2_EOCS (1UL << 10)
#define ADC_CR2_ALIGN (1UL << 11)
#define ADC_CR2_EXTSEL (0xFUL << 24)
#define ADC_CR2_EXTEN (3UL << 28)
#define ADC_CR2_SWSTART (1UL << 30)
#define ADC_SQR1_L (0xFUL << 20)
#define ADC_SQR3_SQ1 (0x1FUL << 0)
#define ADC_CCR_ADCPRE (3UL << 16)
#define ADC_CCR_TSVREFE (1UL << 23)
/* USART bits */
#define USART_SR_PE (1UL << 0)
#define USART_SR_FE (1UL << 1)
#define USART_SR_NE (1UL << 2)
#define USART_SR_ORE (1UL << 3)
#define USART_SR_IDLE (1UL << 4)
#define USART_SR_RXNE (1UL << 5)
#define USART_SR_TC (1UL << 6)
#define USART_SR_TXE (1UL << 7)
#define USART_CR1_SBK (1UL << 0)
#define USART_CR1_RE (1UL << 2)
#define USART_CR1_TE (1UL << 3)
#define USART_CR1_IDLEIE (1UL << 4)
#define USART_CR1_RXNEIE (1UL << 5)
#define USART_CR1_TCIE (1UL << 6)
#define USART_CR1_TXEIE (1UL << 7)
#define USART_CR1_PS (1UL << 9)
#define USART_CR1_PCE (1UL << 10)
#define USART_CR1_M (1UL << 12)
#define USART_CR1_UE (1UL << 13)
#define USART_CR1_OVER8 (1UL << 15)
#define USART_CR2_STOP (3UL << 12)
/* EXTI / SYSCFG */
${bits('EXTI_IMR_MR', 23, (i) => `(1UL << ${i})`)}${bits('EXTI_PR_PR', 23, (i) => `(1UL << ${i})`)}${bits('EXTI_RTSR_TR', 23, (i) => `(1UL << ${i})`)}${bits('EXTI_FTSR_TR', 23, (i) => `(1UL << ${i})`)}
#define SysTick_CTRL_ENABLE_Msk (1UL << 0)
#define SysTick_CTRL_TICKINT_Msk (1UL << 1)
#define SysTick_CTRL_CLKSOURCE_Msk (1UL << 2)
#define SysTick_CTRL_COUNTFLAG_Msk (1UL << 16)
#define SysTick_LOAD_RELOAD_Msk (0xFFFFFFUL)

/* CMSIS core intrinsics (provided by the simulator) */
void __disable_irq(void);
void __enable_irq(void);
void __NOP(void);
void __WFI(void);
void __WFE(void);
void __DSB(void);
void __ISB(void);
void __DMB(void);
void __SEV(void);
uint32_t __get_PRIMASK(void);
void __set_PRIMASK(uint32_t v);
uint32_t __RBIT(uint32_t v);
uint32_t __CLZ(uint32_t v);
uint32_t __REV(uint32_t v);
void NVIC_EnableIRQ(IRQn_Type IRQn);
void NVIC_DisableIRQ(IRQn_Type IRQn);
void NVIC_SetPriority(IRQn_Type IRQn, uint32_t priority);
void NVIC_SystemReset(void);
uint32_t SysTick_Config(uint32_t ticks);
extern uint32_t SystemCoreClock;
void SystemInit(void);
void SystemCoreClockUpdate(void);
#endif
`;

const HAL = `#ifndef __STM32F4xx_HAL_H
#define __STM32F4xx_HAL_H
#include "stm32f4xx_hal_conf.h"
#include "stm32f4xx.h"
#include <stddef.h>

typedef enum { HAL_OK = 0x00U, HAL_ERROR = 0x01U, HAL_BUSY = 0x02U, HAL_TIMEOUT = 0x03U } HAL_StatusTypeDef;
typedef enum { HAL_UNLOCKED = 0x00U, HAL_LOCKED = 0x01U } HAL_LockTypeDef;
#define HAL_MAX_DELAY 0xFFFFFFFFU
#define HAL_IS_BIT_SET(REG, BIT) (((REG) & (BIT)) == (BIT))
#define HAL_IS_BIT_CLR(REG, BIT) (((REG) & (BIT)) == 0U)
#define __HAL_LOCK(h) do { (h)->Lock = HAL_LOCKED; } while (0)
#define __HAL_UNLOCK(h) do { (h)->Lock = HAL_UNLOCKED; } while (0)
#define assert_param(expr) ((void)0U)
typedef enum { HAL_TICK_FREQ_10HZ = 100U, HAL_TICK_FREQ_100HZ = 10U, HAL_TICK_FREQ_1KHZ = 1U, HAL_TICK_FREQ_DEFAULT = 1U } HAL_TickFreqTypeDef;
extern __IO uint32_t uwTick;
extern uint32_t uwTickPrio;

typedef struct __DMA_HandleTypeDef { void *Instance; uint32_t State; } DMA_HandleTypeDef;

/* ---------------- HAL core ---------------- */
HAL_StatusTypeDef HAL_Init(void);
HAL_StatusTypeDef HAL_DeInit(void);
void HAL_MspInit(void);
void HAL_MspDeInit(void);
HAL_StatusTypeDef HAL_InitTick(uint32_t TickPriority);
void HAL_IncTick(void);
void HAL_Delay(uint32_t Delay);
uint32_t HAL_GetTick(void);
uint32_t HAL_GetTickPrio(void);
void HAL_SuspendTick(void);
void HAL_ResumeTick(void);
uint32_t HAL_GetHalVersion(void);
uint32_t HAL_GetREVID(void);
uint32_t HAL_GetDEVID(void);
uint32_t HAL_GetUIDw0(void);

/* ---------------- CORTEX ---------------- */
#define NVIC_PRIORITYGROUP_0 0x00000007U
#define NVIC_PRIORITYGROUP_1 0x00000006U
#define NVIC_PRIORITYGROUP_2 0x00000005U
#define NVIC_PRIORITYGROUP_3 0x00000004U
#define NVIC_PRIORITYGROUP_4 0x00000003U
#define SYSTICK_CLKSOURCE_HCLK_DIV8 0x00000000U
#define SYSTICK_CLKSOURCE_HCLK 0x00000004U
void HAL_NVIC_SetPriorityGrouping(uint32_t PriorityGroup);
void HAL_NVIC_SetPriority(IRQn_Type IRQn, uint32_t PreemptPriority, uint32_t SubPriority);
void HAL_NVIC_EnableIRQ(IRQn_Type IRQn);
void HAL_NVIC_DisableIRQ(IRQn_Type IRQn);
void HAL_NVIC_SystemReset(void);
uint32_t HAL_SYSTICK_Config(uint32_t TicksNumb);
void HAL_SYSTICK_CLKSourceConfig(uint32_t CLKSource);
void HAL_NVIC_SetPendingIRQ(IRQn_Type IRQn);
void HAL_NVIC_ClearPendingIRQ(IRQn_Type IRQn);
void HAL_SYSTICK_IRQHandler(void);
void HAL_SYSTICK_Callback(void);

/* ---------------- RCC ---------------- */
typedef struct __RCC_PLLInitTypeDef { uint32_t PLLState; uint32_t PLLSource; uint32_t PLLM; uint32_t PLLN; uint32_t PLLP; uint32_t PLLQ; } RCC_PLLInitTypeDef;
typedef struct __RCC_OscInitTypeDef { uint32_t OscillatorType; uint32_t HSEState; uint32_t LSEState; uint32_t HSIState; uint32_t HSICalibrationValue; uint32_t LSIState; RCC_PLLInitTypeDef PLL; } RCC_OscInitTypeDef;
typedef struct __RCC_ClkInitTypeDef { uint32_t ClockType; uint32_t SYSCLKSource; uint32_t AHBCLKDivider; uint32_t APB1CLKDivider; uint32_t APB2CLKDivider; } RCC_ClkInitTypeDef;
#define RCC_OSCILLATORTYPE_NONE 0x00000000U
#define RCC_OSCILLATORTYPE_HSE 0x00000001U
#define RCC_OSCILLATORTYPE_HSI 0x00000002U
#define RCC_OSCILLATORTYPE_LSE 0x00000004U
#define RCC_OSCILLATORTYPE_LSI 0x00000008U
#define RCC_HSE_OFF 0x00000000U
#define RCC_HSE_ON RCC_CR_HSEON
#define RCC_HSE_BYPASS ((uint32_t)(RCC_CR_HSEBYP | RCC_CR_HSEON))
#define RCC_LSE_OFF 0x00000000U
#define RCC_LSE_ON 0x00000001U
#define RCC_HSI_OFF 0x00000000U
#define RCC_HSI_ON 0x00000001U
#define RCC_LSI_OFF 0x00000000U
#define RCC_LSI_ON 0x00000001U
#define RCC_HSICALIBRATION_DEFAULT 0x10U
#define RCC_PLL_NONE 0x00000000U
#define RCC_PLL_OFF 0x00000001U
#define RCC_PLL_ON 0x00000002U
#define RCC_PLLSOURCE_HSI 0x00000000U
#define RCC_PLLSOURCE_HSE RCC_PLLCFGR_PLLSRC
#define RCC_PLLP_DIV2 0x00000002U
#define RCC_PLLP_DIV4 0x00000004U
#define RCC_PLLP_DIV6 0x00000006U
#define RCC_PLLP_DIV8 0x00000008U
#define RCC_CLOCKTYPE_SYSCLK 0x00000001U
#define RCC_CLOCKTYPE_HCLK 0x00000002U
#define RCC_CLOCKTYPE_PCLK1 0x00000004U
#define RCC_CLOCKTYPE_PCLK2 0x00000008U
#define RCC_SYSCLKSOURCE_HSI RCC_CFGR_SW_HSI
#define RCC_SYSCLKSOURCE_HSE RCC_CFGR_SW_HSE
#define RCC_SYSCLKSOURCE_PLLCLK RCC_CFGR_SW_PLL
#define RCC_SYSCLK_DIV1 0x00000000U
#define RCC_SYSCLK_DIV2 0x00000080U
#define RCC_SYSCLK_DIV4 0x00000090U
#define RCC_SYSCLK_DIV8 0x000000A0U
#define RCC_SYSCLK_DIV16 0x000000B0U
#define RCC_SYSCLK_DIV64 0x000000C0U
#define RCC_SYSCLK_DIV128 0x000000D0U
#define RCC_SYSCLK_DIV256 0x000000E0U
#define RCC_SYSCLK_DIV512 0x000000F0U
#define RCC_HCLK_DIV1 0x00000000U
#define RCC_HCLK_DIV2 0x00001000U
#define RCC_HCLK_DIV4 0x00001400U
#define RCC_HCLK_DIV8 0x00001800U
#define RCC_HCLK_DIV16 0x00001C00U
#define FLASH_LATENCY_0 0x00000000U
#define FLASH_LATENCY_1 0x00000001U
#define FLASH_LATENCY_2 0x00000002U
#define FLASH_LATENCY_3 0x00000003U
#define FLASH_LATENCY_4 0x00000004U
#define FLASH_LATENCY_5 0x00000005U
#define PWR_REGULATOR_VOLTAGE_SCALE2 PWR_CR_VOS_1
#define PWR_REGULATOR_VOLTAGE_SCALE3 PWR_CR_VOS_0
#define RCC_MCO1 0x00000000U
#define RCC_MCO1SOURCE_HSI 0x00000000U
#define RCC_MCODIV_1 0x00000000U
HAL_StatusTypeDef HAL_RCC_OscConfig(RCC_OscInitTypeDef *RCC_OscInitStruct);
HAL_StatusTypeDef HAL_RCC_ClockConfig(RCC_ClkInitTypeDef *RCC_ClkInitStruct, uint32_t FLatency);
uint32_t HAL_RCC_GetSysClockFreq(void);
uint32_t HAL_RCC_GetHCLKFreq(void);
uint32_t HAL_RCC_GetPCLK1Freq(void);
uint32_t HAL_RCC_GetPCLK2Freq(void);
void HAL_RCC_MCOConfig(uint32_t RCC_MCOx, uint32_t RCC_MCOSource, uint32_t RCC_MCODiv);

#define __HAL_RCC_CLK_EN(REG, BIT) do { __IO uint32_t tmpreg = 0x00U; SET_BIT(RCC->REG, (BIT)); tmpreg = READ_BIT(RCC->REG, (BIT)); UNUSED(tmpreg); } while(0U)
#define __HAL_RCC_GPIOA_CLK_ENABLE() __HAL_RCC_CLK_EN(AHB1ENR, RCC_AHB1ENR_GPIOAEN)
#define __HAL_RCC_GPIOB_CLK_ENABLE() __HAL_RCC_CLK_EN(AHB1ENR, RCC_AHB1ENR_GPIOBEN)
#define __HAL_RCC_GPIOC_CLK_ENABLE() __HAL_RCC_CLK_EN(AHB1ENR, RCC_AHB1ENR_GPIOCEN)
#define __HAL_RCC_GPIOD_CLK_ENABLE() __HAL_RCC_CLK_EN(AHB1ENR, RCC_AHB1ENR_GPIODEN)
#define __HAL_RCC_GPIOE_CLK_ENABLE() __HAL_RCC_CLK_EN(AHB1ENR, RCC_AHB1ENR_GPIOEEN)
#define __HAL_RCC_GPIOH_CLK_ENABLE() __HAL_RCC_CLK_EN(AHB1ENR, RCC_AHB1ENR_GPIOHEN)
#define __HAL_RCC_DMA1_CLK_ENABLE() __HAL_RCC_CLK_EN(AHB1ENR, RCC_AHB1ENR_DMA1EN)
#define __HAL_RCC_DMA2_CLK_ENABLE() __HAL_RCC_CLK_EN(AHB1ENR, RCC_AHB1ENR_DMA2EN)
#define __HAL_RCC_TIM2_CLK_ENABLE() __HAL_RCC_CLK_EN(APB1ENR, RCC_APB1ENR_TIM2EN)
#define __HAL_RCC_TIM3_CLK_ENABLE() __HAL_RCC_CLK_EN(APB1ENR, RCC_APB1ENR_TIM3EN)
#define __HAL_RCC_TIM4_CLK_ENABLE() __HAL_RCC_CLK_EN(APB1ENR, RCC_APB1ENR_TIM4EN)
#define __HAL_RCC_TIM5_CLK_ENABLE() __HAL_RCC_CLK_EN(APB1ENR, RCC_APB1ENR_TIM5EN)
#define __HAL_RCC_USART2_CLK_ENABLE() __HAL_RCC_CLK_EN(APB1ENR, RCC_APB1ENR_USART2EN)
#define __HAL_RCC_I2C1_CLK_ENABLE() __HAL_RCC_CLK_EN(APB1ENR, RCC_APB1ENR_I2C1EN)
#define __HAL_RCC_PWR_CLK_ENABLE() __HAL_RCC_CLK_EN(APB1ENR, RCC_APB1ENR_PWREN)
#define __HAL_RCC_TIM1_CLK_ENABLE() __HAL_RCC_CLK_EN(APB2ENR, RCC_APB2ENR_TIM1EN)
#define __HAL_RCC_USART1_CLK_ENABLE() __HAL_RCC_CLK_EN(APB2ENR, RCC_APB2ENR_USART1EN)
#define __HAL_RCC_USART6_CLK_ENABLE() __HAL_RCC_CLK_EN(APB2ENR, RCC_APB2ENR_USART6EN)
#define __HAL_RCC_ADC1_CLK_ENABLE() __HAL_RCC_CLK_EN(APB2ENR, RCC_APB2ENR_ADC1EN)
#define __HAL_RCC_SYSCFG_CLK_ENABLE() __HAL_RCC_CLK_EN(APB2ENR, RCC_APB2ENR_SYSCFGEN)
#define __HAL_RCC_TIM9_CLK_ENABLE() __HAL_RCC_CLK_EN(APB2ENR, RCC_APB2ENR_TIM9EN)
#define __HAL_RCC_TIM10_CLK_ENABLE() __HAL_RCC_CLK_EN(APB2ENR, RCC_APB2ENR_TIM10EN)
#define __HAL_RCC_TIM11_CLK_ENABLE() __HAL_RCC_CLK_EN(APB2ENR, RCC_APB2ENR_TIM11EN)
#define __HAL_RCC_GPIOA_CLK_DISABLE() (RCC->AHB1ENR &= ~(RCC_AHB1ENR_GPIOAEN))
#define __HAL_RCC_GPIOB_CLK_DISABLE() (RCC->AHB1ENR &= ~(RCC_AHB1ENR_GPIOBEN))
#define __HAL_RCC_GPIOC_CLK_DISABLE() (RCC->AHB1ENR &= ~(RCC_AHB1ENR_GPIOCEN))
#define __HAL_RCC_TIM1_CLK_DISABLE() (RCC->APB2ENR &= ~(RCC_APB2ENR_TIM1EN))
#define __HAL_RCC_TIM2_CLK_DISABLE() (RCC->APB1ENR &= ~(RCC_APB1ENR_TIM2EN))
#define __HAL_RCC_TIM3_CLK_DISABLE() (RCC->APB1ENR &= ~(RCC_APB1ENR_TIM3EN))
#define __HAL_RCC_TIM4_CLK_DISABLE() (RCC->APB1ENR &= ~(RCC_APB1ENR_TIM4EN))
#define __HAL_RCC_ADC1_CLK_DISABLE() (RCC->APB2ENR &= ~(RCC_APB2ENR_ADC1EN))
#define __HAL_RCC_USART2_CLK_DISABLE() (RCC->APB1ENR &= ~(RCC_APB1ENR_USART2EN))
#define __HAL_PWR_VOLTAGESCALING_CONFIG(__REGULATOR__) do { __IO uint32_t tmpreg = 0x00U; MODIFY_REG(PWR->CR, PWR_CR_VOS, (__REGULATOR__)); tmpreg = READ_BIT(PWR->CR, PWR_CR_VOS); UNUSED(tmpreg); } while(0U)
#define __HAL_FLASH_SET_LATENCY(__LATENCY__) (FLASH->ACR = (FLASH->ACR & ~FLASH_ACR_LATENCY) | (__LATENCY__))
#define __HAL_FLASH_GET_LATENCY() (READ_BIT((FLASH->ACR), FLASH_ACR_LATENCY))

/* ---------------- GPIO ---------------- */
typedef struct __GPIO_InitTypeDef { uint32_t Pin; uint32_t Mode; uint32_t Pull; uint32_t Speed; uint32_t Alternate; } GPIO_InitTypeDef;
typedef enum { GPIO_PIN_RESET = 0, GPIO_PIN_SET } GPIO_PinState;
${bits('GPIO_PIN_', 16, (i) => `((uint16_t)0x${(1 << i).toString(16).toUpperCase().padStart(4, '0')})`)}#define GPIO_PIN_All ((uint16_t)0xFFFF)
#define GPIO_PIN_MASK 0x0000FFFFU
#define GPIO_MODE_INPUT 0x00000000U
#define GPIO_MODE_OUTPUT_PP 0x00000001U
#define GPIO_MODE_OUTPUT_OD 0x00000011U
#define GPIO_MODE_AF_PP 0x00000002U
#define GPIO_MODE_AF_OD 0x00000012U
#define GPIO_MODE_ANALOG 0x00000003U
#define GPIO_MODE_IT_RISING 0x10110000U
#define GPIO_MODE_IT_FALLING 0x10210000U
#define GPIO_MODE_IT_RISING_FALLING 0x10310000U
#define GPIO_MODE_EVT_RISING 0x10120000U
#define GPIO_MODE_EVT_FALLING 0x10220000U
#define GPIO_MODE_EVT_RISING_FALLING 0x10320000U
#define GPIO_SPEED_FREQ_LOW 0x00000000U
#define GPIO_SPEED_FREQ_MEDIUM 0x00000001U
#define GPIO_SPEED_FREQ_HIGH 0x00000002U
#define GPIO_SPEED_FREQ_VERY_HIGH 0x00000003U
#define GPIO_NOPULL 0x00000000U
#define GPIO_PULLUP 0x00000001U
#define GPIO_PULLDOWN 0x00000002U
#define GPIO_AF0_RTC_50Hz ((uint8_t)0x00)
#define GPIO_AF0_MCO ((uint8_t)0x00)
#define GPIO_AF0_SWJ ((uint8_t)0x00)
#define GPIO_AF0_TRACE ((uint8_t)0x00)
#define GPIO_AF1_TIM1 ((uint8_t)0x01)
#define GPIO_AF1_TIM2 ((uint8_t)0x01)
#define GPIO_AF2_TIM3 ((uint8_t)0x02)
#define GPIO_AF2_TIM4 ((uint8_t)0x02)
#define GPIO_AF2_TIM5 ((uint8_t)0x02)
#define GPIO_AF3_TIM9 ((uint8_t)0x03)
#define GPIO_AF3_TIM10 ((uint8_t)0x03)
#define GPIO_AF3_TIM11 ((uint8_t)0x03)
#define GPIO_AF4_I2C1 ((uint8_t)0x04)
#define GPIO_AF4_I2C2 ((uint8_t)0x04)
#define GPIO_AF4_I2C3 ((uint8_t)0x04)
#define GPIO_AF5_SPI1 ((uint8_t)0x05)
#define GPIO_AF7_USART1 ((uint8_t)0x07)
#define GPIO_AF7_USART2 ((uint8_t)0x07)
#define GPIO_AF8_USART6 ((uint8_t)0x08)
void HAL_GPIO_Init(GPIO_TypeDef *GPIOx, GPIO_InitTypeDef *GPIO_Init);
void HAL_GPIO_DeInit(GPIO_TypeDef *GPIOx, uint32_t GPIO_Pin);
GPIO_PinState HAL_GPIO_ReadPin(GPIO_TypeDef *GPIOx, uint16_t GPIO_Pin);
void HAL_GPIO_WritePin(GPIO_TypeDef *GPIOx, uint16_t GPIO_Pin, GPIO_PinState PinState);
void HAL_GPIO_TogglePin(GPIO_TypeDef *GPIOx, uint16_t GPIO_Pin);
HAL_StatusTypeDef HAL_GPIO_LockPin(GPIO_TypeDef *GPIOx, uint16_t GPIO_Pin);
void HAL_GPIO_EXTI_IRQHandler(uint16_t GPIO_Pin);
void HAL_GPIO_EXTI_Callback(uint16_t GPIO_Pin);
#define __HAL_GPIO_EXTI_GET_IT(__EXTI_LINE__) (EXTI->PR & (__EXTI_LINE__))
#define __HAL_GPIO_EXTI_CLEAR_IT(__EXTI_LINE__) (EXTI->PR = (__EXTI_LINE__))
#define __HAL_GPIO_EXTI_GET_FLAG(__EXTI_LINE__) (EXTI->PR & (__EXTI_LINE__))
#define __HAL_GPIO_EXTI_CLEAR_FLAG(__EXTI_LINE__) (EXTI->PR = (__EXTI_LINE__))

/* ---------------- ADC ---------------- */
typedef struct __ADC_InitTypeDef { uint32_t ClockPrescaler; uint32_t Resolution; uint32_t DataAlign; uint32_t ScanConvMode; uint32_t EOCSelection; FunctionalState ContinuousConvMode; uint32_t NbrOfConversion; FunctionalState DiscontinuousConvMode; uint32_t NbrOfDiscConversion; uint32_t ExternalTrigConv; uint32_t ExternalTrigConvEdge; FunctionalState DMAContinuousRequests; } ADC_InitTypeDef;
typedef struct __ADC_ChannelConfTypeDef { uint32_t Channel; uint32_t Rank; uint32_t SamplingTime; uint32_t Offset; } ADC_ChannelConfTypeDef;
typedef struct __ADC_HandleTypeDef { ADC_TypeDef *Instance; ADC_InitTypeDef Init; __IO uint32_t NbrOfCurrentConversionRank; DMA_HandleTypeDef *DMA_Handle; HAL_LockTypeDef Lock; __IO uint32_t State; __IO uint32_t ErrorCode; } ADC_HandleTypeDef;
#define HAL_ADC_STATE_RESET 0x00000000U
#define HAL_ADC_STATE_READY 0x00000001U
#define HAL_ADC_STATE_BUSY_INTERNAL 0x00000002U
#define HAL_ADC_STATE_TIMEOUT 0x00000004U
#define HAL_ADC_STATE_REG_BUSY 0x00000100U
#define HAL_ADC_STATE_REG_EOC 0x00000200U
#define ADC_CLOCK_SYNC_PCLK_DIV2 0x00000000U
#define ADC_CLOCK_SYNC_PCLK_DIV4 0x00010000U
#define ADC_CLOCK_SYNC_PCLK_DIV6 0x00020000U
#define ADC_CLOCK_SYNC_PCLK_DIV8 0x00030000U
#define ADC_RESOLUTION_12B 0x00000000U
#define ADC_RESOLUTION_10B 0x01000000U
#define ADC_RESOLUTION_8B 0x02000000U
#define ADC_RESOLUTION_6B 0x03000000U
#define ADC_DATAALIGN_RIGHT 0x00000000U
#define ADC_DATAALIGN_LEFT 0x00000800U
#define ADC_EXTERNALTRIGCONVEDGE_NONE 0x00000000U
#define ADC_EXTERNALTRIGCONVEDGE_RISING 0x10000000U
#define ADC_SOFTWARE_START 0x0F000001U
#define ADC_EOC_SEQ_CONV 0x00000000U
#define ADC_EOC_SINGLE_CONV 0x00000001U
${bits('ADC_CHANNEL_', 19, (i) => `${i}U`)}#define ADC_CHANNEL_VREFINT 17U
#define ADC_CHANNEL_VBAT 18U
#define ADC_CHANNEL_TEMPSENSOR 18U
#define ADC_SAMPLETIME_3CYCLES 0x00000000U
#define ADC_SAMPLETIME_15CYCLES 0x00000001U
#define ADC_SAMPLETIME_28CYCLES 0x00000002U
#define ADC_SAMPLETIME_56CYCLES 0x00000003U
#define ADC_SAMPLETIME_84CYCLES 0x00000004U
#define ADC_SAMPLETIME_112CYCLES 0x00000005U
#define ADC_SAMPLETIME_144CYCLES 0x00000006U
#define ADC_SAMPLETIME_480CYCLES 0x00000007U
#define ADC_FLAG_EOC ADC_SR_EOC
#define ADC_IT_EOC ADC_CR1_EOCIE
HAL_StatusTypeDef HAL_ADC_Init(ADC_HandleTypeDef *hadc);
HAL_StatusTypeDef HAL_ADC_DeInit(ADC_HandleTypeDef *hadc);
void HAL_ADC_MspInit(ADC_HandleTypeDef *hadc);
void HAL_ADC_MspDeInit(ADC_HandleTypeDef *hadc);
HAL_StatusTypeDef HAL_ADC_ConfigChannel(ADC_HandleTypeDef *hadc, ADC_ChannelConfTypeDef *sConfig);
HAL_StatusTypeDef HAL_ADC_Start(ADC_HandleTypeDef *hadc);
HAL_StatusTypeDef HAL_ADC_Stop(ADC_HandleTypeDef *hadc);
HAL_StatusTypeDef HAL_ADC_PollForConversion(ADC_HandleTypeDef *hadc, uint32_t Timeout);
uint32_t HAL_ADC_GetValue(ADC_HandleTypeDef *hadc);
HAL_StatusTypeDef HAL_ADC_Start_IT(ADC_HandleTypeDef *hadc);
HAL_StatusTypeDef HAL_ADC_Stop_IT(ADC_HandleTypeDef *hadc);
void HAL_ADC_IRQHandler(ADC_HandleTypeDef *hadc);
void HAL_ADC_ConvCpltCallback(ADC_HandleTypeDef *hadc);
uint32_t HAL_ADC_GetState(ADC_HandleTypeDef *hadc);
uint32_t HAL_ADC_GetError(ADC_HandleTypeDef *hadc);
#define __HAL_ADC_ENABLE(__HANDLE__) ((__HANDLE__)->Instance->CR2 |= ADC_CR2_ADON)
#define __HAL_ADC_DISABLE(__HANDLE__) ((__HANDLE__)->Instance->CR2 &= ~ADC_CR2_ADON)
#define __HAL_ADC_GET_FLAG(__HANDLE__, __FLAG__) ((((__HANDLE__)->Instance->SR) & (__FLAG__)) == (__FLAG__))

/* ---------------- TIM ---------------- */
typedef struct __TIM_Base_InitTypeDef { uint32_t Prescaler; uint32_t CounterMode; uint32_t Period; uint32_t ClockDivision; uint32_t RepetitionCounter; uint32_t AutoReloadPreload; } TIM_Base_InitTypeDef;
typedef struct __TIM_OC_InitTypeDef { uint32_t OCMode; uint32_t Pulse; uint32_t OCPolarity; uint32_t OCNPolarity; uint32_t OCFastMode; uint32_t OCIdleState; uint32_t OCNIdleState; } TIM_OC_InitTypeDef;
typedef struct __TIM_ClockConfigTypeDef { uint32_t ClockSource; uint32_t ClockPolarity; uint32_t ClockPrescaler; uint32_t ClockFilter; } TIM_ClockConfigTypeDef;
typedef struct __TIM_MasterConfigTypeDef { uint32_t MasterOutputTrigger; uint32_t MasterSlaveMode; } TIM_MasterConfigTypeDef;
typedef struct __TIM_BreakDeadTimeConfigTypeDef { uint32_t OffStateRunMode; uint32_t OffStateIDLEMode; uint32_t LockLevel; uint32_t DeadTime; uint32_t BreakState; uint32_t BreakPolarity; uint32_t BreakFilter; uint32_t AutomaticOutput; } TIM_BreakDeadTimeConfigTypeDef;
typedef enum { HAL_TIM_STATE_RESET = 0x00U, HAL_TIM_STATE_READY = 0x01U, HAL_TIM_STATE_BUSY = 0x02U, HAL_TIM_STATE_TIMEOUT = 0x03U, HAL_TIM_STATE_ERROR = 0x04U } HAL_TIM_StateTypeDef;
typedef enum { HAL_TIM_CHANNEL_STATE_RESET = 0x00U, HAL_TIM_CHANNEL_STATE_READY = 0x01U, HAL_TIM_CHANNEL_STATE_BUSY = 0x02U } HAL_TIM_ChannelStateTypeDef;
typedef enum { HAL_TIM_ACTIVE_CHANNEL_1 = 0x01U, HAL_TIM_ACTIVE_CHANNEL_2 = 0x02U, HAL_TIM_ACTIVE_CHANNEL_3 = 0x04U, HAL_TIM_ACTIVE_CHANNEL_4 = 0x08U, HAL_TIM_ACTIVE_CHANNEL_CLEARED = 0x00U } HAL_TIM_ActiveChannel;
typedef struct __TIM_HandleTypeDef { TIM_TypeDef *Instance; TIM_Base_InitTypeDef Init; HAL_TIM_ActiveChannel Channel; DMA_HandleTypeDef *hdma[7]; HAL_LockTypeDef Lock; __IO HAL_TIM_StateTypeDef State; __IO HAL_TIM_ChannelStateTypeDef ChannelState[4]; __IO HAL_TIM_ChannelStateTypeDef ChannelNState[4]; __IO uint32_t DMABurstState; } TIM_HandleTypeDef;
#define TIM_COUNTERMODE_UP 0x00000000U
#define TIM_COUNTERMODE_DOWN TIM_CR1_DIR
#define TIM_COUNTERMODE_CENTERALIGNED1 0x00000020U
#define TIM_CLOCKDIVISION_DIV1 0x00000000U
#define TIM_CLOCKDIVISION_DIV2 0x00000100U
#define TIM_CLOCKDIVISION_DIV4 0x00000200U
#define TIM_AUTORELOAD_PRELOAD_DISABLE 0x00000000U
#define TIM_AUTORELOAD_PRELOAD_ENABLE TIM_CR1_ARPE
#define TIM_CHANNEL_1 0x00000000U
#define TIM_CHANNEL_2 0x00000004U
#define TIM_CHANNEL_3 0x00000008U
#define TIM_CHANNEL_4 0x0000000CU
#define TIM_CHANNEL_ALL 0x0000003CU
#define TIM_OCMODE_TIMING 0x00000000U
#define TIM_OCMODE_ACTIVE 0x00000010U
#define TIM_OCMODE_INACTIVE 0x00000020U
#define TIM_OCMODE_TOGGLE 0x00000030U
#define TIM_OCMODE_PWM1 0x00000060U
#define TIM_OCMODE_PWM2 0x00000070U
#define TIM_OCMODE_FORCED_ACTIVE 0x00000050U
#define TIM_OCMODE_FORCED_INACTIVE 0x00000040U
#define TIM_OCPOLARITY_HIGH 0x00000000U
#define TIM_OCPOLARITY_LOW 0x00000002U
#define TIM_OCNPOLARITY_HIGH 0x00000000U
#define TIM_OCNPOLARITY_LOW 0x00000008U
#define TIM_OCFAST_DISABLE 0x00000000U
#define TIM_OCFAST_ENABLE 0x00000004U
#define TIM_OCIDLESTATE_SET 0x00000100U
#define TIM_OCIDLESTATE_RESET 0x00000000U
#define TIM_OCNIDLESTATE_SET 0x00000200U
#define TIM_OCNIDLESTATE_RESET 0x00000000U
#define TIM_CLOCKSOURCE_INTERNAL TIM_SMCR_ETPS_0
#define TIM_CLOCKSOURCE_ETRMODE2 TIM_SMCR_ETPS_1
#define TIM_TRGO_RESET 0x00000000U
#define TIM_TRGO_ENABLE 0x00000010U
#define TIM_TRGO_UPDATE 0x00000020U
#define TIM_MASTERSLAVEMODE_ENABLE 0x00000080U
#define TIM_MASTERSLAVEMODE_DISABLE 0x00000000U
#define TIM_OSSR_ENABLE 0x00000800U
#define TIM_OSSR_DISABLE 0x00000000U
#define TIM_OSSI_ENABLE 0x00000400U
#define TIM_OSSI_DISABLE 0x00000000U
#define TIM_LOCKLEVEL_OFF 0x00000000U
#define TIM_BREAK_ENABLE 0x00001000U
#define TIM_BREAK_DISABLE 0x00000000U
#define TIM_BREAKPOLARITY_LOW 0x00000000U
#define TIM_BREAKPOLARITY_HIGH 0x00002000U
#define TIM_AUTOMATICOUTPUT_ENABLE 0x00004000U
#define TIM_AUTOMATICOUTPUT_DISABLE 0x00000000U
#define TIM_IT_UPDATE TIM_DIER_UIE
#define TIM_IT_CC1 TIM_DIER_CC1IE
#define TIM_FLAG_UPDATE TIM_SR_UIF
#define __HAL_TIM_SET_COMPARE(__HANDLE__, __CHANNEL__, __COMPARE__) (((__CHANNEL__) == TIM_CHANNEL_1) ? ((__HANDLE__)->Instance->CCR1 = (__COMPARE__)) : ((__CHANNEL__) == TIM_CHANNEL_2) ? ((__HANDLE__)->Instance->CCR2 = (__COMPARE__)) : ((__CHANNEL__) == TIM_CHANNEL_3) ? ((__HANDLE__)->Instance->CCR3 = (__COMPARE__)) : ((__HANDLE__)->Instance->CCR4 = (__COMPARE__)))
#define __HAL_TIM_GET_COMPARE(__HANDLE__, __CHANNEL__) (((__CHANNEL__) == TIM_CHANNEL_1) ? ((__HANDLE__)->Instance->CCR1) : ((__CHANNEL__) == TIM_CHANNEL_2) ? ((__HANDLE__)->Instance->CCR2) : ((__CHANNEL__) == TIM_CHANNEL_3) ? ((__HANDLE__)->Instance->CCR3) : ((__HANDLE__)->Instance->CCR4))
#define __HAL_TIM_SET_AUTORELOAD(__HANDLE__, __AUTORELOAD__) do { (__HANDLE__)->Instance->ARR = (__AUTORELOAD__); (__HANDLE__)->Init.Period = (__AUTORELOAD__); } while(0)
#define __HAL_TIM_GET_AUTORELOAD(__HANDLE__) ((__HANDLE__)->Instance->ARR)
#define __HAL_TIM_SET_PRESCALER(__HANDLE__, __PRESC__) ((__HANDLE__)->Instance->PSC = (__PRESC__))
#define __HAL_TIM_SET_COUNTER(__HANDLE__, __COUNTER__) ((__HANDLE__)->Instance->CNT = (__COUNTER__))
#define __HAL_TIM_GET_COUNTER(__HANDLE__) ((__HANDLE__)->Instance->CNT)
#define __HAL_TIM_ENABLE(__HANDLE__) ((__HANDLE__)->Instance->CR1 |= (TIM_CR1_CEN))
#define __HAL_TIM_DISABLE(__HANDLE__) ((__HANDLE__)->Instance->CR1 &= ~(TIM_CR1_CEN))
#define __HAL_TIM_MOE_ENABLE(__HANDLE__) ((__HANDLE__)->Instance->BDTR |= (TIM_BDTR_MOE))
#define __HAL_TIM_GET_FLAG(__HANDLE__, __FLAG__) (((__HANDLE__)->Instance->SR &(__FLAG__)) == (__FLAG__))
#define __HAL_TIM_CLEAR_FLAG(__HANDLE__, __FLAG__) ((__HANDLE__)->Instance->SR = ~(__FLAG__))
#define __HAL_TIM_CLEAR_IT(__HANDLE__, __INTERRUPT__) ((__HANDLE__)->Instance->SR = ~(__INTERRUPT__))
#define __HAL_TIM_ENABLE_IT(__HANDLE__, __INTERRUPT__) ((__HANDLE__)->Instance->DIER |= (__INTERRUPT__))
#define __HAL_TIM_DISABLE_IT(__HANDLE__, __INTERRUPT__) ((__HANDLE__)->Instance->DIER &= ~(__INTERRUPT__))
HAL_StatusTypeDef HAL_TIM_Base_Init(TIM_HandleTypeDef *htim);
HAL_StatusTypeDef HAL_TIM_Base_DeInit(TIM_HandleTypeDef *htim);
void HAL_TIM_Base_MspInit(TIM_HandleTypeDef *htim);
void HAL_TIM_Base_MspDeInit(TIM_HandleTypeDef *htim);
HAL_StatusTypeDef HAL_TIM_Base_Start(TIM_HandleTypeDef *htim);
HAL_StatusTypeDef HAL_TIM_Base_Stop(TIM_HandleTypeDef *htim);
HAL_StatusTypeDef HAL_TIM_Base_Start_IT(TIM_HandleTypeDef *htim);
HAL_StatusTypeDef HAL_TIM_Base_Stop_IT(TIM_HandleTypeDef *htim);
HAL_StatusTypeDef HAL_TIM_PWM_Init(TIM_HandleTypeDef *htim);
HAL_StatusTypeDef HAL_TIM_PWM_DeInit(TIM_HandleTypeDef *htim);
void HAL_TIM_PWM_MspInit(TIM_HandleTypeDef *htim);
void HAL_TIM_PWM_MspDeInit(TIM_HandleTypeDef *htim);
HAL_StatusTypeDef HAL_TIM_PWM_ConfigChannel(TIM_HandleTypeDef *htim, TIM_OC_InitTypeDef *sConfig, uint32_t Channel);
HAL_StatusTypeDef HAL_TIM_PWM_Start(TIM_HandleTypeDef *htim, uint32_t Channel);
HAL_StatusTypeDef HAL_TIM_PWM_Stop(TIM_HandleTypeDef *htim, uint32_t Channel);
HAL_StatusTypeDef HAL_TIM_OC_Init(TIM_HandleTypeDef *htim);
void HAL_TIM_OC_MspInit(TIM_HandleTypeDef *htim);
HAL_StatusTypeDef HAL_TIM_OC_ConfigChannel(TIM_HandleTypeDef *htim, TIM_OC_InitTypeDef *sConfig, uint32_t Channel);
HAL_StatusTypeDef HAL_TIM_OC_Start(TIM_HandleTypeDef *htim, uint32_t Channel);
HAL_StatusTypeDef HAL_TIM_OC_Stop(TIM_HandleTypeDef *htim, uint32_t Channel);
HAL_StatusTypeDef HAL_TIM_ConfigClockSource(TIM_HandleTypeDef *htim, TIM_ClockConfigTypeDef *sClockSourceConfig);
HAL_StatusTypeDef HAL_TIMEx_MasterConfigSynchronization(TIM_HandleTypeDef *htim, TIM_MasterConfigTypeDef *sMasterConfig);
HAL_StatusTypeDef HAL_TIMEx_ConfigBreakDeadTime(TIM_HandleTypeDef *htim, TIM_BreakDeadTimeConfigTypeDef *sBreakDeadTimeConfig);
void HAL_TIM_IRQHandler(TIM_HandleTypeDef *htim);
void HAL_TIM_PeriodElapsedCallback(TIM_HandleTypeDef *htim);
HAL_TIM_StateTypeDef HAL_TIM_Base_GetState(TIM_HandleTypeDef *htim);

/* ---------------- UART ---------------- */
typedef struct __UART_InitTypeDef { uint32_t BaudRate; uint32_t WordLength; uint32_t StopBits; uint32_t Parity; uint32_t Mode; uint32_t HwFlowCtl; uint32_t OverSampling; } UART_InitTypeDef;
typedef enum { HAL_UART_STATE_RESET = 0x00U, HAL_UART_STATE_READY = 0x20U, HAL_UART_STATE_BUSY = 0x24U, HAL_UART_STATE_BUSY_TX = 0x21U, HAL_UART_STATE_BUSY_RX = 0x22U, HAL_UART_STATE_BUSY_TX_RX = 0x23U, HAL_UART_STATE_TIMEOUT = 0xA0U, HAL_UART_STATE_ERROR = 0xE0U } HAL_UART_StateTypeDef;
typedef struct __UART_HandleTypeDef { USART_TypeDef *Instance; UART_InitTypeDef Init; const uint8_t *pTxBuffPtr; uint16_t TxXferSize; __IO uint16_t TxXferCount; uint8_t *pRxBuffPtr; uint16_t RxXferSize; __IO uint16_t RxXferCount; __IO uint32_t ReceptionType; __IO uint32_t RxEventType; DMA_HandleTypeDef *hdmatx; DMA_HandleTypeDef *hdmarx; HAL_LockTypeDef Lock; __IO HAL_UART_StateTypeDef gState; __IO HAL_UART_StateTypeDef RxState; __IO uint32_t ErrorCode; } UART_HandleTypeDef;
#define UART_WORDLENGTH_8B 0x00000000U
#define UART_WORDLENGTH_9B ((uint32_t)USART_CR1_M)
#define UART_STOPBITS_1 0x00000000U
#define UART_STOPBITS_2 ((uint32_t)0x2000U)
#define UART_PARITY_NONE 0x00000000U
#define UART_PARITY_EVEN ((uint32_t)USART_CR1_PCE)
#define UART_PARITY_ODD ((uint32_t)(USART_CR1_PCE | USART_CR1_PS))
#define UART_HWCONTROL_NONE 0x00000000U
#define UART_HWCONTROL_RTS 0x00000100U
#define UART_HWCONTROL_CTS 0x00000200U
#define UART_HWCONTROL_RTS_CTS 0x00000300U
#define UART_MODE_RX ((uint32_t)USART_CR1_RE)
#define UART_MODE_TX ((uint32_t)USART_CR1_TE)
#define UART_MODE_TX_RX ((uint32_t)(USART_CR1_TE | USART_CR1_RE))
#define UART_OVERSAMPLING_16 0x00000000U
#define UART_OVERSAMPLING_8 ((uint32_t)USART_CR1_OVER8)
#define UART_FLAG_TXE USART_SR_TXE
#define UART_FLAG_TC USART_SR_TC
#define UART_FLAG_RXNE USART_SR_RXNE
#define UART_IT_RXNE ((uint32_t)(1U << 28U | USART_CR1_RXNEIE))
#define __HAL_UART_GET_FLAG(__HANDLE__, __FLAG__) (((__HANDLE__)->Instance->SR & (__FLAG__)) == (__FLAG__))
#define __HAL_UART_ENABLE_IT(__HANDLE__, __INTERRUPT__) ((__HANDLE__)->Instance->CR1 |= ((__INTERRUPT__) & 0xFFFFU))
#define __HAL_UART_DISABLE_IT(__HANDLE__, __INTERRUPT__) ((__HANDLE__)->Instance->CR1 &= ~((__INTERRUPT__) & 0xFFFFU))
HAL_StatusTypeDef HAL_UART_Init(UART_HandleTypeDef *huart);
HAL_StatusTypeDef HAL_UART_DeInit(UART_HandleTypeDef *huart);
void HAL_UART_MspInit(UART_HandleTypeDef *huart);
void HAL_UART_MspDeInit(UART_HandleTypeDef *huart);
HAL_StatusTypeDef HAL_UART_Transmit(UART_HandleTypeDef *huart, const uint8_t *pData, uint16_t Size, uint32_t Timeout);
HAL_StatusTypeDef HAL_UART_Receive(UART_HandleTypeDef *huart, uint8_t *pData, uint16_t Size, uint32_t Timeout);
HAL_StatusTypeDef HAL_UART_Transmit_IT(UART_HandleTypeDef *huart, const uint8_t *pData, uint16_t Size);
HAL_StatusTypeDef HAL_UART_Receive_IT(UART_HandleTypeDef *huart, uint8_t *pData, uint16_t Size);
HAL_StatusTypeDef HAL_UART_AbortReceive(UART_HandleTypeDef *huart);
void HAL_UART_IRQHandler(UART_HandleTypeDef *huart);
void HAL_UART_TxCpltCallback(UART_HandleTypeDef *huart);
void HAL_UART_RxCpltCallback(UART_HandleTypeDef *huart);
void HAL_UART_ErrorCallback(UART_HandleTypeDef *huart);
HAL_UART_StateTypeDef HAL_UART_GetState(UART_HandleTypeDef *huart);

/* ---------------- unsupported peripherals (handles only) ---------------- */
typedef struct __I2C_HandleTypeDef { void *Instance; uint32_t Init[8]; uint32_t State; } I2C_HandleTypeDef;
typedef struct __SPI_HandleTypeDef { void *Instance; uint32_t Init[12]; uint32_t State; } SPI_HandleTypeDef;
#endif
`;

const HAL_CONF = `#ifndef __STM32F4xx_HAL_CONF_H
#define __STM32F4xx_HAL_CONF_H
#define HAL_MODULE_ENABLED
#define HAL_ADC_MODULE_ENABLED
#define HAL_TIM_MODULE_ENABLED
#define HAL_UART_MODULE_ENABLED
#define HAL_GPIO_MODULE_ENABLED
#define HAL_EXTI_MODULE_ENABLED
#define HAL_DMA_MODULE_ENABLED
#define HAL_RCC_MODULE_ENABLED
#define HAL_FLASH_MODULE_ENABLED
#define HAL_PWR_MODULE_ENABLED
#define HAL_CORTEX_MODULE_ENABLED
#define HSE_VALUE 8000000U
#define HSE_STARTUP_TIMEOUT 100U
#define HSI_VALUE 16000000U
#define LSI_VALUE 32000U
#define LSE_VALUE 32768U
#define EXTERNAL_CLOCK_VALUE 12288000U
#define VDD_VALUE 3300U
#define TICK_INT_PRIORITY 15U
#define USE_RTOS 0U
#define PREFETCH_ENABLE 1U
#define INSTRUCTION_CACHE_ENABLE 1U
#define DATA_CACHE_ENABLE 1U
#endif
`;

/** Built-in C source linked into every program (system globals). */
export const SYSTEM_C = `#include "stm32f4xx.h"
uint32_t SystemCoreClock = 16000000;
volatile uint32_t uwTick;
uint32_t uwTickPrio = 16;
`;

export const SYSTEM_HEADERS: Record<string, string> = {
  'stdint.h': STDINT,
  'stddef.h': STDDEF,
  'stdbool.h': STDBOOL,
  'stdio.h': STDIO,
  'stdarg.h': STDARG,
  'string.h': STRING,
  'stdlib.h': STDLIB,
  'math.h': MATH,
  'stm32f4xx.h': DEVICE,
  'stm32f401xe.h': DEVICE,
  'stm32f4xx_hal.h': HAL,
  'stm32f4xx_hal_def.h': '#include "stm32f4xx_hal.h"\n',
  'stm32f4xx_hal_conf.h': HAL_CONF,
  'core_cm4.h': '#include "stm32f4xx.h"\n',
  'cmsis_gcc.h': '',
};

export const DEFAULT_HAL_CONF = HAL_CONF;
