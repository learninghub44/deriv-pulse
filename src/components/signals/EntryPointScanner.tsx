import { useMemo } from "react";
import { useTechnicalEngine } from "@/hooks/use-technical-engine";
import type { Tick } from "@/hooks/use-deriv-ticks";
import type { EntrySignal, TechnicalSummary } from "@/hooks/use-technical-engine";

/* ============================================================
 *  ENTRY POINT SCANNER — Advanced signal dashboard
 * ========================================================== */

interface Props {
  ticks: Tick[];
  symbol: string;
  windowSize: number;
}

const CONFIDENCE_STYLE = {
  VERY_HIGH: { badge: "bg-emerald-500/20 text-emerald-300 border-emerald-500/50", bar: "bg-emerald-400", glow: "shadow-[0_0_12px_rgba(74,222,128,0.4)]" },
  HIGH:      { badge: "bg-primary/20 text-primary border-primary/50",             bar: "bg-primary",     glow: "shadow-[0_0_8px_rgba(120,200,120,0.3)]" },
  MEDIUM:    { badge: "bg-amber-500/20 text-amber-300 border-amber-500/50",       bar: "bg-amber-400",   glow: "" },
  LOW:       { badge: "bg-muted/30 text-muted-foreground border-border",          bar: "bg-muted-foreground", glow: "" },
};

const RISK_STYLE = {
  LOW:     "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
  MEDIUM:  "text-amber-300 bg-amber-500/10 border-amber-500/30",
  HIGH:    "text-red-400 bg-red-500/10 border-red-500/30",
  EXTREME: "text-red-300 bg-red-500/20 border-red-500/60 animate-pulse",
};

const PHASE_STYLE: Record<string, string> = {
  TRENDING:  "text-primary",
  RANGING:   "text-amber-300",
  BREAKOUT:  "text-cyan-300",
  REVERSAL:  "text-purple-300",
  CHOPPY:    "text-red-400",
};

function ScoreMeter({ score, label }: { score: number; label: string }) {
  const color = score >= 75 ? "bg-emerald-400" : score >= 50 ? "bg-amber-400" : "bg-red-400";
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-[9px] font-mono uppercase tracking-widest text-muted-foreground">
        <span>{label}</span>
        <span className="text-foreground font-bold">{score}</span>
      </div>
      <div className="h-1.5 bg-secondary/60 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

function RSIGauge({ value, zone }: { value: number; zone: string }) {
  const fill = zone === "OVERSOLD" ? "text-bull" : zone === "OVERBOUGHT" ? "text-bear" : "text-amber-300";
  const pct = value;
  const angle = (pct / 100) * 180 - 90; // -90 to +90 deg
  const rad = (angle * Math.PI) / 180;
  const cx = 60; const cy = 60; const r = 45;
  const nx = cx + r * Math.cos(rad);
  const ny = cy + r * Math.sin(rad);

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 120 70" className="w-24 h-14">
        {/* Background arc */}
        <path d="M 15 60 A 45 45 0 0 1 105 60" fill="none" stroke="var(--color-secondary)" strokeWidth="8" strokeLinecap="round" />
        {/* Colored sections */}
        <path d="M 15 60 A 45 45 0 0 1 33 21" fill="none" stroke="var(--color-bull)" strokeWidth="8" strokeLinecap="round" opacity="0.5" />
        <path d="M 87 21 A 45 45 0 0 1 105 60" fill="none" stroke="var(--color-bear)" strokeWidth="8" strokeLinecap="round" opacity="0.5" />
        {/* Needle */}
        <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={fill} />
        <circle cx={cx} cy={cy} r="3" fill="currentColor" className={fill} />
        {/* Labels */}
        <text x="10" y="68" fontSize="7" fill="var(--color-bull)" fontFamily="monospace">30</text>
        <text x="56" y="18" fontSize="7" fill="var(--color-muted-foreground)" fontFamily="monospace" textAnchor="middle">50</text>
        <text x="100" y="68" fontSize="7" fill="var(--color-bear)" fontFamily="monospace" textAnchor="end">70</text>
      </svg>
      <div className={`text-xl font-bold font-mono tabular-nums ${fill}`}>{value.toFixed(1)}</div>
      <div className="text-[9px] uppercase tracking-widest text-muted-foreground">{zone}</div>
    </div>
  );
}

function EntryCard({ signal, rank }: { signal: EntrySignal; rank: number }) {
  const cs = CONFIDENCE_STYLE[signal.confidence];
  const rs = RISK_STYLE[signal.riskLevel];
  const isTop = rank === 0;

  return (
    <div className={`rounded-lg border p-3 flex flex-col gap-2 transition-all ${
      isTop
        ? `border-primary/60 bg-primary/5 ${cs.glow}`
        : "border-border bg-secondary/20"
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {isTop && (
            <span className="text-[8px] uppercase tracking-widest font-mono text-primary bg-primary/15 border border-primary/40 px-1.5 py-0.5 rounded">
              ⚡ TOP SETUP
            </span>
          )}
          <span className="text-[11px] font-bold font-mono text-foreground">{signal.contractType}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`text-[9px] px-1.5 py-0.5 rounded border font-mono uppercase ${cs.badge}`}>
            {signal.confidence}
          </span>
          <span className={`text-[9px] px-1.5 py-0.5 rounded border font-mono uppercase ${rs}`}>
            {signal.riskLevel}
          </span>
        </div>
      </div>

      {/* Strength bar */}
      <div>
        <div className="flex justify-between text-[9px] font-mono text-muted-foreground mb-1">
          <span>Signal Strength</span>
          <span className="text-foreground font-bold">{signal.strength}/100</span>
        </div>
        <div className="h-2 bg-secondary/60 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${cs.bar}`}
            style={{ width: `${signal.strength}%` }}
          />
        </div>
      </div>

      {/* Reasons */}
      <div className="space-y-0.5">
        {signal.reason.map((r, i) => (
          <div key={i} className="flex items-start gap-1.5 text-[10px] text-muted-foreground">
            <span className="text-primary mt-0.5 shrink-0">›</span>
            <span>{r}</span>
          </div>
        ))}
      </div>

      {/* Meta grid */}
      <div className="grid grid-cols-3 gap-1.5 text-[9px] mt-1">
        <div className="rounded bg-secondary/40 border border-border px-1.5 py-1">
          <div className="text-muted-foreground uppercase tracking-widest">Duration</div>
          <div className="font-mono text-foreground font-semibold">{signal.duration}</div>
        </div>
        <div className="rounded bg-secondary/40 border border-border px-1.5 py-1">
          <div className="text-muted-foreground uppercase tracking-widest">Edge Est.</div>
          <div className="font-mono text-emerald-300 font-semibold">+{signal.expectedEdge.toFixed(1)}%</div>
        </div>
        <div className="rounded bg-secondary/40 border border-border px-1.5 py-1">
          <div className="text-muted-foreground uppercase tracking-widest">Direction</div>
          <div className={`font-mono font-semibold ${signal.direction === "BUY" ? "text-bull" : signal.direction === "SELL" ? "text-bear" : "text-amber-300"}`}>
            {signal.direction}
          </div>
        </div>
      </div>

      {/* Entry / Invalidation */}
      <div className="space-y-1 text-[9px]">
        <div className="flex gap-1.5">
          <span className="text-emerald-400 shrink-0">↑ ENTRY:</span>
          <span className="text-muted-foreground">{signal.entryCondition}</span>
        </div>
        <div className="flex gap-1.5">
          <span className="text-red-400 shrink-0">✕ STOP:</span>
          <span className="text-muted-foreground">{signal.invalidationCondition}</span>
        </div>
      </div>
    </div>
  );
}

function DigitHeatmap({ patterns }: { patterns: TechnicalSummary["digitPatterns"] }) {
  const sorted = [...patterns].sort((a, b) => b.deviation - a.deviation);
  return (
    <div className="grid grid-cols-5 gap-1">
      {sorted.map((p) => {
        const intensity = Math.min(1, Math.abs(p.deviation) / 15);
        const isHot = p.deviation > 0;
        const bg = isHot
          ? `rgba(74, 222, 128, ${intensity * 0.35})`
          : `rgba(248, 113, 113, ${intensity * 0.35})`;
        const border = isHot
          ? `rgba(74, 222, 128, ${intensity * 0.6})`
          : `rgba(248, 113, 113, ${intensity * 0.6})`;
        return (
          <div
            key={p.digit}
            className="rounded p-1.5 flex flex-col items-center gap-0.5 border"
            style={{ background: bg, borderColor: border }}
          >
            <span className="text-[14px] font-bold font-mono tabular-nums text-foreground">{p.digit}</span>
            <span className={`text-[8px] font-mono tabular-nums ${isHot ? "text-bull" : "text-bear"}`}>
              {p.deviation >= 0 ? "+" : ""}{p.deviation.toFixed(1)}%
            </span>
            <span className="text-[7px] uppercase tracking-wider text-muted-foreground/70">{p.hotColdLabel}</span>
          </div>
        );
      })}
    </div>
  );
}

function EMAStack({ ema }: { ema: TechnicalSummary["ema"] }) {
  return (
    <div className="space-y-1.5 text-[10px] font-mono">
      <div className="flex justify-between items-center">
        <span className="text-muted-foreground">EMA 8</span>
        <span className="tabular-nums text-cyan-300">{ema.ema8.toFixed(4)}</span>
      </div>
      <div className="flex justify-between items-center">
        <span className="text-muted-foreground">EMA 21</span>
        <span className="tabular-nums text-blue-300">{ema.ema21.toFixed(4)}</span>
      </div>
      <div className="flex justify-between items-center">
        <span className="text-muted-foreground">EMA 55</span>
        <span className="tabular-nums text-purple-300">{ema.ema55.toFixed(4)}</span>
      </div>
      <div className="h-px bg-border/60 my-1" />
      <div className="flex justify-between">
        <span className="text-muted-foreground">Trend</span>
        <span className={ema.trend === "BULLISH" ? "text-bull" : ema.trend === "BEARISH" ? "text-bear" : "text-muted-foreground"}>
          {ema.trend}
        </span>
      </div>
      {ema.crossover !== "NONE" && (
        <div className="flex justify-between">
          <span className="text-muted-foreground">Crossover</span>
          <span className={ema.crossover === "GOLDEN" ? "text-bull animate-pulse" : "text-bear animate-pulse"}>
            ◆ {ema.crossover}
          </span>
        </div>
      )}
    </div>
  );
}

function MTFPanel({ mtf }: { mtf: TechnicalSummary["mtf"] }) {
  const tfs = [
    { label: "SHORT  (20t)", data: mtf.short },
    { label: "MEDIUM (100t)", data: mtf.medium },
    { label: "LONG   (500t)", data: mtf.long },
  ];
  const alignColor = mtf.alignment === "ALIGNED_BULL" ? "text-bull" :
    mtf.alignment === "ALIGNED_BEAR" ? "text-bear" :
    mtf.alignment === "CONFLICTING" ? "text-red-400" : "text-amber-300";

  return (
    <div className="space-y-1.5">
      {tfs.map(({ label, data }) => (
        <div key={label} className="flex items-center gap-2 text-[10px] font-mono">
          <span className="text-muted-foreground w-28 shrink-0">{label}</span>
          <span className={`${data.bias === "BULLISH" ? "text-bull" : data.bias === "BEARISH" ? "text-bear" : "text-muted-foreground"} w-14`}>
            {data.bias}
          </span>
          <div className="flex-1 h-1.5 bg-secondary/40 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${data.bias === "BULLISH" ? "bg-bull" : data.bias === "BEARISH" ? "bg-bear" : "bg-muted-foreground"}`}
              style={{ width: `${data.strength}%` }}
            />
          </div>
          <span className="text-muted-foreground tabular-nums w-8 text-right">{data.strength.toFixed(0)}%</span>
        </div>
      ))}
      <div className="h-px bg-border/60 mt-1 mb-1" />
      <div className="flex justify-between text-[10px] font-mono">
        <span className="text-muted-foreground">Alignment</span>
        <span className={`font-semibold ${alignColor}`}>{mtf.alignment.replace(/_/g, " ")} — {mtf.alignmentScore}%</span>
      </div>
    </div>
  );
}

function BollingerPanel({ bb, lastPrice }: { bb: TechnicalSummary["bb"]; lastPrice: number }) {
  const pip = 4;
  return (
    <div className="space-y-1.5 text-[10px] font-mono">
      <div className="flex justify-between">
        <span className="text-muted-foreground">Upper</span>
        <span className="tabular-nums text-red-300">{bb.upper.toFixed(pip)}</span>
      </div>
      <div className="relative h-6 bg-secondary/40 rounded overflow-hidden border border-border">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full h-0.5 bg-amber-400/50" />
        </div>
        {/* Current price marker */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-primary"
          style={{ left: `${Math.max(0, Math.min(100, bb.percentB * 100))}%` }}
        />
        <div className="absolute top-0.5 left-1 text-[8px] text-muted-foreground/60">Lower</div>
        <div className="absolute top-0.5 right-1 text-[8px] text-muted-foreground/60">Upper</div>
      </div>
      <div className="flex justify-between">
        <span className="text-muted-foreground">Middle</span>
        <span className="tabular-nums text-amber-300">{bb.middle.toFixed(pip)}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted-foreground">Lower</span>
        <span className="tabular-nums text-bull">{bb.lower.toFixed(pip)}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted-foreground">%B</span>
        <span className={`tabular-nums ${bb.percentB > 0.8 ? "text-bear" : bb.percentB < 0.2 ? "text-bull" : "text-foreground"}`}>
          {(bb.percentB * 100).toFixed(1)}%
        </span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted-foreground">BW</span>
        <span className={`tabular-nums ${bb.squeeze ? "text-cyan-300 animate-pulse" : "text-foreground"}`}>
          {bb.bandwidth.toFixed(3)}% {bb.squeeze ? "⚡ SQUEEZE" : ""}
        </span>
      </div>
    </div>
  );
}

export function EntryPointScanner({ ticks, symbol, windowSize }: Props) {
  const tech = useTechnicalEngine(ticks, windowSize);
  const lastPrice = ticks[ticks.length - 1]?.quote ?? 0;

  if (!tech || ticks.length < 30) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <div className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest animate-pulse">
          Collecting ticks…
        </div>
        <div className="text-[9px] text-muted-foreground/50 font-mono">
          Need 30+ ticks · {ticks.length} received
        </div>
        <div className="flex gap-1 mt-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-1 w-6 bg-secondary/60 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary/60 rounded-full animate-pulse"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">

      {/* ── TOP METRICS ROW ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {/* Overall score */}
        <div className="rounded-lg border border-border bg-card/60 p-3 flex flex-col items-center gap-1">
          <div className="text-[9px] uppercase tracking-widest text-muted-foreground font-mono">Trade Score</div>
          <div className={`text-3xl font-bold tabular-nums font-mono ${
            tech.overallScore >= 70 ? "text-bull" : tech.overallScore >= 40 ? "text-amber-300" : "text-bear"
          }`}>{tech.overallScore}</div>
          <div className="text-[9px] text-muted-foreground font-mono">/100</div>
        </div>
        {/* Market phase */}
        <div className="rounded-lg border border-border bg-card/60 p-3 flex flex-col items-center gap-1">
          <div className="text-[9px] uppercase tracking-widest text-muted-foreground font-mono">Phase</div>
          <div className={`text-sm font-bold font-mono text-center ${PHASE_STYLE[tech.marketPhase] ?? "text-foreground"}`}>
            {tech.marketPhase}
          </div>
          <div className="text-[9px] text-muted-foreground font-mono">{symbol}</div>
        </div>
        {/* Volatility */}
        <div className="rounded-lg border border-border bg-card/60 p-3 flex flex-col items-center gap-1">
          <div className="text-[9px] uppercase tracking-widest text-muted-foreground font-mono">Volatility</div>
          <div className={`text-sm font-bold font-mono ${
            tech.volatility.regime === "EXTREME" ? "text-red-300 animate-pulse" :
            tech.volatility.regime === "HIGH" ? "text-amber-300" :
            tech.volatility.regime === "NORMAL" ? "text-bull" : "text-blue-300"
          }`}>{tech.volatility.regime}</div>
          <div className="text-[9px] text-muted-foreground font-mono">{tech.volatility.atr.toFixed(3)} pips</div>
        </div>
        {/* Signals count */}
        <div className="rounded-lg border border-border bg-card/60 p-3 flex flex-col items-center gap-1">
          <div className="text-[9px] uppercase tracking-widest text-muted-foreground font-mono">Signals</div>
          <div className={`text-3xl font-bold tabular-nums font-mono ${tech.entrySignals.length > 0 ? "text-primary" : "text-muted-foreground"}`}>
            {tech.entrySignals.length}
          </div>
          <div className="text-[9px] text-muted-foreground font-mono">active now</div>
        </div>
      </div>

      {/* ── MAIN GRID ── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">

        {/* Left: Entry Signals */}
        <div className="xl:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-[9px] uppercase tracking-[0.25em] text-muted-foreground font-mono">
              ⚡ Entry Signals ({tech.entrySignals.length})
            </h3>
            <span className="text-[9px] font-mono text-muted-foreground/60">
              {tech.volatility.optimalContractDuration}
            </span>
          </div>
          {tech.entrySignals.length === 0 ? (
            <div className="rounded-lg border border-border bg-secondary/20 p-6 text-center">
              <div className="text-[11px] text-muted-foreground font-mono">No high-confidence setups detected</div>
              <div className="text-[9px] text-muted-foreground/60 font-mono mt-1">Market conditions currently unfavourable for entry</div>
            </div>
          ) : (
            <div className="space-y-2">
              {tech.entrySignals.slice(0, 5).map((signal, i) => (
                <EntryCard key={signal.id} signal={signal} rank={i} />
              ))}
            </div>
          )}
        </div>

        {/* Right: Technical Indicators */}
        <div className="space-y-3">
          {/* RSI */}
          <div className="rounded-lg border border-border bg-card/60 p-3">
            <div className="text-[9px] uppercase tracking-[0.25em] text-muted-foreground font-mono mb-3">RSI (14)</div>
            <RSIGauge value={tech.rsi.value} zone={tech.rsi.zone} />
            <div className="mt-2 text-center">
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                tech.rsi.signal === "BUY" ? "text-bull border-bull/40 bg-bull/10" :
                tech.rsi.signal === "SELL" ? "text-bear border-bear/40 bg-bear/10" :
                "text-muted-foreground border-border"
              }`}>{tech.rsi.signal} SIGNAL</span>
            </div>
          </div>

          {/* EMA Stack */}
          <div className="rounded-lg border border-border bg-card/60 p-3">
            <div className="text-[9px] uppercase tracking-[0.25em] text-muted-foreground font-mono mb-3">EMA Cloud</div>
            <EMAStack ema={tech.ema} />
          </div>

          {/* Bollinger Bands */}
          <div className="rounded-lg border border-border bg-card/60 p-3">
            <div className="text-[9px] uppercase tracking-[0.25em] text-muted-foreground font-mono mb-3">Bollinger Bands (20,2)</div>
            <BollingerPanel bb={tech.bb} lastPrice={lastPrice} />
          </div>
        </div>
      </div>

      {/* ── DIGIT HEATMAP ── */}
      <div className="rounded-lg border border-border bg-card/60 p-3">
        <div className="text-[9px] uppercase tracking-[0.25em] text-muted-foreground font-mono mb-3">
          Digit Heatmap — Statistical Edge by Contract Type
        </div>
        <DigitHeatmap patterns={tech.digitPatterns} />
        <div className="mt-3 flex gap-4 text-[9px] font-mono text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-bull/70 inline-block" /> HOT = MATCHES edge</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-bear/70 inline-block" /> COLD = DIFFERS edge</span>
          <span className="ml-auto">Expected per digit: 10.0%</span>
        </div>
      </div>

      {/* ── MULTI-TIMEFRAME ── */}
      <div className="rounded-lg border border-border bg-card/60 p-3">
        <div className="text-[9px] uppercase tracking-[0.25em] text-muted-foreground font-mono mb-3">Multi-Timeframe Alignment</div>
        <MTFPanel mtf={tech.mtf} />
      </div>

      {/* ── MOMENTUM ── */}
      <div className="rounded-lg border border-border bg-card/60 p-3">
        <div className="text-[9px] uppercase tracking-[0.25em] text-muted-foreground font-mono mb-3">Momentum Analysis</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {[
            { label: "ROC 5t", value: `${tech.momentum.roc5 >= 0 ? "+" : ""}${tech.momentum.roc5.toFixed(4)}%`, tone: tech.momentum.roc5 > 0 ? "text-bull" : tech.momentum.roc5 < 0 ? "text-bear" : "text-muted-foreground" },
            { label: "ROC 20t", value: `${tech.momentum.roc20 >= 0 ? "+" : ""}${tech.momentum.roc20.toFixed(4)}%`, tone: tech.momentum.roc20 > 0 ? "text-bull" : tech.momentum.roc20 < 0 ? "text-bear" : "text-muted-foreground" },
            { label: "Accel.", value: `${tech.momentum.acceleration >= 0 ? "+" : ""}${tech.momentum.acceleration.toFixed(4)}`, tone: tech.momentum.acceleration > 0 ? "text-bull" : "text-bear" },
            { label: "Phase", value: tech.momentum.phase.replace(/_/g, " "), tone: tech.momentum.phase.includes("UP") ? "text-bull" : tech.momentum.phase.includes("DOWN") ? "text-bear" : "text-muted-foreground" },
          ].map(({ label, value, tone }) => (
            <div key={label} className="rounded border border-border bg-secondary/40 px-2 py-1.5">
              <div className="text-[8px] uppercase tracking-widest text-muted-foreground font-mono">{label}</div>
              <div className={`text-[11px] font-mono font-semibold tabular-nums ${tone}`}>{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── SCORE METERS ── */}
      <div className="rounded-lg border border-border bg-card/60 p-3">
        <div className="text-[9px] uppercase tracking-[0.25em] text-muted-foreground font-mono mb-3">Composite Scoring</div>
        <div className="space-y-2">
          <ScoreMeter score={tech.mtf.alignmentScore} label="MTF Alignment" />
          <ScoreMeter score={Math.round(Math.abs(tech.rsi.value - 50) * 2)} label="RSI Extremity" />
          <ScoreMeter score={tech.ema.crossover !== "NONE" ? 90 : 35} label="EMA Signal" />
          <ScoreMeter score={Math.round(Math.min(100, tech.entrySignals.length * 18))} label="Signal Count" />
          <ScoreMeter score={tech.volatility.regime === "NORMAL" ? 80 : tech.volatility.regime === "HIGH" ? 55 : 35} label="Volatility Suitability" />
        </div>
      </div>

      {/* ── RISK DISCLOSURE ── */}
      <div className="rounded border border-border/40 bg-secondary/10 p-2 text-[9px] font-mono text-muted-foreground/50">
        ⚠ Entry signals are statistical observations, not financial advice. Past patterns on synthetic indices are determined by random number generators. Always manage your risk.
      </div>
    </div>
  );
}
