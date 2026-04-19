import { useMemo } from 'react';
import { Trade } from '@/lib/types';
import { formatINR } from '@/lib/format';

interface Props {
  trades: Trade[];
}

export default function MonthlyHeatmap({ trades }: Props) {
  const heatmapData = useMemo(() => {
    // Group trades by date (exit date) -> daily P&L
    const dailyMap = new Map<string, number>();
    trades.forEach(t => {
      const key = `${t.exitDate.getFullYear()}-${String(t.exitDate.getMonth() + 1).padStart(2, '0')}-${String(t.exitDate.getDate()).padStart(2, '0')}`;
      dailyMap.set(key, (dailyMap.get(key) || 0) + t.netPnl);
    });

    // Get last 6 months
    const now = trades.length ? trades[trades.length - 1].exitDate : new Date();
    const months: { year: number; month: number; days: { date: number; pnl: number; hasData: boolean }[]; totalPnl: number }[] = [];

    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = d.getFullYear();
      const month = d.getMonth();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const firstDayOfWeek = new Date(year, month, 1).getDay(); // 0=Sun
      
      let monthTotal = 0;
      const days: { date: number; pnl: number; hasData: boolean }[] = [];
      
      // Add empty cells for offset
      for (let pad = 0; pad < firstDayOfWeek; pad++) {
        days.push({ date: 0, pnl: 0, hasData: false });
      }
      
      for (let day = 1; day <= daysInMonth; day++) {
        const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const pnl = dailyMap.get(key) || 0;
        const hasData = dailyMap.has(key);
        if (hasData) monthTotal += pnl;
        days.push({ date: day, pnl, hasData });
      }

      months.push({ year, month, totalPnl: monthTotal, days });
    }

    // Find max absolute PnL for color scaling
    const allPnls = Array.from(dailyMap.values());
    const maxAbs = Math.max(...allPnls.map(Math.abs), 1);

    return { months, maxAbs };
  }, [trades]);

  const getColor = (pnl: number, hasData: boolean) => {
    if (!hasData) return 'bg-transparent';
    if (pnl === 0) return 'bg-muted/30';
    const intensity = Math.min(Math.abs(pnl) / heatmapData.maxAbs, 1);
    // Use opacity levels for intensity
    if (pnl > 0) {
      if (intensity > 0.7) return 'bg-success/90';
      if (intensity > 0.4) return 'bg-success/60';
      if (intensity > 0.15) return 'bg-success/35';
      return 'bg-success/20';
    } else {
      if (intensity > 0.7) return 'bg-destructive/90';
      if (intensity > 0.4) return 'bg-destructive/60';
      if (intensity > 0.15) return 'bg-destructive/35';
      return 'bg-destructive/20';
    }
  };

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  return (
    <div className="glass-panel">
      <h3 className="text-sm font-bold uppercase tracking-wider text-primary mb-4">Daily P&L Heatmap</h3>
      
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {heatmapData.months.map(m => (
          <div key={`${m.year}-${m.month}`} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">{monthNames[m.month]} {m.year}</span>
              <span className={`text-[0.6rem] mono font-bold ${m.totalPnl >= 0 ? 'text-success' : 'text-destructive'}`}>
                {formatINR(m.totalPnl)}
              </span>
            </div>
            
            {/* Day headers */}
            <div className="grid grid-cols-7 gap-[2px]">
              {dayLabels.map((d, i) => (
                <div key={i} className="text-[0.5rem] text-muted-foreground/50 text-center font-medium">{d}</div>
              ))}
            </div>
            
            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-[2px]">
              {m.days.map((day, i) => (
                <div
                  key={i}
                  className={`aspect-square rounded-[2px] relative group ${day.date === 0 ? '' : getColor(day.pnl, day.hasData)} ${day.date === 0 ? '' : 'border border-border/20'}`}
                  title={day.date > 0 && day.hasData ? `${day.date} ${monthNames[m.month]}: ${formatINR(day.pnl)}` : ''}
                >
                  {/* Tooltip on hover */}
                  {day.date > 0 && day.hasData && (
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-50 pointer-events-none">
                      <div className="bg-card border border-border rounded px-1.5 py-0.5 text-[0.55rem] mono whitespace-nowrap shadow-lg">
                        <span className={day.pnl >= 0 ? 'text-success' : 'text-destructive'}>{formatINR(day.pnl)}</span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-3 mt-4 text-[0.6rem] text-muted-foreground">
        <span>Loss</span>
        <div className="flex gap-[2px]">
          <div className="w-3 h-3 rounded-[2px] bg-destructive/90" />
          <div className="w-3 h-3 rounded-[2px] bg-destructive/60" />
          <div className="w-3 h-3 rounded-[2px] bg-destructive/35" />
          <div className="w-3 h-3 rounded-[2px] bg-destructive/20" />
          <div className="w-3 h-3 rounded-[2px] bg-muted/30 border border-border/20" />
          <div className="w-3 h-3 rounded-[2px] bg-success/20" />
          <div className="w-3 h-3 rounded-[2px] bg-success/35" />
          <div className="w-3 h-3 rounded-[2px] bg-success/60" />
          <div className="w-3 h-3 rounded-[2px] bg-success/90" />
        </div>
        <span>Profit</span>
      </div>
    </div>
  );
}