import { useState } from "react";
import { useMarketAnalyzer } from "@/hooks/use-market-analyzer";
import type { Tick } from "@/hooks/use-deriv-ticks";
import type { MarketAnalysis, ContractCall } from "@/hooks/use-market-analyzer";

const REGIME_STYLE: Record<string, { border: string; bg: string; badge: string; icon: string }> = {
  TRENDING:  { border: "border-primary/40",   bg: "bg-primary/5",   badge: "text-primary bg-primary/15 border-primary/30",     icon: "⟶" },
  RANGING:   { border: "border-amber/40",      bg: "bg-amber/5",     badge: "text-amber-300 bg-amber-500/15 border-amber-500/30", icon: "⟺" },
  VOLATILE:  { border: "border-red-500/40",    bg: "bg-red-500/5",   badge: "text-red-300 bg-red-500/15 border-red-500/30",       icon: "⚡" },
  QUIET:     { border: "border-border/40",     bg: "bg-secondary/5", badge: "text-muted-foreground bg-secondary/30 border-border", icon: "◌" },
};

const BIAS_STYLE: Record<string, { color: string; icon: string }> = {
  BULLISH: { color: "text-emerald-300", icon: "▲" },
  BEARISH: { color: "text-red-300",     icon: "▼" },
  NEUTRAL: { color: "text-amber-300",   icon: "◆" },
};

const RISK_COLOR: Record<string, string> = {
  LOW:    "text-emerald-300 bg-emerald-500/10 border-emerald-500/25",
  MEDIUM: "text-amber-300 bg-amber-500/10 border-amber-500/25",
  HIGH:   "text-red-300 bg-red-500/10 border-red-500/25",
};

const CONF_BAR: Record<string, string> = {
  LOW:    "bg-muted-foreground/50",
  MEDIUM: "bg-amber-400",
  HIGH:   "bg-emerald-400",
};

function confidencePct(c: number) {
  return Math.min(100, Math.max(0, c));
}

function ContractCard({ call }: { call: ContractCall }) {
  return (
    <div className="flex flex-col gap-1.5 p-2.5 rounded border border-border/60 bg-card/50 hover:bg-card/80 transition-colors">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] font-bold font-mono text-foreground tracking-wide">{call.type}</span>
        <span className={`text-[8px] font-mono px-1.5 py-0.5 rounded border tracking-widest ${RISK_COLOR[call.riskLevel]}`}>
          {call.riskLevel} RISK
        </span>
        <span className="text-[9px] font-mono text-muted-foreground ml-auto">{call.duration}</span>
      </div>
      {/* Confidence bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1 rounded-full bg-secondary/60 overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all duration-700"
            style={{ width: `${confidencePct(call.confidence)}%` }}
          />
        </div>
        <span className="text-[9px] font-mono text-primary tabular-nums w-8 text-right">{call.confidence}%</span>
      </div>
      <p className="text-[10px] font-mono text-muted-foreground leading-relaxed">{call.rationale}</p>
    </div>
  );
}

function StatRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1 border-b border-border/20 last:border-0">
      <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">{label}</span>
      <span className={`text-[10px] font-mono tabular-nums ${highlight ? "text-primary font-semibold" : "text-foreground"}`}>{value}</span>
    </div>
  );
}

interface MarketAnalyzerProps {
  ticks: Tick[];
  symbol: string;
  windowSize: number;
}

export function MarketAnalyzerPanel({ ticks, symbol, windowSize }: MarketAnalyzerProps) {
  const { analysis, loading, error, lastSnapshot, analyze } = useMarketAnalyzer();
  const [tab, setTab] = useState<"overview" | "contracts" | "detail">("overview");
  const hasKey = !!import.meta.env.VITE_GROQ_API_KEY;

  const regime = analysis?.regime;
  const regimeStyle = regime ? (REGIME_STYLE[regime.type] ?? REGIME_STYLE.QUIET) : null;
  const biasStyle = analysis ? BIAS_STYLE[analysis.overallBias] : null;

  return (
    <div className="flex flex-col gap-3 h-full">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground">Senior Trader · 10yr Analysis</span>
            {analysis && biasStyle && (
              <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${biasStyle.color} bg-current/10`} style={{ borderColor: "currentColor" }}>
                {biasStyle.icon} {analysis.overallBias}
              </span>
            )}
          </div>
          {analysis && (
            <p className="text-[9px] font-mono text-muted-foreground/60 mt-0.5">
              Analyzed {new Date(analysis.analyzedAt).toLocaleTimeString([], { hour12: false })}
              {lastSnapshot && <span className="ml-1">· n={lastSnapshot.total}</span>}
            </p>
          )}
        </div>
        <button
          onClick={() => analyze(ticks, symbol, windowSize)}
          disabled={loading || ticks.length < 30 || !hasKey}
          className="px-3 py-1.5 rounded border border-primary/50 text-primary text-[9px] uppercase tracking-[0.15em] font-mono hover:bg-primary/10 disabled:opacity-35 disabled:cursor-not-allowed transition-all active:scale-95 shrink-0"
        >
          {loading ? (
            <span className="flex items-center gap-1.5">
              <span className="inline-block size-2 rounded-full bg-primary animate-ping" />
              Analyzing…
            </span>
          ) : "Run Analysis"}
        </button>
      </div>

      {/* ── No key warning ── */}
      {!hasKey && (
        <div className="text-[10px] font-mono text-amber-300 bg-amber-500/8 border border-amber-500/20 rounded p-2.5 leading-relaxed">
          Add <code className="text-foreground bg-secondary px-1 rounded">VITE_GROQ_API_KEY</code> to enable the Market Analyzer.
          Free at <span className="text-foreground underline">console.groq.com</span>
        </div>
      )}

      {/* ── Error ── */}
      {error && (
        <div className="text-[10px] font-mono text-red-300 bg-red-500/8 border border-red-500/20 rounded p-2.5 flex items-start gap-2">
          <span className="text-red-400 shrink-0">✕</span>
          {error}
        </div>
      )}

      {/* ── Loading skeleton ── */}
      {loading && (
        <div className="flex flex-col gap-2 animate-pulse">
          <div className="h-14 rounded border border-border bg-secondary/20" />
          <div className="grid grid-cols-2 gap-2">
            <div className="h-8 rounded bg-secondary/20" />
            <div className="h-8 rounded bg-secondary/20" />
          </div>
          {[95, 80, 70, 85, 60].map((w, i) => (
            <div key={i} className="h-2 rounded bg-muted/20" style={{ width: `${w}%` }} />
          ))}
        </div>
      )}

      {/* ── Results ── */}
      {analysis && !loading && (
        <div className="flex flex-col gap-3 flex-1 min-h-0">

          {/* Regime banner */}
          {regimeStyle && regime && (
            <div className={`flex items-center gap-3 p-2.5 rounded border ${regimeStyle.border} ${regimeStyle.bg}`}>
              <span className={`text-[10px] font-mono px-2 py-1 rounded border font-bold tracking-widest ${regimeStyle.badge}`}>
                {REGIME_STYLE[regime.type]?.icon} {regime.type}
              </span>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-widest">Regime Strength</span>
                  <span className="text-[9px] font-mono text-foreground">{regime.strength}</span>
                </div>
                <div className="h-1 w-full rounded-full bg-secondary/60 mt-1 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${CONF_BAR[analysis.confidence]}`}
                    style={{ width: regime.strength === "STRONG" ? "90%" : regime.strength === "MODERATE" ? "60%" : "30%" }}
                  />
                </div>
              </div>
              <span className={`text-[9px] font-mono tracking-widest ${CONF_BAR[analysis.confidence].replace("bg-", "text-").replace("-400", "-300")}`}>
                {analysis.confidence} CONF
              </span>
            </div>
          )}

          {/* Tab bar */}
          <div className="flex gap-1 border-b border-border/40 pb-0">
            {(["overview", "contracts", "detail"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-2.5 py-1 text-[9px] font-mono uppercase tracking-widest border-b-2 transition-all -mb-px ${
                  tab === t
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Tab: Overview */}
          {tab === "overview" && (
            <div className="flex flex-col gap-2.5 overflow-y-auto flex-1 pr-0.5">

              {/* Top setup */}
              <div className="border-l-2 border-primary/60 pl-2.5 py-0.5">
                <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-1">Top Setup</p>
                <p className="text-[11px] font-mono text-foreground leading-relaxed font-semibold">{analysis.topSetup}</p>
              </div>

              {/* Session bias */}
              <div className="p-2.5 rounded border border-border/40 bg-card/40">
                <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-1.5">Session Bias</p>
                <p className="text-[10px] font-mono text-foreground/85 leading-relaxed">{analysis.sessionBias}</p>
              </div>

              {/* Reads grid */}
              <div className="grid grid-cols-1 gap-2">
                {[
                  { label: "Price Action", text: analysis.priceAction },
                  { label: "Digit Patterns", text: analysis.digitPatterns },
                  { label: "Even / Odd", text: analysis.evenOddRead },
                  { label: "Volatility", text: analysis.volatilityRead },
                ].map(({ label, text }) => (
                  <div key={label} className="flex flex-col gap-0.5">
                    <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground">{label}</span>
                    <span className="text-[10px] font-mono text-foreground/80 leading-relaxed">{text}</span>
                  </div>
                ))}
              </div>

              {/* Key levels */}
              <div className="p-2 rounded border border-border/30 bg-secondary/10">
                <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-1">Key Levels to Watch</p>
                <p className="text-[10px] font-mono text-foreground/80 leading-relaxed">{analysis.keyLevels}</p>
              </div>

              {/* Stake advice */}
              <div className="flex items-start gap-2 p-2 rounded border border-amber-500/20 bg-amber-500/5">
                <span className="text-amber-400 text-[10px] shrink-0 mt-0.5">⊛</span>
                <div>
                  <p className="text-[9px] font-mono uppercase tracking-widest text-amber-400/80 mb-0.5">Stake Advice</p>
                  <p className="text-[10px] font-mono text-muted-foreground leading-relaxed">{analysis.stakeAdvice}</p>
                </div>
              </div>

              {/* Warnings */}
              {analysis.warnings.length > 0 && (
                <div className="flex flex-col gap-1">
                  {analysis.warnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-2 text-[10px] font-mono text-red-300 border border-red-500/20 rounded p-2 bg-red-500/5">
                      <span className="text-red-400 shrink-0">⚠</span>
                      {w}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tab: Contracts */}
          {tab === "contracts" && (
            <div className="flex flex-col gap-2 overflow-y-auto flex-1 pr-0.5">
              {analysis.contracts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 gap-2">
                  <p className="text-[10px] font-mono text-muted-foreground">No high-conviction setups right now</p>
                </div>
              ) : (
                analysis.contracts.map((call, i) => (
                  <ContractCard key={i} call={call} />
                ))
              )}
            </div>
          )}

          {/* Tab: Detail */}
          {tab === "detail" && (
            <div className="flex flex-col gap-3 overflow-y-auto flex-1 pr-0.5">
              {/* Trader's note */}
              <div className="p-3 rounded border border-primary/20 bg-primary/5">
                <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-primary/70 mb-1.5">Trader's Note</p>
                <p className="text-[10px] font-mono text-foreground/85 leading-relaxed">{analysis.tradersNote}</p>
              </div>

              {/* Snapshot stats */}
              {lastSnapshot && (
                <div className="flex flex-col rounded border border-border/40 overflow-hidden">
                  <div className="px-2.5 py-1.5 bg-secondary/30 border-b border-border/30">
                    <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground">Snapshot Stats</span>
                  </div>
                  <div className="p-2.5 flex flex-col">
                    <StatRow label="Symbol" value={lastSnapshot.symbol} />
                    <StatRow label="Ticks Analyzed" value={String(lastSnapshot.total)} />
                    <StatRow label="Last Price" value={String(lastSnapshot.lastPrice)} />
                    <StatRow label="Range" value={`${lastSnapshot.rangePips} pips`} />
                    <StatRow label="Session Δ" value={`${lastSnapshot.sessionDelta} pips (${lastSnapshot.sessionPct}%)`} />
                    <StatRow label="Hot Digit" value={`${lastSnapshot.hotDigit} @ ${lastSnapshot.hotPct}%`} highlight />
                    <StatRow label="Cold Digit" value={`${lastSnapshot.coldDigit} @ ${lastSnapshot.coldPct}%`} />
                    <StatRow label="Even / Odd" value={`${lastSnapshot.evenPct}% / ${lastSnapshot.oddPct}%`} />
                    <StatRow label="Rise / Fall" value={`${lastSnapshot.risePct}% / ${lastSnapshot.fallPct}%`} />
                    <StatRow label="Avg Tick Move" value={`${lastSnapshot.avgPips} pips`} />
                    <StatRow label="Volatility SD" value={`${lastSnapshot.sdPips} pips`} />
                    <StatRow label="Over 5 / Under 5" value={`${lastSnapshot.over5Pct}% / ${lastSnapshot.under5Pct}%`} />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Empty state ── */}
      {!analysis && !loading && !error && (
        <div className="flex flex-col items-center justify-center py-10 gap-2.5">
          <div className="text-4xl opacity-10">◈</div>
          <p className="text-[10px] font-mono text-muted-foreground tracking-widest uppercase">Awaiting Analysis</p>
          <p className="text-[9px] font-mono text-muted-foreground/60 text-center max-w-[200px] leading-relaxed">
            {ticks.length < 30
              ? `Need ${30 - ticks.length} more ticks to begin`
              : "Run a full senior trader analysis of live market data"}
          </p>
        </div>
      )}
    </div>
  );
}
