import { useEffect, useMemo, useRef, useState } from "react";
import type { Tick } from "@/hooks/use-deriv-ticks";
import { lastDigit } from "@/hooks/use-deriv-ticks";

/* ============================================================
 *  Shared helpers
 * ========================================================== */

function useDigitWindow(ticks: Tick[], windowSize: number) {
  return useMemo(() => {
    const slice = ticks.slice(-windowSize);
    const digits = slice.map((t) => lastDigit(t.quote, t.pip_size));
    return { slice, digits };
  }, [ticks, windowSize]);
}

function polarToXY(cx: number, cy: number, r: number, angleDeg: number) {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const;
}

/** SVG arc path for a donut slice, given start/end angles in degrees (0 = top, clockwise). */
function donutSlicePath(cx: number, cy: number, rOuter: number, rInner: number, startDeg: number, endDeg: number) {
  const [x1, y1] = polarToXY(cx, cy, rOuter, startDeg);
  const [x2, y2] = polarToXY(cx, cy, rOuter, endDeg);
  const [x3, y3] = polarToXY(cx, cy, rInner, endDeg);
  const [x4, y4] = polarToXY(cx, cy, rInner, startDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return [
    `M${x1.toFixed(2)},${y1.toFixed(2)}`,
    `A${rOuter},${rOuter} 0 ${large} 1 ${x2.toFixed(2)},${y2.toFixed(2)}`,
    `L${x3.toFixed(2)},${y3.toFixed(2)}`,
    `A${rInner},${rInner} 0 ${large} 0 ${x4.toFixed(2)},${y4.toFixed(2)}`,
    "Z",
  ].join(" ");
}

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-3 h-full flex flex-col relative overflow-hidden">
      <div className="absolute top-0 left-4 right-4 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
      <div className="flex items-baseline justify-between mb-2.5">
        <h2
          className="text-[9px] uppercase tracking-[0.25em] text-muted-foreground/80"
          style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 500 }}
        >
          {title}
        </h2>
        {subtitle && <span className="text-[9px] text-muted-foreground/60 tabular-nums font-mono">{subtitle}</span>}
      </div>
      <div className="flex-1 min-h-0">{children}</div>
    </section>
  );
}

/* ============================================================
 *  1. Digit Wheel — radial donut, real digit frequency 0-9
 * ========================================================== */

const DIGIT_COLORS = [
  "#22d3ee", "#34d399", "#a3e635", "#fbbf24", "#fb923c",
  "#f87171", "#f472b6", "#c084fc", "#818cf8", "#60a5fa",
];

export function DigitWheel({ ticks, windowSize }: { ticks: Tick[]; windowSize: number }) {
  const { digits } = useDigitWindow(ticks, windowSize);

  const { counts, total, hot, cold } = useMemo(() => {
    const c = Array(10).fill(0) as number[];
    digits.forEach((d) => (c[d] += 1));
    const t = digits.length || 1;
    const max = Math.max(...c);
    const min = Math.min(...c);
    return { counts: c, total: t, hot: c.indexOf(max), cold: digits.length >= 10 ? c.indexOf(min) : -1 };
  }, [digits]);

  const SIZE = 200;
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const rOuter = 92;
  const rInner = 56;
  const gap = 1.4; // degrees of gap between slices

  let angle = 0;
  const slices = counts.map((c, d) => {
    const pct = c / total;
    const sweep = pct * 360;
    const start = angle + gap / 2;
    const end = angle + sweep - gap / 2;
    angle += sweep;
    const mid = (start + end) / 2;
    const labelR = (rOuter + rInner) / 2;
    const [lx, ly] = polarToXY(cx, cy, labelR, mid);
    return {
      d,
      pct: pct * 100,
      path: end > start ? donutSlicePath(cx, cy, rOuter, rInner, start, end) : "",
      lx,
      ly,
      isHot: d === hot && c > 0,
      isCold: d === cold,
    };
  });

  return (
    <Panel title="Digit Wheel" subtitle={`n = ${digits.length}`}>
      <div className="flex items-center gap-3 h-full">
        <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
          <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full h-full">
            {/* expected-uniform reference ring */}
            <circle cx={cx} cy={cy} r={(rOuter + rInner) / 2} fill="none" stroke="var(--color-border)" strokeWidth={rOuter - rInner} opacity={0.08} />
            {slices.map((s) => (
              <path
                key={s.d}
                d={s.path}
                fill={s.isHot ? "var(--color-bull)" : s.isCold ? "var(--color-bear)" : DIGIT_COLORS[s.d]}
                opacity={s.isHot || s.isCold ? 0.95 : 0.55}
                stroke="var(--color-card)"
                strokeWidth={1}
              />
            ))}
            {slices.map((s) =>
              s.pct >= 4 ? (
                <text
                  key={`lbl-${s.d}`}
                  x={s.lx}
                  y={s.ly}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize="9"
                  fontFamily="'JetBrains Mono', monospace"
                  fill="var(--color-card)"
                  fontWeight={700}
                >
                  {s.d}
                </text>
              ) : null
            )}
          </svg>
          {/* center readout */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-[8px] uppercase tracking-widest text-muted-foreground">Hot</span>
            <span className="text-2xl font-bold tabular-nums text-bull leading-none" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              {digits.length ? hot : "—"}
            </span>
            <span className="text-[9px] tabular-nums text-muted-foreground/70 mt-0.5">
              {digits.length ? `${((counts[hot] / total) * 100).toFixed(1)}%` : ""}
            </span>
          </div>
        </div>
        {/* legend */}
        <div className="flex-1 min-w-0 grid grid-cols-2 gap-x-2 gap-y-1">
          {counts.map((c, d) => (
            <div key={d} className="flex items-center gap-1.5 text-[10px] tabular-nums">
              <span className="size-2 rounded-full shrink-0" style={{ background: d === hot ? "var(--color-bull)" : d === cold ? "var(--color-bear)" : DIGIT_COLORS[d] }} />
              <span className="text-muted-foreground w-3">{d}</span>
              <span className="text-foreground/90">{((c / total) * 100).toFixed(1)}%</span>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-1 flex items-center justify-between text-[9px] uppercase tracking-widest text-muted-foreground">
        <span>Expected 10.0% / digit</span>
        <span>Live tick stream</span>
      </div>
    </Panel>
  );
}

/* ============================================================
 *  2. Volatility Gauge — semicircular arc, real σ vs recent/older
 * ========================================================== */

export function VolatilityGauge({ ticks, windowSize }: { ticks: Tick[]; windowSize: number }) {
  const slice = ticks.slice(-windowSize);

  const v = useMemo(() => {
    if (slice.length < 10) return null;
    const rets: number[] = [];
    for (let i = 1; i < slice.length; i++) rets.push((slice[i].quote - slice[i - 1].quote) / slice[i - 1].quote);
    const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
    const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length;
    const sigma = Math.sqrt(variance);

    const half = Math.floor(rets.length / 2);
    const recent = rets.slice(half);
    const older = rets.slice(0, half);
    const stdev = (a: number[]) => {
      const m = a.reduce((x, y) => x + y, 0) / a.length;
      return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length);
    };
    const sR = stdev(recent);
    const sO = stdev(older);
    const regime: "EXPANDING" | "COMPRESSING" | "STABLE" =
      sR > sO * 1.2 ? "EXPANDING" : sR < sO * 0.8 ? "COMPRESSING" : "STABLE";

    const windowSigmas: number[] = [];
    const step = 10;
    for (let end = step + 1; end <= rets.length; end += step) {
      windowSigmas.push(stdev(rets.slice(Math.max(0, end - step), end)));
    }
    const maxSigma = Math.max(...windowSigmas, sigma, 1e-9);
    const gaugePct = Math.min(100, (sigma / maxSigma) * 100);

    return { sigma, sR, sO, regime, gaugePct };
  }, [slice]);

  const SIZE = 200;
  const cx = SIZE / 2;
  const cy = SIZE * 0.62;
  const r = 80;
  const trackWidth = 14;
  const startA = -90;
  const endA = 90;
  const pct = v ? v.gaugePct : 0;
  const needleA = startA + (pct / 100) * (endA - startA);

  const trackPath = donutSlicePathArc(cx, cy, r, trackWidth, startA, endA);
  const fillPath = pct > 0 ? donutSlicePathArc(cx, cy, r, trackWidth, startA, needleA) : "";

  const regimeColor = v?.regime === "EXPANDING" ? "var(--color-warn)" : v?.regime === "COMPRESSING" ? "var(--color-accent)" : "var(--color-muted-foreground)";

  return (
    <Panel title="Volatility Gauge" subtitle={`n = ${slice.length}`}>
      {!v ? (
        <div className="text-xs text-muted-foreground">Waiting for data…</div>
      ) : (
        <div className="flex flex-col items-center h-full justify-center gap-1">
          <div className="relative" style={{ width: SIZE, height: SIZE * 0.66 }}>
            <svg viewBox={`0 0 ${SIZE} ${SIZE * 0.68}`} className="w-full h-full overflow-visible">
              <path d={trackPath} fill="var(--color-secondary)" opacity={0.5} />
              {fillPath && <path d={fillPath} fill={regimeColor} opacity={0.85} />}
              {(() => {
                const [nx, ny] = polarToXY(cx, cy, r + trackWidth / 2 + 8, needleA);
                const [bx1, by1] = polarToXY(cx, cy, 6, needleA - 90);
                const [bx2, by2] = polarToXY(cx, cy, 6, needleA + 90);
                return (
                  <>
                    <path d={`M${bx1},${by1} L${nx},${ny} L${bx2},${by2} Z`} fill="var(--color-foreground)" opacity={0.9} />
                    <circle cx={cx} cy={cy} r={5} fill="var(--color-foreground)" />
                  </>
                );
              })()}
            </svg>
            <div className="absolute bottom-0 left-0 right-0 flex flex-col items-center">
              <span className="text-xl font-bold tabular-nums leading-none" style={{ fontFamily: "'JetBrains Mono', monospace", color: regimeColor }}>
                {(v.sigma * 100).toFixed(4)}%
              </span>
              <span className="text-[8px] uppercase tracking-widest text-muted-foreground mt-0.5">σ this window</span>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-1.5 text-[10px] w-full mt-1">
            <MiniStat label="σ recent" value={`${(v.sR * 100).toFixed(3)}%`} />
            <MiniStat label="σ older" value={`${(v.sO * 100).toFixed(3)}%`} />
            <MiniStat label="Regime" value={v.regime} valueColor={regimeColor} />
          </div>
        </div>
      )}
    </Panel>
  );
}

function donutSlicePathArc(cx: number, cy: number, r: number, width: number, startDeg: number, endDeg: number) {
  return donutSlicePath(cx, cy, r + width / 2, r - width / 2, startDeg, endDeg);
}

function MiniStat({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div className="rounded border border-border bg-secondary/40 px-1.5 py-1 text-center">
      <div className="text-[8px] uppercase tracking-widest text-muted-foreground truncate">{label}</div>
      <div className="tabular-nums truncate font-semibold" style={{ color: valueColor }}>
        {value}
      </div>
    </div>
  );
}

/* ============================================================
 *  3. Tick Pulse Ring — live countdown ring, real tick arrival
 * ========================================================== */

export function TickPulseRing({ ticks }: { ticks: Tick[] }) {
  const lastEpoch = ticks[ticks.length - 1]?.epoch;
  const lastDigitVal = ticks.length ? lastDigit(ticks[ticks.length - 1].quote, ticks[ticks.length - 1].pip_size) : null;

  const avgIntervalMs = useMemo(() => {
    const tail = ticks.slice(-30);
    if (tail.length < 2) return null;
    const dt = (tail[tail.length - 1].epoch - tail[0].epoch) * 1000;
    if (dt <= 0) return null;
    return dt / (tail.length - 1);
  }, [ticks]);

  const [elapsedMs, setElapsedMs] = useState(0);
  const lastEpochRef = useRef<number | undefined>(lastEpoch);

  useEffect(() => {
    lastEpochRef.current = lastEpoch;
    setElapsedMs(0);
  }, [lastEpoch]);

  useEffect(() => {
    let raf: number;
    const tick = () => {
      if (lastEpochRef.current) {
        setElapsedMs(Date.now() - lastEpochRef.current * 1000);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const SIZE = 140;
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const r = 56;
  const circumference = 2 * Math.PI * r;

  const progress = avgIntervalMs ? Math.min(1, Math.max(0, elapsedMs / avgIntervalMs)) : 0;
  const isOverdue = avgIntervalMs !== null && elapsedMs > avgIntervalMs * 1.6;
  const dashOffset = circumference * (1 - progress);

  return (
    <Panel title="Tick Pulse" subtitle={ticks.length ? `${ticks.length} buffered` : "—"}>
      <div className="flex items-center justify-center h-full">
        <div className="relative" style={{ width: SIZE, height: SIZE }}>
          <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full h-full -rotate-90">
            <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--color-secondary)" strokeWidth={8} opacity={0.5} />
            <circle
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={isOverdue ? "var(--color-warn)" : "var(--color-primary)"}
              strokeWidth={8}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              style={{ transition: "stroke-dashoffset 80ms linear" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span
              className="text-2xl font-bold tabular-nums leading-none"
              style={{ fontFamily: "'JetBrains Mono', monospace", color: isOverdue ? "var(--color-warn)" : "var(--color-foreground)" }}
            >
              {lastDigitVal ?? "—"}
            </span>
            <span className="text-[8px] uppercase tracking-widest text-muted-foreground mt-1">
              {(elapsedMs / 1000).toFixed(1)}s since tick
            </span>
          </div>
        </div>
      </div>
      <div className="mt-1 flex items-center justify-between text-[9px] uppercase tracking-widest text-muted-foreground">
        <span>{avgIntervalMs ? `~${(avgIntervalMs / 1000).toFixed(2)}s/tick avg` : "measuring rate…"}</span>
        <span className={isOverdue ? "text-warn" : ""}>{isOverdue ? "overdue" : "live"}</span>
      </div>
    </Panel>
  );
}
