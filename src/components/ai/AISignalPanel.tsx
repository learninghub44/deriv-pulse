import { useAISignal } from "@/hooks/use-ai-signal";
import type { Tick } from "@/hooks/use-deriv-ticks";

const SENTIMENT_STYLES = {
  BULLISH: "text-green-400 bg-green-500/10 border-green-500/30",
  BEARISH: "text-red-400 bg-red-500/10 border-red-500/30",
  NEUTRAL: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30",
};

const CONFIDENCE_STYLES = {
  LOW:    "text-muted-foreground bg-muted/20",
  MEDIUM: "text-yellow-400 bg-yellow-500/10",
  HIGH:   "text-green-400 bg-green-500/10",
};

interface AISignalPanelProps {
  ticks: Tick[];
  symbol: string;
  windowSize: number;
}

export function AISignalPanel({ ticks, symbol, windowSize }: AISignalPanelProps) {
  const { signal, loading, error, snapshot, analyze } = useAISignal();

  const hasKey = !!import.meta.env.VITE_GROQ_API_KEY;

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Header + Analyze button */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono">
            AI Signal Assistant
          </p>
          <p className="text-[9px] text-muted-foreground font-mono mt-0.5">
            Powered by Groq · llama-3.3-70b
          </p>
        </div>
        <button
          onClick={() => analyze(ticks, symbol, windowSize)}
          disabled={loading || ticks.length < 20}
          className="px-3 py-1.5 rounded border border-primary/40 text-primary text-[10px] uppercase tracking-widest font-mono hover:bg-primary/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? "Analyzing…" : "Analyze"}
        </button>
      </div>

      {/* No key warning */}
      {!hasKey && (
        <div className="text-[10px] font-mono text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded p-2">
          Add <span className="text-foreground">VITE_GROQ_API_KEY</span> to your <span className="text-foreground">.env</span> to enable AI signals.
          Get a free key at <span className="text-foreground">console.groq.com</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="text-[10px] font-mono text-red-400 bg-red-500/10 border border-red-500/20 rounded p-2">
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="flex flex-col gap-2 animate-pulse">
          {[80, 100, 60, 90].map((w, i) => (
            <div key={i} className={`h-2.5 rounded bg-muted/30`} style={{ width: `${w}%` }} />
          ))}
        </div>
      )}

      {/* Signal result */}
      {signal && !loading && (
        <div className="flex flex-col gap-2.5">
          {/* Sentiment + Confidence row */}
          <div className="flex gap-2">
            <span className={`text-[10px] font-mono px-2 py-1 rounded border font-semibold ${SENTIMENT_STYLES[signal.sentiment]}`}>
              {signal.sentiment}
            </span>
            <span className={`text-[10px] font-mono px-2 py-1 rounded font-semibold ${CONFIDENCE_STYLES[signal.confidence]}`}>
              {signal.confidence} CONFIDENCE
            </span>
            {snapshot && (
              <span className="text-[9px] font-mono text-muted-foreground ml-auto mt-1">
                n={snapshot.tickCount}
              </span>
            )}
          </div>

          {/* Summary */}
          <div className="text-[11px] font-mono text-foreground/90 leading-relaxed border border-border/40 rounded p-2.5 bg-muted/10">
            {signal.summary}
          </div>

          {/* Top Insight */}
          <div>
            <p className="text-[9px] uppercase tracking-widest text-muted-foreground font-mono mb-1">
              Key Insight
            </p>
            <p className="text-[11px] font-mono text-foreground">{signal.topInsight}</p>
          </div>

          {/* Suggested contracts */}
          <div>
            <p className="text-[9px] uppercase tracking-widest text-muted-foreground font-mono mb-1">
              Suggested Contracts
            </p>
            <div className="flex flex-wrap gap-1.5">
              {signal.suggestedContracts.map((c) => (
                <span
                  key={c}
                  className="text-[10px] font-mono px-2 py-0.5 rounded bg-primary/10 border border-primary/20 text-primary"
                >
                  {c}
                </span>
              ))}
            </div>
          </div>

          {/* Risk note */}
          <div className="text-[10px] font-mono text-muted-foreground border border-border/30 rounded p-2 bg-muted/5">
            ⚠ {signal.riskNote}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!signal && !loading && !error && (
        <div className="text-center text-muted-foreground text-[11px] py-6 font-mono">
          Press Analyze to get an AI read of the current market.
        </div>
      )}
    </div>
  );
}
