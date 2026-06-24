import { useEffect, useRef, useState } from "react";
import type { Tick } from "./use-deriv-ticks";
import { lastDigit } from "./use-deriv-ticks";

export type AlertLevel = "info" | "warning" | "critical";

export interface Alert {
  id: string;
  level: AlertLevel;
  title: string;
  message: string;
  symbol: string;
  timestamp: number;
}

interface AlertConfig {
  digitBiasThreshold: number;   // e.g. 20 → fire if any digit appears >20% more than expected 10%
  evenOddBiasThreshold: number; // e.g. 15 → fire if even/odd skews >65%
  streakThreshold: number;      // e.g. 8 → fire if same even/odd repeats 8+ times
  riseStreakThreshold: number;  // e.g. 8 → fire if rise/fall streak hits this
  volatilityThreshold: number;  // e.g. 2.5 → fire if avg tick move exceeds this
}

const DEFAULT_CONFIG: AlertConfig = {
  digitBiasThreshold: 20,
  evenOddBiasThreshold: 15,
  streakThreshold: 8,
  riseStreakThreshold: 8,
  volatilityThreshold: 2.5,
};

function currentStreak(arr: number[], predicate: (v: number) => boolean): number {
  let count = 0;
  for (let i = arr.length - 1; i >= 0; i--) {
    if (predicate(arr[i])) count++;
    else break;
  }
  return count;
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export function useAlerts(
  ticks: Tick[],
  symbol: string,
  windowSize: number,
  config: Partial<AlertConfig> = {}
) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const prevTickCount = useRef(0);

  function push(alert: Omit<Alert, "id" | "timestamp" | "symbol">) {
    setAlerts((prev) => [
      { ...alert, id: uid(), timestamp: Date.now(), symbol },
      ...prev.slice(0, 49), // keep last 50
    ]);
  }

  useEffect(() => {
    // Only evaluate when we get new ticks
    if (ticks.length === prevTickCount.current) return;
    prevTickCount.current = ticks.length;

    const slice = ticks.slice(-windowSize);
    if (slice.length < 20) return;

    const digits = slice.map((t) => lastDigit(t.quote, t.pip_size));
    const total = digits.length;

    // ── Digit frequency bias ─────────────────────────────────────────────
    const freq = Array(10).fill(0) as number[];
    digits.forEach((d) => freq[d]++);
    const expected = total / 10;
    for (let d = 0; d <= 9; d++) {
      const pct = (freq[d] / total) * 100;
      const deviation = pct - 10; // expected 10%
      if (deviation >= cfg.digitBiasThreshold) {
        push({
          level: deviation >= cfg.digitBiasThreshold * 1.5 ? "critical" : "warning",
          title: `Digit ${d} Hot Bias`,
          message: `Digit ${d} appearing ${pct.toFixed(1)}% (${deviation.toFixed(1)}% above expected) in last ${total} ticks.`,
        });
      }
    }

    // ── Even/Odd bias ────────────────────────────────────────────────────
    const evens = digits.filter((d) => d % 2 === 0).length;
    const evenPct = (evens / total) * 100;
    const oddPct = 100 - evenPct;
    if (evenPct >= 50 + cfg.evenOddBiasThreshold) {
      push({
        level: evenPct >= 70 ? "critical" : "warning",
        title: "Even Bias Detected",
        message: `Even digits at ${evenPct.toFixed(1)}% over last ${total} ticks. Consider EVEN contracts.`,
      });
    } else if (oddPct >= 50 + cfg.evenOddBiasThreshold) {
      push({
        level: oddPct >= 70 ? "critical" : "warning",
        title: "Odd Bias Detected",
        message: `Odd digits at ${oddPct.toFixed(1)}% over last ${total} ticks. Consider ODD contracts.`,
      });
    }

    // ── Even/Odd streak ──────────────────────────────────────────────────
    const evenStreak = currentStreak(digits, (d) => d % 2 === 0);
    const oddStreak = currentStreak(digits, (d) => d % 2 !== 0);
    if (evenStreak >= cfg.streakThreshold) {
      push({
        level: evenStreak >= cfg.streakThreshold + 3 ? "critical" : "warning",
        title: `Even Streak ×${evenStreak}`,
        message: `${evenStreak} consecutive EVEN digits. Potential reversal setup.`,
      });
    } else if (oddStreak >= cfg.streakThreshold) {
      push({
        level: oddStreak >= cfg.streakThreshold + 3 ? "critical" : "warning",
        title: `Odd Streak ×${oddStreak}`,
        message: `${oddStreak} consecutive ODD digits. Potential reversal setup.`,
      });
    }

    // ── Rise/Fall streak ─────────────────────────────────────────────────
    const quotes = slice.map((t) => t.quote);
    const directions = quotes.slice(1).map((q, i) => q - quotes[i]);
    const riseStreak = currentStreak(directions, (d) => d > 0);
    const fallStreak = currentStreak(directions, (d) => d < 0);
    if (riseStreak >= cfg.riseStreakThreshold) {
      push({
        level: riseStreak >= cfg.riseStreakThreshold + 3 ? "critical" : "warning",
        title: `Rise Streak ×${riseStreak}`,
        message: `${riseStreak} consecutive RISES detected. Watch for FALL entry.`,
      });
    } else if (fallStreak >= cfg.riseStreakThreshold) {
      push({
        level: fallStreak >= cfg.riseStreakThreshold + 3 ? "critical" : "warning",
        title: `Fall Streak ×${fallStreak}`,
        message: `${fallStreak} consecutive FALLS detected. Watch for RISE entry.`,
      });
    }

    // ── Volatility spike ─────────────────────────────────────────────────
    const diffs = quotes.slice(1).map((q, i) => Math.abs(q - quotes[i]));
    const avgMove = diffs.reduce((a, b) => a + b, 0) / (diffs.length || 1);
    const pip = slice[0]?.pip_size ?? 2;
    const avgPips = avgMove * Math.pow(10, pip);
    if (avgPips >= cfg.volatilityThreshold) {
      push({
        level: avgPips >= cfg.volatilityThreshold * 2 ? "critical" : "info",
        title: "High Volatility",
        message: `Avg tick move ${avgPips.toFixed(2)} pips over last ${total} ticks — elevated volatility.`,
      });
    }
  }, [ticks.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const dismiss = (id: string) => setAlerts((prev) => prev.filter((a) => a.id !== id));
  const clearAll = () => setAlerts([]);

  return { alerts, dismiss, clearAll };
}
