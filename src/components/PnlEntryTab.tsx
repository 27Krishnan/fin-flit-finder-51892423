import { useState, useMemo, useRef, useCallback } from 'react';
import { useManualTrades } from '@/hooks/useManualTrades';
import { formatINR } from '@/lib/format';
import { Plus, Trash2, Eye, EyeOff, Settings, RotateCcw, ChevronUp, ChevronDown, Download, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { format } from 'date-fns';
import { toast } from '@/hooks/use-toast';

function getColorForString(str: string): string {
  if (!str) return 'hsl(var(--foreground))';
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  const h = Math.abs(hash % 360);
  return `hsl(${h}, 70%, 60%)`;
}

export default function PnlEntryTab() {
  const {
    trades, addTrade, updateTrade, removeTrade, clearAll,
    owners, addOwner, removeOwner,
    types, addType, removeType,
    subCategories, addSubCategory, removeSubCategory,
    recycleBin, restoreFromBin, permanentDelete, emptyRecycleBin,
    gasUrl, setGasUrl, pullFromGAS, pushToGAS,
  } = useManualTrades();

  const [showRecycleBin, setShowRecycleBin] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showManage, setShowManage] = useState<'owners' | 'types' | 'subCategories' | null>(null);
  const [manageInput, setManageInput] = useState('');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [minimizePast, setMinimizePast] = useState(() => localStorage.getItem('pnl_minimize_past') === 'true');
  const [syncing, setSyncing] = useState(false);

  const [compactView, setCompactView] = useState(() => localStorage.getItem('pnl_compact_view') === 'true');

  const handleAddRow = () => {
    addTrade({
      date: format(new Date(), 'yyyy-MM-dd'),
      owner: '',
      type: '',
      subCategory: '',
      exitDate: '',
      pl: 0,
      remark: '',
    });
  };

  const handleSort = (col: string) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  };

  const filteredTrades = useMemo(() => {
    let result = [...trades];

    // Filter
    Object.entries(filters).forEach(([col, val]) => {
      if (!val) return;
      const lower = val.toLowerCase();
      result = result.filter(t => {
        const field = col === 'date' ? t.date : col === 'owner' ? t.owner : col === 'type' ? t.type : col === 'subCategory' ? t.subCategory : col === 'exitDate' ? t.exitDate : col === 'pl' ? t.pl.toString() : col === 'remark' ? t.remark : '';
        return field.toLowerCase().includes(lower);
      });
    });

    // Minimize past months
    if (minimizePast) {
      const now = new Date();
      const currentKey = now.getFullYear() * 12 + now.getMonth();
      result = result.filter(t => {
        if (t.exitDate) {
          const d = new Date(t.exitDate);
          return d.getFullYear() * 12 + d.getMonth() >= currentKey;
        }
        return true;
      });
    }

    // Sort
    if (sortCol) {
      result.sort((a, b) => {
        let va: any, vb: any;
        if (sortCol === 'pl') { va = a.pl; vb = b.pl; }
        else if (sortCol === 'date' || sortCol === 'exitDate') {
          va = (a as any)[sortCol] || ''; vb = (b as any)[sortCol] || '';
        }
        else { va = ((a as any)[sortCol] || '').toLowerCase(); vb = ((b as any)[sortCol] || '').toLowerCase(); }
        if (va < vb) return sortDir === 'asc' ? -1 : 1;
        if (va > vb) return sortDir === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [trades, filters, sortCol, sortDir, minimizePast]);

  // Cumulative P/L - always computed in chronological order within current filtered set
  // (so latest row shows the latest total when date is sorted descending)
  const cumulativeMap = useMemo(() => {
    const map = new Map<string, number>();
    const ordered = [...filteredTrades].sort((a, b) => {
      const aHasExit = Boolean(a.exitDate);
      const bHasExit = Boolean(b.exitDate);

      // Realized trades first, pending trades at the end
      if (aHasExit !== bHasExit) return aHasExit ? -1 : 1;

      const aKey = (a.exitDate || a.date || '').trim();
      const bKey = (b.exitDate || b.date || '').trim();
      const dateCmp = aKey.localeCompare(bKey);
      if (dateCmp !== 0) return dateCmp;

      // Stable tie-breakers
      const entryCmp = (a.date || '').localeCompare(b.date || '');
      if (entryCmp !== 0) return entryCmp;
      return a.id.localeCompare(b.id);
    });

    let cum = 0;
    ordered.forEach(t => {
      cum += t.pl;
      map.set(t.id, cum);
    });

    return map;
  }, [filteredTrades]);

  const totalPL = useMemo(() => filteredTrades.reduce((s, t) => s + t.pl, 0), [filteredTrades]);

  const handlePull = async () => {
    setSyncing(true);
    try {
      await pullFromGAS();
      toast({ title: 'Data pulled successfully!' });
    } catch (e: any) {
      toast({ title: 'Pull failed', description: e.message, variant: 'destructive' });
    } finally { setSyncing(false); }
  };

  const handlePush = async () => {
    setSyncing(true);
    try {
      await pushToGAS();
      toast({ title: 'Data pushed successfully!' });
    } catch (e: any) {
      toast({ title: 'Push failed', description: e.message, variant: 'destructive' });
    } finally { setSyncing(false); }
  };

  const columns = [
    { key: 'sno', label: 'S.No', sortable: false, width: 'w-12' },
    { key: 'date', label: 'Date', sortable: true, width: 'min-w-[140px]' },
    { key: 'owner', label: 'Owner', sortable: true, width: 'min-w-[130px]' },
    { key: 'type', label: 'Type', sortable: true, width: 'min-w-[130px]' },
    { key: 'subCategory', label: 'Sub Category', sortable: true, width: 'min-w-[120px]' },
    { key: 'exitDate', label: 'Exit Date', sortable: true, width: 'min-w-[140px]' },
    { key: 'pl', label: 'P/L', sortable: true, width: 'min-w-[100px]' },
    { key: 'cumulative', label: 'Cumulative', sortable: false, width: 'min-w-[110px]' },
    { key: 'remark', label: 'Remark', sortable: true, width: 'min-w-[140px]' },
    { key: 'actions', label: '', sortable: false, width: 'w-10' },
  ];

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Top Actions */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button onClick={handleAddRow} size="sm" className="h-8 text-xs font-bold">
          <Plus size={14} className="mr-1" /> Add Row
        </Button>

        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer ml-auto">
          <input type="checkbox" checked={compactView} onChange={e => {
            setCompactView(e.target.checked);
            localStorage.setItem('pnl_compact_view', String(e.target.checked));
          }} className="rounded" />
          Compact View
        </label>

        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
          <input type="checkbox" checked={minimizePast} onChange={e => {
            setMinimizePast(e.target.checked);
            localStorage.setItem('pnl_minimize_past', String(e.target.checked));
          }} className="rounded" />
          Minimize Past Months
        </label>

        <Button variant="outline" size="sm" onClick={() => setShowRecycleBin(true)} className="h-8 text-xs">
          <RotateCcw size={12} className="mr-1" /> Recycle Bin ({recycleBin.length})
        </Button>

        <Button variant="outline" size="sm" onClick={() => setShowManage('owners')} className="h-8 text-xs">
          Manage Owners
        </Button>
        <Button variant="outline" size="sm" onClick={() => setShowManage('types')} className="h-8 text-xs">
          Manage Types
        </Button>
        <Button variant="outline" size="sm" onClick={() => setShowManage('subCategories')} className="h-8 text-xs">
          Manage Sub Categories
        </Button>

        <Button variant="outline" size="sm" onClick={() => setShowSettings(true)} className="h-8 text-xs">
          <Settings size={12} className="mr-1" /> Sync Settings
        </Button>

        <div className="glass-panel !py-2 !px-4 flex items-center gap-2">
          <span className="text-[0.65rem] uppercase tracking-wider text-muted-foreground font-semibold">Total Net P/L:</span>
          <span className={`mono font-bold text-sm ${totalPL >= 0 ? 'text-success' : 'text-destructive'}`}>{formatINR(totalPL)}</span>
        </div>
      </div>

      {/* Table */}
      <div className="glass-panel overflow-x-auto">
        <table className={`w-full ${compactView ? 'text-xs' : 'text-sm'}`}>
          <thead>
            <tr className={`${compactView ? 'text-[0.65rem]' : 'text-xs'} uppercase text-muted-foreground font-semibold border-b border-border`}>
              {columns.map(col => (
                <th key={col.key} className={`${compactView ? 'py-1.5' : 'py-2.5'} ${col.width} ${col.key === 'pl' || col.key === 'cumulative' ? 'text-right' : 'text-left'} ${col.sortable ? 'cursor-pointer hover:text-primary select-none' : ''}`}
                  onClick={() => col.sortable && handleSort(col.key)}>
                  <div className="flex items-center gap-1">
                    {col.label}
                    {sortCol === col.key && (sortDir === 'asc' ? <ChevronUp size={compactView ? 10 : 12} /> : <ChevronDown size={compactView ? 10 : 12} />)}
                  </div>
                </th>
              ))}
            </tr>
            <tr className="border-b border-border/50">
              <th></th>
              {['date', 'owner', 'type', 'subCategory', 'exitDate', 'pl', 'cumulative', 'remark'].map(col => (
                <th key={col} className={`${compactView ? 'py-0.5' : 'py-1.5'}`}>
                  {col !== 'cumulative' ? (
                    <input
                      type="text"
                      placeholder={`Filter...`}
                      value={filters[col] || ''}
                      onChange={e => setFilters(prev => ({ ...prev, [col]: e.target.value }))}
                      className={`w-full bg-background border border-border/50 rounded px-2 ${compactView ? 'py-0.5 text-[0.6rem]' : 'py-1 text-xs'} text-foreground outline-none focus:border-primary`}
                    />
                  ) : null}
                </th>
              ))}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filteredTrades.map((trade, idx) => {
              const isPending = trade.pl === 0 && !trade.exitDate;
              const py = compactView ? 'py-1' : 'py-2';
              const sz = compactView ? 'text-xs' : 'text-sm';
              const px = compactView ? 'px-1 py-0.5' : 'px-1.5 py-1';
              return (
              <tr key={trade.id} className={`border-b border-border/20 hover:bg-surface-hover transition-colors group ${isPending ? 'bg-yellow-500/8' : ''}`}>
                <td className={`${py} text-muted-foreground text-center ${sz}`}>{idx + 1}</td>
                {/* Date */}
                <td className={py}>
                  <input type="date" value={trade.date}
                    onChange={e => updateTrade(trade.id, { date: e.target.value })}
                    className={`w-full bg-transparent border-none ${sz} text-sky-300 outline-none focus:bg-background/50 rounded ${px} font-medium`} />
                </td>
                {/* Owner */}
                <td className={py}>
                  <input type="text" value={trade.owner} placeholder="Owner" list="owner-list"
                    onChange={e => {
                      updateTrade(trade.id, { owner: e.target.value });
                    }}
                    className={`w-full bg-transparent border-none ${sz} outline-none focus:bg-background/50 rounded ${px} font-semibold`}
                    style={{ color: getColorForString(trade.owner) }} />
                </td>
                {/* Type */}
                <td className={py}>
                  <input type="text" value={trade.type} placeholder="Type" list="type-list"
                    onChange={e => {
                      updateTrade(trade.id, { type: e.target.value });
                    }}
                    className={`w-full bg-transparent border-none ${sz} text-foreground font-medium outline-none focus:bg-background/50 rounded ${px}`} />
                </td>
                {/* Sub Category */}
                <td className={py}>
                  <input type="text" value={trade.subCategory} placeholder="Sub Cat" list="subcat-list"
                    onChange={e => {
                      updateTrade(trade.id, { subCategory: e.target.value });
                    }}
                    className={`w-full bg-transparent border-none ${sz} outline-none focus:bg-background/50 rounded ${px} font-medium`}
                    style={{ color: getColorForString(trade.subCategory) }} />
                </td>
                {/* Exit Date */}
                <td className={py}>
                  <input type="date" value={trade.exitDate}
                    onChange={e => updateTrade(trade.id, { exitDate: e.target.value })}
                    className={`w-full bg-transparent border-none ${sz} outline-none focus:bg-background/50 rounded ${px} font-medium ${trade.exitDate ? 'text-sky-300' : 'text-yellow-500/70'}`} />
                </td>
                {/* P/L */}
                <td className={`${py} text-right`}>
                  <input type="number" value={trade.pl || ''} placeholder="0"
                    onChange={e => {
                      updateTrade(trade.id, { pl: parseFloat(e.target.value) || 0 });
                      if (!trade.exitDate && e.target.value) {
                        updateTrade(trade.id, { exitDate: format(new Date(), 'yyyy-MM-dd') });
                      }
                    }}
                    className={`w-full bg-transparent border-none ${sz} mono text-right outline-none focus:bg-background/50 rounded ${px} font-bold ${trade.pl > 0 ? 'text-success' : trade.pl < 0 ? 'text-destructive' : 'text-yellow-500/70'}`} />
                </td>
                {/* Cumulative */}
                <td className={`${py} text-right`}>
                  <span className={`mono font-semibold ${sz} ${(cumulativeMap.get(trade.id) || 0) >= 0 ? 'text-success' : 'text-destructive'}`}>
                    {(cumulativeMap.get(trade.id) || 0).toFixed(2)}
                  </span>
                </td>
                {/* Remark */}
                <td className={py}>
                  <input type="text" value={trade.remark} placeholder="Remarks"
                    onChange={e => updateTrade(trade.id, { remark: e.target.value })}
                    className={`w-full bg-transparent border-none ${sz} text-orange-300/60 italic outline-none focus:bg-background/50 focus:text-foreground focus:not-italic rounded ${px}`} />
                </td>
                {/* Actions */}
                <td className={`${py} relative`}>
                  <button onClick={() => removeTrade(trade.id)} className={`${compactView ? 'p-0.5' : 'p-1'} rounded hover:bg-destructive/10 text-destructive/40 hover:text-destructive opacity-0 group-hover:opacity-100 transition-all`}>
                    <Trash2 size={compactView ? 12 : 14} />
                  </button>
                  {trade.lastEditedMsg && (
                    <span className="absolute right-0 -top-1 text-[0.55rem] text-muted-foreground/50 whitespace-nowrap">{trade.lastEditedMsg}</span>
                  )}
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>

        {/* Datalists */}
        <datalist id="owner-list">{owners.map(o => <option key={o} value={o} />)}</datalist>
        <datalist id="type-list">{types.map(t => <option key={t} value={t} />)}</datalist>
        <datalist id="subcat-list">{subCategories.map(s => <option key={s} value={s} />)}</datalist>
      </div>


      {/* Recycle Bin Dialog */}
      <Dialog open={showRecycleBin} onOpenChange={setShowRecycleBin}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Recycle Bin</DialogTitle></DialogHeader>
          {recycleBin.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Empty</p>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {recycleBin.map(item => (
                <div key={item.id} className="flex items-center justify-between bg-background rounded px-3 py-2 text-xs">
                  <div>
                    <span className="mono">{item.date}</span> • <span style={{ color: getColorForString(item.owner) }}>{item.owner}</span> • {item.type} •
                    <span className={`mono font-bold ${item.pl >= 0 ? 'text-success' : 'text-destructive'}`}> {item.pl}</span>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => restoreFromBin(item.id)} className="text-primary text-xs hover:underline">Restore</button>
                    <button onClick={() => permanentDelete(item.id)} className="text-destructive text-xs hover:underline">Delete</button>
                  </div>
                </div>
              ))}
              <Button variant="destructive" size="sm" onClick={emptyRecycleBin} className="w-full mt-2">Empty All</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Manage Owners/Types/SubCategories Dialog */}
      <Dialog open={!!showManage} onOpenChange={() => setShowManage(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Manage {showManage === 'owners' ? 'Owners' : showManage === 'types' ? 'Types' : 'Sub Categories'}</DialogTitle></DialogHeader>
          <div className="flex gap-2 mb-3">
            <Input value={manageInput} onChange={e => setManageInput(e.target.value)} placeholder="Add new..."
              onKeyDown={e => {
                if (e.key === 'Enter' && manageInput) {
                  showManage === 'owners' ? addOwner(manageInput) : showManage === 'types' ? addType(manageInput) : addSubCategory(manageInput);
                  setManageInput('');
                }
              }} className="h-8 text-xs" />
            <Button size="sm" onClick={() => { showManage === 'owners' ? addOwner(manageInput) : showManage === 'types' ? addType(manageInput) : addSubCategory(manageInput); setManageInput(''); }} className="h-8 text-xs">Add</Button>
          </div>
          <div className="space-y-1 max-h-60 overflow-y-auto">
            {(showManage === 'owners' ? owners : showManage === 'types' ? types : subCategories).map(item => (
              <div key={item} className="flex items-center justify-between bg-background rounded px-3 py-1.5 text-xs">
                <span style={{ color: (showManage === 'owners' || showManage === 'subCategories') ? getColorForString(item) : undefined, fontWeight: 500 }}>{item}</span>
                <button onClick={() => showManage === 'owners' ? removeOwner(item) : showManage === 'types' ? removeType(item) : removeSubCategory(item)} className="text-destructive/60 hover:text-destructive">
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Settings Dialog */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Google Sheets Sync</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground">Google Apps Script URL</label>
              <Input value={gasUrl} onChange={e => setGasUrl(e.target.value)} placeholder="https://script.google.com/..." className="h-9 text-xs mt-1" />
            </div>
            <div className="flex gap-2">
              <Button onClick={handlePush} disabled={syncing || !gasUrl} className="flex-1 h-9 text-xs">
                <Upload size={12} className="mr-1" /> {syncing ? 'Syncing...' : 'Push to Sheets'}
              </Button>
              <Button variant="outline" onClick={handlePull} disabled={syncing || !gasUrl} className="flex-1 h-9 text-xs">
                <Download size={12} className="mr-1" /> {syncing ? 'Pulling...' : 'Pull from Sheets'}
              </Button>
            </div>
            <p className="text-[0.6rem] text-muted-foreground">Push sends current data to Google Sheets. Pull replaces local data with Sheets data.</p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
