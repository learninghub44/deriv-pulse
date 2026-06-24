import { useCallback, useEffect, useRef, useState } from "react";

/* ─── Types ──────────────────────────────────────────────────────────────── */
export interface Balance {
  balance: number;
  currency: string;
  loginid: string;
}

export interface Proposal {
  id: string;
  ask_price: number;
  payout: number;
  spot: number;
  spot_time: number;
  date_start: number;
  date_expiry?: number;
  longcode: string;
  contract_type: string;
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
  current_spot_time: number;
  exit_tick?: number;
  exit_tick_time?: number;
  sell_price?: number;
  sell_time?: number;
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

export interface ProposalParams {
  contract_type: string;
  underlying_symbol: string;
  currency: string;
  amount: number;
  basis: "stake" | "payout";
  duration: number;
  duration_unit: "t" | "s" | "m" | "h" | "d";
  barrier?: string;
}

/* ─── Hook ───────────────────────────────────────────────────────────────── */
export function useDerivTrading(wsUrl: string | null) {
  const [connected, setConnected]     = useState(false);
  const [balance, setBalance]         = useState<Balance | null>(null);
  const [proposal, setProposal]       = useState<Proposal | null>(null);
  const [proposalLoading, setProposalLoading] = useState(false);
  const [openContracts, setOpenContracts]     = useState<OpenContract[]>([]);
  const [buyResult, setBuyResult]     = useState<BuyResult | null>(null);
  const [buying, setBuying]           = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [lastTrade, setLastTrade]     = useState<BuyResult | null>(null);

  const wsRef        = useRef<WebSocket | null>(null);
  const reqId        = useRef(100);
  const propSubRef   = useRef<string | null>(null);
  const balSubRef    = useRef<string | null>(null);
  const listeners    = useRef<Map<number, (data: Record<string, unknown>) => void>>(new Map());
  const pingRef      = useRef<ReturnType<typeof setInterval> | null>(null);

  const nextReqId = () => ++reqId.current;

  /* ── Send helper with promise ── */
  const send = useCallback(<T>(payload: Record<string, unknown>, timeout = 10_000): Promise<T> => {
    return new Promise((resolve, reject) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        reject(new Error("Not connected"));
        return;
      }
      const rid = (payload.req_id as number) ?? nextReqId();
      const full = { ...payload, req_id: rid };

      const timer = setTimeout(() => {
        listeners.current.delete(rid);
        reject(new Error(`Request ${rid} timed out`));
      }, timeout);

      listeners.current.set(rid, (data) => {
        clearTimeout(timer);
        if (data.error) {
          reject(new Error((data.error as Record<string, unknown>).message as string));
        } else {
          resolve(data as T);
        }
      });

      ws.send(JSON.stringify(full));
    });
  }, []);

  /* ── Connect to authenticated WS ── */
  useEffect(() => {
    if (!wsUrl) return;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      setError(null);

      // Subscribe to balance
      const balReqId = nextReqId();
      listeners.current.set(balReqId, (data) => {
        const b = (data.balance ?? data) as Record<string, unknown>;
        if (b.balance !== undefined) {
          setBalance({
            balance: Number(b.balance),
            currency: String(b.currency),
            loginid: String(b.loginid ?? ""),
          });
          if ((data.subscription as Record<string, unknown>)?.id) {
            balSubRef.current = (data.subscription as Record<string, unknown>).id as string;
          }
        }
      });
      ws.send(JSON.stringify({ balance: 1, subscribe: 1, req_id: balReqId }));

      // Subscribe to open contracts via portfolio
      const portReqId = nextReqId();
      ws.send(JSON.stringify({ portfolio: 1, req_id: portReqId }));

      // Keepalive
      if (pingRef.current) clearInterval(pingRef.current);
      pingRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ ping: 1 }));
      }, 25_000);
    };

    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data as string) as Record<string, unknown>;

        // Route to specific listener if req_id matches
        const rid = data.req_id as number | undefined;
        if (rid && listeners.current.has(rid)) {
          const cb = listeners.current.get(rid)!;
          listeners.current.delete(rid);
          cb(data);
          return;
        }

        // Subscription stream messages (no req_id match)
        const type = data.msg_type as string;

        if (type === "balance") {
          const b = data.balance as Record<string, unknown>;
          setBalance({ balance: Number(b.balance), currency: String(b.currency), loginid: String(b.loginid ?? "") });
        }

        if (type === "proposal") {
          const p = data.proposal as Record<string, unknown>;
          if (p) {
            const sub = data.subscription as Record<string, unknown> | undefined;
            if (sub?.id) propSubRef.current = sub.id as string;
            setProposal({
              id: String(p.id),
              ask_price: Number(p.ask_price),
              payout: Number(p.payout),
              spot: Number(p.spot),
              spot_time: Number(p.spot_time),
              date_start: Number(p.date_start),
              date_expiry: p.date_expiry ? Number(p.date_expiry) : undefined,
              longcode: String(p.longcode),
              contract_type: String(p.contract_type ?? ""),
            });
            setProposalLoading(false);
          }
        }

        if (type === "proposal_open_contract") {
          const poc = data.proposal_open_contract as Record<string, unknown>;
          if (poc) {
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
              entry_spot: Number(poc.entry_spot ?? poc.spot),
              current_spot: Number(poc.current_spot ?? poc.spot),
              current_spot_time: Number(poc.current_spot_time ?? poc.spot_time),
              exit_tick: poc.exit_tick ? Number(poc.exit_tick) : undefined,
              sell_price: poc.sell_price ? Number(poc.sell_price) : undefined,
            };
            setOpenContracts((prev) => {
              const idx = prev.findIndex((c) => c.contract_id === contract.contract_id);
              if (contract.is_sold) {
                // Remove sold contracts after brief display
                return idx >= 0 ? prev.filter((c) => c.contract_id !== contract.contract_id) : prev;
              }
              if (idx >= 0) {
                const next = [...prev];
                next[idx] = contract;
                return next;
              }
              return [...prev, contract];
            });
          }
        }

        if (type === "portfolio") {
          const contracts = (data.portfolio as Record<string, unknown>)?.contracts as Record<string, unknown>[] | undefined;
          // Subscribe to each open contract for live updates
          if (contracts?.length) {
            contracts.forEach((c) => {
              const cid = Number(c.contract_id);
              const subReqId = nextReqId();
              ws.send(JSON.stringify({
                proposal_open_contract: 1,
                contract_id: cid,
                subscribe: 1,
                req_id: subReqId,
              }));
            });
          }
        }

        if (type === "transaction") {
          // Refresh balance on any transaction
          const bReqId = nextReqId();
          ws.send(JSON.stringify({ balance: 1, req_id: bReqId }));
        }

        if (type === "ping") return;

      } catch (e) {
        console.error("[TradingWS] parse error:", e);
      }
    };

    ws.onerror = () => setError("WebSocket connection error");
    ws.onclose = () => {
      if (pingRef.current) clearInterval(pingRef.current);
      setConnected(false);
    };

    return () => {
      if (pingRef.current) clearInterval(pingRef.current);
      ws.close();
    };
  }, [wsUrl]);

  /* ── Get proposal ── */
  const getProposal = useCallback(async (params: ProposalParams) => {
    // Forget old proposal subscription
    if (propSubRef.current && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ forget: propSubRef.current }));
      propSubRef.current = null;
    }
    setProposal(null);
    setError(null);
    setProposalLoading(true);

    const rid = nextReqId();
    const payload: Record<string, unknown> = {
      proposal: 1,
      req_id: rid,
      amount: params.amount,
      basis: params.basis,
      contract_type: params.contract_type,
      currency: params.currency,
      duration: params.duration,
      duration_unit: params.duration_unit,
      underlying_symbol: params.underlying_symbol,
      subscribe: 1,
    };
    if (params.barrier) payload.barrier = params.barrier;

    try {
      // Set up streaming listener (proposal streams so we use onmessage)
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) throw new Error("Not connected");
      ws.send(JSON.stringify(payload));
      // Proposal will arrive via onmessage → proposal handler above
    } catch (e) {
      setError(String(e));
      setProposalLoading(false);
    }
  }, []);

  /* ── Buy contract ── */
  const buyContract = useCallback(async (proposalId: string, price: number) => {
    if (!proposalId) { setError("No proposal to buy"); return; }
    setBuying(true);
    setError(null);
    setBuyResult(null);

    try {
      const rid = nextReqId();
      const data = await send<Record<string, unknown>>({ buy: proposalId, price, req_id: rid, subscribe: 1 }, 15_000);
      const b = data.buy as Record<string, unknown>;
      const result: BuyResult = {
        contract_id: Number(b.contract_id),
        buy_price: Number(b.buy_price),
        payout: Number(b.payout),
        balance_after: Number(b.balance_after),
        longcode: String(b.longcode),
        transaction_id: Number(b.transaction_id),
        start_time: Number(b.start_time),
      };
      setBuyResult(result);
      setLastTrade(result);

      // Subscribe to contract updates
      const ws = wsRef.current;
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          proposal_open_contract: 1,
          contract_id: result.contract_id,
          subscribe: 1,
        }));
      }

      // Update balance
      if (balance) {
        setBalance((prev) => prev ? { ...prev, balance: result.balance_after } : prev);
      }

      // Clear proposal
      setProposal(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBuying(false);
    }
  }, [send, balance]);

  /* ── Sell contract ── */
  const sellContract = useCallback(async (contractId: number) => {
    setError(null);
    try {
      const rid = nextReqId();
      await send<Record<string, unknown>>({ sell: contractId, price: 0, req_id: rid }, 15_000);
      // Contract will be removed via proposal_open_contract is_sold stream
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [send]);

  /* ── Cancel proposal subscription ── */
  const clearProposal = useCallback(() => {
    if (propSubRef.current && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ forget: propSubRef.current }));
      propSubRef.current = null;
    }
    setProposal(null);
  }, []);

  return {
    connected,
    balance,
    proposal,
    proposalLoading,
    openContracts,
    buyResult,
    lastTrade,
    buying,
    error,
    getProposal,
    buyContract,
    sellContract,
    clearProposal,
  };
}
