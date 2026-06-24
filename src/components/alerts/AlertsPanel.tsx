import type { Alert, AlertLevel } from "@/hooks/use-alerts";

const LEVEL_STYLES: Record<AlertLevel, { border: string; badge: string; dot: string }> = {
  info:     { border: "border-blue-500/30",   badge: "bg-blue-500/10 text-blue-400",    dot: "bg-blue-400" },
  warning:  { border: "border-yellow-500/30", badge: "bg-yellow-500/10 text-yellow-400", dot: "bg-yellow-400" },
  critical: { border: "border-red-500/40",    badge: "bg-red-500/15 text-red-400",       dot: "bg-red-400 animate-pulse" },
};

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

interface AlertsProps {
  alerts: Alert[];
  onDismiss: (id: string) => void;
  onClearAll: () => void;
}

export function AlertsPanel({ alerts, onDismiss, onClearAll }: AlertsProps) {
  const criticalCount = alerts.filter((a) => a.level === "critical").length;
  const warningCount  = alerts.filter((a) => a.level === "warning").length;

  return (
    <div className="flex flex-col gap-2 h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono">
            Pattern Alerts
          </span>
          {alerts.length > 0 && (
            <div className="flex gap-1">
              {criticalCount > 0 && (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 font-mono">
                  {criticalCount} CRIT
                </span>
              )}
              {warningCount > 0 && (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-400 font-mono">
                  {warningCount} WARN
                </span>
              )}
            </div>
          )}
        </div>
        {alerts.length > 0 && (
          <button
            onClick={onClearAll}
            className="text-[9px] uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Alert list */}
      <div className="flex flex-col gap-1.5 overflow-y-auto max-h-72 pr-1">
        {alerts.length === 0 && (
          <div className="text-center text-muted-foreground text-[11px] py-6 font-mono">
            No alerts yet — monitoring live ticks…
          </div>
        )}
        {alerts.map((alert) => {
          const s = LEVEL_STYLES[alert.level];
          return (
            <div
              key={alert.id}
              className={`relative flex gap-2.5 p-2.5 rounded border bg-card ${s.border} group`}
            >
              {/* Dot */}
              <div className="mt-1 shrink-0">
                <div className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-semibold text-foreground font-mono">
                    {alert.title}
                  </span>
                  <span className={`text-[9px] px-1 py-0.5 rounded font-mono ${s.badge}`}>
                    {alert.level.toUpperCase()}
                  </span>
                  <span className="text-[9px] text-muted-foreground font-mono ml-auto">
                    {alert.symbol} · {timeAgo(alert.timestamp)}
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed font-mono">
                  {alert.message}
                </p>
              </div>

              {/* Dismiss */}
              <button
                onClick={() => onDismiss(alert.id)}
                className="shrink-0 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity text-[11px] mt-0.5"
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
