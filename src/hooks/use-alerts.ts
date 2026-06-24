import { useEffect, useRef, useState, useCallback } from "react";
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
  category: "digit" | "even_odd" | "rise_fall" | "volatility" | "streak";
  value?: number;
}

export interface AlertConfig {
  digitBiasThreshold: number;
  evenOddBiasThreshold: number;
  streakThreshold: number;
  riseStreakThreshold: number;
  volatilityThreshold: number;
  audioEnabled: boolean;
  dedupeWindowMs: number;
}

export const DEFAULT_ALERT_CONFIG: AlertConfig = {
  digitBiasThreshold: 20,
  evenOddBiasThreshold: 15,
  streakThreshold: 8,
  riseStreakThreshold: 8,
  volatilityThreshold: 2.5,
  audioEnabled: true,
  dedupeWindowMs: 30_000, // 30s dedupe window
};

// ── Audio engine ──────────────────────────────────────────────────────────────
let _audioCtx: AudioContext | null = null;
function getAudioCtx(): AudioContext {
  if (!_audioCtx) _audioCtx = new AudioContext();
  if (_audioCtx.state === "suspended") _audioCtx.resume();
  return _audioCtx;
}

function playTone(
  freq: number,
  type: OscillatorType,
  duration: number,
  gain: number,
  delay = 0
) {
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.connect(g);
    g.connect(ctx.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);
    g.gain.setValueAtTime(0, ctx.currentTime + delay);
    g.gain.linearRampToValueAtTime(gain, ctx.currentTime + delay + 0.01);
    g.gain.linearRampToValueAtTime(0, ctx.currentTime + delay + duration);
    osc.start(ctx.currentTime + delay);
    osc.stop(ctx.currentTime + delay + duration + 0.05);
  } catch {}
}

export function playAlarmSound(level: AlertLevel) {
  if (level === "critical") {
    // Triple urgent beep — descending alarm
    playTone(880, "square", 0.12, 0.18, 0);
    playTone(660, "square", 0.12, 0.18, 0.15);
    playTone(440, "square", 0.20, 0.22, 0.30);
  } else if (level === "warning") {
    // Double mid-tone ping
    playTone(660, "triangle", 0.14, 0.14, 0);
    playTone(550, "triangle", 0.14, 0.12, 0.20);
  } else {
    // Single soft chime
    playTone(528, "sine", 0.18, 0.10, 0);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function currentStreak(arr: number[], pred: (v: number) => boolean): number {
  let count = 0;
  for (let i = arr.length - 1; i >= 0; i--) {
    if (pred(arr[i])) count++;
    else break;
  }
  return count;
}

function uid() { return Math.random().toString(36).slice(2, 10); }

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useAlerts(
  ticks: Tick[],
  symbol: string,
  windowSize: number,
  config: Partial<AlertConfig> = {}
) {
  const cfg = { ...DEFAULT_ALERT_CONFIG, ...config };
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const prevTickCount = useRef(0);
  // dedupe: Map<category_key, last_fired_ms>
  const dedupeMap = useRef<Map<string, number>>(new Map());

  function canFire(key: string): boolean {
    const last = dedupeMap.current.get(key) ?? 0;
    if (Date.now() - last < cfg.dedupeWindowMs) return false;
    dedupeMap.current.set(key, Date.now());
    return true;
  }

  function push(alert: Omit<Alert, "id" | "timestamp" | "symbol">) {
    if (!canFire(`${alert.category}_${alert.title}`)) return;
    const newAlert: Alert = { ...alert, id: uid(), timestamp: Date.now(), symbol };
    setAlerts((prev) => [newAlert, ...prev.slice(0, 49)]);
    if (cfg.audioEnabled) playAlarmSound(alert.level);
  }

  useEffect(() => {
    if (ticks.length === prevTickCount.current) return;
    prevTickCount.current = ticks.length;

    const slice = ticks.slice(-windowSize);
    if (slice.length < 20) return;

    const digits = slice.map((t) => lastDigit(t.quote, t.pip_size));
    const total = digits.length;

    // ── Digit frequency bias ───────────────────────────────────────────────
    const freq = Array(10).fill(0) as number[];
    digits.forEach((d) => freq[d]++);
    for (let d = 0; d <= 9; d++) {
      const pct = (freq[d] / total) * 100;
      const deviation = pct - 10;
      if (deviation >= cfg.digitBiasThreshold) {
        push({
          level: deviation >= cfg.digitBiasThreshold * 1.5 ? "critical" : "warning",
          category: "digit",
          title: `Digit ${d} Hot Bias`,
          message: `Digit ${d} appearing ${pct.toFixed(1)}% (${deviation.toFixed(1)}% above expected) in last ${total} ticks. Consider MATCHES contracts on digit ${d}.`,
          value: pct,
        });
      }
    }
    // Cold digit
    const minFreq = Math.min(...freq);
    const coldD = freq.indexOf(minFreq);
    const coldPct = (minFreq / total) * 100;
    if (10 - coldPct >= cfg.digitBiasThreshold) {
      push({
        level: "info",
        category: "digit",
        title: `Digit ${coldD} Cold`,
        message: `Digit ${coldD} only ${coldPct.toFixed(1)}% — significantly below expected 10%. DIFFERS contracts may be favourable.`,
        value: coldPct,
      });
    }

    // ── Even/Odd bias ─────────────────────────────────────────────────────
    const evens = digits.filter((d) => d % 2 === 0).length;
    const evenPct = (evens / total) * 100;
    const oddPct = 100 - evenPct;
    if (evenPct >= 50 + cfg.evenOddBiasThreshold) {
      push({
        level: evenPct >= 70 ? "critical" : "warning",
        category: "even_odd",
        title: "Even Bias Detected",
        message: `Even digits at ${evenPct.toFixed(1)}% over last ${total} ticks. Market is skewing EVEN — consider EVEN contracts.`,
        value: evenPct,
      });
    } else if (oddPct >= 50 + cfg.evenOddBiasThreshold) {
      push({
        level: oddPct >= 70 ? "critical" : "warning",
        category: "even_odd",
        title: "Odd Bias Detected",
        message: `Odd digits at ${oddPct.toFixed(1)}% over last ${total} ticks. Market is skewing ODD — consider ODD contracts.`,
        value: oddPct,
      });
    }

    // ── Even/Odd streak ───────────────────────────────────────────────────
    const evenStreak = currentStreak(digits, (d) => d % 2 === 0);
    const oddStreak = currentStreak(digits, (d) => d % 2 !== 0);
    if (evenStreak >= cfg.streakThreshold) {
      push({
        level: evenStreak >= cfg.streakThreshold + 3 ? "critical" : "warning",
        category: "streak",
        title: `Even Streak ×${evenStreak}`,
        message: `${evenStreak} consecutive EVEN digits. Reversal probability increasing — watch for ODD entry.`,
        value: evenStreak,
      });
    } else if (oddStreak >= cfg.streakThreshold) {
      push({
        level: oddStreak >= cfg.streakThreshold + 3 ? "critical" : "warning",
        category: "streak",
        title: `Odd Streak ×${oddStreak}`,
        message: `${oddStreak} consecutive ODD digits. Reversal probability increasing — watch for EVEN entry.`,
        value: oddStreak,
      });
    }

    // ── Rise/Fall streak ──────────────────────────────────────────────────
    const quotes = slice.map((t) => t.quote);
    const directions = quotes.slice(1).map((q, i) => q - quotes[i]);
    const riseStreak = currentStreak(directions, (d) => d > 0);
    const fallStreak = currentStreak(directions, (d) => d < 0);
    if (riseStreak >= cfg.riseStreakThreshold) {
      push({
        level: riseStreak >= cfg.riseStreakThreshold + 3 ? "critical" : "warning",
        category: "rise_fall",
        title: `Rise Streak ×${riseStreak}`,
        message: `${riseStreak} consecutive RISES detected. Momentum exhaustion likely — FALL contract entry zone.`,
        value: riseStreak,
      });
    } else if (fallStreak >= cfg.riseStreakThreshold) {
      push({
        level: fallStreak >= cfg.riseStreakThreshold + 3 ? "critical" : "warning",
        category: "rise_fall",
        title: `Fall Streak ×${fallStreak}`,
        message: `${fallStreak} consecutive FALLS detected. Momentum exhaustion likely — RISE contract entry zone.`,
        value: fallStreak,
      });
    }

    // ── Volatility spike ──────────────────────────────────────────────────
    const diffs = quotes.slice(1).map((q, i) => Math.abs(q - quotes[i]));
    const avgMove = diffs.reduce((a, b) => a + b, 0) / (diffs.length || 1);
    const pip = slice[0]?.pip_size ?? 2;
    const avgPips = avgMove * Math.pow(10, pip);
    if (avgPips >= cfg.volatilityThreshold) {
      push({
        level: avgPips >= cfg.volatilityThreshold * 2 ? "critical" : "info",
        category: "volatility",
        title: "High Volatility Spike",
        message: `Avg tick move ${avgPips.toFixed(2)} pips over last ${total} ticks — ${avgPips >= cfg.volatilityThreshold * 2 ? "extreme" : "elevated"} volatility regime. Adjust stake sizing.`,
        value: avgPips,
      });
    }
  }, [ticks.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const dismiss = useCallback((id: string) => setAlerts((prev) => prev.filter((a) => a.id !== id)), []);
  const clearAll = useCallback(() => setAlerts([]), []);
  const testAlarm = useCallback((level: AlertLevel) => playAlarmSound(level), []);

  return { alerts, dismiss, clearAll, testAlarm };
}
