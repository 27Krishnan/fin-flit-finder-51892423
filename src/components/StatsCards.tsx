import { DashboardMetrics, Trade } from '@/lib/types';
import { formatINR, formatDate } from '@/lib/format';
import { useAppContext } from '@/context/AppContext';
import { calculateMetrics } from '@/lib/metrics';
import { useState } from 'react';
import { X } from 'lucide-react';

interface Props {
  metrics: DashboardMetrics;
  capital: number;
}

// Popup component for per-year metric breakdowns
function MetricPopup({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl p-5 max-w-lg w-full mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-primary">{title}</h3>
          <button onClick={onClose} className="p-1 hover:bg-secondary rounded transition-colors"><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function StatsCards({ metrics, capital }: Props) {
  const { files, setActiveTab } = useAppContext();
  const m = metrics;
  const profitPct = capital > 0 ? ((m.netProfit / capital) * 100).toFixed(1) : null;
  const [popup, setPopup] = useState<string | null>(null);

  // Per-year metrics for popups
  const getPerYearMetrics = () => {
    const yearMap = new Map<number, Trade[]>();
    const visibleFiles = files.filter(f => f.visible);
    visibleFiles.forEach(f => {
      f.trades.forEach(t => {
        const yr = t.exitDate.getFullYear();
        if (!yearMap.has(yr)) yearMap.set(yr, []);
        yearMap.get(yr)!.push({ ...t, netPnl: (t.netPnl * f.multiplier) - (t.posValue * f.multiplier * f.slippage / 100), drawdown: t.drawdown * f.multiplier });
      });
    });
    const years = Array.from(yearMap.keys()).sort((a, b) => b - a);
    return years.map(yr => {
      const trades = yearMap.get(yr)!;
      const yrMetrics = calculateMetrics(trades, capital);
      return { year: yr, metrics: yrMetrics, trades: trades.length };
    });
  };

  // Per-file capital breakdown
  const getCapitalBreakdown = () => {
    return files.filter(f => f.visible).map(f => ({
      name: f.name,
      capital: f.capital,
      multiplier: f.multiplier,
      effective: f.capital * f.multiplier,
    }));
  };

  const cards = [
    { title: 'Total Trades', value: m.totalTrades.toString(), sub: `${m.winningTrades}W / ${m.losingTrades}L`, color: '', clickAction: undefined },
    { title: 'Win Rate', value: `${m.winRate.toFixed(1)}%`, sub: `Consec: ${m.maxConsecWins}W / ${m.maxConsecLosses}L`, color: m.winRate >= 50 ? 'text-success' : 'text-destructive', clickAction: undefined },
    {
      title: 'Net Profit',
      value: formatINR(m.netProfit),
      sub: profitPct ? `${profitPct}% return | Gross: ${formatINR(m.grossProfit)} / ${formatINR(-m.grossLoss)}` : `Gross: ${formatINR(m.grossProfit)} / ${formatINR(-m.grossLoss)}`,
      color: m.netProfit >= 0 ? 'text-success' : 'text-destructive',
      clickAction: undefined,
    },
    { title: 'Profit Factor', value: m.profitFactor === Infinity ? '∞' : m.profitFactor.toFixed(2), sub: 'Gross Profit / Gross Loss', color: m.profitFactor >= 1.5 ? 'text-success' : m.profitFactor >= 1 ? 'text-warning' : 'text-destructive', clickAction: undefined },
    { title: 'Avg Win', value: formatINR(m.avgWinAmount), sub: `${m.winningTrades} winning trades`, color: 'text-success', clickAction: undefined },
    { title: 'Avg Loss', value: formatINR(-m.avgLossAmount), sub: `${m.losingTrades} losing trades`, color: 'text-destructive', clickAction: undefined },
    { title: 'Risk Reward', value: m.riskRewardRatio === Infinity ? '∞' : m.riskRewardRatio.toFixed(2), sub: 'Avg Win / Avg Loss', color: m.riskRewardRatio >= 1.5 ? 'text-success' : m.riskRewardRatio >= 1 ? 'text-warning' : 'text-destructive', clickAction: undefined },
    
    { title: 'Expectancy', value: formatINR(m.expectancy), sub: 'Avg profit per trade', color: m.expectancy >= 0 ? 'text-success' : 'text-destructive', clickAction: undefined },
    { title: 'Consistency (Mo/Yr)', value: `${m.monthlyConsistency.toFixed(0)}% / ${m.yearlyConsistency.toFixed(0)}%`, sub: '% profitable periods → click for details', color: m.monthlyConsistency >= 60 ? 'text-success' : 'text-warning', clickAction: 'yearOverview' as const },
    { title: 'Statistical Robustness', value: m.statisticalRobustness.toFixed(2), sub: m.statisticalRobustness >= 1.5 ? 'Extremely Robust' : m.statisticalRobustness >= 1.2 ? 'Good Edge' : m.statisticalRobustness >= 1 ? 'Marginal' : 'Losing Strategy', color: m.statisticalRobustness >= 1.2 ? 'text-success' : m.statisticalRobustness >= 1 ? 'text-warning' : 'text-destructive', clickAction: undefined },
  ];

  // Capital-dependent cards with popup support
  if (capital > 0) {
    cards.push(
      { title: 'Capital Deployed', value: formatINR(capital), sub: 'Click for file breakdown', color: '', clickAction: 'capital' as any },
      { title: 'Total Return %', value: `${m.totalReturnPct.toFixed(2)}%`, sub: `On ${formatINR(capital)} → click for yearly`, color: m.totalReturnPct >= 0 ? 'text-success' : 'text-destructive', clickAction: 'totalReturn' as any },
      { title: 'CAGR', value: `${m.cagr.toFixed(2)}%`, sub: 'Click for yearly breakdown', color: m.cagr >= 0 ? 'text-success' : 'text-destructive', clickAction: 'cagr' as any },
      { title: 'Sharpe Ratio', value: m.sharpeRatio.toFixed(2), sub: 'Click for yearly breakdown', color: m.sharpeRatio >= 1 ? 'text-success' : m.sharpeRatio >= 0.5 ? 'text-warning' : 'text-destructive', clickAction: 'sharpe' as any },
      { title: 'Sortino Ratio', value: m.sortinoRatio.toFixed(2), sub: 'Click for yearly breakdown', color: m.sortinoRatio >= 1.5 ? 'text-success' : m.sortinoRatio >= 1 ? 'text-warning' : 'text-destructive', clickAction: 'sortino' as any },
      { title: 'Calmar Ratio', value: m.calmarRatio.toFixed(2), sub: 'Click for yearly breakdown', color: m.calmarRatio >= 1 ? 'text-success' : 'text-destructive', clickAction: 'calmar' as any },
    );
  }

  const handleCardClick = (clickAction: any) => {
    if (!clickAction) return;
    if (clickAction === 'yearOverview') {
      setActiveTab('yearOverview');
    } else {
      setPopup(clickAction);
    }
  };

  const renderPopup = () => {
    if (!popup) return null;

    if (popup === 'capital') {
      const breakdown = getCapitalBreakdown();
      return (
        <MetricPopup title="Capital Deployed Breakdown" onClose={() => setPopup(null)}>
          <table className="w-full text-sm">
            <thead><tr className="text-[0.7rem] uppercase text-muted-foreground"><th className="py-2 text-left">File</th><th className="py-2 text-right">Capital</th><th className="py-2 text-right">Mult</th><th className="py-2 text-right">Effective</th></tr></thead>
            <tbody>
              {breakdown.map(b => (
                <tr key={b.name} className="border-t border-border/50">
                  <td className="py-2 font-semibold">{b.name}</td>
                  <td className="py-2 text-right mono">{formatINR(b.capital)}</td>
                  <td className="py-2 text-right mono">{b.multiplier}x</td>
                  <td className="py-2 text-right mono text-primary">{formatINR(b.effective)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-border font-bold">
                <td className="py-2">Total</td>
                <td colSpan={2}></td>
                <td className="py-2 text-right mono text-primary">{formatINR(capital)}</td>
              </tr>
            </tbody>
          </table>
        </MetricPopup>
      );
    }

    const yearData = getPerYearMetrics();
    const titleMap: Record<string, string> = {
      totalReturn: 'Total Return % by Year',
      cagr: 'CAGR by Year',
      sharpe: 'Sharpe Ratio by Year',
      sortino: 'Sortino Ratio by Year',
      calmar: 'Calmar Ratio by Year',
    };

    const getYearValue = (yrM: DashboardMetrics, key: string) => {
      switch (key) {
        case 'totalReturn': return `${yrM.totalReturnPct.toFixed(2)}%`;
        case 'cagr': return `${yrM.cagr.toFixed(2)}%`;
        case 'sharpe': return yrM.sharpeRatio.toFixed(2);
        case 'sortino': return yrM.sortinoRatio.toFixed(2);
        case 'calmar': return yrM.calmarRatio.toFixed(2);
        default: return '-';
      }
    };

    return (
      <MetricPopup title={titleMap[popup] || popup} onClose={() => setPopup(null)}>
        <table className="w-full text-sm">
          <thead><tr className="text-[0.7rem] uppercase text-muted-foreground"><th className="py-2 text-left">Year</th><th className="py-2 text-right">Trades</th><th className="py-2 text-right">Net P&L</th><th className="py-2 text-right">{titleMap[popup]?.split(' by')[0]}</th></tr></thead>
          <tbody>
            {yearData.map(yd => (
              <tr key={yd.year} className="border-t border-border/50">
                <td className="py-2 font-bold">{yd.year}</td>
                <td className="py-2 text-right mono">{yd.trades}</td>
                <td className={`py-2 text-right mono ${yd.metrics.netProfit >= 0 ? 'text-success' : 'text-destructive'}`}>{formatINR(yd.metrics.netProfit)}</td>
                <td className="py-2 text-right mono font-bold text-primary">{getYearValue(yd.metrics, popup)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </MetricPopup>
    );
  };

  return (
    <div className="space-y-6">
      {renderPopup()}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {cards.map((card) => (
          <div
            key={card.title}
            className={`stat-card animate-fade-in ${card.clickAction ? 'cursor-pointer hover:border-primary/50 hover:scale-[1.02] transition-all' : ''}`}
            onClick={() => handleCardClick(card.clickAction)}
          >
            <div className="text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground mb-2">{card.title}</div>
            <div className={`text-xl font-bold mb-1 mono ${card.color}`}>{card.value}</div>
            <div className="text-xs text-muted-foreground mt-auto">{card.sub}</div>
          </div>
        ))}
      </div>

      {/* Max Drawdown Section */}
      <div className="glass-panel">
        <h3 className="text-sm font-bold uppercase tracking-wider text-primary mb-4">Max Drawdown</h3>
        <div className="text-right">
          <div className="text-2xl font-bold mono text-destructive">
            {formatINR(-m.maxDDDetail.amount)}
          </div>
          {m.maxDrawdownPct > 0 && (
            <div className="text-sm text-destructive/80">
              ({m.maxDrawdownPct.toFixed(1)}%)
            </div>
          )}
        </div>
        {m.maxDDDetail.peakDate && (
          <div className="space-y-1 text-xs text-muted-foreground border-t border-border/30 pt-3 mt-3">
            <div className="flex justify-between"><span>Peak:</span><span className="text-success mono font-semibold">{formatINR(m.maxDDDetail.peakValue)} — {formatDate(m.maxDDDetail.peakDate)}</span></div>
            <div className="flex justify-between"><span>Trough:</span><span className="text-destructive mono font-semibold">{formatINR(m.maxDDDetail.troughValue)} — {m.maxDDDetail.troughDate ? formatDate(m.maxDDDetail.troughDate) : '-'}</span></div>
            {m.maxDDDetail.recoveryDate && <div className="flex justify-between"><span>Recovery:</span><span className="text-warning mono font-semibold">{formatDate(m.maxDDDetail.recoveryDate)} ({m.maxDDDetail.recoveryDays} days, {m.maxDDDetail.totalTradesInDD} trades, {m.maxDDDetail.recoveryTrades} recovery)</span></div>}
            {!m.maxDDDetail.recoveryDate && m.maxDDDetail.recoveryDays === -1 && <div className="flex justify-between"><span>Recovery:</span><span className="text-warning mono">Not recovered</span></div>}
          </div>
        )}
      </div>

      {/* Stand-over DD */}
      <div className="stat-card animate-fade-in">
        <div className="text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Stand-Over Drawdown (Max Days Underwater)</div>
        <div className="text-xl font-bold mono text-warning mb-1">{m.standOverDD.days} days</div>
        {m.standOverDD.startDate && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs mt-2 border-t border-border/30 pt-2">
            <div><span className="text-muted-foreground">From:</span> <span className="mono text-foreground">{formatDate(m.standOverDD.startDate)}</span></div>
            <div><span className="text-muted-foreground">To:</span> <span className="mono text-foreground">{m.standOverDD.endDate ? formatDate(m.standOverDD.endDate) : 'Ongoing'}</span></div>
            <div><span className="text-muted-foreground">Peak:</span> <span className="mono text-success">{formatINR(m.standOverDD.peakValue)}</span></div>
            <div><span className="text-muted-foreground">Lowest:</span> <span className="mono text-destructive">{formatINR(m.standOverDD.lowestValue)}</span></div>
            <div><span className="text-muted-foreground">Current:</span> <span className="mono text-foreground">{formatINR(m.standOverDD.currentValue)}</span></div>
          </div>
        )}
      </div>

      {/* Top 5 Best & Worst Trades */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Top5Table trades={m.top5Wins} title="Top 5 Best Trades" isWin={true} capital={capital} />
        <Top5Table trades={m.top5Losses} title="Top 5 Worst Trades" isWin={false} capital={capital} />
      </div>
    </div>
  );
}

function DrawdownCard({ dd, label, color, pct }: { dd: import('@/lib/types').DrawdownDetail; label: string; color: string; pct?: number }) {
  return (
    <div className="stat-card animate-fade-in">
      <div className="text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground mb-2">{label}</div>
      <div className={`text-xl font-bold mono ${color} mb-1`}>
        {formatINR(-dd.amount)}
        {pct !== undefined && pct > 0 && <span className="text-sm ml-2">({pct.toFixed(1)}%)</span>}
      </div>
      {dd.peakDate && (
        <div className="space-y-1 text-[0.65rem] text-muted-foreground border-t border-border/30 pt-1.5 mt-1.5">
          <div className="flex justify-between"><span>Peak Date:</span><span className="text-foreground mono">{formatDate(dd.peakDate)}</span></div>
          <div className="flex justify-between"><span>Trough Date:</span><span className="text-foreground mono">{dd.troughDate ? formatDate(dd.troughDate) : '-'}</span></div>
          {dd.recoveryDate && <div className="flex justify-between"><span>Recovery:</span><span className="text-success mono">{formatDate(dd.recoveryDate)} ({dd.recoveryDays}d, {dd.recoveryTrades} trades)</span></div>}
          {!dd.recoveryDate && dd.recoveryDays === -1 && <div className="flex justify-between"><span>Recovery:</span><span className="text-warning mono">Not recovered</span></div>}
        </div>
      )}
    </div>
  );
}

function Top5Table({ trades, title, isWin, capital }: { trades: import('@/lib/types').Trade[]; title: string; isWin: boolean; capital: number }) {
  if (!trades.length) return null;
  return (
    <div className="glass-panel">
      <div className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3 border-b border-border pb-2">
        {isWin ? '🏆' : '⚠️'} {title}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[0.7rem] uppercase text-muted-foreground">
              <th className="py-2 px-2">#</th>
              <th className="py-2 px-2">Date</th>
              <th className="py-2 px-2">P&L</th>
              {capital > 0 && <th className="py-2 px-2">% of Capital</th>}
              <th className="py-2 px-2">Direction</th>
              <th className="py-2 px-2">Signal</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((t, i) => (
              <tr key={i} className="border-t border-border/50 hover:bg-surface-hover transition-colors">
                <td className="py-2 px-2 mono font-bold text-primary">{i + 1}</td>
                <td className="py-2 px-2 mono text-xs">{formatDate(t.exitDate)}</td>
                <td className={`py-2 px-2 mono font-semibold ${isWin ? 'text-success' : 'text-destructive'}`}>{formatINR(t.netPnl)}</td>
                {capital > 0 && <td className="py-2 px-2 mono">{((t.netPnl / capital) * 100).toFixed(2)}%</td>}
                <td className="py-2 px-2 capitalize">{t.direction}</td>
                <td className="py-2 px-2 text-muted-foreground truncate max-w-[100px]">{t.signal}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
