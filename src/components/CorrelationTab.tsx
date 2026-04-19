import { useAppContext } from '@/context/AppContext';
import { getCorrelationMatrix } from '@/lib/metrics';
import { formatINR } from '@/lib/format';
import { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, Trophy, TrendingDown, Minus } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts';

const STRATEGY_COLORS = ['hsl(199, 89%, 58%)', 'hsl(160, 84%, 39%)', 'hsl(38, 92%, 50%)', 'hsl(280, 65%, 60%)', 'hsl(340, 75%, 55%)', 'hsl(20, 90%, 55%)'];

export default function CorrelationTab() {
  const { files } = useAppContext();
  const [dateMode, setDateMode] = useState<'exit' | 'entry'>('exit');
  const [leaderView, setLeaderView] = useState<'monthly' | 'yearly'>('yearly');
  const [expandedYear, setExpandedYear] = useState<string | null>(null);

  const visibleFiles = files.filter(f => f.visible && f.trades.length);
  const hasEnoughFiles = visibleFiles.length >= 2;

  const corrData = useMemo(() => hasEnoughFiles ? getCorrelationMatrix(files, dateMode) : null, [files, hasEnoughFiles, dateMode]);
  const { labels, matrix, coOccurrence, monthlyByFile, sortedMonths } = corrData || { labels: [], matrix: [], coOccurrence: undefined, monthlyByFile: undefined, sortedMonths: undefined };

  const getColor = (val: number) => {
    if (val >= 0.7) return 'bg-destructive/30 text-destructive';
    if (val >= 0.3) return 'bg-warning/20 text-warning';
    if (val >= -0.3) return 'bg-secondary text-foreground';
    if (val >= -0.7) return 'bg-primary/20 text-primary';
    return 'bg-primary/30 text-primary';
  };

  // Cumulative equity curves per file + combined using proper running totals
  const equityCurveData = useMemo(() => {
    const allDatesSet = new Set<string>();
    const dateKey = (t: any) => (dateMode === 'entry' ? t.entryDate : t.exitDate).toISOString().slice(0, 10);

    // Build sorted daily P&L per file
    const fileDailyPnl = visibleFiles.map(f => {
      const dailyMap = new Map<string, number>();
      f.trades.forEach(t => {
        const key = dateKey(t);
        dailyMap.set(key, (dailyMap.get(key) || 0) + t.netPnl * f.multiplier);
        allDatesSet.add(key);
      });
      return { name: f.name, dailyMap };
    });

    const dates = Array.from(allDatesSet).sort();
    const runningTotals = new Map<string, number>();
    fileDailyPnl.forEach(f => runningTotals.set(f.name, 0));

    return dates.map(date => {
      const point: any = { date };
      let combined = 0;
      fileDailyPnl.forEach(f => {
        const dayPnl = f.dailyMap.get(date) || 0;
        const newTotal = (runningTotals.get(f.name) || 0) + dayPnl;
        runningTotals.set(f.name, newTotal);
        point[f.name] = newTotal;
        combined += newTotal;
      });
      point['COMBINED PORTFOLIO'] = combined;
      return point;
    });
  }, [visibleFiles, dateMode]);

  const activeStrategies = visibleFiles.map((f, i) => ({
    name: f.name,
    trades: f.trades.length,
    color: STRATEGY_COLORS[i % STRATEGY_COLORS.length],
  }));

  // Coincident days
  const coincidentDays = useMemo(() => {
    const dateKey = (t: any) => (dateMode === 'entry' ? t.entryDate : t.exitDate).toISOString().slice(0, 10);
    const dateSets = visibleFiles.map(f => new Set(f.trades.map(t => dateKey(t))));
    const allDates = new Set<string>();
    dateSets.forEach(s => s.forEach(d => allDates.add(d)));
    let coincident = 0;
    allDates.forEach(d => {
      const active = dateSets.filter(s => s.has(d)).length;
      if (active >= 2) coincident++;
    });
    return { totalDays: allDates.size, coincident, overlapPct: allDates.size ? ((coincident / allDates.size) * 100).toFixed(1) : '0' };
  }, [visibleFiles, dateMode]);

  // Rolling 30-day correlation
  const rollingCorrelation = useMemo(() => {
    if (visibleFiles.length < 2) return [];
    const f1 = visibleFiles[0], f2 = visibleFiles[1];
    const dateKey = (t: any) => (dateMode === 'entry' ? t.entryDate : t.exitDate).toISOString().slice(0, 10);
    const d1 = new Map<string, number>();
    const d2 = new Map<string, number>();
    f1.trades.forEach(t => { const k = dateKey(t); d1.set(k, (d1.get(k) || 0) + t.netPnl * f1.multiplier); });
    f2.trades.forEach(t => { const k = dateKey(t); d2.set(k, (d2.get(k) || 0) + t.netPnl * f2.multiplier); });
    const allDates = Array.from(new Set([...d1.keys(), ...d2.keys()])).sort();
    const window = 30;
    const result: { date: string; correlation: number }[] = [];
    for (let i = window; i < allDates.length; i++) {
      const slice = allDates.slice(i - window, i);
      const x = slice.map(d => d1.get(d) || 0);
      const y = slice.map(d => d2.get(d) || 0);
      const mx = x.reduce((a, b) => a + b, 0) / window;
      const my = y.reduce((a, b) => a + b, 0) / window;
      let num = 0, dx = 0, dy = 0;
      for (let j = 0; j < window; j++) {
        const a = x[j] - mx, b = y[j] - my;
        num += a * b; dx += a * a; dy += b * b;
      }
      const denom = Math.sqrt(dx * dy);
      result.push({ date: allDates[i], correlation: denom ? num / denom : 0 });
    }
    return result;
  }, [visibleFiles, dateMode]);

  // Drawdown synchronization analysis
  const drawdownSync = useMemo(() => {
    if (visibleFiles.length < 2) return null;
    const dateKey = (t: any) => (dateMode === 'entry' ? t.entryDate : t.exitDate).toISOString().slice(0, 10);
    
    const fileDrawdowns = visibleFiles.map(f => {
      const dailyMap = new Map<string, number>();
      f.trades.forEach(t => {
        const k = dateKey(t);
        dailyMap.set(k, (dailyMap.get(k) || 0) + t.netPnl * f.multiplier);
      });
      return { name: f.name, dailyMap };
    });

    const allDates = new Set<string>();
    fileDrawdowns.forEach(f => f.dailyMap.forEach((_, k) => allDates.add(k)));
    const sortedDates = Array.from(allDates).sort();

    // Count days where all strategies had losses simultaneously
    let syncLossDays = 0;
    let syncWinDays = 0;
    sortedDates.forEach(d => {
      const pnls = fileDrawdowns.map(f => f.dailyMap.get(d) || 0).filter(v => v !== 0);
      if (pnls.length >= 2) {
        if (pnls.every(p => p < 0)) syncLossDays++;
        if (pnls.every(p => p > 0)) syncWinDays++;
      }
    });

    return { syncLossDays, syncWinDays, totalDays: sortedDates.length };
  }, [visibleFiles, dateMode]);

  // Professional capital allocation (equal risk)
  const capitalAllocation = useMemo(() => {
    if (visibleFiles.length < 2) return null;
    const fileStats = visibleFiles.map(f => {
      const dailyPnls: number[] = [];
      const dailyMap = new Map<string, number>();
      f.trades.forEach(t => {
        const k = t.exitDate.toISOString().slice(0, 10);
        dailyMap.set(k, (dailyMap.get(k) || 0) + t.netPnl * f.multiplier);
      });
      dailyMap.forEach(v => dailyPnls.push(v));
      const mean = dailyPnls.reduce((a, b) => a + b, 0) / (dailyPnls.length || 1);
      const variance = dailyPnls.reduce((s, v) => s + (v - mean) ** 2, 0) / (dailyPnls.length || 1);
      const stdDev = Math.sqrt(variance);
      const sharpe = stdDev ? (mean / stdDev) * Math.sqrt(252) : 0;
      return { name: f.name, stdDev, sharpe, meanReturn: mean };
    });

    const totalInvStd = fileStats.reduce((s, f) => s + (f.stdDev ? 1 / f.stdDev : 0), 0);
    return fileStats.map(f => ({
      ...f,
      allocation: totalInvStd && f.stdDev ? ((1 / f.stdDev) / totalInvStd * 100).toFixed(1) : '0',
    }));
  }, [visibleFiles]);

  // Optimal Multipliers allocation
  const optimalMultipliers = useMemo(() => {
    if (visibleFiles.length < 2) return null;

    // Compute daily volatility per file
    const fileStats = visibleFiles.map(f => {
      const dailyMap = new Map<string, number>();
      f.trades.forEach(t => {
        const k = t.exitDate.toISOString().slice(0, 10);
        dailyMap.set(k, (dailyMap.get(k) || 0) + t.netPnl * f.multiplier);
      });
      const dailyPnls = Array.from(dailyMap.values());
      const mean = dailyPnls.reduce((a, b) => a + b, 0) / (dailyPnls.length || 1);
      const variance = dailyPnls.reduce((s, v) => s + (v - mean) ** 2, 0) / (dailyPnls.length || 1);
      const dailyVol = Math.sqrt(variance);
      return { name: f.name, dailyVol, currentQty: f.multiplier, dailyPnls };
    });

    // Target qty balanced by inverse volatility
    const totalInvVol = fileStats.reduce((s, f) => s + (f.dailyVol ? 1 / f.dailyVol : 0), 0);
    const avgInvVol = totalInvVol / fileStats.length;

    // Compute combined portfolio daily returns for market correlation
    const allDatesSet = new Set<string>();
    visibleFiles.forEach(f => f.trades.forEach(t => allDatesSet.add(t.exitDate.toISOString().slice(0, 10))));
    const allDates = Array.from(allDatesSet).sort();
    const combinedDaily = new Map<string, number>();
    visibleFiles.forEach(f => f.trades.forEach(t => {
      const k = t.exitDate.toISOString().slice(0, 10);
      combinedDaily.set(k, (combinedDaily.get(k) || 0) + t.netPnl * f.multiplier);
    }));

    return fileStats.map(f => {
      const targetBalanced = totalInvVol && f.dailyVol ? (1 / f.dailyVol) / avgInvVol : 1;
      const targetRounded = Math.round(targetBalanced);

      // Market correlation (beta) — correlate file daily P&L with combined portfolio
      const fileDailyMap = new Map<string, number>();
      const fileObj = visibleFiles.find(vf => vf.name === f.name)!;
      fileObj.trades.forEach(t => {
        const k = t.exitDate.toISOString().slice(0, 10);
        fileDailyMap.set(k, (fileDailyMap.get(k) || 0) + t.netPnl * fileObj.multiplier);
      });
      const commonDates = allDates.filter(d => fileDailyMap.has(d) && combinedDaily.has(d));
      let beta = NaN;
      if (commonDates.length > 5) {
        const x = commonDates.map(d => fileDailyMap.get(d) || 0);
        const y = commonDates.map(d => combinedDaily.get(d) || 0);
        const mx = x.reduce((a, b) => a + b, 0) / x.length;
        const my = y.reduce((a, b) => a + b, 0) / y.length;
        let cov = 0, varY = 0;
        for (let i = 0; i < x.length; i++) {
          cov += (x[i] - mx) * (y[i] - my);
          varY += (y[i] - my) ** 2;
        }
        beta = varY ? cov / varY : NaN;
      }

      // Professional advice
      let advice = 'Perfectly Balanced';
      let adviceColor = 'text-primary';
      if (targetBalanced > 1.1) {
        advice = 'Under-weighted (Increase)';
        adviceColor = 'text-success';
      } else if (targetBalanced < 0.9) {
        advice = 'Over-weighted (Decrease)';
        adviceColor = 'text-destructive';
      }

      return {
        name: f.name,
        dailyVol: f.dailyVol,
        currentQty: f.currentQty,
        targetBalanced,
        targetRounded,
        beta,
        advice,
        adviceColor,
      };
    });
  }, [visibleFiles]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="glass-panel text-xs py-2 px-3 !bg-card/95 backdrop-blur-md border border-border">
        <p className="text-muted-foreground mb-1 font-semibold">{label}</p>
        {payload.map((p: any, i: number) => (
          <p key={i} className="font-semibold mono" style={{ color: p.color }}>
            {p.name}: {typeof p.value === 'number' && Math.abs(p.value) > 10 ? formatINR(p.value) : p.value?.toFixed(3)}
          </p>
        ))}
      </div>
    );
  };

  if (!hasEnoughFiles) {
    return (
      <div className="text-center text-muted-foreground py-20">
        Upload at least 2 files to view correlation analysis
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header with date mode toggle */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-primary">Trading Strategy Correlation Analyzer</h2>
          <p className="text-xs text-muted-foreground">Multi-file diversification intelligence</p>
        </div>
        <div className="flex gap-1 bg-background p-1 rounded-lg border border-border">
          {['entry', 'exit'].map(v => (
            <button key={v} onClick={() => setDateMode(v as any)}
              className={`text-xs px-3 py-1 rounded-md capitalize transition-all ${
                dateMode === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >{v} Date</button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Main content - 3 cols */}
        <div className="lg:col-span-3 space-y-6">
          {/* Correlation Heatmap */}
          <div className="glass-panel">
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3 border-b border-border pb-2">
              🔥 Correlation Heatmap ({dateMode} date)
            </h3>
            <div className="overflow-x-auto">
              <table className="text-sm">
                <thead>
                  <tr>
                    <th className="py-2 px-3"></th>
                    {labels.map(l => (
                      <th key={l} className="py-2 px-3 text-[0.7rem] uppercase text-muted-foreground font-semibold max-w-[100px] truncate">{l.replace('.csv', '')}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matrix.map((row, i) => (
                    <tr key={i}>
                      <td className="py-2 px-3 text-[0.7rem] uppercase text-muted-foreground font-semibold">{labels[i].replace('.csv', '')}</td>
                      {row.map((val, j) => (
                        <td key={j} className={`py-3 px-4 mono text-center font-bold rounded ${i === j ? 'bg-primary/10 text-primary' : getColor(val)}`}>
                          {val.toFixed(2)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Cumulative Equity Curves */}
          <div className="glass-panel">
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3 border-b border-border pb-2">
              📈 Cumulative Equity Curves
            </h3>
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={equityCurveData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(217, 19%, 22%)" opacity={0.5} />
                <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'hsl(215, 20%, 65%)' }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(215, 20%, 65%)' }} tickFormatter={(v) => formatINR(v)} />
                <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'hsl(215, 20%, 65%)', strokeWidth: 1, strokeDasharray: '3 3' }} />
                <Legend />
                <Line type="monotone" dataKey="COMBINED PORTFOLIO" stroke="hsl(0, 0%, 90%)" strokeWidth={2.5} dot={false} />
                {visibleFiles.map((f, i) => (
                  <Line key={f.name} type="monotone" dataKey={f.name} stroke={STRATEGY_COLORS[i % STRATEGY_COLORS.length]} strokeWidth={1.5} dot={false} connectNulls />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Rolling 30-day Correlation */}
          {rollingCorrelation.length > 0 && (
            <div className="glass-panel">
              <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3 border-b border-border pb-2">
                📊 Rolling 30-Day Correlation ({visibleFiles[0]?.name.replace('.csv', '')} vs {visibleFiles[1]?.name.replace('.csv', '')})
              </h3>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={rollingCorrelation}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(217, 19%, 22%)" opacity={0.5} />
                  <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'hsl(215, 20%, 65%)' }} interval="preserveStartEnd" />
                  <YAxis domain={[-1, 1]} tick={{ fontSize: 10, fill: 'hsl(215, 20%, 65%)' }} />
                  <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'hsl(215, 20%, 65%)', strokeWidth: 1, strokeDasharray: '3 3' }} />
                  <ReferenceLine y={0} stroke="hsl(215, 20%, 65%)" strokeDasharray="3 3" />
                  <Line type="monotone" dataKey="correlation" stroke="hsl(199, 89%, 58%)" strokeWidth={2} dot={false} name="Correlation" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Drawdown Synchronization */}
          {drawdownSync && (
            <div className="glass-panel">
              <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3 border-b border-border pb-2">
                🔄 Drawdown Synchronization
              </h3>
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-background/50 rounded-lg p-4 text-center">
                  <div className="text-[0.65rem] uppercase text-muted-foreground mb-1">Sync Loss Days</div>
                  <div className="text-2xl font-bold mono text-destructive">{drawdownSync.syncLossDays}</div>
                  <div className="text-[0.6rem] text-muted-foreground">All strategies lost</div>
                </div>
                <div className="bg-background/50 rounded-lg p-4 text-center">
                  <div className="text-[0.65rem] uppercase text-muted-foreground mb-1">Sync Win Days</div>
                  <div className="text-2xl font-bold mono text-success">{drawdownSync.syncWinDays}</div>
                  <div className="text-[0.6rem] text-muted-foreground">All strategies won</div>
                </div>
                <div className="bg-background/50 rounded-lg p-4 text-center">
                  <div className="text-[0.65rem] uppercase text-muted-foreground mb-1">Diversification Benefit</div>
                  <div className="text-2xl font-bold mono text-primary">
                    {drawdownSync.totalDays ? ((1 - drawdownSync.syncLossDays / drawdownSync.totalDays) * 100).toFixed(1) : '0'}%
                  </div>
                  <div className="text-[0.6rem] text-muted-foreground">Days not fully correlated</div>
                </div>
              </div>
            </div>
          )}

          {/* Professional Capital Allocation */}
          {capitalAllocation && (
            <div className="glass-panel">
              <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3 border-b border-border pb-2">
                💰 Professional Capital Allocation (Risk Parity)
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[0.7rem] uppercase text-muted-foreground">
                      <th className="py-2 px-3">Strategy</th>
                      <th className="py-2 px-3">Daily Std Dev</th>
                      <th className="py-2 px-3">Sharpe Ratio</th>
                      <th className="py-2 px-3">Avg Daily Return</th>
                      <th className="py-2 px-3">Recommended Allocation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {capitalAllocation.map((ca, i) => (
                      <tr key={ca.name} className="border-t border-border/50 hover:bg-surface-hover transition-colors">
                        <td className="py-2 px-3 font-semibold flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: STRATEGY_COLORS[i % STRATEGY_COLORS.length] }} />
                          {ca.name}
                        </td>
                        <td className="py-2 px-3 mono">{formatINR(ca.stdDev)}</td>
                        <td className={`py-2 px-3 mono font-semibold ${ca.sharpe >= 1 ? 'text-success' : ca.sharpe >= 0.5 ? 'text-warning' : 'text-destructive'}`}>{ca.sharpe.toFixed(2)}</td>
                        <td className={`py-2 px-3 mono ${ca.meanReturn >= 0 ? 'text-success' : 'text-destructive'}`}>{formatINR(ca.meanReturn)}</td>
                        <td className="py-2 px-3 mono font-bold text-primary">{ca.allocation}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Optimal Multipliers */}
          {optimalMultipliers && (
            <div className="glass-panel">
              <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3 border-b border-border pb-2">
                ⚖️ Professional Capital Allocation (Optimal Multipliers)
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[0.7rem] uppercase text-muted-foreground">
                      <th className="py-2 px-3">Strategy Name</th>
                      <th className="py-2 px-3">Daily Volatility</th>
                      <th className="py-2 px-3">Current Qty</th>
                      <th className="py-2 px-3">Target Qty (Balanced)</th>
                      <th className="py-2 px-3">Target Qty (Rounded)</th>
                      <th className="py-2 px-3">Market Corr (Beta)</th>
                      <th className="py-2 px-3">Professional Advice</th>
                    </tr>
                  </thead>
                  <tbody>
                    {optimalMultipliers.map((om, i) => (
                      <tr key={om.name} className="border-t border-border/50 hover:bg-surface-hover transition-colors">
                        <td className="py-3 px-3 font-semibold flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: STRATEGY_COLORS[i % STRATEGY_COLORS.length] }} />
                          {om.name.replace('.csv', '')}
                        </td>
                        <td className="py-3 px-3 mono">{formatINR(om.dailyVol)}</td>
                        <td className="py-3 px-3">
                          <span className="mono bg-background border border-border rounded px-2 py-0.5">{om.currentQty.toFixed(2)}</span>
                          <span className="text-muted-foreground ml-1">x</span>
                        </td>
                        <td className="py-3 px-3 mono font-semibold text-primary">{om.targetBalanced.toFixed(2)}x</td>
                        <td className="py-3 px-3 mono font-bold">{om.targetRounded}</td>
                        <td className="py-3 px-3 mono text-muted-foreground">{isNaN(om.beta) ? 'N/A' : om.beta.toFixed(2)}</td>
                        <td className={`py-3 px-3 mono font-bold ${om.adviceColor}`}>{om.advice}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {coOccurrence && coOccurrence.length > 0 && (
            <div className="glass-panel">
              <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3 border-b border-border pb-2">
                Trade Co-Occurrence (Overlapping Trading Days)
              </h3>
              <div className="overflow-x-auto">
                <table className="text-sm">
                  <thead>
                    <tr>
                      <th className="py-2 px-3"></th>
                      {labels.map(l => (
                        <th key={l} className="py-2 px-3 text-[0.7rem] uppercase text-muted-foreground font-semibold">{l.replace('.csv', '')}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {coOccurrence.map((row, i) => (
                      <tr key={i}>
                        <td className="py-2 px-3 text-[0.7rem] uppercase text-muted-foreground font-semibold">{labels[i].replace('.csv', '')}</td>
                        {row.map((val, j) => (
                          <td key={j} className={`py-2 px-3 mono text-center font-semibold rounded ${i === j ? 'bg-primary/10 text-primary' : 'bg-secondary'}`}>{val}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Performance Leaders */}
          {monthlyByFile && sortedMonths && sortedMonths.length > 0 && (() => {
            // Build monthly leaders: for each month, find top, bottom, and average performer
            const monthLeaders = sortedMonths.map(month => {
              const filePerfs = monthlyByFile.map(f => ({
                name: f.name.replace('.csv', ''),
                pnl: f.data.get(month) || 0,
              })).filter(f => f.pnl !== 0);
              
              if (!filePerfs.length) return { month, top: null, bottom: null, avg: null };
              
              const sorted = [...filePerfs].sort((a, b) => b.pnl - a.pnl);
              const top = sorted[0];
              const bottom = sorted[sorted.length - 1];
              
              // Average performer: closest to mean P&L
              const mean = filePerfs.reduce((s, f) => s + f.pnl, 0) / filePerfs.length;
              const avg = filePerfs.reduce((closest, f) => 
                Math.abs(f.pnl - mean) < Math.abs(closest.pnl - mean) ? f : closest
              , filePerfs[0]);
              
              return { month, top, bottom: bottom.pnl < 0 ? bottom : null, avg, mean };
            });

            // Build yearly aggregation
            const yearlyMap = new Map<string, Map<string, number>>();
            sortedMonths.forEach(month => {
              const year = month.slice(0, 4);
              if (!yearlyMap.has(year)) yearlyMap.set(year, new Map());
              const yearData = yearlyMap.get(year)!;
              monthlyByFile.forEach(f => {
                const val = f.data.get(month) || 0;
                yearData.set(f.name, (yearData.get(f.name) || 0) + val);
              });
            });

            const yearlyLeaders = Array.from(yearlyMap.entries()).sort((a, b) => b[0].localeCompare(a[0])).map(([year, fileMap]) => {
              const filePerfs = Array.from(fileMap.entries()).map(([name, pnl]) => ({
                name: name.replace('.csv', ''),
                fullName: name,
                pnl,
              })).filter(f => f.pnl !== 0);
              
              if (!filePerfs.length) return { year, top: null, bottom: null, avg: null, filePerfs: [] };
              
              const sorted = [...filePerfs].sort((a, b) => b.pnl - a.pnl);
              const top = sorted[0];
              const bottom = sorted[sorted.length - 1];
              const mean = filePerfs.reduce((s, f) => s + f.pnl, 0) / filePerfs.length;
              const avg = filePerfs.reduce((closest, f) => 
                Math.abs(f.pnl - mean) < Math.abs(closest.pnl - mean) ? f : closest
              , filePerfs[0]);
              
              return { year, top, bottom: bottom.pnl < 0 ? bottom : null, avg, filePerfs: sorted, mean };
            });

            // Monthly leaders filtered by expanded year
            const getMonthlyForYear = (year: string) => {
              return monthLeaders.filter(m => m.month.startsWith(year));
            };

            return (
              <div className="glass-panel">
                <div className="flex items-center justify-between mb-4 border-b border-border pb-2">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-primary">
                    🏅 Performance Leaders
                  </h3>
                  <div className="flex gap-1 bg-background p-1 rounded-lg border border-border">
                    {(['yearly', 'monthly'] as const).map(v => (
                      <button key={v} onClick={() => setLeaderView(v)}
                        className={`text-xs px-3 py-1 rounded-md capitalize transition-all ${
                          leaderView === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >{v}</button>
                    ))}
                  </div>
                </div>

                {leaderView === 'yearly' ? (
                  <div className="space-y-2">
                    {yearlyLeaders.map(yl => (
                      <div key={yl.year}>
                        <div 
                          className="flex items-center gap-3 bg-background/50 rounded-lg p-3 cursor-pointer hover:bg-background/80 transition-colors"
                          onClick={() => setExpandedYear(expandedYear === yl.year ? null : yl.year)}
                        >
                          {expandedYear === yl.year ? <ChevronDown size={14} className="text-primary" /> : <ChevronRight size={14} className="text-muted-foreground" />}
                          <span className="text-sm font-bold mono text-foreground w-12">{yl.year}</span>
                          <div className="flex-1 grid grid-cols-3 gap-4">
                            {yl.top && (
                              <div className="flex items-center gap-2">
                                <Trophy size={14} className="text-success shrink-0" />
                                <div>
                                  <div className="text-xs font-bold text-success">{yl.top.name}</div>
                                  <div className="text-[0.6rem] mono text-success/80">{formatINR(yl.top.pnl)}</div>
                                </div>
                              </div>
                            )}
                            {yl.bottom && (
                              <div className="flex items-center gap-2">
                                <TrendingDown size={14} className="text-destructive shrink-0" />
                                <div>
                                  <div className="text-xs font-bold text-destructive">{yl.bottom.name}</div>
                                  <div className="text-[0.6rem] mono text-destructive/80">{formatINR(yl.bottom.pnl)}</div>
                                </div>
                              </div>
                            )}
                            {yl.avg && (
                              <div className="flex items-center gap-2">
                                <Minus size={14} className="text-warning shrink-0" />
                                <div>
                                  <div className="text-xs font-bold text-warning">{yl.avg.name}</div>
                                  <div className="text-[0.6rem] mono text-warning/80">{formatINR(yl.avg.pnl)}</div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Expanded: monthly breakdown for this year */}
                        {expandedYear === yl.year && (
                          <div className="ml-6 mt-2 space-y-1 border-l-2 border-primary/20 pl-3">
                            {getMonthlyForYear(yl.year).map(ml => (
                              <div key={ml.month} className="flex items-center gap-3 py-1.5 text-xs">
                                <span className="mono text-muted-foreground w-16">{ml.month}</span>
                                <div className="flex-1 grid grid-cols-3 gap-4">
                                  {ml.top ? (
                                    <div className="flex items-center gap-1.5">
                                      <Trophy size={11} className="text-success" />
                                      <span className="font-semibold text-success">{ml.top.name}</span>
                                      <span className="mono text-success/70 text-[0.6rem]">{formatINR(ml.top.pnl)}</span>
                                    </div>
                                  ) : <div />}
                                  {ml.bottom ? (
                                    <div className="flex items-center gap-1.5">
                                      <TrendingDown size={11} className="text-destructive" />
                                      <span className="font-semibold text-destructive">{ml.bottom.name}</span>
                                      <span className="mono text-destructive/70 text-[0.6rem]">{formatINR(ml.bottom.pnl)}</span>
                                    </div>
                                  ) : <div />}
                                  {ml.avg ? (
                                    <div className="flex items-center gap-1.5">
                                      <Minus size={11} className="text-warning" />
                                      <span className="font-semibold text-warning">{ml.avg.name}</span>
                                      <span className="mono text-warning/70 text-[0.6rem]">{formatINR(ml.avg.pnl)}</span>
                                    </div>
                                  ) : <div />}
                                </div>
                              </div>
                            ))}
                            {/* Full file ranking for this year */}
                            <div className="mt-3 pt-2 border-t border-border/30">
                              <div className="text-[0.65rem] uppercase text-muted-foreground font-semibold mb-2">Full Ranking — {yl.year}</div>
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-[0.6rem] uppercase text-muted-foreground">
                                    <th className="py-1 text-left">#</th>
                                    <th className="py-1 text-left">Strategy</th>
                                    <th className="py-1 text-right">Net P&L</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {yl.filePerfs.map((fp, idx) => (
                                    <tr key={fp.name} className="border-t border-border/20">
                                      <td className="py-1 mono text-primary font-bold">{idx + 1}</td>
                                      <td className="py-1 font-semibold">{fp.name}</td>
                                      <td className={`py-1 text-right mono font-semibold ${fp.pnl >= 0 ? 'text-success' : 'text-destructive'}`}>{formatINR(fp.pnl)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  /* Monthly view */
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-[0.7rem] uppercase text-muted-foreground">
                          <th className="py-2 px-2 text-left">Month</th>
                          <th className="py-2 px-2 text-left"><Trophy size={12} className="inline text-success mr-1" />Top</th>
                          <th className="py-2 px-2 text-right">P&L</th>
                          <th className="py-2 px-2 text-left"><TrendingDown size={12} className="inline text-destructive mr-1" />Bottom</th>
                          <th className="py-2 px-2 text-right">P&L</th>
                          <th className="py-2 px-2 text-left"><Minus size={12} className="inline text-warning mr-1" />Average</th>
                          <th className="py-2 px-2 text-right">P&L</th>
                        </tr>
                      </thead>
                      <tbody>
                        {monthLeaders.map(ml => (
                          <tr key={ml.month} className="border-t border-border/50 hover:bg-surface-hover transition-colors">
                            <td className="py-2 px-2 mono text-xs text-muted-foreground">{ml.month}</td>
                            <td className="py-2 px-2 text-xs font-bold text-success">{ml.top?.name || '-'}</td>
                            <td className="py-2 px-2 text-xs mono text-success text-right">{ml.top ? formatINR(ml.top.pnl) : '-'}</td>
                            <td className="py-2 px-2 text-xs font-bold text-destructive">{ml.bottom?.name || '-'}</td>
                            <td className="py-2 px-2 text-xs mono text-destructive text-right">{ml.bottom ? formatINR(ml.bottom.pnl) : '-'}</td>
                            <td className="py-2 px-2 text-xs font-bold text-warning">{ml.avg?.name || '-'}</td>
                            <td className="py-2 px-2 text-xs mono text-warning text-right">{ml.avg ? formatINR(ml.avg.pnl) : '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })()}

          {monthlyByFile && sortedMonths && sortedMonths.length > 0 && (
            <div className="glass-panel">
              <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3 border-b border-border pb-2">
                Monthly P&L by File
              </h3>
              <div className="overflow-x-auto">
                <table className="text-sm">
                  <thead>
                    <tr>
                      <th className="py-2 px-3 text-[0.7rem] uppercase text-muted-foreground">Month</th>
                      {monthlyByFile.map(f => (
                        <th key={f.name} className="py-2 px-3 text-[0.7rem] uppercase text-muted-foreground font-semibold">{f.name}</th>
                      ))}
                      <th className="py-2 px-3 text-[0.7rem] uppercase text-muted-foreground font-bold">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedMonths.map(month => {
                      const total = monthlyByFile.reduce((s, f) => s + (f.data.get(month) || 0), 0);
                      return (
                        <tr key={month} className="border-t border-border/50 hover:bg-surface-hover transition-colors">
                          <td className="py-2 px-3 mono text-xs">{month}</td>
                          {monthlyByFile.map(f => {
                            const val = f.data.get(month) || 0;
                            return (
                              <td key={f.name} className={`py-2 px-3 mono text-xs ${val > 0 ? 'text-success' : val < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                                {val !== 0 ? formatINR(val) : '-'}
                              </td>
                            );
                          })}
                          <td className={`py-2 px-3 mono text-xs font-bold ${total >= 0 ? 'text-success' : 'text-destructive'}`}>
                            {formatINR(total)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Active Strategies */}
          <div className="glass-panel">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Active Strategies</h3>
              <span className="bg-primary text-primary-foreground text-xs font-bold px-2 py-0.5 rounded-full">{activeStrategies.length}</span>
            </div>
            <div className="space-y-2">
              {activeStrategies.map((s) => (
                <div key={s.name} className="flex items-center gap-2 p-2 bg-background/50 rounded-lg">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold truncate">{s.name}</div>
                    <div className="text-[0.6rem] text-muted-foreground">{s.trades} trades</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Portfolio Timeline Insights */}
          <div className="glass-panel">
            <h3 className="text-sm font-bold text-primary mb-3">Portfolio Timeline</h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between"><span className="text-muted-foreground">Total Active Days:</span><span className="mono font-bold">{coincidentDays.totalDays} days</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Coincident Days:</span><span className="mono font-bold text-warning">{coincidentDays.coincident} days</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Overlap Rank:</span><span className="mono font-bold">{coincidentDays.overlapPct}%</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
