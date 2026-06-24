import { useState } from "react";
import { useTradeJournal } from "@/hooks/use-trade-journal";
import type { Database } from "@/lib/database.types";

type TradeInsert = Database["public"]["Tables"]["trade_journal"]["Insert"];

const CONTRACT_TYPES = [
  "DIGITOVER",
  "DIGITUNDER",
  "DIGITMATCH",
  "DIGITDIFF",
  "DIGITEVEN",
  "DIGITODD",
  "RISE",
  "FALL",
];

interface TradeJournalPanelProps {
  userId: string;
  currentSymbol: string;
}

export function TradeJournalPanel({ userId, currentSymbol }: TradeJournalPanelProps) {
  const { trades, stats, loading, logTrade, updateTrade, deleteTrade } = useTradeJournal(userId);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Partial<TradeInsert>>({
    symbol: currentSymbol,
    contract_type: "DIGITOVER",
    stake: 1,
    outcome: "pending",
  });
  const [saving, setSaving] = useState(false);

  async function handleLog(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await logTrade({
      symbol: form.symbol ?? currentSymbol,
      contract_type: form.contract_type ?? "DIGITOVER",
      stake: Number(form.stake ?? 1),
      payout: form.payout ? Number(form.payout) : null,
      outcome: form.outcome ?? "pending",
      entry_digit: form.entry_digit ?? null,
      barrier: form.barrier ?? null,
      duration_ticks: form.duration_ticks ?? null,
      notes: form.notes ?? null,
    });
    setSaving(false);
    setShowForm(false);
    setForm({ symbol: currentSymbol, contract_type: "DIGITOVER", stake: 1, outcome: "pending" });
  }

  return (
    <div className="rounded-lg border border-border bg-card p-3 flex flex-col gap-3">
      {/* Header + stats */}
      <div className="flex items-center justify-between">
        <h2 className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Trade Journal</h2>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="text-[10px] uppercase tracking-widest px-2 py-1 rounded border border-border text-muted-foreground hover:text-foreground hover:border-primary transition-colors"
        >
          {showForm ? "Cancel" : "+ Log Trade"}
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-2">
        <StatCard label="Win Rate" value={`${stats.winRate.toFixed(1)}%`} tone={stats.winRate >= 50 ? "bull" : "bear"} />
        <StatCard label="Trades" value={String(stats.total)} />
        <StatCard label="Net P&L" value={`$${stats.netPnl.toFixed(2)}`} tone={stats.netPnl >= 0 ? "bull" : "bear"} />
        <StatCard label="Staked" value={`$${stats.totalStaked.toFixed(2)}`} />
      </div>

      {/* Log form */}
      {showForm && (
        <form onSubmit={handleLog} className="grid grid-cols-2 gap-2 border-t border-border pt-3">
          <FormField label="Symbol">
            <input
              value={form.symbol ?? ""}
              onChange={(e) => setForm({ ...form, symbol: e.target.value })}
              className={inputCls}
            />
          </FormField>
          <FormField label="Contract">
            <select
              value={form.contract_type ?? ""}
              onChange={(e) => setForm({ ...form, contract_type: e.target.value })}
              className={inputCls}
            >
              {CONTRACT_TYPES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </FormField>
          <FormField label="Stake ($)">
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={form.stake ?? ""}
              onChange={(e) => setForm({ ...form, stake: Number(e.target.value) })}
              className={inputCls}
              required
            />
          </FormField>
          <FormField label="Payout ($)">
            <input
              type="number"
              step="0.01"
              value={form.payout ?? ""}
              onChange={(e) => setForm({ ...form, payout: Number(e.target.value) || undefined })}
              className={inputCls}
            />
          </FormField>
          <FormField label="Outcome">
            <select
              value={form.outcome ?? "pending"}
              onChange={(e) => setForm({ ...form, outcome: e.target.value as "win" | "loss" | "pending" })}
              className={inputCls}
            >
              <option value="pending">Pending</option>
              <option value="win">Win</option>
              <option value="loss">Loss</option>
            </select>
          </FormField>
          <FormField label="Entry Digit">
            <input
              type="number"
              min="0"
              max="9"
              value={form.entry_digit ?? ""}
              onChange={(e) => setForm({ ...form, entry_digit: Number(e.target.value) })}
              className={inputCls}
            />
          </FormField>
          <div className="col-span-2">
            <FormField label="Notes">
              <input
                value={form.notes ?? ""}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Optional notes…"
                className={inputCls}
              />
            </FormField>
          </div>
          <div className="col-span-2">
            <button
              type="submit"
              disabled={saving}
              className="w-full py-1.5 rounded bg-primary text-primary-foreground text-[11px] uppercase tracking-widest hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save Trade"}
            </button>
          </div>
        </form>
      )}

      {/* Trade list */}
      {loading ? (
        <div className="text-xs text-muted-foreground">Loading…</div>
      ) : trades.length === 0 ? (
        <div className="text-xs text-muted-foreground">No trades logged yet.</div>
      ) : (
        <div className="overflow-hidden border-t border-border pt-2">
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 px-1 py-1 text-[9px] uppercase tracking-widest text-muted-foreground border-b border-border">
            <span>Symbol · Type</span>
            <span className="text-right">Stake</span>
            <span className="text-right">Payout</span>
            <span className="text-right">P&L</span>
            <span className="text-right">Result</span>
          </div>
          <div className="max-h-[280px] overflow-y-auto space-y-0.5 mt-1">
            {trades.slice(0, 50).map((t) => {
              const pnl = (t.payout ?? 0) - t.stake;
              return (
                <div
                  key={t.id}
                  className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 px-1 py-1.5 rounded hover:bg-secondary/40 text-[11px] tabular-nums group"
                >
                  <div className="min-w-0">
                    <span className="font-medium truncate block">{t.symbol}</span>
                    <span className="text-[9px] text-muted-foreground">{t.contract_type}</span>
                  </div>
                  <span className="text-right">${Number(t.stake).toFixed(2)}</span>
                  <span className="text-right">{t.payout ? `$${Number(t.payout).toFixed(2)}` : "—"}</span>
                  <span className={`text-right ${pnl > 0 ? "text-bull" : pnl < 0 ? "text-bear" : ""}`}>
                    {t.outcome === "pending" ? "—" : `${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)}`}
                  </span>
                  <span className={`text-right font-semibold text-[10px] ${
                    t.outcome === "win" ? "text-bull" : t.outcome === "loss" ? "text-bear" : "text-muted-foreground"
                  }`}>
                    {t.outcome.toUpperCase()}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string; tone?: "bull" | "bear" }) {
  return (
    <div className="rounded border border-border bg-secondary/40 px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`text-sm font-bold tabular-nums ${tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : ""}`}>
        {value}
      </div>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[9px] uppercase tracking-widest text-muted-foreground mb-1">{label}</label>
      {children}
    </div>
  );
}

const inputCls =
  "w-full rounded border border-border bg-secondary px-2 py-1 text-xs text-foreground focus:border-primary focus:outline-none";
