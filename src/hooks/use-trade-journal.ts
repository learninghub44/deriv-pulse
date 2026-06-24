import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";

type Trade = Database["public"]["Tables"]["trade_journal"]["Row"];
type TradeInsert = Database["public"]["Tables"]["trade_journal"]["Insert"];
type TradeUpdate = Database["public"]["Tables"]["trade_journal"]["Update"];

export type TradeStats = {
  total: number;
  wins: number;
  losses: number;
  pending: number;
  winRate: number;
  totalStaked: number;
  totalPayout: number;
  netPnl: number;
};

export function useTradeJournal(userId: string | undefined) {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(
    async (symbol?: string) => {
      if (!userId) return;
      setLoading(true);
      let query = supabase
        .from("trade_journal")
        .select("*")
        .eq("user_id", userId)
        .order("opened_at", { ascending: false })
        .limit(200);
      if (symbol) query = query.eq("symbol", symbol);
      const { data } = await query;
      setTrades(data ?? []);
      setLoading(false);
    },
    [userId]
  );

  useEffect(() => { fetch(); }, [fetch]);

  async function logTrade(trade: Omit<TradeInsert, "user_id">) {
    if (!userId) return { error: new Error("Not authenticated") };
    const { data, error } = await supabase
      .from("trade_journal")
      .insert({ ...trade, user_id: userId })
      .select()
      .single();
    if (data) setTrades((prev) => [data, ...prev]);
    return { data, error };
  }

  async function updateTrade(id: string, updates: TradeUpdate) {
    const { data, error } = await supabase
      .from("trade_journal")
      .update(updates)
      .eq("id", id)
      .select()
      .single();
    if (data) setTrades((prev) => prev.map((t) => (t.id === id ? data : t)));
    return { data, error };
  }

  async function deleteTrade(id: string) {
    const { error } = await supabase.from("trade_journal").delete().eq("id", id);
    if (!error) setTrades((prev) => prev.filter((t) => t.id !== id));
    return { error };
  }

  const stats: TradeStats = {
    total: trades.length,
    wins: trades.filter((t) => t.outcome === "win").length,
    losses: trades.filter((t) => t.outcome === "loss").length,
    pending: trades.filter((t) => t.outcome === "pending").length,
    winRate:
      trades.filter((t) => t.outcome !== "pending").length > 0
        ? (trades.filter((t) => t.outcome === "win").length /
            trades.filter((t) => t.outcome !== "pending").length) *
          100
        : 0,
    totalStaked: trades.reduce((sum, t) => sum + Number(t.stake), 0),
    totalPayout: trades.reduce((sum, t) => sum + Number(t.payout ?? 0), 0),
    netPnl:
      trades.reduce((sum, t) => sum + Number(t.payout ?? 0), 0) -
      trades.reduce((sum, t) => sum + Number(t.stake), 0),
  };

  return { trades, stats, loading, logTrade, updateTrade, deleteTrade, refetch: fetch };
}
