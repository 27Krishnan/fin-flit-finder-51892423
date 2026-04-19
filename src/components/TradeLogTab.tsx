import { useAppContext } from '@/context/AppContext';
import { formatINR } from '@/lib/format';
import { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Trade } from '@/lib/types';

type ViewMode = 'trades' | 'monthly' | 'monthlyFile' | 'coincident' | 'longShort';

export default function TradeLogTab() {
  const { allTrades, files } = useAppContext();
  const [viewMode, setViewMode] = useState<ViewMode>('trades');
  const [expandedYears, setExpandedYears] = useState<Set<number>>(new Set());
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
  const [directionFilter, setDirectionFilter] = useState<'long' | 'short'>('long');

  const visibleFiles = files.filter(f => f.visible && f.trades.length);

  const toggleYear = (yr: number) => {
    setExpandedYears(prev => {
      const next = new Set(prev);
      next.has(yr) ? next.delete(yr) : next.add(yr);
      return next;
    });
  };

  const toggleMonth = (key: string) => {
    setExpandedMonths(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  // Get file breakdown for a specific month
  const getFileBreakdownForMonth = (year: number, month: number) => {
    return visibleFiles.map(f => {
      const trades = f.trades.filter(t => t.exitDate.getFullYear() === year && t.exitDate.getMonth() === month);
      if (!trades.length) return null;
      const pnl = trades.reduce((s, t) => s + (t.netPnl * f.multiplier) - (t.posValue * f.multiplier * f.slippage / 100), 0);
      const wins = trades.filter(t => t.isWin).length;
      const runUp = Math.max(...trades.map(t => t.runUp), 0);
      const drawdown = Math.min(...trades.map(t => -Math.abs(t.drawdown)), 0);
      return { name: f.name, trades: trades.length, wins, losses: trades.length - wins, pnl, runUp, drawdown };
    }).filter(Boolean) as { name: string; trades: number; wins: number; losses: number; pnl: number; runUp: number; drawdown: number }[];
  };

  // Monthly Breakdown grouped by year
  const monthlyBreakdown = useMemo(() => {
    const yearMap = new Map<number, Map<number, { pnl: number; cumPnl: number; count: number; wins: number; losses: number; runUp: number; drawdown: number }>>();
    let cumPnl = 0;
    const monthCums = new Map<string, number>();

    // First pass: aggregate
    allTrades.forEach(t => {
      const yr = t.exitDate.getFullYear();
      const mo = t.exitDate.getMonth();
      if (!yearMap.has(yr)) yearMap.set(yr, new Map());
      const mMap = yearMap.get(yr)!;
      if (!mMap.has(mo)) mMap.set(mo, { pnl: 0, cumPnl: 0, count: 0, wins: 0, losses: 0, runUp: 0, drawdown: 0 });
      const m = mMap.get(mo)!;
      m.pnl += t.netPnl;
      m.count++;
      if (t.isWin) m.wins++; else m.losses++;
      m.runUp = Math.max(m.runUp, t.runUp);
      m.drawdown = Math.min(m.drawdown, -Math.abs(t.drawdown));
      cumPnl += t.netPnl;
      monthCums.set(`${yr}-${mo}`, cumPnl);
    });

    // Build year summaries - sorted descending
    const years = Array.from(yearMap.keys()).sort((a, b) => b - a);
    return years.map(yr => {
      const months = yearMap.get(yr)!;
      const totalPnl = Array.from(months.values()).reduce((s, m) => s + m.pnl, 0);
      const totalCount = Array.from(months.values()).reduce((s, m) => s + m.count, 0);
      const totalWins = Array.from(months.values()).reduce((s, m) => s + m.wins, 0);
      const totalLosses = Array.from(months.values()).reduce((s, m) => s + m.losses, 0);
      const winRate = totalCount ? (totalWins / totalCount) * 100 : 0;
      // Sort months descending (latest month first)
      const monthArr = Array.from(months.entries())
        .sort(([a], [b]) => b - a)
        .map(([mo, data]) => ({
          month: mo,
          ...data,
          cumPnl: monthCums.get(`${yr}-${mo}`) || 0,
          winRate: data.count ? (data.wins / data.count) * 100 : 0,
        }));
      return { year: yr, totalPnl, totalCount, totalWins, totalLosses, winRate, months: monthArr };
    });
  }, [allTrades]);

  // Monthly P&L by File
  const monthlyByFile = useMemo(() => {
    const yearMap = new Map<number, Map<string, Map<number, { pnl: number; trades: number; wins: number }>>>();
    visibleFiles.forEach(f => {
      f.trades.forEach(t => {
        const yr = t.exitDate.getFullYear();
        const mo = t.exitDate.getMonth();
        if (!yearMap.has(yr)) yearMap.set(yr, new Map());
        const fMap = yearMap.get(yr)!;
        if (!fMap.has(f.name)) fMap.set(f.name, new Map());
        const mMap = fMap.get(f.name)!;
        const existing = mMap.get(mo) || { pnl: 0, trades: 0, wins: 0 };
        existing.pnl += (t.netPnl * f.multiplier) - (t.posValue * f.multiplier * f.slippage / 100);
        existing.trades++;
        if (t.isWin) existing.wins++;
        mMap.set(mo, existing);
      });
    });

    const years = Array.from(yearMap.keys()).sort((a, b) => b - a);
    return years.map(yr => {
      const fMap = yearMap.get(yr)!;
      const totalByMonth = new Map<number, { pnl: number; trades: number; wins: number }>();
      const fileData = visibleFiles.map(f => {
        const mMap = fMap.get(f.name) || new Map<number, { pnl: number; trades: number; wins: number }>();
        const months: { mo: number; pnl: number; trades: number; wins: number }[] = [];
        for (let i = 0; i < 12; i++) {
          const data = mMap.get(i) || { pnl: 0, trades: 0, wins: 0 };
          months.push({ mo: i, ...data });
          const existing = totalByMonth.get(i) || { pnl: 0, trades: 0, wins: 0 };
          existing.pnl += data.pnl;
          existing.trades += data.trades;
          existing.wins += data.wins;
          totalByMonth.set(i, existing);
        }
        const totalPnl = months.reduce((s, m) => s + m.pnl, 0);
        return { name: f.name, months, totalPnl };
      });
      const totalPnl = fileData.reduce((s, f) => s + f.totalPnl, 0);
      return { year: yr, fileData, totalPnl, totalByMonth };
    });
  }, [visibleFiles]);

  // Coincident Dates Analysis
  const coincidentDates = useMemo(() => {
    if (visibleFiles.length < 2) return [];
    const dateFileMap = new Map<string, { files: string[]; totalPnl: number; details: { name: string; pnl: number }[] }>();
    visibleFiles.forEach(f => {
      f.trades.forEach(t => {
        const key = t.exitDate.toISOString().slice(0, 10);
        if (!dateFileMap.has(key)) dateFileMap.set(key, { files: [], totalPnl: 0, details: [] });
        const entry = dateFileMap.get(key)!;
        const pnl = (t.netPnl * f.multiplier) - (t.posValue * f.multiplier * f.slippage / 100);
        if (!entry.files.includes(f.name)) entry.files.push(f.name);
        entry.totalPnl += pnl;
        entry.details.push({ name: f.name, pnl });
      });
    });

    // Group by year
    const yearMap = new Map<number, { date: string; totalPnl: number; fileCount: number; details: { name: string; pnl: number }[] }[]>();
    dateFileMap.forEach((val, date) => {
      if (val.files.length >= 2) {
        const yr = parseInt(date.slice(0, 4));
        if (!yearMap.has(yr)) yearMap.set(yr, []);
        yearMap.get(yr)!.push({ date, totalPnl: val.totalPnl, fileCount: val.files.length, details: val.details });
      }
    });

    return Array.from(yearMap.entries())
      .sort(([a], [b]) => b - a)
      .map(([year, dates]) => ({
        year,
        dates: dates.sort((a, b) => b.date.localeCompare(a.date)), // Descending
        totalPnl: dates.reduce((s, d) => s + d.totalPnl, 0),
        count: dates.length,
      }));
  }, [visibleFiles]);

  // Long/Short Breakdown
  const longShortBreakdown = useMemo(() => {
    const filtered = allTrades.filter(t => t.direction === directionFilter);
    const yearMap = new Map<number, Map<number, { pnl: number; cumPnl: number; count: number; wins: number; losses: number; runUp: number; drawdown: number; trades: Trade[] }>>();
    let cumPnl = 0;
    const monthCums = new Map<string, number>();

    // Sort chronologically for cumulative
    const sorted = [...filtered].sort((a, b) => a.exitDate.getTime() - b.exitDate.getTime());
    sorted.forEach(t => {
      const yr = t.exitDate.getFullYear();
      const mo = t.exitDate.getMonth();
      if (!yearMap.has(yr)) yearMap.set(yr, new Map());
      const mMap = yearMap.get(yr)!;
      if (!mMap.has(mo)) mMap.set(mo, { pnl: 0, cumPnl: 0, count: 0, wins: 0, losses: 0, runUp: 0, drawdown: 0, trades: [] });
      const m = mMap.get(mo)!;
      m.pnl += t.netPnl;
      m.count++;
      if (t.isWin) m.wins++; else m.losses++;
      m.runUp = Math.max(m.runUp, t.runUp);
      m.drawdown = Math.min(m.drawdown, -Math.abs(t.drawdown));
      m.trades.push(t);
      cumPnl += t.netPnl;
      monthCums.set(`${yr}-${mo}`, cumPnl);
    });

    const totalCount = filtered.length;
    const totalWins = filtered.filter(t => t.isWin).length;
    const totalPnl = filtered.reduce((s, t) => s + t.netPnl, 0);

    const years = Array.from(yearMap.keys()).sort((a, b) => b - a);
    const yearData = years.map(yr => {
      const months = yearMap.get(yr)!;
      const yrPnl = Array.from(months.values()).reduce((s, m) => s + m.pnl, 0);
      const yrCount = Array.from(months.values()).reduce((s, m) => s + m.count, 0);
      const yrWins = Array.from(months.values()).reduce((s, m) => s + m.wins, 0);
      const yrLosses = Array.from(months.values()).reduce((s, m) => s + m.losses, 0);
      const winRate = yrCount ? (yrWins / yrCount) * 100 : 0;
      const monthArr = Array.from(months.entries())
        .sort(([a], [b]) => b - a)
        .map(([mo, data]) => ({
          month: mo,
          ...data,
          cumPnl: monthCums.get(`${yr}-${mo}`) || 0,
          winRate: data.count ? (data.wins / data.count) * 100 : 0,
        }));
      return { year: yr, totalPnl: yrPnl, totalCount: yrCount, totalWins: yrWins, totalLosses: yrLosses, winRate, months: monthArr };
    });

    return { totalCount, totalWins, totalLosses: totalCount - totalWins, totalPnl, winRate: totalCount ? (totalWins / totalCount) * 100 : 0, years: yearData };
  }, [allTrades, directionFilter]);

  const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  if (!allTrades.length) return <div className="text-center text-muted-foreground py-20">Upload data to view trade log</div>;

  return (
    <div className="space-y-4 animate-fade-in">
      {/* View mode tabs */}
      <div className="flex gap-1 bg-background p-0.5 rounded-lg border border-border w-fit">
        {([
          { v: 'trades' as ViewMode, l: 'Trade Log' },
          { v: 'monthly' as ViewMode, l: 'Monthly Breakdown' },
          { v: 'monthlyFile' as ViewMode, l: 'Monthly P&L by File' },
          { v: 'coincident' as ViewMode, l: 'Coincident Dates' },
          { v: 'longShort' as ViewMode, l: 'Long / Short' },
        ]).map(({ v, l }) => (
          <button key={v} onClick={() => setViewMode(v)}
            className={`text-sm px-3 py-1.5 rounded font-medium transition-all ${viewMode === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >{l}</button>
        ))}
      </div>

      {/* Trade Log View */}
      {viewMode === 'trades' && (
        <div className="glass-panel">
          <div className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-2 border-b border-border pb-2">
            Trade Log ({allTrades.length} trades)
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-muted-foreground font-semibold">
                  <th className="py-2 px-2">#</th>
                  <th className="py-2 px-2">Entry</th>
                  <th className="py-2 px-2">Exit</th>
                  <th className="py-2 px-2">Dir</th>
                  <th className="py-2 px-2">Entry₹</th>
                  <th className="py-2 px-2">Exit₹</th>
                  <th className="py-2 px-2">Qty</th>
                  <th className="py-2 px-2">Net P&L</th>
                  <th className="py-2 px-2">%</th>
                  <th className="py-2 px-2">RunUp</th>
                  <th className="py-2 px-2">DD</th>
                  <th className="py-2 px-2">Cum P&L</th>
                  <th className="py-2 px-2">File</th>
                </tr>
              </thead>
              <tbody>
                {allTrades.map((t, i) => (
                  <tr key={i} className="border-t border-border/50 hover:bg-surface-hover transition-colors">
                    <td className="py-2 px-2 mono text-muted-foreground">{t.tradeNum}</td>
                    <td className="py-2 px-2 mono text-xs">{t.entryDate.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                    <td className="py-2 px-2 mono text-xs">{t.exitDate.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                    <td className="py-2 px-2">
                      <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${t.direction === 'long' ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>
                        {t.direction === 'long' ? 'L' : 'S'}
                      </span>
                    </td>
                    <td className="py-2 px-2 mono">{t.entryPrice.toFixed(2)}</td>
                    <td className="py-2 px-2 mono">{t.exitPrice.toFixed(2)}</td>
                    <td className="py-2 px-2 mono">{t.qty}</td>
                    <td className={`py-2 px-2 mono font-semibold ${t.netPnl >= 0 ? 'text-success' : 'text-destructive'}`}>{formatINR(t.netPnl)}</td>
                    <td className={`py-2 px-2 mono ${t.netPnlPct >= 0 ? 'text-success' : 'text-destructive'}`}>{t.netPnlPct.toFixed(2)}%</td>
                    <td className="py-2 px-2 mono text-success">{formatINR(t.runUp)}</td>
                    <td className="py-2 px-2 mono text-destructive">{formatINR(t.drawdown)}</td>
                    <td className={`py-2 px-2 mono ${t.cumPnl >= 0 ? 'text-success' : 'text-destructive'}`}>{formatINR(t.cumPnl)}</td>
                    <td className="py-2 px-2 text-xs text-muted-foreground truncate max-w-[80px]">{t.fileName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Monthly Breakdown */}
      {viewMode === 'monthly' && (
        <div className="glass-panel">
          <div className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-2 border-b border-border pb-2">
            Monthly Breakdown
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-muted-foreground font-semibold">
                  <th className="py-2 px-2 w-6"></th>
                  <th className="py-2 px-2">Month</th>
                  <th className="py-2 px-2 text-right">Net P&L</th>
                  <th className="py-2 px-2 text-right">Cum P&L</th>
                  <th className="py-2 px-2 text-right">Count</th>
                  <th className="py-2 px-2 text-right">Wins</th>
                  <th className="py-2 px-2 text-right">Losses</th>
                  <th className="py-2 px-2 text-right">Win%</th>
                  <th className="py-2 px-2 text-right">Run-Up</th>
                  <th className="py-2 px-2 text-right">Drawdown</th>
                </tr>
              </thead>
              <tbody>
                {monthlyBreakdown.map(yr => {
                  const isYearExp = expandedYears.has(yr.year);
                  return (
                    <>
                      <tr
                        key={yr.year}
                        className="border-t border-border cursor-pointer hover:bg-surface-hover transition-colors"
                        onClick={() => toggleYear(yr.year)}
                      >
                        <td className="py-2 px-2">
                          {isYearExp ? <ChevronDown size={14} className="text-primary" /> : <ChevronRight size={14} className="text-muted-foreground" />}
                        </td>
                        <td className="py-2 px-2 font-bold text-sm">{yr.year} <span className="text-muted-foreground font-normal">({yr.totalCount} trades)</span></td>
                        <td className={`py-2 px-2 mono font-bold text-right ${yr.totalPnl >= 0 ? 'text-success' : 'text-destructive'}`}>{formatINR(yr.totalPnl)}</td>
                        <td className="py-2 px-2 mono text-muted-foreground text-right">-</td>
                        <td className="py-2 px-2 mono text-right">{yr.totalCount}</td>
                        <td className="py-2 px-2 mono text-success text-right">{yr.totalWins}</td>
                        <td className="py-2 px-2 mono text-destructive text-right">{yr.totalLosses}</td>
                        <td className={`py-2 px-2 mono font-semibold text-right ${yr.winRate >= 50 ? 'text-success' : 'text-destructive'}`}>{yr.winRate.toFixed(1)}%</td>
                        <td className="py-2 px-2 mono text-right">-</td>
                        <td className="py-2 px-2 mono text-right">-</td>
                      </tr>
                      {isYearExp && yr.months.map(mo => {
                        const monthKey = `${yr.year}-${mo.month}`;
                        const isMonthExp = expandedMonths.has(monthKey);
                        const fileBreakdown = isMonthExp ? getFileBreakdownForMonth(yr.year, mo.month) : [];
                        const hasMultipleFiles = visibleFiles.length > 1;

                        return (
                          <>
                            <tr 
                              key={monthKey} 
                              className={`border-t border-border/30 bg-background/30 ${hasMultipleFiles ? 'cursor-pointer hover:bg-surface-hover' : ''}`}
                              onClick={hasMultipleFiles ? () => toggleMonth(monthKey) : undefined}
                            >
                              <td className="py-2 px-2 pl-4">
                                {hasMultipleFiles && (
                                  isMonthExp ? <ChevronDown size={12} className="text-primary" /> : <ChevronRight size={12} className="text-muted-foreground" />
                                )}
                              </td>
                              <td className="py-2 px-2 mono font-semibold">{MONTH_NAMES[mo.month]}</td>
                              <td className={`py-2 px-2 mono font-semibold text-right ${mo.pnl >= 0 ? 'text-success' : 'text-destructive'}`}>{formatINR(mo.pnl)}</td>
                              <td className={`py-2 px-2 mono text-right ${mo.cumPnl >= 0 ? 'text-success' : 'text-destructive'}`}>{formatINR(mo.cumPnl)}</td>
                              <td className="py-2 px-2 mono text-right">{mo.count}</td>
                              <td className="py-2 px-2 mono text-success text-right">{mo.wins}</td>
                              <td className="py-2 px-2 mono text-destructive text-right">{mo.losses}</td>
                              <td className={`py-2 px-2 mono text-right ${mo.winRate >= 50 ? 'text-success' : 'text-destructive'}`}>{mo.winRate.toFixed(1)}%</td>
                              <td className="py-2 px-2 mono text-success text-right">{mo.runUp > 0 ? formatINR(mo.runUp) : '-'}</td>
                              <td className="py-2 px-2 mono text-destructive text-right">{mo.drawdown < 0 ? formatINR(mo.drawdown) : '-'}</td>
                            </tr>
                            {isMonthExp && fileBreakdown.map(fb => (
                              <tr key={`${monthKey}-${fb.name}`} className="border-t border-border/10 bg-muted/5">
                                <td className="py-1.5 px-2"></td>
                                <td className="py-1.5 px-2 pl-8 text-xs text-muted-foreground truncate">{fb.name}</td>
                                <td className={`py-1.5 px-2 mono text-xs text-right ${fb.pnl >= 0 ? 'text-success' : 'text-destructive'}`}>{formatINR(fb.pnl)}</td>
                                <td className="py-1.5 px-2 mono text-xs text-muted-foreground text-right">-</td>
                                <td className="py-1.5 px-2 mono text-xs text-right">{fb.trades}</td>
                                <td className="py-1.5 px-2 mono text-xs text-success text-right">{fb.wins}</td>
                                <td className="py-1.5 px-2 mono text-xs text-destructive text-right">{fb.losses}</td>
                                <td className={`py-1.5 px-2 mono text-xs text-right ${fb.trades ? (fb.wins / fb.trades * 100) >= 50 ? 'text-success' : 'text-destructive' : 'text-muted-foreground'}`}>
                                  {fb.trades ? (fb.wins / fb.trades * 100).toFixed(0) : 0}%
                                </td>
                                <td className="py-1.5 px-2 mono text-xs text-success text-right">{fb.runUp > 0 ? formatINR(fb.runUp) : '-'}</td>
                                <td className="py-1.5 px-2 mono text-xs text-destructive text-right">{fb.drawdown < 0 ? formatINR(fb.drawdown) : '-'}</td>
                              </tr>
                            ))}
                          </>
                        );
                      })}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Monthly P&L by File */}
      {viewMode === 'monthlyFile' && (
        <div className="glass-panel">
          <div className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-2 border-b border-border pb-2">
            Monthly P&L by File
          </div>
          {monthlyByFile.map(yr => {
            const isYearExp = expandedYears.has(yr.year);
            return (
              <div key={yr.year} className="mb-2">
                <div
                  className="flex items-center gap-2 py-2 cursor-pointer hover:bg-surface-hover transition-colors rounded px-2"
                  onClick={() => toggleYear(yr.year)}
                >
                  {isYearExp ? <ChevronDown size={14} className="text-primary" /> : <ChevronRight size={14} className="text-muted-foreground" />}
                  <span className="font-bold text-sm">{yr.year}</span>
                  <span className={`mono text-sm font-semibold ${yr.totalPnl >= 0 ? 'text-success' : 'text-destructive'}`}>{formatINR(yr.totalPnl)}</span>
                </div>
                {isYearExp && (
                  <div className="overflow-x-auto ml-4">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs uppercase text-muted-foreground font-semibold">
                          <th className="py-2 px-2 w-6"></th>
                          <th className="py-2 px-2">Month</th>
                          <th className="py-2 px-2 text-right">Total P&L</th>
                          <th className="py-2 px-2 text-right">Trades</th>
                          <th className="py-2 px-2 text-right">Win%</th>
                          {visibleFiles.map(f => (
                            <th key={f.name} className="py-2 px-2 text-right truncate max-w-[100px]">{f.name.replace('.csv', '')}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {Array.from({ length: 12 }, (_, i) => 11 - i).filter(mo => {
                          return yr.fileData.some(fd => fd.months[mo]?.pnl !== 0);
                        }).map(mo => {
                          const monthKey = `file-${yr.year}-${mo}`;
                          const totalData = yr.totalByMonth.get(mo) || { pnl: 0, trades: 0, wins: 0 };
                          const isMonthExp = expandedMonths.has(monthKey);
                          const winRate = totalData.trades ? (totalData.wins / totalData.trades) * 100 : 0;

                          return (
                            <>
                              <tr 
                                key={mo} 
                                className="border-t border-border/30 cursor-pointer hover:bg-surface-hover transition-colors"
                                onClick={() => toggleMonth(monthKey)}
                              >
                                <td className="py-2 px-2">
                                  {isMonthExp ? <ChevronDown size={12} className="text-primary" /> : <ChevronRight size={12} className="text-muted-foreground" />}
                                </td>
                                <td className="py-2 px-2 mono font-semibold">{MONTH_NAMES[mo]}</td>
                                <td className={`py-2 px-2 mono font-semibold text-right ${totalData.pnl >= 0 ? 'text-success' : 'text-destructive'}`}>{formatINR(totalData.pnl)}</td>
                                <td className="py-2 px-2 mono text-right">{totalData.trades}</td>
                                <td className={`py-2 px-2 mono text-right ${winRate >= 50 ? 'text-success' : 'text-destructive'}`}>{winRate.toFixed(0)}%</td>
                                {yr.fileData.map(fd => {
                                  const val = fd.months[mo]?.pnl || 0;
                                  return (
                                    <td key={fd.name} className={`py-2 px-2 mono text-right ${val > 0 ? 'text-success' : val < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                                      {val !== 0 ? formatINR(val) : '-'}
                                    </td>
                                  );
                                })}
                              </tr>
                              {isMonthExp && (
                                <tr className="border-t border-border/10 bg-muted/5">
                                  <td colSpan={5 + visibleFiles.length} className="py-2 px-4">
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                                      {yr.fileData.filter(fd => fd.months[mo]?.trades > 0).map(fd => {
                                        const data = fd.months[mo];
                                        const fWinRate = data.trades ? (data.wins / data.trades) * 100 : 0;
                                        return (
                                          <div key={fd.name} className="bg-background/50 rounded p-2 border border-border/30">
                                            <div className="font-semibold text-foreground truncate mb-1">{fd.name.replace('.csv', '')}</div>
                                            <div className="flex gap-3 text-muted-foreground">
                                              <span>Trades: <span className="text-foreground">{data.trades}</span></span>
                                              <span>Wins: <span className="text-success">{data.wins}</span></span>
                                              <span>Win%: <span className={fWinRate >= 50 ? 'text-success' : 'text-destructive'}>{fWinRate.toFixed(0)}%</span></span>
                                            </div>
                                            <div className={`mono font-semibold mt-1 ${data.pnl >= 0 ? 'text-success' : 'text-destructive'}`}>{formatINR(data.pnl)}</div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Coincident Dates */}
      {viewMode === 'coincident' && (
        <div className="glass-panel">
          <div className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-1 border-b border-border pb-2">
            Coincident Dates Analysis (Multiple Files)
          </div>
          <p className="text-xs text-muted-foreground mb-3">Dates where trades occurred in more than one file simultaneously.</p>
          {coincidentDates.length === 0 ? (
            <div className="text-center text-muted-foreground py-8 text-sm">Upload at least 2 files to see coincident dates</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-muted-foreground font-semibold">
                    <th className="py-2 px-2"></th>
                    <th className="py-2 px-2">Date</th>
                    <th className="py-2 px-2">Total P&L</th>
                    <th className="py-2 px-2">File Count</th>
                    <th className="py-2 px-2">File Breakdown</th>
                  </tr>
                </thead>
                <tbody>
                  {coincidentDates.map(yr => {
                    const isExp = expandedYears.has(yr.year);
                    return (
                      <>
                        <tr
                          key={yr.year}
                          className="border-t border-border cursor-pointer hover:bg-surface-hover transition-colors"
                          onClick={() => toggleYear(yr.year)}
                        >
                          <td className="py-2 px-2">
                            {isExp ? <ChevronDown size={14} className="text-primary" /> : <ChevronRight size={14} className="text-muted-foreground" />}
                          </td>
                          <td className="py-2 px-2 font-bold">{yr.year} <span className="text-muted-foreground font-normal">({yr.count} coincident days)</span></td>
                          <td className={`py-2 px-2 mono font-bold ${yr.totalPnl >= 0 ? 'text-success' : 'text-destructive'}`}>{formatINR(yr.totalPnl)}</td>
                          <td className="py-2 px-2 mono">-</td>
                          <td className="py-2 px-2">-</td>
                        </tr>
                        {isExp && yr.dates.map(d => (
                          <tr key={d.date} className="border-t border-border/30 bg-background/30">
                            <td className="py-2 px-2"></td>
                            <td className="py-2 px-2 mono">{d.date}</td>
                            <td className={`py-2 px-2 mono font-semibold ${d.totalPnl >= 0 ? 'text-success' : 'text-destructive'}`}>{formatINR(d.totalPnl)}</td>
                            <td className="py-2 px-2 mono">{d.fileCount}</td>
                            <td className="py-2 px-2">
                              <div className="flex flex-wrap gap-1">
                                {d.details.map((det, i) => (
                                  <span key={i} className={`text-xs px-1.5 py-0.5 rounded ${det.pnl >= 0 ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>
                                    {det.name.replace('.csv', '')}: {formatINR(det.pnl)}
                                  </span>
                                ))}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Long / Short Analysis */}
      {viewMode === 'longShort' && (
        <div className="glass-panel">
          <div className="flex flex-wrap items-center gap-4 mb-4">
            <div className="flex gap-1 bg-muted p-0.5 rounded-lg">
              <button
                onClick={() => setDirectionFilter('long')}
                className={`text-sm px-4 py-1.5 rounded font-semibold transition-all ${directionFilter === 'long' ? 'bg-success text-success-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              >Long</button>
              <button
                onClick={() => setDirectionFilter('short')}
                className={`text-sm px-4 py-1.5 rounded font-semibold transition-all ${directionFilter === 'short' ? 'bg-destructive text-destructive-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              >Short</button>
            </div>
            <div className="flex flex-wrap gap-4 text-sm">
              <span className="text-muted-foreground">Trades: <span className="text-foreground font-semibold">{longShortBreakdown.totalCount}</span></span>
              <span className="text-muted-foreground">Wins: <span className="text-success font-semibold">{longShortBreakdown.totalWins}</span></span>
              <span className="text-muted-foreground">Losses: <span className="text-destructive font-semibold">{longShortBreakdown.totalLosses}</span></span>
              <span className="text-muted-foreground">Win%: <span className={`font-semibold ${longShortBreakdown.winRate >= 50 ? 'text-success' : 'text-destructive'}`}>{longShortBreakdown.winRate.toFixed(1)}%</span></span>
              <span className="text-muted-foreground">Net P&L: <span className={`font-bold ${longShortBreakdown.totalPnl >= 0 ? 'text-success' : 'text-destructive'}`}>{formatINR(longShortBreakdown.totalPnl)}</span></span>
            </div>
          </div>

          {longShortBreakdown.totalCount === 0 ? (
            <div className="text-center text-muted-foreground py-8 text-sm">No {directionFilter} trades found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-muted-foreground font-semibold">
                    <th className="py-2 px-2 w-6"></th>
                    <th className="py-2 px-2">Period</th>
                    <th className="py-2 px-2 text-right">Net P&L</th>
                    <th className="py-2 px-2 text-right">Cum P&L</th>
                    <th className="py-2 px-2 text-right">Count</th>
                    <th className="py-2 px-2 text-right">Wins</th>
                    <th className="py-2 px-2 text-right">Losses</th>
                    <th className="py-2 px-2 text-right">Win%</th>
                    <th className="py-2 px-2 text-right">Run-Up</th>
                    <th className="py-2 px-2 text-right">Drawdown</th>
                  </tr>
                </thead>
                <tbody>
                  {longShortBreakdown.years.map(yr => {
                    const isYearExp = expandedYears.has(yr.year);
                    return (
                      <>
                        <tr
                          key={`ls-${yr.year}`}
                          className="border-t border-border cursor-pointer hover:bg-surface-hover transition-colors"
                          onClick={() => toggleYear(yr.year)}
                        >
                          <td className="py-2 px-2">
                            {isYearExp ? <ChevronDown size={14} className="text-primary" /> : <ChevronRight size={14} className="text-muted-foreground" />}
                          </td>
                          <td className="py-2 px-2 font-bold text-sm">{yr.year} <span className="text-muted-foreground font-normal">({yr.totalCount} trades)</span></td>
                          <td className={`py-2 px-2 mono font-bold text-right ${yr.totalPnl >= 0 ? 'text-success' : 'text-destructive'}`}>{formatINR(yr.totalPnl)}</td>
                          <td className="py-2 px-2 mono text-muted-foreground text-right">-</td>
                          <td className="py-2 px-2 mono text-right">{yr.totalCount}</td>
                          <td className="py-2 px-2 mono text-success text-right">{yr.totalWins}</td>
                          <td className="py-2 px-2 mono text-destructive text-right">{yr.totalLosses}</td>
                          <td className={`py-2 px-2 mono font-semibold text-right ${yr.winRate >= 50 ? 'text-success' : 'text-destructive'}`}>{yr.winRate.toFixed(1)}%</td>
                          <td className="py-2 px-2 mono text-right">-</td>
                          <td className="py-2 px-2 mono text-right">-</td>
                        </tr>
                        {isYearExp && yr.months.map(mo => {
                          const monthKey = `ls-${yr.year}-${mo.month}`;
                          const isMonthExp = expandedMonths.has(monthKey);
                          return (
                            <>
                              <tr
                                key={monthKey}
                                className="border-t border-border/30 bg-background/30 cursor-pointer hover:bg-surface-hover transition-colors"
                                onClick={() => toggleMonth(monthKey)}
                              >
                                <td className="py-2 px-2 pl-4">
                                  {isMonthExp ? <ChevronDown size={12} className="text-primary" /> : <ChevronRight size={12} className="text-muted-foreground" />}
                                </td>
                                <td className="py-2 px-2 mono font-semibold">{MONTH_NAMES[mo.month]}</td>
                                <td className={`py-2 px-2 mono font-semibold text-right ${mo.pnl >= 0 ? 'text-success' : 'text-destructive'}`}>{formatINR(mo.pnl)}</td>
                                <td className={`py-2 px-2 mono text-right ${mo.cumPnl >= 0 ? 'text-success' : 'text-destructive'}`}>{formatINR(mo.cumPnl)}</td>
                                <td className="py-2 px-2 mono text-right">{mo.count}</td>
                                <td className="py-2 px-2 mono text-success text-right">{mo.wins}</td>
                                <td className="py-2 px-2 mono text-destructive text-right">{mo.losses}</td>
                                <td className={`py-2 px-2 mono text-right ${mo.winRate >= 50 ? 'text-success' : 'text-destructive'}`}>{mo.winRate.toFixed(1)}%</td>
                                <td className="py-2 px-2 mono text-success text-right">{mo.runUp > 0 ? formatINR(mo.runUp) : '-'}</td>
                                <td className="py-2 px-2 mono text-destructive text-right">{mo.drawdown < 0 ? formatINR(mo.drawdown) : '-'}</td>
                              </tr>
                              {isMonthExp && mo.trades.map((t, idx) => (
                                <tr key={`ls-t-${idx}`} className="border-t border-border/10 bg-muted/5">
                                  <td className="py-1.5 px-2"></td>
                                  <td className="py-1.5 px-2 pl-8 mono text-xs">
                                    {t.exitDate.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}
                                    <span className="text-muted-foreground ml-2">{t.fileName?.replace('.csv', '')}</span>
                                  </td>
                                  <td className={`py-1.5 px-2 mono text-xs text-right ${t.netPnl >= 0 ? 'text-success' : 'text-destructive'}`}>{formatINR(t.netPnl)}</td>
                                  <td className={`py-1.5 px-2 mono text-xs text-right ${t.cumPnl >= 0 ? 'text-success' : 'text-destructive'}`}>{formatINR(t.cumPnl)}</td>
                                  <td className="py-1.5 px-2 mono text-xs text-right">1</td>
                                  <td className="py-1.5 px-2 mono text-xs text-success text-right">{t.isWin ? '1' : '-'}</td>
                                  <td className="py-1.5 px-2 mono text-xs text-destructive text-right">{!t.isWin ? '1' : '-'}</td>
                                  <td className="py-1.5 px-2 mono text-xs text-right">-</td>
                                  <td className="py-1.5 px-2 mono text-xs text-success text-right">{t.runUp > 0 ? formatINR(t.runUp) : '-'}</td>
                                  <td className="py-1.5 px-2 mono text-xs text-destructive text-right">{t.drawdown !== 0 ? formatINR(-Math.abs(t.drawdown)) : '-'}</td>
                                </tr>
                              ))}
                            </>
                          );
                        })}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
