import { useCallback, useEffect, useRef, useState } from "react";

/* ─── Types ──────────────────────────────────────────────────────────────── */
export interface Balance { balance: number; currency: string; loginid: string }

export interface Proposal {
  id: string;
  ask_price: number;
  payout: number;
  spot: number;
  spot_time: number;
  longcode: string;
  contract_type: string;
  return_pct: number;
}

export interface OpenContract {
  contract_id: number;
  contract_type: string;
  buy_price: number;
  bid_price: number;
  payout: number;
  profit: number;
  profit_percentage: number;
  status: string;
  is_sold: number;
  underlying: string;
  longcode: string;
  date_start: number;
  date_expiry: number;
  entry_spot: number;
  current_spot: number;
  sell_price?: number;
}

export interface BuyResult {
  contract_id: number;
  buy_price: number;
  payout: number;
  balance_after: number;
  longcode: string;
  transaction_id: number;
  start_time: number;
}

export interface TradeResult extends BuyResult {
  outcome?: "won" | "lost";
  sell_price?: number;
  profit?: number;
}

export interface ProposalParams {
  contract_type: string;
  symbol: string;
  currency: string;
  amount: number;
  basis: "stake" | "payout";
  duration: number;
  duration_unit: "t" | "s" | "m" | "h" | "d";
  barrier?: string;
}

export interface AutoTradeConfig {
  enabled: boolean;
  contract_type: string;
  symbol: string;
  currency: string;
  amount: number;
  basis: "stake" | "payout";
  duration: number;
  duration_unit: "t" | "s" | "m" | "h" | "d";
  barrier?: string;
  max_trades?: number;
  stop_loss?: number;
  take_profit?: number;
  delay_between_ms?: number;
  martingale?: boolean;
  martingale_multiplier?: number;
}

/* ─── Hook ───────────────────────────────────────────────────────────────── */
export function useDerivTrading(wsUrl: string | null) {
  const [connected, setConnected]             = useState(false);
  const [authorized, setAuthorized]           = useState(false);
  const [balance, setBalance]                 = useState<Balance | null>(null);
  const [proposal, setProposal]               = useState<Proposal | null>(null);
  const [proposalLoading, setProposalLoading] = useState(false);
  const [openContracts, setOpenContracts]     = useState<OpenContract[]>([]);
  const [buying, setBuying]                   = useState(false);
  const [error, setError]                     = useState<string | null>(null);
  const [lastTrade, setLastTrade]             = useState<TradeResult | null>(null);
  const [tradeHistory, setTradeHistory]       = useState<TradeResult[]>([]);
  const [autoRunning, setAutoRunning]         = useState(false);
  const [autoConfig, setAutoConfig]           = useState<AutoTradeConfig | null>(null);
  const [autoStats, setAutoStats]             = useState({ trades: 0, won: 0, lost: 0, pnl: 0 });
  const [wsLog, setWsLog]                     = useState<string[]>([]);

  const wsRef      = useRef<WebSocket | null>(null);
  const reqIdRef   = useRef(100);
  // Separate maps: buy/sell/portfolio = one-shot; balance = streamer
  const buyListeners = useRef<Map<number, (d: Record<string, unknown>) => void>>(new Map());
  const balStreamId  = useRef<number | null>(null);
  // Proposal: always goes through here
  const propSubRef   = useRef<string | null>(null);
  const propResolveRef = useRef<((p: Proposal) => void) | null>(null);
  const pingRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoRef      = useRef(false);
  const autoAmountRef = useRef(0);
  // For settle detection in auto-trade
  const settleResolvers = useRef<Map<number, (outcome: { won: boolean; profit: number }) => void>>(new Map());

  const nextId = () => ++reqIdRef.current;
  const log = (msg: string) => setWsLog(prev => [`${new Date().toLocaleTimeString()} ${msg}`, ...prev].slice(0, 100));

  function rawSend(payload: Record<string, unknown>) {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) throw new Error("WS not open");
    ws.send(JSON.stringify(payload));
  }

  // Promise-based one-shot send (for buy, sell, portfolio)
  function sendOnce<T>(payload: Record<string, unknown>, timeout = 20_000): Promise<T> {
    return new Promise((resolve, reject) => {
      const rid = nextId();
      const full = { ...payload, req_id: rid };
      const timer = setTimeout(() => {
        buyListeners.current.delete(rid);
        reject(new Error(`Timeout (req_id ${rid})`));
      }, timeout);
      buyListeners.current.set(rid, (data) => {
        clearTimeout(timer);
        if (data.error) {
          reject(new Error((data.error as Record<string, unknown>).message as string ?? JSON.stringify(data.error)));
        } else {
          resolve(data as T);
        }
      });
      rawSend(full);
    });
  }

  /* ── WebSocket connection ── */
  useEffect(() => {
    if (!wsUrl) return;
    log("Connecting…");

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      setAuthorized(true);
      log("✓ Connected via OTP — pre-authenticated");

      // Balance subscription
      const rid = nextId();
      balStreamId.current = rid;
      rawSend({ balance: 1, subscribe: 1, req_id: rid });
      log("Subscribed to balance stream");

      // Load open portfolio
      sendOnce<Record<string, unknown>>({ portfolio: 1 })
        .then((data) => {
          const contracts = (data.portfolio as Record<string, unknown>)?.contracts as Record<string, unknown>[] | undefined;
          if (contracts?.length) {
            log(`Found ${contracts.length} open contract(s)`);
            contracts.forEach(c => rawSend({ proposal_open_contract: 1, contract_id: Number(c.contract_id), subscribe: 1 }));
          }
        })
        .catch(() => { /* silent */ });

      // Keepalive
      if (pingRef.current) clearInterval(pingRef.current);
      pingRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) rawSend({ ping: 1 });
      }, 25_000);
    };

    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data as string) as Record<string, unknown>;
        const type = data.msg_type as string;
        const rid  = data.req_id as number | undefined;

        if (type === "ping") return;

        // ── Balance stream (persistent) ──
        if (rid && rid === balStreamId.current) {
          const b = data.balance as Record<string, unknown> | undefined;
          if (b) setBalance({ balance: Number(b.balance), currency: String(b.currency), loginid: String(b.loginid ?? "") });
          return;
        }

        // ── One-shot listeners (buy, sell, portfolio, etc.) ──
        if (rid && buyListeners.current.has(rid)) {
          const cb = buyListeners.current.get(rid)!;
          buyListeners.current.delete(rid);
          cb(data);
          return;
        }

        // ── Proposal stream — NEVER routed via req_id ──
        // Proposals always land here regardless of req_id
        if (type === "proposal") {
          const p = data.proposal as Record<string, unknown> | undefined;
          if (!p) return;
          const sub = data.subscription as Record<string, unknown> | undefined;
          if (sub?.id) propSubRef.current = sub.id as string;

          const ask    = Number(p.ask_price);
          const payout = Number(p.payout);
          const prop: Proposal = {
            id: String(p.id),
            ask_price: ask,
            payout,
            spot: Number(p.spot ?? 0),
            spot_time: Number(p.spot_time ?? 0),
            longcode: String(p.longcode),
            contract_type: String(p.contract_type ?? ""),
            return_pct: ask > 0 ? ((payout - ask) / ask) * 100 : 0,
          };
          setProposal(prop);
          setProposalLoading(false);

          // Notify auto-trade if it's waiting
          if (propResolveRef.current) {
            const resolver = propResolveRef.current;
            propResolveRef.current = null;
            resolver(prop);
          }
          return;
        }

        // ── Open contract updates ──
        if (type === "proposal_open_contract") {
          const poc = data.proposal_open_contract as Record<string, unknown> | undefined;
          if (!poc) return;
          const contract: OpenContract = {
            contract_id: Number(poc.contract_id),
            contract_type: String(poc.contract_type),
            buy_price: Number(poc.buy_price),
            bid_price: Number(poc.bid_price ?? poc.buy_price),
            payout: Number(poc.payout),
            profit: Number(poc.profit ?? 0),
            profit_percentage: Number(poc.profit_percentage ?? 0),
            status: String(poc.status),
            is_sold: Number(poc.is_sold ?? 0),
            underlying: String(poc.underlying),
            longcode: String(poc.longcode),
            date_start: Number(poc.date_start),
            date_expiry: Number(poc.date_expiry),
            entry_spot: Number(poc.entry_spot ?? poc.spot ?? 0),
            current_spot: Number(poc.current_spot ?? poc.spot ?? 0),
            sell_price: poc.sell_price ? Number(poc.sell_price) : undefined,
          };

          if (contract.is_sold) {
            setOpenContracts(prev => prev.filter(c => c.contract_id !== contract.contract_id));
            const outcome: "won" | "lost" = contract.profit > 0 ? "won" : "lost";
            setTradeHistory(prev => {
              const idx = prev.findIndex(t => t.contract_id === contract.contract_id);
              if (idx >= 0) {
                const updated = [...prev];
                updated[idx] = { ...updated[idx], outcome, sell_price: contract.sell_price, profit: contract.profit };
                return updated;
              }
              return prev;
            });
            // Resolve settle promise for auto-trade
            const resolver = settleResolvers.current.get(contract.contract_id);
            if (resolver) {
              settleResolvers.current.delete(contract.contract_id);
              resolver({ won: contract.profit > 0, profit: contract.profit });
            }
            // Martingale
            if (autoRef.current && autoConfig?.martingale) {
              if (contract.profit > 0) {
                autoAmountRef.current = autoConfig.amount;
              } else {
                autoAmountRef.current = autoAmountRef.current * (autoConfig.martingale_multiplier ?? 2);
              }
            }
          } else {
            setOpenContracts(prev => {
              const idx = prev.findIndex(c => c.contract_id === contract.contract_id);
              if (idx >= 0) { const n = [...prev]; n[idx] = contract; return n; }
              return [...prev, contract];
            });
          }
          return;
        }

        // ── Balance one-shot refresh ──
        if (type === "balance" && rid !== balStreamId.current) {
          const b = data.balance as Record<string, unknown> | undefined;
          if (b) setBalance({ balance: Number(b.balance), currency: String(b.currency), loginid: String(b.loginid ?? "") });
          return;
        }

      } catch (e) {
        console.error("[TradingWS]", e);
      }
    };

    ws.onerror = () => { setError("WebSocket error"); };
    ws.onclose = (e) => {
      if (pingRef.current) clearInterval(pingRef.current);
      setConnected(false);
      setAuthorized(false);
      log(`Disconnected (${e.code})`);
    };

    return () => {
      autoRef.current = false;
      if (pingRef.current) clearInterval(pingRef.current);
      ws.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsUrl]);

  /* ── Get proposal (streaming) ── */
  const getProposal = useCallback(async (params: ProposalParams) => {
    if (!authorized) { setError("Not authorized — connect your Deriv account first"); return; }
    // Cancel old sub
    if (propSubRef.current) {
      try { rawSend({ forget: propSubRef.current }); } catch { /* ok */ }
      propSubRef.current = null;
    }
    propResolveRef.current = null;
    setProposal(null);
    setError(null);
    setProposalLoading(true);

    const payload: Record<string, unknown> = {
      proposal: 1,
      amount: params.amount,
      basis: params.basis,
      contract_type: params.contract_type,
      currency: params.currency,
      duration: params.duration,
      duration_unit: params.duration_unit,
      symbol: params.symbol,
      subscribe: 1,
      // NOTE: no req_id on proposals — so they always hit the proposal branch in onmessage
    };
    if (params.barrier !== undefined && params.barrier !== "") payload.barrier = params.barrier;

    try {
      rawSend(payload);
      log(`Quote requested: ${params.contract_type} ${params.symbol} ×${params.amount}`);
    } catch (e) {
      setError(String(e));
      setProposalLoading(false);
    }
  }, [authorized]);

  /* ── Buy ── */
  const buyContract = useCallback(async (proposalId: string, price: number): Promise<TradeResult | null> => {
    if (!authorized) { setError("Not authorized"); return null; }
    if (!proposalId) { setError("No proposal ID — get a quote first"); return null; }

    setBuying(true);
    setError(null);
    log(`Buying ${proposalId} @ ${price}…`);

    try {
      const data = await sendOnce<Record<string, unknown>>({ buy: proposalId, price });
      const b = data.buy as Record<string, unknown>;
      const result: TradeResult = {
        contract_id: Number(b.contract_id),
        buy_price: Number(b.buy_price),
        payout: Number(b.payout),
        balance_after: Number(b.balance_after),
        longcode: String(b.longcode),
        transaction_id: Number(b.transaction_id),
        start_time: Number(b.start_time),
      };
      log(`✓ Bought #${result.contract_id} · Paid ${result.buy_price} · Max payout ${result.payout}`);
      setLastTrade(result);
      setTradeHistory(prev => [result, ...prev].slice(0, 100));
      setBalance(prev => prev ? { ...prev, balance: result.balance_after } : prev);
      setProposal(null);
      // Subscribe to live updates
      try { rawSend({ proposal_open_contract: 1, contract_id: result.contract_id, subscribe: 1 }); } catch { /* ok */ }
      // Forget proposal stream
      if (propSubRef.current) {
        try { rawSend({ forget: propSubRef.current }); } catch { /* ok */ }
        propSubRef.current = null;
      }
      return result;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log(`✗ Buy failed: ${msg}`);
      setError(msg);
      return null;
    } finally {
      setBuying(false);
    }
  }, [authorized]);

  /* ── Sell ── */
  const sellContract = useCallback(async (contractId: number) => {
    if (!authorized) { setError("Not authorized"); return; }
    log(`Selling #${contractId}…`);
    try {
      await sendOnce<Record<string, unknown>>({ sell: contractId, price: 0 });
      log(`✓ Sold #${contractId}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log(`✗ Sell failed: ${msg}`);
      setError(msg);
    }
  }, [authorized]);

  /* ── Clear proposal ── */
  const clearProposal = useCallback(() => {
    if (propSubRef.current) {
      try { rawSend({ forget: propSubRef.current }); } catch { /* ok */ }
      propSubRef.current = null;
    }
    propResolveRef.current = null;
    setProposal(null);
    setProposalLoading(false);
  }, []);

  /* ── Auto trade ── */
  const startAutoTrade = useCallback(async (config: AutoTradeConfig) => {
    if (!authorized) { setError("Not authorized"); return; }
    if (autoRef.current) return;

    autoRef.current = true;
    autoAmountRef.current = config.amount;
    setAutoRunning(true);
    setAutoConfig(config);
    setAutoStats({ trades: 0, won: 0, lost: 0, pnl: 0 });
    log(`▶ Auto-trade started: ${config.contract_type} on ${config.symbol}`);

    let trades = 0, won = 0, lost = 0, pnl = 0;

    while (autoRef.current) {
      // Stop conditions
      if (config.max_trades && trades >= config.max_trades) { log(`Max trades (${config.max_trades}) reached`); break; }
      const curBal = balance?.balance ?? 0;
      if (config.stop_loss && curBal <= config.stop_loss) { log(`Stop loss hit (${curBal} ≤ ${config.stop_loss})`); break; }
      if (config.take_profit && curBal >= config.take_profit) { log(`Take profit hit (${curBal} ≥ ${config.take_profit})`); break; }

      const stake = autoAmountRef.current;

      try {
        // Cancel any existing proposal
        if (propSubRef.current) {
          try { rawSend({ forget: propSubRef.current }); } catch { /* ok */ }
          propSubRef.current = null;
        }
        propResolveRef.current = null;
        setProposal(null);
        setProposalLoading(true);

        // Request proposal — no req_id so it goes to proposal branch
        const propPayload: Record<string, unknown> = {
          proposal: 1,
          amount: stake,
          basis: config.basis,
          contract_type: config.contract_type,
          currency: config.currency,
          duration: config.duration,
          duration_unit: config.duration_unit,
          symbol: config.symbol,
          subscribe: 1,
        };
        if (config.barrier) propPayload.barrier = config.barrier;

        // Wait for first proposal tick via propResolveRef
        const prop = await new Promise<Proposal>((resolve, reject) => {
          const timer = setTimeout(() => {
            propResolveRef.current = null;
            reject(new Error("Proposal timeout — no response in 15s. Check symbol or connection."));
          }, 15_000);
          propResolveRef.current = (p) => { clearTimeout(timer); resolve(p); };
          try { rawSend(propPayload); } catch (e) { clearTimeout(timer); propResolveRef.current = null; reject(e); }
        });

        if (!autoRef.current) break;

        // Execute buy
        const result = await buyContract(prop.id, prop.ask_price);
        if (!result) { log("Buy failed — stopping auto-trade"); break; }

        trades++;

        // Wait for contract to settle
        const settled = await new Promise<{ won: boolean; profit: number }>((resolve) => {
          const safetyMs = (config.duration_unit === "t"
            ? config.duration * 2500
            : config.duration * 1200
          ) + 15_000;

          settleResolvers.current.set(result.contract_id, resolve);
          // Safety fallback
          setTimeout(() => {
            if (settleResolvers.current.has(result.contract_id)) {
              settleResolvers.current.delete(result.contract_id);
              resolve({ won: false, profit: 0 });
            }
          }, safetyMs);
        });

        if (settled.won) { won++; pnl += Math.abs(settled.profit); }
        else { lost++; pnl -= stake; }

        setAutoStats({ trades, won, lost, pnl });
        log(`Trade #${trades}: ${settled.won ? "✓ WON" : "✗ LOST"} | P/L ${pnl.toFixed(2)} ${config.currency}`);

        if (!autoRef.current) break;
        await new Promise(r => setTimeout(r, config.delay_between_ms ?? 500));

      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        log(`✗ Auto-trade error: ${msg}`);
        setError(msg);
        await new Promise(r => setTimeout(r, 3_000));
        // Don't break — retry unless stopped
        if (!autoRef.current) break;
      }
    }

    autoRef.current = false;
    setAutoRunning(false);
    setAutoConfig(null);
    log(`■ Stopped. ${trades} trades | ${won}W ${lost}L | P/L ${pnl.toFixed(2)}`);
  }, [authorized, balance, buyContract]);

  const stopAutoTrade = useCallback(() => {
    autoRef.current = false;
    setAutoRunning(false);
    log("■ Auto-trade stopped by user");
  }, []);

  return {
    connected, authorized, balance, proposal, proposalLoading,
    openContracts, buying, error, lastTrade, tradeHistory,
    autoRunning, autoConfig, autoStats, wsLog,
    getProposal, buyContract, sellContract, clearProposal,
    startAutoTrade, stopAutoTrade,
  };
}
