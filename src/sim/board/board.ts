// Carrier board + Nucleo electrical models.
import type { BoardIO, MCU, PinState } from '../mcu/mcu';

export const BOARD_PINS = {
  LED1: 'PB7',
  LED2: 'PC13',
  LED3: 'PC14',
  LD2: 'PA5',
  B1: 'PC13',
  RELAY: 'PB12',
  SW1: 'PB13',
  SW2: 'PB14',
  TEMP: 'PA0',
  LDR: 'PA1',
  SERVO_CN1: 'PB3',
  SERVO_CN2: 'PA10',
  STEP_DIR: 'PA7',
  STEP_STP: 'PA6',
  STEP_HOME: 'PC5',
  STEP_M2: 'PB5',
  STEP_M1: 'PA5',
  STEP_M0: 'PC9',
  M1_PWM: 'PC8',
  M1_CS: 'PC2',
  M1_INB: 'PC7',
  M1_INA: 'PB6',
  M2_PWM: 'PC6',
  M2_CS: 'PC3',
  M2_INB: 'PB4',
  M2_INA: 'PB10',
  US_TRIG: 'PA9',
  US_ECHO: 'PA8',
  ENC1_A: 'PA4',
  ENC1_B: 'PB0',
  ENC2_A: 'PC1',
  ENC2_B: 'PC0',
  I2C_SCL: 'PB8',
  I2C_SDA: 'PB9',
  UART_TX: 'PA2',
  UART_RX: 'PA3',
} as const;

export interface PartsConfig {
  motor1: boolean;
  motor2: boolean;
  stepper: boolean;
  servo1: boolean; // CN1 (PB3)
  servo2: boolean; // CN2 (PA10)
  pt100: boolean;
}

export interface BoardInputs {
  sw1: boolean;
  sw2: boolean;
  b1: boolean;
  /** 0..100 % light */
  light: number;
  tempC: number;
  power: boolean;
}

export interface MotorSnap {
  attached: boolean;
  rpm: number;
  angle: number;
  volts: number;
  duty: number;
  pwmFreq: number;
  current: number;
  mode: 'forward' | 'reverse' | 'brake' | 'coast' | 'off';
  ina: number;
  inb: number;
  note: string;
}

export interface StepperSnap {
  attached: boolean;
  angle: number;
  steps: number;
  microstep: number;
  dir: number;
  home: boolean;
  rate: number;
  stalled: boolean;
  note: string;
}

export interface ServoSnap {
  attached: boolean;
  angle: number;
  target: number;
  pulseUs: number;
  freq: number;
  signal: boolean;
  outOfRange: boolean;
  note: string;
}

export interface BoardSnapshot {
  t: number;
  power: boolean;
  leds: { LED1: number; LED2: number; LED3: number; LED4: number; LD2: number };
  relay: boolean;
  motors: [MotorSnap, MotorSnap];
  stepper: StepperSnap;
  servos: [ServoSnap, ServoSnap];
  ptVolts: number;
  ldrVolts: number;
  parts: PartsConfig;
  inputs: BoardInputs;
  warnings: string[];
}

const ALPHA = 0.00385;

class DcMotor {
  omega = 0; // rpm
  angle = 0; // degrees
  volts = 0;
  duty = 0;
  pwmFreq = 0;
  mode: MotorSnap['mode'] = 'off';
  ina = 0;
  inb = 0;
  current = 0;
  note = '';
  constructor(public noLoadRpm = 300, public tau = 0.12, public resistance = 4) {}
  setInputs(ina: number, inb: number, pwm: PinState, power: boolean) {
    this.ina = ina;
    this.inb = inb;
    let duty: number;
    if (pwm.pwm && pwm.pwm.freq > 0) {
      duty = pwm.pwm.duty;
      this.pwmFreq = pwm.pwm.freq;
    } else {
      duty = pwm.driven || pwm.mode === 'input' ? pwm.level : 0;
      this.pwmFreq = 0;
    }
    this.duty = duty;
    this.note = '';
    if (!power) {
      this.mode = 'off';
      this.volts = 0;
      this.note = 'No 12 V power (carrier board switch is OFF)';
      return;
    }
    if (ina && !inb) {
      this.mode = 'forward';
      this.volts = 12 * duty;
    } else if (!ina && inb) {
      this.mode = 'reverse';
      this.volts = -12 * duty;
    } else {
      this.mode = 'brake';
      this.volts = 0;
    }
    if (this.pwmFreq > 20500) this.note = `PWM ${(this.pwmFreq / 1000).toFixed(1)} kHz exceeds the H-bridge maximum (20 kHz)`;
    else if (this.pwmFreq > 0 && this.pwmFreq < 100 && duty > 0 && duty < 1) this.note = `PWM ${this.pwmFreq.toFixed(0)} Hz is very low — the motor will jerk`;
  }
  advance(dt: number) {
    if (dt <= 0) return;
    const target = (this.volts / 12) * this.noLoadRpm;
    const tau = this.mode === 'off' ? this.tau * 4 : this.tau;
    const tgt = this.mode === 'off' ? 0 : target;
    const e = Math.exp(-dt / tau);
    const w0 = this.omega;
    this.omega = tgt + (w0 - tgt) * e;
    // integrate angle exactly for first-order response (rpm -> deg/s = *6)
    this.angle += 6 * (tgt * dt + (w0 - tgt) * tau * (1 - e));
    this.angle %= 360;
    if (this.angle < 0) this.angle += 360;
    const backEmf = (this.omega / this.noLoadRpm) * 12;
    const i = this.mode === 'off' ? 0 : Math.abs((this.volts - backEmf) / this.resistance) + 0.12 * Math.min(1, Math.abs(this.omega) / this.noLoadRpm);
    this.current = i;
  }
  snap(attached: boolean): MotorSnap {
    return { attached, rpm: this.omega, angle: this.angle, volts: this.volts, duty: this.duty, pwmFreq: this.pwmFreq, current: this.current, mode: this.mode, ina: this.ina, inb: this.inb, note: this.note };
  }
}

class Drv8825 {
  idx = 0; // position in 1/32 microsteps
  steps = 0;
  dir = 0;
  microstep = 1;
  lastRise = -1;
  lastFall = -1;
  rate = 0;
  stalled = false;
  note = '';
  stepTimes: number[] = [];
  /** fractional angle for display (degrees) */
  get angle() {
    return (((this.idx / 32) * 1.8) % 360 + 360) % 360;
  }
  get home() {
    return ((this.idx % 128) + 128) % 128 === 0;
  }
}

class Servo {
  angle = 90;
  target = 90;
  pulseUs = 0;
  freq = 0;
  signal = false;
  outOfRange = false;
  note = '';
  setInput(st: PinState, power: boolean) {
    this.note = '';
    if (st.pwm && st.pwm.freq > 0 && st.pwm.duty > 0) {
      this.freq = st.pwm.freq;
      this.pulseUs = (st.pwm.duty / st.pwm.freq) * 1e6;
      this.signal = true;
    } else {
      this.freq = 0;
      this.pulseUs = 0;
      this.signal = false;
    }
    if (!power) {
      this.note = 'No 6.5 V servo power (carrier board switch is OFF)';
      this.signal = false;
      return;
    }
    if (!this.signal) {
      this.note = 'No PWM signal';
      return;
    }
    if (this.freq < 30 || this.freq > 400) {
      this.note = `PWM ${this.freq.toFixed(1)} Hz — servos expect ~50 Hz`;
      this.outOfRange = true;
      if (this.freq > 400) return;
    }
    const pw = this.pulseUs;
    this.outOfRange = pw < 450 || pw > 2550 || this.freq < 30 || this.freq > 400;
    if (pw < 450 || pw > 2550) this.note = `Pulse ${pw.toFixed(0)} µs is outside the 500–2500 µs range — servo is pushing against its end stop`;
    this.target = Math.max(0, Math.min(180, ((pw - 500) / 2000) * 180));
  }
  advance(dt: number) {
    if (!this.signal) return;
    const maxStep = 500 * dt; // deg/s
    const d = this.target - this.angle;
    if (Math.abs(d) <= maxStep) this.angle = this.target;
    else this.angle += Math.sign(d) * maxStep;
  }
  snap(attached: boolean): ServoSnap {
    return { attached, angle: this.angle, target: this.target, pulseUs: this.pulseUs, freq: this.freq, signal: this.signal, outOfRange: this.outOfRange, note: this.note };
  }
}

export class CarrierBoard implements BoardIO {
  mcu: MCU | null = null;
  parts: PartsConfig = { motor1: false, motor2: false, stepper: false, servo1: false, servo2: false, pt100: false };
  inputs: BoardInputs = { sw1: false, sw2: false, b1: false, light: 50, tempC: 25, power: true };
  motors = [new DcMotor(), new DcMotor()];
  stepper = new Drv8825();
  servos = [new Servo(), new Servo()];
  relay = false;
  private lastT = 0;
  private warned = new Set<string>();
  warnings: string[] = [];
  /** called when the relay toggles */
  onRelay?: (on: boolean) => void;

  attach(mcu: MCU) {
    this.mcu = mcu;
    mcu.board = this;
  }

  warn(key: string, msg: string) {
    if (this.warned.has(key)) return;
    this.warned.add(key);
    this.warnings.push(msg);
  }

  resetTime() {
    this.lastT = 0;
    this.warned.clear();
    this.stepper.lastRise = -1;
    this.stepper.lastFall = -1;
    this.stepper.stepTimes = [];
  }

  // ---------------- BoardIO ----------------
  pinInput(pin: string, t: number): 0 | 1 | null {
    switch (pin) {
      case BOARD_PINS.SW1:
        return this.inputs.sw1 ? 1 : 0;
      case BOARD_PINS.SW2:
        return this.inputs.sw2 ? 1 : 0;
      case BOARD_PINS.B1:
        return this.inputs.b1 ? 0 : 1;
      case BOARD_PINS.STEP_HOME:
        return this.inputs.power && this.stepper.home ? 0 : null;
      case BOARD_PINS.UART_RX:
        return 1;
    }
    void t;
    return null;
  }

  pinAnalog(pin: string): number | null {
    switch (pin) {
      case BOARD_PINS.TEMP:
        return this.ptVolts();
      case BOARD_PINS.LDR:
        return this.ldrVolts();
      case BOARD_PINS.M1_CS:
        return Math.min(3.3, this.motors[0].current * 0.65);
      case BOARD_PINS.M2_CS:
        return Math.min(3.3, this.motors[1].current * 0.65);
    }
    return null;
  }

  ptVolts(): number {
    if (!this.parts.pt100) return 3.3;
    const r = 100 * (1 + ALPHA * this.inputs.tempC);
    return (3.3 * r) / (2490 + r);
  }

  ldrVolts(): number {
    const lux = 0.1 * Math.pow(10, (this.inputs.light / 100) * 5); // 0.1 .. 10000 lux
    const rLdr = 70000 * Math.pow(lux, -0.7);
    return (3.3 * 10000) / (10000 + rLdr);
  }

  onPinChange(pin: string, t: number): void {
    if (!this.mcu) return;
    this.update(t);
    const st = this.mcu.pinState(pin);
    if (pin === BOARD_PINS.STEP_STP) this.stepEdge(st.level, t);
    if (pin === BOARD_PINS.RELAY) {
      const on = st.mode === 'output' && st.level === 1;
      if (on !== this.relay) {
        this.relay = on;
        this.onRelay?.(on);
      }
    }
    if ([BOARD_PINS.M1_INA, BOARD_PINS.M1_INB, BOARD_PINS.M1_PWM].includes(pin as never)) this.refreshMotor(0);
    if ([BOARD_PINS.M2_INA, BOARD_PINS.M2_INB, BOARD_PINS.M2_PWM].includes(pin as never)) this.refreshMotor(1);
    if (pin === BOARD_PINS.SERVO_CN1) this.servos[0].setInput(st, this.inputs.power);
    if (pin === BOARD_PINS.SERVO_CN2) this.servos[1].setInput(st, this.inputs.power);
  }

  private level(pin: string): number {
    if (!this.mcu) return 0;
    const st = this.mcu.pinState(pin);
    return st.mode === 'output' || st.mode === 'af' ? st.level : 0;
  }

  refreshMotor(i: 0 | 1) {
    if (!this.mcu) return;
    const p = i === 0 ? { a: BOARD_PINS.M1_INA, b: BOARD_PINS.M1_INB, pwm: BOARD_PINS.M1_PWM } : { a: BOARD_PINS.M2_INA, b: BOARD_PINS.M2_INB, pwm: BOARD_PINS.M2_PWM };
    this.motors[i].setInputs(this.level(p.a), this.level(p.b), this.mcu.pinState(p.pwm), this.inputs.power);
  }

  refreshAll() {
    if (!this.mcu) return;
    this.refreshMotor(0);
    this.refreshMotor(1);
    this.servos[0].setInput(this.mcu.pinState(BOARD_PINS.SERVO_CN1), this.inputs.power);
    this.servos[1].setInput(this.mcu.pinState(BOARD_PINS.SERVO_CN2), this.inputs.power);
    const relayOn = this.mcu.pinState(BOARD_PINS.RELAY);
    this.relay = relayOn.mode === 'output' && relayOn.level === 1;
  }

  private stepEdge(level: number, t: number) {
    const s = this.stepper;
    if (level === 1) {
      if (s.lastRise >= 0 && s.lastFall >= 0 && s.lastFall > s.lastRise && t - s.lastFall < 1.9e-6) {
        this.warn('step-low', `STEP low time ${((t - s.lastFall) * 1e6).toFixed(2)} µs is below the DRV8825 minimum of 1.9 µs`);
      }
      const prevRise = s.lastRise;
      s.lastRise = t;
      if (!this.inputs.power) {
        s.note = 'No 12 V motor power (carrier board switch is OFF)';
        return;
      }
      // decode
      const m0 = this.level(BOARD_PINS.STEP_M0);
      const m1 = this.level(BOARD_PINS.STEP_M1);
      const m2 = this.level(BOARD_PINS.STEP_M2);
      const mode = (m2 << 2) | (m1 << 1) | m0;
      const micro = [1, 2, 4, 8, 16, 32, 32, 32][mode];
      s.microstep = micro;
      const dir = this.level(BOARD_PINS.STEP_DIR);
      s.dir = dir;
      // rate tracking (full steps per second)
      if (prevRise >= 0) {
        const dtStep = t - prevRise;
        const fullRate = 1 / dtStep / micro;
        s.rate = s.rate * 0.7 + fullRate * 0.3;
        s.stalled = fullRate > 2500;
      }
      if (s.stalled) {
        s.note = `Step rate ${s.rate.toFixed(0)} full-steps/s is too fast — the motor stalls (add acceleration or slow down)`;
        return;
      }
      s.note = '';
      const inc = 32 / micro;
      s.idx += dir ? inc : -inc;
      s.steps += dir ? 1 : -1;
      this.mcu?.externalChanged(BOARD_PINS.STEP_HOME);
    } else {
      if (s.lastRise >= 0 && t - s.lastRise < 1.9e-6) {
        this.warn('step-high', `STEP high pulse ${((t - s.lastRise) * 1e6).toFixed(2)} µs is below the DRV8825 minimum of 1.9 µs — steps may be missed`);
      }
      s.lastFall = t;
    }
  }

  update(t: number) {
    const dt = t - this.lastT;
    if (dt <= 0) return;
    this.lastT = t;
    for (const m of this.motors) m.advance(dt);
    for (const s of this.servos) s.advance(dt);
    // decay displayed step rate when idle
    if (this.stepper.lastRise >= 0 && t - this.stepper.lastRise > 0.05) this.stepper.rate = 0;
  }

  setInputs(p: Partial<BoardInputs>) {
    const prev = { ...this.inputs };
    Object.assign(this.inputs, p);
    if (!this.mcu) return;
    if (prev.sw1 !== this.inputs.sw1) this.mcu.externalChanged(BOARD_PINS.SW1);
    if (prev.sw2 !== this.inputs.sw2) this.mcu.externalChanged(BOARD_PINS.SW2);
    if (prev.b1 !== this.inputs.b1) this.mcu.externalChanged(BOARD_PINS.B1);
    if (prev.power !== this.inputs.power) {
      this.refreshAll();
      this.mcu.externalChanged(BOARD_PINS.STEP_HOME);
    }
  }

  ledLevel(pin: string): number {
    if (!this.mcu) return 0;
    const st = this.mcu.pinState(pin);
    if (st.pwm && st.pwm.freq > 0) return st.pwm.duty;
    if (st.mode === 'output' && st.driven) return st.level;
    return 0;
  }

  snapshot(t: number): BoardSnapshot {
    this.update(t);
    const s = this.stepper;
    return {
      t,
      power: this.inputs.power,
      leds: {
        LED1: this.ledLevel(BOARD_PINS.LED1),
        LED2: this.ledLevel(BOARD_PINS.LED2),
        LED3: this.ledLevel(BOARD_PINS.LED3),
        LED4: this.relay ? 1 : 0,
        LD2: this.ledLevel(BOARD_PINS.LD2),
      },
      relay: this.relay,
      motors: [this.motors[0].snap(this.parts.motor1), this.motors[1].snap(this.parts.motor2)],
      stepper: { attached: this.parts.stepper, angle: s.angle, steps: s.steps, microstep: s.microstep, dir: s.dir, home: s.home, rate: s.rate, stalled: s.stalled, note: s.note },
      servos: [this.servos[0].snap(this.parts.servo1), this.servos[1].snap(this.parts.servo2)],
      ptVolts: this.ptVolts(),
      ldrVolts: this.ldrVolts(),
      parts: { ...this.parts },
      inputs: { ...this.inputs },
      warnings: this.warnings.splice(0),
    };
  }
}
