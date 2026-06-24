import { useState, useEffect } from "react";
import { useDerivTrading, type ProposalParams } from "@/hooks/use-deriv-trading";
import type { DerivAccount } from "@/hooks/use-deriv-oauth";

const CONTRACT_GROUPS = [
  { label: "Rise / Fall", types: [{ value: "CALL", label: "Rise", color: "text-bull" }, { value: "PUT", label: "Fall", color: "text-bear" }] },
  { label: "Higher / Lower", types: [{ value: "HIGHER", label: "Higher", color: "text-bull" }, { value: "LOWER", label: "Lower", color: "text-bear" }] },
  { label: "Digits", types: [{ value: "DIGITEVEN", label: "Even", color: "text-accent" }, { value: "DIGITODD", label: "Odd", color: "text-accent" }, { value: "DIGITMATCH", label: "Match", color: "text-warn" }, { value: "DIGITDIFF", label: "Differs", color: "text-warn" }] },
  { label: "Touch", types: [{ value: "ONETOUCH", label: "Touch", color: "text-primary" }, { value: "NOTOUCH", label: "No Touch", color: "text-muted-foreground" }] },
];

const DURATION_UNITS = [
  { value: "t", label: "Ticks" },
  { value: "s", label: "Seconds" },
  { value: "m", label: "Minutes" },
  { value: "h", label: "Hours" },
  { value: "d", label: "Days" },
];

interface TradingPanelProps {
  wsUrl: string | null;
  symbol: string;
  currentPrice?: number;
  pipSize?: number;
  accounts: DerivAccount[];
  activeAccount: DerivAccount | null;
  onSwitchAccount: (id: string) => void;
}

export function TradingPanel({ wsUrl, symbol, currentPrice, pipSize = 2, accounts, activeAccount, onSwitchAccount }: TradingPanelProps) {
  const { connected, balance, proposal, proposalLoading, openContracts, buying, error, lastTrade, getProposal, buyContract, sellContract, clearProposal } = useDerivTrading(wsUrl);

  const [contractType, setContractType] = useState("CALL");
  const [amount, setAmount] = useState(1);
  const [basis, setBasis] = useState<"stake" | "payout">("stake");
  const [duration, setDuration] = useState(5);
  const [durationUnit, setDurationUnit] = useState<"t" | "s" | "m" | "h" | "d">("t");
  const [barrier, setBarrier] = useState("");
  const [tab, setTab] = useState<"trade" | "positions" | "history">("trade");
  const [tradeHistory, setTradeHistory] = useState<typeof lastTrade[]>([]);

  useEffect(() => {
    if (lastTrade) setTradeHistory((prev) => [lastTrade, ...prev].slice(0, 20));
  }, [lastTrade]);

  const needsBarrier = ["HIGHER", "LOWER", "ONETOUCH", "NOTOUCH", "DIGITMATCH", "DIGITDIFF"].includes(contractType);
  const currency = balance?.currency ?? activeAccount?.currency ?? "USD";

  function handleGetProposal() {
    const params: ProposalParams = {
      contract_type: contractType,
      underlying_symbol: symbol,
      currency,
      amount,
      basis,
      duration,
      duration_unit: durationUnit,
      ...(needsBarrier && barrier ? { barrier } : {}),
    };
    getProposal(params);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <span className={`size-2 rounded-full ${connected ? "bg-bull shadow-[0_0_6px_rgba(74,222,128,0.6)]" : "bg-border"}`} />
          <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{connected ? "Live" : "Disconnected"}</span>
        </div>
        {balance && (
          <div className="flex items-center gap-2">
            <div className="text-right">
              <div className="text-[8px] uppercase tracking-widest text-muted-foreground">Balance</div>
              <div className="text-sm font-bold font-mono tabular-nums text-bull">{balance.currency} {balance.balance.toFixed(2)}</div>
            </div>
            {accounts.length > 1 && (
              <select value={activeAccount?.account_id ?? ""} onChange={(e) => onSwitchAccount(e.target.value)} className="bg-secondary border border-border rounded px-2 py-0.5 text-[9px] font-mono text-foreground">
                {accounts.map((a) => <option key={a.account_id} value={a.account_id}>{a.account_type.toUpperCase()} · {a.currency}</option>)}
              </select>
            )}
          </div>
        )}
      </div>

      {/* Account badge */}
      {activeAccount && (
        <div className="px-3 py-1.5 border-b border-border flex items-center gap-2">
          <span className={`text-[8px] font-mono uppercase tracking-widest px-2 py-0.5 rounded border ${activeAccount.account_type === "demo" ? "text-amber-300 border-amber-500/40 bg-amber-500/10" : "text-red-300 border-red-500/40 bg-red-500/10 animate-pulse"}`}>
            {activeAccount.account_type === "demo" ? "● DEMO" : "⚡ REAL MONEY"}
          </span>
          <span className="text-[9px] text-muted-foreground font-mono">{activeAccount.account_id}</span>
          {currentPrice !== undefined && <span className="ml-auto text-[10px] font-mono tabular-nums text-foreground/70">{currentPrice.toFixed(pipSize)}</span>}
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-border">
        {(["trade", "positions", "history"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`flex-1 py-1.5 text-[9px] uppercase tracking-widest font-mono transition-colors ${tab === t ? "text-primary border-b border-primary bg-primary/5" : "text-muted-foreground hover:text-foreground"}`}>
            {t === "positions" ? `Positions (${openContracts.length})` : t}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Trade tab */}
        {tab === "trade" && (
          <div className="p-3 flex flex-col gap-3">
            {/* Contract type */}
            {CONTRACT_GROUPS.map((group) => (
              <div key={group.label}>
                <div className="text-[8px] uppercase tracking-widest text-muted-foreground mb-1">{group.label}</div>
                <div className="flex flex-wrap gap-1">
                  {group.types.map((ct) => (
                    <button key={ct.value} onClick={() => { setContractType(ct.value); clearProposal(); }} className={`px-2.5 py-1 rounded border text-[10px] font-mono transition-all ${contractType === ct.value ? `border-current bg-current/10 ${ct.color}` : "border-border text-muted-foreground hover:text-foreground"}`}>
                      {ct.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}

            <div className="h-px bg-border" />

            {/* Basis */}
            <div className="flex items-center gap-2">
              <span className="text-[9px] uppercase tracking-widest text-muted-foreground w-14">Basis</span>
              <div className="flex rounded border border-border overflow-hidden">
                {(["stake", "payout"] as const).map((b) => (
                  <button key={b} onClick={() => setBasis(b)} className={`px-3 py-1 text-[9px] font-mono uppercase transition-colors ${basis === b ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"}`}>{b}</button>
                ))}
              </div>
            </div>

            {/* Amount */}
            <div className="flex items-center gap-2">
              <span className="text-[9px] uppercase tracking-widest text-muted-foreground w-14">Amount</span>
              <div className="flex items-center gap-1 flex-1">
                <button onClick={() => setAmount(Math.max(1, amount - 1))} className="size-6 rounded border border-border text-muted-foreground hover:text-foreground flex items-center justify-center text-sm">−</button>
                <input type="number" value={amount} min={1} onChange={(e) => setAmount(Math.max(1, Number(e.target.value)))} className="flex-1 bg-secondary border border-border rounded px-2 py-1 text-[12px] font-mono tabular-nums text-center text-foreground focus:outline-none focus:border-primary" />
                <button onClick={() => setAmount(amount + 1)} className="size-6 rounded border border-border text-muted-foreground hover:text-foreground flex items-center justify-center text-sm">+</button>
                <span className="text-[9px] text-muted-foreground font-mono">{currency}</span>
              </div>
            </div>

            {/* Quick amounts */}
            <div className="flex gap-1 ml-16">
              {[1, 5, 10, 25, 50, 100].map((v) => (
                <button key={v} onClick={() => setAmount(v)} className={`px-1.5 py-0.5 rounded border text-[9px] font-mono transition-colors ${amount === v ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground hover:text-foreground"}`}>{v}</button>
              ))}
            </div>

            {/* Duration */}
            <div className="flex items-center gap-2">
              <span className="text-[9px] uppercase tracking-widest text-muted-foreground w-14">Duration</span>
              <div className="flex gap-1 flex-1">
                <input type="number" value={duration} min={1} onChange={(e) => setDuration(Math.max(1, Number(e.target.value)))} className="w-14 bg-secondary border border-border rounded px-2 py-1 text-[11px] font-mono text-center text-foreground focus:outline-none focus:border-primary" />
                <select value={durationUnit} onChange={(e) => setDurationUnit(e.target.value as typeof durationUnit)} className="flex-1 bg-secondary border border-border rounded px-2 py-1 text-[10px] font-mono text-foreground focus:outline-none focus:border-primary">
                  {DURATION_UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
                </select>
              </div>
            </div>

            {/* Quick durations */}
            <div className="flex gap-1 ml-16">
              {[1, 3, 5, 10, 15].map((v) => (
                <button key={v} onClick={() => setDuration(v)} className={`px-1.5 py-0.5 rounded border text-[9px] font-mono transition-colors ${duration === v ? "border-accent text-accent bg-accent/10" : "border-border text-muted-foreground hover:text-foreground"}`}>{v}</button>
              ))}
            </div>

            {/* Barrier */}
            {needsBarrier && (
              <div className="flex items-center gap-2">
                <span className="text-[9px] uppercase tracking-widest text-muted-foreground w-14">Barrier</span>
                <input type="text" value={barrier} onChange={(e) => setBarrier(e.target.value)} placeholder={contractType.startsWith("DIGIT") ? "0–9" : "+0.001"} className="flex-1 bg-secondary border border-border rounded px-2 py-1 text-[11px] font-mono text-foreground focus:outline-none focus:border-primary placeholder:text-muted-foreground/50" />
              </div>
            )}

            {/* Quote button */}
            <button onClick={handleGetProposal} disabled={!connected || proposalLoading} className="w-full py-2 rounded border border-accent/60 text-accent bg-accent/10 text-[10px] font-mono uppercase tracking-widest hover:bg-accent/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
              {proposalLoading ? <span className="flex items-center justify-center gap-2"><span className="size-2 rounded-full bg-accent animate-ping" />Getting quote…</span> : "Get Quote"}
            </button>

            {error && <div className="text-[10px] font-mono text-red-300 bg-red-500/10 border border-red-500/20 rounded p-2">✕ {error}</div>}

            {/* Proposal card */}
            {proposal && !proposalLoading && (
              <div className="rounded-lg border border-primary/50 bg-primary/5 p-3 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] uppercase tracking-widest text-muted-foreground">Live Quote</span>
                  <button onClick={clearProposal} className="text-[10px] text-muted-foreground hover:text-foreground">✕</button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="text-[8px] text-muted-foreground uppercase tracking-widest">Cost</div>
                    <div className="text-xl font-bold font-mono tabular-nums">{currency} {proposal.ask_price.toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="text-[8px] text-muted-foreground uppercase tracking-widest">Payout</div>
                    <div className="text-xl font-bold font-mono tabular-nums text-bull">{currency} {proposal.payout.toFixed(2)}</div>
                  </div>
                </div>
                <div className="text-[9px] text-muted-foreground font-mono leading-relaxed border-t border-border/40 pt-2">{proposal.longcode}</div>
                {/* Return meter */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
                    <div className="h-full bg-bull rounded-full transition-all duration-300" style={{ width: `${Math.min(100, ((proposal.payout - proposal.ask_price) / proposal.ask_price) * 100)}%` }} />
                  </div>
                  <span className="text-[9px] font-mono text-bull">+{(((proposal.payout - proposal.ask_price) / proposal.ask_price) * 100).toFixed(1)}%</span>
                </div>
                <button onClick={() => buyContract(proposal.id, proposal.ask_price)} disabled={buying} className="w-full py-2.5 rounded border border-bull/60 text-bull bg-bull/10 text-[11px] font-mono uppercase tracking-widest font-semibold hover:bg-bull/20 disabled:opacity-40 transition-all shadow-[0_0_12px_rgba(74,222,128,0.1)]">
                  {buying ? <span className="flex items-center justify-center gap-2"><span className="size-2 rounded-full bg-bull animate-ping" />Buying…</span> : `Buy · ${currency} ${proposal.ask_price.toFixed(2)}`}
                </button>
              </div>
            )}

            {/* Last trade */}
            {lastTrade && !buying && (
              <div className="rounded border border-bull/30 bg-bull/5 p-2 text-[9px] font-mono">
                <div className="text-bull/70 uppercase tracking-widest mb-1">Last Purchase · #{lastTrade.contract_id}</div>
                <div className="text-foreground/70 leading-relaxed mb-1 line-clamp-2">{lastTrade.longcode}</div>
                <div className="flex gap-3">
                  <span>Paid: <span className="text-foreground">{currency} {lastTrade.buy_price.toFixed(2)}</span></span>
                  <span>Max payout: <span className="text-bull">{currency} {lastTrade.payout.toFixed(2)}</span></span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Positions tab */}
        {tab === "positions" && (
          <div className="p-3 space-y-2">
            {openContracts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <div className="text-3xl opacity-10">⊘</div>
                <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">No open positions</div>
              </div>
            ) : (
              openContracts.map((c) => <ContractCard key={c.contract_id} contract={c} onSell={sellContract} currency={currency} />)
            )}
          </div>
        )}

        {/* History tab */}
        {tab === "history" && (
          <div className="p-3 space-y-1.5">
            {tradeHistory.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <div className="text-3xl opacity-10">◎</div>
                <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">No trades this session</div>
              </div>
            ) : (
              tradeHistory.filter(Boolean).map((t, i) => (
                <div key={i} className="rounded border border-border/50 bg-secondary/30 p-2 text-[9px] font-mono">
                  <div className="flex justify-between mb-1">
                    <span className="text-muted-foreground">#{t!.contract_id}</span>
                    <span className="text-muted-foreground">{new Date(t!.start_time * 1000).toLocaleTimeString()}</span>
                  </div>
                  <div className="text-foreground/70 leading-relaxed line-clamp-1 mb-1">{t!.longcode}</div>
                  <div className="flex gap-3">
                    <span>Paid: <span className="text-foreground">{currency} {t!.buy_price.toFixed(2)}</span></span>
                    <span>Max: <span className="text-bull">{currency} {t!.payout.toFixed(2)}</span></span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ContractCard({ contract, onSell, currency }: { contract: import("@/hooks/use-deriv-trading").OpenContract; onSell: (id: number) => void; currency: string }) {
  const isProfit = contract.profit >= 0;
  return (
    <div className={`rounded-lg border p-3 flex flex-col gap-2 ${isProfit ? "border-bull/30 bg-bull/5" : "border-bear/30 bg-bear/5"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[8px] font-mono text-muted-foreground uppercase tracking-widest">{contract.contract_type} · {contract.underlying}</div>
          <div className="text-[9px] font-mono text-foreground/80 leading-relaxed line-clamp-2">{contract.longcode}</div>
        </div>
        <button onClick={() => onSell(contract.contract_id)} className="shrink-0 px-2 py-1 rounded border border-bear/50 text-bear text-[8px] font-mono uppercase hover:bg-bear/10 transition-colors">Sell</button>
      </div>
      <div className="grid grid-cols-3 gap-2 text-[9px] font-mono border-t border-border/30 pt-2">
        <div><div className="text-muted-foreground">Bought</div><div>{currency} {contract.buy_price.toFixed(2)}</div></div>
        <div><div className="text-muted-foreground">Current</div><div>{currency} {contract.bid_price.toFixed(2)}</div></div>
        <div>
          <div className="text-muted-foreground">P/L</div>
          <div className={isProfit ? "text-bull" : "text-bear"}>{isProfit ? "+" : ""}{contract.profit.toFixed(2)}</div>
        </div>
      </div>
    </div>
  );
}
