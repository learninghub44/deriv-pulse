import { useState } from "react";
import type { Alert, AlertLevel, AlertConfig } from "@/hooks/use-alerts";
import { DEFAULT_ALERT_CONFIG, playAlarmSound } from "@/hooks/use-alerts";

const LEVEL_META: Record<AlertLevel, { border: string; badge: string; dot: string; glow: string; label: string }> = {
  info:     { border: "border-blue-500/25",   badge: "bg-blue-500/10 text-blue-300 border border-blue-500/20",    dot: "bg-blue-400",                           glow: "",                    label: "INFO" },
  warning:  { border: "border-amber-500/35",  badge: "bg-amber-500/10 text-amber-300 border border-amber-500/20", dot: "bg-amber-400",                           glow: "",                    label: "WARN" },
  critical: { border: "border-red-500/50",    badge: "bg-red-500/15 text-red-300 border border-red-500/30",       dot: "bg-red-400 animate-pulse shadow-[0_0_6px_rgba(239,68,68,0.8)]", glow: "shadow-[inset_0_0_20px_rgba(239,68,68,0.04)]", label: "CRIT" },
};

const CATEGORY_ICON: Record<Alert["category"], string> = {
  digit:      "◆",
  even_odd:   "⊕",
  rise_fall:  "↕",
  volatility: "⚡",
  streak:     "≡",
};

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}

interface AlertsPanelProps {
  alerts: Alert[];
  onDismiss: (id: string) => void;
  onClearAll: () => void;
  config?: Partial<AlertConfig>;
  onConfigChange?: (cfg: Partial<AlertConfig>) => void;
  testAlarm?: (level: AlertLevel) => void;
}

export function AlertsPanel({
  alerts,
  onDismiss,
  onClearAll,
  config = {},
  onConfigChange,
  testAlarm,
}: AlertsPanelProps) {
  const [showConfig, setShowConfig] = useState(false);
  const cfg = { ...DEFAULT_ALERT_CONFIG, ...config };

  const criticalCount = alerts.filter((a) => a.level === "critical").length;
  const warningCount  = alerts.filter((a) => a.level === "warning").length;
  const infoCount     = alerts.filter((a) => a.level === "info").length;

  return (
    <div className="flex flex-col gap-0 h-full">
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {criticalCount > 0 && (
            <span className="inline-flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded bg-red-500/15 text-red-300 border border-red-500/30 tracking-widest">
              <span className="size-1.5 rounded-full bg-red-400 animate-pulse shadow-[0_0_4px_rgba(239,68,68,0.9)]" />
              {criticalCount} CRIT
            </span>
          )}
          {warningCount > 0 && (
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 tracking-widest">
              {warningCount} WARN
            </span>
          )}
          {infoCount > 0 && (
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-300 border border-blue-500/20 tracking-widest">
              {infoCount} INFO
            </span>
          )}
          {alerts.length === 0 && (
            <span className="text-[9px] font-mono text-muted-foreground tracking-widest uppercase">Monitoring…</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {alerts.length > 0 && (
            <button
              onClick={onClearAll}
              className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground px-2 py-0.5 rounded border border-transparent hover:border-border transition-all"
            >
              Clear
            </button>
          )}
          <button
            onClick={() => setShowConfig((v) => !v)}
            className={`text-[9px] font-mono uppercase tracking-widest px-2 py-0.5 rounded border transition-all ${showConfig ? "border-primary/50 text-primary bg-primary/10" : "border-border text-muted-foreground hover:text-foreground"}`}
          >
            ⚙ Config
          </button>
        </div>
      </div>

      {/* ── Config drawer ── */}
      {showConfig && (
        <div className="mb-3 p-3 rounded border border-border bg-secondary/30 flex flex-col gap-3">
          <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground">Alert Thresholds</p>

          <div className="grid grid-cols-2 gap-2">
            <ConfigSlider
              label="Digit Bias (%)"
              value={cfg.digitBiasThreshold}
              min={10} max={40} step={5}
              onChange={(v) => onConfigChange?.({ digitBiasThreshold: v })}
            />
            <ConfigSlider
              label="Even/Odd Bias (%)"
              value={cfg.evenOddBiasThreshold}
              min={5} max={30} step={5}
              onChange={(v) => onConfigChange?.({ evenOddBiasThreshold: v })}
            />
            <ConfigSlider
              label="Streak Length"
              value={cfg.streakThreshold}
              min={4} max={15} step={1}
              onChange={(v) => onConfigChange?.({ streakThreshold: v })}
            />
            <ConfigSlider
              label="Volatility (pips)"
              value={cfg.volatilityThreshold}
              min={1} max={10} step={0.5}
              onChange={(v) => onConfigChange?.({ volatilityThreshold: v })}
            />
          </div>

          {/* Audio toggle + test */}
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <div
                onClick={() => onConfigChange?.({ audioEnabled: !cfg.audioEnabled })}
                className={`relative w-8 h-4 rounded-full border transition-colors cursor-pointer ${cfg.audioEnabled ? "bg-primary/30 border-primary/60" : "bg-secondary border-border"}`}
              >
                <div className={`absolute top-0.5 size-3 rounded-full transition-all ${cfg.audioEnabled ? "left-4 bg-primary" : "left-0.5 bg-muted-foreground"}`} />
              </div>
              <span className="text-[10px] font-mono text-muted-foreground">Audio Alarms</span>
            </label>
            {testAlarm && cfg.audioEnabled && (
              <div className="flex items-center gap-1 ml-auto">
                {(["info", "warning", "critical"] as AlertLevel[]).map((lvl) => (
                  <button
                    key={lvl}
                    onClick={() => testAlarm(lvl)}
                    className="text-[8px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded border border-border text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Test {lvl}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Alert list ── */}
      <div className="flex flex-col gap-1.5 overflow-y-auto flex-1 pr-0.5" style={{ maxHeight: showConfig ? "240px" : "380px" }}>
        {alerts.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 gap-2">
            <div className="text-2xl opacity-20">◉</div>
            <p className="text-[10px] font-mono text-muted-foreground tracking-widest uppercase">No alerts — all systems nominal</p>
            <p className="text-[9px] font-mono text-muted-foreground/60">Scanning live tick patterns…</p>
          </div>
        )}
        {alerts.map((alert) => {
          const m = LEVEL_META[alert.level];
          return (
            <div
              key={alert.id}
              className={`group relative flex gap-2.5 p-2.5 rounded border bg-card/60 ${m.border} ${m.glow} transition-all hover:bg-card/80`}
            >
              {/* Level indicator bar */}
              <div className={`absolute left-0 top-0 bottom-0 w-0.5 rounded-l ${alert.level === "critical" ? "bg-red-400" : alert.level === "warning" ? "bg-amber-400" : "bg-blue-400"}`} />

              {/* Category icon + dot */}
              <div className="shrink-0 flex flex-col items-center gap-1 mt-0.5 pl-1">
                <div className={`size-1.5 rounded-full ${m.dot}`} />
                <span className="text-[9px] text-muted-foreground/60">{CATEGORY_ICON[alert.category]}</span>
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                  <span className="text-[11px] font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                    {alert.title}
                  </span>
                  <span className={`text-[8px] px-1 py-0.5 rounded font-mono tracking-widest ${m.badge}`}>
                    {m.label}
                  </span>
                  <span className="text-[9px] text-muted-foreground font-mono ml-auto">
                    {alert.symbol} · {timeAgo(alert.timestamp)}
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground font-mono leading-relaxed">
                  {alert.message}
                </p>
              </div>

              {/* Dismiss */}
              <button
                onClick={() => onDismiss(alert.id)}
                className="shrink-0 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity text-[13px] leading-none mt-0.5 px-0.5"
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ConfigSlider({
  label, value, min, max, step, onChange,
}: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">{label}</span>
        <span className="text-[10px] font-mono text-foreground tabular-nums">{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1 appearance-none rounded-full bg-secondary cursor-pointer accent-primary"
      />
    </div>
  );
}
