import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useDerivTicks, lastDigit, type Tick } from "@/hooks/use-deriv-ticks";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Deriv AI Intelligence Terminal — Digit Analytics" },
      {
        name: "description",
        content:
          "Real-time digit analytics for Deriv volatility indices: even/odd, over/under, hot/cold digits, and tick stream intelligence.",
      },
      { property: "og:title", content: "Deriv AI Intelligence Terminal" },
      { property: "og:description", content: "Real-time digit analytics for Deriv synthetic indices." },
    ],
  }),
  component: Index,
});

const SYMBOLS: { code: string; label: string }[] = [
  { code: "R_10", label: "Volatility 10" },
  { code: "R_25", label: "Volatility 25" },
  { code: "R_50", label: "Volatility 50" },
  { code: "R_75", label: "Volatility 75" },
  { code: "R_100", label: "Volatility 100" },
  { code: "1HZ10V", label: "Volatility 10 (1s)" },
  { code: "1HZ25V", label: "Volatility 25 (1s)" },
  { code: "1HZ50V", label: "Volatility 50 (1s)" },
  { code: "1HZ75V", label: "Volatility 75 (1s)" },
  { code: "1HZ100V", label: "Volatility 100 (1s)" },
];

function Index() {
  const [symbol, setSymbol] = useState("R_100");
  const [overUnder, setOverUnder] = useState(5);
  const [windowSize, setWindowSize] = useState(100);
  const { ticks, status } = useDerivTicks(symbol);

  return (
    <div className="min-h-screen bg-background text-foreground font-mono">
      <Header status={status} symbol={symbol} ticks={ticks} />
      <div className="border-b border-border bg-card/40 px-4 py-2 flex flex-wrap items-center gap-3 text-xs">
        <span className="text-muted-foreground uppercase tracking-widest">Symbol</span>
        <select
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          className="bg-secondary border border-border rounded px-2 py-1 text-foreground"
        >
          {SYMBOLS.map((s) => (
            <option key={s.code} value={s.code}>
              {s.label}
            </option>
          ))}
        </select>
        <span className="text-muted-foreground uppercase tracking-widest ml-4">Window</span>
        {[50, 100, 250, 500, 1000].map((n) => (
          <button
            key={n}
            onClick={() => setWindowSize(n)}
            className={`px-2 py-1 rounded border ${
              windowSize === n
                ? "border-primary text-primary bg-primary/10"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {n}
          </button>
        ))}
        <span className="text-muted-foreground uppercase tracking-widest ml-4">Over/Under barrier</span>
        <select
          value={overUnder}
          onChange={(e) => setOverUnder(Number(e.target.value))}
          className="bg-secondary border border-border rounded px-2 py-1 text-foreground"
        >
          {Array.from({ length: 9 }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>

      <main className="grid grid-cols-1 lg:grid-cols-3 gap-4 p-4">
        <DigitFrequency ticks={ticks} windowSize={windowSize} />
        <EvenOddPanel ticks={ticks} windowSize={windowSize} />
        <OverUnderPanel ticks={ticks} windowSize={windowSize} barrier={overUnder} />
        <div className="lg:col-span-3">
          <TickStream ticks={ticks} windowSize={Math.min(windowSize, 200)} />
        </div>
        <div className="lg:col-span-3">
          <Disclaimer />
        </div>
      </main>
    </div>
  );
}

function Header({ status, symbol, ticks }: { status: string; symbol: string; ticks: Tick[] }) {
  const last = ticks[ticks.length - 1];
  const prev = ticks[ticks.length - 2];
  const change = last && prev ? last.quote - prev.quote : 0;
  const dir = change > 0 ? "up" : change < 0 ? "down" : "flat";
  const dot =
    status === "open"
      ? "bg-bull"
      : status === "connecting"
      ? "bg-warn animate-pulse"
      : "bg-bear";
  return (
    <header className="border-b border-border bg-card px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="size-8 rounded bg-primary/15 border border-primary/30 grid place-items-center text-primary font-bold">
          D
        </div>
        <div>
          <div className="text-sm font-semibold tracking-wide">DERIV AI INTELLIGENCE TERMINAL</div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Digit Analytics Core · v0.1
          </div>
        </div>
      </div>
      <div className="flex items-center gap-6">
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{symbol}</div>
          <div
            className={`text-xl font-bold tabular-nums ${
              dir === "up" ? "text-bull" : dir === "down" ? "text-bear" : "text-foreground"
            }`}
          >
            {last ? last.quote.toFixed(last.pip_size) : "—"}
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className={`size-2 rounded-full ${dot}`} />
          <span className="uppercase tracking-widest text-muted-foreground">{status}</span>
        </div>
      </div>
    </header>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{title}</h2>
        {subtitle && <span className="text-[10px] text-muted-foreground">{subtitle}</span>}
      </div>
      {children}
    </section>
  );
}

function useDigitWindow(ticks: Tick[], windowSize: number) {
  return useMemo(() => {
    const slice = ticks.slice(-windowSize);
    const digits = slice.map((t) => lastDigit(t.quote, t.pip_size));
    return { slice, digits };
  }, [ticks, windowSize]);
}

function DigitFrequency({ ticks, windowSize }: { ticks: Tick[]; windowSize: number }) {
  const { digits } = useDigitWindow(ticks, windowSize);
  const counts = useMemo(() => {
    const c = Array(10).fill(0) as number[];
    digits.forEach((d) => (c[d] += 1));
    return c;
  }, [digits]);
  const total = digits.length || 1;
  const max = Math.max(...counts, 1);
  const hot = counts.indexOf(max);
  const min = Math.min(...counts);
  const cold = counts.indexOf(min);
  return (
    <Panel title="Digit Frequency" subtitle={`n = ${digits.length}`}>
      <div className="space-y-1.5">
        {counts.map((c, d) => {
          const pct = (c / total) * 100;
          const isHot = d === hot && c > 0;
          const isCold = d === cold && digits.length >= 10;
          return (
            <div key={d} className="flex items-center gap-2 text-xs">
              <span className="w-4 tabular-nums text-muted-foreground">{d}</span>
              <div className="flex-1 h-4 bg-secondary/60 rounded relative overflow-hidden">
                <div
                  className={`h-full rounded ${
                    isHot ? "bg-bull" : isCold ? "bg-bear" : "bg-accent/70"
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="w-12 text-right tabular-nums">{pct.toFixed(1)}%</span>
              <span className="w-8 text-right tabular-nums text-muted-foreground">{c}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex items-center justify-between text-[10px] uppercase tracking-widest text-muted-foreground">
        <span>
          Hot <span className="text-bull">{hot}</span>
        </span>
        <span>Expected 10.0%</span>
        <span>
          Cold <span className="text-bear">{cold}</span>
        </span>
      </div>
    </Panel>
  );
}

function EvenOddPanel({ ticks, windowSize }: { ticks: Tick[]; windowSize: number }) {
  const { digits } = useDigitWindow(ticks, windowSize);
  const evens = digits.filter((d) => d % 2 === 0).length;
  const odds = digits.length - evens;
  const total = digits.length || 1;
  const evenPct = (evens / total) * 100;
  const oddPct = (odds / total) * 100;
  const deviation = evenPct - 50;
  return (
    <Panel title="Even / Odd" subtitle={`n = ${digits.length}`}>
      <div className="flex items-end gap-4">
        <Stat label="Even" value={`${evenPct.toFixed(1)}%`} tone="bull" big />
        <Stat label="Odd" value={`${oddPct.toFixed(1)}%`} tone="bear" big />
      </div>
      <div className="mt-3 h-3 rounded overflow-hidden flex bg-secondary/60">
        <div className="bg-bull" style={{ width: `${evenPct}%` }} />
        <div className="bg-bear" style={{ width: `${oddPct}%` }} />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
        <Mini label="Expected" value="50 / 50" />
        <Mini
          label="Deviation"
          value={`${deviation >= 0 ? "+" : ""}${deviation.toFixed(1)}%`}
          tone={Math.abs(deviation) > 5 ? "warn" : undefined}
        />
        <Mini label="Streak" value={`${currentStreak(digits, (d) => d % 2 === 0)}`} />
      </div>
    </Panel>
  );
}

function OverUnderPanel({
  ticks,
  windowSize,
  barrier,
}: {
  ticks: Tick[];
  windowSize: number;
  barrier: number;
}) {
  const { digits } = useDigitWindow(ticks, windowSize);
  const over = digits.filter((d) => d > barrier).length;
  const under = digits.filter((d) => d < barrier).length;
  const eq = digits.filter((d) => d === barrier).length;
  const total = digits.length || 1;
  const overPct = (over / total) * 100;
  const underPct = (under / total) * 100;
  const eqPct = (eq / total) * 100;
  const expectedOver = ((9 - barrier) / 10) * 100;
  const expectedUnder = (barrier / 10) * 100;
  return (
    <Panel title={`Over / Under ${barrier}`} subtitle={`n = ${digits.length}`}>
      <div className="flex items-end gap-4">
        <Stat label={`Over ${barrier}`} value={`${overPct.toFixed(1)}%`} tone="bull" big />
        <Stat label={`Under ${barrier}`} value={`${underPct.toFixed(1)}%`} tone="bear" big />
      </div>
      <div className="mt-3 h-3 rounded overflow-hidden flex bg-secondary/60">
        <div className="bg-bear" style={{ width: `${underPct}%` }} />
        <div className="bg-muted-foreground/40" style={{ width: `${eqPct}%` }} />
        <div className="bg-bull" style={{ width: `${overPct}%` }} />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
        <Mini label={`Expected Over`} value={`${expectedOver.toFixed(0)}%`} />
        <Mini label={`Expected Under`} value={`${expectedUnder.toFixed(0)}%`} />
        <Mini label={`Equals ${barrier}`} value={`${eqPct.toFixed(1)}%`} />
      </div>
    </Panel>
  );
}

function TickStream({ ticks, windowSize }: { ticks: Tick[]; windowSize: number }) {
  const { slice, digits } = useDigitWindow(ticks, windowSize);
  return (
    <Panel title="Last Digit Stream" subtitle={`latest ${slice.length} ticks · newest right`}>
      <div className="flex flex-wrap gap-1">
        {digits.map((d, i) => {
          const isLast = i === digits.length - 1;
          const prev = i > 0 ? slice[i - 1].quote : null;
          const cur = slice[i]?.quote;
          const up = prev !== null && cur !== undefined && cur > prev;
          const down = prev !== null && cur !== undefined && cur < prev;
          return (
            <div
              key={`${slice[i].epoch}-${i}`}
              title={`${slice[i].quote.toFixed(slice[i].pip_size)} @ ${new Date(
                slice[i].epoch * 1000,
              ).toLocaleTimeString()}`}
              className={`size-7 grid place-items-center text-[11px] tabular-nums rounded border ${
                isLast
                  ? "border-primary text-primary bg-primary/10 animate-in fade-in zoom-in"
                  : up
                  ? "border-bull/30 text-bull bg-bull/5"
                  : down
                  ? "border-bear/30 text-bear bg-bear/5"
                  : "border-border text-muted-foreground"
              } ${d % 2 === 0 ? "" : ""}`}
            >
              {d}
            </div>
          );
        })}
        {digits.length === 0 && (
          <div className="text-xs text-muted-foreground">Waiting for tick history…</div>
        )}
      </div>
    </Panel>
  );
}

function Stat({
  label,
  value,
  tone,
  big,
}: {
  label: string;
  value: string;
  tone?: "bull" | "bear" | "warn";
  big?: boolean;
}) {
  const color =
    tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : tone === "warn" ? "text-warn" : "";
  return (
    <div className="flex-1">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`tabular-nums font-bold ${big ? "text-3xl" : "text-lg"} ${color}`}>{value}</div>
    </div>
  );
}

function Mini({ label, value, tone }: { label: string; value: string; tone?: "warn" }) {
  return (
    <div className="rounded border border-border bg-secondary/40 px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`tabular-nums ${tone === "warn" ? "text-warn" : "text-foreground"}`}>{value}</div>
    </div>
  );
}

function currentStreak(digits: number[], pred: (d: number) => boolean): number {
  let n = 0;
  for (let i = digits.length - 1; i >= 0; i--) {
    if (pred(digits[i]) === pred(digits[digits.length - 1])) n++;
    else break;
  }
  return n * (pred(digits[digits.length - 1] ?? 0) ? 1 : -1);
}

function Disclaimer() {
  return (
    <div className="rounded border border-border bg-card/60 p-3 text-[11px] text-muted-foreground leading-relaxed">
      <span className="text-warn font-semibold uppercase tracking-widest">Notice ·</span> This terminal
      provides statistical analysis of historical and live tick data from the Deriv API. Past
      distributions are not predictions of future ticks. Nothing here is financial advice or a guarantee
      of profit.
    </div>
  );
}
