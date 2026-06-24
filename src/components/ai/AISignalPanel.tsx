import { useState } from "react";
import { useAISignal } from "@/hooks/use-ai-signal";
import type { Tick } from "@/hooks/use-deriv-ticks";

const SENTIMENT_STYLES = {
  BULLISH: {
    container: "border-emerald-500/40 bg-emerald-500/5",
    badge: "text-emerald-300 bg-emerald-500/15 border border-emerald-500/30",
    icon: "▲",
    bar: "bg-emerald-400",
  },
  BEARISH: {
    container: "border-red-500/40 bg-red-500/5",
    badge: "text-red-300 bg-red-500/15 border border-red-500/30",
    icon: "▼",
    bar: "bg-red-400",
  },
  NEUTRAL: {
    container: "border-amber-500/30 bg-amber-500/5",
    badge: "text-amber-300 bg-amber-500/15 border border-amber-500/25",
    icon: "◆",
    bar: "bg-amber-400",
  },
};

const CONFIDENCE_META = {
  LOW:    { color: "text-muted-foreground", bg: "bg-muted-foreground/30", pct: 30, label: "LOW" },
  MEDIUM: { color: "text-amber-300",        bg: "bg-amber-400",           pct: 65, label: "MED" },
  HIGH:   { color: "text-emerald-300",      bg: "bg-emerald-400",         pct: 92, label: "HIGH" },
};

const CONTRACT_COLORS = [
  "text-primary bg-primary/10 border-primary/25",
  "text-accent bg-accent/10 border-accent/25",
  "text-emerald-300 bg-emerald-500/10 border-emerald-500/25",
  "text-amber-300 bg-amber-500/10 border-amber-500/25",
];

interface AISignalPanelProps {
  ticks: Tick[];
  symbol: string;
  windowSize: number;
}

export function AISignalPanel({ ticks, symbol, windowSize }: AISignalPanelProps) {
  const { signal, loading, error, snapshot, analyze, lastAnalyzed } = useAISignal();
  const [autoAnalyze, setAutoAnalyze] = useState(false);
  const hasKey = !!import.meta.env.VITE_GROQ_API_KEY;

  const sentStyle = signal ? SENTIMENT_STYLES[signal.sentiment] : null;
  const confMeta  = signal ? CONFIDENCE_META[signal.confidence] : null;

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* ── Header row ── */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
            Groq · llama-3.3-70b-versatile
          </p>
          {lastAnalyzed && (
            <p className="text-[9px] font-mono text-muted-foreground/60 mt-0.5">
              Last run: {new Date(lastAnalyzed).toLocaleTimeString([], { hour12: false })}
              {snapshot && <span className="ml-1">· n={snapshot.tickCount}</span>}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Auto toggle */}
          <label className="flex items-center gap-1.5 cursor-pointer" title="Re-analyze on every 50 new ticks">
            <div
              onClick={() => setAutoAnalyze((v) => !v)}
              className={`relative w-7 h-3.5 rounded-full border transition-colors cursor-pointer ${autoAnalyze ? "bg-primary/30 border-primary/60" : "bg-secondary border-border"}`}
            >
              <div className={`absolute top-0.5 size-2.5 rounded-full transition-all ${autoAnalyze ? "left-3.5 bg-primary" : "left-0.5 bg-muted-foreground"}`} />
            </div>
            <span className="text-[9px] font-mono text-muted-foreground">Auto</span>
          </label>
          <button
            onClick={() => analyze(ticks, symbol, windowSize)}
            disabled={loading || ticks.length < 20 || !hasKey}
            className="px-3 py-1 rounded border border-primary/50 text-primary text-[9px] uppercase tracking-[0.15em] font-mono hover:bg-primary/10 disabled:opacity-35 disabled:cursor-not-allowed transition-all active:scale-95"
          >
            {loading ? (
              <span className="flex items-center gap-1"><span className="inline-block size-2 rounded-full bg-primary animate-ping" />Analyzing</span>
            ) : "Analyze"}
          </button>
        </div>
      </div>

      {/* ── No key warning ── */}
      {!hasKey && (
        <div className="text-[10px] font-mono text-amber-300 bg-amber-500/8 border border-amber-500/20 rounded p-2.5 leading-relaxed">
          Add <code className="text-foreground bg-secondary px-1 rounded">VITE_GROQ_API_KEY</code> to your <code className="text-foreground bg-secondary px-1 rounded">.env</code> to enable AI signals.
          Free key at <span className="text-foreground underline">console.groq.com</span>
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
        <div className="flex flex-col gap-2.5 animate-pulse">
          <div className="h-16 rounded border border-border bg-secondary/20" />
          {[90, 75, 55, 80].map((w, i) => (
            <div key={i} className="h-2 rounded bg-muted/30" style={{ width: `${w}%` }} />
          ))}
        </div>
      )}

      {/* ── Signal result ── */}
      {signal && !loading && sentStyle && confMeta && (
        <div className="flex flex-col gap-3">
          {/* Sentiment card */}
          <div className={`rounded border p-3 ${sentStyle.container}`}>
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-[11px] font-mono px-2 py-1 rounded font-bold tracking-widest ${sentStyle.badge}`} style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                {sentStyle.icon} {signal.sentiment}
              </span>
              <div className="flex-1" />
              <span className={`text-[9px] font-mono tracking-widest ${confMeta.color}`}>{confMeta.label} CONF</span>
            </div>
            {/* Confidence bar */}
            <div className="h-1 w-full rounded-full bg-secondary/60 overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-700 ${confMeta.bg}`} style={{ width: `${confMeta.pct}%` }} />
            </div>
          </div>

          {/* Summary */}
          <div className="text-[11px] font-mono text-foreground/85 leading-relaxed border border-border/40 rounded p-2.5 bg-card/40">
            {signal.summary}
          </div>

          {/* Key insight */}
          <div className="border-l-2 border-primary/50 pl-2.5 py-0.5">
            <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-1">Key Insight</p>
            <p className="text-[11px] font-mono text-foreground/90 leading-relaxed">{signal.topInsight}</p>
          </div>

          {/* Suggested contracts */}
          <div>
            <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-1.5">Suggested Contracts</p>
            <div className="flex flex-wrap gap-1.5">
              {signal.suggestedContracts.map((c, i) => (
                <span key={c} className={`text-[10px] font-mono px-2 py-0.5 rounded border ${CONTRACT_COLORS[i % CONTRACT_COLORS.length]}`}>
                  {c}
                </span>
              ))}
            </div>
          </div>

          {/* Risk note */}
          <div className="flex items-start gap-2 text-[10px] font-mono text-muted-foreground border border-amber-500/15 rounded p-2 bg-amber-500/5">
            <span className="text-amber-400 shrink-0 mt-0.5">⚠</span>
            <span>{signal.riskNote}</span>
          </div>

          {/* Snapshot stats mini */}
          {snapshot && (
            <div className="grid grid-cols-4 gap-1 border-t border-border/30 pt-2 mt-0">
              <SnapStat label="Hot" value={String(snapshot.hotDigit)} />
              <SnapStat label="Even" value={`${snapshot.evenPct.toFixed(0)}%`} />
              <SnapStat label={snapshot.riseFallStreak.side === "RISE" ? "Rise×" : "Fall×"} value={String(snapshot.riseFallStreak.count)} />
              <SnapStat label="Pips" value={snapshot.avgPips.toFixed(2)} />
            </div>
          )}
        </div>
      )}

      {/* ── Empty state ── */}
      {!signal && !loading && !error && (
        <div className="flex flex-col items-center justify-center py-10 gap-2">
          <div className="text-3xl opacity-15">◉</div>
          <p className="text-[10px] font-mono text-muted-foreground tracking-widest uppercase">Awaiting analysis</p>
          <p className="text-[9px] font-mono text-muted-foreground/60">
            {ticks.length < 20 ? `Need ${20 - ticks.length} more ticks…` : "Press Analyze to get an AI read"}
          </p>
        </div>
      )}
    </div>
  );
}

function SnapStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 rounded border border-border/30 bg-secondary/20 px-1.5 py-1">
      <span className="text-[8px] font-mono uppercase tracking-widest text-muted-foreground">{label}</span>
      <span className="text-[10px] font-mono text-foreground tabular-nums">{value}</span>
    </div>
  );
}
