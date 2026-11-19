# STM32 Lab Simulator — NUCLEO-F401RE + carrier board

A browser-only simulator for the Microcontrollers & SBC lab. It contains look-alikes of **STM32CubeMX** (pinout, peripherals, clock tree, code generation) and **STM32CubeIDE** (project explorer, editor, build, run/debug, serial console). Code runs on a simulated **STM32F401RE** wired to the lab **carrier board**, together with attachable motors and sensors.

No server and no toolchain install are needed. Everything runs in the browser.

```bash
npm install
npm run dev        # open the printed URL (Chrome/Edge/Firefox, desktop)
npm run build      # static build in dist/ (serve it with any static file server)
npm test           # compiler, HAL, board and all-experiment tests (headless)
```

## Workflow (same as the lab)

1. **STM32CubeMX** tab → *ACCESS TO MCU SELECTOR* (STM32F401RETx) or *BOARD SELECTOR* (NUCLEO-F401RE), or *LAB EXPERIMENTS* for Exp 1–7.
2. Click pins in the LQFP64 view to assign `GPIO_Output`, `ADC1_IN0`, `TIM1_CH3`… Configure peripherals in the left category tree and set the clock tree (type `84` in HCLK).
3. Click **GENERATE CODE**, then **Open Project**. The project opens in **STM32CubeIDE**.
4. Write code between `/* USER CODE BEGIN … */` and `/* USER CODE END … */`. Code outside these blocks is lost on regeneration, just like real CubeMX, and the simulator warns you before that happens.
5. **Build** (Ctrl+B), **Run** (Ctrl+F11) or **Debug** (F11).
   - Debug halts at `main()`. Then use F5/F6/F7 to step and F8 to resume, and click the left margin of the editor to set breakpoints.
   - The *Variables*, *Live Expressions* and *Logic Analyzer* views work while the program runs.
6. Watch the **Lab Bench** on the right. *Pop out* opens it in a separate window.
   - Press SW1/SW2/B1 and change the light (LDR) or the PT100 temperature.
   - Toggle carrier power, and drag motors onto connectors.
7. **Serial:** in the Console view choose *Command Shell Console*, then *Serial Port* at 115200 baud. This reads USART2 through the ST-LINK virtual COM port. A wrong baud rate shows garbage, as on real hardware.

## Lab Guide — learn the code you type

When a project is open in the IDE, the **💡 Lab Guide** marks every line *you* wrote: anything that differs from what CubeMX generated for that configuration. Lines are colour-coded by topic (GPIO, timing, ADC, UART/printf, PWM, motors, calculation, C).

- **Hover** a highlighted line to see what it does, a memory hook, and which other experiments use the same snippet.
- **Click the coloured bar / 💡** next to the line, or press **Ctrl+Shift+E** (also in the right-click menu), to open the full card in the Lab Guide panel.
- Each card has **Also used in** chips that show the same snippet in other experiments, with an option to open that experiment.
- **✍ Practice** asks you to type the snippet from memory and checks it, ignoring spaces, braces and comments.
- **☆ Save to cheat sheet** collects snippets in the *Cheat sheet* tab, which you can copy as Markdown.

The snippet knowledge base is `src/guide/snippets.ts`; add an entry there to explain new code patterns.

## Lab experiments (`research/`)

| File | What it does | Bench |
|---|---|---|
| `Exp1_LED.c` | toggles LD2 (PA5), LED1 (PB7), LED2 (PC13) | — |
| `Exp2_Button.c` | LED1 follows SW2 (PB14) | press SW2 |
| `Exp3_LDR.c` | ADC1_IN1 (PA1) → printf over USART2 | serial console + light slider |
| `Exp4_PT100.c` | ADC1_IN0 (PA0) PT100 → temperature over USART2 | PT100 probe |
| `Exp5_Servo.c` | TIM1_CH3 (PA10) 50 Hz servo sweep | servo on the PA10 header |
| `Exp6_Stepper.c` | DRV8825 STEP/DIR, 200 steps each way | stepper |
| `Exp7_DC_PWM.c` | **new**: TIM3_CH3 (PC8) 20 kHz PWM + INA/INB → MOTOR1 H-bridge ramp | DC motor on MOTOR1 |

`Exp5_Servo.c` was fixed: the angle formula divided by 100 although the sweep goes to 180°, so the pulse reached about 4.1 ms. It now divides by 180, giving 0.5–2.5 ms. The simulator still flags out-of-range servo pulses.

## Carrier board pin map (from the silkscreen)

| Block | Pins |
|---|---|
| LEDs | LED1 PB7, LED2 PC13, LED3 PC14 · Nucleo LD2 PA5 |
| Buttons | SW1 PB13, SW2 PB14 (active-high) · Nucleo B1 PC13 (active-low) |
| Relay | PB12 (LED4) |
| PT100 / LDR | PA0 (ADC1_IN0) / PA1 (ADC1_IN1) |
| Servo headers | PB3 (TIM2_CH2) · PA10 (TIM1_CH3) |
| Stepper (DRV8825) | DIR PA7, STP PA6, nHOME PC5, M0 PC9, M1 PA5, M2 PB5 |
| MOTOR1 / MOTOR2 H-bridge | PWM PC8/PC6 (TIM3_CH3/CH1), INA PB6/PB10, INB PC7/PB4, CS PC2/PC3 |
| UART | USART2 PA2/PA3 → ST-LINK VCP |
| Drawn only | Ultrasonic PA9/PA8, Encoders PA4/PB0 and PC1/PC0, I2C/MPU6050 PB8/PB9 |

Assumptions:
- The stepper driver is taken to be a DRV8825 and the motor drivers a VNH7070-type H-bridge, judging by the package shapes and pin names.
- The DC motor is modelled as a 12 V, 300 RPM gear motor.
- The PT100 circuit follows Exp4's maths: V/3.3 = R / (2490 + R).

## How it works

```
src/
  cubemx/     CubeMX look-alike + code generator (main.c / main.h / msp.c / it.c / .ioc, USER CODE merge)
  cubeide/    CubeIDE look-alike (Monaco editor, explorer, consoles, debug views)
  board/      SVG lab bench (carrier, Nucleo, parts) + pop-out window
  sim/cc/     C compiler: preprocessor → parser → codegen to JS generator functions
  sim/headers virtual stm32f4xx_hal.h / stm32f4xx.h / libc headers
  sim/hal/    native HAL (GPIO, EXTI, RCC, ADC, TIM, UART, CORTEX) + printf/libc
  sim/mcu/    STM32F401 register models (RCC, GPIO, ADC1, TIM1-5/9-11, USART, EXTI, NVIC, SysTick)
  sim/board/  electrical models (LEDs, buttons, LDR, PT100, servo, DRV8825, H-bridge + motor, relay)
  sim/worker  Web Worker running the simulation paced to real time
```

**The compiler.**
- C is compiled to JavaScript generator functions over a flat 32-bit little-endian memory: Flash at 0x08000000, SRAM at 0x20000000, and peripherals at their real addresses.
- Integer, pointer and struct semantics follow the ARM EABI, so `uint8_t` wraps, `char` is unsigned, and register-level code like `GPIOA->ODR` works.
- Every statement is charged an estimated Cortex-M4 `-O0` cycle cost, so delays made with busy loops (as in Exp6) take about the right real time. Time follows the clock the program actually configures.
- Execution can pause at any statement, which is how breakpoints and stepping work.

**Realistic behaviour that is simulated:**
- `printf` needs a `__io_putchar` or `_write` redirect.
- `%f` prints nothing unless *Project ▸ Properties ▸ MCU Settings ▸ Use float with printf* is ticked.
- Peripherals whose RCC clock isn't enabled ignore writes, and the simulator warns about it.
- UART output only appears if PA2 is configured as AF7.
- A NULL pointer write or a write to Flash raises a HardFault, reported with the source line.
- An interrupt with no handler leaves the CPU stuck in `Default_Handler`.
- `main()` returning, and a program stuck in `Error_Handler()`, are both reported.

## Limitations

- The C subset covers lab code: no bit-fields, `goto`, VLAs or user-defined variadic functions.
- Peripherals that aren't simulated: I2C, SPI, DMA, RTC, ultrasonic, encoders, MPU6050. They are drawn on the board and greyed out in CubeMX.
- Timing is a cycle estimate, not a cycle-exact emulation.
- Projects are saved in the browser's localStorage.
