import React, { useMemo, useRef, useCallback } from 'react';
import { useAppContext } from '@/context/AppContext';
import { VixDataPoint } from '@/lib/types';
import { formatINR } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Upload, TrendingUp, TrendingDown, BarChart3, Activity } from 'lucide-react';
import {
  ComposedChart, Bar, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, ScatterChart, Scatter, Cell, Legend,
  BarChart, PieChart, Pie
} from 'recharts';

interface RawVixRow {
  datetime: string; // full datetime string e.g. "2025-09-18T09:15:00+05:30"
  date: string;     // YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
}

function parseVixCSV(text: string): { daily: VixDataPoint[]; raw: RawVixRow[] } {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return { daily: [], raw: [] };

  const rawRows: RawVixRow[] = lines.slice(1).map(line => {
    const cols = line.split(',');
    const datetime = cols[0]?.trim() || '';
    return {
      datetime,
      date: datetime.slice(0, 10),
      open: parseFloat(cols[1]) || 0,
      high: parseFloat(cols[2]) || 0,
      low: parseFloat(cols[3]) || 0,
      close: parseFloat(cols[4]) || 0,
    };
  }).filter(d => d.date && !isNaN(d.close) && d.close > 0);

  // Check if hourly data
  const dateCount = new Map<string, number>();
  rawRows.forEach(r => dateCount.set(r.date, (dateCount.get(r.date) || 0) + 1));
  const isIntraday = Array.from(dateCount.values()).some(c => c > 1);

  if (!isIntraday) {
    const daily = rawRows.map(r => ({ date: r.date, open: r.open, high: r.high, low: r.low, close: r.close }));
    return { daily, raw: rawRows };
  }

  // Aggregate intraday to daily OHLC
  const dailyMap = new Map<string, { open: number; high: number; low: number; close: number; firstTime: string; lastTime: string }>();
  rawRows.forEach(r => {
    const existing = dailyMap.get(r.date);
    if (!existing) {
      dailyMap.set(r.date, { open: r.open, high: r.high, low: r.low, close: r.close, firstTime: r.datetime, lastTime: r.datetime });
    } else {
      existing.high = Math.max(existing.high, r.high);
      existing.low = Math.min(existing.low, r.low);
      if (r.datetime < existing.firstTime) { existing.open = r.open; existing.firstTime = r.datetime; }
      if (r.datetime > existing.lastTime) { existing.close = r.close; existing.lastTime = r.datetime; }
    }
  });

  const daily = Array.from(dailyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, d]) => ({ date, open: d.open, high: d.high, low: d.low, close: d.close }));

  return { daily, raw: rawRows };
}

// Find closest VIX row to a given trade datetime
function getVixForDatetime(rawRows: RawVixRow[], tradeDate: Date): { vix: number; datetime: string } | null {
  if (!rawRows.length) return null;

  const tradeTime = tradeDate.getTime();
  const tradeYMD = tradeDate.toISOString().slice(0, 10);

  // First try rows on the same date
  const sameDayRows = rawRows.filter(r => r.date === tradeYMD);
  if (sameDayRows.length > 0) {
    // Find closest by time
    let best = sameDayRows[0];
    let bestDiff = Math.abs(new Date(sameDayRows[0].datetime).getTime() - tradeTime);
    for (let i = 1; i < sameDayRows.length; i++) {
      const diff = Math.abs(new Date(sameDayRows[i].datetime).getTime() - tradeTime);
      if (diff < bestDiff) { best = sameDayRows[i]; bestDiff = diff; }
    }
    return { vix: best.open, datetime: best.datetime };
  }

  // Go back up to 5 days
  for (let i = 1; i < 6; i++) {
    const d = new Date(tradeDate);
    d.setDate(d.getDate() - i);
    const ymd = d.toISOString().slice(0, 10);
    const rows = rawRows.filter(r => r.date === ymd);
    if (rows.length > 0) {
      // Use the last row of that day (closest to market close)
      const last = rows[rows.length - 1];
      return { vix: last.open, datetime: last.datetime };
    }
  }
  return null;
}

// Fallback for daily-only data
function getVixForDate(vixMap: Map<string, VixDataPoint>, date: Date): VixDataPoint | null {
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  for (let i = 0; i < 6; i++) {
    const d = new Date(date);
    d.setDate(d.getDate() - i);
    const v = vixMap.get(fmt(d));
    if (v) return v;
  }
  return null;
}

function getVixBucket(vix: number): string {
  if (vix < 10) return '<10';
  const lower = Math.floor(vix / 2) * 2;
  if (lower >= 50) return '50+';
  return `${lower}-${lower + 2}`;
}

const BUCKET_ORDER = ['<10', ...Array.from({ length: 20 }, (_, i) => `${10 + i * 2}-${12 + i * 2}`), '50+'];

function formatTime(datetime: string): string {
  try {
    const d = new Date(datetime);
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch {
    return '';
  }
}

export default function VixTab() {
  const { allTrades, vixData, setVixData, rawVixRows, setRawVixRows } = useAppContext();
  const fileRef = useRef<HTMLInputElement>(null);
  const [expandedBucket, setExpandedBucket] = React.useState<string | null>(null);

  const handleUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const { daily, raw } = parseVixCSV(text);
      if (daily.length > 0) {
        setVixData(daily);
        setRawVixRows(raw.map(r => ({ date: r.datetime, open: r.open, high: r.high, low: r.low, close: r.close })));
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }, [setVixData, setRawVixRows]);

  const vixMap = useMemo(() => {
    const map = new Map<string, VixDataPoint>();
    vixData.forEach(v => map.set(v.date, v));
    return map;
  }, [vixData]);

  // Reconstruct raw rows from rawVixRows stored in context
  const rawRowsParsed = useMemo((): RawVixRow[] => {
    return rawVixRows.map(r => ({
      datetime: r.date, // stored as full datetime in date field
      date: r.date.slice(0, 10),
      open: r.open,
      high: r.high,
      low: r.low,
      close: r.close,
    }));
  }, [rawVixRows]);

  const hasHourlyData = useMemo(() => rawRowsParsed.length > vixData.length, [rawRowsParsed, vixData]);

  // Match trades with VIX using hourly precision when available
  const tradeVixData = useMemo(() => {
    if (!vixData.length || !allTrades.length) return [];
    return allTrades.map(t => {
      let entryVix: number | null = null;
      let exitVix: number | null = null;
      let entryVixTime = '';
      let exitVixTime = '';
      let vixChange: number | null = null;

      if (hasHourlyData && rawRowsParsed.length > 0) {
        const entryMatch = getVixForDatetime(rawRowsParsed, t.entryDate);
        const exitMatch = getVixForDatetime(rawRowsParsed, t.exitDate);
        entryVix = entryMatch?.vix ?? null;
        exitVix = exitMatch?.vix ?? null;
        entryVixTime = entryMatch?.datetime ?? '';
        exitVixTime = exitMatch?.datetime ?? '';
        vixChange = entryVix !== null && exitVix !== null ? exitVix - entryVix : null;
      } else {
        const ev = getVixForDate(vixMap, t.entryDate);
        const xv = getVixForDate(vixMap, t.exitDate);
        entryVix = ev?.close ?? null;
        exitVix = xv?.close ?? null;
        vixChange = entryVix !== null && exitVix !== null ? exitVix - entryVix : null;
      }

      return {
        trade: t,
        entryVix,
        exitVix,
        vixChange,
        entryDate: t.entryDate.toISOString().slice(0, 10),
        exitDate: t.exitDate.toISOString().slice(0, 10),
        entryTime: t.entryDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }),
        exitTime: t.exitDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }),
        entryVixTime,
        exitVixTime,
      };
    }).filter(d => d.entryVix !== null);
  }, [allTrades, vixMap, vixData, rawRowsParsed, hasHourlyData]);

  // VIX bucket analysis
  const bucketAnalysis = useMemo(() => {
    const buckets: Record<string, { trades: number; wins: number; totalPnl: number; grossWin: number; grossLoss: number }> = {};
    BUCKET_ORDER.forEach(b => buckets[b] = { trades: 0, wins: 0, totalPnl: 0, grossWin: 0, grossLoss: 0 });

    tradeVixData.forEach(d => {
      if (d.entryVix === null) return;
      const bucket = getVixBucket(d.entryVix);
      if (!buckets[bucket]) buckets[bucket] = { trades: 0, wins: 0, totalPnl: 0, grossWin: 0, grossLoss: 0 };
      const b = buckets[bucket];
      b.trades++;
      b.totalPnl += d.trade.netPnl;
      if (d.trade.netPnl > 0) { b.wins++; b.grossWin += d.trade.netPnl; }
      else b.grossLoss += Math.abs(d.trade.netPnl);
    });

    return BUCKET_ORDER.map(name => {
      const b = buckets[name];
      return {
        bucket: name,
        trades: b.trades,
        wins: b.wins,
        winRate: b.trades ? (b.wins / b.trades * 100) : 0,
        totalPnl: b.totalPnl,
        avgPnl: b.trades ? b.totalPnl / b.trades : 0,
        profitFactor: b.grossLoss ? b.grossWin / b.grossLoss : b.grossWin > 0 ? Infinity : 0,
      };
    }).filter(b => b.trades > 0);
  }, [tradeVixData]);

  // Trades for expanded bucket
  const bucketTrades = useMemo(() => {
    if (!expandedBucket) return [];
    return tradeVixData
      .filter(d => d.entryVix !== null && getVixBucket(d.entryVix) === expandedBucket)
      .map(d => ({
        entryDate: d.entryDate,
        exitDate: d.exitDate,
        entryTime: d.entryTime,
        exitTime: d.exitTime,
        entryVix: d.entryVix!,
        exitVix: d.exitVix,
        pnl: d.trade.netPnl,
        isWin: d.trade.netPnl > 0,
      }))
      .sort((a, b) => a.entryDate.localeCompare(b.entryDate));
  }, [expandedBucket, tradeVixData]);

  // VIX change direction analysis
  const vixChangeAnalysis = useMemo(() => {
    const rising = { trades: 0, wins: 0, pnl: 0 };
    const falling = { trades: 0, wins: 0, pnl: 0 };
    const flat = { trades: 0, wins: 0, pnl: 0 };

    tradeVixData.forEach(d => {
      if (d.vixChange === null) return;
      const group = d.vixChange > 0.5 ? rising : d.vixChange < -0.5 ? falling : flat;
      group.trades++;
      group.pnl += d.trade.netPnl;
      if (d.trade.netPnl > 0) group.wins++;
    });

    return [
      { label: 'VIX Rising', ...rising, winRate: rising.trades ? rising.wins / rising.trades * 100 : 0, avgPnl: rising.trades ? rising.pnl / rising.trades : 0 },
      { label: 'VIX Flat', ...flat, winRate: flat.trades ? flat.wins / flat.trades * 100 : 0, avgPnl: flat.trades ? flat.pnl / flat.trades : 0 },
      { label: 'VIX Falling', ...falling, winRate: falling.trades ? falling.wins / falling.trades * 100 : 0, avgPnl: falling.trades ? falling.pnl / falling.trades : 0 },
    ];
  }, [tradeVixData]);

  // Scatter data
  const scatterData = useMemo(() => {
    return tradeVixData.map(d => ({
      vix: d.entryVix,
      pnl: d.trade.netPnl,
      isWin: d.trade.netPnl > 0,
    }));
  }, [tradeVixData]);

  // Monthly VIX + PnL overlay
  const monthlyOverlay = useMemo(() => {
    const monthMap: Record<string, { pnl: number; trades: number; vixSum: number; vixCount: number }> = {};
    tradeVixData.forEach(d => {
      const m = d.exitDate.slice(0, 7);
      if (!monthMap[m]) monthMap[m] = { pnl: 0, trades: 0, vixSum: 0, vixCount: 0 };
      monthMap[m].pnl += d.trade.netPnl;
      monthMap[m].trades++;
      if (d.entryVix !== null) {
        monthMap[m].vixSum += d.entryVix;
        monthMap[m].vixCount++;
      }
    });
    return Object.entries(monthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => ({ month, pnl: v.pnl, trades: v.trades, avgVix: v.vixCount ? v.vixSum / v.vixCount : 0 }));
  }, [tradeVixData]);

  // Summary stats
  const summary = useMemo(() => {
    if (!tradeVixData.length) return null;
    const matched = tradeVixData.filter(d => d.entryVix !== null);
    const avgEntryVix = matched.reduce((s, d) => s + (d.entryVix ?? 0), 0) / matched.length;
    const winVix = matched.filter(d => d.trade.netPnl > 0);
    const lossVix = matched.filter(d => d.trade.netPnl <= 0);
    const avgWinVix = winVix.length ? winVix.reduce((s, d) => s + (d.entryVix ?? 0), 0) / winVix.length : 0;
    const avgLossVix = lossVix.length ? lossVix.reduce((s, d) => s + (d.entryVix ?? 0), 0) / lossVix.length : 0;
    const best = bucketAnalysis.reduce((a, b) => a.avgPnl > b.avgPnl ? a : b, bucketAnalysis[0]);
    const worst = bucketAnalysis.reduce((a, b) => a.avgPnl < b.avgPnl ? a : b, bucketAnalysis[0]);
    return { matched: matched.length, total: allTrades.length, avgEntryVix, avgWinVix, avgLossVix, bestZone: best, worstZone: worst };
  }, [tradeVixData, bucketAnalysis, allTrades.length]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-card border border-border rounded p-2 text-xs shadow-lg">
        <p className="font-semibold mb-1">{label}</p>
        {payload.map((p: any, i: number) => (
          <p key={i} style={{ color: p.color }}>
            {p.name}: {p.name.includes('VIX') || p.name.includes('vix') ? p.value?.toFixed(2) : formatINR(p.value)}
          </p>
        ))}
      </div>
    );
  };

  if (!allTrades.length) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <Activity size={48} className="mb-4 opacity-40" />
        <p className="text-lg font-semibold">No trades loaded</p>
        <p className="text-sm">Upload strategy files first, then come here to compare with VIX.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Upload Section */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity size={18} /> VIX Comparison
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <input ref={fileRef} type="file" accept=".csv" onChange={handleUpload} className="hidden" />
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <Upload size={14} className="mr-1" /> Upload VIX CSV
            </Button>
            {vixData.length > 0 && (
              <span className="text-xs text-muted-foreground">
                ✅ {vixData.length} VIX data points loaded ({vixData[0]?.date} → {vixData[vixData.length - 1]?.date})
                {hasHourlyData && ' (hourly precision)'}
              </span>
            )}
            {tradeVixData.length > 0 && (
              <span className="text-xs text-emerald-500">
                🔗 {tradeVixData.length}/{allTrades.length} trades matched with VIX
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {vixData.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <TrendingUp size={48} className="mb-4 opacity-40" />
          <p className="text-lg font-semibold">Upload VIX Data</p>
          <p className="text-sm">Upload India VIX daily CSV to compare with your trades.</p>
        </div>
      )}

      {summary && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Card><CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">Matched Trades</p>
              <p className="text-xl font-bold text-foreground">{summary.matched}/{summary.total}</p>
            </CardContent></Card>
            <Card><CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">Avg Entry VIX</p>
              <p className="text-xl font-bold text-foreground">{summary.avgEntryVix.toFixed(2)}</p>
            </CardContent></Card>
            <Card><CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">Avg VIX (Wins)</p>
              <p className="text-xl font-bold text-emerald-500">{summary.avgWinVix.toFixed(2)}</p>
            </CardContent></Card>
            <Card><CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">Avg VIX (Losses)</p>
              <p className="text-xl font-bold text-red-500">{summary.avgLossVix.toFixed(2)}</p>
            </CardContent></Card>
            <Card><CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">Best VIX Zone</p>
              <p className="text-xl font-bold text-emerald-500">{summary.bestZone?.bucket ?? '-'}</p>
              <p className="text-[10px] text-muted-foreground">{summary.bestZone ? formatINR(summary.bestZone.avgPnl) + ' avg' : ''}</p>
            </CardContent></Card>
          </div>

          {/* VIX Bucket Analysis Table */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Performance by VIX Range (click to expand)</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="text-left p-2">VIX Range</th>
                      <th className="text-right p-2">Trades</th>
                      <th className="text-right p-2">Wins</th>
                      <th className="text-right p-2">Win%</th>
                      <th className="text-right p-2">Total P&L</th>
                      <th className="text-right p-2">Avg P&L</th>
                      <th className="text-right p-2">PF</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bucketAnalysis.map(b => (
                      <React.Fragment key={b.bucket}>
                        <tr
                          className="border-b border-border/50 hover:bg-muted/30 cursor-pointer"
                          onClick={() => setExpandedBucket(expandedBucket === b.bucket ? null : b.bucket)}
                        >
                          <td className="p-2 font-medium flex items-center gap-1">
                            <span className="text-[10px]">{expandedBucket === b.bucket ? '▼' : '▶'}</span>
                            {b.bucket}
                          </td>
                          <td className="p-2 text-right">{b.trades}</td>
                          <td className="p-2 text-right">{b.wins}</td>
                          <td className="p-2 text-right">{b.winRate.toFixed(1)}%</td>
                          <td className={`p-2 text-right font-medium ${b.totalPnl >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{formatINR(b.totalPnl)}</td>
                          <td className={`p-2 text-right ${b.avgPnl >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{formatINR(b.avgPnl)}</td>
                          <td className="p-2 text-right">{b.profitFactor === Infinity ? '∞' : b.profitFactor.toFixed(2)}</td>
                        </tr>
                        {expandedBucket === b.bucket && (
                          <tr>
                            <td colSpan={7} className="p-0">
                              <div className="bg-muted/20 border-y border-border/30 p-3 max-h-64 overflow-y-auto">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="text-muted-foreground border-b border-border/30">
                                      <th className="text-left p-1.5">#</th>
                                      <th className="text-left p-1.5">Entry Date</th>
                                      <th className="text-left p-1.5">Entry Time</th>
                                      <th className="text-left p-1.5">Exit Date</th>
                                      <th className="text-left p-1.5">Exit Time</th>
                                      <th className="text-right p-1.5">Entry VIX</th>
                                      <th className="text-right p-1.5">Exit VIX</th>
                                      <th className="text-right p-1.5">P&L</th>
                                      <th className="text-center p-1.5">Result</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {bucketTrades.map((t, i) => (
                                      <tr key={i} className="border-b border-border/20 hover:bg-muted/30">
                                        <td className="p-1.5 text-muted-foreground">{i + 1}</td>
                                        <td className="p-1.5">{t.entryDate}</td>
                                        <td className="p-1.5 text-muted-foreground">{t.entryTime}</td>
                                        <td className="p-1.5">{t.exitDate}</td>
                                        <td className="p-1.5 text-muted-foreground">{t.exitTime}</td>
                                        <td className="p-1.5 text-right">{t.entryVix.toFixed(4)}</td>
                                        <td className="p-1.5 text-right">{t.exitVix?.toFixed(4) ?? '-'}</td>
                                        <td className={`p-1.5 text-right font-medium ${t.pnl >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{formatINR(t.pnl)}</td>
                                        <td className={`p-1.5 text-center ${t.isWin ? 'text-emerald-500' : 'text-red-500'}`}>{t.isWin ? 'W' : 'L'}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* VIX Bucket Bar Chart */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Avg P&L by VIX Range</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={bucketAnalysis}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="bucket" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={v => formatINR(v)} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="avgPnl" name="Avg P&L" radius={[4, 4, 0, 0]}>
                    {bucketAnalysis.map((b, i) => (
                      <Cell key={i} fill={b.avgPnl >= 0 ? 'hsl(var(--success))' : 'hsl(var(--destructive))'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* VIX Direction Analysis */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Performance by VIX Direction (Entry → Exit)</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-3">
                {vixChangeAnalysis.map(v => (
                  <div key={v.label} className="border border-border rounded-lg p-3 text-center">
                    <div className="flex items-center justify-center gap-1 mb-1">
                      {v.label.includes('Rising') ? <TrendingUp size={14} className="text-red-500" /> :
                       v.label.includes('Falling') ? <TrendingDown size={14} className="text-emerald-500" /> :
                       <BarChart3 size={14} className="text-muted-foreground" />}
                      <span className="text-xs font-medium">{v.label}</span>
                    </div>
                    <p className="text-lg font-bold">{v.trades} trades</p>
                    <p className={`text-sm font-medium ${v.pnl >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{formatINR(v.pnl)}</p>
                    <p className="text-xs text-muted-foreground">Win: {v.winRate.toFixed(1)}% | Avg: {formatINR(v.avgPnl)}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Scatter: VIX vs P&L */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">VIX at Entry vs Trade P&L</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <ScatterChart>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="vix" name="VIX" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} label={{ value: 'VIX at Entry', position: 'bottom', fontSize: 11 }} />
                  <YAxis dataKey="pnl" name="P&L" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={v => formatINR(v)} />
                  <Tooltip content={<CustomTooltip />} />
                  <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
                  <Scatter data={scatterData} name="Trades">
                    {scatterData.map((d, i) => (
                      <Cell key={i} fill={d.isWin ? 'hsl(var(--success))' : 'hsl(var(--destructive))'} opacity={0.6} />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Monthly Overlay */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Monthly P&L vs Average VIX</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={monthlyOverlay}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis yAxisId="pnl" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={v => formatINR(v)} />
                  <YAxis yAxisId="vix" orientation="right" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Bar yAxisId="pnl" dataKey="pnl" name="Monthly P&L" radius={[3, 3, 0, 0]}>
                    {monthlyOverlay.map((d, i) => (
                      <Cell key={i} fill={d.pnl >= 0 ? 'hsl(var(--success))' : 'hsl(var(--destructive))'} />
                    ))}
                  </Bar>
                  <Line yAxisId="vix" dataKey="avgVix" name="Avg VIX" stroke="hsl(var(--primary))" dot={{ r: 3 }} strokeWidth={2} />
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
