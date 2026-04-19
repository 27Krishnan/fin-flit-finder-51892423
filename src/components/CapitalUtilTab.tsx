import { useAppContext } from '@/context/AppContext';
import { formatINR } from '@/lib/format';
import { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from 'recharts';
import { ChevronDown, ChevronRight, Info } from 'lucide-react';
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

function HeaderTip({ label, tip }: { label: string; tip: string }) {
  return (
    <TooltipProvider delayDuration={200}>
      <UITooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1 cursor-help">
            {label} <Info size={11} className="text-muted-foreground/60" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[220px] text-xs font-normal normal-case tracking-normal">
          {tip}
        </TooltipContent>
      </UITooltip>
    </TooltipProvider>
  );
}

const COLORS = ['hsl(199, 89%, 58%)', 'hsl(160, 84%, 39%)', 'hsl(38, 92%, 50%)', 'hsl(280, 65%, 60%)', 'hsl(340, 75%, 55%)', 'hsl(20, 90%, 55%)'];

export default function CapitalUtilTab() {
  const { files, globalCapital } = useAppContext();
  const visibleFiles = files.filter(f => f.visible && f.trades.length);
  const totalCapital = visibleFiles.reduce((s, f) => s + (f.capital * f.multiplier), 0) || globalCapital;
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());

  const toggleMonth = (key: string) => {
    setExpandedMonths(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  // Calculate daily capital utilization — optimized with pre-computed active date sets
  const dailyUtilization = useMemo(() => {
    if (!visibleFiles.length || totalCapital <= 0) return [];

    // Pre-compute active dates per file (avoid repeated toISOString in inner loops)
    const allDates = new Set<string>();
    const fileActiveDates = new Map<string, Set<string>>();

    visibleFiles.forEach(f => {
      const activeDates = new Set<string>();
      f.trades.forEach(t => {
        const entry = t.entryDate.toISOString().slice(0, 10);
        const exit = t.exitDate.toISOString().slice(0, 10);
        allDates.add(entry);
        allDates.add(exit);
        // Fill all dates between entry and exit
        let cur = entry;
        while (cur <= exit) {
          activeDates.add(cur);
          allDates.add(cur);
          // Increment date by 1 day
          const d = new Date(cur + 'T00:00:00Z');
          d.setUTCDate(d.getUTCDate() + 1);
          cur = d.toISOString().slice(0, 10);
          if (activeDates.size > 5000) break; // safety limit
        }
      });
      fileActiveDates.set(f.name, activeDates);
    });

    const sortedDates = Array.from(allDates).sort();

    return sortedDates.map(date => {
      const point: any = { date };
      let totalUsed = 0;
      let activeCount = 0;

      visibleFiles.forEach(f => {
        const isActive = fileActiveDates.get(f.name)?.has(date) || false;
        const used = isActive ? (f.capital * f.multiplier) : 0;
        point[f.name] = used;
        totalUsed += used;
        if (isActive) activeCount++;
      });

      point.totalUsed = totalUsed;
      point.activeStrategies = activeCount;
      point.idle = Math.max(0, totalCapital - totalUsed);
      point.utilPct = totalCapital > 0 ? (totalUsed / totalCapital) * 100 : 0;
      point.fullDeployment = totalUsed >= totalCapital * 0.95;
      return point;
    });
  }, [visibleFiles, totalCapital]);

  // Monthly utilization summary with max capital hit count
  const monthlyUtil = useMemo(() => {
    if (!dailyUtilization.length) return [];
    const monthMap = new Map<string, {
      totalUtil: number; count: number; maxUtil: number; minUtil: number;
      fullDeployDays: number;
      maxActiveStrategies: number;
      files: Map<string, { activeDays: number; totalDays: number }>;
    }>();

    dailyUtilization.forEach(d => {
      const mo = d.date.slice(0, 7);
      if (!monthMap.has(mo)) monthMap.set(mo, {
        totalUtil: 0, count: 0, maxUtil: 0, minUtil: Infinity,
        fullDeployDays: 0, maxActiveStrategies: 0,
        files: new Map(),
      });
      const m = monthMap.get(mo)!;
      m.totalUtil += d.totalUsed;
      m.count++;
      m.maxUtil = Math.max(m.maxUtil, d.totalUsed);
      m.minUtil = Math.min(m.minUtil, d.totalUsed);
      if (d.fullDeployment) m.fullDeployDays++;
      m.maxActiveStrategies = Math.max(m.maxActiveStrategies, d.activeStrategies);
      visibleFiles.forEach(f => {
        if (!m.files.has(f.name)) m.files.set(f.name, { activeDays: 0, totalDays: 0 });
        const fEntry = m.files.get(f.name)!;
        fEntry.totalDays++;
        if (d[f.name] > 0) fEntry.activeDays++;
      });
    });

    return Array.from(monthMap.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([month, data]) => ({
        month,
        avgUtil: data.count ? data.totalUtil / data.count : 0,
        avgUtilPct: totalCapital > 0 && data.count ? ((data.totalUtil / data.count) / totalCapital) * 100 : 0,
        maxUtil: data.maxUtil,
        minUtil: data.minUtil === Infinity ? 0 : data.minUtil,
        idle: totalCapital - (data.count ? data.totalUtil / data.count : 0),
        fullDeployDays: data.fullDeployDays,
        totalDays: data.count,
        maxActiveStrategies: data.maxActiveStrategies,
        files: Array.from(data.files.entries()).map(([name, fd]) => ({
          name,
          activeDays: fd.activeDays,
          totalDays: fd.totalDays,
          utilPct: fd.totalDays ? (fd.activeDays / fd.totalDays) * 100 : 0,
        })),
      }));
  }, [dailyUtilization, totalCapital, visibleFiles]);

  // Chart data: daily active strategy count
  const deploymentChartData = useMemo(() => {
    return dailyUtilization.map(d => ({
      date: d.date,
      activeStrategies: d.activeStrategies,
      utilPct: d.utilPct,
      totalUsed: d.totalUsed,
    }));
  }, [dailyUtilization]);

  // Overall stats
  const overallStats = useMemo(() => {
    if (!dailyUtilization.length) return { avgUtil: 0, avgUtilPct: 0, maxUtil: 0, peakUtilDate: '', idleCapital: 0, fullDeployDays: 0, totalDays: 0 };
    const total = dailyUtilization.reduce((s, d) => s + d.totalUsed, 0);
    const avg = total / dailyUtilization.length;
    let maxU = 0, peakDate = '';
    const fullDeploy = dailyUtilization.filter(d => d.fullDeployment).length;
    dailyUtilization.forEach(d => { if (d.totalUsed > maxU) { maxU = d.totalUsed; peakDate = d.date; } });
    return {
      avgUtil: avg,
      avgUtilPct: totalCapital > 0 ? (avg / totalCapital) * 100 : 0,
      maxUtil: maxU,
      peakUtilDate: peakDate,
      idleCapital: Math.max(0, totalCapital - avg),
      fullDeployDays: fullDeploy,
      totalDays: dailyUtilization.length,
    };
  }, [dailyUtilization, totalCapital]);

  if (!visibleFiles.length || totalCapital <= 0) {
    return (
      <div className="text-center text-muted-foreground py-20">
        <p className="text-lg mb-2">Set capital for each file to see utilization</p>
        <p className="text-xs">Capital determines how much is deployed per strategy</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Total Capital Banner - centered */}
      <div className="stat-card text-center">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Total Capital Deployed</div>
        <div className="text-2xl font-bold mono text-primary">{formatINR(totalCapital)}</div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {visibleFiles.length} strategies: {visibleFiles.map(f => formatINR(f.capital * f.multiplier)).join(' + ')}
        </div>
        <div className={`text-xl font-bold mono mt-1 ${overallStats.avgUtilPct >= 60 ? 'text-success' : overallStats.avgUtilPct >= 30 ? 'text-warning' : 'text-destructive'}`}>
          {overallStats.avgUtilPct.toFixed(1)}%
        </div>
        <div className="text-xs text-muted-foreground">Avg Utilization</div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="stat-card">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Avg Utilized</div>
          <div className="text-lg font-bold mono text-success">{formatINR(overallStats.avgUtil)}</div>
          <div className="text-xs text-muted-foreground">{overallStats.avgUtilPct.toFixed(1)}%</div>
        </div>
        <div className="stat-card">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Peak Utilized</div>
          <div className="text-lg font-bold mono text-warning">{formatINR(overallStats.maxUtil)}</div>
          <div className="text-xs text-muted-foreground">{overallStats.peakUtilDate}</div>
        </div>
        <div className="stat-card">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Avg Idle</div>
          <div className="text-lg font-bold mono text-destructive">{formatINR(overallStats.idleCapital)}</div>
          <div className="text-xs text-muted-foreground">{totalCapital > 0 ? ((overallStats.idleCapital / totalCapital) * 100).toFixed(1) : 0}%</div>
        </div>
        <div className="stat-card">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Strategies</div>
          <div className="text-lg font-bold mono text-primary">{visibleFiles.length}</div>
        </div>
      </div>

      {/* Capital Deployment Frequency Chart */}
      <div className="glass-panel">
        <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-1 border-b border-border pb-2">
          Capital Deployment Frequency
        </h3>
        <p className="text-xs text-muted-foreground mb-3">Number of strategies actively deployed each day (bars) — taller = more capital in use</p>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={deploymentChartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(217, 19%, 22%)" opacity={0.5} />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'hsl(215, 20%, 65%)' }} interval="preserveStartEnd" />
            <YAxis
              tick={{ fontSize: 11, fill: 'hsl(215, 20%, 65%)' }}
              domain={[0, visibleFiles.length]}
              allowDecimals={false}
              label={{ value: 'Active Strategies', angle: -90, position: 'insideLeft', fontSize: 10, fill: 'hsl(215, 20%, 65%)' }}
            />
            <Tooltip content={({ active, payload, label }: any) => {
              if (!active || !payload?.length) return null;
              const d = payload[0]?.payload;
              return (
                <div className="glass-panel text-xs py-1.5 px-2.5 !bg-card/95">
                  <p className="text-muted-foreground mb-1 font-semibold">{label}</p>
                  <p className="mono text-primary">Active: <span className="font-bold">{d?.activeStrategies}</span> / {visibleFiles.length} strategies</p>
                  <p className="mono text-success">Deployed: {formatINR(d?.totalUsed || 0)}</p>
                  <p className="mono text-muted-foreground">Util: {(d?.utilPct || 0).toFixed(1)}%</p>
                </div>
              );
            }} cursor={{ fill: 'hsl(215, 20%, 65%)', fillOpacity: 0.05 }} />
            <ReferenceLine y={visibleFiles.length} stroke="hsl(0, 72%, 51%)" strokeDasharray="5 5" label={{ value: 'Max', fontSize: 9, fill: 'hsl(0, 72%, 51%)' }} />
            <Bar dataKey="activeStrategies" radius={[2, 2, 0, 0]}>
              {deploymentChartData.map((entry, index) => (
                <Cell
                  key={index}
                  fill={entry.activeStrategies >= visibleFiles.length ? 'hsl(160, 84%, 39%)' : entry.activeStrategies > 0 ? 'hsl(199, 89%, 58%)' : 'hsl(215, 20%, 35%)'}
                  fillOpacity={0.7}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Monthly Utilization Table */}
      <div className="glass-panel">
        <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3 border-b border-border pb-2">
          Monthly Capital Utilization
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-muted-foreground font-semibold">
                <th className="py-2 px-2"></th>
                <th className="py-2 px-2">Month</th>
                <th className="py-2 px-2"><HeaderTip label="Avg Utilized" tip="Average capital deployed in trades during this month" /></th>
                <th className="py-2 px-2"><HeaderTip label="Util %" tip="Percentage of total capital that was actively in trades on average" /></th>
                <th className="py-2 px-2"><HeaderTip label="Max" tip="Highest capital deployed on any single day this month" /></th>
                <th className="py-2 px-2"><HeaderTip label="Min" tip="Lowest capital deployed on any single day this month" /></th>
                <th className="py-2 px-2"><HeaderTip label="Idle" tip="Average capital sitting unused (Total Capital − Avg Utilized)" /></th>
                <th className="py-2 px-2"><HeaderTip label="Full Deploy Days" tip="Days when ≥95% of total capital was in active trades vs total trading days" /></th>
                <th className="py-2 px-2"><HeaderTip label="Max Strats Active" tip="Peak number of strategies simultaneously in a trade on the same day vs total strategies" /></th>
                <th className="py-2 px-2">Recommendation</th>
              </tr>
            </thead>
            <tbody>
              {monthlyUtil.map(mu => {
                const isExp = expandedMonths.has(mu.month);
                const recommendation = mu.avgUtilPct < 30 ? 'Add strategies / reduce capital' :
                  mu.avgUtilPct < 60 ? 'Moderate – room for more' :
                  mu.avgUtilPct < 90 ? 'Good utilization' : 'Fully deployed';
                const recColor = mu.avgUtilPct < 30 ? 'text-destructive' :
                  mu.avgUtilPct < 60 ? 'text-warning' : 'text-success';

                return (
                  <>
                    <tr
                      key={mu.month}
                      className="border-t border-border/50 cursor-pointer hover:bg-surface-hover transition-colors"
                      onClick={() => toggleMonth(mu.month)}
                    >
                      <td className="py-2 px-2">
                        {isExp ? <ChevronDown size={14} className="text-primary" /> : <ChevronRight size={14} className="text-muted-foreground" />}
                      </td>
                      <td className="py-2 px-2 mono font-bold">{mu.month}</td>
                      <td className="py-2 px-2 mono text-success">{formatINR(mu.avgUtil)}</td>
                      <td className={`py-2 px-2 mono font-bold ${mu.avgUtilPct >= 60 ? 'text-success' : mu.avgUtilPct >= 30 ? 'text-warning' : 'text-destructive'}`}>
                        {mu.avgUtilPct.toFixed(1)}%
                      </td>
                      <td className="py-2 px-2 mono">{formatINR(mu.maxUtil)}</td>
                      <td className="py-2 px-2 mono">{formatINR(mu.minUtil)}</td>
                      <td className="py-2 px-2 mono text-muted-foreground">{formatINR(mu.idle)}</td>
                      <td className="py-2 px-2 mono text-center">
                        <span className={`font-bold ${mu.fullDeployDays > 0 ? 'text-success' : 'text-muted-foreground'}`}>
                          {mu.fullDeployDays}
                        </span>
                        <span className="text-muted-foreground"> / {mu.totalDays}</span>
                      </td>
                      <td className="py-2 px-2 mono text-center">
                        <span className={`font-bold ${mu.maxActiveStrategies >= visibleFiles.length ? 'text-success' : 'text-warning'}`}>
                          {mu.maxActiveStrategies}
                        </span>
                        <span className="text-muted-foreground"> / {visibleFiles.length}</span>
                      </td>
                      <td className={`py-2 px-2 text-xs ${recColor}`}>{recommendation}</td>
                    </tr>
                    {isExp && mu.files.map(fd => (
                      <tr key={`${mu.month}-${fd.name}`} className="border-t border-border/20 bg-background/30">
                        <td className="py-2 px-2"></td>
                        <td className="py-2 px-2 text-xs text-muted-foreground pl-6 truncate">{fd.name}</td>
                        <td colSpan={2} className="py-2 px-2 mono text-xs">
                          Active: <span className="text-success font-semibold">{fd.activeDays}</span> / {fd.totalDays} days
                        </td>
                        <td colSpan={2} className="py-2 px-2 mono text-xs">
                          Util: <span className={fd.utilPct >= 50 ? 'text-success' : 'text-warning'}>{fd.utilPct.toFixed(1)}%</span>
                        </td>
                        <td colSpan={4} className="py-2 px-2 mono text-xs text-muted-foreground">
                          Capital: {formatINR((visibleFiles.find(f => f.name === fd.name)?.capital || 0) * (visibleFiles.find(f => f.name === fd.name)?.multiplier || 1))}
                        </td>
                      </tr>
                    ))}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
