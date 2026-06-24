import { useCallback, useState } from "react";
import type { Tick } from "./use-deriv-ticks";
import { lastDigit } from "./use-deriv-ticks";

export interface MarketRegime {
  type: "TRENDING" | "RANGING" | "VOLATILE" | "QUIET";
  strength: "WEAK" | "MODERATE" | "STRONG";
}

export interface ContractCall {
  type: string;
  direction: "BUY" | "SELL" | "NEUTRAL";
  confidence: number; // 0-100
  rationale: string;
  duration: string;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
}

export interface MarketAnalysis {
  regime: MarketRegime;
  sessionBias: string;
  priceAction: string;
  digitPatterns: string;
  evenOddRead: string;
  volatilityRead: string;
  topSetup: string;
  contracts: ContractCall[];
  stakeAdvice: string;
  keyLevels: string;
  tradersNote: string;
  warnings: string[];
  overallBias: "BULLISH" | "BEARISH" | "NEUTRAL";
  confidence: "LOW" | "MEDIUM" | "HIGH";
  analyzedAt: number;
}

function currentStreak(arr: number[], pred: (v: number) => boolean): number {
  let n = 0;
  for (let i = arr.length - 1; i >= 0; i--) {
    if (pred(arr[i])) n++;
    else break;
  }
  return n;
}

function stdDev(arr: number[]): number {
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  return Math.sqrt(arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length);
}

function buildDeepSnapshot(ticks: Tick[], symbol: string, windowSize: number) {
  const slice = ticks.slice(-windowSize);
  const recent50 = ticks.slice(-50);
  const digits = slice.map((t) => lastDigit(t.quote, t.pip_size));
  const total = digits.length || 1;
  const pip = slice[0]?.pip_size ?? 2;
  const pipMultiplier = Math.pow(10, pip);

  // Digit frequency
  const freq: Record<number, number> = {};
  for (let i = 0; i <= 9; i++) freq[i] = 0;
  digits.forEach((d) => freq[d]++);
  const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
  const hotDigit = Number(sorted[0][0]);
  const coldDigit = Number(sorted[sorted.length - 1][0]);
  const hotPct = ((freq[hotDigit] / total) * 100).toFixed(1);
  const coldPct = ((freq[coldDigit] / total) * 100).toFixed(1);

  // Even/Odd
  const evens = digits.filter((d) => d % 2 === 0).length;
  const evenPct = (evens / total) * 100;
  const evenStreak = currentStreak(digits, (d) => d % 2 === 0);
  const oddStreak = currentStreak(digits, (d) => d % 2 !== 0);

  // Last 20 digit entropy (uniformity score)
  const last20 = digits.slice(-20);
  const l20freq: Record<number, number> = {};
  for (let i = 0; i <= 9; i++) l20freq[i] = 0;
  last20.forEach((d) => l20freq[d]++);
  const maxInLast20 = Math.max(...Object.values(l20freq));
  const dominancePct = ((maxInLast20 / 20) * 100).toFixed(0);

  // Price action
  const quotes = slice.map((t) => t.quote);
  const directions = quotes.slice(1).map((q, i) => q - quotes[i]);
  const rises = directions.filter((d) => d > 0).length;
  const risePct = (rises / (directions.length || 1)) * 100;
  const riseStreak = currentStreak(directions, (d) => d > 0);
  const fallStreak = currentStreak(directions, (d) => d < 0);

  // Volatility
  const diffs = directions.map(Math.abs);
  const avgMove = diffs.reduce((a, b) => a + b, 0) / (diffs.length || 1);
  const avgPips = avgMove * pipMultiplier;
  const sdPips = stdDev(diffs) * pipMultiplier;

  // Recent 50 vs full window volatility comparison
  const recent50quotes = recent50.map((t) => t.quote);
  const recent50diffs = recent50quotes.slice(1).map((q, i) => Math.abs(q - recent50quotes[i]));
  const recent50AvgPips = (recent50diffs.reduce((a, b) => a + b, 0) / (recent50diffs.length || 1)) * pipMultiplier;

  // Price range
  const high = Math.max(...quotes);
  const low = Math.min(...quotes);
  const rangePips = (high - low) * pipMultiplier;
  const lastPrice = quotes[quotes.length - 1] ?? 0;

  // Session change
  const firstPrice = quotes[0] ?? lastPrice;
  const sessionDelta = ((lastPrice - firstPrice) * pipMultiplier).toFixed(pip);
  const sessionPct = (((lastPrice - firstPrice) / (firstPrice || 1)) * 100).toFixed(3);

  // Digit bias table
  const digitTable = Object.entries(freq)
    .map(([d, c]) => `${d}:${((c / total) * 100).toFixed(1)}%`)
    .join(" | ");

  // Over/Under analysis
  const over5 = digits.filter((d) => d > 5).length;
  const under4 = digits.filter((d) => d < 5).length;
  const eq5 = digits.filter((d) => d === 5).length;
  const over5Pct = ((over5 / total) * 100).toFixed(1);
  const under5Pct = ((under4 / total) * 100).toFixed(1);

  return {
    symbol, windowSize, total, pip,
    hotDigit, coldDigit, hotPct, coldPct,
    evenPct: evenPct.toFixed(1), oddPct: (100 - evenPct).toFixed(1),
    evenStreak, oddStreak, dominancePct,
    risePct: risePct.toFixed(1), fallPct: (100 - risePct).toFixed(1),
    riseStreak, fallStreak,
    avgPips: avgPips.toFixed(3), sdPips: sdPips.toFixed(3),
    recent50AvgPips: recent50AvgPips.toFixed(3),
    rangePips: rangePips.toFixed(2),
    lastPrice, high: high.toFixed(pip), low: low.toFixed(pip),
    sessionDelta, sessionPct,
    digitTable, over5Pct, under5Pct,
    eq5Count: eq5,
  };
}

function buildSeniorTraderPrompt(snap: ReturnType<typeof buildDeepSnapshot>): string {
  return `You are a senior Deriv synthetic indices trader with 10 years of experience specializing in digit and tick-based contracts. You have deep expertise in statistical pattern recognition, volatility regime detection, and risk-adjusted position sizing on Deriv's synthetic markets.

Analyze the following live market snapshot with the rigor of a professional trading desk. Give me your honest, unfiltered read — including when NOT to trade.

═══ LIVE MARKET DATA ═══
Symbol: ${snap.symbol}
Sample: ${snap.total} ticks | Window: ${snap.windowSize}
Last Price: ${snap.lastPrice} | High: ${snap.high} | Low: ${snap.low}
Range: ${snap.rangePips} pips | Session Δ: ${snap.sessionDelta} pips (${snap.sessionPct}%)

═══ DIGIT ANALYSIS ═══
Full distribution: ${snap.digitTable}
Hot digit: ${snap.hotDigit} @ ${snap.hotPct}% | Cold digit: ${snap.coldDigit} @ ${snap.coldPct}%
Over 5: ${snap.over5Pct}% | Under 5: ${snap.under5Pct}% | Equal 5: ${snap.eq5Count} hits
Last 20 ticks — dominant digit appeared ${snap.dominancePct}% of the time

═══ EVEN / ODD ═══
Even: ${snap.evenPct}% | Odd: ${snap.oddPct}%
Current Even streak: ${snap.evenStreak} | Odd streak: ${snap.oddStreak}

═══ PRICE ACTION ═══
Rise: ${snap.risePct}% | Fall: ${snap.fallPct}%
Current Rise streak: ${snap.riseStreak} | Fall streak: ${snap.fallStreak}

═══ VOLATILITY ═══
Avg tick move: ${snap.avgPips} pips | Std Dev: ${snap.sdPips} pips
Last 50 ticks avg: ${snap.recent50AvgPips} pips
${Number(snap.recent50AvgPips) > Number(snap.avgPips) * 1.3 ? "⚡ VOLATILITY EXPANDING — recent ticks hotter than window avg" : Number(snap.recent50AvgPips) < Number(snap.avgPips) * 0.7 ? "🔇 VOLATILITY COMPRESSING — market cooling relative to window avg" : "Volatility stable within normal range"}

═══ YOUR ANALYSIS TASK ═══
Return ONLY a valid JSON object — no markdown, no explanation outside JSON. Use this exact schema:

{
  "regime": {
    "type": "TRENDING" | "RANGING" | "VOLATILE" | "QUIET",
    "strength": "WEAK" | "MODERATE" | "STRONG"
  },
  "sessionBias": "One sentence on the overall session direction and momentum",
  "priceAction": "2 sentences on rise/fall dynamics, streaks, and what they imply",
  "digitPatterns": "2 sentences on digit frequency anomalies and their statistical significance",
  "evenOddRead": "One sentence on even/odd bias and streak implications",
  "volatilityRead": "One sentence on current volatility regime and trend",
  "topSetup": "The single highest-conviction setup right now in plain trader language",
  "contracts": [
    {
      "type": "e.g. EVEN | ODD | RISE | FALL | MATCHES 7 | DIFFERS 3 | OVER 5 | UNDER 5 | HIGHER | LOWER",
      "direction": "BUY" | "SELL" | "NEUTRAL",
      "confidence": 0-100,
      "rationale": "Why this contract, referencing specific data points",
      "duration": "e.g. 5 ticks | 10 ticks | 1 min",
      "riskLevel": "LOW" | "MEDIUM" | "HIGH"
    }
  ],
  "stakeAdvice": "Specific stake sizing guidance based on volatility and confidence (e.g. '1-2% of bankroll given elevated volatility')",
  "keyLevels": "Price levels, digit thresholds, or streak lengths to watch",
  "tradersNote": "Your personal senior trader commentary — include what you'd be watching, what makes you cautious, and what would change your view",
  "warnings": ["Array of specific risk warnings — empty array if none"],
  "overallBias": "BULLISH" | "BEARISH" | "NEUTRAL",
  "confidence": "LOW" | "MEDIUM" | "HIGH"
}

Provide 2-4 contract calls ranked by conviction. Be specific — reference actual data points. Flag clearly if sample size is insufficient or patterns are too weak to trade.`;
}

export function useMarketAnalyzer() {
  const [analysis, setAnalysis] = useState<MarketAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSnapshot, setLastSnapshot] = useState<ReturnType<typeof buildDeepSnapshot> | null>(null);

  const analyze = useCallback(async (ticks: Tick[], symbol: string, windowSize: number) => {
    if (ticks.length < 30) {
      setError("Need at least 30 ticks for a meaningful analysis.");
      return;
    }

    const apiKey = import.meta.env.VITE_GROQ_API_KEY as string | undefined;
    if (!apiKey) {
      setError("VITE_GROQ_API_KEY not set — add it to your environment variables.");
      return;
    }

    setLoading(true);
    setError(null);

    const snap = buildDeepSnapshot(ticks, symbol, windowSize);
    setLastSnapshot(snap);
    const prompt = buildSeniorTraderPrompt(snap);

    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          temperature: 0.2,
          max_tokens: 1024,
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
      const parsed = JSON.parse(clean) as Omit<MarketAnalysis, "analyzedAt">;
      setAnalysis({ ...parsed, analyzedAt: Date.now() });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed — check API key and try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  return { analysis, loading, error, lastSnapshot, analyze };
}
