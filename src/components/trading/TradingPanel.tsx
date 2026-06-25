import { useState, useEffect, useCallback } from "react";
import { useDerivTrading, type ProposalParams, type AutoTradeConfig } from "@/hooks/use-deriv-trading";
import type { DerivAccount } from "@/hooks/use-deriv-oauth";

const CONTRACT_GROUPS = [
  { label: "Rise / Fall",     types: [{ v: "CALL", l: "Rise", c: "text-bull" }, { v: "PUT", l: "Fall", c: "text-bear" }] },
  { label: "Higher / Lower",  types: [{ v: "HIGHER", l: "Higher", c: "text-bull" }, { v: "LOWER", l: "Lower", c: "text-bear" }] },
  { label: "Digits",          types: [{ v: "DIGITEVEN", l: "Even", c: "text-accent" }, { v: "DIGITODD", l: "Odd", c: "text-accent" }, { v: "DIGITMATCH", l: "Match", c: "text-warn" }, { v: "DIGITDIFF", l: "Differs", c: "text-warn" }, { v: "DIGITOVER", l: "Over", c: "text-primary" }, { v: "DIGITUNDER", l: "Under", c: "text-primary" }] },
  { label: "Touch",           types: [{ v: "ONETOUCH", l: "Touch", c: "text-primary" }, { v: "NOTOUCH", l: "No Touch", c: "text-muted-foreground" }] },
];

const DUR_UNITS = [
  { v: "t", l: "Ticks" }, { v: "s", l: "Secs" }, { v: "m", l: "Mins" }, { v: "h", l: "Hours" }, { v: "d", l: "Days" },
];

const NEEDS_BARRIER = new Set(["HIGHER", "LOWER", "ONETOUCH", "NOTOUCH", "DIGITMATCH", "DIGITDIFF", "DIGITOVER", "DIGITUNDER"]);

interface TradingPanelProps {
  wsUrl: string | null;
  accessToken?: string | null;
  symbol: string;
  currentPrice?: number;
  pipSize?: number;
  accounts: DerivAccount[];
  activeAccount: DerivAccount | null;
  onSwitchAccount: (id: string) => void;
}

type Tab = "trade" | "auto" | "positions" | "history" | "log";

export function TradingPanel({ wsUrl, accessToken, symbol, currentPrice, pipSize = 2, accounts, activeAccount, onSwitchAccount }: TradingPanelProps) {
  const {
    connected, authorized, balance, proposal, proposalLoading,
    openContracts, buying, error, lastTrade, tradeHistory,
    autoRunning, autoStats, wsLog,
    getProposal, buyContract, sellContract, clearProposal,
    startAutoTrade, stopAutoTrade,
  } = useDerivTrading(wsUrl, accessToken);

  const [tab, setTab]               = useState<Tab>("trade");
  const [contractType, setContractType] = useState("CALL");
  const [amount, setAmount]         = useState(1);
  const [basis, setBasis]           = useState<"stake" | "payout">("stake");
  const [duration, setDuration]     = useState(5);
  const [durUnit, setDurUnit]       = useState<"t" | "s" | "m" | "h" | "d">("t");
  const [barrier, setBarrier]       = useState("");

  // Auto-trade config
  const [autoType, setAutoType]     = useState("CALL");
  const [autoAmount, setAutoAmount] = useState(1);
  const [autoBasis, setAutoBasis]   = useState<"stake" | "payout">("stake");
  const [autoDur, setAutoDur]       = useState(5);
  const [autoDurUnit, setAutoDurUnit] = useState<"t" | "s" | "m" | "h" | "d">("t");
  const [autoBarrier, setAutoBarrier] = useState("");
  const [maxTrades, setMaxTrades]   = useState(0);
  const [stopLoss, setStopLoss]     = useState("");
  const [takeProfit, setTakeProfit] = useState("");
  const [martingale, setMartingale] = useState(false);
  const [martMult, setMartMult]     = useState(2);
  const [delayMs, setDelayMs]       = useState(500);

  const currency  = balance?.currency ?? activeAccount?.currency ?? "USD";
  const needsBarrier = NEEDS_BARRIER.has(contractType);
  const authOk    = connected && authorized;
  const isDemo    = activeAccount?.account_type === "demo";

  // Auto-sync symbol into auto-trade config when it changes
  useEffect(() => {
    // symbol is always passed from parent — nothing extra needed,
    // we use it directly in handleGetProposal and handleStartAuto
  }, [symbol]);

  // Auto-fetch quote when switching to trade tab (if authorized)
  useEffect(() => {
    if (tab === "trade" && authOk && !proposal && !proposalLoading) {
      handleGetProposal();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, authOk]);

  function handleGetProposal() {
    const params: ProposalParams = {
      contract_type: contractType,
      symbol,
      currency,
      amount,
      basis,
      duration,
      duration_unit: durUnit,
      ...(needsBarrier && barrier ? { barrier } : {}),
    };
    getProposal(params);
  }

  // Refresh quote when contract type, amount, duration or symbol changes
  useEffect(() => {
    if (authOk && tab === "trade") {
      const t = setTimeout(() => handleGetProposal(), 300);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractType, amount, duration, durUnit, symbol, authOk]);

  function handleStartAuto() {
    const config: AutoTradeConfig = {
      enabled: true,
      contract_type: autoType,
      symbol,
      currency,
      amount: autoAmount,
      basis: autoBasis,
      duration: autoDur,
      duration_unit: autoDurUnit,
      ...(NEEDS_BARRIER.has(autoType) && autoBarrier ? { barrier: autoBarrier } : {}),
      max_trades: maxTrades || undefined,
      stop_loss: stopLoss ? Number(stopLoss) : undefined,
      take_profit: takeProfit ? Number(takeProfit) : undefined,
      delay_between_ms: delayMs,
      martingale,
      martingale_multiplier: martMult,
    };
    startAutoTrade(config);
  }

  /* ── dot indicator ── */
  const dot = authOk
    ? "bg-bull shadow-[0_0_6px_rgba(74,222,128,0.6)]"
    : connected
    ? "bg-amber-400"
    : "bg-border";

  const statusLabel = authOk ? "Authorized" : connected ? "Authorizing…" : "Disconnected";

  return (
    <div className="flex flex-col h-full text-[11px]">
      {/* ── Header bar ── */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
        <span className={`size-2 rounded-full ${dot}`} />
        <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">{statusLabel}</span>
        {balance && (
          <div className="ml-auto flex items-center gap-3">
            <div className="text-right">
              <div className="text-[8px] uppercase tracking-widest text-muted-foreground">Balance</div>
              <div className="text-sm font-bold font-mono tabular-nums text-bull">{balance.currency} {balance.balance.toFixed(2)}</div>
            </div>
            {accounts.length > 1 && (
              <select value={activeAccount?.account_id ?? ""} onChange={e => onSwitchAccount(e.target.value)} className="bg-secondary border border-border rounded px-1.5 py-0.5 text-[9px] font-mono text-foreground">
                {accounts.map(a => <option key={a.account_id} value={a.account_id}>{a.account_type.toUpperCase()} · {a.currency}</option>)}
              </select>
            )}
          </div>
        )}
      </div>

      {/* ── Account badge ── */}
      {activeAccount && (
        <div className="flex items-center gap-2 px-3 py-1 border-b border-border shrink-0">
          <span className={`text-[8px] font-mono uppercase tracking-widest px-2 py-0.5 rounded border ${
            isDemo ? "text-amber-300 border-amber-500/40 bg-amber-500/10" : "text-red-300 border-red-500/40 bg-red-500/10 animate-pulse"
          }`}>{isDemo ? "● DEMO" : "⚡ REAL MONEY"}</span>
          <span className="text-[8px] text-muted-foreground font-mono">{activeAccount.account_id}</span>
          {currentPrice !== undefined && (
            <span className="ml-auto text-[9px] font-mono tabular-nums text-foreground/60">{symbol} {currentPrice.toFixed(pipSize)}</span>
          )}
        </div>
      )}

      {/* ── Error banner ── */}
      {error && (
        <div className="mx-3 mt-2 text-[9px] font-mono text-red-300 bg-red-500/10 border border-red-500/20 rounded px-2 py-1.5 shrink-0">
          ✕ {error}
        </div>
      )}

      {/* ── Not authorized prompt ── */}
      {!authOk && wsUrl && (
        <div className="mx-3 mt-2 text-[9px] font-mono text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded px-2 py-1.5 shrink-0">
          ⚠ Authorizing with Deriv… if this persists, reconnect your account.
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="flex border-b border-border shrink-0">
        {(["trade", "auto", "positions", "history", "log"] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`flex-1 py-1.5 text-[8px] uppercase tracking-widest font-mono transition-colors ${
            tab === t ? "text-primary border-b border-primary bg-primary/5" : "text-muted-foreground hover:text-foreground"
          }`}>
            {t === "positions" ? `Pos (${openContracts.length})` :
             t === "auto" ? (autoRunning ? "⚡Auto" : "Auto") :
             t === "history" ? `History (${tradeHistory.length})` : t}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">

        {/* ════════════════ MANUAL TRADE TAB ════════════════ */}
        {tab === "trade" && (
          <div className="p-3 space-y-3">
            {/* Contract types */}
            {CONTRACT_GROUPS.map(g => (
              <div key={g.label}>
                <div className="text-[8px] uppercase tracking-widest text-muted-foreground mb-1">{g.label}</div>
                <div className="flex flex-wrap gap-1">
                  {g.types.map(ct => (
                    <button key={ct.v} onClick={() => { setContractType(ct.v); clearProposal(); }}
                      className={`px-2 py-0.5 rounded border text-[9px] font-mono transition-all ${contractType === ct.v ? `border-current bg-current/10 ${ct.c}` : "border-border text-muted-foreground hover:text-foreground"}`}>
                      {ct.l}
                    </button>
                  ))}
                </div>
              </div>
            ))}

            <div className="h-px bg-border" />

            {/* Basis */}
            <Row label="Basis">
              <TogglePair a="stake" b="payout" value={basis} onChange={v => setBasis(v as typeof basis)} />
            </Row>

            {/* Amount */}
            <Row label="Amount">
              <Stepper value={amount} onChange={setAmount} min={0.35} step={0.5} />
              <span className="text-[9px] text-muted-foreground font-mono ml-1">{currency}</span>
            </Row>
            <div className="flex gap-1 pl-14">
              {[1, 2, 5, 10, 25, 50].map(v => (
                <Chip key={v} active={amount === v} onClick={() => setAmount(v)}>{v}</Chip>
              ))}
            </div>

            {/* Duration */}
            <Row label="Duration">
              <Stepper value={duration} onChange={setDuration} min={1} step={1} className="w-12" />
              <select value={durUnit} onChange={e => setDurUnit(e.target.value as typeof durUnit)}
                className="ml-1 bg-secondary border border-border rounded px-2 py-1 text-[10px] font-mono text-foreground focus:outline-none focus:border-primary">
                {DUR_UNITS.map(u => <option key={u.v} value={u.v}>{u.l}</option>)}
              </select>
            </Row>
            <div className="flex gap-1 pl-14">
              {[1, 3, 5, 10, 15, 30].map(v => (
                <Chip key={v} active={duration === v} onClick={() => setDuration(v)} color="accent">{v}</Chip>
              ))}
            </div>

            {/* Barrier */}
            {needsBarrier && (
              <Row label="Barrier">
                <input value={barrier} onChange={e => setBarrier(e.target.value)}
                  placeholder={contractType.startsWith("DIGIT") ? "0–9" : "+0.001"}
                  className="flex-1 bg-secondary border border-border rounded px-2 py-1 text-[10px] font-mono text-foreground focus:outline-none focus:border-primary placeholder:text-muted-foreground/40" />
              </Row>
            )}

            {/* Quote button */}
            <button onClick={handleGetProposal} disabled={!authOk || proposalLoading}
              className="w-full py-2 rounded border border-accent/60 text-accent bg-accent/10 text-[9px] font-mono uppercase tracking-widest hover:bg-accent/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
              {proposalLoading ? <Pulse color="accent" label="Getting quote…" /> : "Get Live Quote"}
            </button>

            {/* Proposal card */}
            {proposal && !proposalLoading && (
              <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[8px] uppercase tracking-widest text-muted-foreground">Live Quote · updates every tick</span>
                  <button onClick={clearProposal} className="text-muted-foreground hover:text-foreground text-[10px]">✕</button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Stat label="Cost" value={`${currency} ${proposal.ask_price.toFixed(2)}`} />
                  <Stat label="Payout" value={`${currency} ${proposal.payout.toFixed(2)}`} className="text-bull" />
                  <Stat label="Return" value={`+${proposal.return_pct.toFixed(1)}%`} className="text-bull" />
                </div>
                {/* Return bar */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1 rounded-full bg-secondary overflow-hidden">
                    <div className="h-full bg-bull rounded-full transition-all" style={{ width: `${Math.min(100, proposal.return_pct)}%` }} />
                  </div>
                </div>
                <div className="text-[8px] font-mono text-muted-foreground leading-relaxed border-t border-border/30 pt-1.5">{proposal.longcode}</div>
                <button onClick={() => buyContract(proposal.id, proposal.ask_price)} disabled={buying || !authOk}
                  className="w-full py-2.5 rounded border border-bull/60 text-bull bg-bull/10 text-[10px] font-mono uppercase tracking-widest font-semibold hover:bg-bull/20 disabled:opacity-40 transition-all shadow-[0_0_12px_rgba(74,222,128,0.08)]">
                  {buying ? <Pulse color="bull" label="Placing trade…" /> : `▶ Buy · ${currency} ${proposal.ask_price.toFixed(2)}`}
                </button>
              </div>
            )}

            {/* Last trade */}
            {lastTrade && !buying && (
              <div className={`rounded border p-2 text-[9px] font-mono space-y-1 ${lastTrade.outcome === "won" ? "border-bull/30 bg-bull/5" : lastTrade.outcome === "lost" ? "border-bear/30 bg-bear/5" : "border-border/50 bg-secondary/30"}`}>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground uppercase tracking-widest text-[8px]">Last Trade · #{lastTrade.contract_id}</span>
                  {lastTrade.outcome && <span className={lastTrade.outcome === "won" ? "text-bull" : "text-bear"}>{lastTrade.outcome === "won" ? "✓ WON" : "✗ LOST"}</span>}
                </div>
                <div className="text-foreground/70 line-clamp-1">{lastTrade.longcode}</div>
                <div className="flex gap-3">
                  <span>Paid: <b className="text-foreground">{currency} {lastTrade.buy_price.toFixed(2)}</b></span>
                  <span>Max: <b className="text-bull">{currency} {lastTrade.payout.toFixed(2)}</b></span>
                  {lastTrade.profit !== undefined && <span>P/L: <b className={lastTrade.profit >= 0 ? "text-bull" : "text-bear"}>{lastTrade.profit >= 0 ? "+" : ""}{lastTrade.profit.toFixed(2)}</b></span>}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ════════════════ AUTO TRADE TAB ════════════════ */}
        {tab === "auto" && (
          <div className="p-3 space-y-3">
            {/* Stats bar when running */}
            {autoRunning && (
              <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="size-2 rounded-full bg-primary animate-ping" />
                  <span className="text-[9px] font-mono uppercase tracking-widest text-primary">Auto-Trading Active</span>
                  <button onClick={stopAutoTrade} className="ml-auto px-3 py-1 rounded border border-bear/60 text-bear text-[8px] font-mono uppercase hover:bg-bear/10 transition-colors">■ Stop</button>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  <Stat label="Trades"  value={String(autoStats.trades)} />
                  <Stat label="Won"     value={String(autoStats.won)}  className="text-bull" />
                  <Stat label="Lost"    value={String(autoStats.lost)} className="text-bear" />
                  <Stat label="P/L"     value={(autoStats.pnl >= 0 ? "+" : "") + autoStats.pnl.toFixed(2)} className={autoStats.pnl >= 0 ? "text-bull" : "text-bear"} />
                </div>
                {autoStats.trades > 0 && (
                  <div className="flex items-center gap-1">
                    <div className="h-1.5 rounded-full bg-bull" style={{ flex: autoStats.won }} />
                    <div className="h-1.5 rounded-full bg-bear" style={{ flex: autoStats.lost }} />
                  </div>
                )}
              </div>
            )}

            {!autoRunning && (
              <>
                {/* Contract type for auto */}
                <div>
                  <div className="text-[8px] uppercase tracking-widest text-muted-foreground mb-1.5">Contract Type</div>
                  <div className="flex flex-wrap gap-1">
                    {CONTRACT_GROUPS.flatMap(g => g.types).map(ct => (
                      <button key={ct.v} onClick={() => setAutoType(ct.v)}
                        className={`px-2 py-0.5 rounded border text-[9px] font-mono transition-all ${autoType === ct.v ? `border-current bg-current/10 ${ct.c}` : "border-border text-muted-foreground hover:text-foreground"}`}>
                        {ct.l}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="h-px bg-border" />

                <Row label="Basis"><TogglePair a="stake" b="payout" value={autoBasis} onChange={v => setAutoBasis(v as typeof autoBasis)} /></Row>

                <Row label="Stake">
                  <Stepper value={autoAmount} onChange={setAutoAmount} min={0.35} step={0.5} />
                  <span className="text-[9px] text-muted-foreground font-mono ml-1">{currency}</span>
                </Row>
                <div className="flex gap-1 pl-14">
                  {[1, 2, 5, 10, 25].map(v => <Chip key={v} active={autoAmount === v} onClick={() => setAutoAmount(v)}>{v}</Chip>)}
                </div>

                <Row label="Duration">
                  <Stepper value={autoDur} onChange={setAutoDur} min={1} step={1} className="w-12" />
                  <select value={autoDurUnit} onChange={e => setAutoDurUnit(e.target.value as typeof autoDurUnit)}
                    className="ml-1 bg-secondary border border-border rounded px-2 py-1 text-[10px] font-mono text-foreground focus:outline-none">
                    {DUR_UNITS.map(u => <option key={u.v} value={u.v}>{u.l}</option>)}
                  </select>
                </Row>

                {NEEDS_BARRIER.has(autoType) && (
                  <Row label="Barrier">
                    <input value={autoBarrier} onChange={e => setAutoBarrier(e.target.value)} placeholder={autoType.startsWith("DIGIT") ? "0–9" : "+0.001"}
                      className="flex-1 bg-secondary border border-border rounded px-2 py-1 text-[10px] font-mono focus:outline-none focus:border-primary placeholder:text-muted-foreground/40" />
                  </Row>
                )}

                <div className="h-px bg-border" />
                <div className="text-[8px] uppercase tracking-widest text-muted-foreground">Risk Controls</div>

                <Row label="Max trades">
                  <input type="number" value={maxTrades} min={0} onChange={e => setMaxTrades(Number(e.target.value))}
                    className="w-20 bg-secondary border border-border rounded px-2 py-1 text-[10px] font-mono text-foreground text-center focus:outline-none focus:border-primary" />
                  <span className="text-[8px] text-muted-foreground ml-2">0 = unlimited</span>
                </Row>
                <Row label="Stop loss">
                  <input type="number" value={stopLoss} min={0} placeholder="0.00" onChange={e => setStopLoss(e.target.value)}
                    className="w-24 bg-secondary border border-border rounded px-2 py-1 text-[10px] font-mono text-foreground focus:outline-none focus:border-primary placeholder:text-muted-foreground/40" />
                  <span className="text-[8px] text-muted-foreground ml-2">{currency} balance</span>
                </Row>
                <Row label="Take profit">
                  <input type="number" value={takeProfit} min={0} placeholder="0.00" onChange={e => setTakeProfit(e.target.value)}
                    className="w-24 bg-secondary border border-border rounded px-2 py-1 text-[10px] font-mono text-foreground focus:outline-none focus:border-primary placeholder:text-muted-foreground/40" />
                  <span className="text-[8px] text-muted-foreground ml-2">{currency} balance</span>
                </Row>
                <Row label="Delay">
                  <Stepper value={delayMs / 1000} onChange={v => setDelayMs(Math.round(v * 1000))} min={0.1} step={0.1} className="w-14" />
                  <span className="text-[8px] text-muted-foreground ml-2">seconds between trades</span>
                </Row>

                <div className="h-px bg-border" />
                <div className="text-[8px] uppercase tracking-widest text-muted-foreground">Martingale</div>

                <div className="flex items-center gap-3">
                  <button onClick={() => setMartingale(v => !v)} className={`relative w-9 h-5 rounded-full transition-colors ${martingale ? "bg-primary" : "bg-secondary border border-border"}`}>
                    <span className={`absolute top-0.5 size-4 rounded-full transition-all ${martingale ? "left-4 bg-white" : "left-0.5 bg-muted-foreground"}`} />
                  </button>
                  <span className="text-[9px] font-mono text-muted-foreground">Double stake on loss</span>
                  {martingale && (
                    <div className="ml-auto flex items-center gap-1">
                      <span className="text-[8px] text-muted-foreground">×</span>
                      <Stepper value={martMult} onChange={setMartMult} min={1.1} step={0.1} className="w-12" />
                    </div>
                  )}
                </div>
                {martingale && (
                  <div className="text-[8px] font-mono text-amber-300/80 bg-amber-500/10 border border-amber-500/20 rounded px-2 py-1.5">
                    ⚠ Martingale increases risk rapidly. Use stop-loss to protect your balance.
                  </div>
                )}

                <div className="h-px bg-border" />

                {/* Auto trade launch button */}
                {!isDemo && (
                  <div className="text-[8px] font-mono text-red-300/80 bg-red-500/10 border border-red-500/20 rounded px-2 py-1.5">
                    ⚡ You are on a REAL MONEY account. Auto-trading will place real trades.
                  </div>
                )}

                <button onClick={handleStartAuto} disabled={!authOk}
                  className="w-full py-2.5 rounded border border-primary/60 text-primary bg-primary/10 text-[10px] font-mono uppercase tracking-widest font-semibold hover:bg-primary/20 disabled:opacity-40 transition-all">
                  ▶ Start Auto-Trading
                </button>
              </>
            )}

            {autoRunning && (
              <div className="text-center py-4">
                <p className="text-[9px] font-mono text-muted-foreground">Trades executing on <span className="text-foreground">{symbol}</span>…</p>
                <p className="text-[8px] text-muted-foreground/60 mt-1">Switch to Log tab to see live activity</p>
              </div>
            )}
          </div>
        )}

        {/* ════════════════ POSITIONS TAB ════════════════ */}
        {tab === "positions" && (
          <div className="p-3 space-y-2">
            {openContracts.length === 0 ? (
              <Empty icon="⊘" label="No open positions" />
            ) : (
              openContracts.map(c => <ContractCard key={c.contract_id} contract={c} onSell={sellContract} currency={currency} />)
            )}
          </div>
        )}

        {/* ════════════════ HISTORY TAB ════════════════ */}
        {tab === "history" && (
          <div className="p-3 space-y-1.5">
            {tradeHistory.length === 0 ? (
              <Empty icon="◎" label="No trades this session" />
            ) : (
              <>
                {/* Summary */}
                {tradeHistory.length >= 2 && (() => {
                  const won  = tradeHistory.filter(t => t.outcome === "won").length;
                  const lost = tradeHistory.filter(t => t.outcome === "lost").length;
                  const pnl  = tradeHistory.reduce((s, t) => s + (t.profit ?? 0), 0);
                  return (
                    <div className="rounded border border-border/50 bg-secondary/20 p-2 grid grid-cols-4 gap-2 mb-3">
                      <Stat label="Total"  value={String(tradeHistory.length)} />
                      <Stat label="Won"    value={String(won)}   className="text-bull" />
                      <Stat label="Lost"   value={String(lost)}  className="text-bear" />
                      <Stat label="P/L"    value={(pnl >= 0 ? "+" : "") + pnl.toFixed(2)} className={pnl >= 0 ? "text-bull" : "text-bear"} />
                    </div>
                  );
                })()}
                {tradeHistory.map((t, i) => (
                  <div key={i} className={`rounded border p-2 text-[9px] font-mono space-y-0.5 ${t.outcome === "won" ? "border-bull/25 bg-bull/5" : t.outcome === "lost" ? "border-bear/25 bg-bear/5" : "border-border/40 bg-secondary/20"}`}>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">#{t.contract_id} · {new Date(t.start_time * 1000).toLocaleTimeString()}</span>
                      {t.outcome ? <span className={t.outcome === "won" ? "text-bull" : "text-bear"}>{t.outcome === "won" ? "✓ WON" : "✗ LOST"}</span> : <span className="text-muted-foreground animate-pulse">Live…</span>}
                    </div>
                    <div className="text-foreground/70 line-clamp-1">{t.longcode}</div>
                    <div className="flex gap-3 text-[8px]">
                      <span>Paid: <b className="text-foreground">{currency} {t.buy_price.toFixed(2)}</b></span>
                      <span>Max: <b className="text-bull">{currency} {t.payout.toFixed(2)}</b></span>
                      {t.profit !== undefined && <span>P/L: <b className={t.profit >= 0 ? "text-bull" : "text-bear"}>{t.profit >= 0 ? "+" : ""}{t.profit.toFixed(2)}</b></span>}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {/* ════════════════ LOG TAB ════════════════ */}
        {tab === "log" && (
          <div className="p-2 space-y-0.5 font-mono text-[8px]">
            {wsLog.length === 0 ? <Empty icon="◌" label="No log entries yet" /> : (
              wsLog.map((line, i) => (
                <div key={i} className={`px-1.5 py-0.5 rounded leading-relaxed ${
                  line.includes("✓") ? "text-bull/80" :
                  line.includes("✗") || line.includes("failed") || line.includes("error") ? "text-bear/80" :
                  line.includes("▶") || line.includes("Auto") ? "text-primary/80" :
                  "text-muted-foreground/70"
                }`}>{line}</div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Sub-components ─────────────────────────────────────────────────────── */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[8px] uppercase tracking-widest text-muted-foreground w-14 shrink-0">{label}</span>
      <div className="flex items-center gap-1 flex-1">{children}</div>
    </div>
  );
}

function TogglePair({ a, b, value, onChange }: { a: string; b: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex rounded border border-border overflow-hidden">
      {[a, b].map(opt => (
        <button key={opt} onClick={() => onChange(opt)} className={`px-3 py-1 text-[9px] font-mono uppercase transition-colors ${value === opt ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"}`}>{opt}</button>
      ))}
    </div>
  );
}

function Stepper({ value, onChange, min = 1, step = 1, className = "" }: { value: number; onChange: (v: number) => void; min?: number; step?: number; className?: string }) {
  return (
    <div className="flex items-center gap-1">
      <button onClick={() => onChange(Math.max(min, parseFloat((value - step).toFixed(10))))} className="size-6 rounded border border-border text-muted-foreground hover:text-foreground flex items-center justify-center">−</button>
      <input type="number" value={value} min={min} step={step}
        onChange={e => onChange(Math.max(min, Number(e.target.value)))}
        className={`${className || "w-16"} bg-secondary border border-border rounded px-2 py-1 text-[10px] font-mono tabular-nums text-center text-foreground focus:outline-none focus:border-primary`} />
      <button onClick={() => onChange(parseFloat((value + step).toFixed(10)))} className="size-6 rounded border border-border text-muted-foreground hover:text-foreground flex items-center justify-center">+</button>
    </div>
  );
}

function Chip({ active, onClick, color = "primary", children }: { active: boolean; onClick: () => void; color?: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`px-1.5 py-0.5 rounded border text-[8px] font-mono transition-colors ${active ? `border-${color} text-${color} bg-${color}/10` : "border-border text-muted-foreground hover:text-foreground"}`}>
      {children}
    </button>
  );
}

function Stat({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div>
      <div className="text-[7px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`text-[11px] font-bold font-mono tabular-nums ${className || "text-foreground"}`}>{value}</div>
    </div>
  );
}

function Empty({ icon, label }: { icon: string; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-2">
      <div className="text-3xl opacity-10">{icon}</div>
      <div className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">{label}</div>
    </div>
  );
}

function Pulse({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center justify-center gap-2">
      <span className={`size-2 rounded-full bg-${color} animate-ping`} />
      {label}
    </span>
  );
}

function ContractCard({ contract, onSell, currency }: { contract: import("@/hooks/use-deriv-trading").OpenContract; onSell: (id: number) => void; currency: string }) {
  const isProfit = contract.profit >= 0;
  return (
    <div className={`rounded-lg border p-3 space-y-2 ${isProfit ? "border-bull/30 bg-bull/5" : "border-bear/30 bg-bear/5"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[8px] font-mono text-muted-foreground uppercase tracking-widest">{contract.contract_type} · {contract.underlying}</div>
          <div className="text-[9px] font-mono text-foreground/80 line-clamp-2 leading-relaxed">{contract.longcode}</div>
        </div>
        <button onClick={() => onSell(contract.contract_id)} className="shrink-0 px-2 py-1 rounded border border-bear/50 text-bear text-[8px] font-mono uppercase hover:bg-bear/10 transition-colors">Sell</button>
      </div>
      <div className="grid grid-cols-3 gap-2 border-t border-border/30 pt-1.5">
        <Stat label="Bought" value={`${currency} ${contract.buy_price.toFixed(2)}`} />
        <Stat label="Current" value={`${currency} ${contract.bid_price.toFixed(2)}`} />
        <Stat label="P/L" value={`${isProfit ? "+" : ""}${contract.profit.toFixed(2)}`} className={isProfit ? "text-bull" : "text-bear"} />
      </div>
    </div>
  );
}
