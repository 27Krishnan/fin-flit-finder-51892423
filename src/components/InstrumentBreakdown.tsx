import { FileData } from '@/lib/types';
import { formatINR } from '@/lib/format';

interface Props {
  files: FileData[];
}

export default function InstrumentBreakdown({ files }: Props) {
  const visibleFiles = files.filter(f => f.visible && f.trades.length);
  if (!visibleFiles.length) return null;

  const rows = visibleFiles.map(f => {
    const trades = f.trades;
    const wins = trades.filter(t => t.isWin);
    const grossWin = wins.reduce((s, t) => s + t.netPnl * f.multiplier, 0);
    const losses = trades.filter(t => !t.isWin);
    const grossLoss = Math.abs(losses.reduce((s, t) => s + t.netPnl * f.multiplier, 0));
    const netPnl = grossWin - grossLoss;
    const expectancy = trades.length ? netPnl / trades.length : 0;

    return {
      name: f.name,
      trades: trades.length,
      winPct: (wins.length / trades.length) * 100,
      netPnl, grossWin, grossLoss: -grossLoss, expectancy,
    };
  });

  return (
    <div className="glass-panel">
      <div className="text-[0.7rem] font-bold uppercase tracking-wider text-muted-foreground mb-3 border-b border-border pb-2">
        Instrument Breakdown
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[0.7rem] uppercase text-muted-foreground">
              <th className="py-2 px-3">File</th>
              <th className="py-2 px-3">Trades</th>
              <th className="py-2 px-3">Win %</th>
              <th className="py-2 px-3">Net P&L</th>
              <th className="py-2 px-3">Gross Win</th>
              <th className="py-2 px-3">Gross Loss</th>
              <th className="py-2 px-3">Expectancy</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.name} className="border-t border-border/50 hover:bg-surface-hover transition-colors">
                <td className="py-2.5 px-3 font-semibold">{r.name}</td>
                <td className="py-2.5 px-3 mono">{r.trades}</td>
                <td className={`py-2.5 px-3 mono ${r.winPct >= 50 ? 'text-success' : 'text-destructive'}`}>{r.winPct.toFixed(1)}%</td>
                <td className={`py-2.5 px-3 mono font-semibold ${r.netPnl >= 0 ? 'text-success' : 'text-destructive'}`}>{formatINR(r.netPnl)}</td>
                <td className="py-2.5 px-3 mono text-success">{formatINR(r.grossWin)}</td>
                <td className="py-2.5 px-3 mono text-destructive">{formatINR(r.grossLoss)}</td>
                <td className={`py-2.5 px-3 mono ${r.expectancy >= 0 ? 'text-success' : 'text-destructive'}`}>{formatINR(r.expectancy)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
