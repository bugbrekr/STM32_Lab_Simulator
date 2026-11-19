import { useEffect, useState } from 'react';
import { useMx } from './PinoutConfig';
import { clockTree, solveClock, ClockCfg } from './model';

const MHz = (v: number) => (v / 1e6).toFixed(v % 1e6 === 0 ? 0 : 3).replace(/\.?0+$/, '') || '0';

function Box({ x, y, w = 70, value, bad, label, editable, onCommit, title }: { x: number; y: number; w?: number; value: string; bad?: boolean; label?: string; editable?: boolean; onCommit?: (v: string) => void; title?: string }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <div className="ck-box" style={{ left: x, top: y, width: w }} title={title}>
      {label && <div className="ck-label">{label}</div>}
      {editable ? (
        <input
          className={`ck-val ${bad ? 'bad' : ''} editable`}
          value={v}
          onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onCommit?.(v)}
          onBlur={() => v !== value && onCommit?.(v)}
        />
      ) : (
        <div className={`ck-val ${bad ? 'bad' : ''}`}>{value}</div>
      )}
    </div>
  );
}

function Drop<T extends number | string>({ x, y, w = 64, value, options, onChange, label, bad }: { x: number; y: number; w?: number; value: T; options: [T, string][]; onChange: (v: T) => void; label?: string; bad?: boolean }) {
  return (
    <div className="ck-box" style={{ left: x, top: y, width: w }}>
      {label && <div className="ck-label">{label}</div>}
      <select className={`ck-sel ${bad ? 'bad' : ''}`} value={String(value)} onChange={(e) => onChange((typeof value === 'number' ? Number(e.target.value) : e.target.value) as T)}>
        {options.map(([v, l]) => (
          <option key={String(v)} value={String(v)}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
}

function Mux({ x, y, h, options, value, onChange, label }: { x: number; y: number; h: number; options: string[]; value: string; onChange: (v: string) => void; label: string }) {
  return (
    <div style={{ position: 'absolute', left: x, top: y }}>
      <div className="ck-mux-label">{label}</div>
      <div className="ck-mux" style={{ height: h }}>
        {options.map((o) => (
          <label key={o} className="ck-radio">
            <input type="radio" checked={value === o} onChange={() => onChange(o)} /> {o}
          </label>
        ))}
      </div>
    </div>
  );
}

export function ClockConfig() {
  const [cfg, up] = useMx();
  const c = cfg.clock;
  const t = clockTree(c);
  const setC = (patch: Partial<ClockCfg>) => up((x) => ({ ...x, clock: { ...x.clock, ...patch } }));
  const [msg, setMsg] = useState('');
  const err = (k: string) => t.errors.includes(k);
  const presc = (vals: number[]) => vals.map((v) => [v, `/ ${v}`] as [number, string]);
  return (
    <div className="clock-page">
      <div className="ck-toolbar">
        <button
          onClick={() => {
            const s = solveClock(c, 84);
            if (s) setC(s);
          }}
        >
          Resolve Clock Issues
        </button>
        <span className="dim">Type a value in the HCLK box and press Enter to let the solver find PLL settings.</span>
        <span className="err-text">{msg}</span>
      </div>
      <div className="ck-canvas">
        <svg className="ck-lines" width={1180} height={620}>
          <path d="M 120 137 C 190 137, 200 176, 262 176" />
          <path d="M 120 247 C 190 247, 200 240, 262 240" />
          <path d="M 314 206 H 370" />
          <path d="M 440 206 H 480" />
          <path d="M 590 206 H 630" />
          <path d="M 700 206 H 740" />
          <path d="M 810 206 H 842" />
          <path d="M 700 206 V 341 H 740" />
          <path d="M 810 341 H 870" />
          <path d="M 120 137 C 300 137, 600 100, 842 100" />
          <path d="M 120 247 C 320 247, 620 153, 842 153" />
          <path d="M 894 141 H 940" />
          <path d="M 1020 141 H 1050" />
          <path d="M 1120 141 H 1150" />
          <path d="M 1120 141 V 251 H 1150" />
          <path d="M 1120 141 V 371 H 1150" />
          <path d="M 1120 141 V 496 H 1150" />
        </svg>
        {/* sources */}
        <Box x={20} y={110} label="HSI RC" value="16" w={90} />
        <div className="ck-src" style={{ left: 20, top: 160 }}>
          16 MHz
        </div>
        <Box x={20} y={220} label="Input frequency" value="8" w={90} title="HSE: 8 MHz MCO from the ST-LINK (bypass)" />
        <div className="ck-src" style={{ left: 20, top: 270 }}>
          HSE {c.hseMode === 'Disable' ? '(disabled — enable in RCC)' : `(${c.hseMode === 'BYPASS Clock Source' ? 'bypass' : 'crystal'})`}
        </div>
        <Box x={20} y={420} label="LSE / LSI" value="32 / 32.768" w={90} />
        <div className="ck-src dim" style={{ left: 20, top: 470 }}>
          RTC clock (not simulated)
        </div>
        <Mux x={250} y={118} h={150} label="PLL Source Mux" options={['HSI', 'HSE']} value={c.pllSource} onChange={(v) => setC({ pllSource: v as 'HSI' | 'HSE' })} />
        <Drop x={360} y={180} w={70} label="/ M" value={c.m} options={Array.from({ length: 62 }, (_, i) => [i + 2, `/ ${i + 2}`] as [number, string])} onChange={(v) => setC({ m: v })} bad={err('vcoIn')} />
        <div className="ck-pll" style={{ left: 470, top: 150 }}>
          <div className="ck-label">Main PLL</div>
          <Drop x={10} y={30} w={90} label="* N" value={c.n} options={Array.from({ length: 383 }, (_, i) => [i + 50, `X ${i + 50}`] as [number, string])} onChange={(v) => setC({ n: v })} bad={err('vco')} />
        </div>
        <Drop x={620} y={180} w={70} label="/ P" value={c.p} options={[2, 4, 6, 8].map((v) => [v, `/ ${v}`] as [number, string])} onChange={(v) => setC({ p: v as 2 | 4 | 6 | 8 })} />
        <Drop x={730} y={315} w={70} label="/ Q" value={c.q} options={Array.from({ length: 14 }, (_, i) => [i + 2, `/ ${i + 2}`] as [number, string])} onChange={(v) => setC({ q: v })} />
        <Box x={860} y={315} w={90} label="48MHz clocks (MHz)" value={MHz(t.pllQ)} />
        <Box x={730} y={180} w={70} label="PLLCLK" value={MHz(t.pllP)} />
        <Mux x={820} y={48} h={180} label="System Clock Mux" options={['HSI', 'HSE', 'PLLCLK']} value={c.sysclkSource} onChange={(v) => setC({ sysclkSource: v as ClockCfg['sysclkSource'] })} />
        <Box x={930} y={115} w={80} label="SYSCLK (MHz)" value={MHz(t.sysclk)} bad={err('sysclk')} />
        <Drop x={1040} y={115} w={70} label="AHB Prescaler" value={c.ahb} options={presc([1, 2, 4, 8, 16, 64, 128, 256, 512])} onChange={(v) => setC({ ahb: v })} />
        <Box
          x={1140}
          y={115}
          w={84}
          label="HCLK (MHz)"
          value={MHz(t.hclk)}
          bad={err('hclk')}
          editable
          onCommit={(v) => {
            const n = Number(v);
            if (!n || n > 84) {
              setMsg(`HCLK ${v} MHz is not reachable (max 84 MHz)`);
              return;
            }
            const s = solveClock(c, n);
            if (s) {
              setC(s);
              setMsg('');
            } else setMsg(`No PLL configuration found for ${v} MHz`);
          }}
          title="Max 84 MHz"
        />
        <div className="ck-note" style={{ left: 1140, top: 165 }}>
          84 MHz max
        </div>
        <Drop x={1140} y={225} w={84} label="APB1 Prescaler" value={c.apb1} options={presc([1, 2, 4, 8, 16])} onChange={(v) => setC({ apb1: v })} />
        <Box x={1140} y={280} w={84} label="PCLK1 (MHz)" value={MHz(t.pclk1)} bad={err('pclk1')} />
        <div className="ck-note" style={{ left: 1140, top: 328 }}>
          42 MHz max · Timers ×{c.apb1 === 1 ? 1 : 2} = {MHz(t.tim1)}
        </div>
        <Drop x={1140} y={345} w={84} label="APB2 Prescaler" value={c.apb2} options={presc([1, 2, 4, 8, 16])} onChange={(v) => setC({ apb2: v })} />
        <Box x={1140} y={400} w={84} label="PCLK2 (MHz)" value={MHz(t.pclk2)} bad={err('pclk2')} />
        <div className="ck-note" style={{ left: 1140, top: 448 }}>
          84 MHz max · Timers ×{c.apb2 === 1 ? 1 : 2} = {MHz(t.tim2)}
        </div>
        <Box x={1140} y={470} w={84} label="Cortex timer (MHz)" value={MHz(t.hclk)} />
        <div className="ck-legend" style={{ left: 20, top: 540 }}>
          <div>
            VCO input = {(t.vcoIn / 1e6).toFixed(2)} MHz {err('vcoIn') ? <b className="err-text">(must be 1–2 MHz)</b> : ''} · VCO output = {(t.vco / 1e6).toFixed(0)} MHz {err('vco') ? <b className="err-text">(must be 100–432 MHz)</b> : ''}
          </div>
          <div>
            Lab default: HSI 16 MHz → /M 8 → ×N 84 → /P 2 = <b>84 MHz</b> SYSCLK, APB1 /2 = 42 MHz, APB2 /1 = 84 MHz (TIM1 and TIM3 run at 84 MHz).
          </div>
          {err('hse') && <div className="err-text">HSE is selected but disabled in RCC (Pinout ▸ System Core ▸ RCC).</div>}
        </div>
      </div>
    </div>
  );
}
