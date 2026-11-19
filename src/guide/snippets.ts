// Knowledge base of code snippets students type in the lab experiments.

export type SnippetCat = 'gpio' | 'timing' | 'adc' | 'uart' | 'pwm' | 'motor' | 'math' | 'c';

export interface Snippet {
  id: string;
  title: string;
  cat: SnippetCat;
  /** line patterns (tested on the trimmed line) */
  match: RegExp[];
  /** what it does (markdown-ish plain text, may contain `code`) */
  what: string;
  /** how to remember it */
  remember: string;
  /** canonical form to practise */
  template?: string;
  /** only applies when the whole file matches this (context) */
  requires?: RegExp;
}

export const CAT_INFO: Record<SnippetCat, { label: string; color: string }> = {
  gpio: { label: 'GPIO', color: '#2e9e44' },
  timing: { label: 'Timing', color: '#d6a31c' },
  adc: { label: 'ADC', color: '#8e44ad' },
  uart: { label: 'UART / printf', color: '#2a7bd6' },
  pwm: { label: 'Timer / PWM', color: '#e67e22' },
  motor: { label: 'Motors', color: '#16a085' },
  math: { label: 'Calculation', color: '#c0392b' },
  c: { label: 'C language', color: '#7f8c8d' },
};

// Order matters: first match wins. Specific snippets first, generic C fallbacks last.
export const SNIPPETS: Snippet[] = [
  // ---------------- UART / printf ----------------
  {
    id: 'printf-redirect',
    title: 'Redirect printf to USART2',
    cat: 'uart',
    match: [/^int\s+__io_putchar\s*\(/, /^HAL_UART_Transmit\s*\(\s*&huart2\s*,\s*\(uint8_t\s*\*\)\s*&ch\s*,\s*1/, /^\/\/\s*Redirect printf/i, /^return\s+ch\s*;/],
    what:
      'printf() formats text and hands every character to `__io_putchar()` (called by `_write()` in syscalls.c). By defining this function and sending the character with `HAL_UART_Transmit(&huart2, …, 1, HAL_MAX_DELAY)`, everything you printf goes out of USART2 → ST-LINK virtual COM port → the serial console on the PC. Without it, printf output simply disappears.',
    remember: 'printf → _write → __io_putchar → UART. “putchar puts ONE char” → size = 1, pointer = &ch, wait forever (HAL_MAX_DELAY).',
    template: 'int __io_putchar(int ch) {\n  HAL_UART_Transmit(&huart2, (uint8_t *)&ch, 1, HAL_MAX_DELAY);\n  return ch;\n}',
  },
  {
    id: 'include-stdio',
    title: 'Include the C standard I/O / string headers',
    cat: 'uart',
    match: [/^#include\s*<(stdio|string|stdlib|math)\.h>/],
    what: '`<stdio.h>` declares printf/sprintf, `<string.h>` declares strlen/memset/memcpy. Put includes inside `/* USER CODE BEGIN Includes */` so CubeMX keeps them when it regenerates code.',
    remember: 'Need printf? → #include <stdio.h>. Put it in USER CODE BEGIN Includes.',
    template: '#include <stdio.h>',
  },
  {
    id: 'printf',
    title: 'printf a value to the serial console',
    cat: 'uart',
    match: [/^printf\s*\(/],
    what:
      'Prints formatted text over USART2 (through your __io_putchar redirect). `%d` int, `%u` unsigned, `%lu` uint32_t (unsigned long), `%04lu` pads with zeros to 4 digits, `%%` prints a percent sign, `\\r\\n` = new line for the terminal. newlib-nano does NOT print `%f` unless “Use float with printf” is enabled. Output appears when a `\\n` is printed (line buffered).',
    remember: 'd = int, u = unsigned, lu = uint32_t, %% = %. Always end with \\r\\n.',
    template: 'printf("VALUE: %lu\\r\\n", value);',
  },
  {
    id: 'float-print-trick',
    title: 'Print a float without %f (whole + fraction)',
    cat: 'math',
    match: [/^int16_t\s+temp_(whole|frac)\s*=/, /^if\s*\(\s*temp_frac\s*<\s*0\s*\)/],
    what:
      'Because newlib-nano’s printf ignores %f by default, the value is split into an integer part `(int16_t)temperatureC` and one decimal digit `(temperatureC - whole) * 10`. The fraction is made positive so −2.5 prints as “-2.5” instead of “-2.-5”. Then `printf("%d.%d", whole, frac)`.',
    remember: 'whole = (int)x; frac = (x − whole)·10; if frac<0 → −frac. Print "%d.%d".',
    template: 'int16_t whole = (int16_t)x;\nint16_t frac = (int16_t)((x - whole) * 10.0f);\nif (frac < 0) frac = -frac;\nprintf("%d.%d\\r\\n", whole, frac);',
  },
  // ---------------- ADC ----------------
  {
    id: 'adc-select-channel',
    title: 'Select the ADC channel to convert',
    cat: 'adc',
    match: [/^ADC_ChannelConfTypeDef\s+sConfig\s*=\s*\{\s*0\s*\}/, /^sConfig\.(SamplingTime|Rank|Channel)\s*=/, /^HAL_ADC_ConfigChannel\s*\(/],
    what:
      'ADC1 has one converter shared by many pins, so before each reading you tell it WHICH channel (pin) to sample: `Channel = ADC_CHANNEL_1` (PA1 = LDR) or `ADC_CHANNEL_0` (PA0 = PT100), `Rank = 1` (first in the sequence) and a `SamplingTime` (longer = more accurate for high-impedance sensors like the PT100 divider). `HAL_ADC_ConfigChannel()` writes it into the ADC registers.',
    remember: 'Channel = which pin, Rank = 1, SamplingTime = how long to “look”. Then ConfigChannel.',
    template: 'ADC_ChannelConfTypeDef sConfig = {0};\nsConfig.Channel = ADC_CHANNEL_1;\nsConfig.Rank = 1;\nsConfig.SamplingTime = ADC_SAMPLETIME_15CYCLES;\nHAL_ADC_ConfigChannel(&hadc1, &sConfig);',
  },
  {
    id: 'adc-read',
    title: 'Read one ADC sample (Start → Poll → Get → Stop)',
    cat: 'adc',
    match: [/^HAL_ADC_Start\s*\(/, /^if\s*\(\s*HAL_ADC_PollForConversion\s*\(/, /^HAL_ADC_PollForConversion\s*\(/, /^\w+\s*=\s*HAL_ADC_GetValue\s*\(/, /^HAL_ADC_Stop\s*\(/],
    what:
      '`HAL_ADC_Start` triggers one conversion, `HAL_ADC_PollForConversion(&hadc1, 10)` waits up to 10 ms until it finishes (returns HAL_OK), `HAL_ADC_GetValue` returns the 12-bit result 0…4095 (0 V…3.3 V), and `HAL_ADC_Stop` switches the ADC off again. Only read the value if the poll returned HAL_OK.',
    remember: '“S-P-G-S” = Start, Poll, Get, Stop. 12 bits → 0…4095.',
    template: 'HAL_ADC_Start(&hadc1);\nif (HAL_ADC_PollForConversion(&hadc1, 10) == HAL_OK) {\n  raw = HAL_ADC_GetValue(&hadc1);\n}\nHAL_ADC_Stop(&hadc1);',
  },
  {
    id: 'adc-scale',
    title: 'Scale the raw ADC value to a percentage',
    cat: 'math',
    match: [/=\s*\(\s*\w+\s*\*\s*100\s*\)\s*\/\s*4095/],
    what: 'The 12-bit ADC gives 0…4095, so `raw * 100 / 4095` converts it to 0…100 %. Multiply BEFORE dividing: integer division would otherwise throw the fraction away (raw/4095 is 0 for every raw < 4095).',
    remember: 'Percent = raw × 100 / 4095 — multiply first, divide last.',
    template: 'uint32_t percent = (raw * 100) / 4095;',
  },
  {
    id: 'adc-clamp',
    title: 'Clamp the ADC value away from 0 and 4095',
    cat: 'math',
    match: [/^if\s*\(\s*adcRaw\s*==\s*0\s*\)/, /^if\s*\(\s*adcRaw\s*>=\s*4095\s*\)/],
    what: 'The next formula divides by (1 − Vout). If the ADC read 4095, Vout would be 1 and you would divide by zero; 0 gives a resistance of 0. Clamping to 1…4094 keeps the maths safe (e.g. when the PT100 is unplugged the input floats to 3.3 V = 4095).',
    remember: 'Before dividing by (1 − x), make sure x can never be 1.',
  },
  {
    id: 'adc-ratio',
    title: 'ADC value → voltage ratio',
    cat: 'math',
    match: [/^float\s+Vout\s*=\s*\(float\)\s*\w+\s*\/\s*4095/],
    what: 'Converts the raw value to a fraction of the reference: 0.0 … 1.0 (multiply by 3.3 to get volts). The `(float)` cast forces a floating-point division — without it `adcRaw/4095` would be an integer division and always give 0.',
    remember: '(float)raw / 4095.0f = ratio 0…1 · cast first or you get 0!',
    template: 'float ratio = (float)raw / 4095.0f;',
  },
  {
    id: 'pt100-resistance',
    title: 'PT100 resistance from the voltage divider',
    cat: 'math',
    match: [/^float\s+r_pt100\s*=/],
    what: 'On the carrier board the PT100 forms a divider with a 2490 Ω resistor: ratio = R / (2490 + R). Solving for R gives R = 2490 · ratio / (1 − ratio).',
    remember: 'Divider: ratio = R/(R_top + R) ⇒ R = R_top · ratio / (1 − ratio).',
    template: 'float r = (2490 * ratio) / (1 - ratio);',
  },
  {
    id: 'pt100-temperature',
    title: 'PT100 resistance → temperature',
    cat: 'math',
    match: [/^temperatureC\s*=\s*\(\s*\(?\s*r_pt100/],
    what: 'A PT100 is 100 Ω at 0 °C and rises about 0.385 Ω per °C (the lab code uses 0.384). So T = (R − 100) / 0.384, plus an optional calibration `offset`.',
    remember: 'PT“100” = 100 Ω at 0 °C, ≈0.385 Ω/°C ⇒ T = (R − 100)/0.385.',
    template: 'temperatureC = ((r - 100.0f) / 0.384f) + offset;',
  },
  // ---------------- PWM / timers ----------------
  {
    id: 'pwm-start',
    title: 'Start PWM output on a timer channel',
    cat: 'pwm',
    match: [/^HAL_TIM_PWM_Start\s*\(/],
    what:
      'CubeMX only configures the timer; nothing comes out of the pin until you call `HAL_TIM_PWM_Start(&htimX, TIM_CHANNEL_n)`. It enables the channel output (and the main output MOE on the advanced timer TIM1) and starts the counter. Call it once, before the loop.',
    remember: 'Configure in CubeMX, START in code — once, before while(1).',
    template: 'HAL_TIM_PWM_Start(&htim1, TIM_CHANNEL_3);',
  },
  {
    id: 'pwm-set-compare',
    title: 'Change the PWM duty cycle (CCR)',
    cat: 'pwm',
    match: [/^__HAL_TIM_SET_COMPARE\s*\(/],
    what: 'Writes the capture/compare register CCRx. The output is HIGH while the counter is below CCR, so duty = CCR / (ARR + 1) and pulse width = CCR × (PSC + 1) / f_timer. Change it any time while PWM is running.',
    remember: 'ARR sets the period, CCR sets the pulse. Duty = CCR/(ARR+1).',
    template: '__HAL_TIM_SET_COMPARE(&htim1, TIM_CHANNEL_3, pulse);',
  },
  {
    id: 'servo-map',
    title: 'Map a servo angle to a timer compare value',
    cat: 'pwm',
    match: [/^uint32_t\s+pulse_length\s*=\s*210\s*\+/],
    what: 'TIM1 counts at 84 MHz / 200 = 420 kHz (2.38 µs per count) with a period of 8400 counts = 20 ms (50 Hz). A servo wants 0.5 ms (0°) … 2.5 ms (180°) = 210 … 1050 counts. Linear map: 210 + angle × (1050 − 210) / 180. Dividing by 100 instead of 180 overdrives the servo past 2.5 ms.',
    remember: '0.5 ms ↔ 0°, 2.5 ms ↔ 180°. counts = ms × 420. min + angle·(max−min)/180.',
    template: 'uint32_t pulse = 210 + (angle * (1050 - 210) / 180);',
  },
  {
    id: 'pwm-duty-percent',
    title: 'Percent → compare value (duty cycle)',
    cat: 'pwm',
    match: [/^uint32_t\s+pulse_length\s*=\s*\(\s*\(uint32_t\)\s*speed/],
    what: '`__HAL_TIM_GET_AUTORELOAD` reads ARR (4199), so ARR + 1 = 4200 counts per PWM period. speed% × 4200 / 100 gives the CCR value for that duty cycle (0 = off, 4200 = always on).',
    remember: 'CCR = percent × (ARR + 1) / 100.',
    template: 'uint32_t pulse = ((uint32_t)speed * (__HAL_TIM_GET_AUTORELOAD(htim) + 1)) / 100;',
  },
  // ---------------- motors ----------------
  {
    id: 'hbridge-direction',
    title: 'H-bridge direction with INA / INB',
    requires: /Motor|INA|INB/i,
    cat: 'motor',
    match: [/^HAL_GPIO_WritePin\s*\(\s*GPIOB\s*,\s*GPIO_PIN_6\s*,/, /^HAL_GPIO_WritePin\s*\(\s*GPIOC\s*,\s*GPIO_PIN_7\s*,/],
    what: 'The MOTOR1 driver has two direction inputs: INA = PB6, INB = PC7. INA=1/INB=0 → forward, INA=0/INB=1 → reverse, both 0 → brake to ground. The PWM pin (PC8) then sets the speed.',
    remember: '“A ahead, B back”: 10 = forward, 01 = reverse, 00 = brake. PWM = speed.',
    template: 'HAL_GPIO_WritePin(GPIOB, GPIO_PIN_6, GPIO_PIN_SET);   // INA\nHAL_GPIO_WritePin(GPIOC, GPIO_PIN_7, GPIO_PIN_RESET); // INB',
  },
  {
    id: 'stepper-dir',
    title: 'Stepper direction pin (DIR = PA7)',
    requires: /Stepper|\bsteps?\b/i,
    cat: 'motor',
    match: [/^HAL_GPIO_WritePin\s*\(\s*GPIOA\s*,\s*GPIO_PIN_7\s*,/, /^if\s*\(\s*direction\s*==\s*1\s*\)/],
    what: 'The DRV8825 reads DIR before every step: HIGH turns one way, LOW the other. Set it once before you start sending STEP pulses.',
    remember: 'DIR first, then STEP.',
  },
  {
    id: 'stepper-step',
    title: 'One step = one pulse on STEP (PA6)',
    requires: /Stepper|\bsteps?\b/i,
    cat: 'motor',
    match: [/^HAL_GPIO_WritePin\s*\(\s*GPIOA\s*,\s*GPIO_PIN_6\s*,/],
    what: 'Each rising edge on STEP moves the motor one (micro)step. The pin goes HIGH, stays high a few µs (DRV8825 needs ≥ 1.9 µs), then LOW. 200 full steps = one revolution of a 1.8° motor.',
    remember: 'Rising edge = 1 step. 200 steps = 360°.',
    template: 'HAL_GPIO_WritePin(GPIOA, GPIO_PIN_6, GPIO_PIN_SET);\nfor (volatile int d = 0; d < 50; d++);\nHAL_GPIO_WritePin(GPIOA, GPIO_PIN_6, GPIO_PIN_RESET);',
  },
  {
    id: 'stepper-mode',
    title: 'Stepper microstep mode (M0/M1/M2 = PC9/PA5/PB5)',
    requires: /Stepper|\bsteps?\b/i,
    cat: 'motor',
    match: [/^HAL_GPIO_WritePin\s*\(\s*GPIOB\s*,\s*GPIO_PIN_5\s*,/, /^HAL_GPIO_WritePin\s*\(\s*GPIOC\s*,\s*GPIO_PIN_9\s*,/, /^HAL_GPIO_WritePin\s*\(\s*GPIOA\s*,\s*GPIO_PIN_5\s*,/],
    what: 'M2 M1 M0 select the DRV8825 step size: 000 = full step, 001 = ½, 010 = ¼, 011 = ⅛, 100 = 1/16, 101 = 1/32. All LOW = full steps (200 per revolution).',
    remember: 'M-pins all 0 = full step. Bigger binary number = smaller steps.',
  },
  {
    id: 'busy-wait',
    title: 'Busy-wait delay loop (volatile counter)',
    cat: 'timing',
    match: [/^for\s*\(\s*volatile\s+int\s+\w+\s*=\s*0\s*;/],
    what: 'Burns CPU time by counting. `volatile` stops the compiler from deleting the empty loop. Each iteration takes ~10 CPU cycles at -O0 (≈0.12 µs at 84 MHz), so 8000 iterations ≈ 1 ms. Used for delays shorter than 1 ms, which HAL_Delay cannot do.',
    remember: 'volatile + empty for = tiny delay. ~12 iterations ≈ 1 µs at 84 MHz.',
    template: 'for (volatile int d = 0; d < 50; d++);',
  },
  {
    id: 'stepper-accel',
    title: 'Acceleration ramp (shrink the delay each step)',
    cat: 'motor',
    match: [/^uint32_t\s+current_delay\s*=/, /^if\s*\(\s*current_delay\s*>\s*top_speed_delay\s*\)/, /^current_delay\s*-=\s*1/],
    what: 'Starts with a long delay between steps and reduces it by 1 every step until it reaches `top_speed_delay`. Starting slowly and speeding up stops a loaded stepper from stalling.',
    remember: 'Start slow, shrink the gap, stop at top speed.',
  },
  // ---------------- GPIO ----------------
  {
    id: 'gpio-toggle',
    title: 'Toggle an output pin',
    cat: 'gpio',
    match: [/^HAL_GPIO_TogglePin\s*\(/],
    what: 'Flips the pin: HIGH → LOW or LOW → HIGH, so an LED changes state. The pin must be a GPIO_Output in CubeMX. PA5 = Nucleo LD2, PB7 = LED1, PC13 = LED2, PC14 = LED3.',
    remember: 'HAL_GPIO_<Verb>Pin(PORT, PIN) — port first, then pin.',
    template: 'HAL_GPIO_TogglePin(GPIOA, GPIO_PIN_5);',
  },
  {
    id: 'gpio-read-write',
    title: 'Copy a button to an LED (Read + Write)',
    cat: 'gpio',
    match: [/^HAL_GPIO_WritePin\s*\([^,]+,[^,]+,\s*HAL_GPIO_ReadPin\s*\(/],
    what: '`HAL_GPIO_ReadPin(GPIOB, GPIO_PIN_14)` returns GPIO_PIN_SET (1) while SW2 is pressed, GPIO_PIN_RESET (0) otherwise. That value is passed straight into `HAL_GPIO_WritePin` for LED1 (PB7), so the LED follows the button.',
    remember: 'Read the input, Write the output — the button value IS the LED state.',
    template: 'HAL_GPIO_WritePin(GPIOB, GPIO_PIN_7, HAL_GPIO_ReadPin(GPIOB, GPIO_PIN_14));',
  },
  {
    id: 'gpio-write',
    title: 'Set an output pin HIGH or LOW',
    cat: 'gpio',
    match: [/^HAL_GPIO_WritePin\s*\(/],
    what: 'Drives a GPIO output: GPIO_PIN_SET = 3.3 V (HIGH), GPIO_PIN_RESET = 0 V (LOW).',
    remember: 'SET = 1 = HIGH, RESET = 0 = LOW.',
    template: 'HAL_GPIO_WritePin(GPIOB, GPIO_PIN_7, GPIO_PIN_SET);',
  },
  {
    id: 'gpio-read',
    title: 'Read an input pin',
    cat: 'gpio',
    match: [/HAL_GPIO_ReadPin\s*\(/],
    what: 'Returns GPIO_PIN_SET or GPIO_PIN_RESET depending on the voltage on the pin (button pressed or not).',
    remember: 'ReadPin returns SET (1) or RESET (0).',
  },
  // ---------------- timing ----------------
  {
    id: 'hal-delay',
    title: 'Wait N milliseconds',
    cat: 'timing',
    match: [/^HAL_Delay\s*\(/],
    what: 'Blocks for the given number of milliseconds using the 1 ms SysTick counter (HAL_GetTick). Nothing else in main runs while waiting. Requires HAL_Init() (CubeMX calls it for you).',
    remember: 'HAL_Delay(ms) — milliseconds, blocking.',
    template: 'HAL_Delay(500);',
  },
  // ---------------- C language ----------------
  {
    id: 'sweep-loop',
    title: 'Sweep loop (count up / count down)',
    cat: 'c',
    match: [/^for\s*\(\s*(uint8_t|int8_t|int|uint32_t)\s+(angle|speed)\s*=/],
    what: 'A for-loop that steps a value (angle or speed) by 1 each time, calling a setter and a small HAL_Delay so the motion is gradual. Watch the type: a `uint8_t` can only hold 0…255 and an `int8_t` −128…127.',
    remember: 'for (start; condition; step) { set(value); HAL_Delay(…); }',
  },
  {
    id: 'step-loop',
    title: 'Repeat for N steps',
    cat: 'c',
    match: [/^for\s*\(\s*uint32_t\s+i\s*=\s*0\s*;\s*i\s*<\s*steps/],
    what: 'Runs the body once per step requested by the caller.',
    remember: 'for (i = 0; i < N; i++) runs N times.',
  },
  {
    id: 'speed-clamp',
    title: 'Limit / sign handling of the speed',
    cat: 'c',
    match: [/^if\s*\(\s*speed\s*[<>]/, /^speed\s*=\s*-speed/, /^\}\s*else\s+if\s*\(\s*speed/],
    what: 'Keeps the requested speed within −100…+100 % and turns a negative speed into “reverse direction + positive duty”.',
    remember: 'Sign = direction, magnitude = duty.',
  },
  {
    id: 'helper-function',
    title: 'Your own helper function',
    cat: 'c',
    match: [/^(static\s+)?(void|int|float|uint\d+_t|int\d+_t)\s+[A-Z]\w*\s*\([^;]*\)\s*\{?$/],
    what: 'Groups related steps under a name (e.g. Read_LDR, Set_Servo_Angle) so main() stays short. Define it above main (or declare a prototype first) and put it in a USER CODE block (0 or 4) so CubeMX keeps it.',
    remember: 'Write it in USER CODE BEGIN 0, call it in the while(1) loop.',
  },
  {
    id: 'helper-call',
    title: 'Call your helper function',
    cat: 'c',
    match: [/^[A-Z]\w+\s*\([^;]*\)\s*;$/],
    what: 'Runs your helper function. In the lab code the main loop is just “read → display → delay” or “move → wait”.',
    remember: 'Keep while(1) short: call functions.',
  },
  {
    id: 'prototype',
    title: 'Function prototype',
    cat: 'c',
    match: [/^(void|int|float|uint\d+_t)\s+\w+\s*\([^)]*\)\s*;$/],
    what: 'Tells the compiler a function exists before its body appears, so it can be called from code that comes earlier in the file. Belongs in USER CODE BEGIN PFP.',
    remember: 'Prototype = the function’s first line + “;”.',
  },
  {
    id: 'duplicate-handle',
    title: 'Extra handle declaration (not needed)',
    cat: 'c',
    match: [/^(ADC|UART|TIM)_HandleTypeDef\s+h\w+\s*;$/],
    what: 'CubeMX already declares the peripheral handles (hadc1, huart2, htim1…) under “Private variables”. Declaring them again is harmless in C (a “tentative definition”), but a typo like `hadcl` (letter l) creates a different, unused variable.',
    remember: 'Handles come from CubeMX — don’t redeclare them.',
  },
  {
    id: 'global-var',
    title: 'Global variable',
    cat: 'c',
    match: [/^(volatile\s+)?(uint\d+_t|int\d+_t|float|double|char|int)\s+\w+(\[\d*\])?\s*(=\s*[^;]+)?;$/],
    what: 'A variable outside any function keeps its value for the whole program, and the debugger’s Live Expressions view can watch it while the program runs. Put globals in USER CODE BEGIN PV.',
    remember: 'Global = visible everywhere + watchable in Live Expressions.',
  },
  {
    id: 'local-calc',
    title: 'Local calculation',
    cat: 'math',
    match: [/^(uint\d+_t|int\d+_t|float|int)\s+\w+\s*=/, /^\w+\s*=\s*[^=]/],
    what: 'Computes an intermediate value used by the following lines.',
    remember: 'Name intermediate values — it makes debugging easier.',
  },
  {
    id: 'control-flow',
    title: 'Condition / loop',
    cat: 'c',
    match: [/^(if|else|for|while|do|switch|return)\b/],
    what: 'C control flow that decides which of your statements run.',
    remember: 'if → choose, for/while → repeat.',
  },
];

export const SNIPPET_BY_ID: Record<string, Snippet> = Object.fromEntries(SNIPPETS.map((s) => [s.id, s]));

export function classifyLine(trimmed: string, fileText = ''): Snippet | null {
  if (!trimmed || trimmed === '{' || trimmed === '}' || trimmed === '};' || /^\}\s*else\s*\{?$/.test(trimmed)) return null;
  if (trimmed.startsWith('/*') || trimmed.startsWith('*') || (trimmed.startsWith('//') && !/^\/\/\s*Redirect printf/i.test(trimmed))) return null;
  for (const s of SNIPPETS) if ((!s.requires || s.requires.test(fileText)) && s.match.some((r) => r.test(trimmed))) return s;
  return null;
}
