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
  return_pct: number;  // profit % if win
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
  symbol: string;        // Deriv still uses "symbol" not "underlying_symbol" in proposal API
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
  max_trades?: number;         // stop after N trades (0 = unlimited)
  stop_loss?: number;          // stop if balance drops below this
  take_profit?: number;        // stop if balance rises above this
  delay_between_ms?: number;   // ms between trades (default 500)
  martingale?: boolean;        // double stake on loss
  martingale_multiplier?: number;
}

/* ─── Hook ───────────────────────────────────────────────────────────────── */
export function useDerivTrading(wsUrl: string | null, accessToken?: string | null) {
  const [connected, setConnected]           = useState(false);
  const [authorized, setAuthorized]         = useState(false);
  const [balance, setBalance]               = useState<Balance | null>(null);
  const [proposal, setProposal]             = useState<Proposal | null>(null);
  const [proposalLoading, setProposalLoading] = useState(false);
  const [openContracts, setOpenContracts]   = useState<OpenContract[]>([]);
  const [buying, setBuying]                 = useState(false);
  const [error, setError]                   = useState<string | null>(null);
  const [lastTrade, setLastTrade]           = useState<TradeResult | null>(null);
  const [tradeHistory, setTradeHistory]     = useState<TradeResult[]>([]);
  const [autoConfig, setAutoConfig]         = useState<AutoTradeConfig | null>(null);
  const [autoRunning, setAutoRunning]       = useState(false);
  const [autoStats, setAutoStats]           = useState({ trades: 0, won: 0, lost: 0, pnl: 0 });
  const [wsLog, setWsLog]                   = useState<string[]>([]);  // debug log

  const wsRef       = useRef<WebSocket | null>(null);
  const reqId       = useRef(100);
  const propSubRef  = useRef<string | null>(null);
  const listeners   = useRef<Map<number, (data: Record<string, unknown>) => void>>(new Map());
  const streamers   = useRef<Map<number, (data: Record<string, unknown>) => void>>(new Map());
  const propResolverRef = useRef<((data: Record<string, unknown>) => void) | null>(null); // for auto-trade
  const pingRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoRef     = useRef(false);
  const autoAmount  = useRef(0);
  const autoStakes  = useRef<number[]>([]);

  const nextId = () => ++reqId.current;

  const log = (msg: string) => setWsLog(prev => [`${new Date().toLocaleTimeString()} ${msg}`, ...prev].slice(0, 50));

  /* ── Raw send ── */
  function rawSend(payload: Record<string, unknown>) {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) throw new Error("WebSocket not open");
    const msg = JSON.stringify(payload);
    ws.send(msg);
  }

  /* ── Promise send (one-shot response) ── */
  const send = useCallback(<T>(payload: Record<string, unknown>, timeout = 15_000): Promise<T> => {
    return new Promise((resolve, reject) => {
      const rid = payload.req_id as number ?? nextId();
      const full = { ...payload, req_id: rid };

      const timer = setTimeout(() => {
        listeners.current.delete(rid);
        reject(new Error(`Request timed out (req_id ${rid})`));
      }, timeout);

      listeners.current.set(rid, (data) => {
        clearTimeout(timer);
        if (data.error) {
          const msg = (data.error as Record<string, unknown>).message as string ?? JSON.stringify(data.error);
          reject(new Error(msg));
        } else {
          resolve(data as T);
        }
      });

      try {
        rawSend(full);
      } catch (e) {
        clearTimeout(timer);
        listeners.current.delete(rid);
        reject(e);
      }
    });
  }, []);

  /* ── Connect + authorize ── */
  useEffect(() => {
    if (!wsUrl) return;

    log("Connecting…");
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = async () => {
      setConnected(true);
      log("Connected");

      // Step 1: authorize with access token if provided (legacy WS still needs this)
      if (accessToken) {
        try {
          log("Authorizing…");
          const authData = await send<Record<string, unknown>>({ authorize: accessToken, req_id: nextId() });
          const acct = (authData.authorize ?? authData) as Record<string, unknown>;
          log(`Authorized as ${acct.loginid ?? "unknown"}`);
          setAuthorized(true);
          // Set balance from authorize response
          if (acct.balance !== undefined) {
            setBalance({
              balance: Number(acct.balance),
              currency: String(acct.currency ?? "USD"),
              loginid: String(acct.loginid ?? ""),
            });
          }
        } catch (e) {
          log(`Auth failed: ${e}`);
          setError(`Authorization failed: ${e}`);
          return;
        }
      } else {
        // OTP URL — already authenticated
        setAuthorized(true);
        log("Using OTP auth — no authorize msg needed");
      }

      // Step 2: subscribe to balance stream
      const balRid = nextId();
      streamers.current.set(balRid, (data) => {
        const b = data.balance as Record<string, unknown> | undefined;
        if (b) setBalance({ balance: Number(b.balance), currency: String(b.currency), loginid: String(b.loginid ?? "") });
      });
      rawSend({ balance: 1, subscribe: 1, req_id: balRid });
      log("Subscribed to balance");

      // Step 3: load open portfolio
      const portRid = nextId();
      listeners.current.set(portRid, (data) => {
        const contracts = (data.portfolio as Record<string, unknown>)?.contracts as Record<string, unknown>[] | undefined;
        if (contracts?.length) {
          log(`Found ${contracts.length} open contract(s), subscribing…`);
          contracts.forEach((c) => {
            rawSend({ proposal_open_contract: 1, contract_id: Number(c.contract_id), subscribe: 1 });
          });
        }
      });
      rawSend({ portfolio: 1, req_id: portRid });

      // Keepalive ping
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

        // Persistent stream handler (balance sub etc.)
        if (rid && streamers.current.has(rid)) {
          streamers.current.get(rid)!(data);
          return; // don't delete — it's persistent
        }

        // One-shot response handler
        if (rid && listeners.current.has(rid)) {
          const cb = listeners.current.get(rid)!;
          listeners.current.delete(rid);
          cb(data);
          return;
        }

        // ── Proposal stream ──
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

          // Notify auto-trade loop if it's waiting for a proposal
          if (propResolverRef.current) {
            propResolverRef.current(data);
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
            // Contract settled — update trade history with outcome
            setOpenContracts(prev => prev.filter(c => c.contract_id !== contract.contract_id));
            setTradeHistory(prev => {
              const idx = prev.findIndex(t => t.contract_id === contract.contract_id);
              const outcome: "won" | "lost" = contract.profit > 0 ? "won" : "lost";
              if (idx >= 0) {
                const updated = [...prev];
                updated[idx] = { ...updated[idx], outcome, sell_price: contract.sell_price, profit: contract.profit };
                return updated;
              }
              return prev;
            });
            // Martingale: update stake for next trade
            if (autoRef.current && autoConfig?.martingale) {
              const won = contract.profit > 0;
              if (won) {
                autoAmount.current = autoConfig.amount; // reset on win
              } else {
                autoAmount.current = autoAmount.current * (autoConfig.martingale_multiplier ?? 2);
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

        // ── Balance update from transaction ──
        if (type === "transaction") {
          rawSend({ balance: 1, req_id: nextId() });
          return;
        }

        if (type === "balance") {
          const b = data.balance as Record<string, unknown> | undefined;
          if (b) setBalance({ balance: Number(b.balance), currency: String(b.currency), loginid: String(b.loginid ?? "") });
          return;
        }

      } catch (e) {
        console.error("[TradingWS]", e);
      }
    };

    ws.onerror = (e) => {
      log(`WS error: ${e}`);
      setError("WebSocket error — check console");
    };
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
  }, [wsUrl, accessToken, send]);

  /* ── Get proposal (streaming) ── */
  const getProposal = useCallback(async (params: ProposalParams) => {
    if (!authorized) { setError("Not authorized — connect Deriv account first"); return; }
    // Forget old proposal sub
    if (propSubRef.current) {
      try { rawSend({ forget: propSubRef.current }); } catch { /* ok */ }
      propSubRef.current = null;
    }
    setProposal(null);
    setError(null);
    setProposalLoading(true);

    const payload: Record<string, unknown> = {
      proposal: 1,
      req_id: nextId(),
      amount: params.amount,
      basis: params.basis,
      contract_type: params.contract_type,
      currency: params.currency,
      duration: params.duration,
      duration_unit: params.duration_unit,
      symbol: params.symbol,   // ← correct field name for Deriv proposal API
      subscribe: 1,
    };
    if (params.barrier !== undefined && params.barrier !== "") payload.barrier = params.barrier;

    try {
      rawSend(payload);
      log(`Proposal requested: ${params.contract_type} ${params.symbol} ${params.amount} ${params.currency}`);
    } catch (e) {
      setError(String(e));
      setProposalLoading(false);
    }
  }, [authorized]);

  /* ── Execute single buy ── */
  const buyContract = useCallback(async (proposalId: string, price: number): Promise<TradeResult | null> => {
    if (!authorized) { setError("Not authorized"); return null; }
    if (!proposalId) { setError("No proposal ID"); return null; }

    setBuying(true);
    setError(null);
    log(`Buying proposal ${proposalId} @ ${price}…`);

    try {
      const rid = nextId();
      // NOTE: buy does NOT use subscribe:1
      const data = await send<Record<string, unknown>>({ buy: proposalId, price, req_id: rid }, 20_000);
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

      log(`✓ Bought! Contract #${result.contract_id} · Paid ${result.buy_price} · Max payout ${result.payout}`);
      setLastTrade(result);
      setTradeHistory(prev => [result, ...prev].slice(0, 50));
      setBalance(prev => prev ? { ...prev, balance: result.balance_after } : prev);
      setProposal(null);

      // Subscribe to this contract's live updates
      try { rawSend({ proposal_open_contract: 1, contract_id: result.contract_id, subscribe: 1 }); } catch { /* ok */ }

      // Forget proposal stream (it's consumed)
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
  }, [authorized, send]);

  /* ── Sell open contract ── */
  const sellContract = useCallback(async (contractId: number) => {
    if (!authorized) { setError("Not authorized"); return; }
    setError(null);
    log(`Selling contract #${contractId}…`);
    try {
      await send<Record<string, unknown>>({ sell: contractId, price: 0, req_id: nextId() }, 15_000);
      log(`✓ Sell order sent for #${contractId}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log(`✗ Sell failed: ${msg}`);
      setError(msg);
    }
  }, [authorized, send]);

  /* ── Clear proposal ── */
  const clearProposal = useCallback(() => {
    if (propSubRef.current) {
      try { rawSend({ forget: propSubRef.current }); } catch { /* ok */ }
      propSubRef.current = null;
    }
    setProposal(null);
    setProposalLoading(false);
  }, []);

  /* ── Auto trade ── */
  const startAutoTrade = useCallback(async (config: AutoTradeConfig) => {
    if (!authorized) { setError("Not authorized — connect Deriv first"); return; }
    if (autoRef.current) return;

    autoRef.current = true;
    autoAmount.current = config.amount;
    autoStakes.current = [];
    setAutoRunning(true);
    setAutoConfig(config);
    setAutoStats({ trades: 0, won: 0, lost: 0, pnl: 0 });
    log(`▶ Auto-trade started: ${config.contract_type} ${config.symbol} stake=${config.amount} ${config.currency}`);

    let trades = 0;
    let won = 0;
    let lost = 0;
    let pnl = 0;

    while (autoRef.current) {
      // Check stop conditions
      if (config.max_trades && trades >= config.max_trades) {
        log(`Auto-trade: reached max trades (${config.max_trades})`);
        break;
      }
      const currentBalance = balance?.balance ?? 0;
      if (config.stop_loss && currentBalance <= config.stop_loss) {
        log(`Auto-trade: stop loss hit (balance ${currentBalance} ≤ ${config.stop_loss})`);
        break;
      }
      if (config.take_profit && currentBalance >= config.take_profit) {
        log(`Auto-trade: take profit hit (balance ${currentBalance} ≥ ${config.take_profit})`);
        break;
      }

      const stake = autoAmount.current;

      // Get proposal
      try {
        // Forget old sub
        if (propSubRef.current) {
          try { rawSend({ forget: propSubRef.current }); } catch { /* ok */ }
          propSubRef.current = null;
        }
        setProposal(null);
        setProposalLoading(true);

        const propPayload: Record<string, unknown> = {
          proposal: 1,
          req_id: nextId(),
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

        // Wait for first proposal response via the onmessage proposal handler
        // We resolve when proposal state updates (the onmessage handler sets it)
        const propData = await new Promise<Record<string, unknown>>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error("Proposal timeout after 10s")), 10_000);
          // One-shot resolver that fires when the proposal stream first responds
          propResolverRef.current = (data) => {
            clearTimeout(timer);
            propResolverRef.current = null;
            resolve(data);
          };
          try { rawSend(propPayload); } catch (e) { clearTimeout(timer); propResolverRef.current = null; reject(e); }
        });

        const p = propData.proposal as Record<string, unknown>;
        const sub = propData.subscription as Record<string, unknown> | undefined;
        if (sub?.id) propSubRef.current = sub.id as string;

        const proposalId = String(p.id);
        const askPrice   = Number(p.ask_price);
        const payout     = Number(p.payout);

        setProposal({
          id: proposalId, ask_price: askPrice, payout,
          spot: Number(p.spot ?? 0), spot_time: Number(p.spot_time ?? 0),
          longcode: String(p.longcode), contract_type: config.contract_type,
          return_pct: askPrice > 0 ? ((payout - askPrice) / askPrice) * 100 : 0,
        });
        setProposalLoading(false);

        if (!autoRef.current) break;

        // Execute buy
        const result = await buyContract(proposalId, askPrice);
        if (!result) { log("Auto-trade: buy failed, stopping"); break; }

        trades++;
        autoStakes.current.push(stake);

        // Wait for contract to settle
        const settled = await new Promise<{ won: boolean; profit: number }>((resolve) => {
          const contractId = result.contract_id;
          const checkInterval = setInterval(() => {
            if (!autoRef.current) { clearInterval(checkInterval); resolve({ won: false, profit: 0 }); return; }
            const contract = openContracts.find(c => c.contract_id === contractId);
            if (!contract) {
              // Contract removed from open list = settled
              clearInterval(checkInterval);
              // Check trade history for outcome
              setTradeHistory(prev => {
                const t = prev.find(h => h.contract_id === contractId);
                if (t?.outcome) {
                  resolve({ won: t.outcome === "won", profit: t.profit ?? 0 });
                } else {
                  resolve({ won: false, profit: 0 });
                }
                return prev;
              });
            }
          }, 500);
          // Safety timeout based on duration
          const safetyMs = (config.duration_unit === "t" ? config.duration * 2000 : config.duration * 1000) + 10_000;
          setTimeout(() => { clearInterval(checkInterval); resolve({ won: false, profit: 0 }); }, safetyMs);
        });

        if (settled.won) { won++; pnl += Math.abs(settled.profit); }
        else { lost++; pnl -= stake; }

        setAutoStats({ trades, won, lost, pnl });
        log(`Trade #${trades}: ${settled.won ? "✓ WON" : "✗ LOST"} · P/L ${pnl.toFixed(2)}`);

        if (!autoRef.current) break;

        // Delay before next trade
        await new Promise(r => setTimeout(r, config.delay_between_ms ?? 500));

      } catch (e) {
        log(`Auto-trade error: ${e}`);
        setError(String(e));
        // Brief pause before retry
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    autoRef.current = false;
    setAutoRunning(false);
    setAutoConfig(null);
    log(`■ Auto-trade stopped. Total: ${trades} trades | Won: ${won} | Lost: ${lost} | P/L: ${pnl.toFixed(2)}`);
  }, [authorized, balance, buyContract, openContracts]);

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
