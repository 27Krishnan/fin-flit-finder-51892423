import { useAppContext } from '@/context/AppContext';
import { getTimeAnalysis } from '@/lib/metrics';
import { formatINR } from '@/lib/format';
import { useState, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { ChevronDown, ChevronRight } from 'lucide-react';

export default function TimeTab() {
  const { allTrades, files } = useAppContext();
  // Default interval from first visible file's timeFrame setting
  const visibleFiles = files.filter(f => f.visible && f.trades.length);
  const defaultInterval = (() => {
    const tf = visibleFiles[0]?.timeFrame || '15m';
    if (tf === '1h' || tf === '60m') return 60;
    if (tf === '30m') return 30;
    return 15;
  })();
  const [interval, setInterval_] = useState(defaultInterval);
  const [dateRange, setDateRange] = useState<'all' | '1y' | '2y' | '3y' | 'custom'>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [expandedSlot, setExpandedSlot] = useState<string | null>(null);
  const [expandedFile, setExpandedFile] = useState<string | null>(null);

  if (!allTrades.length) return <div className="text-center text-muted-foreground py-20">Upload data to view time analysis</div>;

  // visibleFiles already defined above

  // Filter trades by date range
  const filteredTrades = (() => {
    if (dateRange === 'all') return allTrades;
    const now = allTrades[allTrades.length - 1].exitDate;
    if (dateRange === 'custom' && customFrom && customTo) {
      const from = new Date(customFrom);
      const to = new Date(customTo);
      return allTrades.filter(t => t.entryDate >= from && t.entryDate <= to);
    }
    const years = dateRange === '1y' ? 1 : dateRange === '2y' ? 2 : 3;
    const from = new Date(now);
    from.setFullYear(from.getFullYear() - years);
    return allTrades.filter(t => t.entryDate >= from);
  })();

  const data = getTimeAnalysis(filteredTrades, interval);

  // Per-file breakdown for a given time slot
  const getFileBreakdown = (slot: string) => {
    return visibleFiles.map(f => {
      const fileTrades = f.trades.filter(t => {
        const inRange = filteredTrades.some(ft => ft.tradeNum === t.tradeNum && ft.fileName === t.fileName);
        if (!inRange) return false;
        const h = t.entryDate.getHours();
        const m = Math.floor(t.entryDate.getMinutes() / interval) * interval;
        const key = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        return key === slot;
      });
      const wins = fileTrades.filter(t => t.isWin).length;
      const losses = fileTrades.length - wins;
      const pnl = fileTrades.reduce((s, t) => s + (t.netPnl * f.multiplier) - (t.posValue * f.multiplier * f.slippage / 100), 0);
      const winPnl = fileTrades.filter(t => t.isWin).reduce((s, t) => s + (t.netPnl * f.multiplier) - (t.posValue * f.multiplier * f.slippage / 100), 0);
      const lossPnl = fileTrades.filter(t => !t.isWin).reduce((s, t) => s + (t.netPnl * f.multiplier) - (t.posValue * f.multiplier * f.slippage / 100), 0);
      const winRate = fileTrades.length ? (wins / fileTrades.length) * 100 : 0;
      // Individual trades with date info
      const tradeDetails = fileTrades.map(t => ({
        date: t.entryDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }),
        entryTime: t.entryDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
        exitTime: t.exitDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
        pnl: (t.netPnl * f.multiplier) - (t.posValue * f.multiplier * f.slippage / 100),
        isWin: t.isWin,
        direction: t.direction,
      })).sort((a, b) => b.date.localeCompare(a.date));
      return { name: f.name, trades: fileTrades.length, wins, losses, pnl, winPnl, lossPnl, winRate, tradeDetails };
    }).filter(fb => fb.trades > 0);
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="glass-panel">
        <div className="flex flex-wrap justify-between items-center gap-2 mb-3">
          <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Performance by Time</h3>
          <div className="flex flex-wrap gap-2">
           <div className="flex gap-1 bg-background p-0.5 rounded-lg border border-border">
              {[{ v: 15, l: '15 Min' }, { v: 30, l: '30 Min' }, { v: 60, l: '1 Hour' }].map(({ v, l }) => (
                <button key={v} onClick={() => setInterval_(v)}
                  className={`text-sm px-3 py-1 rounded font-medium transition-all ${interval === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                >{l}</button>
              ))}
            </div>
            <div className="flex gap-1 bg-background p-0.5 rounded-lg border border-border">
              {[
                { v: 'all' as const, l: 'All Time' },
                { v: '1y' as const, l: 'Last 1 Year' },
                { v: '2y' as const, l: 'Last 2 Years' },
                { v: '3y' as const, l: 'Last 3 Years' },
                { v: 'custom' as const, l: 'Custom Range' },
              ].map(({ v, l }) => (
                <button key={v} onClick={() => setDateRange(v)}
                  className={`text-sm px-3 py-1 rounded font-medium transition-all ${dateRange === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                >{l}</button>
              ))}
            </div>
          </div>
        </div>

        {dateRange === 'custom' && (
          <div className="flex gap-2 mb-3 animate-fade-in">
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
              className="bg-background border border-border rounded px-3 py-1.5 text-sm text-foreground outline-none focus:border-primary" />
            <span className="text-muted-foreground self-center text-sm">to</span>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
              className="bg-background border border-border rounded px-3 py-1.5 text-sm text-foreground outline-none focus:border-primary" />
          </div>
        )}

        <div className="text-[0.65rem] text-muted-foreground mb-2">{filteredTrades.length} trades</div>

        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(217, 19%, 22%)" opacity={0.5} />
            <XAxis dataKey="slot" tick={{ fontSize: 12, fill: 'hsl(215, 20%, 65%)' }} />
            <YAxis tick={{ fontSize: 11, fill: 'hsl(215, 20%, 65%)' }} tickFormatter={v => formatINR(v)} />
            <Tooltip content={({ active, payload, label }: any) => {
              if (!active || !payload?.length) return null;
              return (
                <div className="glass-panel text-xs py-1.5 px-2.5 !bg-card/95">
                  <p className="text-muted-foreground mb-0.5 font-semibold">{label}</p>
                  <p className="mono font-semibold" style={{ color: payload[0].value >= 0 ? 'hsl(160, 84%, 39%)' : 'hsl(0, 72%, 51%)' }}>
                    {formatINR(payload[0].value)}
                  </p>
                </div>
              );
            }} cursor={{ fill: 'transparent' }} />
            <Bar dataKey="pnl" radius={[3, 3, 0, 0]}>
              {data.map((d, i) => <Cell key={i} fill={d.pnl >= 0 ? 'hsl(160, 84%, 39%)' : 'hsl(0, 72%, 51%)'} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>

        {/* Compact time slot table with expandable per-file dropdown */}
        <div className="overflow-x-auto mt-3">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-muted-foreground font-semibold">
                <th className="py-2 px-2"></th>
                <th className="py-2 px-2">Time Slot</th>
                <th className="py-2 px-2">Trades</th>
                <th className="py-2 px-2">Wins</th>
                <th className="py-2 px-2">Losses</th>
                <th className="py-2 px-2">Win %</th>
                <th className="py-2 px-2">Net P&L</th>
              </tr>
            </thead>
            <tbody>
              {data.map(d => {
                const isExpanded = expandedSlot === d.slot;
                const fileBreakdown = isExpanded ? getFileBreakdown(d.slot) : [];
                return (
                  <>
                    <tr
                      key={d.slot}
                      className={`border-t border-border/50 cursor-pointer transition-colors ${isExpanded ? 'bg-primary/5' : 'hover:bg-surface-hover'}`}
                      onClick={() => setExpandedSlot(isExpanded ? null : d.slot)}
                    >
                      <td className="py-2 px-2">
                        {isExpanded ? <ChevronDown size={14} className="text-primary" /> : <ChevronRight size={14} className="text-muted-foreground" />}
                      </td>
                      <td className="py-2 px-2 mono font-bold text-sm">{d.slot}</td>
                      <td className="py-2 px-2 mono">{d.trades}</td>
                      <td className="py-2 px-2 mono text-success font-semibold">{d.wins}</td>
                      <td className="py-2 px-2 mono text-destructive font-semibold">{d.trades - d.wins}</td>
                      <td className={`py-2 px-2 mono font-bold ${d.winRate >= 50 ? 'text-success' : 'text-destructive'}`}>{d.winRate.toFixed(1)}%</td>
                      <td className={`py-2 px-2 mono font-bold ${d.pnl >= 0 ? 'text-success' : 'text-destructive'}`}>{formatINR(d.pnl)}</td>
                    </tr>
                    {isExpanded && fileBreakdown.map(fb => {
                      const fileKey = `${d.slot}-${fb.name}`;
                      const isFileExpanded = expandedFile === fileKey;
                      return (
                        <>
                          <tr
                            key={fileKey}
                            className={`border-t border-border/20 cursor-pointer transition-colors ${isFileExpanded ? 'bg-primary/5' : 'bg-background/40 hover:bg-surface-hover'}`}
                            onClick={(e) => { e.stopPropagation(); setExpandedFile(isFileExpanded ? null : fileKey); }}
                          >
                            <td className="py-2 px-2 pl-4">
                              {isFileExpanded ? <ChevronDown size={12} className="text-primary" /> : <ChevronRight size={12} className="text-muted-foreground" />}
                            </td>
                            <td className="py-2 px-2 text-xs text-muted-foreground pl-6 truncate max-w-[140px]">{fb.name}</td>
                            <td className="py-2 px-2 mono text-xs">{fb.trades}</td>
                            <td className="py-2 px-2 mono text-xs text-success">{fb.wins}</td>
                            <td className="py-2 px-2 mono text-xs text-destructive">{fb.losses}</td>
                            <td className={`py-2 px-2 mono text-xs ${fb.winRate >= 50 ? 'text-success' : 'text-destructive'}`}>{fb.winRate.toFixed(1)}%</td>
                            <td className="py-2 px-2 mono text-xs">
                              <span className={fb.pnl >= 0 ? 'text-success' : 'text-destructive'}>{formatINR(fb.pnl)}</span>
                              <span className="text-muted-foreground ml-1">
                                (W:{formatINR(fb.winPnl)} L:{formatINR(fb.lossPnl)})
                              </span>
                            </td>
                          </tr>
                          {isFileExpanded && fb.tradeDetails.map((td, idx) => (
                            <tr key={`${fileKey}-${idx}`} className="border-t border-border/10 bg-background/20">
                              <td className="py-1.5 px-2"></td>
                              <td className="py-1.5 px-2 mono text-xs text-foreground pl-10">{td.date}</td>
                              <td className="py-1.5 px-2 mono text-xs text-muted-foreground">{td.entryTime} → {td.exitTime}</td>
                              <td className={`py-1.5 px-2 mono text-xs font-semibold ${td.isWin ? 'text-success' : 'text-destructive'}`}>
                                {td.isWin ? 'Win' : 'Loss'}
                              </td>
                              <td className="py-1.5 px-2 mono text-xs capitalize text-muted-foreground">{td.direction}</td>
                              <td></td>
                              <td className={`py-1.5 px-2 mono text-xs font-semibold ${td.pnl >= 0 ? 'text-success' : 'text-destructive'}`}>{formatINR(td.pnl)}</td>
                            </tr>
                          ))}
                        </>
                      );
                    })}
                    {isExpanded && fileBreakdown.length === 0 && (
                      <tr key={`${d.slot}-empty`} className="bg-background/40">
                        <td colSpan={7} className="py-2 px-2 text-xs text-muted-foreground text-center">No file breakdown available</td>
                      </tr>
                    )}
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
