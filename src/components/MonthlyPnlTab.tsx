import { useMemo, useState, useEffect } from 'react';
import { useManualTrades } from '@/hooks/useManualTrades';
import { useAppContext } from '@/context/AppContext';
import { useSavedPortfolios } from '@/hooks/useDatabase';
import { calculateMetrics } from '@/lib/metrics';
import { parseCSV } from '@/lib/csv-parser';
import { formatINR } from '@/lib/format';
import { ChevronDown, ChevronRight, Info } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, AreaChart, Area } from 'recharts';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

function getColorForString(str: string): string {
  if (!str) return 'hsl(var(--foreground))';
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return `hsl(${Math.abs(hash % 360)}, 70%, 60%)`;
}

function buildLeaderboard(stats: Record<string, { pl: number; trades: number; wins: number; grossWin: number; grossLoss: number; maxDD: number }>) {
  return Object.entries(stats).map(([name, s]) => {
    const wr = s.trades > 0 ? (s.wins / s.trades * 100).toFixed(1) : '0.0';
    const al = (s.trades - s.wins) > 0 ? s.grossLoss / (s.trades - s.wins) : 0;
    const aw = s.wins > 0 ? s.grossWin / s.wins : 0;
    const rr = al > 0 ? (aw / al).toFixed(2) : aw > 0 ? 'MAX' : '0.00';
    return { name, ...s, winRate: wr, rr };
  }).sort((a, b) => b.pl - a.pl);
}

type DrillType = { kind: string; label: string; filterFn: (t: any) => boolean } | null;
type CalendarRange = 'week' | '15days' | 'month' | '3months' | 'year';

export default function MonthlyPnlTab() {
  const { trades } = useManualTrades();
  const { files } = useAppContext();
  const { portfolios } = useSavedPortfolios();
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);
  const [includeCurrent, setIncludeCurrent] = useState(true);
  const [chartView, setChartView] = useState<'monthly' | 'daily'>('monthly');
  const [calendarRange, setCalendarRange] = useState<CalendarRange>('year');
  const [drill, setDrill] = useState<DrillType>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const normalizeName = (s: string) => s.trim().toLowerCase().replace(/\.(csv|xlsx|xls)$/i, '').replace(/\s+/g, '');
  const [fileDDMapping, setFileDDMapping] = useState<Record<string, string[]>>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem('fifto-filedd-mapping') || '{}');
      const migrated: Record<string, string[]> = {};
      Object.entries(raw).forEach(([k, v]) => {
        const targetKey = normalizeName(k);
        const values = Array.isArray(v) ? v as string[] : [v as string];
        migrated[targetKey] = Array.from(new Set(values.filter(Boolean)));
      });
      return migrated;
    } catch { return {}; }
  });
  const [mappingTarget, setMappingTarget] = useState<string | null>(null); // name being mapped

  const completedTrades = useMemo(() => trades.filter(t => t.exitDate && t.pl !== 0), [trades]);

  useEffect(() => {
    localStorage.setItem('fifto-filedd-mapping', JSON.stringify(fileDDMapping));
  }, [fileDDMapping]);

  const getTargetKey = (name: string) => normalizeName(name);
  const getMappedFiles = (targetName: string) => fileDDMapping[getTargetKey(targetName)] || [];

  const savedPortfolioFiles = useMemo(() => {
    const latestByFile = new Map<string, any>();

    [...portfolios]
      .sort((a: any, b: any) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .forEach((portfolio: any) => {
        portfolio.files?.forEach((saved: any) => {
          if (!saved?.csvText) return;
          const key = normalizeName(saved.name || '');
          if (!key || latestByFile.has(key)) return;
          latestByFile.set(key, saved);
        });
      });

    return Array.from(latestByFile.values());
  }, [portfolios]);

  // Build file drawdown map: normalized name → max drawdown (multiplier-adjusted)
  const fileDDMap = useMemo(() => {
    const map = new Map<string, number>();

    const addToMap = (name: string, dd: number) => {
      map.set(normalizeName(name), dd);
    };

    // From currently loaded files
    files.filter(f => f.trades.length).forEach(f => {
      const adjustedTrades = f.trades.map(t => ({
        ...t,
        netPnl: t.netPnl * f.multiplier,
        drawdown: t.drawdown * f.multiplier,
      }));
      const metrics = calculateMetrics(adjustedTrades, f.capital);
      addToMap(f.name, metrics.maxDrawdown || 0);
    });

    savedPortfolioFiles.forEach((saved: any) => {
      const key = normalizeName(saved.name || '');
      if (!key || map.has(key) || !saved.csvText) return;

      const trades = parseCSV(saved.csvText, saved.name || '');
      if (!trades.length) return;

      const mult = saved.multiplier || 1;
      const adjustedTrades = trades.map((t: any) => ({
        ...t,
        netPnl: (t.netPnl || 0) * mult,
        drawdown: (t.drawdown || 0) * mult,
      }));
      const metrics = calculateMetrics(adjustedTrades, saved.capital || 0);
      addToMap(saved.name, metrics.maxDrawdown || 0);
    });

    return map;
  }, [files, savedPortfolioFiles]);

  // Helper to look up file DD: check manual mapping first, then auto-match
  const getFileDD = (name: string) => {
    const mappedFiles = getMappedFiles(name);
    if (mappedFiles && mappedFiles.length > 0) {
      return mappedFiles.reduce((sum, mf) => sum + (fileDDMap.get(normalizeName(mf)) || 0), 0);
    }
    return fileDDMap.get(normalizeName(name)) || 0;
  };

  // Get all available file names for the mapping dialog
  const availableFileNames = useMemo(() => {
    const namesSet = new Set<string>();
    files.forEach(f => { if (f.trades.length) namesSet.add(f.name); });
    savedPortfolioFiles.forEach((f: any) => { if (f.csvText) namesSet.add(f.name); });
    return Array.from(namesSet);
  }, [files, savedPortfolioFiles]);

  const saveMapping = (targetName: string, fileNames: string[]) => {
    const updated: Record<string, string[]> = { ...fileDDMapping, [getTargetKey(targetName)]: fileNames };
    setFileDDMapping(updated);
    setMappingTarget(null);
  };

  const toggleMappingFile = (targetName: string, fileName: string) => {
    const targetKey = getTargetKey(targetName);
    const current = fileDDMapping[targetKey] || [];
    const updated = current.includes(fileName)
      ? current.filter(f => f !== fileName)
      : [...current, fileName];
    const newMapping: Record<string, string[]> = { ...fileDDMapping, [targetKey]: updated };
    setFileDDMapping(newMapping);
  };

  const clearMapping = (targetName: string) => {
    const updated: Record<string, string[]> = { ...fileDDMapping };
    delete updated[getTargetKey(targetName)];
    setFileDDMapping(updated);
  };

  // Daily P&L map for calendar
  const dailyPLMap = useMemo(() => {
    const map = new Map<string, number>();
    completedTrades.forEach(t => {
      map.set(t.exitDate, (map.get(t.exitDate) || 0) + t.pl);
    });
    return map;
  }, [completedTrades]);

  // Calendar months based on range
  const calendarMonths = useMemo(() => {
    const now = new Date();
    let monthsBack = 12;
    if (calendarRange === 'week') monthsBack = 1;
    else if (calendarRange === '15days') monthsBack = 1;
    else if (calendarRange === 'month') monthsBack = 1;
    else if (calendarRange === '3months') monthsBack = 3;
    else monthsBack = 12;

    const months: { year: number; month: number; label: string }[] = [];
    for (let i = monthsBack - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        year: d.getFullYear(),
        month: d.getMonth(),
        label: d.toLocaleDateString('en', { month: 'short', year: '2-digit' }).toUpperCase(),
      });
    }
    return months;
  }, [calendarRange]);

  // Selected range total
  const calendarTotal = useMemo(() => {
    let total = 0;
    dailyPLMap.forEach(v => total += v);
    return total;
  }, [dailyPLMap]);

  const monthlyData = useMemo(() => {
    const now = new Date();
    const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const map = new Map<string, { trades: typeof completedTrades; pl: number; wins: number; grossWin: number; grossLoss: number; owners: Record<string, number>; types: Record<string, number>; days: Record<string, number> }>();

    completedTrades.forEach(t => {
      const d = new Date(t.exitDate);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!includeCurrent && key === currentKey) return;

      const entry = map.get(key) || { trades: [], pl: 0, wins: 0, grossWin: 0, grossLoss: 0, owners: {}, types: {}, days: {} };
      entry.trades.push(t);
      entry.pl += t.pl;
      if (t.pl > 0) { entry.wins++; entry.grossWin += t.pl; }
      else entry.grossLoss += Math.abs(t.pl);
      if (t.owner) entry.owners[t.owner] = (entry.owners[t.owner] || 0) + t.pl;
      if (t.type) entry.types[t.type] = (entry.types[t.type] || 0) + t.pl;
      entry.days[t.exitDate] = (entry.days[t.exitDate] || 0) + t.pl;
      map.set(key, entry);
    });

    return Array.from(map.entries()).sort(([a], [b]) => b.localeCompare(a)).map(([key, data]) => {
      const label = new Date(key + '-01').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
      const winRate = data.trades.length ? (data.wins / data.trades.length * 100).toFixed(1) : '0.0';
      const pf = data.grossLoss > 0 ? (data.grossWin / data.grossLoss).toFixed(2) : data.grossWin > 0 ? 'MAX' : '0.00';
      return { key, label, ...data, winRate, profitFactor: pf };
    });
  }, [completedTrades, includeCurrent]);

  // Overall performance stats (all-time)
  const overallStats = useMemo(() => {
    const sorted = [...completedTrades].sort((a, b) => a.exitDate.localeCompare(b.exitDate));
    if (!sorted.length) return null;

    let totalPL = 0, wins = 0, grossWin = 0, grossLoss = 0;
    const ownerMap: Record<string, { pl: number; trades: number; wins: number; grossWin: number; grossLoss: number; maxDD: number; peak: number; cum: number }> = {};
    const typeMap: Record<string, { pl: number; trades: number; wins: number; grossWin: number; grossLoss: number; maxDD: number; peak: number; cum: number }> = {};
    const subCatMap: Record<string, { pl: number; trades: number; wins: number; grossWin: number; grossLoss: number; maxDD: number; peak: number; cum: number }> = {};
    const detailedMap: Record<string, { owner: string; type: string; pl: number; trades: number; maxDD: number; peak: number; cum: number }> = {};
    let maxDD = 0, peak = 0, cum = 0;
    let bestStreak = 0, worstStreak = 0, curWin = 0, curLoss = 0;
    let bigWin: typeof sorted[0] | null = null, bigLoss: typeof sorted[0] | null = null;

    sorted.forEach(t => {
      totalPL += t.pl; cum += t.pl;
      if (cum > peak) peak = cum;
      if (peak - cum > maxDD) maxDD = peak - cum;
      if (t.pl > 0) { wins++; grossWin += t.pl; curWin++; curLoss = 0; if (curWin > bestStreak) bestStreak = curWin; if (!bigWin || t.pl > bigWin.pl) bigWin = t; }
      else if (t.pl < 0) { grossLoss += Math.abs(t.pl); curLoss++; curWin = 0; if (curLoss > worstStreak) worstStreak = curLoss; if (!bigLoss || t.pl < bigLoss.pl) bigLoss = t; }

      const addTo = (map: any, key: string) => {
        if (!key) return;
        if (!map[key]) map[key] = { pl: 0, trades: 0, wins: 0, grossWin: 0, grossLoss: 0, maxDD: 0, peak: 0, cum: 0 };
        map[key].pl += t.pl; map[key].trades++; map[key].cum += t.pl;
        if (map[key].cum > map[key].peak) map[key].peak = map[key].cum;
        if (map[key].peak - map[key].cum > map[key].maxDD) map[key].maxDD = map[key].peak - map[key].cum;
        if (t.pl > 0) { map[key].wins++; map[key].grossWin += t.pl; }
        else if (t.pl < 0) map[key].grossLoss += Math.abs(t.pl);
      };
      addTo(ownerMap, t.owner);
      addTo(typeMap, t.type);
      if (t.subCategory && t.subCategory.trim()) addTo(subCatMap, t.subCategory);
      if (t.owner && t.type) {
        const key = `${t.owner}|${t.type}`;
        if (!detailedMap[key]) detailedMap[key] = { owner: t.owner, type: t.type, pl: 0, trades: 0, maxDD: 0, peak: 0, cum: 0 };
        detailedMap[key].pl += t.pl; detailedMap[key].trades++; detailedMap[key].cum += t.pl;
        if (detailedMap[key].cum > detailedMap[key].peak) detailedMap[key].peak = detailedMap[key].cum;
        if (detailedMap[key].peak - detailedMap[key].cum > detailedMap[key].maxDD) detailedMap[key].maxDD = detailedMap[key].peak - detailedMap[key].cum;
      }
    });

    const total = sorted.length, losses = total - wins;
    const winRate = total > 0 ? (wins / total) * 100 : 0;
    const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0;
    const avgWin = wins > 0 ? grossWin / wins : 0, avgLoss = losses > 0 ? grossLoss / losses : 0;
    const expectancy = total > 0 ? (winRate / 100 * avgWin) - ((100 - winRate) / 100 * avgLoss) : 0;
    const recoveryFactor = maxDD > 0 ? totalPL / maxDD : totalPL > 0 ? 100 : 0;
    const rrRatio = avgLoss > 0 ? avgWin / avgLoss : avgWin > 0 ? 100 : 0;
    const avgPL = monthlyData.length ? totalPL / monthlyData.length : 0;
    const bestMonth = monthlyData.length ? monthlyData.reduce((a, b) => a.pl > b.pl ? a : b) : null;
    const worstMonth = monthlyData.length ? monthlyData.reduce((a, b) => a.pl < b.pl ? a : b) : null;

    return {
      totalPL, total, winRate, profitFactor, expectancy, recoveryFactor, rrRatio, maxDD, bestStreak, worstStreak, bigWin, bigLoss, avgPL, bestMonth, worstMonth,
      ownerList: buildLeaderboard(ownerMap),
      typeList: buildLeaderboard(typeMap),
      subCatList: buildLeaderboard(subCatMap),
      detailedList: Object.values(detailedMap).sort((a, b) => b.pl - a.pl),
      allTrades: sorted,
    };
  }, [completedTrades, monthlyData]);

  const chartData = useMemo(() => {
    if (chartView === 'monthly') {
      return [...monthlyData].reverse().map(m => ({ name: m.label, pnl: m.pl, grossWin: m.grossWin, grossLoss: m.grossLoss }));
    }
    const dailyMap = new Map<string, { pnl: number; grossWin: number; grossLoss: number }>();
    completedTrades.forEach(t => {
      const d = dailyMap.get(t.exitDate) || { pnl: 0, grossWin: 0, grossLoss: 0 };
      d.pnl += t.pl;
      if (t.pl > 0) d.grossWin += t.pl;
      else if (t.pl < 0) d.grossLoss += Math.abs(t.pl);
      dailyMap.set(t.exitDate, d);
    });
    return Array.from(dailyMap.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([name, d]) => ({ name, ...d }));
  }, [monthlyData, completedTrades, chartView]);

  // Drill-down data
  const drillData = useMemo(() => {
    if (!drill || !overallStats) return null;
    const filtered = overallStats.allTrades.filter(t => drill.filterFn(t));
    if (!filtered.length) return null;
    let totalPL = 0, wins = 0, grossWin = 0, grossLoss = 0, maxDD = 0, peak = 0, cum = 0;
    const equityData: { date: string; equity: number; pl: number }[] = [];
    filtered.forEach(t => {
      totalPL += t.pl; cum += t.pl;
      if (cum > peak) peak = cum;
      if (peak - cum > maxDD) maxDD = peak - cum;
      if (t.pl > 0) { wins++; grossWin += t.pl; } else if (t.pl < 0) grossLoss += Math.abs(t.pl);
      equityData.push({ date: t.exitDate, equity: cum, pl: t.pl });
    });
    const total = filtered.length;
    const winRate = total > 0 ? (wins / total * 100) : 0;
    const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0;
    return { label: drill.label, totalPL, maxDD, winRate, profitFactor, trades: filtered, equityData };
  }, [drill, overallStats]);

  if (!completedTrades.length) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] text-center animate-fade-in">
        <div className="text-6xl mb-4">📅</div>
        <h2 className="text-2xl font-bold text-foreground mb-2">No Monthly Data</h2>
        <p className="text-muted-foreground">Add trades with exit dates in P&L Entry to see monthly stats.</p>
      </div>
    );
  }

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const data = payload[0]?.payload;
    const netVal = payload[0]?.value ?? 0;
    return (
      <div className="bg-card border border-border rounded-lg px-3 py-2 text-xs shadow-lg">
        <div className="text-muted-foreground mb-1">{label}</div>
        <div className="font-bold mono" style={{ color: netVal >= 0 ? 'hsl(var(--success))' : 'hsl(var(--destructive))' }}>
          Net: {formatINR(netVal)}
        </div>
        {data?.pl !== undefined && (
          <div className="mono" style={{ color: data.pl >= 0 ? 'hsl(var(--success))' : 'hsl(var(--destructive))' }}>
            P/L: {formatINR(data.pl)}
          </div>
        )}
        {data?.grossWin > 0 && (
          <div className="mono text-success">Profit: {formatINR(data.grossWin)}</div>
        )}
        {data?.grossLoss > 0 && (
          <div className="mono text-destructive">Loss: {formatINR(-data.grossLoss)}</div>
        )}
      </div>
    );
  };

  const openDrill = (kind: string, label: string, filterFn: (t: any) => boolean) => setDrill({ kind, label, filterFn });

  const LeaderTable = ({ title, list, onRowClick }: { title: string; list: ReturnType<typeof buildLeaderboard>; onRowClick: (name: string) => void }) => (
    <div className="glass-panel">
      <h3 className="text-sm font-bold uppercase tracking-wider text-primary mb-3">{title}</h3>
      {list.length === 0 ? <p className="text-xs text-muted-foreground text-center py-3">No data</p> : (
        <table className="w-full text-sm">
          <thead>
             <tr className="text-xs uppercase text-muted-foreground font-semibold border-b border-border">
               <th className="py-2 w-10 text-center">Rank</th>
               <th className="py-2 text-left">Name</th>
               <th className="py-2 text-right">P/L</th>
               <th className="py-2 text-right">Trades</th>
               <th className="py-2 text-right">Win %</th>
               <th className="py-2 text-right">Drawdown</th>
               <th className="py-2 text-right">File DD</th>
               <th className="py-2 text-right">RR</th>
             </tr>
           </thead>
           <tbody>
             {list.map((s, i) => {
               const fileDD = getFileDD(s.name);
               return (
               <tr key={s.name} className="border-b border-border/20 hover:bg-surface-hover cursor-pointer transition-colors" onClick={() => onRowClick(s.name)}>
                 <td className="py-2.5 text-center text-muted-foreground">{i + 1}</td>
                 <td className="py-2.5 font-semibold" style={{ color: getColorForString(s.name) }}>{s.name}</td>
                 <td className={`py-2.5 text-right mono font-bold ${s.pl >= 0 ? 'text-success' : 'text-destructive'}`}>{formatINR(s.pl)}</td>
                 <td className="py-2.5 text-right mono">{s.trades}</td>
                 <td className="py-2.5 text-right mono">{s.winRate}%</td>
                 <td className="py-2.5 text-right mono text-destructive">{s.maxDD > 0 ? formatINR(s.maxDD) : '—'}</td>
                 <td className="py-2.5 text-right mono text-orange-400">
                   {fileDD > 0 ? (
                     <span className="cursor-pointer hover:underline" onClick={(e) => { e.stopPropagation(); setMappingTarget(s.name); }}>{formatINR(fileDD)}</span>
                   ) : (
                     <span className="cursor-pointer hover:text-primary transition-colors" onClick={(e) => { e.stopPropagation(); setMappingTarget(s.name); }}>—</span>
                   )}
                 </td>
                 <td className="py-2.5 text-right mono">{s.rr}</td>
               </tr>
               );
             })}
          </tbody>
        </table>
      )}
    </div>
  );

  // Calendar helper: get days grid for a month
  const getMonthGrid = (year: number, month: number) => {
    const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: (string | null)[] = [];
    // Pad start (Mon=0 shift)
    const startPad = firstDay === 0 ? 6 : firstDay - 1;
    for (let i = 0; i < startPad; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push(dateStr);
    }
    return cells;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Toggle */}
      <div className="flex justify-end">
        <label className="flex items-center gap-2 text-xs bg-card/50 border border-border rounded-full px-4 py-1.5 cursor-pointer">
          <span className="text-muted-foreground font-medium">Include Current Month</span>
          <input type="checkbox" checked={includeCurrent} onChange={e => setIncludeCurrent(e.target.checked)} />
        </label>
      </div>

      {/* ═══ TRADING CALENDAR ═══ */}
      <div className="glass-panel">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <h3 className="text-base font-extrabold text-foreground">Trading Calendar</h3>
            <span className="bg-primary/15 border border-primary/30 rounded-full px-3 py-1 text-xs font-bold mono text-primary">
              Selected Range Total: {formatINR(calendarTotal)}
            </span>
          </div>
          <div className="flex items-center gap-3 text-[0.65rem]">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-success inline-block" /> Profit</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-destructive inline-block" /> Loss</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-muted inline-block" /> No Trade</span>
          </div>
        </div>

        {/* Range buttons */}
        <div className="flex items-center gap-2 mb-5">
          <span className="text-xs text-muted-foreground font-medium">Date Range:</span>
          {([['week', 'Week'], ['15days', '15 Days'], ['month', 'Month'], ['3months', '3 Months'], ['year', 'Year']] as [CalendarRange, string][]).map(([val, label]) => (
            <button key={val} onClick={() => setCalendarRange(val)}
              className={`px-3 py-1 text-xs rounded-md font-semibold transition-all ${calendarRange === val ? 'bg-primary text-primary-foreground' : 'bg-card border border-border text-muted-foreground hover:text-foreground'}`}>
              {label}
            </button>
          ))}
        </div>

        {/* Calendar Grid */}
        <div className="flex gap-4 overflow-x-auto pb-3">
          {calendarMonths.map(m => {
            const cells = getMonthGrid(m.year, m.month);
            const monthPL = cells.filter(Boolean).reduce((s, d) => s + (dailyPLMap.get(d!) || 0), 0);
            return (
              <div key={m.label} className="flex-shrink-0">
                <div className="text-[0.6rem] font-bold uppercase tracking-wider text-muted-foreground mb-2">{m.label}</div>
                <div className="grid grid-cols-7 gap-[3px] text-[0.5rem] text-muted-foreground/60 mb-1">
                  {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <div key={i} className="w-5 h-3 text-center">{d}</div>)}
                </div>
                <div className="grid grid-cols-7 gap-[3px]">
                  {cells.map((dateStr, i) => {
                    if (!dateStr) return <div key={i} className="w-5 h-5" />;
                    const pnl = dailyPLMap.get(dateStr);
                    const isSelected = selectedDate === dateStr;
                    return (
                      <div key={i}
                        onClick={() => pnl !== undefined && setSelectedDate(dateStr)}
                        className={`w-5 h-5 rounded-[3px] transition-all ${pnl !== undefined ? `cursor-pointer hover:ring-2 hover:ring-primary/60 ${pnl >= 0 ? 'bg-success' : 'bg-destructive'}` : 'bg-muted/30'} ${isSelected ? 'ring-2 ring-primary scale-125' : ''}`}
                        title={`${dateStr}: ${pnl !== undefined ? formatINR(pnl) : 'No trade'}`} />
                    );
                  })}
                </div>
                <div className={`text-[0.55rem] font-bold mono mt-1.5 ${monthPL > 0 ? 'text-success' : monthPL < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                  {formatINR(monthPL)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ═══ OVERALL SUMMARY CARDS ═══ */}
      {overallStats && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Total P&L', sub: 'ALL TIME', value: formatINR(overallStats.totalPL), color: overallStats.totalPL >= 0 ? 'text-success' : 'text-destructive' },
              { label: 'Avg Monthly P&L', sub: 'PER MONTH', value: formatINR(overallStats.avgPL), color: overallStats.avgPL >= 0 ? 'text-success' : 'text-destructive' },
              { label: 'Best Month', sub: overallStats.bestMonth?.label || '', value: overallStats.bestMonth ? formatINR(overallStats.bestMonth.pl) : '--', color: 'text-success' },
              { label: 'Worst Month', sub: overallStats.worstMonth?.label || '', value: overallStats.worstMonth ? formatINR(overallStats.worstMonth.pl) : '--', color: 'text-destructive' },
            ].map(c => (
              <div key={c.label} className="glass-panel !py-5 !px-4 relative">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[0.6rem] uppercase tracking-widest text-muted-foreground font-semibold">{c.label}</span>
                  <Info size={13} className="text-muted-foreground/40" />
                </div>
                <div className={`text-3xl lg:text-4xl font-extrabold mono leading-tight ${c.color}`}>{c.value}</div>
                <div className="text-[0.55rem] uppercase tracking-wider text-muted-foreground/60 mt-1.5">{c.sub}</div>
              </div>
            ))}
          </div>

          {/* Advanced Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3">
            {[
              { label: 'Total Trades', sub: 'COUNT', value: overallStats.total.toString(), color: 'text-foreground' },
              { label: 'Win Rate', sub: 'PROFITABLE', value: `${overallStats.winRate.toFixed(1)}%`, color: overallStats.winRate >= 50 ? 'text-success' : 'text-destructive' },
              { label: 'Profit Factor', sub: 'GROSS W/L', value: overallStats.profitFactor === Infinity ? '∞' : overallStats.profitFactor.toFixed(2), color: overallStats.profitFactor >= 1 ? 'text-success' : 'text-destructive' },
              { label: 'Expectancy', sub: 'PER TRADE', value: overallStats.expectancy.toFixed(2), color: overallStats.expectancy >= 0 ? 'text-success' : 'text-destructive' },
              { label: 'Max Drawdown', sub: 'PEAK TO TROUGH', value: formatINR(-overallStats.maxDD), color: 'text-destructive' },
              { label: 'Recovery Factor', sub: 'P&L / MAX DD', value: overallStats.recoveryFactor.toFixed(2), color: overallStats.recoveryFactor >= 1 ? 'text-success' : 'text-destructive' },
              { label: 'Risk : Reward', sub: 'AVG W / AVG L', value: overallStats.rrRatio.toFixed(2), color: overallStats.rrRatio >= 1 ? 'text-success' : 'text-destructive' },
            ].map(c => (
              <div key={c.label} className="glass-panel !py-5 !px-4 relative">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[0.6rem] uppercase tracking-widest text-muted-foreground font-semibold">{c.label}</span>
                  <Info size={13} className="text-muted-foreground/40" />
                </div>
                <div className={`text-2xl lg:text-3xl font-extrabold mono leading-tight ${c.color}`}>{c.value}</div>
                <div className="text-[0.55rem] uppercase tracking-wider text-muted-foreground/60 mt-1.5">{c.sub}</div>
              </div>
            ))}
          </div>

          {/* Streaks row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Best Streak', sub: 'CONSECUTIVE WINS', value: overallStats.bestStreak.toString(), color: 'text-success' },
              { label: 'Worst Streak', sub: 'CONSECUTIVE LOSSES', value: overallStats.worstStreak.toString(), color: 'text-destructive' },
              { label: 'Biggest Win', sub: overallStats.bigWin ? `${overallStats.bigWin.owner} • ${overallStats.bigWin.type}` : '', value: overallStats.bigWin ? formatINR(overallStats.bigWin.pl) : '--', color: 'text-success' },
              { label: 'Biggest Loss', sub: overallStats.bigLoss ? `${overallStats.bigLoss.owner} • ${overallStats.bigLoss.type}` : '', value: overallStats.bigLoss ? formatINR(overallStats.bigLoss.pl) : '--', color: 'text-destructive' },
            ].map(c => (
              <div key={c.label} className="glass-panel !py-5 !px-4 relative">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[0.6rem] uppercase tracking-widest text-muted-foreground font-semibold">{c.label}</span>
                  <Info size={13} className="text-muted-foreground/40" />
                </div>
                <div className={`text-2xl lg:text-3xl font-extrabold mono leading-tight ${c.color}`}>{c.value}</div>
                <div className="text-[0.55rem] uppercase tracking-wider text-muted-foreground/60 mt-1.5">{c.sub}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* P&L Trend Chart */}
      <div className="glass-panel">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-sm font-bold uppercase tracking-wider text-primary">P&L Trend</h3>
          <div className="flex bg-background border border-border rounded-lg p-0.5 gap-0.5">
            <button onClick={() => setChartView('monthly')} className={`px-3 py-1 text-[0.65rem] rounded font-medium transition-all ${chartView === 'monthly' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>Monthly</button>
            <button onClick={() => setChartView('daily')} className={`px-3 py-1 text-[0.65rem] rounded font-medium transition-all ${chartView === 'daily' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>Daily</button>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={chartData} style={{ background: 'transparent' }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="name" tick={{ fontSize: 8, fill: 'hsl(var(--muted-foreground))' }} />
            <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted) / 0.3)' }} />
            <Bar dataKey="pnl" radius={[3, 3, 0, 0]}>
              {chartData.map((d, i) => (
                <Cell key={i} fill={d.pnl >= 0 ? 'hsl(var(--success))' : 'hsl(var(--destructive))'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ═══ OVERALL OWNER + TYPE PERFORMANCE ═══ */}
      {overallStats && (
        <>
          {/* Owner + Type Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="glass-panel">
              <h3 className="text-sm font-bold uppercase tracking-wider text-primary mb-3">Owner P&L Graph (Overall)</h3>
              <ResponsiveContainer width="100%" height={Math.max(180, overallStats.ownerList.length * 40)}>
                <BarChart data={overallStats.ownerList} layout="vertical" style={{ background: 'transparent' }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} width={110} />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted) / 0.3)' }} />
                  <Bar dataKey="pl" radius={[0, 4, 4, 0]}>
                    {overallStats.ownerList.map((d, i) => (
                      <Cell key={i} fill={d.pl >= 0 ? 'hsl(var(--success))' : 'hsl(var(--destructive))'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="glass-panel">
              <h3 className="text-sm font-bold uppercase tracking-wider text-primary mb-3">Type P&L Graph (Overall)</h3>
              <ResponsiveContainer width="100%" height={Math.max(180, overallStats.typeList.length * 40)}>
                <BarChart data={overallStats.typeList} layout="vertical" style={{ background: 'transparent' }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} width={110} />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted) / 0.3)' }} />
                  <Bar dataKey="pl" radius={[0, 4, 4, 0]}>
                    {overallStats.typeList.map((d, i) => (
                      <Cell key={i} fill={d.pl >= 0 ? 'hsl(var(--success))' : 'hsl(var(--destructive))'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Owner + Type Tables */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <LeaderTable title="Overall Owner Performance" list={overallStats.ownerList}
              onRowClick={name => openDrill('owner', `Owner: ${name} (Overall)`, t => t.owner === name)} />
            <LeaderTable title="Overall Type Performance" list={overallStats.typeList}
              onRowClick={name => openDrill('type', `Type: ${name} (Overall)`, t => t.type === name)} />
          </div>

          {/* SubCategory */}
          {overallStats.subCatList.length > 0 && (
            <LeaderTable title="Overall Sub Category Performance" list={overallStats.subCatList}
              onRowClick={name => openDrill('subCategory', `Sub Category: ${name} (Overall)`, t => t.subCategory === name)} />
          )}

          {/* Detailed */}
          {overallStats.detailedList.length > 0 && (
            <div className="glass-panel">
              <h3 className="text-sm font-bold uppercase tracking-wider text-primary mb-3">Overall Detailed Performance (Owner + Type)</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase text-muted-foreground font-semibold border-b border-border">
                    <th className="py-2 w-10 text-center">Rank</th>
                    <th className="py-2 text-left">Owner</th>
                    <th className="py-2 text-left">Type</th>
                    <th className="py-2 text-right">P/L</th>
                    <th className="py-2 text-right">Trades</th>
                    <th className="py-2 text-right">Drawdown</th>
                    <th className="py-2 text-right">File DD</th>
                  </tr>
                </thead>
                <tbody>
                  {overallStats.detailedList.map((s, i) => {
                    const fileDD = getFileDD(s.type);
                    return (
                    <tr key={`${s.owner}-${s.type}`} className="border-b border-border/20 hover:bg-surface-hover cursor-pointer transition-colors"
                      onClick={() => openDrill('detailed', `${s.owner} — ${s.type} (Overall)`, t => t.owner === s.owner && t.type === s.type)}>
                      <td className="py-2.5 text-center text-muted-foreground">{i + 1}</td>
                      <td className="py-2.5 font-semibold" style={{ color: getColorForString(s.owner) }}>{s.owner}</td>
                      <td className="py-2.5 text-foreground font-medium">{s.type}</td>
                      <td className={`py-2.5 text-right mono font-bold ${s.pl >= 0 ? 'text-success' : 'text-destructive'}`}>{formatINR(s.pl)}</td>
                      <td className="py-2.5 text-right mono">{s.trades}</td>
                      <td className="py-2.5 text-right mono text-destructive">{s.maxDD > 0 ? formatINR(s.maxDD) : '—'}</td>
                      <td className="py-2.5 text-right mono text-orange-400">
                        {fileDD > 0 ? (
                          <span className="cursor-pointer hover:underline" onClick={(e) => { e.stopPropagation(); setMappingTarget(s.type); }}>{formatINR(fileDD)}</span>
                        ) : (
                          <span className="cursor-pointer hover:text-primary transition-colors" onClick={(e) => { e.stopPropagation(); setMappingTarget(s.type); }}>—</span>
                        )}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Monthly Performance Table */}
      <div className="glass-panel">
        <h3 className="text-sm font-bold uppercase tracking-wider text-primary mb-3">Monthly Performance</h3>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[0.6rem] uppercase text-muted-foreground font-semibold border-b border-border">
              <th className="py-2 w-6"></th>
              <th className="py-2 text-left">Month</th>
              <th className="py-2 text-right">P/L</th>
              <th className="py-2 text-right">Trades</th>
              <th className="py-2 text-right">Win Rate</th>
              <th className="py-2 text-right">Profit Factor</th>
            </tr>
          </thead>
          <tbody>
            {monthlyData.map(m => (
              <>
                <tr key={m.key} className="border-b border-border/20 hover:bg-surface-hover cursor-pointer transition-colors"
                  onClick={() => setExpandedMonth(expandedMonth === m.key ? null : m.key)}>
                  <td className="py-2">{expandedMonth === m.key ? <ChevronDown size={12} className="text-primary" /> : <ChevronRight size={12} className="text-muted-foreground" />}</td>
                  <td className="py-2 font-bold text-foreground">{m.label}</td>
                  <td className={`py-2 text-right mono font-bold ${m.pl >= 0 ? 'text-success' : 'text-destructive'}`}>{formatINR(m.pl)}</td>
                  <td className="py-2 text-right mono">{m.trades.length}</td>
                  <td className="py-2 text-right mono">{m.winRate}%</td>
                  <td className="py-2 text-right mono">{m.profitFactor}</td>
                </tr>
                {expandedMonth === m.key && (
                  <tr key={`${m.key}-details`}>
                    <td colSpan={6} className="py-4 px-5 bg-background/50">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
                        <div>
                          <h4 className="font-bold text-primary text-xs uppercase mb-3 tracking-wider">Day Breakdown</h4>
                          {Object.entries(m.days).sort(([a], [b]) => b.localeCompare(a)).map(([date, pnl]) => (
                            <div key={date} className="flex justify-between py-1">
                              <span className="mono text-muted-foreground">{date}</span>
                              <span className={`mono font-bold ${pnl >= 0 ? 'text-success' : 'text-destructive'}`}>{formatINR(pnl)}</span>
                            </div>
                          ))}
                        </div>
                        <div>
                          <h4 className="font-bold text-primary text-xs uppercase mb-3 tracking-wider">Owner Breakdown</h4>
                          {Object.entries(m.owners).sort(([, a], [, b]) => b - a).map(([owner, pnl]) => (
                            <div key={owner} className="flex justify-between py-1">
                              <span style={{ color: getColorForString(owner) }} className="font-semibold">{owner}</span>
                              <span className={`mono font-bold ${pnl >= 0 ? 'text-success' : 'text-destructive'}`}>{formatINR(pnl)}</span>
                            </div>
                          ))}
                        </div>
                        <div>
                          <h4 className="font-bold text-primary text-xs uppercase mb-3 tracking-wider">Type Breakdown</h4>
                          {Object.entries(m.types).sort(([, a], [, b]) => b - a).map(([type, pnl]) => (
                            <div key={type} className="flex justify-between py-1">
                              <span className="text-foreground font-medium">{type}</span>
                              <span className={`mono font-bold ${pnl >= 0 ? 'text-success' : 'text-destructive'}`}>{formatINR(pnl)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>

      {/* ═══ DATE CLICK POPUP ═══ */}
      <Dialog open={!!selectedDate} onOpenChange={() => setSelectedDate(null)}>
        <DialogContent className="max-w-lg bg-card border-border">
          {selectedDate && (() => {
            const dayTrades = completedTrades.filter(t => t.exitDate === selectedDate);
            const dayPL = dailyPLMap.get(selectedDate) || 0;
            const dayWins = dayTrades.filter(t => t.pl > 0).length;
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="text-lg font-bold flex items-center gap-3">
                    <span>{new Date(selectedDate).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
                    <span className={`text-xl mono font-extrabold ${dayPL >= 0 ? 'text-success' : 'text-destructive'}`}>{formatINR(dayPL)}</span>
                  </DialogTitle>
                </DialogHeader>

                <div className="grid grid-cols-3 gap-3 mt-3">
                  <div className="glass-panel !py-3 text-center">
                    <div className="text-2xl font-extrabold mono text-foreground">{dayTrades.length}</div>
                    <div className="text-[0.6rem] uppercase tracking-wider text-muted-foreground mt-1">Trades</div>
                  </div>
                  <div className="glass-panel !py-3 text-center">
                    <div className="text-2xl font-extrabold mono text-success">{dayWins}</div>
                    <div className="text-[0.6rem] uppercase tracking-wider text-muted-foreground mt-1">Wins</div>
                  </div>
                  <div className="glass-panel !py-3 text-center">
                    <div className="text-2xl font-extrabold mono text-destructive">{dayTrades.length - dayWins}</div>
                    <div className="text-[0.6rem] uppercase tracking-wider text-muted-foreground mt-1">Losses</div>
                  </div>
                </div>

                {dayTrades.length > 0 && (
                  <div className="mt-4">
                    <h4 className="text-sm font-bold uppercase tracking-wider text-primary mb-3">Trades</h4>
                    <div className="space-y-2">
                      {dayTrades.map(t => (
                        <div key={t.id} className="flex items-center justify-between bg-background rounded-lg px-4 py-3 border border-border/30">
                          <div className="flex items-center gap-3">
                            <div className={`w-2 h-8 rounded-full ${t.pl >= 0 ? 'bg-success' : 'bg-destructive'}`} />
                            <div>
                              <div className="font-semibold text-sm" style={{ color: getColorForString(t.owner) }}>{t.owner}</div>
                              <div className="text-xs text-muted-foreground">{t.type}{t.subCategory ? ` • ${t.subCategory}` : ''}</div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className={`text-base font-bold mono ${t.pl >= 0 ? 'text-success' : 'text-destructive'}`}>{formatINR(t.pl)}</div>
                            {t.remark && <div className="text-[0.6rem] text-muted-foreground/60 italic">{t.remark}</div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ═══ DRILL-DOWN POPUP ═══ */}
      <Dialog open={!!drill} onOpenChange={() => setDrill(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto bg-card border-border">
          {drillData && (
            <>
              <DialogHeader>
                <DialogTitle className="text-lg font-bold">{drillData.label}</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                {[
                  { label: 'Total P/L', value: formatINR(drillData.totalPL), color: drillData.totalPL >= 0 ? 'text-success' : 'text-destructive' },
                  { label: 'Max Drawdown', value: formatINR(drillData.maxDD), color: 'text-destructive' },
                  { label: 'Win Rate', value: `${drillData.winRate.toFixed(1)}%`, color: drillData.winRate >= 50 ? 'text-foreground' : 'text-destructive' },
                  { label: 'Profit Factor', value: drillData.profitFactor === Infinity ? '∞' : drillData.profitFactor.toFixed(2), color: 'text-foreground' },
                ].map(c => (
                  <div key={c.label} className="glass-panel !py-3 text-center">
                    <div className={`text-lg font-bold mono ${c.color}`}>{c.value}</div>
                    <div className="text-[0.6rem] uppercase tracking-wider text-muted-foreground">{c.label}</div>
                  </div>
                ))}
              </div>
              <div className="glass-panel mt-4">
                <h4 className="text-sm font-bold mb-2">Equity Curve</h4>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={drillData.equityData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
                    <Tooltip content={<CustomTooltip />} />
                    <defs>
                      <linearGradient id="monthDrillGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(199, 89%, 58%)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(199, 89%, 58%)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Area type="monotone" dataKey="equity" stroke="hsl(199, 89%, 58%)" fill="url(#monthDrillGrad)" strokeWidth={2} dot={{ r: 3 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4">
                <h4 className="text-sm font-bold uppercase tracking-wider text-primary mb-3">Trade Details</h4>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs uppercase text-muted-foreground font-semibold border-b border-border">
                      <th className="py-2 text-left">Date</th>
                      <th className="py-2 text-left">Owner</th>
                      <th className="py-2 text-left">Type</th>
                      <th className="py-2 text-left">Sub Cat</th>
                      <th className="py-2 text-left">Exit Date</th>
                      <th className="py-2 text-right">P/L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {drillData.trades.map((t: any) => (
                      <tr key={t.id} className="border-b border-border/20 hover:bg-surface-hover">
                        <td className="py-2.5 text-sky-300">{t.date}</td>
                        <td className="py-2.5 font-semibold" style={{ color: getColorForString(t.owner) }}>{t.owner}</td>
                        <td className="py-2.5 font-medium text-foreground">{t.type}</td>
                        <td className="py-2.5 text-muted-foreground">{t.subCategory || '--'}</td>
                        <td className="py-2.5 text-sky-300">{t.exitDate}</td>
                        <td className={`py-2.5 text-right mono font-bold ${t.pl >= 0 ? 'text-success' : 'text-destructive'}`}>{formatINR(t.pl)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* File DD Manual Mapping Dialog */}
      <Dialog open={!!mappingTarget} onOpenChange={() => setMappingTarget(null)}>
        <DialogContent className="max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Map File DD for "{mappingTarget}"</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mb-3">Select one or more files to combine their max drawdown for this name. Mapping is saved permanently.</p>
          {getMappedFiles(mappingTarget || '').length > 0 && (
            <div className="bg-muted/30 rounded-lg px-3 py-2 mb-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground font-medium">Currently mapped ({getMappedFiles(mappingTarget || '').length} files):</span>
                <button className="text-xs text-destructive hover:underline" onClick={() => { clearMapping(mappingTarget!); }}>Remove All</button>
              </div>
              <div className="flex flex-wrap gap-1">
                {getMappedFiles(mappingTarget || '').map(f => (
                  <span key={f} className="text-xs bg-primary/15 text-primary rounded px-2 py-0.5 font-semibold">{f}</span>
                ))}
              </div>
              <div className="text-xs mono text-destructive mt-1">
                Combined DD: {formatINR(getMappedFiles(mappingTarget || '').reduce((sum, mf) => sum + (fileDDMap.get(normalizeName(mf)) || 0), 0))}
              </div>
            </div>
          )}
          <div className="space-y-1.5 max-h-[50vh] overflow-y-auto">
            {availableFileNames.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No files found. Load a portfolio from Dashboard first.</p>
            ) : (
              availableFileNames.map(fname => {
                const dd = fileDDMap.get(normalizeName(fname)) || 0;
                const isSelected = getMappedFiles(mappingTarget || '').includes(fname);
                return (
                  <button key={fname}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors text-left border ${isSelected ? 'border-primary bg-primary/10' : 'border-border/30 hover:bg-muted/40'}`}
                    onClick={() => toggleMappingFile(mappingTarget!, fname)}>
                    <div className="flex items-center gap-2">
                      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${isSelected ? 'border-primary bg-primary' : 'border-muted-foreground'}`}>
                        {isSelected && <span className="text-primary-foreground text-[10px]">✓</span>}
                      </div>
                      <span className="text-sm font-semibold text-foreground">{fname}</span>
                    </div>
                    <span className="text-sm mono text-destructive">{dd > 0 ? formatINR(dd) : '—'}</span>
                  </button>
                );
              })
            )}
          </div>
          <div className="flex justify-end mt-3">
            <button className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors" onClick={() => setMappingTarget(null)}>Done</button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
