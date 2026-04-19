import { Trade, DashboardMetrics, DrawdownDetail, MonthlyData, EquityPoint, YearOverview, StreakDetail, EfficiencyByYear, FileData } from './types';

export function calculateMetrics(trades: Trade[], capital: number = 0): DashboardMetrics {
  if (!trades.length) return emptyMetrics();

  const wins = trades.filter(t => t.isWin);
  const losses = trades.filter(t => !t.isWin);
  const grossProfit = wins.reduce((s, t) => s + t.netPnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.netPnl, 0));
  const netProfit = grossProfit - grossLoss;
  const avgWin = wins.length ? grossProfit / wins.length : 0;
  const avgLoss = losses.length ? grossLoss / losses.length : 0;
  const payoffRatio = avgLoss ? avgWin / avgLoss : avgWin ? Infinity : 0;
  const winRate = (wins.length / trades.length) * 100;
  const profitFactor = grossLoss ? grossProfit / grossLoss : grossProfit ? Infinity : 0;
  const expectancy = trades.length ? netProfit / trades.length : 0;
  const riskRewardRatio = avgLoss ? avgWin / avgLoss : 0;

  // Max Drawdown with dates
  let peak = 0, maxDD = 0, maxDDPct = 0;
  let equity = 0;
  // Initialize peakDate to the first trade's entry date (the starting point at equity=0)
  let peakDate: Date | null = trades.length > 0 ? trades[0].entryDate : null;
  let ddPeakDate: Date | null = null, ddTroughDate: Date | null = null;
  let ddRecoveryDate: Date | null = null, ddPeakVal = 0, ddTroughVal = 0;
  let currentDDStart: Date | null = null;

  for (const t of trades) {
    equity += t.netPnl;
    if (equity > peak) {
      if (maxDD > 0 && ddTroughDate && !ddRecoveryDate) ddRecoveryDate = t.exitDate;
      peak = equity;
      peakDate = t.exitDate;
    }
    const dd = peak - equity;
    if (dd > maxDD) {
      maxDD = dd;
      maxDDPct = capital > 0 ? (dd / capital) * 100 : (peak ? (dd / peak) * 100 : 0);
      ddPeakDate = peakDate;
      ddTroughDate = t.exitDate;
      ddPeakVal = peak;
      ddTroughVal = equity;
      ddRecoveryDate = null;
    }
  }
  // Check if recovered after max DD and count recovery trades + total trades in DD period
  let ddRecoveryTrades = 0;
  let ddTotalTradesInDD = 0;
  if (!ddRecoveryDate && ddTroughDate) {
    equity = 0;
    let pastPeak = false;
    let tradeCount = 0;
    let totalCount = 0;
    for (const t of trades) {
      equity += t.netPnl;
      if (pastPeak) {
        totalCount++;
        if (t.exitDate.getTime() > ddTroughDate.getTime()) {
          tradeCount++;
        }
        if (equity >= ddPeakVal) { ddRecoveryDate = t.exitDate; ddRecoveryTrades = tradeCount; ddTotalTradesInDD = totalCount; break; }
      }
      if (ddPeakDate && t.exitDate.getTime() === ddPeakDate.getTime()) pastPeak = true;
    }
    if (!ddRecoveryDate) ddTotalTradesInDD = totalCount; // not recovered yet
  } else if (ddRecoveryDate && ddPeakDate) {
    // Count trades between peak and recovery
    let pastPeak = false;
    let tradeCount = 0;
    let totalCount = 0;
    for (const t of trades) {
      if (pastPeak) {
        totalCount++;
        if (ddTroughDate && t.exitDate.getTime() > ddTroughDate.getTime()) {
          tradeCount++;
        }
        if (t.exitDate.getTime() === ddRecoveryDate.getTime()) { ddRecoveryTrades = tradeCount; ddTotalTradesInDD = totalCount; break; }
      }
      if (t.exitDate.getTime() === ddPeakDate.getTime()) pastPeak = true;
    }
  }

  const maxDDDetail: DrawdownDetail = {
    type: 'Max Drawdown',
    amount: maxDD,
    peakDate: ddPeakDate,
    troughDate: ddTroughDate,
    recoveryDate: ddRecoveryDate,
    recoveryDays: ddPeakDate && ddRecoveryDate ? Math.round((ddRecoveryDate.getTime() - ddPeakDate.getTime()) / 86400000) : -1,
    recoveryTrades: ddRecoveryTrades,
    totalTradesInDD: ddTotalTradesInDD,
    peakValue: ddPeakVal,
    troughValue: ddTroughVal,
  };

  // Closed Trade DD (largest single trade loss)
  const worstTrade = losses.length ? losses.reduce((w, t) => t.netPnl < w.netPnl ? t : w, losses[0]) : null;
  const closedTradeDD: DrawdownDetail = {
    type: 'Closed Trade DD',
    amount: worstTrade ? Math.abs(worstTrade.netPnl) : 0,
    peakDate: worstTrade?.entryDate || null,
    troughDate: worstTrade?.exitDate || null,
    recoveryDate: null,
    recoveryDays: 0,
    recoveryTrades: 0,
    totalTradesInDD: 0,
    peakValue: 0,
    troughValue: worstTrade ? worstTrade.netPnl : 0,
  };

  // Max Intraday Drawdown (largest drawdown field from trade data - peak to trough within a single trade)
  let maxIntraDD = 0;
  let intraTrade: Trade | null = null;
  for (const t of trades) {
    if (Math.abs(t.drawdown) > maxIntraDD) {
      maxIntraDD = Math.abs(t.drawdown);
      intraTrade = t;
    }
  }
  const intraDayDD: DrawdownDetail = {
    type: 'Max Intraday Drawdown',
    amount: maxIntraDD,
    peakDate: intraTrade?.entryDate || null,
    troughDate: intraTrade?.exitDate || null,
    recoveryDate: null,
    recoveryDays: 0,
    recoveryTrades: 0,
    totalTradesInDD: 0,
    peakValue: 0,
    troughValue: -maxIntraDD,
  };

  // Monthly consistency
  const monthMap = new Map<string, number>();
  trades.forEach(t => {
    const key = `${t.exitDate.getFullYear()}-${String(t.exitDate.getMonth() + 1).padStart(2, '0')}`;
    monthMap.set(key, (monthMap.get(key) || 0) + t.netPnl);
  });
  const profitableMonths = Array.from(monthMap.values()).filter(v => v > 0).length;
  const monthlyConsistency = monthMap.size ? (profitableMonths / monthMap.size) * 100 : 0;

  // Yearly consistency
  const yearMap = new Map<string, number>();
  trades.forEach(t => {
    const key = `${t.exitDate.getFullYear()}`;
    yearMap.set(key, (yearMap.get(key) || 0) + t.netPnl);
  });
  const profitableYears = Array.from(yearMap.values()).filter(v => v > 0).length;
  const yearlyConsistency = yearMap.size ? (profitableYears / yearMap.size) * 100 : 0;

  // Statistical Robustness
  const minWR = payoffRatio ? (1 / (1 + payoffRatio)) * 100 : 100;
  const robustness = minWR ? winRate / minWR : 0;

  // Stand-over DD
  const standOverDD = calculateStandOverDD(trades);

  // Consecutive wins/losses
  let maxConsecWins = 0, maxConsecLosses = 0, cw = 0, cl = 0;
  for (const t of trades) {
    if (t.isWin) { cw++; cl = 0; maxConsecWins = Math.max(maxConsecWins, cw); }
    else { cl++; cw = 0; maxConsecLosses = Math.max(maxConsecLosses, cl); }
  }

  // Capital-dependent metrics
  const totalReturnPct = capital > 0 ? (netProfit / capital) * 100 : 0;
  const firstDate = trades[0].exitDate;
  const lastDate = trades[trades.length - 1].exitDate;
  const years = Math.max((lastDate.getTime() - firstDate.getTime()) / (365.25 * 86400000), 1);
  const cagr = capital > 0 ? (Math.pow((capital + netProfit) / capital, 1 / years) - 1) * 100 : 0;

  // Daily P&L for Sharpe/Sortino
  const dailyPnl = getDailyPnl(trades);
  const dailyReturns = capital > 0
    ? dailyPnl.map(d => d.pnl / capital)
    : dailyPnl.map(d => d.pnl);
  const avgDailyReturn = dailyReturns.length ? dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length : 0;
  const stdDev = Math.sqrt(dailyReturns.reduce((s, r) => s + (r - avgDailyReturn) ** 2, 0) / Math.max(dailyReturns.length - 1, 1));
  const downside = dailyReturns.filter(r => r < 0);
  const downsideDev = Math.sqrt(downside.reduce((s, r) => s + r ** 2, 0) / Math.max(downside.length - 1, 1));
  const annualFactor = Math.sqrt(252);
  const sharpeRatio = stdDev ? (avgDailyReturn / stdDev) * annualFactor : 0;
  const sortinoRatio = downsideDev ? (avgDailyReturn / downsideDev) * annualFactor : 0;
  const calmarRatio = maxDDPct ? (cagr / maxDDPct) : 0;

  // Top 5 wins and losses
  const sortedByPnl = [...trades].sort((a, b) => b.netPnl - a.netPnl);
  const top5Wins = sortedByPnl.slice(0, 5);
  const top5Losses = sortedByPnl.slice(-5).reverse().filter(t => t.netPnl <= 0);

  return {
    totalTrades: trades.length, winningTrades: wins.length, losingTrades: losses.length,
    winRate, grossProfit, grossLoss, netProfit, profitFactor, maxDrawdown: maxDD,
    maxDrawdownPct: maxDDPct, payoffRatio, avgWin, avgLoss, expectancy,
    monthlyConsistency, yearlyConsistency, statisticalRobustness: robustness,
    standOverDD, maxConsecWins, maxConsecLosses,
    totalReturnPct, cagr, sharpeRatio, sortinoRatio, calmarRatio,
    riskRewardRatio, avgWinAmount: avgWin, avgLossAmount: avgLoss,
    closedTradeDD, intraDayDD, maxDDDetail,
    top5Wins, top5Losses,
  };
}

function calculateStandOverDD(trades: Trade[]) {
  let peak = 0, equity = 0;
  let peakDate: Date | null = null;
  let maxDays = 0, soStart: Date | null = null, soEnd: Date | null = null;
  let soPeak = 0, soLowest = 0;
  let currentDrawdownStart: Date | null = null;
  let lowest = 0;

  for (const t of trades) {
    equity += t.netPnl;
    if (equity >= peak) {
      if (currentDrawdownStart && peakDate) {
        const days = Math.round((t.exitDate.getTime() - currentDrawdownStart.getTime()) / 86400000);
        if (days > maxDays) {
          maxDays = days;
          soStart = currentDrawdownStart;
          soEnd = t.exitDate;
          soPeak = peak;
          soLowest = lowest;
        }
      }
      peak = equity;
      peakDate = t.exitDate;
      currentDrawdownStart = null;
      lowest = equity;
    } else {
      if (!currentDrawdownStart) currentDrawdownStart = peakDate;
      if (equity < lowest) lowest = equity;
    }
  }

  return { days: maxDays, startDate: soStart, endDate: soEnd, peakValue: soPeak, lowestValue: soLowest, currentValue: equity };
}

function getDailyPnl(trades: Trade[]) {
  const map = new Map<string, number>();
  trades.forEach(t => {
    const key = t.exitDate.toISOString().slice(0, 10);
    map.set(key, (map.get(key) || 0) + t.netPnl);
  });
  return Array.from(map.entries()).sort().map(([date, pnl]) => ({ date, pnl }));
}

export function getMonthlyData(trades: Trade[]): MonthlyData[] {
  const map = new Map<string, MonthlyData>();
  trades.forEach(t => {
    const key = `${t.exitDate.getFullYear()}-${String(t.exitDate.getMonth() + 1).padStart(2, '0')}`;
    if (!map.has(key)) map.set(key, { month: key, pnl: 0, trades: 0, wins: 0 });
    const m = map.get(key)!;
    m.pnl += t.netPnl;
    m.trades++;
    if (t.isWin) m.wins++;
  });
  return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
}

export function getEquityCurve(trades: Trade[]): EquityPoint[] {
  let equity = 0;
  return trades.map(t => {
    equity += t.netPnl;
    return {
      date: t.exitDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }),
      equity,
    };
  });
}

export function getYearOverview(trades: Trade[]): YearOverview[] {
  const yearMap = new Map<number, YearOverview>();
  trades.forEach(t => {
    const y = t.exitDate.getFullYear();
    const m = t.exitDate.getMonth();
    if (!yearMap.has(y)) {
      yearMap.set(y, {
        year: y, totalPnl: 0, grossProfit: 0, grossLoss: 0, maxDrawdown: 0,
        totalTrades: 0, totalWins: 0, totalLosses: 0, winRate: 0,
        profitableMonths: 0, lossMonths: 0,
        months: Array.from({ length: 12 }, (_, i) => ({ month: i, pnl: 0, trades: 0, wins: 0, losses: 0 })),
      });
    }
    const yr = yearMap.get(y)!;
    yr.totalPnl += t.netPnl;
    yr.totalTrades++;
    if (t.isWin) { yr.totalWins++; yr.grossProfit += t.netPnl; }
    else { yr.totalLosses++; yr.grossLoss += Math.abs(t.netPnl); }
    yr.months[m].pnl += t.netPnl;
    yr.months[m].trades++;
    if (t.isWin) yr.months[m].wins++;
    else yr.months[m].losses++;
  });

  // Calculate max drawdown per year
  const yearKeys = Array.from(yearMap.keys());
  for (const y of yearKeys) {
    const yr = yearMap.get(y)!;
    const yearTrades = trades.filter(t => t.exitDate.getFullYear() === y);
    let peak = 0, equity = 0, maxDD = 0;
    for (const t of yearTrades) {
      equity += t.netPnl;
      if (equity > peak) peak = equity;
      const dd = peak - equity;
      if (dd > maxDD) maxDD = dd;
    }
    yr.maxDrawdown = maxDD;
  }

  return Array.from(yearMap.values()).map(yr => {
    yr.winRate = yr.totalTrades ? (yr.totalWins / yr.totalTrades) * 100 : 0;
    const activeMonths = yr.months.filter(m => m.trades > 0);
    yr.profitableMonths = activeMonths.filter(m => m.pnl > 0).length;
    yr.lossMonths = activeMonths.filter(m => m.pnl <= 0).length;
    return yr;
  }).sort((a, b) => b.year - a.year);
}

export function getStreaks(trades: Trade[]) {
  const winStreaks: Trade[][] = [];
  const lossStreaks: Trade[][] = [];
  let current: Trade[] = [];
  let isWinStreak = trades[0]?.isWin;

  for (const t of trades) {
    if (t.isWin === isWinStreak) {
      current.push(t);
    } else {
      if (current.length) (isWinStreak ? winStreaks : lossStreaks).push([...current]);
      current = [t];
      isWinStreak = t.isWin;
    }
  }
  if (current.length) (isWinStreak ? winStreaks : lossStreaks).push([...current]);

  const toDetails = (streaks: Trade[][]): StreakDetail[] =>
    streaks.map(s => ({
      length: s.length,
      startDate: s[0].entryDate,
      endDate: s[s.length - 1].exitDate,
      trades: s,
      totalPnl: s.reduce((a, t) => a + t.netPnl, 0),
    }));

  const summarize = (streaks: Trade[][]) => {
    const details = toDetails(streaks);
    const byLength = new Map<number, { count: number; total: number; max: number; min: number; details: StreakDetail[] }>();
    details.forEach(s => {
      const len = s.length;
      if (!byLength.has(len)) byLength.set(len, { count: 0, total: 0, max: -Infinity, min: Infinity, details: [] });
      const entry = byLength.get(len)!;
      entry.count++;
      entry.total += s.totalPnl;
      entry.max = Math.max(entry.max, s.totalPnl);
      entry.min = Math.min(entry.min, s.totalPnl);
      entry.details.push(s);
    });
    return Array.from(byLength.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([length, data]) => ({
        length,
        count: data.count,
        probability: (data.count / streaks.length) * 100,
        total: data.total,
        avg: data.total / data.count,
        max: data.max,
        min: data.min,
        details: data.details,
      }));
  };

  return { winStreaks: summarize(winStreaks), lossStreaks: summarize(lossStreaks) };
}

export function getTimeAnalysis(trades: Trade[], interval: number = 15) {
  const slots = new Map<string, { trades: number; wins: number; pnl: number }>();
  trades.forEach(t => {
    const h = t.entryDate.getHours();
    const m = Math.floor(t.entryDate.getMinutes() / interval) * interval;
    const key = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    if (!slots.has(key)) slots.set(key, { trades: 0, wins: 0, pnl: 0 });
    const s = slots.get(key)!;
    s.trades++;
    if (t.isWin) s.wins++;
    s.pnl += t.netPnl;
  });
  return Array.from(slots.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([slot, data]) => ({ slot, ...data, winRate: (data.wins / data.trades) * 100 }));
}

export function getCorrelationMatrix(files: FileData[], dateMode: 'exit' | 'entry' = 'exit') {
  const visibleFiles = files.filter(f => f.visible && f.trades.length);
  if (visibleFiles.length < 2) return { labels: visibleFiles.map(f => f.name), matrix: [] };

  const getDateKey = (t: Trade) => (dateMode === 'entry' ? t.entryDate : t.exitDate).toISOString().slice(0, 10);

  const dailyPnls = visibleFiles.map(f => {
    const map = new Map<string, number>();
    f.trades.forEach(t => {
      const key = getDateKey(t);
      map.set(key, (map.get(key) || 0) + t.netPnl * f.multiplier);
    });
    return map;
  });

  const allDates = new Set<string>();
  dailyPnls.forEach(m => m.forEach((_, k) => allDates.add(k)));
  const dates = Array.from(allDates).sort();
  const arrays = dailyPnls.map(m => dates.map(d => m.get(d) || 0));

  const matrix: number[][] = [];
  for (let i = 0; i < arrays.length; i++) {
    const row: number[] = [];
    for (let j = 0; j < arrays.length; j++) {
      row.push(i === j ? 1 : pearson(arrays[i], arrays[j]));
    }
    matrix.push(row);
  }

  // Co-occurrence
  const coOccurrence: number[][] = [];
  for (let i = 0; i < visibleFiles.length; i++) {
    const row: number[] = [];
    for (let j = 0; j < visibleFiles.length; j++) {
      const datesI = new Set(visibleFiles[i].trades.map(t => getDateKey(t)));
      const datesJ = new Set(visibleFiles[j].trades.map(t => getDateKey(t)));
      let overlap = 0;
      datesI.forEach(d => { if (datesJ.has(d)) overlap++; });
      row.push(i === j ? datesI.size : overlap);
    }
    coOccurrence.push(row);
  }

  // Monthly P&L by file
  const monthlyByFile = visibleFiles.map(f => {
    const map = new Map<string, number>();
    f.trades.forEach(t => {
      const d = dateMode === 'entry' ? t.entryDate : t.exitDate;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      map.set(key, (map.get(key) || 0) + t.netPnl * f.multiplier);
    });
    return { name: f.name, data: map };
  });

  const allMonths = new Set<string>();
  monthlyByFile.forEach(f => f.data.forEach((_, k) => allMonths.add(k)));
  const sortedMonths = Array.from(allMonths).sort();

  return { labels: visibleFiles.map(f => f.name), matrix, coOccurrence, monthlyByFile, sortedMonths };
}

function pearson(x: number[], y: number[]) {
  const n = x.length;
  if (n === 0) return 0;
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const a = x[i] - mx, b = y[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  const denom = Math.sqrt(dx * dy);
  return denom ? num / denom : 0;
}

export function getEfficiencyData(files: FileData[]) {
  return files.filter(f => f.visible && f.trades.length).map(f => {
    const trades = f.trades;
    const netProfit = trades.reduce((s, t) => s + t.netPnl * f.multiplier, 0);
    let peak = 0, maxClosedDD = 0, equity = 0;
    let maxIntraDD = 0, intraPeak = 0;
    for (const t of trades) {
      // Intra-trade trough: current equity + adverse excursion (drawdown is negative)
      const intraTrough = equity + (t.drawdown * f.multiplier);
      if (intraTrough < equity) {
        const intraDD = intraPeak - Math.min(equity, intraTrough);
        if (intraDD > maxIntraDD) maxIntraDD = intraDD;
      }
      // Update equity with closed P&L
      equity += t.netPnl * f.multiplier;
      if (equity > peak) peak = equity;
      if (equity > intraPeak) intraPeak = equity;
      const dd = peak - equity;
      if (dd > maxClosedDD) maxClosedDD = dd;
    }
    return {
      name: f.name,
      netProfit,
      closedDD: maxClosedDD,
      intraDD: maxIntraDD,
      efficiency: maxIntraDD ? netProfit / maxIntraDD : netProfit > 0 ? Infinity : 0,
    };
  }).sort((a, b) => b.efficiency - a.efficiency);
}

export function getEfficiencyByYear(files: FileData[]): EfficiencyByYear[] {
  const visibleFiles = files.filter(f => f.visible && f.trades.length);
  const allYears = new Set<number>();
  visibleFiles.forEach(f => f.trades.forEach(t => allYears.add(t.exitDate.getFullYear())));

  return Array.from(allYears).sort((a, b) => b - a).map(year => {
    const strategies = visibleFiles.map(f => {
      const yearTrades = f.trades.filter(t => t.exitDate.getFullYear() === year);
      const netProfit = yearTrades.reduce((s, t) => s + t.netPnl * f.multiplier, 0);
      let peak = 0, maxClosedDD = 0, equity = 0;
      let maxIntraDD = 0, intraPeak = 0;
      for (const t of yearTrades) {
        const intraTrough = equity + (t.drawdown * f.multiplier);
        if (intraTrough < equity) {
          const intraDD = intraPeak - Math.min(equity, intraTrough);
          if (intraDD > maxIntraDD) maxIntraDD = intraDD;
        }
        equity += t.netPnl * f.multiplier;
        if (equity > peak) peak = equity;
        if (equity > intraPeak) intraPeak = equity;
        const dd = peak - equity;
        if (dd > maxClosedDD) maxClosedDD = dd;
      }
      return {
        name: f.name,
        netProfit,
        maxDD: maxClosedDD,
        intraDD: maxIntraDD,
        efficiency: maxIntraDD ? netProfit / maxIntraDD : netProfit > 0 ? Infinity : 0,
        trades: yearTrades.length,
      };
    }).filter(s => s.trades > 0);
    return { year, strategies };
  });
}

function emptyMetrics(): DashboardMetrics {
  const emptyDD: DrawdownDetail = { type: '', amount: 0, peakDate: null, troughDate: null, recoveryDate: null, recoveryDays: 0, recoveryTrades: 0, totalTradesInDD: 0, peakValue: 0, troughValue: 0 };
  return {
    totalTrades: 0, winningTrades: 0, losingTrades: 0, winRate: 0,
    grossProfit: 0, grossLoss: 0, netProfit: 0, profitFactor: 0,
    maxDrawdown: 0, maxDrawdownPct: 0, payoffRatio: 0, avgWin: 0, avgLoss: 0,
    expectancy: 0, monthlyConsistency: 0, yearlyConsistency: 0,
    statisticalRobustness: 0,
    standOverDD: { days: 0, startDate: null, endDate: null, peakValue: 0, lowestValue: 0, currentValue: 0 },
    maxConsecWins: 0, maxConsecLosses: 0,
    totalReturnPct: 0, cagr: 0, sharpeRatio: 0, sortinoRatio: 0, calmarRatio: 0,
    riskRewardRatio: 0, avgWinAmount: 0, avgLossAmount: 0,
    closedTradeDD: { ...emptyDD }, intraDayDD: { ...emptyDD }, maxDDDetail: { ...emptyDD },
    top5Wins: [], top5Losses: [],
  };
}
