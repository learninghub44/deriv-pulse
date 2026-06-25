import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  useDerivTicks,
  lastDigit,
  fetchActiveSymbols,
  type Tick,
} from "@/hooks/use-deriv-ticks";
import { useAuth } from "@/hooks/use-auth";
import { useDerivOAuth } from "@/hooks/use-deriv-oauth";
import { useWatchlists } from "@/hooks/use-watchlists";
import { useAlerts } from "@/hooks/use-alerts";
import { AuthModal } from "@/components/auth/AuthModal";
import { DerivAuthPanel } from "@/components/auth/DerivAuthPanel";
import { TradeJournalPanel } from "@/components/journal/TradeJournalPanel";
import { AlertsPanel } from "@/components/alerts/AlertsPanel";
import { AISignalPanel } from "@/components/ai/AISignalPanel";
import { MarketAnalyzerPanel } from "@/components/ai/MarketAnalyzerPanel";
import { EntryPointScanner } from "@/components/signals/EntryPointScanner";
import { DigitWheel, VolatilityGauge, TickPulseRing } from "@/components/charts/CircularPanels";
import { TradingPanel } from "@/components/trading/TradingPanel";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Deriv AI Intelligence Terminal" },
      {
        name: "description",
        content:
          "Institutional-grade real-time digit analytics, volatility intelligence and tick stream analysis for Deriv synthetic indices, forex, and crypto.",
      },
      { property: "og:title", content: "Deriv AI Intelligence Terminal" },
      {
        property: "og:description",
        content:
          "Real-time digit analytics, volatility intelligence, and tick stream analysis for Deriv markets.",
      },
    ],
  }),
  component: Index,
});

/* ============================================================
 *                          DATA
 * ========================================================== */

// Curated, well-known symbol set (used as immediate fallback while
// the live `active_symbols` payload loads). Real symbols available
// on Deriv at time of writing.
const FALLBACK_SYMBOLS: SymbolMeta[] = [
  // Volatility (2s ticks)
  { symbol: "R_10",  display_name: "Volatility 10 Index",  market: "synthetic_index", submarket: "random_index", pip: 0.001 },
  { symbol: "R_25",  display_name: "Volatility 25 Index",  market: "synthetic_index", submarket: "random_index", pip: 0.001 },
  { symbol: "R_50",  display_name: "Volatility 50 Index",  market: "synthetic_index", submarket: "random_index", pip: 0.0001 },
  { symbol: "R_75",  display_name: "Volatility 75 Index",  market: "synthetic_index", submarket: "random_index", pip: 0.0001 },
  { symbol: "R_100", display_name: "Volatility 100 Index", market: "synthetic_index", submarket: "random_index", pip: 0.01 },
  // Volatility (1s ticks)
  { symbol: "1HZ10V",  display_name: "Volatility 10 (1s) Index",  market: "synthetic_index", submarket: "random_index", pip: 0.01 },
  { symbol: "1HZ25V",  display_name: "Volatility 25 (1s) Index",  market: "synthetic_index", submarket: "random_index", pip: 0.01 },
  { symbol: "1HZ50V",  display_name: "Volatility 50 (1s) Index",  market: "synthetic_index", submarket: "random_index", pip: 0.01 },
  { symbol: "1HZ75V",  display_name: "Volatility 75 (1s) Index",  market: "synthetic_index", submarket: "random_index", pip: 0.01 },
  { symbol: "1HZ100V", display_name: "Volatility 100 (1s) Index", market: "synthetic_index", submarket: "random_index", pip: 0.01 },
  // Boom / Crash
  { symbol: "BOOM300N",  display_name: "Boom 300 Index",  market: "synthetic_index", submarket: "crash_boom", pip: 0.001 },
  { symbol: "BOOM500",   display_name: "Boom 500 Index",  market: "synthetic_index", submarket: "crash_boom", pip: 0.001 },
  { symbol: "BOOM1000",  display_name: "Boom 1000 Index", market: "synthetic_index", submarket: "crash_boom", pip: 0.001 },
  { symbol: "CRASH300N", display_name: "Crash 300 Index", market: "synthetic_index", submarket: "crash_boom", pip: 0.01 },
  { symbol: "CRASH500",  display_name: "Crash 500 Index", market: "synthetic_index", submarket: "crash_boom", pip: 0.01 },
  { symbol: "CRASH1000", display_name: "Crash 1000 Index", market: "synthetic_index", submarket: "crash_boom", pip: 0.01 },
  // Jump
  { symbol: "JD10",  display_name: "Jump 10 Index",  market: "synthetic_index", submarket: "jump_index", pip: 0.01 },
  { symbol: "JD25",  display_name: "Jump 25 Index",  market: "synthetic_index", submarket: "jump_index", pip: 0.01 },
  { symbol: "JD50",  display_name: "Jump 50 Index",  market: "synthetic_index", submarket: "jump_index", pip: 0.01 },
  { symbol: "JD75",  display_name: "Jump 75 Index",  market: "synthetic_index", submarket: "jump_index", pip: 0.01 },
  { symbol: "JD100", display_name: "Jump 100 Index", market: "synthetic_index", submarket: "jump_index", pip: 0.01 },
  // Step
  { symbol: "stpRNG", display_name: "Step Index", market: "synthetic_index", submarket: "step_index", pip: 0.1 },
  // Range Break
  { symbol: "RDBEAR", display_name: "Bear Market Index", market: "synthetic_index", submarket: "smart_fx", pip: 0.0001 },
  { symbol: "RDBULL", display_name: "Bull Market Index", market: "synthetic_index", submarket: "smart_fx", pip: 0.0001 },
  // Forex majors
  { symbol: "frxEURUSD", display_name: "EUR/USD", market: "forex", submarket: "major_pairs", pip: 0.00001 },
  { symbol: "frxGBPUSD", display_name: "GBP/USD", market: "forex", submarket: "major_pairs", pip: 0.00001 },
  { symbol: "frxUSDJPY", display_name: "USD/JPY", market: "forex", submarket: "major_pairs", pip: 0.001   },
  { symbol: "frxAUDUSD", display_name: "AUD/USD", market: "forex", submarket: "major_pairs", pip: 0.00001 },
  { symbol: "frxUSDCAD", display_name: "USD/CAD", market: "forex", submarket: "major_pairs", pip: 0.00001 },
  { symbol: "frxUSDCHF", display_name: "USD/CHF", market: "forex", submarket: "major_pairs", pip: 0.00001 },
  // Crypto
  { symbol: "cryBTCUSD", display_name: "BTC/USD", market: "cryptocurrency", submarket: "non_stable_coin", pip: 0.01 },
  { symbol: "cryETHUSD", display_name: "ETH/USD", market: "cryptocurrency", submarket: "non_stable_coin", pip: 0.01 },
];

type SymbolMeta = {
  symbol: string;
  display_name: string;
  market: string;
  submarket: string;
  pip: number;
};

const MARKET_LABEL: Record<string, string> = {
  synthetic_index: "Synthetics",
  forex: "Forex",
  cryptocurrency: "Crypto",
  indices: "Indices",
  commodities: "Commodities",
};

const SUBMARKET_LABEL: Record<string, string> = {
  random_index: "Volatility",
  crash_boom: "Boom / Crash",
  jump_index: "Jump",
  step_index: "Step",
  smart_fx: "Range Break",
  major_pairs: "Majors",
  minor_pairs: "Minors",
  non_stable_coin: "Coins",
};

/* ============================================================
 *                          PAGE
 * ========================================================== */

function Index() {
  const [symbol, setSymbol] = useState("R_100");
  const [overUnder, setOverUnder] = useState(5);
  const [matchDigit, setMatchDigit] = useState(0);
  const [windowSize, setWindowSize] = useState(100);
  const [symbols, setSymbols] = useState<SymbolMeta[]>(FALLBACK_SYMBOLS);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [showJournal, setShowJournal] = useState(false);
  const [showAlerts, setShowAlerts] = useState(true);
  const [showAI, setShowAI] = useState(false);
  const [showAnalyzer, setShowAnalyzer] = useState(false);
  const [showScanner, setShowScanner] = useState(true);
  const [showTrading, setShowTrading] = useState(false);
  const [showDerivAuth, setShowDerivAuth] = useState(false);
  const [alertConfig, setAlertConfig] = useState<Partial<import("@/hooks/use-alerts").AlertConfig>>({});

  const { user, profile, loading: authLoading, signOut } = useAuth();
  const { watchlists, defaultList, addSymbol, removeSymbol } = useWatchlists(user?.id);
  const derivOAuth = useDerivOAuth();

  // Auto-open trading panel when Deriv account connects
  useEffect(() => {
    if (derivOAuth.isAuthenticated) {
      setShowTrading(true);
    }
  }, [derivOAuth.isAuthenticated]);
  const { ticks, status } = useDerivTicks(symbol); // public WS — authenticated WS is for trading only

  const { alerts, dismiss, clearAll, testAlarm } = useAlerts(ticks, symbol, windowSize, alertConfig);

  useEffect(() => {
    let cancelled = false;
    fetchActiveSymbols()
      .then((live) => {
        if (cancelled || !live.length) return;
        // Merge: prefer live entries, keep curated ordering for known symbols
        const map = new Map(live.map((s) => [s.symbol, s]));
        const merged: SymbolMeta[] = [
          ...FALLBACK_SYMBOLS.map((f) => map.get(f.symbol) ?? f),
          ...live.filter((s) => !FALLBACK_SYMBOLS.some((f) => f.symbol === s.symbol)),
        ];
        setSymbols(merged);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const meta = symbols.find((s) => s.symbol === symbol) ?? FALLBACK_SYMBOLS[4];

  return (
    <div className="min-h-screen bg-background text-foreground font-mono flex flex-col">
      <TopBar
          status={status}
          meta={meta}
          ticks={ticks}
          onToggleSidebar={() => setSidebarOpen((v) => !v)}
          user={user}
          profile={profile}
          authLoading={authLoading}
          onSignIn={() => setShowAuth(true)}
          onSignOut={signOut}
          onToggleJournal={() => setShowJournal((v) => !v)}
          showJournal={showJournal}
          onToggleAlerts={() => setShowAlerts((v) => !v)}
          showAlerts={showAlerts}
          alertCount={alerts.length}
          onToggleAI={() => setShowAI((v) => !v)}
          showAI={showAI}
          onToggleAnalyzer={() => setShowAnalyzer((v) => !v)}
          showAnalyzer={showAnalyzer}
          onToggleScanner={() => setShowScanner((v) => !v)}
          showScanner={showScanner}
          onToggleTrading={() => setShowTrading((v) => !v)}
          showTrading={showTrading}
          derivConnected={derivOAuth.isAuthenticated}
          onToggleDerivAuth={() => setShowDerivAuth((v) => !v)}
          showDerivAuth={showDerivAuth}
        />
      <div className="flex-1 grid grid-cols-1 xl:grid-cols-[260px_1fr] min-h-0">
        <SymbolSidebar
          symbols={symbols}
          active={symbol}
          onSelect={(s) => {
            setSymbol(s);
            setSidebarOpen(false);
          }}
          open={sidebarOpen}
        />
        <div className="flex flex-col min-w-0">
          <Toolbar
            windowSize={windowSize}
            setWindowSize={setWindowSize}
            overUnder={overUnder}
            setOverUnder={setOverUnder}
            matchDigit={matchDigit}
            setMatchDigit={setMatchDigit}
          />
          <main className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3 p-3 min-w-0">
            <div className="xl:col-span-4 md:col-span-2"><PriceChart ticks={ticks} meta={meta} /></div>
            <div className="xl:col-span-2 md:col-span-2"><MarketStats ticks={ticks} windowSize={windowSize} /></div>

            <div className="xl:col-span-2"><DigitFrequency ticks={ticks} windowSize={windowSize} /></div>
            <div className="xl:col-span-2"><EvenOddPanel ticks={ticks} windowSize={windowSize} /></div>
            <div className="xl:col-span-2"><RiseFallPanel ticks={ticks} windowSize={windowSize} /></div>

            <div className="xl:col-span-2"><OverUnderPanel ticks={ticks} windowSize={windowSize} barrier={overUnder} /></div>
            <div className="xl:col-span-2"><MatchDiffersPanel ticks={ticks} windowSize={windowSize} digit={matchDigit} /></div>
            <div className="xl:col-span-2"><VolatilityPanel ticks={ticks} windowSize={windowSize} /></div>

            {/* Circular visualizations — same live data, radial presentation */}
            <div className="xl:col-span-2"><DigitWheel ticks={ticks} windowSize={windowSize} /></div>
            <div className="xl:col-span-2"><VolatilityGauge ticks={ticks} windowSize={windowSize} /></div>
            <div className="xl:col-span-2"><TickPulseRing ticks={ticks} /></div>

            <div className="xl:col-span-4 md:col-span-2"><TickStream ticks={ticks} windowSize={Math.min(windowSize, 200)} /></div>
            <div className="xl:col-span-2 md:col-span-2"><RecentTicksTable ticks={ticks} /></div>

            <div className="xl:col-span-6 md:col-span-2"><Disclaimer /></div>

            {showAlerts && (
              <div className="xl:col-span-3 md:col-span-2">
                <Panel title="Pattern Alerts" subtitle={alerts.length > 0 ? `${alerts.length} active` : "monitoring"}>
                  <AlertsPanel
                    alerts={alerts}
                    onDismiss={dismiss}
                    onClearAll={clearAll}
                    config={alertConfig}
                    onConfigChange={(cfg) => setAlertConfig((prev) => ({ ...prev, ...cfg }))}
                    testAlarm={testAlarm}
                  />
                </Panel>
              </div>
            )}

            {showAI && (
              <div className={showAlerts ? "xl:col-span-3 md:col-span-2" : "xl:col-span-6 md:col-span-2"}>
                <Panel title="AI Signal Assistant" subtitle="Groq · llama-3.3-70b">
                  <AISignalPanel ticks={ticks} symbol={symbol} windowSize={windowSize} />
                </Panel>
              </div>
            )}

            {showAnalyzer && (
              <div className="xl:col-span-6 md:col-span-2">
                <Panel title="Market Analyzer" subtitle="Senior Trader · 10yr Experience · Groq AI">
                  <MarketAnalyzerPanel ticks={ticks} symbol={symbol} windowSize={windowSize} />
                </Panel>
              </div>
            )}

            {showScanner && (
              <div className="xl:col-span-6 md:col-span-2">
                <Panel title="⚡ Entry Point Scanner" subtitle="RSI · EMA · BB · MTF · Pattern Recognition">
                  <EntryPointScanner ticks={ticks} symbol={symbol} windowSize={windowSize} />
                </Panel>
              </div>
            )}

            {showJournal && user && (
              <div className="xl:col-span-6 md:col-span-2">
                <TradeJournalPanel userId={user.id} currentSymbol={symbol} />
              </div>
            )}

            {showDerivAuth && (
              <div className="xl:col-span-3 md:col-span-2">
                <Panel title="Deriv Account" subtitle="OAuth 2.0 · PKCE">
                  <DerivAuthPanel />
                </Panel>
              </div>
            )}

            {showTrading && (
              <div className={showDerivAuth ? "xl:col-span-3 md:col-span-2" : "xl:col-span-3 md:col-span-2"}>
                <Panel title="Live Trading" subtitle={derivOAuth.activeAccount ? `${derivOAuth.activeAccount.account_type.toUpperCase()} · ${derivOAuth.activeAccount.account_id}` : "Connect Deriv account"}>
                  {derivOAuth.isAuthenticated ? (
                    <TradingPanel
                      apiToken={derivOAuth.activeApiToken}
                      accessToken={derivOAuth.accessToken}
                      symbol={symbol}
                      currentPrice={ticks[ticks.length - 1]?.quote}
                      pipSize={ticks[ticks.length - 1]?.pip_size ?? meta.pip ? Math.round(-Math.log10(meta.pip)) : 2}
                      accounts={derivOAuth.accounts}
                      activeAccount={derivOAuth.activeAccount}
                      onSwitchAccount={(id) => derivOAuth.switchAccount(id)}
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
                      <div className="text-2xl opacity-15">⚡</div>
                      <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Deriv account not connected</p>
                      <button
                        onClick={() => setShowDerivAuth(true)}
                        className="px-3 py-1.5 rounded border border-primary/50 text-primary text-[9px] font-mono uppercase tracking-widest hover:bg-primary/10 transition-colors"
                      >
                        Connect Deriv
                      </button>
                    </div>
                  )}
                </Panel>
              </div>
            )}
          </main>
        </div>
      </div>
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
      <StatusBar status={status} ticks={ticks} meta={meta} symbolCount={symbols.length} />
    </div>
  );
}

/* ============================================================
 *                       LAYOUT BARS
 * ========================================================== */

function TopBar({
  status, meta, ticks, onToggleSidebar,
  user, profile, authLoading, onSignIn, onSignOut, onToggleJournal, showJournal,
  onToggleAlerts, showAlerts, alertCount, onToggleAI, showAI,
  onToggleAnalyzer, showAnalyzer,
  onToggleScanner, showScanner,
  onToggleTrading, showTrading,
  derivConnected, onToggleDerivAuth, showDerivAuth,
}: {
  status: string; meta: SymbolMeta; ticks: Tick[]; onToggleSidebar: () => void;
  user: import("@supabase/supabase-js").User | null;
  profile: import("@/lib/database.types").Database["public"]["Tables"]["profiles"]["Row"] | null;
  authLoading: boolean; onSignIn: () => void; onSignOut: () => void;
  onToggleJournal: () => void; showJournal: boolean;
  onToggleAlerts: () => void; showAlerts: boolean; alertCount: number;
  onToggleAI: () => void; showAI: boolean;
  onToggleAnalyzer: () => void; showAnalyzer: boolean;
  onToggleScanner: () => void; showScanner: boolean;
  onToggleTrading: () => void; showTrading: boolean;
  derivConnected: boolean; onToggleDerivAuth: () => void; showDerivAuth: boolean;
}) {
  const last = ticks[ticks.length - 1];
  const prev = ticks[ticks.length - 2];
  const first = ticks[0];
  const change = last && prev ? last.quote - prev.quote : 0;
  const sessionChange = last && first ? last.quote - first.quote : 0;
  const sessionPct = last && first && first.quote ? (sessionChange / first.quote) * 100 : 0;
  const dir = change > 0 ? "up" : change < 0 ? "down" : "flat";
  const dotColor = status === "open" ? "bg-bull shadow-[0_0_6px_rgba(74,222,128,0.7)]" : status === "connecting" ? "bg-warn animate-pulse" : "bg-bear";
  const criticalAlerts = alertCount > 0;

  return (
    <header className="border-b border-border bg-card/98 backdrop-blur-md px-4 py-2 flex items-center gap-4 sticky top-0 z-30" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
      {/* Mobile sidebar toggle */}
      <button
        onClick={onToggleSidebar}
        className="xl:hidden rounded border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all"
        aria-label="Toggle markets"
      >
        ☰
      </button>

      {/* Logo + brand */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="relative size-8 rounded bg-primary/15 border border-primary/40 grid place-items-center text-primary font-bold shrink-0 shadow-[0_0_12px_rgba(120,200,120,0.15)]">
          <span className="text-sm font-bold tracking-tight">D</span>
          <div className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-primary/60 border border-background" />
        </div>
        <div className="min-w-0">
          <div className="text-[13px] font-semibold tracking-wide truncate text-foreground" style={{ letterSpacing: "0.06em" }}>
            DERIV PULSE
          </div>
          <div className="text-[9px] uppercase tracking-[0.25em] text-muted-foreground/70 truncate">
            AI Intelligence Terminal · v0.4
          </div>
        </div>
      </div>

      {/* Symbol chip */}
      <div className="hidden md:flex items-center gap-2 px-2.5 py-1 rounded bg-secondary/70 border border-border min-w-0">
        <span className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground">SYM</span>
        <span className="text-[12px] font-semibold truncate">{meta.display_name}</span>
        <span className="text-[9px] text-muted-foreground ml-1 font-mono truncate">{meta.symbol}</span>
      </div>

      {/* Price block */}
      <div className="ml-auto flex items-center gap-4">
        <div className="text-right hidden lg:block">
          <div className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground">Last Price</div>
          <div className={`text-xl font-bold tabular-nums leading-none tracking-tight ${dir === "up" ? "text-bull" : dir === "down" ? "text-bear" : "text-foreground"}`} style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            {last ? last.quote.toFixed(last.pip_size) : "—"}
          </div>
        </div>
        <div className="text-right hidden sm:block">
          <div className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground">Session</div>
          <div className={`text-sm tabular-nums leading-none font-mono ${sessionChange > 0 ? "text-bull" : sessionChange < 0 ? "text-bear" : "text-muted-foreground"}`}>
            {sessionChange >= 0 ? "+" : ""}{sessionChange.toFixed(last?.pip_size ?? 2)}
            <span className="text-[10px] text-muted-foreground ml-1">({sessionPct >= 0 ? "+" : ""}{sessionPct.toFixed(3)}%)</span>
          </div>
        </div>

        {/* Feed status */}
        <div className="flex items-center gap-2 text-[10px]">
          <span className={`size-2 rounded-full ${dotColor}`} />
          <span className="uppercase tracking-[0.2em] text-muted-foreground hidden sm:inline font-mono">{status}</span>
        </div>

        {/* Action buttons */}
        {!authLoading && (
          <div className="flex items-center gap-1.5 border-l border-border pl-3">
            {/* Alerts — always visible */}
            <button
              onClick={onToggleAlerts}
              className={`relative px-2.5 py-1 rounded border text-[9px] uppercase tracking-[0.15em] font-mono transition-all ${
                showAlerts
                  ? "border-amber-500/60 text-amber-300 bg-amber-500/10 shadow-[0_0_8px_rgba(245,158,11,0.1)]"
                  : "border-border text-muted-foreground hover:text-foreground hover:border-border/80"
              }`}
            >
              ◎ Alerts
              {alertCount > 0 && (
                <span className={`absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full text-[8px] font-bold grid place-items-center ${criticalAlerts ? "bg-red-500 text-white shadow-[0_0_6px_rgba(239,68,68,0.7)]" : "bg-amber-500 text-black"}`}>
                  {alertCount > 99 ? "99+" : alertCount}
                </span>
              )}
            </button>

            {user ? (
              <>
                <button
                  onClick={onToggleAI}
                  className={`px-2.5 py-1 rounded border text-[9px] uppercase tracking-[0.15em] font-mono transition-all ${
                    showAI
                      ? "border-primary/60 text-primary bg-primary/10 shadow-[0_0_8px_rgba(120,200,120,0.1)]"
                      : "border-border text-muted-foreground hover:text-foreground hover:border-border/80"
                  }`}
                >
                  ◈ AI Signal
                </button>
                <button
                  onClick={onToggleAnalyzer}
                  className={`px-2.5 py-1 rounded border text-[9px] uppercase tracking-[0.15em] font-mono transition-all ${
                    showAnalyzer
                      ? "border-accent/60 text-accent bg-accent/10 shadow-[0_0_8px_rgba(120,180,255,0.1)]"
                      : "border-border text-muted-foreground hover:text-foreground hover:border-border/80"
                  }`}
                >
                  ⊞ Analyzer
                </button>
                <button
                  onClick={onToggleScanner}
                  className={`px-2.5 py-1 rounded border text-[9px] uppercase tracking-[0.15em] font-mono transition-all ${
                    showScanner
                      ? "border-cyan-500/60 text-cyan-300 bg-cyan-500/10 shadow-[0_0_8px_rgba(34,211,238,0.15)]"
                      : "border-border text-muted-foreground hover:text-foreground hover:border-border/80"
                  }`}
                >
                  ⚡ Scanner
                </button>

                {/* Deriv connect button — always visible when user logged in */}
                <button
                  onClick={onToggleDerivAuth}
                  className={`px-2.5 py-1 rounded border text-[9px] uppercase tracking-[0.15em] font-mono transition-all ${
                    showDerivAuth
                      ? "border-emerald-500/60 text-emerald-300 bg-emerald-500/10"
                      : derivConnected
                      ? "border-bull/40 text-bull/80 bg-bull/5"
                      : "border-border text-muted-foreground hover:text-foreground hover:border-border/80"
                  }`}
                >
                  {derivConnected ? "◉ Deriv" : "○ Deriv"}
                </button>

                {/* Live trading button */}
                <button
                  onClick={onToggleTrading}
                  className={`px-2.5 py-1 rounded border text-[9px] uppercase tracking-[0.15em] font-mono transition-all ${
                    showTrading
                      ? "border-bull/60 text-bull bg-bull/10 shadow-[0_0_8px_rgba(74,222,128,0.15)]"
                      : "border-border text-muted-foreground hover:text-foreground hover:border-border/80"
                  }`}
                >
                  ◈ Trade
                </button>
                <button
                  onClick={onToggleJournal}
                  className={`px-2.5 py-1 rounded border text-[9px] uppercase tracking-[0.15em] font-mono transition-all ${
                    showJournal
                      ? "border-accent/60 text-accent bg-accent/10"
                      : "border-border text-muted-foreground hover:text-foreground hover:border-border/80"
                  }`}
                >
                  ☰ Journal
                </button>
                <span className="text-[9px] text-muted-foreground hidden lg:block font-mono truncate max-w-[90px]">
                  {profile?.display_name ?? user.email?.split("@")[0]}
                </span>
                <button
                  onClick={onSignOut}
                  className="px-2 py-1 rounded border border-border text-[9px] uppercase tracking-[0.15em] font-mono text-muted-foreground hover:text-bear hover:border-bear/60 transition-all"
                >
                  Exit
                </button>
              </>
            ) : (
              <button
                onClick={onSignIn}
                className="px-2.5 py-1 rounded border border-primary/60 text-[9px] uppercase tracking-[0.15em] font-mono text-primary bg-primary/10 hover:bg-primary/20 transition-all"
              >
                Sign In
              </button>
            )}
          </div>
        )}
      </div>

      {/* Copyright watermark — subtle, on right */}
      <div className="hidden xl:block absolute bottom-0.5 right-3 text-[8px] font-mono text-muted-foreground/25 select-none pointer-events-none">
        © {new Date().getFullYear()} Deriv Pulse · Proprietary
      </div>
    </header>
  );
}

function Toolbar({
  windowSize,
  setWindowSize,
  overUnder,
  setOverUnder,
  matchDigit,
  setMatchDigit,
}: {
  windowSize: number;
  setWindowSize: (n: number) => void;
  overUnder: number;
  setOverUnder: (n: number) => void;
  matchDigit: number;
  setMatchDigit: (n: number) => void;
}) {
  return (
    <div className="border-b border-border bg-card/40 px-3 py-2 flex flex-wrap items-center gap-3 text-[11px]">
      <span className="text-muted-foreground uppercase tracking-widest">Window</span>
      {[50, 100, 250, 500, 1000].map((n) => (
        <button
          key={n}
          onClick={() => setWindowSize(n)}
          className={`px-2 py-0.5 rounded border tabular-nums transition-colors ${
            windowSize === n
              ? "border-primary text-primary bg-primary/10"
              : "border-border text-muted-foreground hover:text-foreground"
          }`}
        >
          {n}
        </button>
      ))}
      <div className="h-4 w-px bg-border mx-1" />
      <span className="text-muted-foreground uppercase tracking-widest">Over/Under</span>
      <select
        value={overUnder}
        onChange={(e) => setOverUnder(Number(e.target.value))}
        className="bg-secondary border border-border rounded px-2 py-0.5 text-foreground tabular-nums"
      >
        {Array.from({ length: 9 }, (_, i) => i + 1).map((n) => (
          <option key={n} value={n}>{n}</option>
        ))}
      </select>
      <div className="h-4 w-px bg-border mx-1" />
      <span className="text-muted-foreground uppercase tracking-widest">Match digit</span>
      <div className="flex gap-1">
        {Array.from({ length: 10 }, (_, i) => i).map((n) => (
          <button
            key={n}
            onClick={() => setMatchDigit(n)}
            className={`size-6 rounded border text-[11px] tabular-nums ${
              matchDigit === n
                ? "border-accent text-accent bg-accent/10"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

function SymbolSidebar({
  symbols,
  active,
  onSelect,
  open,
}: {
  symbols: SymbolMeta[];
  active: string;
  onSelect: (s: string) => void;
  open: boolean;
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(
    () =>
      symbols.filter(
        (s) =>
          !q ||
          s.display_name.toLowerCase().includes(q.toLowerCase()) ||
          s.symbol.toLowerCase().includes(q.toLowerCase()),
      ),
    [symbols, q],
  );
  const grouped = useMemo(() => {
    const g = new Map<string, SymbolMeta[]>();
    for (const s of filtered) {
      const key = `${s.market}__${s.submarket}`;
      if (!g.has(key)) g.set(key, []);
      g.get(key)!.push(s);
    }
    return Array.from(g.entries());
  }, [filtered]);

  return (
    <aside
      className={`border-r border-border bg-card/60 ${
        open ? "block fixed inset-y-12 left-0 w-64 z-40 overflow-y-auto" : "hidden"
      } xl:block xl:sticky xl:top-12 xl:self-start xl:h-[calc(100vh-3rem)] xl:overflow-y-auto`}
    >
      <div className="p-2 border-b border-border sticky top-0 bg-card/95 backdrop-blur z-10">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search markets…"
          className="w-full bg-secondary border border-border rounded px-2 py-1 text-xs placeholder:text-muted-foreground focus:outline-none focus:border-primary"
        />
      </div>
      <div className="p-2 space-y-3">
        {grouped.map(([key, items]) => {
          const [market, submarket] = key.split("__");
          return (
            <div key={key}>
              <div className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground px-1 mb-1">
                {MARKET_LABEL[market] ?? market} · {SUBMARKET_LABEL[submarket] ?? submarket.replace(/_/g, " ")}
              </div>
              <div className="space-y-0.5">
                {items.map((s) => (
                  <button
                    key={s.symbol}
                    onClick={() => onSelect(s.symbol)}
                    className={`w-full text-left px-2 py-1 rounded text-[11px] flex items-center justify-between gap-2 transition-colors ${
                      active === s.symbol
                        ? "bg-primary/15 text-primary border border-primary/40"
                        : "text-foreground/85 hover:bg-secondary/60 border border-transparent"
                    }`}
                  >
                    <span className="truncate">{s.display_name}</span>
                    <span className="text-[9px] text-muted-foreground tabular-nums shrink-0">{s.symbol}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}

function StatusBar({
  status,
  ticks,
  meta,
  symbolCount,
}: {
  status: string;
  ticks: Tick[];
  meta: SymbolMeta;
  symbolCount: number;
}) {
  const tickRate = useTickRate(ticks);
  const last = ticks[ticks.length - 1];
  const ago = useFreshness(last?.epoch);
  return (
    <footer className="border-t border-border bg-card/98 px-4 py-1.5 text-[9px] uppercase tracking-[0.18em] text-muted-foreground flex flex-wrap items-center gap-x-5 gap-y-1 sticky bottom-0 z-30" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
      <span className="flex items-center gap-1.5">
        <span className={`size-1.5 rounded-full ${status === "open" ? "bg-bull" : "bg-bear"}`} />
        Feed <span className={status === "open" ? "text-bull" : "text-bear"}>{status}</span>
      </span>
      <span>
        Rate <span className="text-foreground tabular-nums">{tickRate.toFixed(2)}</span> t/s
      </span>
      <span>
        Buffer <span className="text-foreground tabular-nums">{ticks.length}</span>
      </span>
      <span>
        Freshness <span className="text-foreground tabular-nums">{ago}</span>
      </span>
      <span>
        Pip <span className="text-foreground tabular-nums">{last?.pip_size ?? "—"}</span>
      </span>
      <span className="ml-auto flex items-center gap-4">
        <span>{symbolCount} markets · {MARKET_LABEL[meta.market] ?? meta.market}</span>
        <span className="text-muted-foreground/40 select-none">© {new Date().getFullYear()} Deriv Pulse — All Rights Reserved</span>
      </span>
    </footer>
  );
}

/* ============================================================
 *                         PANELS
 * ========================================================== */

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
      {/* Top accent line */}
      <div className="absolute top-0 left-4 right-4 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
      <div className="flex items-baseline justify-between mb-2.5">
        <h2 className="text-[9px] uppercase tracking-[0.25em] text-muted-foreground/80" style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 500 }}>
          {title}
        </h2>
        {subtitle && (
          <span className="text-[9px] text-muted-foreground/60 tabular-nums font-mono">{subtitle}</span>
        )}
      </div>
      <div className="flex-1 min-h-0">{children}</div>
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

function PriceChart({ ticks, meta }: { ticks: Tick[]; meta: SymbolMeta }) {
  const W = 600;
  const H = 160;
  const data = ticks.slice(-300);
  const { path, min, max, lastX, lastY, up } = useMemo(() => {
    if (data.length < 2) return { path: "", min: 0, max: 0, lastX: 0, lastY: 0, up: true };
    const ys = data.map((t) => t.quote);
    const lo = Math.min(...ys);
    const hi = Math.max(...ys);
    const range = hi - lo || 1;
    const stepX = W / (data.length - 1);
    const points = data.map((t, i) => {
      const x = i * stepX;
      const y = H - ((t.quote - lo) / range) * (H - 10) - 5;
      return [x, y] as const;
    });
    const d = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
    const lx = points[points.length - 1][0];
    const ly = points[points.length - 1][1];
    return { path: d, min: lo, max: hi, lastX: lx, lastY: ly, up: data[data.length - 1].quote >= data[0].quote };
  }, [data]);

  const stroke = up ? "var(--color-bull)" : "var(--color-bear)";
  const pip = ticks[ticks.length - 1]?.pip_size ?? 2;

  return (
    <Panel title={`${meta.display_name} · Tick Chart`} subtitle={`${data.length} ticks`}>
      <div className="relative h-[180px]">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-full">
          <defs>
            <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity="0.25" />
              <stop offset="100%" stopColor={stroke} stopOpacity="0" />
            </linearGradient>
          </defs>
          {/* grid */}
          {[0.25, 0.5, 0.75].map((g) => (
            <line
              key={g}
              x1={0}
              x2={W}
              y1={H * g}
              y2={H * g}
              stroke="var(--color-border)"
              strokeDasharray="2 4"
              strokeWidth={0.5}
            />
          ))}
          {path && (
            <>
              <path d={`${path} L${W},${H} L0,${H} Z`} fill="url(#fill)" />
              <path d={path} fill="none" stroke={stroke} strokeWidth={1.5} />
              <circle cx={lastX} cy={lastY} r={3} fill={stroke} />
              <circle cx={lastX} cy={lastY} r={6} fill={stroke} fillOpacity={0.25}>
                <animate attributeName="r" values="3;10;3" dur="1.6s" repeatCount="indefinite" />
                <animate attributeName="fill-opacity" values="0.4;0;0.4" dur="1.6s" repeatCount="indefinite" />
              </circle>
            </>
          )}
        </svg>
        <div className="absolute top-1 left-1 text-[10px] text-muted-foreground tabular-nums">
          H {max.toFixed(pip)}
        </div>
        <div className="absolute bottom-1 left-1 text-[10px] text-muted-foreground tabular-nums">
          L {min.toFixed(pip)}
        </div>
      </div>
    </Panel>
  );
}

function MarketStats({ ticks, windowSize }: { ticks: Tick[]; windowSize: number }) {
  const slice = ticks.slice(-windowSize);
  const stats = useMemo(() => {
    if (slice.length < 2) return null;
    const prices = slice.map((t) => t.quote);
    const hi = Math.max(...prices);
    const lo = Math.min(...prices);
    const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
    const rets: number[] = [];
    for (let i = 1; i < prices.length; i++) rets.push((prices[i] - prices[i - 1]) / prices[i - 1]);
    const rMean = rets.reduce((a, b) => a + b, 0) / rets.length;
    const variance = rets.reduce((a, b) => a + (b - rMean) ** 2, 0) / rets.length;
    const stdev = Math.sqrt(variance);
    const up = rets.filter((r) => r > 0).length;
    const down = rets.filter((r) => r < 0).length;
    return { hi, lo, range: hi - lo, mean, stdev, up, down, n: rets.length };
  }, [slice]);

  const pip = ticks[ticks.length - 1]?.pip_size ?? 2;

  return (
    <Panel title="Market Statistics" subtitle={stats ? `n = ${stats.n + 1}` : ""}>
      {!stats ? (
        <Empty />
      ) : (
        <div className="grid grid-cols-2 gap-2 text-xs">
          <Stat label="High" value={stats.hi.toFixed(pip)} />
          <Stat label="Low" value={stats.lo.toFixed(pip)} />
          <Stat label="Range" value={stats.range.toFixed(pip)} />
          <Stat label="Mean" value={stats.mean.toFixed(pip)} />
          <Stat label="Volatility σ" value={(stats.stdev * 100).toFixed(4) + "%"} tone="warn" />
          <Stat
            label="Up / Down"
            value={`${stats.up} / ${stats.down}`}
            tone={stats.up > stats.down ? "bull" : stats.up < stats.down ? "bear" : undefined}
          />
        </div>
      )}
    </Panel>
  );
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
      <div className="space-y-1">
        {counts.map((c, d) => {
          const pct = (c / total) * 100;
          const isHot = d === hot && c > 0;
          const isCold = d === cold && digits.length >= 10;
          return (
            <div key={d} className="flex items-center gap-2 text-[11px]">
              <span className="w-3 tabular-nums text-muted-foreground">{d}</span>
              <div className="flex-1 h-3 bg-secondary/60 rounded-sm relative overflow-hidden">
                <div
                  className={`h-full rounded-sm transition-all duration-300 ${
                    isHot ? "bg-bull" : isCold ? "bg-bear" : "bg-accent/70"
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="w-10 text-right tabular-nums">{pct.toFixed(1)}%</span>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex items-center justify-between text-[9px] uppercase tracking-widest text-muted-foreground">
        <span>Hot <span className="text-bull">{hot}</span></span>
        <span>Exp 10.0%</span>
        <span>Cold <span className="text-bear">{cold}</span></span>
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
  const streak = currentStreak(digits, (d) => d % 2 === 0);
  return (
    <Panel title="Even / Odd" subtitle={`n = ${digits.length}`}>
      <div className="flex items-end gap-3">
        <Stat label="Even" value={`${evenPct.toFixed(1)}%`} tone="bull" big />
        <Stat label="Odd" value={`${oddPct.toFixed(1)}%`} tone="bear" big />
      </div>
      <div className="mt-2 h-2 rounded overflow-hidden flex bg-secondary/60">
        <div className="bg-bull transition-all duration-300" style={{ width: `${evenPct}%` }} />
        <div className="bg-bear transition-all duration-300" style={{ width: `${oddPct}%` }} />
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1.5 text-[10px]">
        <Mini label="Expected" value="50 / 50" />
        <Mini
          label="Deviation"
          value={`${deviation >= 0 ? "+" : ""}${deviation.toFixed(1)}%`}
          tone={Math.abs(deviation) > 5 ? "warn" : undefined}
        />
        <Mini label="Streak" value={`${streak >= 0 ? "E" : "O"}×${Math.abs(streak)}`} />
      </div>
    </Panel>
  );
}

function RiseFallPanel({ ticks, windowSize }: { ticks: Tick[]; windowSize: number }) {
  const slice = ticks.slice(-windowSize);
  const { rises, falls, flat, momentum } = useMemo(() => {
    let r = 0,
      f = 0,
      eq = 0;
    for (let i = 1; i < slice.length; i++) {
      const d = slice[i].quote - slice[i - 1].quote;
      if (d > 0) r++;
      else if (d < 0) f++;
      else eq++;
    }
    const recent = slice.slice(-20);
    let mUp = 0,
      mDn = 0;
    for (let i = 1; i < recent.length; i++) {
      const d = recent[i].quote - recent[i - 1].quote;
      if (d > 0) mUp++;
      else if (d < 0) mDn++;
    }
    return { rises: r, falls: f, flat: eq, momentum: mUp - mDn };
  }, [slice]);
  const total = rises + falls + flat || 1;
  const risePct = (rises / total) * 100;
  const fallPct = (falls / total) * 100;
  const bias = momentum > 2 ? "BULLISH" : momentum < -2 ? "BEARISH" : "NEUTRAL";
  const biasColor = bias === "BULLISH" ? "text-bull" : bias === "BEARISH" ? "text-bear" : "text-muted-foreground";
  return (
    <Panel title="Rise / Fall" subtitle={`n = ${total}`}>
      <div className="flex items-end gap-3">
        <Stat label="Rises" value={`${risePct.toFixed(1)}%`} tone="bull" big />
        <Stat label="Falls" value={`${fallPct.toFixed(1)}%`} tone="bear" big />
      </div>
      <div className="mt-2 h-2 rounded overflow-hidden flex bg-secondary/60">
        <div className="bg-bull transition-all duration-300" style={{ width: `${risePct}%` }} />
        <div className="bg-bear transition-all duration-300" style={{ width: `${fallPct}%` }} />
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1.5 text-[10px]">
        <Mini label="Bias 20" value={bias} valueClass={biasColor} />
        <Mini label="Momentum" value={`${momentum >= 0 ? "+" : ""}${momentum}`} />
        <Mini label="Flat" value={`${flat}`} />
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
      <div className="flex items-end gap-3">
        <Stat label={`Over`} value={`${overPct.toFixed(1)}%`} tone="bull" big />
        <Stat label={`Under`} value={`${underPct.toFixed(1)}%`} tone="bear" big />
      </div>
      <div className="mt-2 h-2 rounded overflow-hidden flex bg-secondary/60">
        <div className="bg-bear transition-all duration-300" style={{ width: `${underPct}%` }} />
        <div className="bg-muted-foreground/40 transition-all duration-300" style={{ width: `${eqPct}%` }} />
        <div className="bg-bull transition-all duration-300" style={{ width: `${overPct}%` }} />
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1.5 text-[10px]">
        <Mini label="Exp Over" value={`${expectedOver.toFixed(0)}%`} />
        <Mini label="Exp Under" value={`${expectedUnder.toFixed(0)}%`} />
        <Mini label={`=${barrier}`} value={`${eqPct.toFixed(1)}%`} />
      </div>
    </Panel>
  );
}

function MatchDiffersPanel({
  ticks,
  windowSize,
  digit,
}: {
  ticks: Tick[];
  windowSize: number;
  digit: number;
}) {
  const { digits } = useDigitWindow(ticks, windowSize);
  const matches = digits.filter((d) => d === digit).length;
  const differs = digits.length - matches;
  const total = digits.length || 1;
  const mPct = (matches / total) * 100;
  const dPct = (differs / total) * 100;
  const dev = mPct - 10;
  return (
    <Panel title={`Matches / Differs · ${digit}`} subtitle={`n = ${digits.length}`}>
      <div className="flex items-end gap-3">
        <Stat label="Matches" value={`${mPct.toFixed(1)}%`} tone="bull" big />
        <Stat label="Differs" value={`${dPct.toFixed(1)}%`} tone="bear" big />
      </div>
      <div className="mt-2 h-2 rounded overflow-hidden flex bg-secondary/60">
        <div className="bg-bull transition-all duration-300" style={{ width: `${mPct}%` }} />
        <div className="bg-bear transition-all duration-300" style={{ width: `${dPct}%` }} />
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1.5 text-[10px]">
        <Mini label="Expected" value="10 / 90" />
        <Mini
          label="Match Δ"
          value={`${dev >= 0 ? "+" : ""}${dev.toFixed(1)}%`}
          tone={Math.abs(dev) > 3 ? "warn" : undefined}
        />
        <Mini label="Count" value={`${matches}/${digits.length}`} />
      </div>
    </Panel>
  );
}

function VolatilityPanel({ ticks, windowSize }: { ticks: Tick[]; windowSize: number }) {
  const slice = ticks.slice(-windowSize);
  const v = useMemo(() => {
    if (slice.length < 10) return null;
    const rets: number[] = [];
    for (let i = 1; i < slice.length; i++) rets.push((slice[i].quote - slice[i - 1].quote) / slice[i - 1].quote);
    const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
    const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length;
    const sigma = Math.sqrt(variance);
    // Compare recent half vs older half
    const half = Math.floor(rets.length / 2);
    const recent = rets.slice(half);
    const older = rets.slice(0, half);
    const stdev = (a: number[]) => {
      const m = a.reduce((x, y) => x + y, 0) / a.length;
      return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length);
    };
    const sR = stdev(recent);
    const sO = stdev(older);
    const regime = sR > sO * 1.2 ? "EXPANDING" : sR < sO * 0.8 ? "COMPRESSING" : "STABLE";
    return { sigma, sR, sO, regime };
  }, [slice]);
  return (
    <Panel title="Volatility Regime" subtitle={`n = ${slice.length}`}>
      {!v ? (
        <Empty />
      ) : (
        <>
          <div className="flex items-end gap-3">
            <Stat label="σ (window)" value={`${(v.sigma * 100).toFixed(4)}%`} tone="warn" big />
          </div>
          <div className="mt-2 grid grid-cols-3 gap-1.5 text-[10px]">
            <Mini label="σ recent" value={`${(v.sR * 100).toFixed(3)}%`} />
            <Mini label="σ older" value={`${(v.sO * 100).toFixed(3)}%`} />
            <Mini
              label="Regime"
              value={v.regime}
              valueClass={
                v.regime === "EXPANDING"
                  ? "text-warn"
                  : v.regime === "COMPRESSING"
                  ? "text-accent"
                  : "text-muted-foreground"
              }
            />
          </div>
        </>
      )}
    </Panel>
  );
}

function TickStream({ ticks, windowSize }: { ticks: Tick[]; windowSize: number }) {
  const { slice, digits } = useDigitWindow(ticks, windowSize);
  return (
    <Panel title="Last Digit Stream" subtitle={`latest ${slice.length} · newest right`}>
      <div className="flex flex-wrap gap-1 max-h-[180px] overflow-y-auto">
        {digits.map((d, i) => {
          const isLast = i === digits.length - 1;
          const prev = i > 0 ? slice[i - 1].quote : null;
          const cur = slice[i]?.quote;
          const up = prev !== null && cur !== undefined && cur > prev;
          const down = prev !== null && cur !== undefined && cur < prev;
          return (
            <div
              key={`${slice[i].epoch}-${i}`}
              title={`${slice[i].quote.toFixed(slice[i].pip_size)} @ ${new Date(slice[i].epoch * 1000).toLocaleTimeString()}`}
              className={`size-6 grid place-items-center text-[10px] tabular-nums rounded border ${
                isLast
                  ? "border-primary text-primary bg-primary/15 animate-in fade-in zoom-in"
                  : up
                  ? "border-bull/30 text-bull bg-bull/5"
                  : down
                  ? "border-bear/30 text-bear bg-bear/5"
                  : "border-border text-muted-foreground"
              }`}
            >
              {d}
            </div>
          );
        })}
        {digits.length === 0 && <Empty />}
      </div>
    </Panel>
  );
}

function RecentTicksTable({ ticks }: { ticks: Tick[] }) {
  const rows = ticks.slice(-12).reverse();
  return (
    <Panel title="Tick Log" subtitle="latest 12">
      <div className="overflow-hidden text-[11px]">
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 px-1 py-1 text-[9px] uppercase tracking-widest text-muted-foreground border-b border-border">
          <span>Time</span>
          <span className="text-right">Quote</span>
          <span className="text-right">Δ</span>
          <span className="text-right">Lst</span>
        </div>
        {rows.length === 0 && <Empty />}
        {rows.map((t, i) => {
          const next = rows[i + 1];
          const diff = next ? t.quote - next.quote : 0;
          return (
            <div
              key={`${t.epoch}-${i}`}
              className="grid grid-cols-[1fr_auto_auto_auto] gap-2 px-1 py-1 border-b border-border/40 tabular-nums"
            >
              <span className="text-muted-foreground">
                {new Date(t.epoch * 1000).toLocaleTimeString([], { hour12: false })}
              </span>
              <span className="text-right">{t.quote.toFixed(t.pip_size)}</span>
              <span className={`text-right ${diff > 0 ? "text-bull" : diff < 0 ? "text-bear" : ""}`}>
                {diff === 0 ? "—" : (diff > 0 ? "+" : "") + diff.toFixed(t.pip_size)}
              </span>
              <span className="text-right text-accent">{lastDigit(t.quote, t.pip_size)}</span>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

/* ============================================================
 *                       PRIMITIVES
 * ========================================================== */

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
    <div className="flex-1 min-w-0">
      <div className="text-[8px] uppercase tracking-[0.22em] text-muted-foreground/70" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{label}</div>
      <div className={`tabular-nums font-bold leading-tight truncate ${big ? "text-2xl" : "text-sm"} ${color}`} style={{ fontFamily: "'JetBrains Mono', monospace" }}>
        {value}
      </div>
    </div>
  );
}

function Mini({
  label,
  value,
  tone,
  valueClass,
}: {
  label: string;
  value: string;
  tone?: "warn";
  valueClass?: string;
}) {
  return (
    <div className="rounded border border-border bg-secondary/40 px-1.5 py-1">
      <div className="text-[9px] uppercase tracking-widest text-muted-foreground truncate">{label}</div>
      <div className={`tabular-nums truncate ${valueClass ?? (tone === "warn" ? "text-warn" : "text-foreground")}`}>
        {value}
      </div>
    </div>
  );
}

function Empty() {
  return <div className="text-xs text-muted-foreground">Waiting for data…</div>;
}

function Disclaimer() {
  return (
    <div className="rounded border border-border/60 bg-card/40 px-4 py-3 flex flex-col gap-1" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
      <div className="flex items-center gap-2">
        <span className="text-warn text-[9px] font-semibold uppercase tracking-[0.25em]">Risk Disclosure</span>
        <div className="flex-1 h-px bg-border/40" />
        <span className="text-[8px] text-muted-foreground/40 tracking-widest select-none">© {new Date().getFullYear()} DERIV PULSE · PROPRIETARY SOFTWARE · ALL RIGHTS RESERVED</span>
      </div>
      <p className="text-[10px] text-muted-foreground/70 leading-relaxed">
        This terminal provides statistical analysis of historical and live tick data streamed directly from the Deriv API.
        Past distributions are not predictions of future ticks. Nothing here constitutes financial advice or a guarantee of profit.
        Synthetic index tick patterns are determined by certified random number generators. Trade responsibly.
      </p>
    </div>
  );
}

/* ============================================================
 *                          UTILS
 * ========================================================== */

function currentStreak(digits: number[], pred: (d: number) => boolean): number {
  if (digits.length === 0) return 0;
  const last = pred(digits[digits.length - 1]);
  let n = 0;
  for (let i = digits.length - 1; i >= 0; i--) {
    if (pred(digits[i]) === last) n++;
    else break;
  }
  return last ? n : -n;
}

function useTickRate(ticks: Tick[]): number {
  return useMemo(() => {
    const tail = ticks.slice(-30);
    if (tail.length < 2) return 0;
    const dt = tail[tail.length - 1].epoch - tail[0].epoch;
    if (dt <= 0) return 0;
    return (tail.length - 1) / dt;
  }, [ticks]);
}

function useFreshness(epoch: number | undefined): string {
  const [, force] = useState(0);
  const r = useRef(0);
  useEffect(() => {
    const id = setInterval(() => {
      r.current++;
      force(r.current);
    }, 1000);
    return () => clearInterval(id);
  }, []);
  if (!epoch) return "—";
  const age = Math.max(0, Math.floor(Date.now() / 1000 - epoch));
  return `${age}s ago`;
}
