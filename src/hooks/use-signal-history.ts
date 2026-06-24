import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";

type Signal = Database["public"]["Tables"]["signal_history"]["Row"];
type SignalInsert = Database["public"]["Tables"]["signal_history"]["Insert"];

export function useSignalHistory(userId: string | undefined, symbol?: string) {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    let query = supabase
      .from("signal_history")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (symbol) query = query.eq("symbol", symbol);
    const { data } = await query;
    setSignals(data ?? []);
    setLoading(false);
  }, [userId, symbol]);

  useEffect(() => { fetch(); }, [fetch]);

  async function saveSignal(signal: Omit<SignalInsert, "user_id">) {
    if (!userId) return { error: new Error("Not authenticated") };
    const { data, error } = await supabase
      .from("signal_history")
      .insert({ ...signal, user_id: userId })
      .select()
      .single();
    if (data) setSignals((prev) => [data, ...prev.slice(0, 99)]);
    return { data, error };
  }

  async function deleteSignal(id: string) {
    const { error } = await supabase.from("signal_history").delete().eq("id", id);
    if (!error) setSignals((prev) => prev.filter((s) => s.id !== id));
    return { error };
  }

  return { signals, loading, saveSignal, deleteSignal, refetch: fetch };
}
