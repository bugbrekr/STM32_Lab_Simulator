import React, { useRef, useState } from 'react';
import type { BoardInputs, BoardSnapshot, PartsConfig } from '../sim/board/board';
import type { SimSnapshot, PinSnap } from '../sim/simulator';
import './board.css';

export interface BoardViewProps {
  snap: SimSnapshot | null;
  inputs: BoardInputs;
  parts: PartsConfig;
  running: boolean;
  flashing?: boolean;
  onInputs: (p: Partial<BoardInputs>) => void;
  onParts: (p: Partial<PartsConfig>) => void;
  onReset?: () => void;
}

type PartKey = keyof PartsConfig;

const PART_SLOTS: Record<PartKey, { label: string; connector: string }> = {
  motor1: { label: 'DC motor', connector: 'MOTOR1' },
  motor2: { label: 'DC motor', connector: 'MOTOR2' },
  stepper: { label: 'Stepper motor (NEMA 17)', connector: 'STEPPER' },
  servo1: { label: 'Servo motor (SG90)', connector: 'SERVO PB3' },
  servo2: { label: 'Servo motor (SG90)', connector: 'SERVO PA10' },
  pt100: { label: 'PT100 probe', connector: 'TEMP' },
};

const PART_KIND: Record<PartKey, 'dc' | 'stepper' | 'servo' | 'pt100'> = { motor1: 'dc', motor2: 'dc', stepper: 'stepper', servo1: 'servo', servo2: 'servo', pt100: 'pt100' };

function pinTitle(pin: string, snap: SimSnapshot | null): string {
  const p: PinSnap | undefined = snap?.pins[pin];
  if (!p) return `${pin}`;
  let s = `${pin}: ${p.mode}`;
  if (p.af) s += ` (${p.af})`;
  if (p.pwm && p.pwm.freq > 0) s += ` — PWM ${p.pwm.freq >= 1000 ? (p.pwm.freq / 1000).toFixed(2) + ' kHz' : p.pwm.freq.toFixed(1) + ' Hz'}, duty ${(p.pwm.duty * 100).toFixed(1)}%`;
  else s += ` — ${p.level ? 'HIGH' : 'LOW'}`;
  return s;
}

const Silk = ({ x, y, children, size = 11, anchor = 'start', rot = 0, bold = false }: { x: number; y: number; children: React.ReactNode; size?: number; anchor?: 'start' | 'middle' | 'end'; rot?: number; bold?: boolean }) => (
  <text x={x} y={y} className="silk" fontSize={size} textAnchor={anchor} fontWeight={bold ? 700 : 500} transform={rot ? `rotate(${rot} ${x} ${y})` : undefined}>
    {children}
  </text>
);

function Terminal({ x, y, n, rot = 0, title }: { x: number; y: number; n: number; rot?: number; title?: string }) {
  const w = 22 * n;
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot})`}>
      {title && <title>{title}</title>}
      <rect x={-w / 2} y={-14} width={w} height={28} rx={2} className="terminal" />
      {Array.from({ length: n }, (_, i) => (
        <g key={i}>
          <circle cx={-w / 2 + 11 + i * 22} cy={0} r={7.5} className="screw" />
          <line x1={-w / 2 + 6 + i * 22} y1={0} x2={-w / 2 + 16 + i * 22} y2={0} className="screwslot" />
        </g>
      ))}
    </g>
  );
}

function Jst({ x, y, n, rot = 0, title }: { x: number; y: number; n: number; rot?: number; title?: string }) {
  const w = 16 * n + 8;
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot})`}>
      {title && <title>{title}</title>}
      <rect x={-w / 2} y={-11} width={w} height={22} rx={2} className="jst" />
      {Array.from({ length: n }, (_, i) => (
        <rect key={i} x={-w / 2 + 6 + i * 16} y={-5} width={8} height={9} className="jstpin" />
      ))}
    </g>
  );
}

function Led({ x, y, color, level, title }: { x: number; y: number; color: string; level: number; title?: string }) {
  const on = level > 0.02;
  return (
    <g>
      {title && <title>{title}</title>}
      {on && <circle cx={x} cy={y} r={14 + 6 * level} fill={color} opacity={0.35 * Math.min(1, level * 1.4)} filter="url(#glow)" />}
      <rect x={x - 6} y={y - 4} width={12} height={8} rx={1.5} fill={on ? color : '#e6e1cf'} stroke="#8a8670" strokeWidth={0.8} opacity={on ? 0.6 + 0.4 * level : 1} />
    </g>
  );
}

function Chip({ x, y, w, h, pins = 8, label, side = 'h' }: { x: number; y: number; w: number; h: number; pins?: number; label?: string; side?: 'h' | 'v' | 'q' }) {
  const legs: React.ReactNode[] = [];
  const per = pins / 2;
  if (side === 'h' || side === 'q') {
    for (let i = 0; i < per; i++) {
      const px = x - w / 2 + ((i + 0.5) * w) / per;
      legs.push(<rect key={`t${i}`} x={px - 1.5} y={y - h / 2 - 4} width={3} height={4} className="leg" />);
      legs.push(<rect key={`b${i}`} x={px - 1.5} y={y + h / 2} width={3} height={4} className="leg" />);
    }
  }
  if (side === 'v' || side === 'q') {
    for (let i = 0; i < per; i++) {
      const py = y - h / 2 + ((i + 0.5) * h) / per;
      legs.push(<rect key={`l${i}`} x={x - w / 2 - 4} y={py - 1.5} width={4} height={3} className="leg" />);
      legs.push(<rect key={`r${i}`} x={x + w / 2} y={py - 1.5} width={4} height={3} className="leg" />);
    }
  }
  return (
    <g>
      {legs}
      <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={2} className="chip" />
      <circle cx={x - w / 2 + 5} cy={y - h / 2 + 5} r={1.8} fill="#555" />
      {label && (
        <text x={x} y={y + 3} className="chiptext" textAnchor="middle" fontSize={8}>
          {label}
        </text>
      )}
    </g>
  );
}

function Cap({ x, y, r, label }: { x: number; y: number; r: number; label?: string }) {
  return (
    <g>
      <rect x={x - r - 2} y={y - r - 2} width={2 * r + 4} height={2 * r + 4} rx={3} fill="#1b1b1b" opacity={0.5} />
      <circle cx={x} cy={y} r={r} className="cap" />
      <path d={`M ${x - r} ${y} A ${r} ${r} 0 0 1 ${x - r * 0.4} ${y - r * 0.92}`} stroke="#1c2a4a" strokeWidth={r * 0.35} fill="none" opacity={0.9} />
      {label && (
        <text x={x} y={y + 4} textAnchor="middle" fontSize={r * 0.42} fill="#222" fontWeight={700}>
          {label}
        </text>
      )}
    </g>
  );
}

function Inductor({ x, y, s, label }: { x: number; y: number; s: number; label: string }) {
  return (
    <g>
      <rect x={x - s / 2} y={y - s / 2} width={s} height={s} rx={6} fill="#4a4a4a" stroke="#2a2a2a" />
      <rect x={x - s / 2 + 8} y={y - s / 2 + 8} width={s - 16} height={s - 16} rx={4} fill="#5c5c5c" />
      <text x={x} y={y + 7} textAnchor="middle" fontSize={20} fill="#999" fontWeight={700}>
        {label}
      </text>
    </g>
  );
}

function Header({ x, y, cols, rows, pitch = 10 }: { x: number; y: number; cols: number; rows: number; pitch?: number }) {
  return (
    <g>
      <rect x={x} y={y} width={cols * pitch} height={rows * pitch} fill="#151515" rx={1} />
      {Array.from({ length: cols * rows }, (_, i) => (
        <rect key={i} x={x + (i % cols) * pitch + pitch / 2 - 2} y={y + Math.floor(i / cols) * pitch + pitch / 2 - 2} width={4} height={4} fill="#b8a46a" />
      ))}
    </g>
  );
}

function Button({ x, y, pressed, color, onDown, onUp, title, size = 26 }: { x: number; y: number; pressed: boolean; color: string; onDown: () => void; onUp: () => void; title: string; size?: number }) {
  return (
    <g
      className="btn"
      onPointerDown={(e) => {
        (e.target as Element).setPointerCapture?.(e.pointerId);
        onDown();
      }}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <title>{title}</title>
      <rect x={x - size / 2} y={y - size / 2} width={size} height={size} rx={4} fill="#2b2b2b" stroke="#111" />
      <circle cx={x} cy={y + (pressed ? 1 : 0)} r={size * 0.32} fill={color} stroke="#000" strokeWidth={1} opacity={pressed ? 0.75 : 1} />
      {!pressed && <circle cx={x - size * 0.08} cy={y - size * 0.1} r={size * 0.1} fill="#fff" opacity={0.35} />}
    </g>
  );
}

// ---------------- parts ----------------
function DcMotorPart({ x, y, m, onDetach }: { x: number; y: number; m: BoardSnapshot['motors'][0]; onDetach: () => void }) {
  return (
    <g transform={`translate(${x} ${y})`} className="part">
      <rect x={0} y={-34} width={120} height={68} rx={10} fill="url(#metal)" stroke="#555" />
      <rect x={118} y={-26} width={44} height={52} rx={4} fill="#c9a227" stroke="#7a6118" />
      <rect x={-10} y={-10} width={12} height={20} fill="#777" />
      <g transform={`translate(205 0) rotate(${m.angle})`}>
        <circle r={36} fill="#222" stroke="#000" />
        <circle r={30} fill="#3a3a3a" />
        {[0, 60, 120, 180, 240, 300].map((a) => (
          <rect key={a} x={-3} y={-30} width={6} height={12} fill="#f0c419" transform={`rotate(${a})`} />
        ))}
        <circle r={6} fill="#bbb" />
        <rect x={-2} y={-34} width={4} height={10} fill="#ff4040" />
      </g>
      <rect x={160} y={-4} width={12} height={8} fill="#aaa" />
      <g className="readout" transform="translate(0 46)">
        <rect width={250} height={56} rx={6} />
        <text x={8} y={17}>
          {Math.abs(m.rpm).toFixed(0)} RPM {m.rpm > 1 ? '↻ fwd' : m.rpm < -1 ? '↺ rev' : ''}
        </text>
        <text x={8} y={33} className="small">
          {m.mode.toUpperCase()} · duty {(m.duty * 100).toFixed(0)}% · {m.pwmFreq ? (m.pwmFreq >= 1000 ? (m.pwmFreq / 1000).toFixed(1) + ' kHz' : m.pwmFreq.toFixed(0) + ' Hz') : 'no PWM'} · {m.volts.toFixed(1)} V · {m.current.toFixed(2)} A
        </text>
        <text x={8} y={49} className={m.note ? 'warn' : 'small'}>
          {m.note || `INA=${m.ina} INB=${m.inb}`}
        </text>
      </g>
      <g className="detach" onClick={onDetach}>
        <title>Disconnect</title>
        <circle cx={250} cy={-34} r={9} />
        <text x={250} y={-30} textAnchor="middle">×</text>
      </g>
    </g>
  );
}

function StepperPart({ x, y, s, onDetach }: { x: number; y: number; s: BoardSnapshot['stepper']; onDetach: () => void }) {
  return (
    <g transform={`translate(${x} ${y})`} className="part">
      <rect x={0} y={0} width={130} height={130} rx={10} fill="#2a2a2a" stroke="#000" />
      <rect x={8} y={8} width={114} height={114} rx={6} fill="url(#metal)" />
      {[
        [16, 16],
        [114, 16],
        [16, 114],
        [114, 114],
      ].map(([cx, cy]) => (
        <circle key={`${cx}${cy}`} cx={cx} cy={cy} r={4} fill="#333" />
      ))}
      <circle cx={65} cy={65} r={22} fill="#999" stroke="#555" />
      <g transform={`translate(65 65) rotate(${s.angle})`}>
        <rect x={-4} y={-46} width={8} height={46} fill="#ddd" stroke="#666" />
        <circle r={7} fill="#ccc" stroke="#666" />
        <polygon points="-7,-46 7,-46 0,-56" fill="#ff4040" />
      </g>
      {Array.from({ length: 20 }, (_, i) => (
        <line key={i} x1={65 + 58 * Math.sin((i * Math.PI) / 10)} y1={65 - 58 * Math.cos((i * Math.PI) / 10)} x2={65 + 63 * Math.sin((i * Math.PI) / 10)} y2={65 - 63 * Math.cos((i * Math.PI) / 10)} stroke="#ccc" strokeWidth={1.5} />
      ))}
      <g className="readout" transform="translate(-60 142)">
        <rect width={250} height={56} rx={6} />
        <text x={8} y={17}>
          {s.steps} steps · {s.angle.toFixed(1)}° · {s.dir ? 'DIR=1 (CW)' : 'DIR=0 (CCW)'}
        </text>
        <text x={8} y={33} className="small">
          1/{s.microstep} step · {s.rate.toFixed(0)} steps/s · nHOME {s.home ? 'LOW (home)' : 'HIGH'}
        </text>
        <text x={8} y={49} className={s.note ? 'warn' : 'small'}>
          {s.note || 'DRV8825 driver'}
        </text>
      </g>
      <g className="detach" onClick={onDetach}>
        <title>Disconnect</title>
        <circle cx={130} cy={0} r={9} />
        <text x={130} y={4} textAnchor="middle">×</text>
      </g>
    </g>
  );
}

function ServoPart({ x, y, s, onDetach, label }: { x: number; y: number; s: BoardSnapshot['servos'][0]; onDetach: () => void; label: string }) {
  const hornRot = s.angle - 90;
  return (
    <g transform={`translate(${x} ${y})`} className="part">
      <rect x={0} y={-24} width={110} height={48} rx={4} fill="#1f5fbf" stroke="#0f3a7a" />
      <rect x={-12} y={-6} width={134} height={12} rx={3} fill="#1f5fbf" stroke="#0f3a7a" />
      <text x={56} y={4} textAnchor="middle" fontSize={11} fill="#cfe0ff" fontWeight={700}>
        SG90
      </text>
      <circle cx={30} cy={-24} r={14} fill="#1f5fbf" stroke="#0f3a7a" />
      <g transform={`translate(30 -24) rotate(${hornRot})`}>
        <path d="M -6 0 L -4 -48 Q 0 -54 4 -48 L 6 0 Z" fill="#f4f4f4" stroke="#999" />
        <circle r={8} fill="#f4f4f4" stroke="#999" />
        <circle r={2.5} fill="#888" />
      </g>
      <g className="readout" transform="translate(-10 36)">
        <rect width={240} height={56} rx={6} />
        <text x={8} y={17}>
          {label}: {s.angle.toFixed(0)}° {s.target !== s.angle ? `→ ${s.target.toFixed(0)}°` : ''}
        </text>
        <text x={8} y={33} className="small">
          {s.signal ? `pulse ${s.pulseUs.toFixed(0)} µs @ ${s.freq.toFixed(1)} Hz` : 'no PWM signal'}
        </text>
        <text x={8} y={49} className={s.outOfRange || s.note ? 'warn' : 'small'}>
          {s.note || 'range 500–2500 µs → 0–180°'}
        </text>
      </g>
      <g className="detach" onClick={onDetach}>
        <title>Disconnect</title>
        <circle cx={122} cy={-26} r={9} />
        <text x={122} y={-22} textAnchor="middle">×</text>
      </g>
    </g>
  );
}

function Pt100Part({ x, y, tempC, volts, onDetach }: { x: number; y: number; tempC: number; volts: number; onDetach: () => void }) {
  const hot = Math.max(0, Math.min(1, (tempC - 20) / 130));
  const col = `rgb(${180 + 75 * hot}, ${180 - 120 * hot}, ${180 - 140 * hot})`;
  return (
    <g transform={`translate(${x} ${y})`} className="part">
      <rect x={0} y={-6} width={150} height={12} rx={6} fill={col} stroke="#666" />
      <rect x={150} y={-10} width={40} height={20} rx={4} fill="#333" />
      <g className="readout" transform="translate(0 16)">
        <rect width={200} height={40} rx={6} />
        <text x={8} y={17}>
          PT100: {tempC.toFixed(1)} °C · {(100 * (1 + 0.00385 * tempC)).toFixed(2)} Ω
        </text>
        <text x={8} y={33} className="small">
          PA0 = {volts.toFixed(3)} V
        </text>
      </g>
      <g className="detach" onClick={onDetach}>
        <title>Disconnect</title>
        <circle cx={-4} cy={-12} r={9} />
        <text x={-4} y={-8} textAnchor="middle">×</text>
      </g>
    </g>
  );
}

// ---------------- main ----------------
export function BoardView(props: BoardViewProps) {
  const { snap, inputs, parts, running, onInputs, onParts } = props;
  const [dragOver, setDragOver] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const b = snap?.board;
  const leds = running && b ? b.leds : { LED1: 0, LED2: 0, LED3: 0, LED4: 0, LD2: 0 };
  const power = inputs.power;
  const pt = (pin: string) => pinTitle(pin, snap);

  const slot = (key: PartKey, x: number, y: number, w: number, h: number) => {
    const kind = PART_KIND[key];
    const zone = (
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={8}
        className={`dropzone ${dragOver === key ? 'over' : ''} ${parts[key] ? 'hidden' : ''}`}
        onDragOver={(e) => {
          const k = e.dataTransfer.types.includes(`part/${kind}`);
          if (k) {
            e.preventDefault();
            setDragOver(key);
          }
        }}
        onDragLeave={() => setDragOver(null)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(null);
          onParts({ [key]: true });
        }}
      >
        <title>{`Drop a ${PART_SLOTS[key].label} here (${PART_SLOTS[key].connector})`}</title>
      </rect>
    );
    return (
      <g>
        {zone}
        {!parts[key] && (
          <text x={x + w / 2} y={y + h / 2 + 4} textAnchor="middle" className="dropzone-text">
            {PART_SLOTS[key].label} → {PART_SLOTS[key].connector}
          </text>
        )}
      </g>
    );
  };

  const motors = b?.motors;
  const servos = b?.servos;

  return (
    <svg ref={svgRef} className="boardsvg" viewBox="-300 -50 1620 1040" preserveAspectRatio="xMidYMid meet">
      <defs>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
        <linearGradient id="metal" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d8d8d8" />
          <stop offset="0.5" stopColor="#9a9a9a" />
          <stop offset="1" stopColor="#c8c8c8" />
        </linearGradient>
        <linearGradient id="pcb" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0f7a4f" />
          <stop offset="1" stopColor="#0b6a44" />
        </linearGradient>
        <pattern id="traces" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M0 20 H 18 L 26 12 H 40" stroke="#13895a" strokeWidth={2} fill="none" opacity={0.5} />
        </pattern>
      </defs>

      {/* wires for attached parts (under the board) */}
      <g className="wires">
        {parts.motor1 && <path d="M 965 339 C 1010 339, 1010 330, 1045 330" stroke="#c0392b" strokeWidth={4} fill="none" />}
        {parts.motor1 && <path d="M 965 345 C 1010 352, 1010 345, 1045 345" stroke="#111" strokeWidth={4} fill="none" />}
        {parts.motor2 && <path d="M 955 468 C 1010 468, 1010 520, 1045 520" stroke="#c0392b" strokeWidth={4} fill="none" />}
        {parts.motor2 && <path d="M 955 474 C 1010 480, 1010 535, 1045 535" stroke="#111" strokeWidth={4} fill="none" />}
        {parts.stepper && ['#c0392b', '#2c3e50', '#2471a3', '#27ae60'].map((c, i) => <path key={c} d={`M 965 ${150 + i * 9} C 1010 ${150 + i * 9}, 1010 ${70 + i * 9}, 1050 ${70 + i * 9}`} stroke={c} strokeWidth={3.5} fill="none" />)}
        {parts.servo1 && ['#8b4513', '#e74c3c', '#f39c12'].map((c, i) => <path key={c} d={`M 40 ${510 + i * 8} C -60 ${510 + i * 8}, -100 ${470 + i * 8}, -165 ${470 + i * 8}`} stroke={c} strokeWidth={3} fill="none" />)}
        {parts.servo2 && ['#8b4513', '#e74c3c', '#f39c12'].map((c, i) => <path key={c} d={`M 40 ${572 + i * 8} C -60 ${572 + i * 8}, -100 ${640 + i * 8}, -165 ${640 + i * 8}`} stroke={c} strokeWidth={3} fill="none" />)}
        {parts.pt100 && <path d="M 45 326 C 10 326, 0 300, -60 300" stroke="#ddd" strokeWidth={4} fill="none" />}
      </g>

      {/* ---------- carrier board ---------- */}
      <rect x={-18} y={-18} width={1036} height={966} rx={40} fill="#262626" />
      <rect x={0} y={0} width={1000} height={930} rx={26} fill="url(#pcb)" />
      <rect x={0} y={0} width={1000} height={930} rx={26} fill="url(#traces)" opacity={0.6} />
      {[
        [30, 30],
        [970, 30],
        [30, 900],
        [970, 900],
        [880, 40],
      ].map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={14} fill="#111" stroke="#c9b26b" strokeWidth={3} />
      ))}

      {/* Relay */}
      <Silk x={110} y={30} size={13} bold>
        RELAY
      </Silk>
      <g>
        <title>{pt('PB12')}</title>
        <Terminal x={128} y={52} n={2} title="Relay contacts (CN14)" />
        <Silk x={160} y={58} size={11}>
          PB12
        </Silk>
        <rect x={60} y={108} width={130} height={74} rx={4} fill="#1b1b1b" />
        <text x={125} y={142} textAnchor="middle" fill="#666" fontSize={11} transform="rotate(-3 125 142)">
          Panasonic
        </text>
        <rect x={60} y={108} width={130} height={74} rx={4} fill="none" stroke={b?.relay && running ? '#f1c40f' : 'transparent'} strokeWidth={2} />
        <text x={125} y={165} textAnchor="middle" fill={b?.relay && running ? '#f1c40f' : '#555'} fontSize={10} fontWeight={700}>
          {b?.relay && running ? 'CLICK — ON' : 'OFF'}
        </text>
        <circle cx={218} cy={122} r={12} fill="#111" />
        <Led x={210} y={190} color="#ff3b3b" level={leds.LED4} title="LED4 — relay energised" />
        <Silk x={200} y={208} size={9}>
          LED4
        </Silk>
      </g>

      {/* LEDs */}
      <Led x={110} y={239} color="#ff3b3b" level={leds.LED1} title={`LED1 — ${pt('PB7')}`} />
      <Silk x={100} y={243} size={9} anchor="end">LED1</Silk>
      <Silk x={128} y={244} size={12} bold>PB7</Silk>
      <Led x={110} y={261} color="#ffb000" level={leds.LED2} title={`LED2 — ${pt('PC13')}`} />
      <Silk x={100} y={265} size={9} anchor="end">LED2</Silk>
      <Silk x={128} y={266} size={12} bold>PC13</Silk>
      <Led x={110} y={283} color="#2ecc71" level={leds.LED3} title={`LED3 — ${pt('PC14')}`} />
      <Silk x={100} y={287} size={9} anchor="end">LED3</Silk>
      <Silk x={128} y={288} size={12} bold>PC14</Silk>

      {/* TEMP */}
      <g>
        <title>{`PT100 input — ${pt('PA0')}`}</title>
        <Silk x={36} y={350} size={13} rot={-90} bold>TEMP</Silk>
        <Jst x={62} y={326} n={2} rot={90} />
        <Silk x={52} y={302} size={12} bold>PA0</Silk>
        <Silk x={84} y={318} size={11}>+</Silk>
        <Silk x={84} y={340} size={11}>-</Silk>
      </g>
      {slot('pt100', -290, 280, 260, 70)}

      {/* LDR */}
      <g>
        <title>{`LDR (light sensor) — ${pt('PA1')} — click the light slider to change`}</title>
        <Silk x={30} y={420} size={13} rot={-90} bold>LDR</Silk>
        <circle cx={64} cy={402} r={13} fill="#d35400" stroke="#7e3200" />
        <path d="M 56 396 q 4 -4 8 0 t 8 0 M 56 402 q 4 -4 8 0 t 8 0 M 56 408 q 4 -4 8 0 t 8 0" stroke="#3b1d00" strokeWidth={1.2} fill="none" />
        <circle cx={64} cy={402} r={22} fill="#fff6a0" opacity={(inputs.light / 100) * 0.55} filter="url(#glow)" />
        <Silk x={56} y={438} size={12} bold>PA1</Silk>
      </g>

      {/* Servo headers */}
      <g>
        <title>{`Servo header CN1 — ${pt('PB3')}`}</title>
        <Silk x={30} y={640} size={13} rot={-90} bold>SERVO MOTOR</Silk>
        <Jst x={62} y={518} n={3} rot={90} />
        <Silk x={84} y={505} size={11} bold>PB3</Silk>
        <Silk x={84} y={522} size={11}>6.5V</Silk>
        <Silk x={84} y={539} size={11}>GND</Silk>
      </g>
      <g>
        <title>{`Servo header CN2 — ${pt('PA10')}`}</title>
        <Jst x={62} y={580} n={3} rot={90} />
        <Silk x={84} y={567} size={11} bold>PA10</Silk>
        <Silk x={84} y={584} size={11}>6.5V</Silk>
        <Silk x={84} y={601} size={11}>GND</Silk>
      </g>
      {slot('servo1', -290, 420, 260, 110)}
      {slot('servo2', -290, 580, 260, 130)}

      {/* 6.5V terminal */}
      <Led x={70} y={660} color="#2ecc71" level={power ? 1 : 0} title="6.5 V rail" />
      <Terminal x={72} y={690} n={2} rot={90} title="6.5 V output" />
      <Silk x={30} y={696} size={12} bold>6.5V</Silk>

      {/* connectors row */}
      <Silk x={170} y={572} size={13} bold>ENCODER1</Silk>
      <Silk x={250} y={572} size={13} bold>ENCODER2</Silk>
      <Silk x={340} y={562} size={13} bold>ULTRASONIC</Silk>
      <Silk x={455} y={562} size={13} bold>I2C</Silk>
      <Silk x={575} y={584} size={13} bold>MPU6050</Silk>
      <Jst x={200} y={597} n={4} />
      <Jst x={276} y={597} n={4} />
      <Jst x={372} y={597} n={4} />
      <Jst x={470} y={597} n={4} />
      {[
        [178, ['5V', 'PA4', 'PB0', 'GND']],
        [254, ['5V', 'PC1', 'PC0', 'GND']],
        [350, ['5V', 'PA9', 'PA8', 'GND']],
        [448, ['3V3', 'PB8', 'PB9', 'GND']],
      ].map(([x0, labels]) =>
        (labels as string[]).map((l, i) => (
          <g key={`${x0}-${l}`}>
            {/^P/.test(l) && <title>{pt(l)}</title>}
            <Silk x={(x0 as number) + i * 16 + 4} y={640} size={10} rot={-90} bold={/^P/.test(l)}>
              {l}
            </Silk>
          </g>
        )),
      )}
      <Silk x={355} y={578} size={8}>TRIG ECHO</Silk>
      <Silk x={470} y={578} size={9}>SCL SDA</Silk>
      <Header x={560} y={600} cols={8} rows={1} pitch={11} />
      {['3V3', 'GND', 'SCL', 'SDA'].map((l, i) => (
        <Silk key={l} x={570 + i * 14} y={650} size={9} rot={-90}>
          {l}
        </Silk>
      ))}
      <Silk x={600} y={594} size={9}>PB8 PB9</Silk>

      {/* buttons SW1 SW2 */}
      <g>
        <Button x={745} y={562} pressed={inputs.sw1} color="#222" onDown={() => onInputs({ sw1: true })} onUp={() => onInputs({ sw1: false })} title={`SW1 — ${pt('PB13')} (press and hold)`} />
        <Silk x={745} y={600} size={13} anchor="middle" bold>PB13</Silk>
        <Button x={818} y={562} pressed={inputs.sw2} color="#222" onDown={() => onInputs({ sw2: true })} onUp={() => onInputs({ sw2: false })} title={`SW2 — ${pt('PB14')} (press and hold)`} />
        <Silk x={818} y={600} size={13} anchor="middle" bold>PB14</Silk>
        <Silk x={735} y={540} size={8}>SW1</Silk>
        <Silk x={808} y={540} size={8}>SW2</Silk>
      </g>

      {/* stepper section */}
      <g>
        <title>{`DRV8825 stepper driver — DIR ${pt('PA7')} | STEP ${pt('PA6')} | nHOME ${pt('PC5')}`}</title>
        {[
          ['DIR', 'PA7'],
          ['STP', 'PA6'],
          ['HOME', 'PC5'],
          ['M2', 'PB5'],
          ['M1', 'PA5'],
          ['M0', 'PC9'],
        ].map(([n, p], i) => (
          <g key={n}>
            <title>{pt(p)}</title>
            <Silk x={760} y={70 + i * 14} size={11} anchor="end" bold>
              {n}
            </Silk>
            <Silk x={790} y={70 + i * 14} size={11} bold>
              {p}
            </Silk>
          </g>
        ))}
        <Chip x={805} y={190} w={50} h={64} pins={28} side="v" label="DRV8825" />
        <Cap x={880} y={110} r={16} label="100" />
      </g>
      <Terminal x={950} y={162} n={4} rot={90} title="Stepper motor terminal (CN11): A+ A- B- B+" />
      <Silk x={985} y={250} size={13} rot={-90} bold>STEPPER MOTOR</Silk>
      {slot('stepper', 1040, 10, 220, 250)}

      {/* motor drivers */}
      <g>
        <title>{`MOTOR1 H-bridge — PWM ${pt('PC8')} | INA ${pt('PB6')} | INB ${pt('PC7')} | CS ${pt('PC2')}`}</title>
        <Cap x={725} y={260} r={26} label="220" />
        <Chip x={790} y={265} w={50} h={36} pins={16} side="h" label="VNH" />
        {[
          ['PWM', 'PC8'],
          ['CS', 'PC2'],
          ['INB', 'PC7'],
          ['INA', 'PB6'],
        ].map(([n, p], i) => (
          <g key={n}>
            <title>{pt(p)}</title>
            <Silk x={872} y={278 + i * 14} size={11} anchor="end" bold>
              {n}
            </Silk>
            <Silk x={880} y={278 + i * 14} size={11} bold>
              {p}
            </Silk>
          </g>
        ))}
      </g>
      <Terminal x={950} y={342} n={2} rot={90} title="MOTOR1 terminal (CN9)" />
      <Silk x={985} y={380} size={13} rot={-90} bold>MOTOR1</Silk>
      <g>
        <title>{`MOTOR2 H-bridge — PWM ${pt('PC6')} | INA ${pt('PB10')} | INB ${pt('PB4')} | CS ${pt('PC3')}`}</title>
        <Cap x={725} y={392} r={26} label="220" />
        <Chip x={790} y={395} w={50} h={36} pins={16} side="h" label="VNH" />
        {[
          ['PWM', 'PC6'],
          ['CS', 'PC3'],
          ['INB', 'PB4'],
          ['INA', 'PB10'],
        ].map(([n, p], i) => (
          <g key={n}>
            <title>{pt(p)}</title>
            <Silk x={872} y={404 + i * 14} size={11} anchor="end" bold>
              {n}
            </Silk>
            <Silk x={880} y={404 + i * 14} size={11} bold>
              {p}
            </Silk>
          </g>
        ))}
      </g>
      <Terminal x={943} y={470} n={2} rot={90} title="MOTOR2 terminal (CN10)" />
      <Silk x={985} y={520} size={13} rot={-90} bold>MOTOR2</Silk>
      {slot('motor1', 1040, 270, 230, 160)}
      {slot('motor2', 1040, 450, 230, 160)}

      {/* power section */}
      <Cap x={190} y={730} r={30} label="330" />
      <Cap x={420} y={730} r={30} label="330" />
      <Chip x={160} y={800} w={26} h={30} pins={8} side="v" />
      <Chip x={390} y={790} w={26} h={30} pins={8} side="v" />
      <Inductor x={240} y={810} s={78} label="150" />
      <Inductor x={470} y={810} s={78} label="150" />
      <Cap x={140} y={860} r={20} label="100" />
      <Cap x={340} y={850} r={18} label="100" />
      <Header x={520} y={680} cols={8} rows={2} pitch={12} />
      {['GND', 'GND', 'GND', 'GND', 'GND', 'GND', 'GND', 'GND'].map((l, i) => (
        <Silk key={`g${i}`} x={530 + i * 12} y={676} size={8} rot={-90}>
          {l}
        </Silk>
      ))}
      {['5V', '5V', '5V', '5V', '5V', '5V', '3V3', '3V3'].map((l, i) => (
        <Silk key={`v${i}`} x={530 + i * 12} y={735} size={8} rot={-90}>
          {l}
        </Silk>
      ))}
      <Chip x={705} y={720} w={30} h={22} pins={4} side="h" />
      <Chip x={760} y={665} w={34} h={40} pins={4} side="h" />
      {[
        [596, '5V'],
        [690, '3.3V'],
        [780, '12V'],
      ].map(([x0, l]) => (
        <g key={l as string}>
          <Led x={(x0 as number) - 36} y={830} color="#2ecc71" level={power ? 1 : 0} title={`${l} rail LED`} />
          <Terminal x={x0 as number} y={830} n={2} title={`${l} output`} />
          <Silk x={x0 as number} y={872} size={14} anchor="middle" bold>
            {l}
          </Silk>
          <Silk x={(x0 as number) - 10} y={808} size={10}>
            + −
          </Silk>
        </g>
      ))}
      {/* DC jack and power switch */}
      <g>
        <title>12 V DC input</title>
        <rect x={930} y={650} width={70} height={50} rx={6} fill="#151515" />
        <circle cx={985} cy={675} r={12} fill="#333" />
        <rect x={1000} y={662} width={40} height={26} rx={6} fill="#151515" />
        <path d="M 1040 675 C 1080 675, 1100 700, 1130 700" stroke="#111" strokeWidth={10} fill="none" />
      </g>
      <g className="btn" onClick={() => onInputs({ power: !power })}>
        <title>{`Power switch SW3 — ${power ? 'ON' : 'OFF'} (click to toggle)`}</title>
        <rect x={925} y={735} width={70} height={95} rx={6} fill="#111" stroke="#000" />
        <rect x={935} y={745} width={50} height={75} rx={4} fill="#222" />
        <rect x={938} y={power ? 748 : 782} width={44} height={36} rx={3} fill={power ? '#3a3a3a' : '#1a1a1a'} stroke="#555" />
        <text x={960} y={power ? 770 : 805} textAnchor="middle" fill={power ? '#e74c3c' : '#666'} fontSize={12} fontWeight={700}>
          {power ? 'I' : 'O'}
        </text>
        <Silk x={960} y={850} size={11} anchor="middle" bold>
          SW3 {power ? 'ON' : 'OFF'}
        </Silk>
      </g>

      {/* ---------- Nucleo ---------- */}
      <NucleoBoard snap={snap} inputs={inputs} running={running} flashing={!!props.flashing} ld2={leds.LD2} onInputs={onInputs} onReset={props.onReset} />

      {/* ---------- parts ---------- */}
      {parts.motor1 && motors && <DcMotorPart x={1050} y={330} m={motors[0]} onDetach={() => onParts({ motor1: false })} />}
      {parts.motor1 && !motors && <DcMotorPart x={1050} y={330} m={{ attached: true, rpm: 0, angle: 0, volts: 0, duty: 0, pwmFreq: 0, current: 0, mode: 'off', ina: 0, inb: 0, note: 'Not running' }} onDetach={() => onParts({ motor1: false })} />}
      {parts.motor2 && <DcMotorPart x={1050} y={525} m={motors?.[1] ?? { attached: true, rpm: 0, angle: 0, volts: 0, duty: 0, pwmFreq: 0, current: 0, mode: 'off', ina: 0, inb: 0, note: 'Not running' }} onDetach={() => onParts({ motor2: false })} />}
      {parts.stepper && <StepperPart x={1055} y={15} s={b?.stepper ?? { attached: true, angle: 0, steps: 0, microstep: 1, dir: 0, home: true, rate: 0, stalled: false, note: 'Not running' }} onDetach={() => onParts({ stepper: false })} />}
      {parts.servo1 && <ServoPart x={-285} y={470} label="Servo PB3" s={servos?.[0] ?? { attached: true, angle: 90, target: 90, pulseUs: 0, freq: 0, signal: false, outOfRange: false, note: 'Not running' }} onDetach={() => onParts({ servo1: false })} />}
      {parts.servo2 && <ServoPart x={-285} y={640} label="Servo PA10" s={servos?.[1] ?? { attached: true, angle: 90, target: 90, pulseUs: 0, freq: 0, signal: false, outOfRange: false, note: 'Not running' }} onDetach={() => onParts({ servo2: false })} />}
      {parts.pt100 && <Pt100Part x={-270} y={300} tempC={inputs.tempC} volts={b?.ptVolts ?? 0} onDetach={() => onParts({ pt100: false })} />}

      {/* light source over LDR */}
      <g opacity={0.9} pointerEvents="none">
        <circle cx={64} cy={402} r={36 + inputs.light * 0.3} fill="none" stroke="#fff3a0" strokeDasharray="3 6" opacity={inputs.light / 140} />
      </g>
    </svg>
  );
}

function NucleoBoard({ snap, inputs, running, flashing, ld2, onInputs, onReset }: { snap: SimSnapshot | null; inputs: BoardInputs; running: boolean; flashing: boolean; ld2: number; onInputs: (p: Partial<BoardInputs>) => void; onReset?: () => void }) {
  const X = 262;
  const Y = 34;
  const W = 406;
  const H = 478;
  const pt = (pin: string) => pinTitle(pin, snap);
  return (
    <g>
      <rect x={X} y={Y} width={W} height={H} rx={8} fill="#f7f7f5" stroke="#cfcfcf" />
      {/* ST-LINK section */}
      <rect x={X} y={Y} width={W} height={140} rx={8} fill="#fbfbfa" />
      <line x1={X} y1={Y + 140} x2={X + W} y2={Y + 140} stroke="#222" strokeWidth={3} strokeDasharray="60 8" />
      <rect x={X + 200} y={Y - 6} width={50} height={36} rx={3} fill="#b8b8b8" stroke="#777" />
      <rect x={X + 210} y={Y - 2} width={30} height={10} fill="#555" />
      <path d={`M ${X + 225} ${Y - 6} C ${X + 225} ${Y - 60}, ${X + 235} ${Y - 60}, ${X + 240} ${Y - 90}`} stroke="#1e3a8a" strokeWidth={5} fill="none" />
      <text x={X + 262} y={Y + 26} fontSize={9} fill="#333">
        USB PWR
      </text>
      <text x={X + 215} y={Y + 44} fontSize={8} fill="#555">
        CN1
      </text>
      <Chip x={X + 180} y={Y + 85} w={40} h={40} pins={48} side="q" />
      <rect x={X + 135} y={Y + 70} width={26} height={34} rx={10} fill="#ddd" stroke="#999" />
      <Header x={X + 50} y={Y + 46} cols={1} rows={6} pitch={10} />
      <text x={X + 18} y={Y + 40} fontSize={8} fill="#333">
        GND
      </text>
      <text x={X + 52} y={Y + 40} fontSize={8} fill="#333">
        SWD
      </text>
      <rect x={X + 18} y={Y + 115} width={30} height={14} rx={2} fill="#e8e8e8" stroke="#bbb" />
      <text x={X + 33} y={Y + 125} fontSize={7} textAnchor="middle" fill="#3366cc" fontWeight={700}>
        nucleo
      </text>
      <rect x={X + 85} y={Y + 12} width={14} height={30} fill="#222" />
      <text x={X + 105} y={Y + 30} fontSize={7} fill="#333">
        ST-LINK
      </text>
      {/* LD1 COM */}
      <g>
        <title>LD1 COM — ST-LINK communication</title>
        <rect x={X + 318} y={Y + 40} width={12} height={10} rx={2} fill={flashing ? '#ff3b3b' : running ? '#2ecc71' : '#d84a3a'} />
        {flashing && <circle cx={X + 324} cy={Y + 45} r={14} fill="#ff3b3b" opacity={0.4} filter="url(#glow)" className="blink" />}
        <text x={X + 314} y={Y + 64} fontSize={8} fill="#333">
          COM
        </text>
        <text x={X + 318} y={Y + 34} fontSize={8} fill="#333">
          LD1
        </text>
      </g>
      <Chip x={X + 320} y={Y + 110} w={28} h={20} pins={8} side="h" />
      <polygon points={`${X + 360},${Y + 60} ${X + 385},${Y + 60} ${X + 372},${Y + 40}`} fill="#3a6fcf" />
      {/* MCU section */}
      <text x={X + 70} y={Y + 175} fontSize={10} fill="#333">
        MB1136
      </text>
      <text x={X + 70} y={Y + 187} fontSize={9} fill="#333">
        rev C
      </text>
      <g>
        <Button x={X + 145} y={Y + 165} size={34} pressed={inputs.b1} color="#2f6fd6" onDown={() => onInputs({ b1: true })} onUp={() => onInputs({ b1: false })} title={`B1 USER — ${pt('PC13')} (press and hold)`} />
        <text x={X + 108} y={Y + 152} fontSize={9} fill="#333">
          USER
        </text>
        <text x={X + 118} y={Y + 190} fontSize={8} fill="#333">
          B1
        </text>
      </g>
      <g>
        <Button x={X + 250} y={Y + 165} size={34} pressed={false} color="#111" onDown={() => onReset?.()} onUp={() => undefined} title="B2 RESET — restarts the program" />
        <text x={X + 272} y={Y + 152} fontSize={9} fill="#333">
          RESET
        </text>
        <text x={X + 270} y={Y + 190} fontSize={8} fill="#333">
          B2
        </text>
      </g>
      <Chip x={X + 190} y={Y + 330} w={70} h={70} pins={64} side="q" label="STM32F401RE" />
      <rect x={X + 165} y={Y + 425} width={50} height={20} rx={2} fill="#222" />
      <rect x={X + 230} y={Y + 428} width={36} height={14} rx={7} fill="none" stroke="#bbb" />
      {/* LD2 user led and LD3 power */}
      <g>
        <title>{`LD2 (green user LED) — ${pt('PA5')}`}</title>
        {ld2 > 0.02 && <circle cx={X + 252} cy={Y + 250} r={16} fill="#2ecc71" opacity={0.5 * ld2} filter="url(#glow)" />}
        <rect x={X + 246} y={Y + 245} width={12} height={10} rx={2} fill={ld2 > 0.02 ? '#4cff8a' : '#cfe8d4'} stroke="#7aa" />
        <text x={X + 240} y={Y + 270} fontSize={8} fill="#333">
          LD2
        </text>
      </g>
      <g>
        <title>LD3 PWR (5 V from USB)</title>
        <rect x={X + 96} y={Y + 245} width={12} height={10} rx={2} fill="#ff3b3b" />
        <circle cx={X + 102} cy={Y + 250} r={10} fill="#ff3b3b" opacity={0.35} filter="url(#glow)" />
        <text x={X + 92} y={Y + 270} fontSize={8} fill="#333">
          LD3
        </text>
      </g>
      {/* morpho headers */}
      <Header x={X + 12} y={Y + 175} cols={2} rows={19} pitch={14} />
      <Header x={X + W - 40} y={Y + 175} cols={2} rows={19} pitch={14} />
      <Header x={X + 50} y={Y + 245} cols={1} rows={8} pitch={14} />
      <Header x={X + 50} y={Y + 370} cols={1} rows={6} pitch={14} />
      <Header x={X + W - 62} y={Y + 170} cols={1} rows={10} pitch={14} />
      <Header x={X + W - 62} y={Y + 320} cols={1} rows={8} pitch={14} />
      {['SCL/D15', 'SDA/D14', 'AVDD', 'GND', 'SCK/D13', 'MISO/D12', 'PWM/MOSI/D11', 'PWM/CS/D10', 'PWM/D9', 'D8'].map((l, i) => (
        <text key={l} x={X + W - 66} y={Y + 180 + i * 14} fontSize={7} textAnchor="end" fill="#333">
          {l}
        </text>
      ))}
      {['D7', 'PWM/D6', 'PWM/D5', 'D4', 'PWM/D3', 'D2', 'TX/D1', 'RX/D0'].map((l, i) => (
        <text key={l} x={X + W - 66} y={Y + 330 + i * 14} fontSize={7} textAnchor="end" fill="#333">
          {l}
        </text>
      ))}
      {['IOREF', 'NRST', '3V3', '5V', 'GND', 'GND', 'VIN'].map((l, i) => (
        <text key={l + i} x={X + 68} y={Y + 270 + i * 14} fontSize={7} fill="#333">
          {l}
        </text>
      ))}
      {['A0', 'A1', 'A2', 'A3', 'A4', 'A5'].map((l, i) => (
        <text key={l} x={X + 68} y={Y + 380 + i * 14} fontSize={7} fill="#333">
          {l}
        </text>
      ))}
      <text x={X + 270} y={Y + 445} fontSize={30} fontWeight={800} fill="#2a5db0" fontStyle="italic">
        ST
      </text>
      <text x={X + 150} y={Y + 470} fontSize={8} fill="#555">
        www.st.com/stm32nucleo
      </text>
    </g>
  );
}
