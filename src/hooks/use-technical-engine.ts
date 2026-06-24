import { useMemo } from "react";
import type { Tick } from "./use-deriv-ticks";
import { lastDigit } from "./use-deriv-ticks";

/* ============================================================
 *  TECHNICAL INDICATOR ENGINE — Advanced trading signals
 * ========================================================== */

export interface RSIResult {
  value: number; // 0-100
  zone: "OVERSOLD" | "NEUTRAL" | "OVERBOUGHT";
  signal: "BUY" | "SELL" | "HOLD";
}

export interface EMAResult {
  ema8: number;
  ema21: number;
  ema55: number;
  trend: "BULLISH" | "BEARISH" | "FLAT";
  crossover: "GOLDEN" | "DEATH" | "NONE";
}

export interface BollingerBands {
  upper: number;
  middle: number;
  lower: number;
  bandwidth: number;
  percentB: number; // 0-1, current price relative to bands
  squeeze: boolean;
}

export interface MomentumResult {
  roc5: number;   // Rate of change 5 ticks
  roc20: number;  // Rate of change 20 ticks
  momentum: number;
  acceleration: number; // change in momentum
  phase: "ACCELERATING_UP" | "DECELERATING_UP" | "ACCELERATING_DOWN" | "DECELERATING_DOWN" | "FLAT";
}

export interface DigitPatternScore {
  digit: number;
  matchScore: number;   // 0-100: how much this digit is favoured for MATCHES
  differsScore: number; // 0-100: how much this digit is favoured for DIFFERS
  hotColdLabel: "HOT" | "WARM" | "NEUTRAL" | "COLD" | "ICY";
  deviation: number;    // pct from expected 10%
  consecutiveAbsence: number; // ticks since last appearance
}

export interface EntrySignal {
  id: string;
  contractType: string;
  direction: "BUY" | "SELL";
  strength: number;     // 0-100
  confidence: "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH";
  reason: string[];
  duration: string;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "EXTREME";
  entryCondition: string;
  invalidationCondition: string;
  expectedEdge: number; // statistical edge estimate %
  timestamp: number;
}

export interface MultiTimeframeAnalysis {
  short: { trend: string; bias: string; strength: number };  // last 20 ticks
  medium: { trend: string; bias: string; strength: number }; // last 100 ticks
  long: { trend: string; bias: string; strength: number };   // last 500 ticks
  alignment: "ALIGNED_BULL" | "ALIGNED_BEAR" | "MIXED" | "CONFLICTING";
  alignmentScore: number; // 0-100
}

export interface VolatilityRegime {
  atr: number;
  atrRatio: number; // current / historical avg
  regime: "ULTRA_LOW" | "LOW" | "NORMAL" | "HIGH" | "EXTREME";
  expanding: boolean;
  spikeDetected: boolean;
  optimalContractDuration: string;
}

export interface TechnicalSummary {
  rsi: RSIResult;
  ema: EMAResult;
  bb: BollingerBands;
  momentum: MomentumResult;
  digitPatterns: DigitPatternScore[];
  entrySignals: EntrySignal[];
  mtf: MultiTimeframeAnalysis;
  volatility: VolatilityRegime;
  overallScore: number;         // 0-100 composite trade score
  marketPhase: "TRENDING" | "RANGING" | "BREAKOUT" | "REVERSAL" | "CHOPPY";
  bestSetup: EntrySignal | null;
}

/* ── Calculation Utilities ────────────────────────────────────────────────── */

function calcEMA(prices: number[], period: number): number[] {
  if (prices.length === 0) return [];
  const k = 2 / (period + 1);
  const result: number[] = [prices[0]];
  for (let i = 1; i < prices.length; i++) {
    result.push(prices[i] * k + result[i - 1] * (1 - k));
  }
  return result;
}

function calcRSI(prices: number[], period = 14): number {
  if (prices.length < period + 1) return 50;
  const changes = prices.slice(1).map((p, i) => p - prices[i]);
  const relevant = changes.slice(-period);
  const gains = relevant.filter((c) => c > 0);
  const losses = relevant.filter((c) => c < 0).map(Math.abs);
  const avgGain = gains.reduce((a, b) => a + b, 0) / period;
  const avgLoss = losses.reduce((a, b) => a + b, 0) / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function calcBollingerBands(prices: number[], period = 20, stdDevMult = 2): BollingerBands {
  const slice = prices.slice(-period);
  if (slice.length < period) {
    const p = prices[prices.length - 1] ?? 0;
    return { upper: p, middle: p, lower: p, bandwidth: 0, percentB: 0.5, squeeze: false };
  }
  const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
  const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / slice.length;
  const sd = Math.sqrt(variance);
  const upper = mean + stdDevMult * sd;
  const lower = mean - stdDevMult * sd;
  const last = prices[prices.length - 1] ?? mean;
  const bandwidth = mean > 0 ? ((upper - lower) / mean) * 100 : 0;
  const percentB = upper !== lower ? (last - lower) / (upper - lower) : 0.5;
  const squeeze = bandwidth < 0.05; // tight bands = squeeze
  return { upper, middle: mean, lower, bandwidth, percentB, squeeze };
}

function calcMomentum(prices: number[]): MomentumResult {
  const last = prices[prices.length - 1] ?? 0;
  const p5 = prices[prices.length - 6] ?? last;
  const p20 = prices[prices.length - 21] ?? last;
  const p2 = prices[prices.length - 3] ?? last;
  const roc5 = p5 !== 0 ? ((last - p5) / p5) * 100 : 0;
  const roc20 = p20 !== 0 ? ((last - p20) / p20) * 100 : 0;
  const momentum = roc5;
  const prevMom = p2 !== 0 ? ((p5 - p2) / p2) * 100 : 0;
  const acceleration = momentum - prevMom;

  let phase: MomentumResult["phase"] = "FLAT";
  if (momentum > 0 && acceleration > 0) phase = "ACCELERATING_UP";
  else if (momentum > 0 && acceleration <= 0) phase = "DECELERATING_UP";
  else if (momentum < 0 && acceleration < 0) phase = "ACCELERATING_DOWN";
  else if (momentum < 0 && acceleration >= 0) phase = "DECELERATING_DOWN";

  return { roc5, roc20, momentum, acceleration, phase };
}

function calcATR(ticks: Tick[], period = 14): number {
  if (ticks.length < 2) return 0;
  const ranges = ticks.slice(1).map((t, i) => Math.abs(t.quote - ticks[i].quote));
  const slice = ranges.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / (slice.length || 1);
}

function currentStreak(arr: number[], pred: (v: number) => boolean): number {
  let n = 0;
  for (let i = arr.length - 1; i >= 0; i--) {
    if (pred(arr[i])) n++;
    else break;
  }
  return n;
}

/* ── Main Calculation Function ────────────────────────────────────────────── */

export function computeTechnicalSummary(ticks: Tick[], windowSize: number): TechnicalSummary | null {
  if (ticks.length < 30) return null;

  const slice = ticks.slice(-windowSize);
  const prices = slice.map((t) => t.quote);
  const pip = slice[0]?.pip_size ?? 2;
  const pipMult = Math.pow(10, pip);
  const digits = slice.map((t) => lastDigit(t.quote, t.pip_size));
  const lastPrice = prices[prices.length - 1] ?? 0;

  /* ── RSI ── */
  const rsiValue = calcRSI(prices, 14);
  const rsiZone: RSIResult["zone"] = rsiValue <= 30 ? "OVERSOLD" : rsiValue >= 70 ? "OVERBOUGHT" : "NEUTRAL";
  const rsiSignal: RSIResult["signal"] = rsiValue <= 30 ? "BUY" : rsiValue >= 70 ? "SELL" : "HOLD";
  const rsi: RSIResult = { value: rsiValue, zone: rsiZone, signal: rsiSignal };

  /* ── EMA ── */
  const ema8arr = calcEMA(prices, 8);
  const ema21arr = calcEMA(prices, 21);
  const ema55arr = calcEMA(prices, 55);
  const ema8 = ema8arr[ema8arr.length - 1] ?? lastPrice;
  const ema21 = ema21arr[ema21arr.length - 1] ?? lastPrice;
  const ema55 = ema55arr[ema55arr.length - 1] ?? lastPrice;
  const prevEma8 = ema8arr[ema8arr.length - 2] ?? ema8;
  const prevEma21 = ema21arr[ema21arr.length - 2] ?? ema21;

  let emaTrend: EMAResult["trend"] = "FLAT";
  if (ema8 > ema21 && ema21 > ema55) emaTrend = "BULLISH";
  else if (ema8 < ema21 && ema21 < ema55) emaTrend = "BEARISH";

  let crossover: EMAResult["crossover"] = "NONE";
  if (prevEma8 <= prevEma21 && ema8 > ema21) crossover = "GOLDEN";
  else if (prevEma8 >= prevEma21 && ema8 < ema21) crossover = "DEATH";

  const ema: EMAResult = { ema8, ema21, ema55, trend: emaTrend, crossover };

  /* ── Bollinger Bands ── */
  const bb = calcBollingerBands(prices, 20, 2);

  /* ── Momentum ── */
  const momentum = calcMomentum(prices);

  /* ── Digit Pattern Scores ── */
  const total = digits.length || 1;
  const freq = Array(10).fill(0) as number[];
  digits.forEach((d) => freq[d]++);

  // Track last appearance of each digit
  const lastSeen = Array(10).fill(-1) as number[];
  digits.forEach((d, i) => { lastSeen[d] = i; });

  const digitPatterns: DigitPatternScore[] = Array.from({ length: 10 }, (_, d) => {
    const count = freq[d];
    const pct = (count / total) * 100;
    const deviation = pct - 10;
    const consecutiveAbsence = digits.length - 1 - (lastSeen[d] === -1 ? 0 : lastSeen[d]);

    // Match score: higher when digit is hot (appears more than expected)
    const matchScore = Math.max(0, Math.min(100, 50 + deviation * 4));
    // Differs score: higher when digit is cold (appears less than expected)
    const differsScore = Math.max(0, Math.min(100, 50 - deviation * 4));

    const hotColdLabel: DigitPatternScore["hotColdLabel"] =
      deviation >= 10 ? "HOT" :
      deviation >= 5  ? "WARM" :
      deviation <= -10 ? "ICY" :
      deviation <= -5  ? "COLD" : "NEUTRAL";

    return { digit: d, matchScore, differsScore, hotColdLabel, deviation, consecutiveAbsence };
  });

  /* ── Volatility Regime ── */
  const atr = calcATR(slice, 14);
  const atrPips = atr * pipMult;
  const longAtr = calcATR(ticks.slice(-500), 50);
  const longAtrPips = longAtr * pipMult;
  const atrRatio = longAtrPips > 0 ? atrPips / longAtrPips : 1;

  const volRegime: VolatilityRegime["regime"] =
    atrRatio < 0.4 ? "ULTRA_LOW" :
    atrRatio < 0.7 ? "LOW" :
    atrRatio < 1.3 ? "NORMAL" :
    atrRatio < 2.0 ? "HIGH" : "EXTREME";

  const recent20Atr = calcATR(slice.slice(-20), 10) * pipMult;
  const older20Atr = calcATR(slice.slice(-40, -20), 10) * pipMult;
  const expanding = recent20Atr > older20Atr * 1.15;
  const spikeDetected = atrRatio > 2.0;

  const optimalContractDuration =
    volRegime === "ULTRA_LOW" ? "1-5 ticks" :
    volRegime === "LOW"       ? "5-10 ticks" :
    volRegime === "NORMAL"    ? "5-15 ticks" :
    volRegime === "HIGH"      ? "3-5 ticks" : "1-3 ticks (extreme care)";

  const volatility: VolatilityRegime = {
    atr: atrPips, atrRatio, regime: volRegime, expanding, spikeDetected, optimalContractDuration,
  };

  /* ── Multi-Timeframe Analysis ── */
  function calcBias(tickSlice: Tick[]): { trend: string; bias: string; strength: number } {
    if (tickSlice.length < 5) return { trend: "FLAT", bias: "NEUTRAL", strength: 0 };
    const ps = tickSlice.map((t) => t.quote);
    const rises = ps.slice(1).filter((p, i) => p > ps[i]).length;
    const total2 = ps.length - 1;
    const risePct = (rises / total2) * 100;
    const trend = risePct > 55 ? "UP" : risePct < 45 ? "DOWN" : "FLAT";
    const bias = risePct > 55 ? "BULLISH" : risePct < 45 ? "BEARISH" : "NEUTRAL";
    const strength = Math.abs(risePct - 50) * 2;
    return { trend, bias, strength };
  }

  const short  = calcBias(ticks.slice(-20));
  const medium = calcBias(ticks.slice(-100));
  const long   = calcBias(ticks.slice(-500));

  const bullCount = [short, medium, long].filter((t) => t.bias === "BULLISH").length;
  const bearCount = [short, medium, long].filter((t) => t.bias === "BEARISH").length;

  let alignment: MultiTimeframeAnalysis["alignment"] = "MIXED";
  let alignmentScore = 50;
  if (bullCount === 3) { alignment = "ALIGNED_BULL"; alignmentScore = 90; }
  else if (bearCount === 3) { alignment = "ALIGNED_BEAR"; alignmentScore = 90; }
  else if (bullCount === 0 && bearCount === 0) { alignment = "MIXED"; alignmentScore = 30; }
  else if (Math.abs(bullCount - bearCount) <= 1) { alignment = "CONFLICTING"; alignmentScore = 20; }

  const mtf: MultiTimeframeAnalysis = { short, medium, long, alignment, alignmentScore };

  /* ── Market Phase ── */
  const priceRange = (Math.max(...prices) - Math.min(...prices)) * pipMult;
  const emaSpread = Math.abs(ema8 - ema55) * pipMult;
  let marketPhase: TechnicalSummary["marketPhase"] = "RANGING";
  if (bb.squeeze) marketPhase = "BREAKOUT"; // Squeeze = impending breakout
  else if (emaSpread > atrPips * 2) marketPhase = "TRENDING";
  else if (atrRatio > 1.5 && expanding) marketPhase = "BREAKOUT";
  else if (rsiZone !== "NEUTRAL") marketPhase = "REVERSAL";
  else if (priceRange < atrPips * 3) marketPhase = "CHOPPY";

  /* ── Entry Signal Generation ── */
  const entrySignals: EntrySignal[] = [];
  const riseStreak = currentStreak(prices.slice(1).map((p, i) => p - prices[i]), (d) => d > 0);
  const fallStreak = currentStreak(prices.slice(1).map((p, i) => p - prices[i]), (d) => d < 0);
  const evenStreak = currentStreak(digits, (d) => d % 2 === 0);
  const oddStreak  = currentStreak(digits, (d) => d % 2 !== 0);
  const evens = digits.filter((d) => d % 2 === 0).length;
  const evenPct = (evens / total) * 100;

  // ── Signal 1: RSI Extreme + EMA confirmation
  if (rsiValue <= 25 && emaTrend !== "BEARISH") {
    entrySignals.push({
      id: "rsi-oversold",
      contractType: "RISE / CALL",
      direction: "BUY",
      strength: 85,
      confidence: "HIGH",
      reason: [
        `RSI ${rsiValue.toFixed(1)} — deep oversold territory`,
        `EMA alignment: ${emaTrend}`,
        `Price near BB lower band (${(bb.percentB * 100).toFixed(0)}%B)`,
      ],
      duration: volatility.optimalContractDuration,
      riskLevel: "MEDIUM",
      entryCondition: "RSI crossing back above 30",
      invalidationCondition: "Price breaks below BB lower band",
      expectedEdge: 12,
      timestamp: Date.now(),
    });
  }
  if (rsiValue >= 75 && emaTrend !== "BULLISH") {
    entrySignals.push({
      id: "rsi-overbought",
      contractType: "FALL / PUT",
      direction: "SELL",
      strength: 85,
      confidence: "HIGH",
      reason: [
        `RSI ${rsiValue.toFixed(1)} — deep overbought territory`,
        `EMA alignment: ${emaTrend}`,
        `Price near BB upper band (${(bb.percentB * 100).toFixed(0)}%B)`,
      ],
      duration: volatility.optimalContractDuration,
      riskLevel: "MEDIUM",
      entryCondition: "RSI crossing back below 70",
      invalidationCondition: "Price breaks above BB upper band",
      expectedEdge: 12,
      timestamp: Date.now(),
    });
  }

  // ── Signal 2: EMA Golden/Death Cross
  if (crossover === "GOLDEN" && mtf.alignment !== "ALIGNED_BEAR") {
    entrySignals.push({
      id: "golden-cross",
      contractType: "RISE",
      direction: "BUY",
      strength: 78,
      confidence: "HIGH",
      reason: [
        "EMA 8 crossed above EMA 21 — Golden Cross",
        `MTF alignment: ${alignment}`,
        `Momentum phase: ${momentum.phase}`,
      ],
      duration: "10-15 ticks",
      riskLevel: volatility.regime === "HIGH" ? "HIGH" : "MEDIUM",
      entryCondition: "On cross confirmation with next tick",
      invalidationCondition: "EMA 8 falls back below EMA 21",
      expectedEdge: 10,
      timestamp: Date.now(),
    });
  }
  if (crossover === "DEATH" && mtf.alignment !== "ALIGNED_BULL") {
    entrySignals.push({
      id: "death-cross",
      contractType: "FALL",
      direction: "SELL",
      strength: 78,
      confidence: "HIGH",
      reason: [
        "EMA 8 crossed below EMA 21 — Death Cross",
        `MTF alignment: ${alignment}`,
        `Momentum phase: ${momentum.phase}`,
      ],
      duration: "10-15 ticks",
      riskLevel: volatility.regime === "HIGH" ? "HIGH" : "MEDIUM",
      entryCondition: "On cross confirmation with next tick",
      invalidationCondition: "EMA 8 rises back above EMA 21",
      expectedEdge: 10,
      timestamp: Date.now(),
    });
  }

  // ── Signal 3: BB Squeeze Breakout
  if (bb.squeeze) {
    const biasBull = emaTrend === "BULLISH" || alignment === "ALIGNED_BULL";
    entrySignals.push({
      id: "bb-squeeze",
      contractType: biasBull ? "RISE / HIGHER" : "FALL / LOWER",
      direction: biasBull ? "BUY" : "SELL",
      strength: 72,
      confidence: "MEDIUM",
      reason: [
        "Bollinger Band SQUEEZE detected — explosive move imminent",
        `Bias: ${biasBull ? "BULLISH" : "BEARISH"} based on EMA/MTF`,
        `BB Width: ${bb.bandwidth.toFixed(3)}%`,
      ],
      duration: "5-10 ticks",
      riskLevel: "HIGH",
      entryCondition: "Price breaks decisively out of squeeze range",
      invalidationCondition: "Price returns to middle band",
      expectedEdge: 8,
      timestamp: Date.now(),
    });
  }

  // ── Signal 4: Streak Exhaustion (mean reversion)
  if (riseStreak >= 7) {
    entrySignals.push({
      id: "rise-exhaustion",
      contractType: "FALL",
      direction: "SELL",
      strength: 60 + Math.min(25, riseStreak * 2),
      confidence: riseStreak >= 10 ? "HIGH" : "MEDIUM",
      reason: [
        `${riseStreak} consecutive RISE ticks — statistically extreme`,
        "Mean reversion probability elevated",
        `Momentum: ${momentum.phase}`,
      ],
      duration: "3-7 ticks",
      riskLevel: "MEDIUM",
      entryCondition: "On first FALL tick confirming reversal",
      invalidationCondition: "Streak extends to 12+ ticks",
      expectedEdge: Math.min(20, riseStreak * 1.5),
      timestamp: Date.now(),
    });
  }
  if (fallStreak >= 7) {
    entrySignals.push({
      id: "fall-exhaustion",
      contractType: "RISE",
      direction: "BUY",
      strength: 60 + Math.min(25, fallStreak * 2),
      confidence: fallStreak >= 10 ? "HIGH" : "MEDIUM",
      reason: [
        `${fallStreak} consecutive FALL ticks — statistically extreme`,
        "Mean reversion probability elevated",
        `Momentum: ${momentum.phase}`,
      ],
      duration: "3-7 ticks",
      riskLevel: "MEDIUM",
      entryCondition: "On first RISE tick confirming reversal",
      invalidationCondition: "Streak extends to 12+ ticks",
      expectedEdge: Math.min(20, fallStreak * 1.5),
      timestamp: Date.now(),
    });
  }

  // ── Signal 5: Even/Odd streak exhaustion
  if (evenStreak >= 8) {
    entrySignals.push({
      id: "even-streak",
      contractType: "ODD",
      direction: "BUY",
      strength: 55 + Math.min(30, evenStreak * 2.5),
      confidence: evenStreak >= 11 ? "VERY_HIGH" : evenStreak >= 9 ? "HIGH" : "MEDIUM",
      reason: [
        `${evenStreak} consecutive EVEN digits — very rare sequence`,
        "Statistical pressure building for ODD",
        `Even frequency: ${evenPct.toFixed(1)}% in window`,
      ],
      duration: "1-5 ticks",
      riskLevel: "LOW",
      entryCondition: "Immediate — enter ODD contract now",
      invalidationCondition: "Streak extends beyond 15",
      expectedEdge: Math.min(25, evenStreak * 2),
      timestamp: Date.now(),
    });
  }
  if (oddStreak >= 8) {
    entrySignals.push({
      id: "odd-streak",
      contractType: "EVEN",
      direction: "BUY",
      strength: 55 + Math.min(30, oddStreak * 2.5),
      confidence: oddStreak >= 11 ? "VERY_HIGH" : oddStreak >= 9 ? "HIGH" : "MEDIUM",
      reason: [
        `${oddStreak} consecutive ODD digits — very rare sequence`,
        "Statistical pressure building for EVEN",
        `Odd frequency: ${(100 - evenPct).toFixed(1)}% in window`,
      ],
      duration: "1-5 ticks",
      riskLevel: "LOW",
      entryCondition: "Immediate — enter EVEN contract now",
      invalidationCondition: "Streak extends beyond 15",
      expectedEdge: Math.min(25, oddStreak * 2),
      timestamp: Date.now(),
    });
  }

  // ── Signal 6: Hot digit MATCHES
  const hotestDigit = digitPatterns.reduce((a, b) => a.deviation > b.deviation ? a : b);
  if (hotestDigit.deviation >= 8) {
    entrySignals.push({
      id: `matches-${hotestDigit.digit}`,
      contractType: `MATCHES ${hotestDigit.digit}`,
      direction: "BUY",
      strength: Math.min(90, 50 + hotestDigit.deviation * 3),
      confidence: hotestDigit.deviation >= 12 ? "HIGH" : "MEDIUM",
      reason: [
        `Digit ${hotestDigit.digit} at ${(10 + hotestDigit.deviation).toFixed(1)}% (${hotestDigit.deviation.toFixed(1)}% above expected)`,
        `Label: ${hotestDigit.hotColdLabel}`,
        `${total} tick sample window`,
      ],
      duration: "1-3 ticks",
      riskLevel: "MEDIUM",
      entryCondition: "Enter MATCHES contract on next tick",
      invalidationCondition: "Digit frequency normalises below 12%",
      expectedEdge: Math.min(18, hotestDigit.deviation * 1.2),
      timestamp: Date.now(),
    });
  }

  // ── Signal 7: Cold digit DIFFERS
  const coldestDigit = digitPatterns.reduce((a, b) => a.deviation < b.deviation ? a : b);
  if (coldestDigit.deviation <= -6) {
    entrySignals.push({
      id: `differs-${coldestDigit.digit}`,
      contractType: `DIFFERS ${coldestDigit.digit}`,
      direction: "BUY",
      strength: Math.min(88, 50 + Math.abs(coldestDigit.deviation) * 3),
      confidence: Math.abs(coldestDigit.deviation) >= 10 ? "HIGH" : "MEDIUM",
      reason: [
        `Digit ${coldestDigit.digit} at ${(10 + coldestDigit.deviation).toFixed(1)}% (${Math.abs(coldestDigit.deviation).toFixed(1)}% below expected)`,
        `Absence streak: ${coldestDigit.consecutiveAbsence} ticks`,
        `Label: ${coldestDigit.hotColdLabel}`,
      ],
      duration: "1-3 ticks",
      riskLevel: "LOW",
      entryCondition: "DIFFERS contract — strong statistical edge",
      invalidationCondition: "Digit returns to expected frequency",
      expectedEdge: Math.min(22, Math.abs(coldestDigit.deviation) * 1.5),
      timestamp: Date.now(),
    });
  }

  // ── Signal 8: MTF Aligned + Momentum confirmation
  if (alignment === "ALIGNED_BULL" && momentum.phase === "ACCELERATING_UP") {
    entrySignals.push({
      id: "mtf-bull-momentum",
      contractType: "RISE / HIGHER",
      direction: "BUY",
      strength: 88,
      confidence: "VERY_HIGH",
      reason: [
        "All 3 timeframes aligned BULLISH",
        "Momentum accelerating upward",
        `EMA trend: ${emaTrend}`,
      ],
      duration: "10-20 ticks",
      riskLevel: volRegime === "HIGH" ? "HIGH" : "LOW",
      entryCondition: "Immediate entry — rare confluence signal",
      invalidationCondition: "Short-term timeframe flips bearish",
      expectedEdge: 15,
      timestamp: Date.now(),
    });
  }
  if (alignment === "ALIGNED_BEAR" && momentum.phase === "ACCELERATING_DOWN") {
    entrySignals.push({
      id: "mtf-bear-momentum",
      contractType: "FALL / LOWER",
      direction: "SELL",
      strength: 88,
      confidence: "VERY_HIGH",
      reason: [
        "All 3 timeframes aligned BEARISH",
        "Momentum accelerating downward",
        `EMA trend: ${emaTrend}`,
      ],
      duration: "10-20 ticks",
      riskLevel: volRegime === "HIGH" ? "HIGH" : "LOW",
      entryCondition: "Immediate entry — rare confluence signal",
      invalidationCondition: "Short-term timeframe flips bullish",
      expectedEdge: 15,
      timestamp: Date.now(),
    });
  }

  // Sort by strength descending
  entrySignals.sort((a, b) => b.strength - a.strength);

  /* ── Overall Score ── */
  const scores = [
    alignmentScore * 0.25,
    Math.abs(rsiValue - 50) * 1.5 * 0.15,
    (crossover !== "NONE" ? 80 : 40) * 0.10,
    (!bb.squeeze ? 40 : 80) * 0.10,
    Math.min(100, entrySignals.length * 20) * 0.20,
    (volatility.regime === "NORMAL" ? 70 : 40) * 0.20,
  ];
  const overallScore = Math.round(scores.reduce((a, b) => a + b, 0));

  const bestSetup = entrySignals[0] ?? null;

  return {
    rsi, ema, bb, momentum, digitPatterns, entrySignals,
    mtf, volatility, overallScore, marketPhase, bestSetup,
  };
}

/* ── Hook ─────────────────────────────────────────────────────────────────── */
export function useTechnicalEngine(ticks: Tick[], windowSize: number): TechnicalSummary | null {
  return useMemo(() => computeTechnicalSummary(ticks, windowSize), [ticks, windowSize]);
}
