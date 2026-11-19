import { useMemo, useState } from 'react';
import { useStore } from '../store/store';
import {
  MxConfig, assignSignal, pinStatus, setTimerChannel, setTimerClockSource, setUsart2Mode, setAdcChannel, setDebug, setHse, isGpioSignal, clockTree, labelIdent, ChannelMode, TimCfg, PinConfig, pinsSorted,
} from './model';
import { LQFP64, pinSignals, TIMERS, TimerName, TIMER_INFO, ADC_CHANNEL_PIN, parsePin, IRQ_NAMES, extiIrq } from '../sim/mcu/pins';

export function useMx(): [MxConfig, (fn: (c: MxConfig) => MxConfig) => void] {
  const cfg = useStore((s) => s.mxConfig)!;
  const set = useStore((s) => s.set);
  return [cfg, (fn) => set((s) => ({ mxConfig: fn(s.mxConfig!), mxDirty: true }))];
}

export function evalNum(s: string): number | null {
  if (!/^[\d\s+\-*/()xXa-fA-FuUlL.]+$/.test(s)) return null;
  try {
    const v = Function(`"use strict";return (${s.replace(/[uUlL]+\b/g, '')});`)();
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

type Cat = { name: string; items: { id: string; label: string; enabled: boolean }[] };

function categories(): Cat[] {
  return [
    {
      name: 'System Core',
      items: [
        { id: 'DMA', label: 'DMA', enabled: false },
        { id: 'GPIO', label: 'GPIO', enabled: true },
        { id: 'IWDG', label: 'IWDG', enabled: false },
        { id: 'NVIC', label: 'NVIC', enabled: true },
        { id: 'RCC', label: 'RCC', enabled: true },
        { id: 'SYS', label: 'SYS', enabled: true },
        { id: 'WWDG', label: 'WWDG', enabled: false },
      ],
    },
    { name: 'Analog', items: [{ id: 'ADC1', label: 'ADC1', enabled: true }] },
    {
      name: 'Timers',
      items: [{ id: 'RTC', label: 'RTC', enabled: false }, ...TIMERS.map((t) => ({ id: t, label: t, enabled: true }))],
    },
    {
      name: 'Connectivity',
      items: [
        { id: 'I2C1', label: 'I2C1', enabled: false },
        { id: 'I2C2', label: 'I2C2', enabled: false },
        { id: 'I2C3', label: 'I2C3', enabled: false },
        { id: 'SDIO', label: 'SDIO', enabled: false },
        { id: 'SPI1', label: 'SPI1', enabled: false },
        { id: 'SPI2', label: 'SPI2', enabled: false },
        { id: 'USART1', label: 'USART1', enabled: false },
        { id: 'USART2', label: 'USART2', enabled: true },
        { id: 'USART6', label: 'USART6', enabled: false },
        { id: 'USB_OTG_FS', label: 'USB_OTG_FS', enabled: false },
      ],
    },
    { name: 'Multimedia', items: [] },
    { name: 'Computing', items: [{ id: 'CRC', label: 'CRC', enabled: false }] },
    { name: 'Middleware and Software Packs', items: [{ id: 'FATFS', label: 'FATFS', enabled: false }, { id: 'FREERTOS', label: 'FREERTOS', enabled: false }] },
  ];
}

function catStatus(c: MxConfig, id: string): 'ok' | 'warn' | null {
  if (id === 'ADC1') return c.adc1.channels.length ? 'ok' : null;
  if (id === 'USART2') return c.usart2.mode === 'Asynchronous' ? 'ok' : null;
  if (id === 'SYS') return c.debug !== 'Disable' ? 'ok' : null;
  if (id === 'RCC') return c.clock.hseMode !== 'Disable' ? 'ok' : null;
  if (id === 'GPIO') return Object.values(c.pins).some((p) => isGpioSignal(p.signal)) ? 'ok' : null;
  if (id in TIMER_INFO) {
    const t = c.tims[id as TimerName];
    const on = t.clockSource !== 'Disable' || Object.values(t.channels).some((ch) => ch.mode !== 'Disable');
    if (!on) return null;
    const missing = ([1, 2, 3, 4] as const).some((n) => t.channels[n].mode === 'PWM Generation' && !Object.values(c.pins).some((p) => p.signal === `${id}_CH${n}`));
    return missing ? 'warn' : 'ok';
  }
  return null;
}

// ------------------------------------------------------------------
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="prow">
      <span className="plabel">{label}</span>
      <span className="pval">{children}</span>
    </div>
  );
}

function Sel<T extends string>({ value, options, onChange, disabled }: { value: T; options: [T, string][]; onChange: (v: T) => void; disabled?: boolean }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as T)} disabled={disabled}>
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}

function Section({ title, children, open = true }: { title: string; children: React.ReactNode; open?: boolean }) {
  const [o, setO] = useState(open);
  return (
    <div className="psection">
      <div className="psection-title" onClick={() => setO(!o)}>
        {o ? '⌄' : '›'} {title}
      </div>
      {o && <div>{children}</div>}
    </div>
  );
}

function ConfigTabs({ tabs, children }: { tabs: string[]; children: (tab: string) => React.ReactNode }) {
  const [t, setT] = useState(tabs[0]);
  return (
    <div className="cfg-tabs-wrap">
      <div className="cfg-reset">
        <button disabled>Reset Configuration</button>
      </div>
      <div className="cfg-tabs">
        {tabs.map((x) => (
          <span key={x} className={`${x === t ? 'on' : ''} ${x === 'User Constants' || x === 'DMA Settings' ? 'dis' : ''}`} onClick={() => !(x === 'User Constants' || x === 'DMA Settings') && setT(x)}>
            {x === t ? '✔ ' : ''}
            {x}
          </span>
        ))}
      </div>
      <div className="cfg-tab-body">{children(t)}</div>
    </div>
  );
}

// ---------------- GPIO panel ----------------
const PULL_OPTS: [PinConfig['pull'] & string, string][] = [
  ['GPIO_NOPULL', 'No pull-up and no pull-down'],
  ['GPIO_PULLUP', 'Pull-up'],
  ['GPIO_PULLDOWN', 'Pull-down'],
];

function gpioModeText(p: PinConfig) {
  if (p.signal === 'GPIO_Output') return p.outMode === 'GPIO_MODE_OUTPUT_OD' ? 'Output Open Drain' : 'Output Push Pull';
  if (p.signal === 'GPIO_Input') return 'Input mode';
  if (p.signal === 'GPIO_Analog') return 'Analog mode';
  if (p.signal.startsWith('GPIO_EXTI')) return { GPIO_MODE_IT_RISING: 'External Interrupt Mode with Rising edge trigger detection', GPIO_MODE_IT_FALLING: 'External Interrupt Mode with Falling edge trigger detection', GPIO_MODE_IT_RISING_FALLING: 'External Interrupt Mode with Rising/Falling edge trigger detection' }[p.extiMode ?? 'GPIO_MODE_IT_RISING'];
  return 'Alternate Function Push Pull';
}

function GpioPanel() {
  const [cfg, up] = useMx();
  const pins = pinsSorted(Object.keys(cfg.pins).filter((p) => isGpioSignal(cfg.pins[p].signal)));
  const [selPin, setSelPin] = useState<string | null>(pins[0] ?? null);
  const p = selPin ? cfg.pins[selPin] : null;
  const setPin = (patch: Partial<PinConfig>) => selPin && up((c) => ({ ...c, pins: { ...c.pins, [selPin]: { ...c.pins[selPin], ...patch } } }));
  return (
    <ConfigTabs tabs={['GPIO']}>
      {() => (
        <div>
          <div className="dim" style={{ padding: '4px 6px' }}>
            Search Signals
          </div>
          <table className="mx-table small">
            <thead>
              <tr>
                <th>Pin Name</th>
                <th>Signal on Pin</th>
                <th>GPIO output level</th>
                <th>GPIO mode</th>
                <th>GPIO Pull-up/Pull-down</th>
                <th>Maximum output speed</th>
                <th>User Label</th>
              </tr>
            </thead>
            <tbody>
              {pins.length === 0 && (
                <tr>
                  <td colSpan={7} className="dim">
                    No GPIO configured. Click a pin in the Pinout view and choose GPIO_Output, GPIO_Input or GPIO_EXTIx.
                  </td>
                </tr>
              )}
              {pins.map((pin) => {
                const c = cfg.pins[pin];
                return (
                  <tr key={pin} className={selPin === pin ? 'sel' : ''} onClick={() => setSelPin(pin)}>
                    <td>{pin}</td>
                    <td>n/a</td>
                    <td>{c.signal === 'GPIO_Output' ? (c.level === 'GPIO_PIN_SET' ? 'High' : 'Low') : 'n/a'}</td>
                    <td>{gpioModeText(c)}</td>
                    <td>{PULL_OPTS.find((x) => x[0] === (c.pull ?? 'GPIO_NOPULL'))![1]}</td>
                    <td>{c.signal === 'GPIO_Output' ? ({ GPIO_SPEED_FREQ_LOW: 'Low', GPIO_SPEED_FREQ_MEDIUM: 'Medium', GPIO_SPEED_FREQ_HIGH: 'High', GPIO_SPEED_FREQ_VERY_HIGH: 'Very High' } as Record<string, string>)[c.speed ?? 'GPIO_SPEED_FREQ_LOW'] : 'n/a'}</td>
                    <td>{c.label ?? ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {p && selPin && (
            <div className="pin-detail">
              <div className="pd-title">{selPin} Configuration :</div>
              {p.signal === 'GPIO_Output' && (
                <Row label="GPIO output level">
                  <Sel value={p.level ?? 'GPIO_PIN_RESET'} options={[['GPIO_PIN_RESET', 'Low'], ['GPIO_PIN_SET', 'High']]} onChange={(v) => setPin({ level: v })} />
                </Row>
              )}
              <Row label="GPIO mode">
                {p.signal === 'GPIO_Output' ? (
                  <Sel value={p.outMode ?? 'GPIO_MODE_OUTPUT_PP'} options={[['GPIO_MODE_OUTPUT_PP', 'Output Push Pull'], ['GPIO_MODE_OUTPUT_OD', 'Output Open Drain']]} onChange={(v) => setPin({ outMode: v })} />
                ) : p.signal.startsWith('GPIO_EXTI') ? (
                  <Sel
                    value={p.extiMode ?? 'GPIO_MODE_IT_RISING'}
                    options={[
                      ['GPIO_MODE_IT_RISING', 'External Interrupt Mode with Rising edge trigger detection'],
                      ['GPIO_MODE_IT_FALLING', 'External Interrupt Mode with Falling edge trigger detection'],
                      ['GPIO_MODE_IT_RISING_FALLING', 'External Interrupt Mode with Rising/Falling edge trigger detection'],
                    ]}
                    onChange={(v) => setPin({ extiMode: v })}
                  />
                ) : (
                  <span>{gpioModeText(p)}</span>
                )}
              </Row>
              {p.signal !== 'GPIO_Analog' && (
                <Row label="GPIO Pull-up/Pull-down">
                  <Sel value={p.pull ?? 'GPIO_NOPULL'} options={PULL_OPTS} onChange={(v) => setPin({ pull: v })} />
                </Row>
              )}
              {p.signal === 'GPIO_Output' && (
                <Row label="Maximum output speed">
                  <Sel
                    value={p.speed ?? 'GPIO_SPEED_FREQ_LOW'}
                    options={[
                      ['GPIO_SPEED_FREQ_LOW', 'Low'],
                      ['GPIO_SPEED_FREQ_MEDIUM', 'Medium'],
                      ['GPIO_SPEED_FREQ_HIGH', 'High'],
                      ['GPIO_SPEED_FREQ_VERY_HIGH', 'Very High'],
                    ]}
                    onChange={(v) => setPin({ speed: v })}
                  />
                </Row>
              )}
              <Row label="User Label">
                <input value={p.label ?? ''} onChange={(e) => setPin({ label: e.target.value || undefined })} />
              </Row>
            </div>
          )}
        </div>
      )}
    </ConfigTabs>
  );
}

// ---------------- NVIC ----------------
function nvicRows(c: MxConfig): { name: string; key: string; enabled: boolean; locked: boolean; kind: string }[] {
  const rows: { name: string; key: string; enabled: boolean; locked: boolean; kind: string }[] = [
    ['Non maskable interrupt', true],
    ['Hard fault interrupt', true],
    ['Memory management fault', true],
    ['Pre-fetch fault, memory access fault', true],
    ['Undefined instruction or illegal state', true],
    ['System service call via SWI instruction', true],
    ['Debug monitor', true],
    ['Pendable request for system service', true],
    ['Time base: System tick timer', true],
    ['PVD interrupt through EXTI line 16', false],
    ['Flash global interrupt', false],
    ['RCC global interrupt', false],
  ].map(([n, e]) => ({ name: n as string, key: n as string, enabled: e as boolean, locked: true, kind: 'sys' }));
  if (c.adc1.channels.length) rows.push({ name: 'ADC1 global interrupt', key: 'ADC1', enabled: c.adc1.nvic, locked: false, kind: 'adc' });
  for (const t of TIMERS) {
    const tc = c.tims[t];
    if (tc.clockSource === 'Disable' && !Object.values(tc.channels).some((ch) => ch.mode !== 'Disable')) continue;
    const name = t === 'TIM1' ? 'TIM1 update interrupt and TIM10 global interrupt' : `${t} global interrupt`;
    rows.push({ name, key: t, enabled: tc.nvic, locked: false, kind: 'tim' });
  }
  if (c.usart2.mode === 'Asynchronous') rows.push({ name: 'USART2 global interrupt', key: 'USART2', enabled: c.usart2.nvic, locked: false, kind: 'usart' });
  const extis = new Set<string>();
  for (const [pin, p] of Object.entries(c.pins)) if (p.signal.startsWith('GPIO_EXTI')) extis.add(IRQ_NAMES[extiIrq(parsePin(pin).n)]);
  for (const irq of [...extis].sort()) {
    const nm = irq === 'EXTI15_10_IRQn' ? 'EXTI line[15:10] interrupts' : irq === 'EXTI9_5_IRQn' ? 'EXTI line[9:5] interrupts' : `EXTI line${irq.replace(/\D/g, '')} interrupt`;
    rows.push({ name: nm, key: irq, enabled: !!c.extiNvic[irq], locked: false, kind: 'exti' });
  }
  rows.push({ name: 'FPU global interrupt', key: 'FPU', enabled: false, locked: true, kind: 'sys' });
  return rows;
}

function setNvic(c: MxConfig, kind: string, key: string, on: boolean): MxConfig {
  const n = structuredClone(c);
  if (kind === 'adc') n.adc1.nvic = on;
  else if (kind === 'tim') n.tims[key as TimerName].nvic = on;
  else if (kind === 'usart') n.usart2.nvic = on;
  else if (kind === 'exti') n.extiNvic[key] = on;
  return n;
}

function NvicTable({ filter }: { filter?: string }) {
  const [cfg, up] = useMx();
  const rows = nvicRows(cfg).filter((r) => !filter || r.key === filter || (filter === 'GPIO' && r.kind === 'exti'));
  return (
    <table className="mx-table small">
      <thead>
        <tr>
          <th>NVIC Interrupt Table</th>
          <th>Enabled</th>
          <th>Preemption Priority</th>
          <th>Sub Priority</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key}>
            <td>{r.name}</td>
            <td>
              <input type="checkbox" checked={r.enabled} disabled={r.locked} onChange={(e) => up((c) => setNvic(c, r.kind, r.key, e.target.checked))} />
            </td>
            <td>{r.key === 'Time base: System tick timer' ? 15 : 0}</td>
            <td>0</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ---------------- RCC / SYS ----------------
function RccPanel() {
  const [cfg, up] = useMx();
  const tree = clockTree(cfg.clock);
  const lat = tree.hclk <= 30e6 ? 0 : tree.hclk <= 60e6 ? 1 : 2;
  return (
    <>
      <div className="mode-box">
        <Row label="High Speed Clock (HSE)">
          <Sel value={cfg.clock.hseMode} options={[['Disable', 'Disable'], ['BYPASS Clock Source', 'BYPASS Clock Source'], ['Crystal/Ceramic Resonator', 'Crystal/Ceramic Resonator']]} onChange={(v) => up((c) => setHse(c, v))} />
        </Row>
        <Row label="Low Speed Clock (LSE)">
          <Sel value={'Disable'} options={[['Disable', 'Disable']]} onChange={() => undefined} />
        </Row>
        <Row label="Master Clock Output 1">
          <input type="checkbox" disabled />
        </Row>
      </div>
      <ConfigTabs tabs={['Parameter Settings', 'User Constants', 'NVIC Settings']}>
        {(t) =>
          t === 'Parameter Settings' ? (
            <>
              <Section title="System Parameters">
                <Row label="VDD voltage (V)">3.3 V</Row>
                <Row label="Instruction Cache">Enabled</Row>
                <Row label="Prefetch Buffer">Enabled</Row>
                <Row label="Data Cache">Enabled</Row>
                <Row label="Flash Latency(WS)">{lat} WS ({lat + 1} CPU cycle)</Row>
              </Section>
              <Section title="RCC Parameters">
                <Row label="HSI Calibration Value">16</Row>
                <Row label="TIM Prescaler Selection">Disabled</Row>
                <Row label="HSE Startup Timout Value (ms)">100</Row>
              </Section>
              <Section title="Power Parameters">
                <Row label="Power Regulator Voltage Scale">Power Regulator Voltage Scale 2</Row>
              </Section>
            </>
          ) : (
            <NvicTable filter="RCC" />
          )
        }
      </ConfigTabs>
    </>
  );
}

function SysPanel() {
  const [cfg, up] = useMx();
  return (
    <>
      <div className="mode-box">
        <Row label="Debug">
          <Sel value={cfg.debug} options={[['Disable', 'No Debug'], ['Serial Wire', 'Serial Wire']]} onChange={(v) => up((c) => setDebug(c, v))} />
        </Row>
        <Row label="System Wake-Up">
          <input type="checkbox" disabled />
        </Row>
        <Row label="Timebase Source">
          <Sel value={'SysTick'} options={[['SysTick', 'SysTick']]} onChange={() => undefined} />
        </Row>
      </div>
      <div className="dim" style={{ padding: 8 }}>
        Note: with “No Debug”, PA13/PA14 can be reused as GPIO; on a real board you then need “Connect under reset” to reprogram it.
      </div>
    </>
  );
}

// ---------------- ADC1 ----------------
function AdcPanel() {
  const [cfg, up] = useMx();
  const a = cfg.adc1;
  const setA = (patch: Partial<MxConfig['adc1']>) => up((c) => ({ ...c, adc1: { ...c.adc1, ...patch } }));
  return (
    <>
      <div className="mode-box">
        {Object.entries(ADC_CHANNEL_PIN).map(([ch, pin]) => {
          const n = Number(ch);
          const other = cfg.pins[pin] && cfg.pins[pin].signal !== `ADC1_IN${n}`;
          return (
            <label key={ch} className={`chkrow ${other ? 'dis' : ''}`} title={other ? `${pin} is used by ${cfg.pins[pin].signal}` : pin}>
              <input type="checkbox" checked={a.channels.includes(n)} disabled={!!other} onChange={(e) => up((c) => setAdcChannel(c, n, e.target.checked))} /> IN{n}
            </label>
          );
        })}
        <label className="chkrow dis">
          <input type="checkbox" disabled /> Temperature Sensor Channel
        </label>
        <label className="chkrow dis">
          <input type="checkbox" disabled /> Vrefint Channel
        </label>
      </div>
      {a.channels.length > 0 && (
        <ConfigTabs tabs={['Parameter Settings', 'User Constants', 'NVIC Settings', 'DMA Settings', 'GPIO Settings']}>
          {(t) =>
            t === 'Parameter Settings' ? (
              <>
                <Section title="ADCs_Common_Settings">
                  <Row label="Mode">Independent mode</Row>
                </Section>
                <Section title="ADC_Settings">
                  <Row label="Clock Prescaler">
                    <Sel
                      value={a.clockPrescaler}
                      options={[
                        ['ADC_CLOCK_SYNC_PCLK_DIV2', 'PCLK2 divided by 2'],
                        ['ADC_CLOCK_SYNC_PCLK_DIV4', 'PCLK2 divided by 4'],
                        ['ADC_CLOCK_SYNC_PCLK_DIV6', 'PCLK2 divided by 6'],
                        ['ADC_CLOCK_SYNC_PCLK_DIV8', 'PCLK2 divided by 8'],
                      ]}
                      onChange={(v) => setA({ clockPrescaler: v })}
                    />
                  </Row>
                  <Row label="Resolution">
                    <Sel
                      value={a.resolution}
                      options={[
                        ['ADC_RESOLUTION_12B', '12 bits (15 ADC Clock cycles)'],
                        ['ADC_RESOLUTION_10B', '10 bits (13 ADC Clock cycles)'],
                        ['ADC_RESOLUTION_8B', '8 bits (11 ADC Clock cycles)'],
                        ['ADC_RESOLUTION_6B', '6 bits (9 ADC Clock cycles)'],
                      ]}
                      onChange={(v) => setA({ resolution: v })}
                    />
                  </Row>
                  <Row label="Data Alignment">
                    <Sel value={a.dataAlign} options={[['ADC_DATAALIGN_RIGHT', 'Right alignment'], ['ADC_DATAALIGN_LEFT', 'Left alignment']]} onChange={(v) => setA({ dataAlign: v })} />
                  </Row>
                  <Row label="Scan Conversion Mode">
                    <Sel value={a.scan ? 'E' : 'D'} options={[['D', 'Disabled'], ['E', 'Enabled']]} onChange={(v) => setA({ scan: v === 'E' })} />
                  </Row>
                  <Row label="Continuous Conversion Mode">
                    <Sel value={a.continuous ? 'E' : 'D'} options={[['D', 'Disabled'], ['E', 'Enabled']]} onChange={(v) => setA({ continuous: v === 'E' })} />
                  </Row>
                  <Row label="Discontinuous Conversion Mode">
                    <Sel value={a.discontinuous ? 'E' : 'D'} options={[['D', 'Disabled'], ['E', 'Enabled']]} onChange={(v) => setA({ discontinuous: v === 'E' })} />
                  </Row>
                  <Row label="DMA Continuous Requests">Disabled</Row>
                  <Row label="End Of Conversion Selection">
                    <Sel value={a.eoc} options={[['ADC_EOC_SINGLE_CONV', 'EOC flag at the end of single channel conversion'], ['ADC_EOC_SEQ_CONV', 'EOC flag at the end of all conversions']]} onChange={(v) => setA({ eoc: v })} />
                  </Row>
                </Section>
                <Section title="ADC_Regular_ConversionMode">
                  <Row label="Number Of Conversion">1</Row>
                  <Row label="External Trigger Conversion Source">Regular Conversion launched by software</Row>
                  <Row label="External Trigger Conversion Edge">None</Row>
                  <Row label="Rank 1 — Channel">
                    <Sel value={String(a.rankChannel ?? a.channels[0])} options={a.channels.map((c) => [String(c), `Channel ${c}`] as [string, string])} onChange={(v) => setA({ rankChannel: Number(v) })} />
                  </Row>
                  <Row label="Rank 1 — Sampling Time">
                    <Sel value={a.samplingTime} options={[3, 15, 28, 56, 84, 112, 144, 480].map((n) => [`ADC_SAMPLETIME_${n}CYCLES`, `${n} Cycles`] as [string, string])} onChange={(v) => setA({ samplingTime: v })} />
                  </Row>
                </Section>
              </>
            ) : t === 'NVIC Settings' ? (
              <NvicTable filter="ADC1" />
            ) : (
              <AfGpioTable prefix="ADC1_" />
            )
          }
        </ConfigTabs>
      )}
    </>
  );
}

function AfGpioTable({ prefix }: { prefix: string }) {
  const [cfg] = useMx();
  const pins = pinsSorted(Object.keys(cfg.pins).filter((p) => cfg.pins[p].signal.startsWith(prefix)));
  return (
    <table className="mx-table small">
      <thead>
        <tr>
          <th>Pin Name</th>
          <th>Signal on Pin</th>
          <th>GPIO mode</th>
          <th>Pull-up/Pull-down</th>
          <th>Max speed</th>
          <th>User Label</th>
        </tr>
      </thead>
      <tbody>
        {pins.map((p) => (
          <tr key={p}>
            <td>{p}</td>
            <td>{cfg.pins[p].signal}</td>
            <td>{prefix.startsWith('ADC') ? 'Analog mode' : 'Alternate Function Push Pull'}</td>
            <td>No pull-up and no pull-down</td>
            <td>{prefix.startsWith('ADC') ? 'n/a' : prefix.startsWith('USART') ? 'Very High' : 'Low'}</td>
            <td>{cfg.pins[p].label ?? ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ---------------- TIMx ----------------
function TimPanel({ t }: { t: TimerName }) {
  const [cfg, up] = useMx();
  const tc = cfg.tims[t];
  const info = TIMER_INFO[t];
  const setT = (patch: Partial<TimCfg>) => up((c) => ({ ...c, tims: { ...c.tims, [t]: { ...c.tims[t], ...patch } } }));
  const setCh = (n: 1 | 2 | 3 | 4, patch: Partial<TimCfg['channels'][1]>) => up((c) => ({ ...c, tims: { ...c.tims, [t]: { ...c.tims[t], channels: { ...c.tims[t].channels, [n]: { ...c.tims[t].channels[n], ...patch } } } } }));
  const active = tc.clockSource !== 'Disable' || Object.values(tc.channels).some((ch) => ch.mode !== 'Disable');
  const tree = clockTree(cfg.clock);
  const fclk = info.apb === 1 ? tree.tim1 : tree.tim2;
  const psc = evalNum(tc.prescaler);
  const arr = evalNum(tc.period);
  const chs = ([1, 2, 3, 4] as const).slice(0, info.channels);
  const bits = info.bits;
  return (
    <>
      <div className="mode-box">
        <Row label="Slave Mode">
          <Sel value="Disable" options={[['Disable', 'Disable']]} onChange={() => undefined} />
        </Row>
        <Row label="Trigger Source">
          <Sel value="Disable" options={[['Disable', 'Disable']]} onChange={() => undefined} />
        </Row>
        <Row label="Clock Source">
          <Sel value={tc.clockSource} options={[['Disable', 'Disable'], ['Internal Clock', 'Internal Clock']]} onChange={(v) => up((c) => setTimerClockSource(c, t, v))} />
        </Row>
        {chs.map((n) => (
          <Row key={n} label={`Channel${n}`}>
            <Sel
              value={tc.channels[n].mode}
              options={[
                ['Disable', 'Disable'],
                ['PWM Generation', `PWM Generation CH${n}`],
                ['Output Compare No Output', 'Output Compare No Output'],
              ]}
              onChange={(v) => up((c) => setTimerChannel(c, t, n, v as ChannelMode))}
            />
          </Row>
        ))}
        {info.advanced && (
          <Row label="Combined Channels">
            <Sel value="Disable" options={[['Disable', 'Disable']]} onChange={() => undefined} />
          </Row>
        )}
        <Row label="One Pulse Mode">
          <input type="checkbox" disabled />
        </Row>
      </div>
      {active && (
        <ConfigTabs tabs={['Parameter Settings', 'User Constants', 'NVIC Settings', 'DMA Settings', 'GPIO Settings']}>
          {(tab) =>
            tab === 'Parameter Settings' ? (
              <>
                <Section title="Counter Settings">
                  <Row label={`Prescaler (PSC - 16 bits value)`}>
                    <input className={psc === null || psc < 0 || psc > 65535 ? 'bad' : ''} value={tc.prescaler} onChange={(e) => setT({ prescaler: e.target.value })} />
                  </Row>
                  <Row label="Counter Mode">
                    <Sel value={tc.counterMode} options={[['TIM_COUNTERMODE_UP', 'Up'], ['TIM_COUNTERMODE_DOWN', 'Down']]} onChange={(v) => setT({ counterMode: v })} />
                  </Row>
                  <Row label={`Counter Period (AutoReload Register - ${bits} bits value )`}>
                    <input className={arr === null || arr < 0 || arr > 2 ** bits - 1 ? 'bad' : ''} value={tc.period} onChange={(e) => setT({ period: e.target.value })} />
                  </Row>
                  <Row label="Internal Clock Division (CKD)">
                    <Sel value={tc.clockDivision} options={[['TIM_CLOCKDIVISION_DIV1', 'No Division'], ['TIM_CLOCKDIVISION_DIV2', 'Division by 2'], ['TIM_CLOCKDIVISION_DIV4', 'Division by 4']]} onChange={(v) => setT({ clockDivision: v })} />
                  </Row>
                  {info.advanced && (
                    <Row label="Repetition Counter (RCR - 8 bits value)">
                      <input value={tc.repetition} onChange={(e) => setT({ repetition: e.target.value })} />
                    </Row>
                  )}
                  <Row label="auto-reload preload">
                    <Sel value={tc.autoReload} options={[['TIM_AUTORELOAD_PRELOAD_DISABLE', 'Disable'], ['TIM_AUTORELOAD_PRELOAD_ENABLE', 'Enable']]} onChange={(v) => setT({ autoReload: v })} />
                  </Row>
                </Section>
                <Section title="Trigger Output (TRGO) Parameters">
                  <Row label="Master/Slave Mode (MSM bit)">Disable (Trigger input effect not delayed)</Row>
                  <Row label="Trigger Event Selection">Reset (UG bit from TIMx_EGR)</Row>
                </Section>
                {info.advanced && (
                  <Section title="Break And Dead Time management - BRK Configuration" open={false}>
                    <Row label="BRK State">Disable</Row>
                    <Row label="BRK Polarity">High</Row>
                    <Row label="Dead Time">0</Row>
                  </Section>
                )}
                {chs
                  .filter((n) => tc.channels[n].mode === 'PWM Generation')
                  .map((n) => {
                    const ch = tc.channels[n];
                    return (
                      <Section key={n} title={`PWM Generation Channel ${n}`}>
                        <Row label="Mode">
                          <Sel value={ch.ocMode} options={[['TIM_OCMODE_PWM1', 'PWM mode 1'], ['TIM_OCMODE_PWM2', 'PWM mode 2']]} onChange={(v) => setCh(n, { ocMode: v })} />
                        </Row>
                        <Row label={`Pulse (${bits} bits value)`}>
                          <input value={ch.pulse} onChange={(e) => setCh(n, { pulse: e.target.value })} />
                        </Row>
                        <Row label="Output compare preload">Enable</Row>
                        <Row label="Fast Mode">
                          <Sel value={ch.fast} options={[['TIM_OCFAST_DISABLE', 'Disable'], ['TIM_OCFAST_ENABLE', 'Enable']]} onChange={(v) => setCh(n, { fast: v })} />
                        </Row>
                        <Row label="CH Polarity">
                          <Sel value={ch.polarity} options={[['TIM_OCPOLARITY_HIGH', 'High'], ['TIM_OCPOLARITY_LOW', 'Low']]} onChange={(v) => setCh(n, { polarity: v })} />
                        </Row>
                      </Section>
                    );
                  })}
                <div className="sim-hint">
                  <b>Simulator hint</b> — {t} runs from the APB{info.apb} timer clock = {(fclk / 1e6).toFixed(2)} MHz.
                  {psc !== null && arr !== null && (
                    <>
                      {' '}
                      Counter clock = {(fclk / (psc + 1) / 1000).toFixed(3)} kHz, period = {(((arr + 1) * (psc + 1)) / fclk * 1000).toFixed(4)} ms → <b>{(fclk / (psc + 1) / (arr + 1)).toFixed(3)} Hz</b>
                    </>
                  )}
                </div>
              </>
            ) : tab === 'NVIC Settings' ? (
              <NvicTable filter={t} />
            ) : (
              <AfGpioTable prefix={`${t}_`} />
            )
          }
        </ConfigTabs>
      )}
    </>
  );
}

// ---------------- USART2 ----------------
function UsartPanel() {
  const [cfg, up] = useMx();
  const u = cfg.usart2;
  const setU = (patch: Partial<MxConfig['usart2']>) => up((c) => ({ ...c, usart2: { ...c.usart2, ...patch } }));
  return (
    <>
      <div className="mode-box">
        <Row label="Mode">
          <select value={u.mode} onChange={(e) => up((c) => setUsart2Mode(c, e.target.value as 'Disable' | 'Asynchronous'))}>
            <option value="Disable">Disable</option>
            <option value="Asynchronous">Asynchronous</option>
            <option disabled>Synchronous</option>
            <option disabled>Single Wire (Half-Duplex)</option>
            <option disabled>Multiprocessor Communication</option>
            <option disabled>IrDA</option>
            <option disabled>LIN</option>
            <option disabled>SmartCard</option>
          </select>
        </Row>
        <Row label="Hardware Flow Control (RS232)">
          <Sel value="Disable" options={[['Disable', 'Disable']]} onChange={() => undefined} />
        </Row>
      </div>
      {u.mode === 'Asynchronous' && (
        <ConfigTabs tabs={['Parameter Settings', 'User Constants', 'NVIC Settings', 'DMA Settings', 'GPIO Settings']}>
          {(t) =>
            t === 'Parameter Settings' ? (
              <>
                <Section title="Basic Parameters">
                  <Row label="Baud Rate">
                    <input type="number" value={u.baud} onChange={(e) => setU({ baud: Number(e.target.value) || 0 })} /> Bits/s
                  </Row>
                  <Row label="Word Length">
                    <Sel value={u.wordLength} options={[['UART_WORDLENGTH_8B', '8 Bits (including Parity)'], ['UART_WORDLENGTH_9B', '9 Bits (including Parity)']]} onChange={(v) => setU({ wordLength: v })} />
                  </Row>
                  <Row label="Parity">
                    <Sel value={u.parity} options={[['UART_PARITY_NONE', 'None'], ['UART_PARITY_EVEN', 'Even'], ['UART_PARITY_ODD', 'Odd']]} onChange={(v) => setU({ parity: v })} />
                  </Row>
                  <Row label="Stop Bits">
                    <Sel value={u.stopBits} options={[['UART_STOPBITS_1', '1'], ['UART_STOPBITS_2', '2']]} onChange={(v) => setU({ stopBits: v })} />
                  </Row>
                </Section>
                <Section title="Advanced Parameters">
                  <Row label="Data Direction">
                    <Sel value={u.direction} options={[['UART_MODE_TX_RX', 'Receive and Transmit'], ['UART_MODE_TX', 'Transmit Only'], ['UART_MODE_RX', 'Receive Only']]} onChange={(v) => setU({ direction: v })} />
                  </Row>
                  <Row label="Over Sampling">
                    <Sel value={u.oversampling} options={[['UART_OVERSAMPLING_16', '16 Samples'], ['UART_OVERSAMPLING_8', '8 Samples']]} onChange={(v) => setU({ oversampling: v })} />
                  </Row>
                </Section>
                <div className="sim-hint">
                  <b>Simulator hint</b> — USART2 TX/RX (PA2/PA3) are wired to the ST-LINK Virtual COM port. Open it in CubeIDE: Console ▸ Command Shell Console ▸ Serial Port at {u.baud} baud.
                </div>
              </>
            ) : t === 'NVIC Settings' ? (
              <NvicTable filter="USART2" />
            ) : (
              <AfGpioTable prefix="USART2_" />
            )
          }
        </ConfigTabs>
      )}
    </>
  );
}

// ---------------- chip view ----------------
const POWER = new Set(['VBAT', 'VSSA', 'VDDA', 'VSS', 'VDD', 'VCAP1']);

function pinPos(n: number, body: number, cx: number, cy: number, pitch: number) {
  // LQFP64: 1-16 left (top->bottom), 17-32 bottom (left->right), 33-48 right (bottom->top), 49-64 top (right->left)
  const half = body / 2;
  const start = -7.5 * pitch;
  if (n <= 16) return { side: 'L', x: cx - half, y: cy + start + (n - 1) * pitch };
  if (n <= 32) return { side: 'B', x: cx + start + (n - 17) * pitch, y: cy + half };
  if (n <= 48) return { side: 'R', x: cx + half, y: cy - start - (n - 33) * pitch };
  return { side: 'T', x: cx - start - (n - 49) * pitch, y: cy - half };
}

function ChipView() {
  const [cfg, up] = useMx();
  const [menu, setMenu] = useState<{ pin: string; x: number; y: number } | null>(null);
  const [labelEdit, setLabelEdit] = useState<{ pin: string; value: string } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [hover, setHover] = useState<string | null>(null);
  const S = 900;
  const cx = S / 2;
  const cy = S / 2;
  const body = 400;
  const pitch = 23;
  const plen = 36;
  const pins = useMemo(() => LQFP64.map((name, n) => ({ name, n })).filter((x) => x.n > 0), []);
  return (
    <div className="chip-wrap" onClick={() => setMenu(null)}>
      <div className="chip-tabs">
        <span className="on">Pinout view</span>
        <span className="dis">System view</span>
      </div>
      <div className="chip-canvas">
        <svg viewBox={`${(S - S / zoom) / 2} ${(S - S / zoom) / 2} ${S / zoom} ${S / zoom}`} className="chipsvg">
          <rect x={cx - body / 2} y={cy - body / 2} width={body} height={body} rx={6} fill="#3d3d3d" stroke="#222" />
          <circle cx={cx - body / 2 + 24} cy={cy - body / 2 + 24} r={8} fill="#2a2a2a" />
          <text x={cx} y={cy - 18} textAnchor="middle" fill="#ddd" fontSize={26} fontWeight={700} fontFamily="Arial">
            STM32F401RETx
          </text>
          <text x={cx} y={cy + 16} textAnchor="middle" fill="#bbb" fontSize={18} fontFamily="Arial">
            LQFP64
          </text>
          <text x={cx} y={cy + 60} textAnchor="middle" fill="#3cb4e6" fontSize={34} fontStyle="italic" fontWeight={800} fontFamily="Arial">
            ST
          </text>
          {pins.map(({ name, n }) => {
            const pos = pinPos(n, body, cx, cy, pitch);
            const isGpio = /^P[A-H]\d+$/.test(name);
            const st = isGpio ? pinStatus(cfg, name) : 'free';
            const fill = !isGpio ? (POWER.has(name) ? '#f6f1c1' : '#d7d2b0') : st === 'ok' ? '#54b84a' : st === 'partial' ? '#f0a020' : '#c9c9c9';
            let rx = 0, ry = 0, w = 0, h = 0, tx = 0, ty = 0, rot = 0, anchor: 'start' | 'end' = 'end', lx = 0, ly = 0;
            if (pos.side === 'L') {
              rx = pos.x - plen; ry = pos.y - 8; w = plen; h = 16; tx = pos.x - 4; ty = pos.y + 4; anchor = 'end'; lx = pos.x - plen - 6; ly = pos.y + 4;
            } else if (pos.side === 'R') {
              rx = pos.x; ry = pos.y - 8; w = plen; h = 16; tx = pos.x + 4; ty = pos.y + 4; anchor = 'start'; lx = pos.x + plen + 6; ly = pos.y + 4;
            } else if (pos.side === 'B') {
              rx = pos.x - 8; ry = pos.y; w = 16; h = plen; tx = pos.x + 4; ty = pos.y + 4; rot = 90; anchor = 'start'; lx = pos.x + 4; ly = pos.y + plen + 6;
            } else {
              rx = pos.x - 8; ry = pos.y - plen; w = 16; h = plen; tx = pos.x + 4; ty = pos.y - 4; rot = -90; anchor = 'start'; lx = pos.x + 4; ly = pos.y - plen - 6;
            }
            const pc = cfg.pins[name];
            const lbl = pc ? pc.label || pc.signal : '';
            return (
              <g
                key={n}
                className={isGpio ? 'pin gpio' : 'pin'}
                onMouseEnter={() => setHover(name)}
                onMouseLeave={() => setHover(null)}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!isGpio) return;
                  setMenu({ pin: name, x: e.clientX, y: e.clientY });
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  if (!isGpio) return;
                  setLabelEdit({ pin: name, value: cfg.pins[name]?.label ?? '' });
                }}
              >
                <rect x={rx} y={ry} width={w} height={h} fill={fill} stroke={hover === name ? '#03234b' : '#8a8a8a'} strokeWidth={hover === name ? 2 : 0.8} />
                <text x={pos.side === 'L' ? rx + w - 3 : pos.side === 'R' ? rx + 3 : tx} y={pos.side === 'L' || pos.side === 'R' ? ty : ty} fontSize={9.5} textAnchor={pos.side === 'L' ? 'end' : 'start'} transform={rot ? `rotate(${rot} ${tx} ${ty})` : undefined} fill="#222" fontFamily="Arial" style={{ pointerEvents: 'none' }}>
                  {pos.side === 'B' ? '' : ''}
                </text>
                <text
                  x={pos.side === 'B' || pos.side === 'T' ? pos.x + 3.5 : pos.side === 'L' ? rx + w - 2 : rx + 2}
                  y={pos.side === 'B' ? ry + 3 : pos.side === 'T' ? ry + h - 3 : pos.y + 3.5}
                  fontSize={9}
                  fill="#111"
                  fontFamily="Arial"
                  textAnchor={pos.side === 'L' || pos.side === 'T' ? 'end' : 'start'}
                  transform={pos.side === 'B' ? `rotate(90 ${pos.x + 3.5} ${ry + 3})` : pos.side === 'T' ? `rotate(90 ${pos.x + 3.5} ${ry + h - 3})` : undefined}
                  style={{ pointerEvents: 'none' }}
                >
                  {name}
                </text>
                {lbl && (
                  <text
                    x={lx}
                    y={ly}
                    fontSize={11}
                    fontWeight={600}
                    fill="#03234b"
                    fontFamily="Arial"
                    textAnchor={pos.side === 'L' ? 'end' : pos.side === 'R' ? 'start' : pos.side === 'B' ? 'start' : 'end'}
                    transform={pos.side === 'B' ? `rotate(90 ${lx} ${ly})` : pos.side === 'T' ? `rotate(90 ${lx} ${ly})` : undefined}
                    style={{ pointerEvents: 'none' }}
                  >
                    {lbl}
                  </text>
                )}
                <title>{`${name} (pin ${n})${pc ? ` — ${pc.signal}${pc.label ? ` [${pc.label}]` : ''}` : ''}${isGpio ? '\nClick: choose signal · Right-click: enter user label' : ''}`}</title>
              </g>
            );
          })}
        </svg>
        <div className="chip-zoom">
          <button onClick={() => setZoom((z) => Math.min(3, z * 1.25))}>＋</button>
          <button onClick={() => setZoom(1)}>⛶</button>
          <button onClick={() => setZoom((z) => Math.max(0.6, z / 1.25))}>－</button>
        </div>
      </div>
      {menu && (
        <div className="pin-menu" style={{ left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()}>
          <div className="pm-head">{menu.pin}</div>
          {pinSignals(menu.pin).map((sig) => {
            const cur = cfg.pins[menu.pin]?.signal === sig || (sig === 'Reset_State' && !cfg.pins[menu.pin]);
            const unsupported = /SPI|I2C|USART1|USART6|RCC_MCO|_CTS|_RTS|_CK|ETR|BKIN|CH\dN|TIM9|TIM10|TIM11|SMBA|SYS_JTDI|SYS_JTRST|SYS_JTDO|OSC32/.test(sig) && !/TIM9_CH|TIM10_CH|TIM11_CH/.test(sig);
            return (
              <div
                key={sig}
                className={`pm-item ${cur ? 'cur' : ''} ${unsupported ? 'dis' : ''}`}
                title={unsupported ? 'Not simulated' : ''}
                onClick={() => {
                  if (unsupported) return;
                  up((c) => assignSignal(c, menu.pin, sig));
                  setMenu(null);
                }}
              >
                {cur ? '✓ ' : ''}
                {sig}
              </div>
            );
          })}
        </div>
      )}
      {labelEdit && (
        <div className="modal-backdrop">
          <div className="mx-dlg">
            <div className="mx-dlg-title">Enter User Label — {labelEdit.pin}</div>
            <div className="mx-dlg-body">
              <input autoFocus style={{ width: '100%' }} value={labelEdit.value} onChange={(e) => setLabelEdit({ ...labelEdit, value: e.target.value })} />
              <div className="dim" style={{ marginTop: 6 }}>
                Generates <code>#define {labelIdent(labelEdit.value) ?? 'LABEL'}_Pin</code> and <code>{labelIdent(labelEdit.value) ?? 'LABEL'}_GPIO_Port</code> in main.h
              </div>
            </div>
            <div className="mx-dlg-btns">
              <button
                className="primary"
                onClick={() => {
                  const { pin, value } = labelEdit;
                  up((c) => (c.pins[pin] ? { ...c, pins: { ...c.pins, [pin]: { ...c.pins[pin], label: value || undefined } } } : assignSignal(c, pin, 'GPIO_Output')));
                  if (value && !cfg.pins[pin]) up((c) => ({ ...c, pins: { ...c.pins, [pin]: { ...c.pins[pin], label: value } } }));
                  setLabelEdit(null);
                }}
              >
                OK
              </button>
              <button onClick={() => setLabelEdit(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------- page ----------------
export function PinoutConfig() {
  const [cfg] = useMx();
  const cat = useStore((s) => s.mxCategory);
  const set = useStore((s) => s.set);
  const [open, setOpen] = useState<Record<string, boolean>>({ 'System Core': true, Analog: true, Timers: true, Connectivity: true });
  const [q, setQ] = useState('');
  const cats = categories();
  return (
    <div className="pinout-page">
      <div className="cats">
        <input className="cat-search" placeholder="🔍" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="cat-mode">
          <span className="on">Categories</span>
          <span>A-&gt;Z</span>
        </div>
        {cats.map((c) => {
          const items = c.items.filter((i) => i.label.toLowerCase().includes(q.toLowerCase()));
          return (
            <div key={c.name}>
              <div className="cat-title" onClick={() => setOpen((o) => ({ ...o, [c.name]: !o[c.name] }))}>
                {open[c.name] ? '⌄' : '›'} {c.name}
              </div>
              {open[c.name] &&
                items.map((i) => {
                  const st = i.enabled ? catStatus(cfg, i.id) : null;
                  return (
                    <div key={i.id} className={`cat-item ${cat === i.id ? 'sel' : ''} ${i.enabled ? '' : 'dis'}`} onClick={() => i.enabled && set({ mxCategory: i.id })} title={i.enabled ? '' : 'Not available in the simulator'}>
                      <span className="cat-st">{st === 'ok' ? <span className="ok">✔</span> : st === 'warn' ? <span className="warn">⚠</span> : ''}</span>
                      {i.label}
                    </div>
                  );
                })}
            </div>
          );
        })}
      </div>
      {cat && (
        <div className="cfg-panel">
          <div className="cfg-title">{cat} Mode and Configuration</div>
          <div className="cfg-sub">Mode</div>
          <div className="cfg-scroll">
            {cat === 'GPIO' && <GpioPanel />}
            {cat === 'NVIC' && (
              <ConfigTabs tabs={['NVIC', 'Code generation']}>{() => <NvicTable />}</ConfigTabs>
            )}
            {cat === 'RCC' && <RccPanel />}
            {cat === 'SYS' && <SysPanel />}
            {cat === 'ADC1' && <AdcPanel />}
            {cat in TIMER_INFO && <TimPanel t={cat as TimerName} />}
            {cat === 'USART2' && <UsartPanel />}
          </div>
        </div>
      )}
      <ChipView />
    </div>
  );
}
