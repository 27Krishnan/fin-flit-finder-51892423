import { Trade } from './types';

// ============================================================
// Monte Carlo Simulation
// ============================================================
// Resamples the historical trade P&L sequence (with replacement)
// many times to estimate the distribution of possible outcomes.
// This validates whether the strategy's edge is statistically real
// or could be the result of lucky ordering.

export interface MonteCarloResult {
  simulations: number;
  tradesPerSim: number;
  // Final P&L distribution
  meanFinalPnl: number;
  medianFinalPnl: number;
  stdDevFinalPnl: number;
  bestCase: number;          // 95th percentile
  worstCase: number;         // 5th percentile
  // Drawdown distribution
  meanMaxDD: number;
  medianMaxDD: number;
  worstMaxDD: number;        // 95th percentile (worst)
  ddAt95: number;            // 95% confidence DD
  // Probability of profit
  probProfit: number;        // % of sims that ended profitable
  probRuin: number;          // % of sims that lost more than capital
  // Sample equity paths for chart
  samplePaths: number[][];
  // Edge validation
  actualFinalPnl: number;
  actualMaxDD: number;
  edgeValid: boolean;        // actual within expected band?
  confidenceScore: number;   // 0-100
}

function shuffleResample(pnls: number[]): number[] {
  const out = new Array(pnls.length);
  for (let i = 0; i < pnls.length; i++) {
    out[i] = pnls[Math.floor(Math.random() * pnls.length)];
  }
  return out;
}

function computeMaxDD(equityCurve: number[]): number {
  let peak = equityCurve[0] || 0;
  let maxDD = 0;
  for (const v of equityCurve) {
    if (v > peak) peak = v;
    const dd = peak - v;
    if (dd > maxDD) maxDD = dd;
  }
  return maxDD;
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length)));
  return sorted[idx];
}

export function runMonteCarlo(
  trades: Trade[],
  capital: number,
  simulations: number = 1000
): MonteCarloResult | null {
  if (trades.length < 20) return null;
  const pnls = trades.map(t => t.netPnl);
  const n = pnls.length;

  const finalPnls: number[] = [];
  const maxDDs: number[] = [];
  const samplePaths: number[][] = [];
  let profitable = 0;
  let ruined = 0;

  for (let s = 0; s < simulations; s++) {
    const resampled = shuffleResample(pnls);
    const equity: number[] = [0];
    let cum = 0;
    for (const p of resampled) {
      cum += p;
      equity.push(cum);
    }
    const final = cum;
    const maxDD = computeMaxDD(equity);
    finalPnls.push(final);
    maxDDs.push(maxDD);
    if (final > 0) profitable++;
    if (capital > 0 && maxDD > capital) ruined++;
    if (s < 50) samplePaths.push(equity);
  }

  finalPnls.sort((a, b) => a - b);
  maxDDs.sort((a, b) => a - b);

  const sum = finalPnls.reduce((a, b) => a + b, 0);
  const mean = sum / simulations;
  const variance = finalPnls.reduce((acc, v) => acc + (v - mean) ** 2, 0) / simulations;
  const std = Math.sqrt(variance);

  // Actual sequential
  let actualCum = 0;
  const actualEquity: number[] = [0];
  for (const p of pnls) {
    actualCum += p;
    actualEquity.push(actualCum);
  }
  const actualFinal = actualCum;
  const actualDD = computeMaxDD(actualEquity);

  // Edge validity: actual final P&L should be within 5%-95% band
  const within = actualFinal >= percentile(finalPnls, 5) && actualFinal <= percentile(finalPnls, 95);

  // Confidence: how strong is the edge?
  // If 95%+ of sims are profitable -> very high confidence
  // Plus actual is near or above median
  let conf = (profitable / simulations) * 70;
  if (actualFinal >= finalPnls[Math.floor(simulations / 2)]) conf += 15;
  if (within) conf += 15;

  return {
    simulations,
    tradesPerSim: n,
    meanFinalPnl: mean,
    medianFinalPnl: finalPnls[Math.floor(simulations / 2)],
    stdDevFinalPnl: std,
    bestCase: percentile(finalPnls, 95),
    worstCase: percentile(finalPnls, 5),
    meanMaxDD: maxDDs.reduce((a, b) => a + b, 0) / simulations,
    medianMaxDD: maxDDs[Math.floor(simulations / 2)],
    worstMaxDD: percentile(maxDDs, 95),
    ddAt95: percentile(maxDDs, 95),
    probProfit: (profitable / simulations) * 100,
    probRuin: (ruined / simulations) * 100,
    samplePaths,
    actualFinalPnl: actualFinal,
    actualMaxDD: actualDD,
    edgeValid: within && profitable / simulations > 0.7,
    confidenceScore: Math.min(100, Math.round(conf)),
  };
}

// ============================================================
// Walk-Forward Analysis
// ============================================================
// Splits the trades into sequential windows (in-sample / out-of-sample)
// and checks if the strategy's edge persists across time periods.
// This detects overfitting and regime dependency.

export interface WalkForwardWindow {
  windowNum: number;
  inSampleStart: Date;
  inSampleEnd: Date;
  outSampleStart: Date;
  outSampleEnd: Date;
  inSampleTrades: number;
  outSampleTrades: number;
  inSampleWinRate: number;
  outSampleWinRate: number;
  inSamplePnl: number;
  outSamplePnl: number;
  inSampleProfitFactor: number;
  outSampleProfitFactor: number;
  efficiency: number;       // out/in P&L ratio
  consistent: boolean;      // out-of-sample profitable & efficiency > 0.5
}

export interface WalkForwardResult {
  windows: WalkForwardWindow[];
  avgEfficiency: number;
  consistencyScore: number;     // % windows where edge held
  oosWinRateAvg: number;
  oosProfitableWindows: number;
  totalWindows: number;
  robustnessRating: 'excellent' | 'good' | 'moderate' | 'weak' | 'overfit';
  verdict: string;
}

function tradeStats(trades: Trade[]) {
  if (!trades.length) return { winRate: 0, pnl: 0, pf: 0 };
  const wins = trades.filter(t => t.netPnl > 0);
  const losses = trades.filter(t => t.netPnl < 0);
  const grossWin = wins.reduce((s, t) => s + t.netPnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.netPnl, 0));
  return {
    winRate: (wins.length / trades.length) * 100,
    pnl: trades.reduce((s, t) => s + t.netPnl, 0),
    pf: grossLoss === 0 ? (grossWin > 0 ? 999 : 0) : grossWin / grossLoss,
  };
}

export function runWalkForward(
  trades: Trade[],
  numWindows: number = 5,
  oosRatio: number = 0.3
): WalkForwardResult | null {
  if (trades.length < 50) return null;

  const sorted = [...trades].sort((a, b) => a.exitDate.getTime() - b.exitDate.getTime());
  const total = sorted.length;
  const windowSize = Math.floor(total / numWindows);
  const oosSize = Math.floor(windowSize * oosRatio);
  const isSize = windowSize - oosSize;

  if (isSize < 10 || oosSize < 5) return null;

  const windows: WalkForwardWindow[] = [];

  for (let w = 0; w < numWindows; w++) {
    const start = w * windowSize;
    const isEnd = start + isSize;
    const oosEnd = Math.min(start + windowSize, total);

    const inSample = sorted.slice(start, isEnd);
    const outSample = sorted.slice(isEnd, oosEnd);
    if (!inSample.length || !outSample.length) continue;

    const isStats = tradeStats(inSample);
    const oosStats = tradeStats(outSample);
    const efficiency = isStats.pnl !== 0 ? oosStats.pnl / Math.abs(isStats.pnl) : 0;

    windows.push({
      windowNum: w + 1,
      inSampleStart: inSample[0].exitDate,
      inSampleEnd: inSample[inSample.length - 1].exitDate,
      outSampleStart: outSample[0].exitDate,
      outSampleEnd: outSample[outSample.length - 1].exitDate,
      inSampleTrades: inSample.length,
      outSampleTrades: outSample.length,
      inSampleWinRate: isStats.winRate,
      outSampleWinRate: oosStats.winRate,
      inSamplePnl: isStats.pnl,
      outSamplePnl: oosStats.pnl,
      inSampleProfitFactor: isStats.pf,
      outSampleProfitFactor: oosStats.pf,
      efficiency,
      consistent: oosStats.pnl > 0 && efficiency > 0.3,
    });
  }

  if (!windows.length) return null;

  const profitableOOS = windows.filter(w => w.outSamplePnl > 0).length;
  const avgEff = windows.reduce((s, w) => s + w.efficiency, 0) / windows.length;
  const oosWR = windows.reduce((s, w) => s + w.outSampleWinRate, 0) / windows.length;
  const consistency = (windows.filter(w => w.consistent).length / windows.length) * 100;

  let rating: WalkForwardResult['robustnessRating'];
  let verdict: string;
  if (consistency >= 80 && avgEff >= 0.7) {
    rating = 'excellent';
    verdict = 'Strategy edge persists strongly across all time periods. Highly robust.';
  } else if (consistency >= 60 && avgEff >= 0.5) {
    rating = 'good';
    verdict = 'Edge holds in most periods. Strategy is reliable.';
  } else if (consistency >= 40) {
    rating = 'moderate';
    verdict = 'Edge is inconsistent. Some regimes work, others don\'t.';
  } else if (consistency >= 20) {
    rating = 'weak';
    verdict = 'Edge degrades significantly out-of-sample. Likely partial overfitting.';
  } else {
    rating = 'overfit';
    verdict = 'Strategy fails to generalize. Probable curve-fit / overfit.';
  }

  return {
    windows,
    avgEfficiency: avgEff,
    consistencyScore: consistency,
    oosWinRateAvg: oosWR,
    oosProfitableWindows: profitableOOS,
    totalWindows: windows.length,
    robustnessRating: rating,
    verdict,
  };
}
