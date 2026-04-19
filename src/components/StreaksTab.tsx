import { useAppContext } from '@/context/AppContext';
import { getStreaks } from '@/lib/metrics';
import { formatINR, formatDateShort, formatDate } from '@/lib/format';
import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

export default function StreaksTab() {
  const { allTrades } = useAppContext();

  if (!allTrades.length) return <div className="text-center text-muted-foreground py-20">Upload data to view streak analysis</div>;

  const { winStreaks, lossStreaks } = getStreaks(allTrades);

  return (
    <div className="space-y-6 animate-fade-in">
      <h2 className="text-xl font-bold">Streak Analysis</h2>
      <StreakTable streaks={winStreaks} isWin={true} />
      <StreakTable streaks={lossStreaks} isWin={false} />
    </div>
  );
}

function StreakTable({ streaks, isWin }: { streaks: ReturnType<typeof getStreaks>['winStreaks']; isWin: boolean }) {
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <div className="glass-panel">
      <div className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3 border-b border-border pb-2">
        {isWin ? '🟢 Winning' : '🔴 Losing'} Streaks Distribution
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[0.7rem] uppercase text-muted-foreground">
              <th className="py-2 px-3 w-8"></th>
              <th className="py-2 px-3">Streak Length</th>
              <th className="py-2 px-3">Count</th>
              <th className="py-2 px-3">Probability</th>
              <th className="py-2 px-3">Total Amount</th>
              <th className="py-2 px-3">Avg Amount</th>
              <th className="py-2 px-3">{isWin ? 'Max Profit' : 'Max Loss'}</th>
              <th className="py-2 px-3">{isWin ? 'Min Profit' : 'Min Loss'}</th>
            </tr>
          </thead>
          <tbody>
            {streaks.map(s => (
              <>
                <tr
                  key={s.length}
                  className="border-t border-border/50 hover:bg-surface-hover transition-colors cursor-pointer"
                  onClick={() => setExpanded(expanded === s.length ? null : s.length)}
                >
                  <td className="py-2 px-3">
                    {expanded === s.length ? <ChevronDown size={14} className="text-primary" /> : <ChevronRight size={14} className="text-muted-foreground" />}
                  </td>
                  <td className="py-2 px-3 mono font-semibold">{s.length}</td>
                  <td className="py-2 px-3 mono">{s.count}</td>
                  <td className="py-2 px-3 mono">{s.probability.toFixed(1)}%</td>
                  <td className={`py-2 px-3 mono ${isWin ? 'text-success' : 'text-destructive'}`}>{formatINR(s.total)}</td>
                  <td className={`py-2 px-3 mono ${isWin ? 'text-success' : 'text-destructive'}`}>{formatINR(s.avg)}</td>
                  <td className="py-2 px-3 mono">{formatINR(s.max)}</td>
                  <td className="py-2 px-3 mono">{formatINR(s.min)}</td>
                </tr>
                {expanded === s.length && s.details.map((d, di) => (
                  <>
                    {/* Streak header row */}
                    <tr key={`${s.length}-header-${di}`} className="bg-background/30 border-t border-border/30">
                      <td className="py-1.5 px-3"></td>
                      <td colSpan={7} className="py-1.5 px-3 text-xs text-muted-foreground font-semibold">
                        Streak {di + 1}: {formatDateShort(d.startDate)} → {formatDateShort(d.endDate)} | Total: <span className={isWin ? 'text-success' : 'text-destructive'}>{formatINR(d.totalPnl)}</span>
                      </td>
                    </tr>
                    {/* Individual trade rows */}
                    {d.trades.map((t, ti) => (
                      <tr key={`${s.length}-${di}-${ti}`} className="bg-background/50 text-xs border-t border-border/20">
                        <td className="py-1 px-3"></td>
                        <td className="py-1 px-3 mono text-muted-foreground">{ti + 1}</td>
                        <td colSpan={2} className="py-1 px-3 mono text-muted-foreground">
                          {formatDate(t.exitDate)}
                        </td>
                        <td className={`py-1 px-3 mono font-semibold ${isWin ? 'text-success' : 'text-destructive'}`}>
                          {formatINR(t.netPnl)}
                        </td>
                        <td className="py-1 px-3 mono text-muted-foreground capitalize">{t.direction}</td>
                        <td colSpan={2} className="py-1 px-3 text-muted-foreground truncate max-w-[120px]">{t.signal}</td>
                      </tr>
                    ))}
                  </>
                ))}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
