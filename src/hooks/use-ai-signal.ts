import { useCallback, useState } from "react";
import type { Tick } from "./use-deriv-ticks";
import { lastDigit } from "./use-deriv-ticks";

export interface MarketSnapshot {
  symbol: string;
  tickCount: number;
  windowSize: number;
  // Digit stats
  digitFrequency: Record<number, number>;
  hotDigit: number;
  coldDigit: number;
  // Even/Odd
  evenPct: number;
  oddPct: number;
  evenOddStreak: { side: "EVEN" | "ODD"; count: number };
  // Rise/Fall
  risePct: number;
  fallPct: number;
  riseFallStreak: { side: "RISE" | "FALL"; count: number };
  // Volatility
  avgPips: number;
  lastPrice: number;
}

export interface AISignal {
  summary: string;
  sentiment: "BULLISH" | "BEARISH" | "NEUTRAL";
  topInsight: string;
  suggestedContracts: string[];
  riskNote: string;
  confidence: "LOW" | "MEDIUM" | "HIGH";
}

function currentStreak(arr: number[], pred: (v: number) => boolean): number {
  let n = 0;
  for (let i = arr.length - 1; i >= 0; i--) {
    if (pred(arr[i])) n++;
    else break;
  }
  return n;
}

function buildSnapshot(ticks: Tick[], symbol: string, windowSize: number): MarketSnapshot {
  const slice = ticks.slice(-windowSize);
  const digits = slice.map((t) => lastDigit(t.quote, t.pip_size));
  const total = digits.length || 1;

  const freq: Record<number, number> = {};
  for (let i = 0; i <= 9; i++) freq[i] = 0;
  digits.forEach((d) => freq[d]++);

  const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
  const hotDigit = Number(sorted[0][0]);
  const coldDigit = Number(sorted[sorted.length - 1][0]);

  const evens = digits.filter((d) => d % 2 === 0).length;
  const evenPct = (evens / total) * 100;
  const evenStreak = currentStreak(digits, (d) => d % 2 === 0);
  const oddStreak = currentStreak(digits, (d) => d % 2 !== 0);

  const quotes = slice.map((t) => t.quote);
  const directions = quotes.slice(1).map((q, i) => q - quotes[i]);
  const rises = directions.filter((d) => d > 0).length;
  const risePct = (rises / (directions.length || 1)) * 100;
  const riseStreak = currentStreak(directions, (d) => d > 0);
  const fallStreak = currentStreak(directions, (d) => d < 0);

  const diffs = directions.map(Math.abs);
  const avgMove = diffs.reduce((a, b) => a + b, 0) / (diffs.length || 1);
  const pip = slice[0]?.pip_size ?? 2;
  const avgPips = avgMove * Math.pow(10, pip);

  return {
    symbol,
    tickCount: slice.length,
    windowSize,
    digitFrequency: freq,
    hotDigit,
    coldDigit,
    evenPct,
    oddPct: 100 - evenPct,
    evenOddStreak: evenStreak >= oddStreak
      ? { side: "EVEN", count: evenStreak }
      : { side: "ODD", count: oddStreak },
    risePct,
    fallPct: 100 - risePct,
    riseFallStreak: riseStreak >= fallStreak
      ? { side: "RISE", count: riseStreak }
      : { side: "FALL", count: fallStreak },
    avgPips,
    lastPrice: quotes[quotes.length - 1] ?? 0,
  };
}

function buildPrompt(snap: MarketSnapshot): string {
  const digFreqStr = Object.entries(snap.digitFrequency)
    .map(([d, c]) => `${d}:${((c / snap.tickCount) * 100).toFixed(1)}%`)
    .join(", ");

  return `You are a quantitative trading signal analyst for Deriv synthetic indices.

Analyze the following live market snapshot and return a JSON signal object.

## Market Snapshot
- Symbol: ${snap.symbol}
- Sample size: ${snap.tickCount} ticks (window: ${snap.windowSize})
- Last price: ${snap.lastPrice}

## Digit Statistics
- Frequency distribution: ${digFreqStr}
- Hottest digit: ${snap.hotDigit} | Coldest digit: ${snap.coldDigit}
- Even: ${snap.evenPct.toFixed(1)}% | Odd: ${snap.oddPct.toFixed(1)}%
- Current ${snap.evenOddStreak.side} streak: ${snap.evenOddStreak.count}

## Price Action
- Rise: ${snap.risePct.toFixed(1)}% | Fall: ${snap.fallPct.toFixed(1)}%
- Current ${snap.riseFallStreak.side} streak: ${snap.riseFallStreak.count}
- Average tick move: ${snap.avgPips.toFixed(3)} pips

## Your Task
Return ONLY a valid JSON object (no markdown, no preamble) with this exact shape:
{
  "summary": "2-3 sentence market read",
  "sentiment": "BULLISH" | "BEARISH" | "NEUTRAL",
  "topInsight": "single most actionable pattern observation",
  "suggestedContracts": ["contract type 1", "contract type 2"],
  "riskNote": "one-sentence risk caveat",
  "confidence": "LOW" | "MEDIUM" | "HIGH"
}

Base contract suggestions on Deriv contract types: Rise/Fall, Higher/Lower, Even/Odd, Over/Under, Matches/Differs, Touch/No Touch.`;
}

export function useAISignal() {
  const [signal, setSignal] = useState<AISignal | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<MarketSnapshot | null>(null);

  const analyze = useCallback(async (ticks: Tick[], symbol: string, windowSize: number) => {
    if (ticks.length < 20) {
      setError("Not enough ticks — need at least 20.");
      return;
    }

    const apiKey = import.meta.env.VITE_GROQ_API_KEY as string | undefined;
    if (!apiKey) {
      setError("VITE_GROQ_API_KEY not set in .env");
      return;
    }

    setLoading(true);
    setError(null);
    setSignal(null);

    const snap = buildSnapshot(ticks, symbol, windowSize);
    setSnapshot(snap);
    const prompt = buildPrompt(snap);

    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          temperature: 0.3,
          max_tokens: 512,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: { message?: string } }).error?.message ?? `HTTP ${res.status}`);
      }

      const data = await res.json() as { choices: { message: { content: string } }[] };
      const raw = data.choices[0]?.message?.content ?? "";
      const clean = raw.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean) as AISignal;
      setSignal(parsed);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  return { signal, loading, error, snapshot, analyze };
}
