import { useAppContext } from '@/context/AppContext';
import { getEquityCurve, getMonthlyData } from '@/lib/metrics';
import { formatINR } from '@/lib/format';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, ReferenceLine, ComposedChart,
} from 'recharts';
import { useState } from 'react';

const COLORS = {
  primary: 'hsl(199, 89%, 58%)',
  success: 'hsl(160, 84%, 39%)',
  destructive: 'hsl(0, 72%, 51%)',
  muted: 'hsl(215, 20%, 65%)',
  surface: 'hsl(217, 33%, 12%)',
  border: 'hsl(217, 19%, 22%)',
  warning: 'hsl(38, 92%, 50%)',
};

export default function ChartsTab() {
  const { allTrades } = useAppContext();
  const [pnlView, setPnlView] = useState<'monthly' | 'daily'>('monthly');

  if (!allTrades.length) {
    return <div className="text-center text-muted-foreground py-20">Upload data to view charts</div>;
  }

  const equityCurve = getEquityCurve(allTrades);
  const monthlyData = getMonthlyData(allTrades);

  // Drawdown curve for overlay
  const ddCurve = (() => {
    let peak = 0, equity = 0;
    return allTrades.map(t => {
      equity += t.netPnl;
      if (equity > peak) peak = equity;
      return { dd: equity - peak };
    });
  })();

  const equityWithDD = equityCurve.map((e, i) => ({ ...e, drawdown: ddCurve[i]?.dd || 0 }));

  const wins = allTrades.filter(t => t.isWin).length;
  const losses = allTrades.length - wins;
  const winPct = allTrades.length ? ((wins / allTrades.length) * 100).toFixed(0) : '0';
  const lossPct = allTrades.length ? ((losses / allTrades.length) * 100).toFixed(0) : '0';
  const pieData = [
    { name: `Wins ${winPct}%`, value: wins },
    { name: `Losses ${lossPct}%`, value: losses },
  ];

  const fileMap = new Map<string, number>();
  allTrades.forEach(t => fileMap.set(t.fileName || 'Unknown', (fileMap.get(t.fileName || 'Unknown') || 0) + 1));
  const fileDist = Array.from(fileMap.entries()).map(([name, value]) => ({ name, value }));
  const fileColors = ['hsl(199, 89%, 58%)', 'hsl(160, 84%, 39%)', 'hsl(38, 92%, 50%)', 'hsl(280, 65%, 60%)', 'hsl(340, 75%, 55%)'];

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="glass-panel text-xs py-2 px-3 !bg-card/95 backdrop-blur-md border border-border">
        <p className="text-muted-foreground mb-1 font-semibold">{label}</p>
        {payload.map((p: any, i: number) => (
          <p key={i} className="font-semibold mono" style={{ color: p.color }}>
            {p.name}: {formatINR(p.value)}
          </p>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Equity Curve with Drawdown bars below */}
      <div className="glass-panel">
        <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4">📈 Equity Curve & Drawdown</h3>
        <ResponsiveContainer width="100%" height={350}>
          <ComposedChart data={equityWithDD}>
            <defs>
              <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={COLORS.primary} stopOpacity={0.5} />
                <stop offset="95%" stopColor={COLORS.primary} stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} opacity={0.4} />
            <XAxis dataKey="date" tick={{ fontSize: 8, fill: COLORS.muted }} interval="preserveStartEnd" />
            <YAxis yAxisId="equity" tick={{ fontSize: 10, fill: COLORS.muted }} tickFormatter={(v) => formatINR(v)} />
            <YAxis yAxisId="dd" orientation="right" tick={{ fontSize: 9, fill: COLORS.destructive }} tickFormatter={(v) => formatINR(v)} />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: COLORS.muted, strokeWidth: 1, strokeDasharray: '3 3' }} />
            <ReferenceLine yAxisId="equity" y={0} stroke={COLORS.muted} strokeDasharray="3 3" opacity={0.5} />
            <Area yAxisId="equity" type="monotone" dataKey="equity" stroke={COLORS.primary} fill="url(#equityGrad)" strokeWidth={2.5} name="Equity" dot={false} />
            <Bar yAxisId="dd" dataKey="drawdown" name="Drawdown" opacity={0.6} radius={[2, 2, 0, 0]}>
              {equityWithDD.map((_, i) => (
                <Cell key={i} fill={COLORS.destructive} />
              ))}
            </Bar>
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Monthly P&L */}
      <div className="glass-panel">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Net P&L</h3>
          <div className="flex gap-1 bg-background p-1 rounded-lg border border-border">
            {['monthly', 'daily'].map(v => (
              <button key={v} onClick={() => setPnlView(v as any)}
                className={`text-xs px-3 py-1 rounded-md capitalize transition-all ${
                  pnlView === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >{v}</button>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={pnlView === 'monthly' ? monthlyData.map(m => ({ name: m.month, pnl: m.pnl })) :
            allTrades.map(t => ({ name: t.exitDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }), pnl: t.netPnl }))
          }>
            <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} opacity={0.5} />
            <XAxis dataKey="name" tick={{ fontSize: 9, fill: COLORS.muted }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 10, fill: COLORS.muted }} tickFormatter={(v) => formatINR(v)} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'transparent' }} />
            <ReferenceLine y={0} stroke={COLORS.muted} strokeDasharray="3 3" />
            <Bar dataKey="pnl" name="P&L" radius={[4, 4, 0, 0]}>
              {(pnlView === 'monthly' ? monthlyData : allTrades).map((entry, i) => (
                <Cell key={i} fill={(pnlView === 'monthly' ? (entry as any).pnl : (entry as any).netPnl) >= 0 ? COLORS.success : COLORS.destructive} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Pie Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="glass-panel">
          <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4">Win / Loss Ratio</h3>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                dataKey="value"
                strokeWidth={2}
                stroke="hsl(217, 33%, 10%)"
                label={({ name, cx, cy, midAngle, outerRadius }) => {
                  const RADIAN = Math.PI / 180;
                  const radius = outerRadius + 25;
                  const x = cx + radius * Math.cos(-midAngle * RADIAN);
                  const y = cy + radius * Math.sin(-midAngle * RADIAN);
                  return (
                    <text x={x} y={y} fill={name.startsWith('Wins') ? COLORS.success : COLORS.destructive} textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central" fontSize={13} fontWeight="bold">
                      {name}
                    </text>
                  );
                }}
                labelLine={{ stroke: COLORS.muted, strokeWidth: 1 }}
              >
                <Cell fill={COLORS.success} />
                <Cell fill={COLORS.destructive} />
              </Pie>
              <Legend
                formatter={(value) => <span style={{ color: COLORS.muted, fontSize: 12 }}>{value.split(' ')[0]}</span>}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="glass-panel">
          <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4">Trade Distribution by File</h3>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={fileDist} cx="50%" cy="50%" innerRadius={60} outerRadius={100} dataKey="value" label={({ name, percent }) => `${name.slice(0, 12)} ${(percent * 100).toFixed(0)}%`}>
                {fileDist.map((_, i) => <Cell key={i} fill={fileColors[i % fileColors.length]} />)}
              </Pie>
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
