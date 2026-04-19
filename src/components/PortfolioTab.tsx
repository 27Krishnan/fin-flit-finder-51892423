import { useState, useMemo } from 'react';
import { useManualTrades } from '@/hooks/useManualTrades';
import { formatINR } from '@/lib/format';
import { Plus, Trash2, ChevronDown, ChevronRight, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';

interface ClientGroup {
  name: string;
  startDate: string;
  entries: {
    id: string;
    month: string;
    fund: number;
    profit: number;
    sharingPct: number;
    sharingAmt: number;
    charges: number;
    net: number;
    remark: string;
  }[];
}

export default function PortfolioTab() {
  const { portfolioEntries, addPortfolioEntry, updatePortfolioEntry, removePortfolioEntry } = useManualTrades();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [newClientName, setNewClientName] = useState('');

  // Group entries by client name and compute carry-forward
  const clientGroups = useMemo(() => {
    const groups: Record<string, typeof portfolioEntries> = {};
    portfolioEntries.forEach(e => {
      const key = e.name.trim().toLowerCase();
      if (!groups[key]) groups[key] = [];
      groups[key].push(e);
    });

    const result: ClientGroup[] = [];
    Object.keys(groups).forEach(key => {
      const entries = groups[key].sort((a, b) => a.startDate.localeCompare(b.startDate));
      const firstEntry = entries[0];
      
      const computed = entries.map((e, idx) => {
        const sharingPct = e.sharing || 0;
        const sharingAmt = e.profit > 0 ? (e.profit * sharingPct) / 100 : 0;
        const net = e.profit - sharingAmt - e.charges;
        return {
          id: e.id,
          month: e.startDate,
          fund: e.fund,
          profit: e.profit,
          sharingPct,
          sharingAmt,
          charges: e.charges,
          net,
          remark: e.remark,
        };
      });

      result.push({
        name: firstEntry.name,
        startDate: firstEntry.startDate,
        entries: computed,
      });
    });

    return result.sort((a, b) => a.name.localeCompare(b.name));
  }, [portfolioEntries]);

  const handleAddClient = () => {
    const name = newClientName.trim();
    if (!name) return;
    addPortfolioEntry({
      name,
      startDate: format(new Date(), 'yyyy-MM'),
      endDate: '',
      fund: 0,
      charges: 0,
      profit: 0,
      sharing: 0,
      remark: '',
    });
    setNewClientName('');
  };

  const handleAddMonth = (clientName: string, prevEntries: ClientGroup['entries']) => {
    const last = prevEntries[prevEntries.length - 1];
    // Next month capital = previous fund + profit
    const nextFund = last ? last.fund + last.profit : 0;
    const lastMonth = last?.month || format(new Date(), 'yyyy-MM');
    
    // Increment month
    const [y, m] = lastMonth.split('-').map(Number);
    const nextDate = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;

    addPortfolioEntry({
      name: clientName,
      startDate: nextDate,
      endDate: '',
      fund: Math.round(nextFund * 100) / 100,
      charges: 0,
      profit: 0,
      sharing: last?.sharingPct || 0,
      remark: '',
    });
  };

  const toggleCollapse = (name: string) => {
    setCollapsed(prev => ({ ...prev, [name]: !prev[name] }));
  };

  // Grand totals
  const grandTotals = useMemo(() => {
    let totalFund = 0, totalProfit = 0, totalSharing = 0, totalCharges = 0, totalNet = 0;
    clientGroups.forEach(g => {
      g.entries.forEach(e => {
        totalFund += e.fund;
        totalProfit += e.profit;
        totalSharing += e.sharingAmt;
        totalCharges += e.charges;
        totalNet += e.net;
      });
    });
    return { totalFund, totalProfit, totalSharing, totalCharges, totalNet };
  }, [clientGroups]);

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Add new client */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={newClientName}
          onChange={e => setNewClientName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAddClient()}
          placeholder="New client name..."
          className="h-8 px-3 text-xs rounded-md border border-border bg-background text-foreground outline-none focus:ring-1 focus:ring-primary w-56"
        />
        <Button onClick={handleAddClient} size="sm" className="h-8 text-xs font-bold" disabled={!newClientName.trim()}>
          <UserPlus size={14} className="mr-1" /> Add Client
        </Button>
      </div>

      {clientGroups.length === 0 && (
        <div className="glass-panel text-center py-12 text-muted-foreground text-sm">
          No clients added yet. Add a client name above to get started.
        </div>
      )}

      {/* Client groups */}
      {clientGroups.map(group => {
        const isCollapsed = collapsed[group.name.toLowerCase()] || false;
        const clientTotal = group.entries.reduce((s, e) => ({
          fund: e.fund,
          profit: s.profit + e.profit,
          sharing: s.sharing + e.sharingAmt,
          charges: s.charges + e.charges,
          net: s.net + e.net,
        }), { fund: 0, profit: 0, sharing: 0, charges: 0, net: 0 });
        const latestFund = group.entries[group.entries.length - 1]?.fund || 0;

        return (
          <div key={group.name} className="glass-panel overflow-hidden">
            {/* Client header */}
            <div
              className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-surface-hover transition-colors border-b border-border"
              onClick={() => toggleCollapse(group.name)}
            >
              {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
              <span className="font-bold text-sm text-foreground">{group.name}</span>
              <span className="text-[0.6rem] text-muted-foreground ml-1">since {group.startDate}</span>
              <div className="ml-auto flex items-center gap-4 text-[0.65rem]">
                <span className="text-muted-foreground">Capital: <span className="mono font-semibold text-foreground">{formatINR(latestFund)}</span></span>
                <span className="text-muted-foreground">Total P&L: <span className={`mono font-bold ${clientTotal.net >= 0 ? 'text-success' : 'text-destructive'}`}>{formatINR(clientTotal.net)}</span></span>
                <span className="text-muted-foreground">{group.entries.length} months</span>
              </div>
            </div>

            {!isCollapsed && (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs table-fixed">
                    <thead>
                      <tr className="text-[0.6rem] uppercase text-muted-foreground font-semibold border-b border-border">
                        <th className="py-1.5 px-2 text-left w-[3%]">#</th>
                        <th className="py-1.5 px-2 text-left w-[12%]">Month</th>
                        <th className="py-1.5 px-2 text-right w-[12%]">Capital</th>
                        <th className="py-1.5 px-2 text-right w-[12%]">Profit</th>
                        <th className="py-1.5 px-2 text-right w-[8%]">Sharing %</th>
                        <th className="py-1.5 px-2 text-right w-[12%]">Sharing Amt</th>
                        <th className="py-1.5 px-2 text-right w-[10%]">Charges</th>
                        <th className="py-1.5 px-2 text-right w-[12%]">Net</th>
                        <th className="py-1.5 px-2 text-left w-[16%]">Remark</th>
                        <th className="py-1.5 w-[3%]"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.entries.map((entry, idx) => (
                        <tr key={entry.id} className="border-b border-border/20 hover:bg-surface-hover transition-colors group/row">
                          <td className="py-1.5 px-2 text-muted-foreground">{idx + 1}</td>
                          <td className="py-1.5 px-2">
                            <input type="month" value={entry.month}
                              onChange={e => updatePortfolioEntry(entry.id, { startDate: e.target.value })}
                              className="bg-transparent border-none text-xs text-foreground outline-none focus:bg-background/50 rounded px-1 py-0.5 w-full" />
                          </td>
                          <td className="py-1.5 px-2">
                            <input type="number" value={entry.fund || ''} placeholder="0"
                              onChange={e => updatePortfolioEntry(entry.id, { fund: parseFloat(e.target.value) || 0 })}
                              className="w-full bg-transparent border-none text-xs mono text-right text-foreground outline-none focus:bg-background/50 rounded px-1 py-0.5" />
                          </td>
                          <td className="py-1.5 px-2">
                            <input type="number" value={entry.profit || ''} placeholder="0"
                              onChange={e => updatePortfolioEntry(entry.id, { profit: parseFloat(e.target.value) || 0 })}
                              className="w-full bg-transparent border-none text-xs mono text-right text-foreground outline-none focus:bg-background/50 rounded px-1 py-0.5" />
                          </td>
                          <td className="py-1.5 px-2">
                            <input type="number" value={entry.sharingPct || ''} placeholder="0"
                              onChange={e => updatePortfolioEntry(entry.id, { sharing: parseFloat(e.target.value) || 0 })}
                              className="w-full bg-transparent border-none text-xs mono text-right text-foreground outline-none focus:bg-background/50 rounded px-1 py-0.5" />
                          </td>
                          <td className={`py-1.5 px-2 text-right mono text-xs ${entry.sharingAmt > 0 ? 'text-warning' : 'text-muted-foreground'}`}>
                            {formatINR(entry.sharingAmt)}
                          </td>
                          <td className="py-1.5 px-2">
                            <input type="number" value={entry.charges || ''} placeholder="0"
                              onChange={e => updatePortfolioEntry(entry.id, { charges: parseFloat(e.target.value) || 0 })}
                              className="w-full bg-transparent border-none text-xs mono text-right text-foreground outline-none focus:bg-background/50 rounded px-1 py-0.5" />
                          </td>
                          <td className={`py-1.5 px-2 text-right mono font-bold text-xs ${entry.net >= 0 ? 'text-success' : 'text-destructive'}`}>
                            {formatINR(entry.net)}
                          </td>
                          <td className="py-1.5 px-2">
                            <input type="text" value={entry.remark} placeholder="..."
                              onChange={e => updatePortfolioEntry(entry.id, { remark: e.target.value })}
                              className="w-full bg-transparent border-none text-xs text-muted-foreground outline-none focus:bg-background/50 rounded px-1 py-0.5" />
                          </td>
                          <td className="py-1.5 px-2">
                            <button onClick={() => removePortfolioEntry(entry.id)}
                              className="p-0.5 rounded hover:bg-destructive/10 text-destructive/40 hover:text-destructive opacity-0 group-hover/row:opacity-100 transition-all">
                              <Trash2 size={11} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="px-3 py-1.5 border-t border-border/30">
                  <Button onClick={() => handleAddMonth(group.name, group.entries)} size="sm" variant="ghost" className="h-6 text-[0.65rem] text-muted-foreground hover:text-foreground">
                    <Plus size={12} className="mr-1" /> Add Month
                  </Button>
                </div>
              </>
            )}
          </div>
        );
      })}

      {/* Grand totals */}
      {clientGroups.length > 0 && (
        <div className="glass-panel !py-2 !px-4 flex items-center gap-6 text-[0.65rem]">
          <span className="uppercase tracking-wider text-muted-foreground font-semibold">Grand Total:</span>
          <span className="text-muted-foreground">Profit: <span className={`mono font-bold ${grandTotals.totalProfit >= 0 ? 'text-success' : 'text-destructive'}`}>{formatINR(grandTotals.totalProfit)}</span></span>
          <span className="text-muted-foreground">Sharing: <span className="mono font-semibold text-warning">{formatINR(grandTotals.totalSharing)}</span></span>
          <span className="text-muted-foreground">Charges: <span className="mono font-semibold text-foreground">{formatINR(grandTotals.totalCharges)}</span></span>
          <span className="text-muted-foreground ml-auto">Net: <span className={`mono font-bold text-sm ${grandTotals.totalNet >= 0 ? 'text-success' : 'text-destructive'}`}>{formatINR(grandTotals.totalNet)}</span></span>
        </div>
      )}
    </div>
  );
}
