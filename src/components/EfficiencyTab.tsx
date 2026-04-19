import { useState, Fragment } from 'react';
import { useAppContext } from '@/context/AppContext';
import { getEfficiencyData, calculateMetrics, getEfficiencyByYear } from '@/lib/metrics';
import { formatINR } from '@/lib/format';
import { ChevronDown, ChevronRight } from 'lucide-react';

export default function EfficiencyTab() {
  const { files, allTrades, globalCapital } = useAppContext();
  const [expandedYear, setExpandedYear] = useState<number | null>(null);

  if (!allTrades.length) return <div className="text-center text-muted-foreground py-20">Upload data to view efficiency analysis</div>;

  const totalCapital = files.filter(f => f.visible).reduce((s, f) => s + (f.capital * f.multiplier), 0) || globalCapital;
  const metrics = calculateMetrics(allTrades, totalCapital);
  const effData = getEfficiencyData(files);
  const effByYear = getEfficiencyByYear(files);
  const globalEfficiency = metrics.maxDrawdown ? metrics.netProfit / metrics.maxDrawdown : 0;

  // Get all unique years sorted descending for pivot columns
  const allYears = effByYear.map(e => e.year).sort((a, b) => b - a);

  // Build pivot: strategy → { year: efficiency }
  const visibleFiles = files.filter(f => f.visible && f.trades.length);
  const pivotData = visibleFiles.map(f => {
    const yearEffMap: Record<number, number> = {};
    let combinedProfit = 0;
    let combinedIntraDD = 0;
    effByYear.forEach(ey => {
      const strat = ey.strategies.find(s => s.name === f.name);
      if (strat) {
        yearEffMap[ey.year] = strat.efficiency;
        combinedProfit += strat.netProfit;
        if (strat.intraDD > combinedIntraDD) combinedIntraDD = strat.intraDD;
      }
    });
    const combinedER = combinedIntraDD ? combinedProfit / combinedIntraDD : combinedProfit > 0 ? Infinity : 0;
    return { name: f.name, yearEffMap, combinedER };
  });

  // Per-year aggregated data (sum all strategies)
  const yearAggData = effByYear.map(ey => {
    const totalProfit = ey.strategies.reduce((s, st) => s + st.netProfit, 0);
    const totalTrades = ey.strategies.reduce((s, st) => s + st.trades, 0);
    // For combined: use worst closed DD and worst intra DD across strategies
    let worstClosedDD = 0, worstIntraDD = 0;
    // Actually compute combined equity curve for the year
    const yearTrades = allTrades
      .filter(t => t.exitDate.getFullYear() === ey.year)
      .sort((a, b) => a.exitDate.getTime() - b.exitDate.getTime());
    let peak = 0, maxClosedDD = 0, equity = 0;
    let maxIntraDD = 0, intraPeak = 0;
    for (const t of yearTrades) {
      const mult = files.find(f => f.name === t.fileName)?.multiplier ?? 1;
      const intraTrough = equity + (t.drawdown * mult);
      if (intraTrough < equity) {
        const intraDD = intraPeak - Math.min(equity, intraTrough);
        if (intraDD > maxIntraDD) maxIntraDD = intraDD;
      }
      equity += t.netPnl * mult;
      if (equity > peak) peak = equity;
      if (equity > intraPeak) intraPeak = equity;
      const dd = peak - equity;
      if (dd > maxClosedDD) maxClosedDD = dd;
    }
    const efficiency = maxIntraDD ? totalProfit / maxIntraDD : totalProfit > 0 ? Infinity : 0;
    return { year: ey.year, totalProfit, totalTrades, closedDD: maxClosedDD, intraDD: maxIntraDD, efficiency, strategies: ey.strategies };
  });

  // Sort yearAggData by year ascending for YoY calculation
  const yearAggSorted = [...yearAggData].sort((a, b) => a.year - b.year);
  const yearDDChange = new Map<number, { closedDDChg: number | null; intraDDChg: number | null }>();
  for (let i = 0; i < yearAggSorted.length; i++) {
    if (i === 0) {
      yearDDChange.set(yearAggSorted[i].year, { closedDDChg: null, intraDDChg: null });
    } else {
      const prev = yearAggSorted[i - 1];
      const curr = yearAggSorted[i];
      const closedDDChg = prev.closedDD ? ((curr.closedDD - prev.closedDD) / prev.closedDD) * 100 : null;
      const intraDDChg = prev.intraDD ? ((curr.intraDD - prev.intraDD) / prev.intraDD) * 100 : null;
      yearDDChange.set(curr.year, { closedDDChg, intraDDChg });
    }
  }

  const erColor = (val: number) => val >= 2 ? 'text-success' : val >= 1 ? 'text-warning' : 'text-destructive';
  const formatER = (val: number) => val === Infinity ? '∞' : val.toFixed(2);
  const ddChgColor = (val: number | null) => val === null ? 'text-muted-foreground' : val > 0 ? 'text-destructive' : val < 0 ? 'text-success' : 'text-muted-foreground';
  const formatDDChg = (val: number | null) => val === null ? '-' : `${val > 0 ? '+' : ''}${val.toFixed(1)}%`;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="stat-card">
          <div className="text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Global Efficiency</div>
          <div className={`text-2xl font-bold mono ${erColor(globalEfficiency)}`}>{formatER(globalEfficiency)}</div>
          <div className="text-xs text-muted-foreground mt-1">Net Profit / Max Drawdown</div>
        </div>
        <div className="stat-card">
          <div className="text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Total Net Profit</div>
          <div className={`text-2xl font-bold mono ${metrics.netProfit >= 0 ? 'text-success' : 'text-destructive'}`}>{formatINR(metrics.netProfit)}</div>
        </div>
        <div className="stat-card">
          <div className="text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Max Drawdown</div>
          <div className="text-2xl font-bold mono text-destructive">{formatINR(-metrics.maxDrawdown)}</div>
        </div>
      </div>

      {/* Efficiency Leaderboard (Per File) */}
      <div className="glass-panel">
        <div className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3 border-b border-border pb-2">
          Efficiency Leaderboard (Per File)
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[0.7rem] uppercase text-muted-foreground">
                <th className="py-2 px-3">Rank</th>
                <th className="py-2 px-3">Tool / File Name</th>
                <th className="py-2 px-3">Total Net Profit</th>
                <th className="py-2 px-3">Closed DD</th>
                <th className="py-2 px-3">Intra DD</th>
                <th className="py-2 px-3">Efficiency Ratio</th>
              </tr>
            </thead>
            <tbody>
              {effData.map((d, i) => (
                <tr key={d.name} className="border-t border-border/50 hover:bg-surface-hover transition-colors">
                  <td className="py-2 px-3 mono font-bold text-primary">{i + 1}</td>
                  <td className="py-2 px-3 font-semibold">{d.name}</td>
                  <td className={`py-2 px-3 mono ${d.netProfit >= 0 ? 'text-success' : 'text-destructive'}`}>{formatINR(d.netProfit)}</td>
                  <td className="py-2 px-3 mono text-destructive">{formatINR(-d.closedDD)}</td>
                  <td className="py-2 px-3 mono text-destructive">{formatINR(-d.intraDD)}</td>
                  <td className={`py-2 px-3 mono font-bold ${erColor(d.efficiency)}`}>{formatER(d.efficiency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pivot Matrix: Strategy × Year ER */}
      <div className="glass-panel">
        <div className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3 border-b border-border pb-2">
          Strategy Efficiency by Year (Pivot Matrix)
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[0.7rem] uppercase text-muted-foreground">
                <th className="py-2 px-3">Strategy / File Name</th>
                {allYears.map(y => (
                  <th key={y} className="py-2 px-3 text-center">{y} ER</th>
                ))}
                <th className="py-2 px-3 text-center font-bold">Combined ER</th>
              </tr>
            </thead>
            <tbody>
              {pivotData.map(row => (
                <tr key={row.name} className="border-t border-border/50 hover:bg-surface-hover transition-colors">
                  <td className="py-2 px-3 font-semibold">{row.name}</td>
                  {allYears.map(y => {
                    const val = row.yearEffMap[y];
                    return (
                      <td key={y} className={`py-2 px-3 mono text-center font-semibold ${val !== undefined ? erColor(val) : 'text-muted-foreground'}`}>
                        {val !== undefined ? formatER(val) : '-'}
                      </td>
                    );
                  })}
                  <td className={`py-2 px-3 mono text-center font-bold ${erColor(row.combinedER)}`}>{formatER(row.combinedER)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Efficiency Leaderboard (Per Year) */}
      <div className="glass-panel">
        <div className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3 border-b border-border pb-2">
          Efficiency Leaderboard (Per Year)
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[0.7rem] uppercase text-muted-foreground">
                <th className="py-2 px-3">Rank</th>
                <th className="py-2 px-3">Year / File</th>
                <th className="py-2 px-3">Total Net Profit</th>
                <th className="py-2 px-3">Closed DD</th>
                <th className="py-2 px-3">DD Δ%</th>
                <th className="py-2 px-3">Intra DD</th>
                <th className="py-2 px-3">DD Δ%</th>
                <th className="py-2 px-3">Efficiency Ratio</th>
              </tr>
            </thead>
            <tbody>
              {yearAggData.map((yd, i) => {
                const isExp = expandedYear === yd.year;
                return (
                  <Fragment key={yd.year}>
                    <tr
                      className="border-t border-border/50 hover:bg-surface-hover transition-colors cursor-pointer"
                      onClick={() => setExpandedYear(prev => prev === yd.year ? null : yd.year)}
                    >
                      <td className="py-2 px-3 mono font-bold text-primary">{i + 1}</td>
                      <td className="py-2 px-3 font-semibold">
                        <div className="flex items-center gap-2">
                          {isExp ? <ChevronDown size={14} className="text-primary" /> : <ChevronRight size={14} className="text-muted-foreground" />}
                          <span className="font-bold">{yd.year}</span>
                          <span className="text-xs text-muted-foreground">({yd.totalTrades} trades)</span>
                        </div>
                      </td>
                      <td className={`py-2 px-3 mono ${yd.totalProfit >= 0 ? 'text-success' : 'text-destructive'}`}>{formatINR(yd.totalProfit)}</td>
                      <td className="py-2 px-3 mono text-destructive">{formatINR(-yd.closedDD)}</td>
                      <td className={`py-2 px-3 mono font-semibold ${ddChgColor(yearDDChange.get(yd.year)?.closedDDChg ?? null)}`}>{formatDDChg(yearDDChange.get(yd.year)?.closedDDChg ?? null)}</td>
                      <td className="py-2 px-3 mono text-destructive">{formatINR(-yd.intraDD)}</td>
                      <td className={`py-2 px-3 mono font-semibold ${ddChgColor(yearDDChange.get(yd.year)?.intraDDChg ?? null)}`}>{formatDDChg(yearDDChange.get(yd.year)?.intraDDChg ?? null)}</td>
                      <td className={`py-2 px-3 mono font-bold ${erColor(yd.efficiency)}`}>{formatER(yd.efficiency)}</td>
                    </tr>
                    {isExp && yd.strategies.map(st => (
                      <tr key={st.name} className="border-t border-border/20 bg-muted/5">
                        <td className="py-1.5 px-3"></td>
                        <td className="py-1.5 px-3 pl-10 text-[0.75rem] text-muted-foreground font-semibold truncate">{st.name}</td>
                        <td className={`py-1.5 px-3 mono text-[0.75rem] ${st.netProfit >= 0 ? 'text-success' : 'text-destructive'}`}>{formatINR(st.netProfit)}</td>
                        <td className="py-1.5 px-3 mono text-[0.75rem] text-destructive">{formatINR(-st.maxDD)}</td>
                        <td className="py-1.5 px-3"></td>
                        <td className="py-1.5 px-3 mono text-[0.75rem] text-destructive">{formatINR(-st.intraDD)}</td>
                        <td className="py-1.5 px-3"></td>
                        <td className={`py-1.5 px-3 mono text-[0.75rem] font-bold ${erColor(st.efficiency)}`}>{formatER(st.efficiency)}</td>
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}


