import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";

type Watchlist = Database["public"]["Tables"]["watchlists"]["Row"];

export function useWatchlists(userId: string | undefined) {
  const [watchlists, setWatchlists] = useState<Watchlist[]>([]);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const { data } = await supabase
      .from("watchlists")
      .select("*")
      .eq("user_id", userId)
      .order("is_default", { ascending: false })
      .order("created_at");
    setWatchlists((data as Watchlist[]) ?? []);
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetch(); }, [fetch]);

  async function create(name: string, symbols: string[] = [], isDefault = false) {
    if (!userId) return;
    const { data, error } = await supabase
      .from("watchlists")
      .insert({ user_id: userId, name, symbols, is_default: isDefault } as Database["public"]["Tables"]["watchlists"]["Insert"])
      .select()
      .single();
    if (data) setWatchlists((prev) => [...prev, data as Watchlist]);
    return { data, error };
  }

  async function addSymbol(watchlistId: string, symbol: string) {
    const wl = watchlists.find((w) => w.id === watchlistId);
    if (!wl || wl.symbols.includes(symbol)) return;
    const updated = [...wl.symbols, symbol];
    const { data, error } = await supabase
      .from("watchlists")
      .update({ symbols: updated } as Database["public"]["Tables"]["watchlists"]["Update"])
      .eq("id", watchlistId)
      .select()
      .single();
    if (data) setWatchlists((prev) => prev.map((w) => (w.id === watchlistId ? (data as Watchlist) : w)));
    return { data, error };
  }

  async function removeSymbol(watchlistId: string, symbol: string) {
    const wl = watchlists.find((w) => w.id === watchlistId);
    if (!wl) return;
    const updated = wl.symbols.filter((s) => s !== symbol);
    const { data, error } = await supabase
      .from("watchlists")
      .update({ symbols: updated } as Database["public"]["Tables"]["watchlists"]["Update"])
      .eq("id", watchlistId)
      .select()
      .single();
    if (data) setWatchlists((prev) => prev.map((w) => (w.id === watchlistId ? (data as Watchlist) : w)));
    return { data, error };
  }

  async function rename(watchlistId: string, name: string) {
    const { data, error } = await supabase
      .from("watchlists")
      .update({ name } as Database["public"]["Tables"]["watchlists"]["Update"])
      .eq("id", watchlistId)
      .select()
      .single();
    if (data) setWatchlists((prev) => prev.map((w) => (w.id === watchlistId ? (data as Watchlist) : w)));
    return { data, error };
  }

  async function remove(watchlistId: string) {
    const { error } = await supabase.from("watchlists").delete().eq("id", watchlistId);
    if (!error) setWatchlists((prev) => prev.filter((w) => w.id !== watchlistId));
    return { error };
  }

  const defaultList = watchlists.find((w) => w.is_default) ?? watchlists[0];

  return { watchlists, defaultList, loading, create, addSymbol, removeSymbol, rename, remove, refetch: fetch };
}
