import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_APP_ID, LEGACY_WS } from "./use-deriv-ticks";

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
/**
 * useDerivTrading
 *
 * Connects to the Deriv LEGACY WebSocket (ws.derivws.com) and authenticates
 * via the `authorize` message with the account's API token.
 *
 * Why legacy WS?
 * - The new OTP WS URL (api.derivws.com) uses a different message schema
 *   that is NOT compatible with legacy proposal/buy/sell messages.
 * - The legacy WS is fully documented, battle-tested, and supports all
 *   trading operations with a simple `authorize` handshake.
 *
 * @param apiToken  The Deriv API token for the selected account
 *                  (from fetchDerivAccounts or the authorize endpoint)
 * @param appId     Optional app ID (defaults to env var or "1089")
 */
export function useDerivTrading(apiToken: string | null, appId?: string, fallbackOAuthToken?: string | null) {
  const [connected, setConnected]             = useState(false);
  const [authorized, setAuthorized]           = useState(false);
  const [authError, setAuthError]             = useState<string | null>(null);
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

  const wsRef          = useRef<WebSocket | null>(null);
  const reqIdRef       = useRef(200);
  const oneShot        = useRef<Map<number, (d: Record<string, unknown>) => void>>(new Map());
  const balStreamId    = useRef<number | null>(null);
  const propSubRef     = useRef<string | null>(null);
  const propResolve    = useRef<((p: Proposal) => void) | null>(null);
  const pingRef        = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoRef        = useRef(false);
  const autoAmountRef  = useRef(0);
  const settleRef      = useRef<Map<number, (r: { won: boolean; profit: number }) => void>>(new Map());

  const nextId = () => ++reqIdRef.current;
  const log = (msg: string) => setWsLog(prev => [`${new Date().toLocaleTimeString()} ${msg}`, ...prev].slice(0, 200));

  function rawSend(payload: Record<string, unknown>) {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) throw new Error("WS not open");
    ws.send(JSON.stringify(payload));
  }

  function sendOnce<T>(payload: Record<string, unknown>, timeout = 20_000): Promise<T> {
    return new Promise((resolve, reject) => {
      const rid = nextId();
      const timer = setTimeout(() => {
        oneShot.current.delete(rid);
        reject(new Error(`Timeout req_id=${rid} msg=${payload.msg_type ?? Object.keys(payload)[0]}`));
      }, timeout);
      oneShot.current.set(rid, (d) => {
        clearTimeout(timer);
        if (d.error) reject(new Error((d.error as Record<string, unknown>).message as string ?? "Deriv error"));
        else resolve(d as T);
      });
      rawSend({ ...payload, req_id: rid });
    });
  }

  /* ── Connect + authorize via legacy WS ── */
  useEffect(() => {
    if (!apiToken && !fallbackOAuthToken) return;

    const wsUrl = LEGACY_WS(appId ?? (import.meta.env.VITE_DERIV_APP_ID as string | undefined) ?? DEFAULT_APP_ID);
    log(`Connecting to legacy WS…`);

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = async () => {
      setConnected(true);
      log("WS open — authorizing…");
      const tokenToUse = apiToken ?? fallbackOAuthToken!;
      try {
        // Step 1: authorize
        const authData = await sendOnce<Record<string, unknown>>({ authorize: tokenToUse });
        const acc = authData.authorize as Record<string, unknown>;
        log(`✓ Authorized as ${acc.loginid} (${acc.currency}) [${acc.is_virtual ? "DEMO" : "REAL"}]`);
        setAuthorized(true);
        setAuthError(null);

        // Step 2: balance subscription
        const balRid = nextId();
        balStreamId.current = balRid;
        rawSend({ balance: 1, subscribe: 1, req_id: balRid });
        log("Subscribed to balance");

        // Step 3: load open portfolio
        try {
          const portData = await sendOnce<Record<string, unknown>>({ portfolio: 1 });
          const contracts = (portData.portfolio as Record<string, unknown>)?.contracts as Record<string, unknown>[] | undefined;
          if (contracts?.length) {
            log(`Found ${contracts.length} open contract(s) — subscribing…`);
            contracts.forEach(c => rawSend({ proposal_open_contract: 1, contract_id: Number(c.contract_id), subscribe: 1 }));
          }
        } catch { /* portfolio not critical */ }

        // Keepalive
        if (pingRef.current) clearInterval(pingRef.current);
        pingRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) rawSend({ ping: 1 });
        }, 25_000);

      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        log(`✗ Auth failed: ${msg}`);
        setAuthError(msg);
      }
    };

    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data as string) as Record<string, unknown>;
        const type = data.msg_type as string;
        const rid  = data.req_id as number | undefined;

        if (type === "ping") return;

        // ── Balance stream ──
        if (rid && rid === balStreamId.current) {
          const b = data.balance as Record<string, unknown> | undefined;
          if (b) setBalance({ balance: Number(b.balance), currency: String(b.currency), loginid: String(b.loginid ?? "") });
          return;
        }

        // ── One-shot (buy, sell, portfolio, authorize) ──
        if (rid && oneShot.current.has(rid)) {
          const cb = oneShot.current.get(rid)!;
          oneShot.current.delete(rid);
          cb(data);
          return;
        }

        // ── Proposal stream — no req_id routing ──
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
          // Notify auto-trade
          if (propResolve.current) {
            const r = propResolve.current;
            propResolve.current = null;
            r(prop);
          }
          return;
        }

        // ── Open contract updates ──
        if (type === "proposal_open_contract") {
          const poc = data.proposal_open_contract as Record<string, unknown> | undefined;
          if (!poc) return;
          const c: OpenContract = {
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
          if (c.is_sold) {
            setOpenContracts(prev => prev.filter(x => x.contract_id !== c.contract_id));
            const outcome: "won" | "lost" = c.profit > 0 ? "won" : "lost";
            setTradeHistory(prev => {
              const idx = prev.findIndex(t => t.contract_id === c.contract_id);
              if (idx >= 0) {
                const u = [...prev];
                u[idx] = { ...u[idx], outcome, sell_price: c.sell_price, profit: c.profit };
                return u;
              }
              return prev;
            });
            const sr = settleRef.current.get(c.contract_id);
            if (sr) { settleRef.current.delete(c.contract_id); sr({ won: c.profit > 0, profit: c.profit }); }
            // Martingale
            if (autoRef.current && autoConfig?.martingale) {
              autoAmountRef.current = c.profit > 0
                ? autoConfig.amount
                : autoAmountRef.current * (autoConfig.martingale_multiplier ?? 2);
            }
          } else {
            setOpenContracts(prev => {
              const idx = prev.findIndex(x => x.contract_id === c.contract_id);
              if (idx >= 0) { const n = [...prev]; n[idx] = c; return n; }
              return [...prev, c];
            });
          }
          return;
        }

        // ── Balance one-shot refresh ──
        if (type === "balance" && rid !== balStreamId.current) {
          const b = data.balance as Record<string, unknown> | undefined;
          if (b) setBalance(prev => ({ ...prev!, balance: Number(b.balance), currency: String(b.currency) }));
          return;
        }

      } catch (e) { console.error("[TradingWS]", e); }
    };

    ws.onerror = () => setError("WebSocket error — check your connection");
    ws.onclose = (e) => {
      if (pingRef.current) clearInterval(pingRef.current);
      setConnected(false);
      setAuthorized(false);
      log(`Disconnected (code ${e.code})`);
    };

    return () => {
      autoRef.current = false;
      if (pingRef.current) clearInterval(pingRef.current);
      ws.close();
      wsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiToken, fallbackOAuthToken, appId]);

  /* ── Get proposal (streaming) ── */
  const getProposal = useCallback(async (params: ProposalParams) => {
    if (!authorized) { setError("Not authorized — reconnect your Deriv account"); return; }
    if (propSubRef.current) {
      try { rawSend({ forget: propSubRef.current }); } catch { /* ok */ }
      propSubRef.current = null;
    }
    propResolve.current = null;
    setProposal(null);
    setError(null);
    setProposalLoading(true);

    // IMPORTANT: no req_id — proposals route by msg_type not req_id
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
    };
    if (params.barrier !== undefined && params.barrier !== "") payload.barrier = params.barrier;

    try {
      rawSend(payload);
      log(`Quote: ${params.contract_type} ${params.symbol} ×${params.amount} ${params.currency} ${params.duration}${params.duration_unit}`);
    } catch (e) {
      setError(String(e));
      setProposalLoading(false);
    }
  }, [authorized]);

  /* ── Buy ── */
  const buyContract = useCallback(async (proposalId: string, price: number): Promise<TradeResult | null> => {
    if (!authorized) { setError("Not authorized"); return null; }
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
      log(`✓ Bought #${result.contract_id} · Paid ${result.buy_price} · Payout ${result.payout}`);
      setLastTrade(result);
      setTradeHistory(prev => [result, ...prev].slice(0, 200));
      setBalance(prev => prev ? { ...prev, balance: result.balance_after } : prev);
      setProposal(null);
      try { rawSend({ proposal_open_contract: 1, contract_id: result.contract_id, subscribe: 1 }); } catch { /* ok */ }
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
    if (!authorized) return;
    log(`Selling #${contractId}…`);
    try {
      await sendOnce<Record<string, unknown>>({ sell: contractId, price: 0 });
      log(`✓ Sold #${contractId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [authorized]);

  /* ── Clear proposal ── */
  const clearProposal = useCallback(() => {
    if (propSubRef.current) {
      try { rawSend({ forget: propSubRef.current }); } catch { /* ok */ }
      propSubRef.current = null;
    }
    propResolve.current = null;
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
    log(`▶ Auto-trade: ${config.contract_type} ${config.symbol} stake=${config.amount} ${config.currency}`);

    let trades = 0, won = 0, lost = 0, pnl = 0;

    while (autoRef.current) {
      if (config.max_trades && trades >= config.max_trades) { log(`Max trades (${config.max_trades}) reached`); break; }
      if (config.stop_loss && (balance?.balance ?? 0) <= config.stop_loss) { log(`Stop loss hit`); break; }
      if (config.take_profit && (balance?.balance ?? 0) >= config.take_profit) { log(`Take profit hit`); break; }

      const stake = autoAmountRef.current;

      try {
        // Cancel old proposal
        if (propSubRef.current) {
          try { rawSend({ forget: propSubRef.current }); } catch { /* ok */ }
          propSubRef.current = null;
        }
        propResolve.current = null;
        setProposal(null);
        setProposalLoading(true);

        // Get proposal — wait via propResolve, not req_id
        const prop = await new Promise<Proposal>((resolve, reject) => {
          const timer = setTimeout(() => {
            propResolve.current = null;
            reject(new Error(
              `Proposal timeout (15s). Symbol: ${config.symbol} | Type: ${config.contract_type}\n` +
              "Possible causes: symbol not tradeable, duration too short, or connection issue."
            ));
          }, 15_000);
          propResolve.current = (p) => { clearTimeout(timer); resolve(p); };

          const payload: Record<string, unknown> = {
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
          if (config.barrier) payload.barrier = config.barrier;
          try { rawSend(payload); }
          catch (e) { clearTimeout(timer); propResolve.current = null; reject(e); }
        });

        if (!autoRef.current) break;
        const result = await buyContract(prop.id, prop.ask_price);
        if (!result) { log("Buy failed — retrying in 3s…"); await new Promise(r => setTimeout(r, 3_000)); continue; }

        trades++;

        // Wait for settle
        const settled = await new Promise<{ won: boolean; profit: number }>((resolve) => {
          const safetyMs = (config.duration_unit === "t" ? config.duration * 2500 : config.duration * 1500) + 15_000;
          settleRef.current.set(result.contract_id, resolve);
          setTimeout(() => {
            if (settleRef.current.has(result.contract_id)) {
              settleRef.current.delete(result.contract_id);
              resolve({ won: false, profit: 0 });
            }
          }, safetyMs);
        });

        if (settled.won) { won++; pnl += Math.abs(settled.profit); }
        else { lost++; pnl -= stake; }
        setAutoStats({ trades, won, lost, pnl });
        log(`#${trades}: ${settled.won ? "✓ WON" : "✗ LOST"} | Balance P/L ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)} ${config.currency}`);

        if (!autoRef.current) break;
        await new Promise(r => setTimeout(r, config.delay_between_ms ?? 500));

      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        log(`✗ Error: ${msg}`);
        setError(msg);
        await new Promise(r => setTimeout(r, 3_000));
        if (!autoRef.current) break;
      }
    }

    autoRef.current = false;
    setAutoRunning(false);
    setAutoConfig(null);
    log(`■ Stopped. ${trades} trades | ${won}W/${lost}L | P/L ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}`);
  }, [authorized, balance, buyContract]);

  const stopAutoTrade = useCallback(() => {
    autoRef.current = false;
    setAutoRunning(false);
    log("■ Stopped by user");
  }, []);

  return {
    connected, authorized, authError, balance, proposal, proposalLoading,
    openContracts, buying, error, lastTrade, tradeHistory,
    autoRunning, autoConfig, autoStats, wsLog,
    getProposal, buyContract, sellContract, clearProposal,
    startAutoTrade, stopAutoTrade,
  };
}
