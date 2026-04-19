import React, { useState } from 'react';
import { useAppContext } from '@/context/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { runMonteCarlo, runWalkForward, MonteCarloResult, WalkForwardResult } from '@/lib/robustness';
import { formatINR } from '@/lib/format';
import { Dices, GitBranch, Loader2, CheckCircle2, AlertTriangle, XCircle, TrendingUp, Shield } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, BarChart, Bar, Legend, CartesianGrid } from 'recharts';

const ratingConfig = {
  excellent: { color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30', icon: CheckCircle2 },
  good:      { color: 'text-green-400',   bg: 'bg-green-500/10 border-green-500/30',   icon: CheckCircle2 },
  moderate:  { color: 'text-yellow-400',  bg: 'bg-yellow-500/10 border-yellow-500/30', icon: AlertTriangle },
  weak:      { color: 'text-orange-400',  bg: 'bg-orange-500/10 border-orange-500/30', icon: AlertTriangle },
  overfit:   { color: 'text-red-400',     bg: 'bg-red-500/10 border-red-500/30',       icon: XCircle },
};

export default function RobustnessTests() {
  const { allTrades, files, globalCapital } = useAppContext();
  const [mc, setMc] = useState<MonteCarloResult | null>(null);
  const [wf, setWf] = useState<WalkForwardResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [simCount, setSimCount] = useState(1000);
  const [winCount, setWinCount] = useState(5);

  const visibleFiles = files.filter(f => f.visible);
  const totalCapital = visibleFiles.reduce((s, f) => s + (f.capital || 0) * (f.multiplier || 1), 0) || globalCapital;

  const run = async () => {
    setLoading(true);
    await new Promise(r => setTimeout(r, 50));
    setMc(runMonteCarlo(allTrades, totalCapital, simCount));
    setWf(runWalkForward(allTrades, winCount));
    setLoading(false);
  };

  const mcChartData = mc ? mc.samplePaths[0]?.map((_, i) => {
    const row: any = { idx: i };
    mc.samplePaths.slice(0, 30).forEach((p, j) => {
      row[`s${j}`] = p[i];
    });
    return row;
  }) : [];

  const wfChartData = wf?.windows.map(w => ({
    name: `W${w.windowNum}`,
    'In-Sample': Math.round(w.inSamplePnl),
    'Out-of-Sample': Math.round(w.outSamplePnl),
  })) || [];

  if (allTrades.length < 50) {
    return (
      <Card className="border-dashed border-2 border-yellow-500/20">
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Need at least 50 trades for Monte Carlo & Walk-Forward analysis. Currently: {allTrades.length}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <Card>
        <CardContent className="py-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Shield className="w-5 h-5 text-primary" />
            <div>
              <h3 className="text-sm font-bold text-foreground">Edge Validation Tests</h3>
              <p className="text-xs text-muted-foreground">Monte Carlo + Walk-Forward analysis on {allTrades.length} trades</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground">Simulations:
              <select value={simCount} onChange={e => setSimCount(Number(e.target.value))} className="ml-1 bg-muted text-foreground border border-border rounded px-2 py-1 text-xs">
                <option value={500}>500</option>
                <option value={1000}>1,000</option>
                <option value={5000}>5,000</option>
                <option value={10000}>10,000</option>
              </select>
            </label>
            <label className="text-xs text-muted-foreground">Windows:
              <select value={winCount} onChange={e => setWinCount(Number(e.target.value))} className="ml-1 bg-muted text-foreground border border-border rounded px-2 py-1 text-xs">
                <option value={3}>3</option>
                <option value={5}>5</option>
                <option value={8}>8</option>
                <option value={10}>10</option>
              </select>
            </label>
            <Button onClick={run} disabled={loading} size="sm" className="gap-2">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <TrendingUp className="w-4 h-4" />}
              {loading ? 'Running...' : mc ? 'Re-Run' : 'Run Tests'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Monte Carlo */}
      {mc && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Dices className="w-4 h-4 text-primary" />
              Monte Carlo Simulation ({mc.simulations.toLocaleString()} runs)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Verdict */}
            <div className={`p-3 rounded-lg border ${mc.edgeValid ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-orange-500/10 border-orange-500/30'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-muted-foreground">Edge Confidence Score</div>
                  <div className={`text-2xl font-bold ${mc.confidenceScore >= 70 ? 'text-emerald-400' : mc.confidenceScore >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>{mc.confidenceScore}/100</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-muted-foreground">Probability of Profit</div>
                  <div className="text-2xl font-bold text-foreground">{mc.probProfit.toFixed(1)}%</div>
                  {mc.probRuin > 0 && <div className="text-xs text-red-400 mt-1">Risk of ruin: {mc.probRuin.toFixed(2)}%</div>}
                </div>
              </div>
              <p className="text-xs text-foreground/70 mt-2">
                {mc.edgeValid
                  ? `✓ Strategy edge is statistically valid. Actual P&L (${formatINR(mc.actualFinalPnl)}) falls within the expected band, and ${mc.probProfit.toFixed(0)}% of random trade orderings remain profitable.`
                  : `⚠ Edge requires caution. Actual P&L deviates from the expected distribution — could indicate luck-driven results or non-stationary returns.`}
              </p>
            </div>

            {/* Distribution Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <Stat label="Best Case (95%)" value={formatINR(mc.bestCase)} color="text-emerald-400" />
              <Stat label="Median Outcome" value={formatINR(mc.medianFinalPnl)} color="text-foreground" />
              <Stat label="Mean Outcome" value={formatINR(mc.meanFinalPnl)} color="text-foreground" />
              <Stat label="Worst Case (5%)" value={formatINR(mc.worstCase)} color="text-red-400" />
              <Stat label="Actual P&L" value={formatINR(mc.actualFinalPnl)} color="text-primary" />
              <Stat label="Worst DD (95%)" value={formatINR(mc.worstMaxDD)} color="text-red-400" />
              <Stat label="Median DD" value={formatINR(mc.medianMaxDD)} color="text-orange-400" />
              <Stat label="Actual Max DD" value={formatINR(mc.actualMaxDD)} color="text-foreground" />
            </div>

            {/* Chart */}
            <div className="h-64 bg-muted/20 rounded-lg p-2">
              <ResponsiveContainer>
                <LineChart data={mcChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                  <XAxis dataKey="idx" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', fontSize: 11 }} />
                  <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="2 2" />
                  {Array.from({ length: 30 }).map((_, j) => (
                    <Line key={j} type="monotone" dataKey={`s${j}`} stroke="hsl(var(--primary))" strokeOpacity={0.15} strokeWidth={1} dot={false} isAnimationActive={false} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
              <p className="text-[10px] text-muted-foreground text-center mt-1">30 sample equity paths from {mc.simulations.toLocaleString()} simulations</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Walk-Forward */}
      {wf && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-primary" />
              Walk-Forward Analysis ({wf.totalWindows} windows)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Verdict */}
            {(() => {
              const cfg = ratingConfig[wf.robustnessRating];
              const Icon = cfg.icon;
              return (
                <div className={`p-3 rounded-lg border ${cfg.bg}`}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <Icon className={`w-4 h-4 ${cfg.color}`} />
                      <span className={`text-sm font-bold capitalize ${cfg.color}`}>{wf.robustnessRating}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">Consistency: <span className={cfg.color + ' font-semibold'}>{wf.consistencyScore.toFixed(0)}%</span></span>
                  </div>
                  <p className="text-xs text-foreground/70">{wf.verdict}</p>
                </div>
              );
            })()}

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <Stat label="OOS Profitable" value={`${wf.oosProfitableWindows}/${wf.totalWindows}`} color="text-emerald-400" />
              <Stat label="Avg OOS Win Rate" value={`${wf.oosWinRateAvg.toFixed(1)}%`} color="text-foreground" />
              <Stat label="Avg Efficiency" value={(wf.avgEfficiency * 100).toFixed(0) + '%'} color="text-foreground" />
              <Stat label="Consistency" value={`${wf.consistencyScore.toFixed(0)}%`} color="text-primary" />
            </div>

            {/* Bar chart */}
            <div className="h-56 bg-muted/20 rounded-lg p-2">
              <ResponsiveContainer>
                <BarChart data={wfChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', fontSize: 11 }} formatter={(v: any) => formatINR(v)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" />
                  <Bar dataKey="In-Sample" fill="hsl(var(--primary))" opacity={0.6} />
                  <Bar dataKey="Out-of-Sample" fill="hsl(var(--primary))" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Window details */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-muted-foreground border-b border-border">
                  <tr>
                    <th className="text-left py-2 px-2">Window</th>
                    <th className="text-right py-2 px-2">IS Trades</th>
                    <th className="text-right py-2 px-2">IS P&L</th>
                    <th className="text-right py-2 px-2">IS WR</th>
                    <th className="text-right py-2 px-2">OOS Trades</th>
                    <th className="text-right py-2 px-2">OOS P&L</th>
                    <th className="text-right py-2 px-2">OOS WR</th>
                    <th className="text-right py-2 px-2">Efficiency</th>
                    <th className="text-center py-2 px-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {wf.windows.map(w => (
                    <tr key={w.windowNum} className="border-b border-border/40">
                      <td className="py-2 px-2 font-medium text-foreground">W{w.windowNum}</td>
                      <td className="text-right py-2 px-2 text-muted-foreground">{w.inSampleTrades}</td>
                      <td className={`text-right py-2 px-2 ${w.inSamplePnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{formatINR(w.inSamplePnl)}</td>
                      <td className="text-right py-2 px-2 text-foreground">{w.inSampleWinRate.toFixed(0)}%</td>
                      <td className="text-right py-2 px-2 text-muted-foreground">{w.outSampleTrades}</td>
                      <td className={`text-right py-2 px-2 ${w.outSamplePnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{formatINR(w.outSamplePnl)}</td>
                      <td className="text-right py-2 px-2 text-foreground">{w.outSampleWinRate.toFixed(0)}%</td>
                      <td className={`text-right py-2 px-2 ${w.efficiency >= 0.5 ? 'text-emerald-400' : w.efficiency >= 0 ? 'text-yellow-400' : 'text-red-400'}`}>{(w.efficiency * 100).toFixed(0)}%</td>
                      <td className="text-center py-2 px-2">
                        {w.consistent
                          ? <CheckCircle2 className="w-4 h-4 text-emerald-400 inline" />
                          : <XCircle className="w-4 h-4 text-red-400 inline" />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="p-2 rounded-md bg-muted/30 border border-border">
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className={`text-sm font-bold ${color} mt-0.5`}>{value}</div>
    </div>
  );
}
