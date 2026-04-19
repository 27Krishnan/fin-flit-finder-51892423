import { useAppContext } from '@/context/AppContext';
import { calculateMetrics, getYearOverview } from '@/lib/metrics';
import { formatINR } from '@/lib/format';
import StatsCards from './StatsCards';
import InstrumentBreakdown from './InstrumentBreakdown';
import PortfolioLibrary from './PortfolioLibrary';
import MonthlyHeatmap from './MonthlyHeatmap';

export default function DashboardTab() {
  const { allTrades, files, globalCapital, setActiveTab } = useAppContext();
  const visibleFiles = files.filter(f => f.visible);
  const totalCapital = visibleFiles.reduce((s, f) => s + (f.capital * f.multiplier), 0) || globalCapital;
  const metrics = calculateMetrics(allTrades, totalCapital);

  if (!allTrades.length) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-col items-center justify-center min-h-[40vh] text-center">
          <div className="text-6xl mb-4">📊</div>
          <h2 className="text-2xl font-bold text-foreground mb-2">No Data Loaded</h2>
          <p className="text-lg text-muted-foreground max-w-md">
            Upload your TradingView or backtest CSV files to see your strategy analysis.
            Or click "Load Sample" to explore with demo data.
          </p>
        </div>
        <PortfolioLibrary />
      </div>
    );
  }

  const years = getYearOverview(allTrades);

  // Quick summary stats for the hero section
  const tradingDays = new Set(allTrades.map(t => t.exitDate.toDateString())).size;
  const avgTradesPerDay = tradingDays > 0 ? (allTrades.length / tradingDays).toFixed(1) : '0';

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Hero Summary Bar */}
      <div className="glass-panel !py-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <span className="text-lg">📈</span>
          </div>
          <div>
            <div className={`text-xl font-bold mono ${metrics.netProfit >= 0 ? 'text-success' : 'text-destructive'}`}>
              {formatINR(metrics.netProfit)}
            </div>
            <div className="text-xs text-muted-foreground">
              Net P&L across {metrics.totalTrades} trades • {tradingDays} trading days • ~{avgTradesPerDay} trades/day
            </div>
          </div>
        </div>
        <div className="flex gap-6 text-center">
          <div>
            <div className={`text-lg font-bold mono ${metrics.winRate >= 50 ? 'text-success' : 'text-destructive'}`}>{metrics.winRate.toFixed(1)}%</div>
            <div className="text-[0.6rem] uppercase tracking-wider text-muted-foreground">Win Rate</div>
          </div>
          <div>
            <div className={`text-lg font-bold mono ${metrics.profitFactor >= 1 ? 'text-success' : 'text-destructive'}`}>
              {metrics.profitFactor === Infinity ? '∞' : metrics.profitFactor.toFixed(2)}
            </div>
            <div className="text-[0.6rem] uppercase tracking-wider text-muted-foreground">Profit Factor</div>
          </div>
          <div>
            <div className="text-lg font-bold mono text-destructive">{formatINR(-metrics.maxDDDetail.amount)}</div>
            <div className="text-[0.6rem] uppercase tracking-wider text-muted-foreground">Max DD</div>
          </div>
        </div>
      </div>

      <StatsCards metrics={metrics} capital={totalCapital} />

      {/* Heatmap + Yearly Overview side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <MonthlyHeatmap trades={allTrades} />
        </div>
        
        {/* Yearly Overview */}
        {years.length > 0 && (
          <div className="glass-panel cursor-pointer hover:border-primary/30 transition-all" onClick={() => setActiveTab('yearOverview')}>
            <h3 className="text-sm font-bold uppercase tracking-wider text-primary mb-3">Yearly Overview</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase text-muted-foreground font-semibold">
                  <th className="py-1.5 text-left">Year</th>
                  <th className="py-1.5 text-right">Net P&L</th>
                  <th className="py-1.5 text-right">W</th>
                  <th className="py-1.5 text-right">L</th>
                </tr>
              </thead>
              <tbody>
                {years.map(yr => (
                  <tr key={yr.year} className="border-t border-border/30 hover:bg-surface-hover transition-colors">
                    <td className="py-2 font-bold text-foreground">{yr.year}</td>
                    <td className={`py-2 text-right mono font-bold ${yr.totalPnl >= 0 ? 'text-success' : 'text-destructive'}`}>{formatINR(yr.totalPnl)}</td>
                    <td className="py-2 text-right mono text-success font-semibold">{yr.profitableMonths}</td>
                    <td className="py-2 text-right mono text-destructive font-semibold">{yr.lossMonths}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="text-[0.6rem] text-muted-foreground mt-2 text-center opacity-60">Click for detailed view →</div>
          </div>
        )}
      </div>

      <InstrumentBreakdown files={files} />
      <PortfolioLibrary />
    </div>
  );
}