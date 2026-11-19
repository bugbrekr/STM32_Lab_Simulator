// Native implementations of the STM32 HAL subset and libc used by lab code.
import type { Runtime } from '../runtime';
import { Fault } from '../mcu/mcu';
import { TIMERS, TIMER_INFO } from '../mcu/pins';

type Gen<T = number> = Generator<number, T, unknown>;

const RCC_BASE = 0x40023800;
const RCC_CR = RCC_BASE + 0x00;
const RCC_PLLCFGR = RCC_BASE + 0x04;
const RCC_CFGR = RCC_BASE + 0x08;
const RCC_APB2ENR = RCC_BASE + 0x44;
const FLASH_ACR = 0x40023c00;
const EXTI_BASE = 0x40013c00;
const SYSCFG_BASE = 0x40013800;
const ADC_CCR = 0x40012304;

const HAL_OK = 0;
const HAL_ERROR = 1;
const HAL_BUSY = 2;
const HAL_TIMEOUT = 3;

export function formatC(rt: Runtime, fmt: number[], args: number[], onFloatSkipped: () => void): number[] {
  const out: number[] = [];
  let ai = 0;
  const next = () => (ai < args.length ? args[ai++] : 0);
  const pushStr = (s: string) => {
    for (let i = 0; i < s.length; i++) out.push(s.charCodeAt(i) & 0xff);
  };
  for (let i = 0; i < fmt.length; i++) {
    const c = fmt[i];
    if (c !== 37) {
      out.push(c);
      continue;
    }
    i++;
    if (fmt[i] === 37) {
      out.push(37);
      continue;
    }
    let left = false, plus = false, space = false, zero = false, alt = false;
    for (;; i++) {
      const f = String.fromCharCode(fmt[i]);
      if (f === '-') left = true;
      else if (f === '+') plus = true;
      else if (f === ' ') space = true;
      else if (f === '0') zero = true;
      else if (f === '#') alt = true;
      else break;
    }
    let width = 0;
    if (fmt[i] === 42) {
      width = next() | 0;
      if (width < 0) {
        left = true;
        width = -width;
      }
      i++;
    } else while (fmt[i] >= 48 && fmt[i] <= 57) width = width * 10 + (fmt[i++] - 48);
    let prec = -1;
    if (fmt[i] === 46) {
      i++;
      prec = 0;
      if (fmt[i] === 42) {
        prec = next() | 0;
        i++;
      } else while (fmt[i] >= 48 && fmt[i] <= 57) prec = prec * 10 + (fmt[i++] - 48);
    }
    let len = '';
    while ([104, 108, 76, 122, 106, 116, 113].includes(fmt[i])) len += String.fromCharCode(fmt[i++]);
    const conv = String.fromCharCode(fmt[i] ?? 0);
    let body = '';
    let sign = '';
    let numeric = false;
    switch (conv) {
      case 'd':
      case 'i': {
        let v = next();
        if (len === 'hh') v = (v << 24) >> 24;
        else if (len === 'h') v = (v << 16) >> 16;
        else if (len !== 'll' && len !== 'j') v = v | 0;
        if (v < 0) {
          sign = '-';
          v = -v;
        } else if (plus) sign = '+';
        else if (space) sign = ' ';
        body = Math.trunc(v).toString();
        numeric = true;
        break;
      }
      case 'u':
      case 'x':
      case 'X':
      case 'o': {
        let v = next();
        if (len === 'hh') v &= 0xff;
        else if (len === 'h') v &= 0xffff;
        else if (len !== 'll' && len !== 'j') v = v >>> 0;
        else if (v < 0) v = Number(BigInt.asUintN(64, BigInt(Math.trunc(v))));
        const base = conv === 'u' ? 10 : conv === 'o' ? 8 : 16;
        body = Math.trunc(v).toString(base);
        if (conv === 'X') body = body.toUpperCase();
        if (alt && v !== 0 && base === 16) sign = conv === 'X' ? '0X' : '0x';
        if (alt && base === 8) body = '0' + body;
        numeric = true;
        break;
      }
      case 'c':
        body = String.fromCharCode(next() & 0xff);
        break;
      case 's': {
        const a = next();
        let s = a ? rt.cstr(a) : '(null)';
        if (prec >= 0) s = s.slice(0, prec);
        body = s;
        break;
      }
      case 'p':
        body = '0x' + (next() >>> 0).toString(16);
        break;
      case 'f':
      case 'F':
      case 'e':
      case 'E':
      case 'g':
      case 'G': {
        const v = next();
        if (!rt.settings.printfFloat) {
          onFloatSkipped();
          continue;
        }
        const p = prec < 0 ? 6 : prec;
        let s: string;
        const av = Math.abs(v);
        if (!Number.isFinite(v)) s = Number.isNaN(v) ? 'nan' : 'inf';
        else if (conv === 'f' || conv === 'F') s = av.toFixed(p);
        else if (conv === 'e' || conv === 'E') s = av.toExponential(p).replace(/e([+-])(\d)$/, 'e$10$2');
        else {
          s = av.toPrecision(p === 0 ? 1 : p);
          if (!alt && s.includes('.') && !s.includes('e')) s = s.replace(/\.?0+$/, '');
        }
        if (conv === 'E' || conv === 'G') s = s.toUpperCase();
        if (v < 0 || Object.is(v, -0)) sign = '-';
        else if (plus) sign = '+';
        else if (space) sign = ' ';
        body = s;
        numeric = true;
        break;
      }
      case 'n':
        next();
        continue;
      default:
        pushStr('%' + len + conv);
        continue;
    }
    if (numeric && prec >= 0 && 'diuxXo'.includes(conv)) {
      while (body.length < prec) body = '0' + body;
      if (prec === 0 && body === '0') body = '';
      zero = false;
    }
    let full = sign + body;
    if (full.length < width) {
      if (left) full = full + ' '.repeat(width - full.length);
      else if (zero && numeric) full = sign + '0'.repeat(width - full.length) + body;
      else full = ' '.repeat(width - full.length) + full;
    }
    pushStr(full);
  }
  return out;
}

export function createNatives(rt: Runtime): Record<string, (...a: any[]) => unknown> {
  const mcu = rt.mcu;
  const S = rt.S;
  const r32 = (a: number) => rt.r32(a);
  const w32 = (a: number, v: number) => rt.w32(a, v >>> 0);
  const modify = (a: number, clear: number, set: number) => w32(a, (r32(a) & ~clear) | set);
  const fld = (p: number, t: string, f: string) => rt.fld(p, t, f);
  const setFld = (p: number, t: string, f: string, v: number) => rt.setFld(p, t, f, v);
  const adv = (sec: number) => {
    S.c += sec * mcu.sysclk();
  };
  const warn = (k: string, m: string) => mcu.warn(k, m);
  let unbuffered = false;
  const txDone = new Set<number>();

  const getTick = (): number => {
    if (!rt.tickRunning) return 0;
    const t = Math.floor((mcu.now() - rt.tickBase) * 1000 + 1e-9) >>> 0;
    const a = rt.globalAddr('uwTick');
    if (a !== null) rt.w32(a, t);
    return t;
  };

  function timerOf(inst: number): (typeof TIMER_INFO)[keyof typeof TIMER_INFO] | null {
    for (const t of TIMERS) if (TIMER_INFO[t].base === inst) return TIMER_INFO[t];
    return null;
  }
  function usartOf(inst: number) {
    if (inst === mcu.usart2.base) return mcu.usart2;
    if (inst === mcu.usart1.base) return mcu.usart1;
    if (inst === mcu.usart6.base) return mcu.usart6;
    return null;
  }
  const isGpio = (p: number) => p >= 0x40020000 && p <= 0x40021c00 && (p & 0x3ff) === 0;

  // ---------- stdout ----------
  function* flushStdout(): Gen<void> {
    if (!rt.stdoutBuf.length) return;
    const buf = rt.stdoutBuf;
    rt.stdoutBuf = [];
    if (rt.hasUser('_write')) {
      const size = Math.ceil((buf.length + 4) / 8) * 8;
      S.sp -= size;
      const p = S.sp;
      for (let i = 0; i < buf.length; i++) rt.w8(p + i, buf[i]);
      try {
        yield* rt.callUser('_write', [1, p, buf.length]);
      } finally {
        S.sp += size;
      }
      return;
    }
    if (!rt.hasUser('__io_putchar')) {
      warn('no-putchar', 'printf output is discarded: neither __io_putchar() nor _write() is defined. Redirect printf to UART (e.g. define int __io_putchar(int ch) that calls HAL_UART_Transmit).');
      return;
    }
    for (const b of buf) yield* rt.callUser('__io_putchar', [b]);
  }
  function* putBytes(bytes: number[]): Gen<void> {
    S.c += bytes.length * 30;
    for (const b of bytes) {
      rt.stdoutBuf.push(b);
      if (unbuffered || b === 10 || rt.stdoutBuf.length >= 1024) yield* flushStdout();
    }
  }
  const floatSkipped = () =>
    warn('printf-float', "printf: %f is not supported by newlib-nano by default, so nothing was printed. Enable 'Use float with printf from newlib-nano (-u _printf_float)' in Project ▸ Properties ▸ C/C++ Build ▸ Settings ▸ MCU Settings.");

  // ---------- TIM helpers ----------
  function timBaseInit(h: number) {
    const T = 'TIM_HandleTypeDef';
    const inst = fld(h, T, 'Instance');
    const info = timerOf(inst);
    if (!info) throw new Fault('HAL_TIM: htim->Instance is not a valid timer');
    let cr1 = r32(inst);
    cr1 &= ~(0x70 | 0x300 | 0x80);
    cr1 |= fld(h, T, 'Init.CounterMode') & 0x70;
    cr1 |= fld(h, T, 'Init.ClockDivision') & 0x300;
    cr1 |= fld(h, T, 'Init.AutoReloadPreload') & 0x80;
    w32(inst, cr1);
    w32(inst + 0x2c, fld(h, T, 'Init.Period'));
    w32(inst + 0x28, fld(h, T, 'Init.Prescaler'));
    if (info.advanced) w32(inst + 0x30, fld(h, T, 'Init.RepetitionCounter'));
    w32(inst + 0x14, 1); // UG
    setFld(h, T, 'State', 1);
    for (let i = 0; i < 4; i++) {
      rt.w32(rt.fieldAddr(h, T, 'ChannelState') + i * 4, 1);
    }
  }
  function chIndex(ch: number) {
    return (ch >>> 2) + 1;
  }
  function ocConfig(h: number, oc: number, ch: number) {
    const T = 'TIM_HandleTypeDef';
    const O = 'TIM_OC_InitTypeDef';
    const inst = fld(h, T, 'Instance');
    const idx = chIndex(ch);
    if (idx < 1 || idx > 4) return HAL_ERROR;
    const sh = (idx - 1) * 4;
    modify(inst + 0x20, 1 << sh, 0); // disable channel
    const ccmrAddr = inst + (idx <= 2 ? 0x18 : 0x1c);
    const msh = ((idx - 1) & 1) * 8;
    let ccmr = r32(ccmrAddr);
    ccmr &= ~((0x73 | 0x0c) << msh);
    ccmr |= (fld(oc, O, 'OCMode') & 0x70) << msh;
    ccmr |= 0x08 << msh; // OCxPE (preload) as HAL does for PWM
    ccmr |= (fld(oc, O, 'OCFastMode') & 0x04) << msh;
    w32(ccmrAddr, ccmr);
    modify(inst + 0x20, 2 << sh, (fld(oc, O, 'OCPolarity') & 2) << sh);
    w32(inst + 0x34 + (idx - 1) * 4, fld(oc, O, 'Pulse'));
    return HAL_OK;
  }
  function chStart(h: number, ch: number, it = false) {
    const inst = fld(h, 'TIM_HandleTypeDef', 'Instance');
    const info = timerOf(inst);
    if (!info) return HAL_ERROR;
    const idx = chIndex(ch);
    if (idx > info.channels) {
      warn(`ch-${inst}-${idx}`, `${Object.keys(TIMER_INFO).find((k) => TIMER_INFO[k as keyof typeof TIMER_INFO] === info)} has no channel ${idx}`);
      return HAL_ERROR;
    }
    if (it) modify(inst + 0x0c, 0, 1 << idx);
    modify(inst + 0x20, 0, 1 << ((idx - 1) * 4));
    if (info.advanced) modify(inst + 0x44, 0, 1 << 15);
    if ((r32(inst + 0x08) & 7) !== 6) modify(inst, 0, 1);
    return HAL_OK;
  }
  function chStop(h: number, ch: number) {
    const inst = fld(h, 'TIM_HandleTypeDef', 'Instance');
    const info = timerOf(inst);
    if (!info) return HAL_ERROR;
    const idx = chIndex(ch);
    modify(inst + 0x20, 1 << ((idx - 1) * 4), 0);
    const ccer = r32(inst + 0x20);
    if ((ccer & 0x1111) === 0 && (ccer & 0x444) === 0) {
      if (info.advanced) modify(inst + 0x44, 1 << 15, 0);
      modify(inst, 1, 0);
    }
    return HAL_OK;
  }

  // ---------- UART helpers ----------
  function frameTime(u: ReturnType<typeof usartOf>): number {
    if (!u) return 0;
    const baud = u.baud();
    const f = u.frame();
    if (!baud) return Infinity;
    return (1 + f.bits + (f.parity !== 'none' && f.bits === 8 ? 0 : 0) + f.stop) / baud;
  }

  const N: Record<string, (...a: any[]) => unknown> = {
    // ================= core =================
    *HAL_Init(): Gen {
      modify(FLASH_ACR, 0, (1 << 8) | (1 << 9) | (1 << 10));
      mcu.scb[3] = (mcu.scb[3] & ~0x700) | (3 << 8);
      rt.tickBase = mcu.now();
      rt.tickRunning = true;
      mcu.write32(0xe000e014, Math.round(mcu.clocks().hclk / 1000) - 1);
      mcu.write32(0xe000e010, 7);
      yield* rt.callUser('HAL_MspInit', []);
      return HAL_OK;
    },
    *HAL_DeInit(): Gen {
      yield* rt.callUser('HAL_MspDeInit', []);
      return HAL_OK;
    },
    HAL_InitTick: () => {
      if (!rt.tickRunning) {
        rt.tickBase = mcu.now();
        rt.tickRunning = true;
      }
      return HAL_OK;
    },
    HAL_IncTick: () => 0,
    *HAL_Delay(ms: number): Gen<void> {
      ms >>>= 0;
      if (!rt.tickRunning) {
        warn('delay-notick', 'HAL_Delay() called but SysTick is not running (was HAL_Init() called?). The CPU waits forever.');
        yield* rt.waitUntil(() => false, Infinity);
        return;
      }
      const start = getTick();
      let wait = ms;
      if (wait === 0xffffffff) {
        yield* rt.waitUntil(() => false, Infinity);
        return;
      }
      wait += 1;
      const targetT = rt.tickBase + (start + wait) / 1000;
      yield* rt.waitCycles(Math.ceil(mcu.cyclesAt(targetT)));
      getTick();
    },
    HAL_GetTick: () => getTick(),
    HAL_GetTickPrio: () => 15,
    HAL_SuspendTick: () => 0,
    HAL_ResumeTick: () => 0,
    HAL_GetHalVersion: () => 0x01080300,
    HAL_GetREVID: () => 0x1000,
    HAL_GetDEVID: () => 0x433,
    HAL_GetUIDw0: () => 0x00350040,
    HAL_MspInit: () => 0,
    HAL_MspDeInit: () => 0,

    // ================= cortex =================
    HAL_NVIC_SetPriorityGrouping: (g: number) => {
      mcu.scb[3] = (mcu.scb[3] & ~0x700) | ((g & 7) << 8);
    },
    HAL_NVIC_SetPriority: (irq: number, pre: number) => {
      if (irq >= 0) mcu.nvic.priority.set(irq, pre & 15);
    },
    HAL_NVIC_EnableIRQ: (irq: number) => {
      if (irq >= 0) {
        mcu.nvic.enabled.add(irq);
        mcu.irqMaybe();
      }
    },
    HAL_NVIC_DisableIRQ: (irq: number) => {
      if (irq >= 0) mcu.nvic.enabled.delete(irq);
    },
    HAL_NVIC_SetPendingIRQ: (irq: number) => {
      if (irq >= 0) mcu.nvic.setPending(irq);
    },
    HAL_NVIC_ClearPendingIRQ: (irq: number) => {
      mcu.nvic.pending.delete(irq);
    },
    HAL_NVIC_SystemReset: () => {
      throw new Fault('System reset requested (HAL_NVIC_SystemReset)', 'user');
    },
    NVIC_SystemReset: () => {
      throw new Fault('System reset requested (NVIC_SystemReset)', 'user');
    },
    HAL_SYSTICK_Config: () => 0,
    SysTick_Config: () => 0,
    HAL_SYSTICK_CLKSourceConfig: () => 0,
    *HAL_SYSTICK_IRQHandler(): Gen {
      yield* rt.callUser('HAL_SYSTICK_Callback', []);
      return 0;
    },
    HAL_SYSTICK_Callback: () => 0,
    NVIC_EnableIRQ: (irq: number) => N.HAL_NVIC_EnableIRQ(irq),
    NVIC_DisableIRQ: (irq: number) => N.HAL_NVIC_DisableIRQ(irq),
    NVIC_SetPriority: (irq: number, p: number) => N.HAL_NVIC_SetPriority(irq, p),
    __disable_irq: () => {
      mcu.nvic.primask = true;
    },
    __enable_irq: () => {
      mcu.nvic.primask = false;
      mcu.irqMaybe();
    },
    __get_PRIMASK: () => (mcu.nvic.primask ? 1 : 0),
    __set_PRIMASK: (v: number) => {
      mcu.nvic.primask = (v & 1) === 1;
      if (!mcu.nvic.primask) mcu.irqMaybe();
    },
    __NOP: () => 0,
    __DSB: () => 0,
    __ISB: () => 0,
    __DMB: () => 0,
    __SEV: () => 0,
    *__WFI(): Gen {
      // sleep until the next event (interrupt) or 10 ms max per chunk
      const target = Math.min(S.evt, S.c + mcu.sysclk() * 0.01);
      if (S.c < target) S.c = Math.ceil(target);
      yield* rt.poll(-1, -1, null);
      return 0;
    },
    *__WFE(): Gen {
      return (yield* (N.__WFI as () => Gen)()) as number;
    },
    __RBIT: (v: number) => {
      let r = 0;
      for (let i = 0; i < 32; i++) if (v & (1 << i)) r |= 1 << (31 - i);
      return r >>> 0;
    },
    __CLZ: (v: number) => Math.clz32(v),
    __REV: (v: number) => (((v & 0xff) << 24) | ((v & 0xff00) << 8) | ((v >>> 8) & 0xff00) | (v >>> 24)) >>> 0,
    SystemInit: () => 0,
    SystemCoreClockUpdate: () => {
      const a = rt.globalAddr('SystemCoreClock');
      if (a !== null) rt.w32(a, Math.round(mcu.clocks().hclk));
    },

    // ================= RCC =================
    HAL_RCC_OscConfig: (p: number) => {
      const T = 'RCC_OscInitTypeDef';
      if (!p) return HAL_ERROR;
      const type = fld(p, T, 'OscillatorType');
      const sws = (r32(RCC_CFGR) >>> 2) & 3;
      if (type & 1) {
        const st = fld(p, T, 'HSEState');
        let cr = r32(RCC_CR) & ~((1 << 16) | (1 << 18));
        if (st & (1 << 16)) cr |= 1 << 16;
        if (st & (1 << 18)) cr |= 1 << 18;
        if (!(st & (1 << 16)) && sws === 1) return HAL_ERROR;
        w32(RCC_CR, cr);
        if (st) adv(0.0001);
      }
      if (type & 2) {
        const st = fld(p, T, 'HSIState');
        if (!st && sws === 0) return HAL_ERROR;
        const cal = fld(p, T, 'HSICalibrationValue') & 0x1f;
        w32(RCC_CR, (r32(RCC_CR) & ~(1 | (0x1f << 3))) | (st ? 1 : 0) | (cal << 3));
      }
      const pllState = fld(p, T, 'PLL.PLLState');
      if (pllState !== 0) {
        if (sws === 2) {
          if (pllState === 1) return HAL_ERROR;
          return HAL_OK;
        }
        if (pllState === 2) {
          const src = fld(p, T, 'PLL.PLLSource');
          const m = fld(p, T, 'PLL.PLLM');
          const n = fld(p, T, 'PLL.PLLN');
          const pp = fld(p, T, 'PLL.PLLP');
          const q = fld(p, T, 'PLL.PLLQ');
          const fin = src ? 8e6 : 16e6;
          if (src && !(r32(RCC_CR) & (1 << 16))) {
            warn('pll-hse', 'PLL source is HSE but HSE is not enabled — PLL will not lock (HAL_TIMEOUT)');
            return HAL_TIMEOUT;
          }
          if (m < 2 || m > 63 || n < 50 || n > 432 || ![2, 4, 6, 8].includes(pp)) {
            warn('pll-param', `Invalid PLL parameters (M=${m}, N=${n}, P=${pp})`);
            return HAL_ERROR;
          }
          const vin = fin / m;
          const vco = vin * n;
          if (vin < 0.95e6 || vin > 2.1e6) warn('pll-vin', `PLL input ${(vin / 1e6).toFixed(2)} MHz is outside 1–2 MHz (check PLLM)`);
          if (vco < 100e6 || vco > 432e6) warn('pll-vco', `PLL VCO ${(vco / 1e6).toFixed(0)} MHz is outside 100–432 MHz (check PLLN)`);
          modify(RCC_CR, 1 << 24, 0);
          w32(RCC_PLLCFGR, (m & 0x3f) | ((n & 0x1ff) << 6) | ((((pp >> 1) - 1) & 3) << 16) | (src ? 1 << 22 : 0) | ((q & 0xf) << 24));
          modify(RCC_CR, 0, 1 << 24);
          adv(0.0002);
        } else modify(RCC_CR, 1 << 24, 0);
      }
      return HAL_OK;
    },
    HAL_RCC_ClockConfig: (p: number, latency: number) => {
      const T = 'RCC_ClkInitTypeDef';
      if (!p) return HAL_ERROR;
      const type = fld(p, T, 'ClockType');
      if (latency > (r32(FLASH_ACR) & 0xf)) modify(FLASH_ACR, 0xf, latency & 0xf);
      // like the real HAL: set the highest APB dividers first so PCLKs never exceed their limits
      if (type & 4) modify(RCC_CFGR, 0x1c00, 0x1c00);
      if (type & 8) modify(RCC_CFGR, 0xe000, 0xe000);
      if (type & 2) modify(RCC_CFGR, 0xf0, fld(p, T, 'AHBCLKDivider') & 0xf0);
      if (type & 1) {
        const src = fld(p, T, 'SYSCLKSource') & 3;
        const cr = r32(RCC_CR);
        if (src === 1 && !(cr & (1 << 17))) return HAL_ERROR;
        if (src === 2 && !(cr & (1 << 25))) return HAL_ERROR;
        if (src === 0 && !(cr & 2)) return HAL_ERROR;
        modify(RCC_CFGR, 3, src);
      }
      if (latency < (r32(FLASH_ACR) & 0xf)) modify(FLASH_ACR, 0xf, latency & 0xf);
      if (type & 4) modify(RCC_CFGR, 0x1c00, fld(p, T, 'APB1CLKDivider') & 0x1c00);
      if (type & 8) modify(RCC_CFGR, 0xe000, (fld(p, T, 'APB2CLKDivider') << 3) & 0xe000);
      const hclk = mcu.clocks().hclk;
      const need = hclk <= 30e6 ? 0 : hclk <= 60e6 ? 1 : 2;
      if ((r32(FLASH_ACR) & 0xf) < need) warn('flash-ws', `FLASH latency ${r32(FLASH_ACR) & 0xf} WS is too low for HCLK ${(hclk / 1e6).toFixed(0)} MHz (needs ${need} WS). Real hardware would crash.`);
      const a = rt.globalAddr('SystemCoreClock');
      if (a !== null) rt.w32(a, Math.round(hclk));
      return HAL_OK;
    },
    HAL_RCC_GetSysClockFreq: () => Math.round(mcu.clocks().sysclk),
    HAL_RCC_GetHCLKFreq: () => Math.round(mcu.clocks().hclk),
    HAL_RCC_GetPCLK1Freq: () => Math.round(mcu.clocks().pclk1),
    HAL_RCC_GetPCLK2Freq: () => Math.round(mcu.clocks().pclk2),
    HAL_RCC_MCOConfig: () => 0,

    // ================= GPIO =================
    HAL_GPIO_Init: (port: number, init: number) => {
      if (!isGpio(port)) throw new Fault(`HardFault: HAL_GPIO_Init called with invalid GPIO port 0x${(port >>> 0).toString(16)}`);
      const T = 'GPIO_InitTypeDef';
      const pins = fld(init, T, 'Pin') & 0xffff;
      const mode = fld(init, T, 'Mode');
      const pull = fld(init, T, 'Pull') & 3;
      const speed = fld(init, T, 'Speed') & 3;
      const alt = fld(init, T, 'Alternate') & 0xf;
      const io = mode & 3;
      const od = (mode >>> 4) & 1;
      const portIdx = ((port - 0x40020000) >>> 10) & 7;
      for (let pos = 0; pos < 16; pos++) {
        if (!(pins & (1 << pos))) continue;
        if (io === 1 || io === 2) {
          modify(port + 0x08, 3 << (pos * 2), speed << (pos * 2));
          modify(port + 0x04, 1 << pos, od << pos);
        }
        modify(port + 0x0c, 3 << (pos * 2), pull << (pos * 2));
        if (io === 2) {
          const reg = port + 0x20 + (pos >> 3) * 4;
          modify(reg, 0xf << ((pos & 7) * 4), alt << ((pos & 7) * 4));
        }
        modify(port, 3 << (pos * 2), io << (pos * 2));
        if (mode & 0x10000000) {
          modify(RCC_APB2ENR, 0, 1 << 14);
          const cr = SYSCFG_BASE + 0x08 + (pos >> 2) * 4;
          modify(cr, 0xf << ((pos & 3) * 4), portIdx << ((pos & 3) * 4));
          const bit = 1 << pos;
          modify(EXTI_BASE + 0x00, bit, mode & 0x10000 ? bit : 0);
          modify(EXTI_BASE + 0x04, bit, mode & 0x20000 ? bit : 0);
          modify(EXTI_BASE + 0x08, bit, mode & 0x100000 ? bit : 0);
          modify(EXTI_BASE + 0x0c, bit, mode & 0x200000 ? bit : 0);
        }
      }
    },
    HAL_GPIO_DeInit: (port: number, pins: number) => {
      for (let pos = 0; pos < 16; pos++) {
        if (!(pins & (1 << pos))) continue;
        modify(port, 3 << (pos * 2), 0);
        modify(port + 0x0c, 3 << (pos * 2), 0);
      }
    },
    HAL_GPIO_ReadPin: (port: number, pin: number) => {
      if (!isGpio(port)) throw new Fault(`HardFault: HAL_GPIO_ReadPin called with invalid GPIO port 0x${(port >>> 0).toString(16)}`);
      return r32(port + 0x10) & pin & 0xffff ? 1 : 0;
    },
    HAL_GPIO_WritePin: (port: number, pin: number, state: number) => {
      if (!isGpio(port)) throw new Fault(`HardFault: HAL_GPIO_WritePin called with invalid GPIO port 0x${(port >>> 0).toString(16)}`);
      w32(port + 0x18, state ? pin & 0xffff : (pin & 0xffff) << 16);
    },
    HAL_GPIO_TogglePin: (port: number, pin: number) => {
      if (!isGpio(port)) throw new Fault(`HardFault: HAL_GPIO_TogglePin called with invalid GPIO port 0x${(port >>> 0).toString(16)}`);
      const odr = r32(port + 0x14);
      w32(port + 0x18, ((odr & pin) << 16) | (~odr & pin & 0xffff));
    },
    HAL_GPIO_LockPin: () => HAL_OK,
    *HAL_GPIO_EXTI_IRQHandler(pin: number): Gen {
      if (r32(EXTI_BASE + 0x14) & pin) {
        w32(EXTI_BASE + 0x14, pin);
        yield* rt.callUser('HAL_GPIO_EXTI_Callback', [pin & 0xffff]);
      }
      return 0;
    },
    HAL_GPIO_EXTI_Callback: () => 0,

    // ================= ADC =================
    *HAL_ADC_Init(h: number): Gen {
      const T = 'ADC_HandleTypeDef';
      if (!h) return HAL_ERROR;
      const inst = fld(h, T, 'Instance');
      if (inst !== 0x40012000) return HAL_ERROR;
      if (fld(h, T, 'State') === 0) {
        setFld(h, T, 'Lock', 0);
        yield* rt.callUser('HAL_ADC_MspInit', [h]);
      }
      modify(ADC_CCR, 3 << 16, fld(h, T, 'Init.ClockPrescaler') & (3 << 16));
      modify(inst + 0x04, (1 << 8) | (3 << 24) | (1 << 11), (fld(h, T, 'Init.ScanConvMode') ? 1 << 8 : 0) | (fld(h, T, 'Init.Resolution') & (3 << 24)) | (fld(h, T, 'Init.DiscontinuousConvMode') ? 1 << 11 : 0));
      let cr2 = r32(inst + 0x08) & ~((1 << 11) | (0xf << 24) | (3 << 28) | 2 | (1 << 10) | (1 << 9));
      cr2 |= fld(h, T, 'Init.DataAlign') & (1 << 11);
      const trig = fld(h, T, 'Init.ExternalTrigConv');
      if (trig !== 0x0f000001) cr2 |= (trig & (0xf << 24)) | (fld(h, T, 'Init.ExternalTrigConvEdge') & (3 << 28));
      if (fld(h, T, 'Init.ContinuousConvMode')) cr2 |= 2;
      if (fld(h, T, 'Init.EOCSelection')) cr2 |= 1 << 10;
      if (fld(h, T, 'Init.DMAContinuousRequests')) cr2 |= 1 << 9;
      w32(inst + 0x08, cr2);
      modify(inst + 0x2c, 0xf << 20, ((fld(h, T, 'Init.NbrOfConversion') - 1) & 0xf) << 20);
      setFld(h, T, 'State', 1);
      setFld(h, T, 'ErrorCode', 0);
      return HAL_OK;
    },
    *HAL_ADC_DeInit(h: number): Gen {
      yield* rt.callUser('HAL_ADC_MspDeInit', [h]);
      setFld(h, 'ADC_HandleTypeDef', 'State', 0);
      return HAL_OK;
    },
    HAL_ADC_MspInit: () => 0,
    HAL_ADC_MspDeInit: () => 0,
    HAL_ADC_ConfigChannel: (h: number, cfg: number) => {
      const inst = fld(h, 'ADC_HandleTypeDef', 'Instance');
      const C = 'ADC_ChannelConfTypeDef';
      const ch = fld(cfg, C, 'Channel') & 0x1f;
      const rank = fld(cfg, C, 'Rank');
      const smp = fld(cfg, C, 'SamplingTime') & 7;
      if (ch > 18) return HAL_ERROR;
      if (ch > 9) modify(inst + 0x0c, 7 << ((ch - 10) * 3), smp << ((ch - 10) * 3));
      else modify(inst + 0x10, 7 << (ch * 3), smp << (ch * 3));
      if (rank >= 1 && rank <= 6) modify(inst + 0x34, 0x1f << ((rank - 1) * 5), ch << ((rank - 1) * 5));
      else if (rank >= 7 && rank <= 12) modify(inst + 0x30, 0x1f << ((rank - 7) * 5), ch << ((rank - 7) * 5));
      else if (rank >= 13 && rank <= 16) modify(inst + 0x2c, 0x1f << ((rank - 13) * 5), ch << ((rank - 13) * 5));
      if (ch === 17 || ch === 18) modify(ADC_CCR, 0, 1 << 23);
      return HAL_OK;
    },
    HAL_ADC_Start: (h: number) => {
      const T = 'ADC_HandleTypeDef';
      const inst = fld(h, T, 'Instance');
      if (!(r32(inst + 0x08) & 1)) {
        modify(inst + 0x08, 0, 1);
        adv(3e-6);
      }
      if (!(r32(inst + 0x08) & 1)) return HAL_ERROR;
      setFld(h, T, 'State', (fld(h, T, 'State') & ~0x200) | 0x100);
      modify(inst + 0x00, 0x22, 0);
      if (((r32(inst + 0x08) >>> 28) & 3) === 0) modify(inst + 0x08, 0, 1 << 30);
      return HAL_OK;
    },
    HAL_ADC_Stop: (h: number) => {
      const T = 'ADC_HandleTypeDef';
      const inst = fld(h, T, 'Instance');
      modify(inst + 0x08, 1, 0);
      setFld(h, T, 'State', 1);
      return HAL_OK;
    },
    HAL_ADC_PollForConversion: (h: number, timeout: number) => {
      const T = 'ADC_HandleTypeDef';
      const inst = fld(h, T, 'Instance');
      if (!(r32(inst) & 2)) {
        if (timeout !== 0xffffffff) adv(timeout / 1000);
        setFld(h, T, 'State', fld(h, T, 'State') | 4);
        return HAL_TIMEOUT;
      }
      adv(mcu.adc.conversionTime());
      modify(inst, 0x12, 0); // clear STRT | EOC
      // keep DR readable: EOC cleared as HAL does
      setFld(h, T, 'State', fld(h, T, 'State') | 0x200);
      return HAL_OK;
    },
    HAL_ADC_GetValue: (h: number) => {
      const inst = fld(h, 'ADC_HandleTypeDef', 'Instance');
      return r32(inst + 0x4c) & 0xffff;
    },
    HAL_ADC_Start_IT: (h: number) => {
      const inst = fld(h, 'ADC_HandleTypeDef', 'Instance');
      modify(inst + 0x04, 0, 1 << 5);
      const r = N.HAL_ADC_Start(h) as number;
      mcu.schedule(mcu.now() + mcu.adc.conversionTime(), () => mcu.nvic.setPending(18));
      return r;
    },
    HAL_ADC_Stop_IT: (h: number) => {
      const inst = fld(h, 'ADC_HandleTypeDef', 'Instance');
      modify(inst + 0x04, 1 << 5, 0);
      return N.HAL_ADC_Stop(h);
    },
    *HAL_ADC_IRQHandler(h: number): Gen {
      const inst = fld(h, 'ADC_HandleTypeDef', 'Instance');
      const sr = r32(inst);
      const cr1 = r32(inst + 0x04);
      if (sr & 2 && cr1 & (1 << 5)) {
        const cont = r32(inst + 0x08) & 2;
        if (!cont) modify(inst + 0x04, 1 << 5, 0);
        yield* rt.callUser('HAL_ADC_ConvCpltCallback', [h]);
        modify(inst, 0x12, 0);
        if (cont && r32(inst + 0x04) & (1 << 5)) {
          mcu.adc.convert();
          mcu.schedule(mcu.now() + mcu.adc.conversionTime(), () => mcu.nvic.setPending(18));
        }
      }
      return 0;
    },
    HAL_ADC_ConvCpltCallback: () => 0,
    HAL_ADC_GetState: (h: number) => fld(h, 'ADC_HandleTypeDef', 'State'),
    HAL_ADC_GetError: (h: number) => fld(h, 'ADC_HandleTypeDef', 'ErrorCode'),

    // ================= TIM =================
    *HAL_TIM_Base_Init(h: number): Gen {
      if (!h) return HAL_ERROR;
      if (fld(h, 'TIM_HandleTypeDef', 'State') === 0) yield* rt.callUser('HAL_TIM_Base_MspInit', [h]);
      timBaseInit(h);
      return HAL_OK;
    },
    *HAL_TIM_Base_DeInit(h: number): Gen {
      yield* rt.callUser('HAL_TIM_Base_MspDeInit', [h]);
      setFld(h, 'TIM_HandleTypeDef', 'State', 0);
      return HAL_OK;
    },
    HAL_TIM_Base_MspInit: () => 0,
    HAL_TIM_Base_MspDeInit: () => 0,
    HAL_TIM_Base_Start: (h: number) => {
      modify(fld(h, 'TIM_HandleTypeDef', 'Instance'), 0, 1);
      return HAL_OK;
    },
    HAL_TIM_Base_Stop: (h: number) => {
      modify(fld(h, 'TIM_HandleTypeDef', 'Instance'), 1, 0);
      return HAL_OK;
    },
    HAL_TIM_Base_Start_IT: (h: number) => {
      const inst = fld(h, 'TIM_HandleTypeDef', 'Instance');
      modify(inst + 0x0c, 0, 1);
      modify(inst, 0, 1);
      return HAL_OK;
    },
    HAL_TIM_Base_Stop_IT: (h: number) => {
      const inst = fld(h, 'TIM_HandleTypeDef', 'Instance');
      modify(inst + 0x0c, 1, 0);
      modify(inst, 1, 0);
      return HAL_OK;
    },
    *HAL_TIM_PWM_Init(h: number): Gen {
      if (!h) return HAL_ERROR;
      if (fld(h, 'TIM_HandleTypeDef', 'State') === 0) yield* rt.callUser('HAL_TIM_PWM_MspInit', [h]);
      timBaseInit(h);
      return HAL_OK;
    },
    *HAL_TIM_PWM_DeInit(h: number): Gen {
      yield* rt.callUser('HAL_TIM_PWM_MspDeInit', [h]);
      setFld(h, 'TIM_HandleTypeDef', 'State', 0);
      return HAL_OK;
    },
    HAL_TIM_PWM_MspInit: () => 0,
    HAL_TIM_PWM_MspDeInit: () => 0,
    HAL_TIM_PWM_ConfigChannel: (h: number, oc: number, ch: number) => ocConfig(h, oc, ch),
    HAL_TIM_PWM_Start: (h: number, ch: number) => chStart(h, ch),
    HAL_TIM_PWM_Stop: (h: number, ch: number) => chStop(h, ch),
    *HAL_TIM_OC_Init(h: number): Gen {
      if (fld(h, 'TIM_HandleTypeDef', 'State') === 0) yield* rt.callUser('HAL_TIM_OC_MspInit', [h]);
      timBaseInit(h);
      return HAL_OK;
    },
    HAL_TIM_OC_MspInit: () => 0,
    HAL_TIM_OC_ConfigChannel: (h: number, oc: number, ch: number) => ocConfig(h, oc, ch),
    HAL_TIM_OC_Start: (h: number, ch: number) => chStart(h, ch),
    HAL_TIM_OC_Stop: (h: number, ch: number) => chStop(h, ch),
    HAL_TIM_ConfigClockSource: (h: number, cfg: number) => {
      const inst = fld(h, 'TIM_HandleTypeDef', 'Instance');
      const src = fld(cfg, 'TIM_ClockConfigTypeDef', 'ClockSource');
      if (src === 0x1000) modify(inst + 0x08, 0x7 | 0x70 | 0x4000 | 0xff00, 0);
      else warn('tim-clksrc', 'Only the internal timer clock source is simulated');
      return HAL_OK;
    },
    HAL_TIMEx_MasterConfigSynchronization: (h: number, cfg: number) => {
      const inst = fld(h, 'TIM_HandleTypeDef', 'Instance');
      const M = 'TIM_MasterConfigTypeDef';
      modify(inst + 0x04, 0x70, fld(cfg, M, 'MasterOutputTrigger') & 0x70);
      modify(inst + 0x08, 0x80, fld(cfg, M, 'MasterSlaveMode') & 0x80);
      return HAL_OK;
    },
    HAL_TIMEx_ConfigBreakDeadTime: (h: number, cfg: number) => {
      const inst = fld(h, 'TIM_HandleTypeDef', 'Instance');
      const B = 'TIM_BreakDeadTimeConfigTypeDef';
      const v =
        (fld(cfg, B, 'DeadTime') & 0xff) |
        (fld(cfg, B, 'LockLevel') & 0x300) |
        (fld(cfg, B, 'OffStateIDLEMode') & 0x400) |
        (fld(cfg, B, 'OffStateRunMode') & 0x800) |
        (fld(cfg, B, 'BreakState') & 0x1000) |
        (fld(cfg, B, 'BreakPolarity') & 0x2000) |
        (fld(cfg, B, 'AutomaticOutput') & 0x4000);
      w32(inst + 0x44, v);
      return HAL_OK;
    },
    *HAL_TIM_IRQHandler(h: number): Gen {
      const inst = fld(h, 'TIM_HandleTypeDef', 'Instance');
      const sr = r32(inst + 0x10);
      const dier = r32(inst + 0x0c);
      if (sr & 1 && dier & 1) {
        w32(inst + 0x10, ~1);
        yield* rt.callUser('HAL_TIM_PeriodElapsedCallback', [h]);
      }
      return 0;
    },
    HAL_TIM_PeriodElapsedCallback: () => 0,
    HAL_TIM_Base_GetState: (h: number) => fld(h, 'TIM_HandleTypeDef', 'State'),

    // ================= UART =================
    *HAL_UART_Init(h: number): Gen {
      const T = 'UART_HandleTypeDef';
      if (!h) return HAL_ERROR;
      const inst = fld(h, T, 'Instance');
      const u = usartOf(inst);
      if (!u) return HAL_ERROR;
      if (fld(h, T, 'gState') === 0) {
        setFld(h, T, 'Lock', 0);
        yield* rt.callUser('HAL_UART_MspInit', [h]);
      }
      setFld(h, T, 'gState', 0x24);
      modify(inst + 0x0c, 1 << 13, 0);
      modify(inst + 0x10, 3 << 12, fld(h, T, 'Init.StopBits') & (3 << 12));
      const cr1 = (fld(h, T, 'Init.WordLength') & (1 << 12)) | (fld(h, T, 'Init.Parity') & 0x600) | (fld(h, T, 'Init.Mode') & 0xc) | (fld(h, T, 'Init.OverSampling') & 0x8000);
      modify(inst + 0x0c, (1 << 12) | 0x600 | 0xc | 0x8000, cr1);
      modify(inst + 0x14, 0x300, fld(h, T, 'Init.HwFlowCtl') & 0x300);
      const baud = fld(h, T, 'Init.BaudRate');
      const pclk = u.apb === 1 ? mcu.clocks().pclk1 : mcu.clocks().pclk2;
      if (!baud) return HAL_ERROR;
      const over8 = (cr1 & 0x8000) !== 0;
      let brr: number;
      if (over8) {
        const div = (pclk * 2) / baud;
        const d = Math.round(div);
        brr = (d & 0xfff0) | ((d & 0xf) >> 1);
      } else {
        const div = pclk / (16 * baud);
        let mant = Math.floor(div);
        let frac = Math.round((div - mant) * 16);
        if (frac > 15) {
          mant++;
          frac = 0;
        }
        brr = (mant << 4) | frac;
      }
      w32(inst + 0x08, brr);
      modify(inst + 0x10, (1 << 14) | (1 << 11), 0);
      modify(inst + 0x14, (1 << 5) | (1 << 3) | (1 << 1), 0);
      modify(inst + 0x0c, 0, 1 << 13);
      setFld(h, T, 'ErrorCode', 0);
      setFld(h, T, 'gState', 0x20);
      setFld(h, T, 'RxState', 0x20);
      return HAL_OK;
    },
    *HAL_UART_DeInit(h: number): Gen {
      const inst = fld(h, 'UART_HandleTypeDef', 'Instance');
      modify(inst + 0x0c, 1 << 13, 0);
      yield* rt.callUser('HAL_UART_MspDeInit', [h]);
      setFld(h, 'UART_HandleTypeDef', 'gState', 0);
      setFld(h, 'UART_HandleTypeDef', 'RxState', 0);
      return HAL_OK;
    },
    HAL_UART_MspInit: () => 0,
    HAL_UART_MspDeInit: () => 0,
    *HAL_UART_Transmit(h: number, buf: number, size: number, timeout: number): Gen {
      const T = 'UART_HandleTypeDef';
      if (!h) return HAL_ERROR;
      if (fld(h, T, 'gState') !== 0x20) {
        if (fld(h, T, 'gState') === 0) warn('uart-notinit', 'HAL_UART_Transmit called before HAL_UART_Init (huart not initialised)');
        return HAL_BUSY;
      }
      if (!buf || !size) return HAL_ERROR;
      const inst = fld(h, T, 'Instance');
      const u = usartOf(inst);
      const ft = frameTime(u);
      if (!Number.isFinite(ft)) {
        if (timeout !== 0xffffffff) yield* rt.waitSeconds(timeout / 1000);
        else yield* rt.waitUntil(() => false, Infinity);
        return HAL_TIMEOUT;
      }
      setFld(h, T, 'gState', 0x21);
      const nine = (fld(h, T, 'Init.WordLength') & (1 << 12)) && !fld(h, T, 'Init.Parity');
      for (let i = 0; i < size; i++) {
        const v = nine ? rt.r16(buf + i * 2) & 0x1ff : rt.r8(buf + i);
        w32(inst + 0x04, v);
        yield* rt.waitSeconds(ft);
      }
      setFld(h, T, 'gState', 0x20);
      return HAL_OK;
    },
    *HAL_UART_Receive(h: number, buf: number, size: number, timeout: number): Gen {
      const T = 'UART_HandleTypeDef';
      if (!h) return HAL_ERROR;
      if (fld(h, T, 'RxState') !== 0x20) return HAL_BUSY;
      if (!buf || !size) return HAL_ERROR;
      const inst = fld(h, T, 'Instance');
      const u = usartOf(inst);
      if (!u) return HAL_ERROR;
      setFld(h, T, 'RxState', 0x22);
      const deadline = timeout === 0xffffffff ? Infinity : mcu.now() + timeout / 1000;
      for (let i = 0; i < size; i++) {
        const remain = deadline === Infinity ? Infinity : Math.max(0, deadline - mcu.now());
        const ok = yield* rt.waitUntil(() => u.rxQueue.length > 0, remain);
        if (!ok) {
          setFld(h, T, 'RxState', 0x20);
          return HAL_TIMEOUT;
        }
        rt.w8(buf + i, r32(inst + 0x04) & 0xff);
      }
      setFld(h, T, 'RxState', 0x20);
      return HAL_OK;
    },
    HAL_UART_Transmit_IT: (h: number, buf: number, size: number) => {
      const T = 'UART_HandleTypeDef';
      if (fld(h, T, 'gState') !== 0x20) return HAL_BUSY;
      if (!buf || !size) return HAL_ERROR;
      const inst = fld(h, T, 'Instance');
      const u = usartOf(inst);
      if (!u) return HAL_ERROR;
      const ft = frameTime(u);
      setFld(h, T, 'gState', 0x21);
      const t0 = mcu.now();
      const bytes: number[] = [];
      for (let i = 0; i < size; i++) bytes.push(rt.r8(buf + i));
      bytes.forEach((b, i) => {
        mcu.schedule(t0 + i * ft, () => mcu.write32(inst + 0x04, b));
      });
      mcu.schedule(t0 + size * ft, () => {
        txDone.add(inst);
        mcu.nvic.setPending(u.irq);
      });
      return HAL_OK;
    },
    HAL_UART_Receive_IT: (h: number, buf: number, size: number) => {
      const T = 'UART_HandleTypeDef';
      if (fld(h, T, 'RxState') !== 0x20) return HAL_BUSY;
      if (!buf || !size) return HAL_ERROR;
      const inst = fld(h, T, 'Instance');
      const u = usartOf(inst);
      if (!u) return HAL_ERROR;
      setFld(h, T, 'pRxBuffPtr', buf);
      setFld(h, T, 'RxXferSize', size);
      setFld(h, T, 'RxXferCount', size);
      setFld(h, T, 'RxState', 0x22);
      modify(inst + 0x0c, 0, 1 << 5);
      if (u.rxQueue.length) mcu.nvic.setPending(u.irq);
      return HAL_OK;
    },
    HAL_UART_AbortReceive: (h: number) => {
      const inst = fld(h, 'UART_HandleTypeDef', 'Instance');
      modify(inst + 0x0c, 1 << 5, 0);
      setFld(h, 'UART_HandleTypeDef', 'RxState', 0x20);
      return HAL_OK;
    },
    *HAL_UART_IRQHandler(h: number): Gen {
      const T = 'UART_HandleTypeDef';
      const inst = fld(h, T, 'Instance');
      const u = usartOf(inst);
      if (!u) return 0;
      if (r32(inst) & 0x20 && r32(inst + 0x0c) & (1 << 5) && fld(h, T, 'RxState') === 0x22) {
        const b = r32(inst + 0x04) & 0xff;
        const p = fld(h, T, 'pRxBuffPtr');
        rt.w8(p, b);
        setFld(h, T, 'pRxBuffPtr', p + 1);
        const cnt = fld(h, T, 'RxXferCount') - 1;
        setFld(h, T, 'RxXferCount', cnt);
        if (cnt === 0) {
          modify(inst + 0x0c, 1 << 5, 0);
          setFld(h, T, 'RxState', 0x20);
          yield* rt.callUser('HAL_UART_RxCpltCallback', [h]);
        }
      }
      if (txDone.has(inst)) {
        txDone.delete(inst);
        setFld(h, T, 'gState', 0x20);
        yield* rt.callUser('HAL_UART_TxCpltCallback', [h]);
      }
      if (u.rxQueue.length && r32(inst + 0x0c) & (1 << 5)) mcu.nvic.setPending(u.irq);
      return 0;
    },
    HAL_UART_TxCpltCallback: () => 0,
    HAL_UART_RxCpltCallback: () => 0,
    HAL_UART_ErrorCallback: () => 0,
    HAL_UART_GetState: (h: number) => fld(h, 'UART_HandleTypeDef', 'gState') | fld(h, 'UART_HandleTypeDef', 'RxState'),

    // ================= libc =================
    *printf(fmt: number, va: number[]): Gen {
      const bytes = formatC(rt, rt.cstrBytes(fmt), va, floatSkipped);
      yield* putBytes(bytes);
      return bytes.length;
    },
    sprintf: (dst: number, fmt: number, va: number[]) => {
      const bytes = formatC(rt, rt.cstrBytes(fmt), va, floatSkipped);
      bytes.forEach((b, i) => rt.w8(dst + i, b));
      rt.w8(dst + bytes.length, 0);
      S.c += bytes.length * 20;
      return bytes.length;
    },
    snprintf: (dst: number, n: number, fmt: number, va: number[]) => {
      const bytes = formatC(rt, rt.cstrBytes(fmt), va, floatSkipped);
      if (n > 0) {
        const m = Math.min(bytes.length, n - 1);
        for (let i = 0; i < m; i++) rt.w8(dst + i, bytes[i]);
        rt.w8(dst + m, 0);
      }
      S.c += bytes.length * 20;
      return bytes.length;
    },
    *puts(s: number): Gen {
      const b = rt.cstrBytes(s);
      b.push(10);
      yield* putBytes(b);
      return 1;
    },
    *putchar(c: number): Gen {
      yield* putBytes([c & 0xff]);
      return c & 0xff;
    },
    *fputs(s: number): Gen {
      yield* putBytes(rt.cstrBytes(s));
      return 1;
    },
    *fputc(c: number): Gen {
      yield* putBytes([c & 0xff]);
      return c & 0xff;
    },
    *fflush(): Gen {
      yield* flushStdout();
      return 0;
    },
    *getchar(): Gen {
      if (rt.hasUser('__io_getchar')) return yield* rt.callUser('__io_getchar', []);
      return -1;
    },
    setvbuf: (_s: number, _b: number, mode: number) => {
      unbuffered = mode === 2;
      return 0;
    },
    strlen: (s: number) => rt.cstrBytes(s, 1 << 20).length,
    strcpy: (d: number, s: number) => {
      const b = rt.cstrBytes(s, 1 << 20);
      b.forEach((x, i) => rt.w8(d + i, x));
      rt.w8(d + b.length, 0);
      return d;
    },
    strncpy: (d: number, s: number, n: number) => {
      const b = rt.cstrBytes(s, n);
      for (let i = 0; i < n; i++) rt.w8(d + i, i < b.length ? b[i] : 0);
      return d;
    },
    strcat: (d: number, s: number) => {
      const l = rt.cstrBytes(d, 1 << 20).length;
      N.strcpy(d + l, s);
      return d;
    },
    strncat: (d: number, s: number, n: number) => {
      const l = rt.cstrBytes(d, 1 << 20).length;
      const b = rt.cstrBytes(s, n);
      b.forEach((x, i) => rt.w8(d + l + i, x));
      rt.w8(d + l + b.length, 0);
      return d;
    },
    strcmp: (a: number, b: number) => {
      for (let i = 0; ; i++) {
        const x = rt.r8(a + i), y = rt.r8(b + i);
        if (x !== y) return x - y;
        if (!x) return 0;
      }
    },
    strncmp: (a: number, b: number, n: number) => {
      for (let i = 0; i < n; i++) {
        const x = rt.r8(a + i), y = rt.r8(b + i);
        if (x !== y) return x - y;
        if (!x) return 0;
      }
      return 0;
    },
    strchr: (s: number, c: number) => {
      for (let i = 0; ; i++) {
        const x = rt.r8(s + i);
        if (x === (c & 0xff)) return s + i;
        if (!x) return 0;
      }
    },
    strstr: (h: number, n: number) => {
      const hs = rt.cstr(h, 1 << 20);
      const ns = rt.cstr(n, 1 << 20);
      const i = hs.indexOf(ns);
      return i < 0 ? 0 : h + i;
    },
    memset: (d: number, v: number, n: number) => (rt.R.memset as (d: number, v: number, n: number) => number)(d, v, n),
    memcpy: (d: number, s: number, n: number) => (rt.R.memcpy as (d: number, s: number, n: number) => number)(d, s, n),
    memmove: (d: number, s: number, n: number) => (rt.R.memcpy as (d: number, s: number, n: number) => number)(d, s, n),
    memcmp: (a: number, b: number, n: number) => {
      for (let i = 0; i < n; i++) {
        const x = rt.r8(a + i), y = rt.r8(b + i);
        if (x !== y) return x - y;
      }
      return 0;
    },
    abs: (x: number) => Math.abs(x | 0) | 0,
    labs: (x: number) => Math.abs(x | 0) | 0,
    atoi: (s: number) => parseInt(rt.cstr(s).trim(), 10) | 0,
    atol: (s: number) => parseInt(rt.cstr(s).trim(), 10) | 0,
    rand: () => {
      let x = BigInt(rt.randSeed);
      x = BigInt.asUintN(64, x * 6364136223846793005n + 1n);
      rt.randSeed = Number(x & 0xffffffffffffn);
      return Number((x >> 32n) & 0x7fffffffn);
    },
    srand: (s: number) => {
      rt.randSeed = s >>> 0;
    },
    sqrt: Math.sqrt,
    sqrtf: (x: number) => Math.fround(Math.sqrt(x)),
    pow: Math.pow,
    powf: (x: number, y: number) => Math.fround(Math.pow(x, y)),
    fabs: Math.abs,
    fabsf: (x: number) => Math.fround(Math.abs(x)),
    sin: Math.sin,
    sinf: (x: number) => Math.fround(Math.sin(x)),
    cos: Math.cos,
    cosf: (x: number) => Math.fround(Math.cos(x)),
    tan: Math.tan,
    tanf: (x: number) => Math.fround(Math.tan(x)),
    atan: Math.atan,
    atan2: Math.atan2,
    atan2f: (y: number, x: number) => Math.fround(Math.atan2(y, x)),
    exp: Math.exp,
    log: Math.log,
    log10: Math.log10,
    logf: (x: number) => Math.fround(Math.log(x)),
    floor: Math.floor,
    ceil: Math.ceil,
    round: (x: number) => (x < 0 ? -Math.round(-x) : Math.round(x)),
    roundf: (x: number) => Math.fround(x < 0 ? -Math.round(-x) : Math.round(x)),
    fmod: (x: number, y: number) => x % y,
  };
  return N;
}
