import { useState, useMemo } from 'react';
import { useManualTrades } from '@/hooks/useManualTrades';
import { formatINR } from '@/lib/format';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, AreaChart, Area } from 'recharts';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Info } from 'lucide-react';

function getColorForString(str: string): string {
  if (!str) return 'hsl(var(--foreground))';
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return `hsl(${Math.abs(hash % 360)}, 70%, 60%)`;
}

type DrillType = { kind: 'owner' | 'type' | 'subCategory' | 'detailed'; label: string; filterFn: (t: any) => boolean } | null;

function buildLeaderboard(stats: Record<string, { pl: number; trades: number; wins: number; grossWin: number; grossLoss: number; maxDD: number }>) {
  return Object.entries(stats).map(([name, s]) => {
    const wr = s.trades > 0 ? (s.wins / s.trades * 100).toFixed(1) : '0.0';
    const al = (s.trades - s.wins) > 0 ? s.grossLoss / (s.trades - s.wins) : 0;
    const aw = s.wins > 0 ? s.grossWin / s.wins : 0;
    const rr = al > 0 ? (aw / al).toFixed(2) : aw > 0 ? 'MAX' : '0.00';
    return { name, ...s, winRate: wr, rr };
  }).sort((a, b) => b.pl - a.pl);
}

export default function PnlDashboardTab() {
  const { trades } = useManualTrades();
  const [drill, setDrill] = useState<DrillType>(null);

  const stats = useMemo(() => {
    const now = new Date();
    const cy = now.getFullYear(), cm = now.getMonth();
    const monthTrades = trades.filter(t => {
      if (!t.exitDate) return false;
      const d = new Date(t.exitDate);
      return d.getFullYear() === cy && d.getMonth() === cm;
    });
    if (!monthTrades.length) return null;

    let totalPL = 0, wins = 0, grossWin = 0, grossLoss = 0;
    const ownerMap: Record<string, { pl: number; trades: number; wins: number; grossWin: number; grossLoss: number; maxDD: number; peak: number; cum: number }> = {};
    const typeMap: Record<string, { pl: number; trades: number; wins: number; grossWin: number; grossLoss: number; maxDD: number; peak: number; cum: number }> = {};
    const subCatMap: Record<string, { pl: number; trades: number; wins: number; grossWin: number; grossLoss: number; maxDD: number; peak: number; cum: number }> = {};
    const dailyPL: Record<string, { pnl: number; grossWin: number; grossLoss: number }> = {};
    const detailedMap: Record<string, { owner: string; type: string; pl: number; trades: number; maxDD: number; peak: number; cum: number }> = {};
    let maxDD = 0, peak = 0, cum = 0;

    monthTrades.forEach(t => {
      totalPL += t.pl; cum += t.pl;
      if (cum > peak) peak = cum;
      if (peak - cum > maxDD) maxDD = peak - cum;
      if (t.pl > 0) { wins++; grossWin += t.pl; } else if (t.pl < 0) grossLoss += Math.abs(t.pl);

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
      if (t.exitDate) {
        if (!dailyPL[t.exitDate]) dailyPL[t.exitDate] = { pnl: 0, grossWin: 0, grossLoss: 0 };
        dailyPL[t.exitDate].pnl += t.pl;
        if (t.pl > 0) dailyPL[t.exitDate].grossWin += t.pl;
        else if (t.pl < 0) dailyPL[t.exitDate].grossLoss += Math.abs(t.pl);
      }
      if (t.owner && t.type) {
        const key = `${t.owner}|${t.type}`;
        if (!detailedMap[key]) detailedMap[key] = { owner: t.owner, type: t.type, pl: 0, trades: 0, maxDD: 0, peak: 0, cum: 0 };
        detailedMap[key].pl += t.pl; detailedMap[key].trades++; detailedMap[key].cum += t.pl;
        if (detailedMap[key].cum > detailedMap[key].peak) detailedMap[key].peak = detailedMap[key].cum;
        if (detailedMap[key].peak - detailedMap[key].cum > detailedMap[key].maxDD) detailedMap[key].maxDD = detailedMap[key].peak - detailedMap[key].cum;
      }
    });

    const total = monthTrades.length, losses = total - wins;
    const winRate = total > 0 ? (wins / total) * 100 : 0;
    const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0;
    const avgWin = wins > 0 ? grossWin / wins : 0, avgLoss = losses > 0 ? grossLoss / losses : 0;
    const expectancy = total > 0 ? (winRate / 100 * avgWin) - ((100 - winRate) / 100 * avgLoss) : 0;
    const recoveryFactor = maxDD > 0 ? totalPL / maxDD : totalPL > 0 ? 100 : 0;
    const rrRatio = avgLoss > 0 ? avgWin / avgLoss : avgWin > 0 ? 100 : 0;

    return {
      totalPL, total, winRate, profitFactor, expectancy, recoveryFactor, rrRatio,
      ownerList: buildLeaderboard(ownerMap),
      typeList: buildLeaderboard(typeMap),
      subCatList: buildLeaderboard(subCatMap),
      dailyData: Object.entries(dailyPL).sort(([a], [b]) => a.localeCompare(b)).map(([date, d]) => ({ date, pnl: d.pnl, grossWin: d.grossWin, grossLoss: d.grossLoss })),
      detailedList: Object.values(detailedMap).sort((a, b) => b.pl - a.pl),
      monthTrades,
    };
  }, [trades]);

  // Generic drill-down data
  const drillData = useMemo(() => {
    if (!drill || !stats) return null;
    const now = new Date();
    const monthName = now.toLocaleString('en', { month: 'short', year: 'numeric' });
    const filtered = stats.monthTrades.filter(t => t.exitDate && drill.filterFn(t)).sort((a, b) => a.exitDate.localeCompare(b.exitDate));
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
    const maxDDPct = peak > 0 ? (maxDD / peak * 100) : 0;
    return { label: drill.label, monthName, totalPL, maxDD, maxDDPct, winRate, profitFactor, trades: filtered, equityData };
  }, [drill, stats]);

  if (!stats) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] text-center animate-fade-in">
        <div className="text-6xl mb-4">📊</div>
        <h2 className="text-2xl font-bold text-foreground mb-2">No Current Month Data</h2>
        <p className="text-muted-foreground">Add trades with exit dates in the current month to see dashboard stats.</p>
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

  const openDrill = (kind: DrillType extends null ? never : NonNullable<DrillType>['kind'], label: string, filterFn: (t: any) => boolean) => {
    setDrill({ kind, label, filterFn });
  };

  const LeaderTable = ({ title, list, onRowClick }: { title: string; list: ReturnType<typeof buildLeaderboard>; onRowClick: (name: string) => void }) => (
    <div className="glass-panel">
      <h3 className="text-sm font-bold uppercase tracking-wider text-primary mb-3">{title}</h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs uppercase text-muted-foreground font-semibold border-b border-border">
            <th className="py-2 w-10 text-center">Rank</th>
            <th className="py-2 text-left">Name</th>
            <th className="py-2 text-right">P/L</th>
            <th className="py-2 text-right">Trades</th>
            <th className="py-2 text-right">Win %</th>
            <th className="py-2 text-right">Drawdown</th>
            <th className="py-2 text-right">RR</th>
          </tr>
        </thead>
        <tbody>
          {list.map((s, i) => (
            <tr key={s.name} className="border-b border-border/20 hover:bg-surface-hover cursor-pointer transition-colors" onClick={() => onRowClick(s.name)}>
              <td className="py-2.5 text-center text-muted-foreground">{i + 1}</td>
              <td className="py-2.5 font-semibold" style={{ color: getColorForString(s.name) }}>{s.name}</td>
              <td className={`py-2.5 text-right mono font-bold ${s.pl >= 0 ? 'text-success' : 'text-destructive'}`}>{formatINR(s.pl)}</td>
              <td className="py-2.5 text-right mono">{s.trades}</td>
              <td className="py-2.5 text-right mono">{s.winRate}%</td>
              <td className="py-2.5 text-right mono text-destructive">{s.maxDD > 0 ? formatINR(s.maxDD) : '—'}</td>
              <td className="py-2.5 text-right mono">{s.rr}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {[
          { label: 'Net P&L', sub: 'TOTAL PROFIT/LOSS', value: formatINR(stats.totalPL), color: stats.totalPL >= 0 ? 'text-success' : 'text-destructive' },
          { label: 'Total Trades', sub: 'COUNT', value: stats.total.toString(), color: 'text-foreground' },
          { label: 'Win Rate', sub: 'PROFITABLE TRADES', value: `${stats.winRate.toFixed(1)}%`, color: stats.winRate >= 50 ? 'text-success' : 'text-destructive' },
          { label: 'Profit Factor', sub: 'GROSS WIN / GROSS LOSS', value: stats.profitFactor === Infinity ? '∞' : stats.profitFactor.toFixed(2), color: stats.profitFactor >= 1 ? 'text-success' : 'text-destructive' },
          { label: 'Expectancy', sub: 'EXP. VALUE PER TRADE', value: stats.expectancy.toFixed(2), color: stats.expectancy >= 0 ? 'text-success' : 'text-destructive' },
          { label: 'Recovery Factor', sub: 'NET P&L / MAX DD', value: stats.recoveryFactor.toFixed(2), color: stats.recoveryFactor >= 1 ? 'text-success' : 'text-destructive' },
          { label: 'Risk : Reward', sub: 'AVG WIN / AVG LOSS', value: stats.rrRatio.toFixed(2), color: stats.rrRatio >= 1 ? 'text-success' : 'text-destructive' },
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

      {/* Owner + Type Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="glass-panel">
          <h3 className="text-sm font-bold uppercase tracking-wider text-primary mb-3">Owner P&L Graph</h3>
          <ResponsiveContainer width="100%" height={Math.max(180, stats.ownerList.length * 40)}>
            <BarChart data={stats.ownerList} layout="vertical" style={{ background: 'transparent' }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} width={110} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted) / 0.3)' }} />
              <Bar dataKey="pl" radius={[0, 4, 4, 0]}>
                {stats.ownerList.map((d, i) => (
                  <Cell key={i} fill={d.pl >= 0 ? 'hsl(var(--success))' : 'hsl(var(--destructive))'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="glass-panel">
          <h3 className="text-sm font-bold uppercase tracking-wider text-primary mb-3">Type P&L Graph</h3>
          <ResponsiveContainer width="100%" height={Math.max(180, stats.typeList.length * 40)}>
            <BarChart data={stats.typeList} layout="vertical" style={{ background: 'transparent' }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} width={110} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted) / 0.3)' }} />
              <Bar dataKey="pl" radius={[0, 4, 4, 0]}>
                {stats.typeList.map((d, i) => (
                  <Cell key={i} fill={d.pl >= 0 ? 'hsl(var(--success))' : 'hsl(var(--destructive))'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Owner + Type Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <LeaderTable title="Owner Performance" list={stats.ownerList}
          onRowClick={name => openDrill('owner', `Owner: ${name}`, t => t.owner === name)} />
        <LeaderTable title="Type Performance" list={stats.typeList}
          onRowClick={name => openDrill('type', `Type: ${name}`, t => t.type === name)} />
      </div>

      {/* SubCategory */}
      <LeaderTable title="Sub Category Performance" list={stats.subCatList}
        onRowClick={name => openDrill('subCategory', `Sub Category: ${name}`, t => (t.subCategory || '(None)') === name)} />

      {/* Daily P&L Chart — no white patches */}
      <div className="glass-panel">
        <h3 className="text-sm font-bold uppercase tracking-wider text-primary mb-3">Daily P&L</h3>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={stats.dailyData} style={{ background: 'transparent' }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={{ stroke: 'hsl(var(--border))' }} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={{ stroke: 'hsl(var(--border))' }} tickLine={false} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted) / 0.3)' }} />
            <Bar dataKey="pnl" radius={[3, 3, 0, 0]} background={false}>
              {stats.dailyData.map((d, i) => (
                <Cell key={i} fill={d.pnl >= 0 ? 'hsl(var(--success))' : 'hsl(var(--destructive))'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Detailed Performance */}
      {stats.detailedList.length > 0 && (
        <div className="glass-panel">
          <h3 className="text-sm font-bold uppercase tracking-wider text-primary mb-3">Detailed Performance (Owner + Type)</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase text-muted-foreground font-semibold border-b border-border">
                <th className="py-2 w-10 text-center">Rank</th>
                <th className="py-2 text-left">Owner</th>
                <th className="py-2 text-left">Type</th>
                <th className="py-2 text-right">P/L</th>
                <th className="py-2 text-right">Trades</th>
                <th className="py-2 text-right">Drawdown</th>
              </tr>
            </thead>
            <tbody>
              {stats.detailedList.map((s, i) => (
                <tr key={`${s.owner}-${s.type}`} className="border-b border-border/20 hover:bg-surface-hover cursor-pointer transition-colors"
                  onClick={() => openDrill('detailed', `${s.owner} — ${s.type}`, t => t.owner === s.owner && t.type === s.type)}>
                  <td className="py-2.5 text-center text-muted-foreground">{i + 1}</td>
                  <td className="py-2.5 font-semibold" style={{ color: getColorForString(s.owner) }}>{s.owner}</td>
                  <td className="py-2.5 text-foreground font-medium">{s.type}</td>
                  <td className={`py-2.5 text-right mono font-bold ${s.pl >= 0 ? 'text-success' : 'text-destructive'}`}>{formatINR(s.pl)}</td>
                  <td className="py-2.5 text-right mono">{s.trades}</td>
                  <td className="py-2.5 text-right mono text-destructive">{s.maxDD > 0 ? formatINR(s.maxDD) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Generic Drill-Down Popup */}
      <Dialog open={!!drill} onOpenChange={() => setDrill(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto bg-card border-border">
          {drillData && (
            <>
              <DialogHeader>
                <DialogTitle className="text-lg font-bold">{drillData.label} — Trades ({drillData.monthName})</DialogTitle>
              </DialogHeader>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                <div className="glass-panel !py-3 text-center">
                  <div className="text-[0.6rem] uppercase tracking-wider text-muted-foreground">Total P/L</div>
                  <div className={`text-lg font-bold mono mt-1 ${drillData.totalPL >= 0 ? 'text-success' : 'text-destructive'}`}>{formatINR(drillData.totalPL)}</div>
                </div>
                <div className="glass-panel !py-3 text-center">
                  <div className="text-[0.6rem] uppercase tracking-wider text-muted-foreground">Max Drawdown</div>
                  <div className="text-lg font-bold mono mt-1 text-destructive">{formatINR(drillData.maxDD)} <span className="text-xs text-muted-foreground">(-{drillData.maxDDPct.toFixed(1)}%)</span></div>
                </div>
                <div className="glass-panel !py-3 text-center">
                  <div className="text-[0.6rem] uppercase tracking-wider text-muted-foreground">Win Rate</div>
                  <div className={`text-lg font-bold mono mt-1 ${drillData.winRate >= 50 ? 'text-foreground' : 'text-destructive'}`}>{drillData.winRate.toFixed(1)}%</div>
                </div>
                <div className="glass-panel !py-3 text-center">
                  <div className="text-[0.6rem] uppercase tracking-wider text-muted-foreground">Profit Factor</div>
                  <div className="text-lg font-bold mono mt-1 text-foreground">{drillData.profitFactor === Infinity ? '∞' : drillData.profitFactor.toFixed(2)}</div>
                </div>
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
                      <linearGradient id="drillGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(199, 89%, 58%)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(199, 89%, 58%)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Area type="monotone" dataKey="equity" stroke="hsl(199, 89%, 58%)" fill="url(#drillGrad)" strokeWidth={2} dot={{ r: 3 }} />
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
                      <th className="py-2 text-left">Sub Category</th>
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
                        <td className="py-2.5 text-muted-foreground">{t.subCategory || '- -'}</td>
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
    </div>
  );
}
