import { useAppContext } from '@/context/AppContext';
import { getYearOverview } from '@/lib/metrics';
import { formatINR } from '@/lib/format';
import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function YearOverviewTab() {
  const { allTrades, files } = useAppContext();
  const [expandedYear, setExpandedYear] = useState<number | null>(null);
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);

  if (!allTrades.length) return <div className="text-center text-muted-foreground py-20">Upload data to view year overview</div>;

  const years = getYearOverview(allTrades);
  const visibleFiles = files.filter(f => f.visible && f.trades.length);

  const toggleYear = (year: number) => {
    setExpandedYear(prev => prev === year ? null : year);
    setExpandedMonth(null);
  };

  const toggleMonth = (key: string) => {
    setExpandedMonth(prev => prev === key ? null : key);
  };

  const getFileBreakdown = (year: number, month: number) => {
    return visibleFiles.map(f => {
      const trades = f.trades.filter(t => t.exitDate.getFullYear() === year && t.exitDate.getMonth() === month);
      if (!trades.length) return null;
      const pnl = trades.reduce((s, t) => s + t.netPnl * f.multiplier, 0);
      const wins = trades.filter(t => t.isWin).length;
      return { name: f.name, trades: trades.length, wins, losses: trades.length - wins, pnl };
    }).filter(Boolean) as { name: string; trades: number; wins: number; losses: number; pnl: number }[];
  };

  const yearGrid = '1fr 100px 100px 100px 60px 90px 90px';
  const monthGrid = '1fr 80px 80px 80px 70px 110px';

  return (
    <div className="space-y-3 animate-fade-in">
      <div className="glass-panel overflow-x-auto">
        <h2 className="text-sm font-bold uppercase tracking-wider text-primary mb-3 border-b border-border pb-2">Yearly Overview</h2>

        {/* Year header */}
        <div
          className="grid items-center text-[0.65rem] uppercase tracking-wider text-muted-foreground font-semibold border-b border-border/40 px-2 py-1.5"
          style={{ gridTemplateColumns: yearGrid }}
        >
          <span className="text-left">Year</span>
          <span className="text-right">Net P&L</span>
          <span className="text-right">Profit</span>
          <span className="text-right">Loss</span>
          <span className="text-right">Win%</span>
          <span className="text-right">Max DD</span>
          <span className="text-right pr-1">Months</span>
        </div>

        {years.map(yr => {
          const isExp = expandedYear === yr.year;
          return (
            <div key={yr.year}>
              {/* Year data row */}
              <div
                className="grid items-center py-2.5 cursor-pointer hover:bg-surface-hover transition-colors px-2"
                style={{ gridTemplateColumns: yearGrid }}
                onClick={() => toggleYear(yr.year)}
              >
                <div className="flex items-center gap-2">
                  {isExp ? <ChevronDown size={14} className="text-primary" /> : <ChevronRight size={14} className="text-muted-foreground" />}
                  <span className="text-sm font-bold text-foreground">{yr.year}</span>
                  <span className="text-xs text-muted-foreground">({yr.totalTrades} trades)</span>
                </div>
                <span className={`mono text-sm font-bold text-right ${yr.totalPnl >= 0 ? 'text-success' : 'text-destructive'}`}>{formatINR(yr.totalPnl)}</span>
                <span className="mono text-sm font-semibold text-right text-success">{formatINR(yr.grossProfit)}</span>
                <span className="mono text-sm font-semibold text-right text-destructive">-{formatINR(yr.grossLoss)}</span>
                <span className={`mono text-sm font-bold text-right ${yr.winRate >= 50 ? 'text-success' : 'text-destructive'}`}>{yr.winRate.toFixed(0)}%</span>
                <span className="mono text-sm font-semibold text-right text-destructive">{formatINR(yr.maxDrawdown)}</span>
                <div className="flex items-center gap-1.5 mono text-sm justify-end font-semibold pr-1">
                  <span className="text-success">{yr.profitableMonths} M</span>
                  <span className="text-muted-foreground">|</span>
                  <span className="text-destructive">{yr.lossMonths} M</span>
                </div>
              </div>

              <div className="border-b border-border/30" />

              {/* Expanded monthly detail */}
              {isExp && (
                <div className="py-3 px-4 animate-fade-in space-y-3 bg-muted/5">
                  {/* Mini P&L bars */}
                  <div className="flex gap-1 items-end h-10">
                    {yr.months.map((m, i) => {
                      if (m.trades === 0) return <div key={i} className="flex-1 h-2 bg-muted/30 rounded" title={MONTH_NAMES[i]} />;
                      const maxPnl = Math.max(...yr.months.map(x => Math.abs(x.pnl)), 1);
                      const height = Math.max(4, (Math.abs(m.pnl) / maxPnl) * 36);
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center gap-0" title={`${MONTH_NAMES[i]}: ${formatINR(m.pnl)}`}>
                          <div className={`w-full rounded ${m.pnl >= 0 ? 'bg-success' : 'bg-destructive'}`} style={{ height: `${height}px`, opacity: 0.8 }} />
                          <span className="text-[0.6rem] text-muted-foreground leading-tight">{MONTH_NAMES[i][0]}</span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Monthly header */}
                  <div
                    className="grid items-center text-[0.6rem] uppercase tracking-wider text-muted-foreground font-semibold border-b border-border/30 px-2 py-1"
                    style={{ gridTemplateColumns: monthGrid }}
                  >
                    <span className="text-left">Month</span>
                    <span className="text-right">Trades</span>
                    <span className="text-right">Wins</span>
                    <span className="text-right">Losses</span>
                    <span className="text-right">Win%</span>
                    <span className="text-right pr-1">P&L</span>
                  </div>

                  {yr.months.filter(m => m.trades > 0).map(m => {
                    const winRate = m.trades ? ((m.wins / m.trades) * 100) : 0;
                    const monthKey = `${yr.year}-${m.month}`;
                    const isMonthExp = expandedMonth === monthKey;
                    const fileBreakdown = isMonthExp ? getFileBreakdown(yr.year, m.month) : [];

                    return (
                      <div key={m.month}>
                        {/* Month row */}
                        <div
                          className={`grid items-center py-2 cursor-pointer transition-colors rounded px-2 border-b border-border/20 ${m.pnl >= 0 ? 'hover:bg-success/5' : 'hover:bg-destructive/5'}`}
                          style={{ gridTemplateColumns: monthGrid }}
                          onClick={(e) => { e.stopPropagation(); toggleMonth(monthKey); }}
                        >
                          <div className="flex items-center gap-2">
                            {visibleFiles.length > 1 && (
                              isMonthExp ? <ChevronDown size={11} className="text-primary" /> : <ChevronRight size={11} className="text-muted-foreground" />
                            )}
                            <span className="text-xs font-bold text-foreground">{MONTH_NAMES[m.month]}</span>
                          </div>
                          <span className="mono text-xs font-semibold text-right text-foreground">{m.trades}</span>
                          <span className="mono text-xs font-semibold text-right text-success">{m.wins}</span>
                          <span className="mono text-xs font-semibold text-right text-destructive">{m.losses}</span>
                          <span className={`mono text-xs font-bold text-right ${winRate >= 50 ? 'text-success' : 'text-destructive'}`}>{winRate.toFixed(0)}%</span>
                          <span className={`mono text-xs font-bold text-right pr-1 ${m.pnl >= 0 ? 'text-success' : 'text-destructive'}`}>{formatINR(m.pnl)}</span>
                        </div>

                        {/* Per-file breakdown */}
                        {isMonthExp && fileBreakdown.length > 0 && (
                          <div className="animate-fade-in">
                            {fileBreakdown.map(fb => (
                              <div
                                key={fb.name}
                                className="grid items-center py-1.5 px-2 ml-6 border-b border-border/10 bg-muted/5"
                                style={{ gridTemplateColumns: monthGrid }}
                              >
                                <span className="text-[0.7rem] font-semibold text-muted-foreground truncate">{fb.name}</span>
                                <span className="mono text-[0.7rem] text-right text-muted-foreground">{fb.trades}</span>
                                <span className="mono text-[0.7rem] text-right text-success/80">{fb.wins}</span>
                                <span className="mono text-[0.7rem] text-right text-destructive/80">{fb.losses}</span>
                                <span className="mono text-[0.7rem] text-right text-muted-foreground">{fb.trades ? ((fb.wins / fb.trades) * 100).toFixed(0) : 0}%</span>
                                <span className={`mono text-[0.7rem] font-bold text-right pr-1 ${fb.pnl >= 0 ? 'text-success' : 'text-destructive'}`}>{formatINR(fb.pnl)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}