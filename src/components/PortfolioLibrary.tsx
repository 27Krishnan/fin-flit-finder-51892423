import { useState } from 'react';
import { useAppContext } from '@/context/AppContext';
import { useSavedPortfolios } from '@/hooks/useDatabase';
import { Trash2, Pencil, Check, X, FolderOpen, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export default function PortfolioLibrary() {
  const ctx = useAppContext();
  const { files, addFile, setFileCapital, setMultiplier, setFileSlippage, setFileTimeFrame } = ctx;
  const { portfolios, loading, savePortfolio, updatePortfolioName, deletePortfolio } = useSavedPortfolios();
  const [saveName, setSaveName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const handleSave = async () => {
    if (!saveName.trim() || !files.length) return;
    
    const fileSnapshots = files.map(f => ({
      name: f.name,
      csvText: f.csvText || '',
      capital: f.capital,
      multiplier: f.multiplier,
      slippage: f.slippage,
      timeFrame: f.timeFrame,
      visible: f.visible,
    }));

    await savePortfolio(saveName.trim(), fileSnapshots, ctx.globalCapital);
    setSaveName('');
    toast.success(`Portfolio "${saveName.trim()}" saved to cloud`);
  };

  const handleDelete = async (id: string) => {
    await deletePortfolio(id);
    toast.success('Portfolio deleted');
  };

  const handleLoad = (portfolio: typeof portfolios[0]) => {
    const hasCSV = portfolio.files.some((f: any) => f.csvText);
    
    if (hasCSV) {
      portfolio.files.forEach((saved: any) => {
        if (saved.csvText) {
          addFile(saved.name, saved.csvText);
        }
      });
      setTimeout(() => {
        portfolio.files.forEach((saved: any) => {
          setFileCapital(saved.name, saved.capital);
          setMultiplier(saved.name, saved.multiplier);
          setFileSlippage(saved.name, saved.slippage);
          setFileTimeFrame(saved.name, saved.timeFrame);
        });
        toast.success(`Loaded portfolio "${portfolio.name}" with ${portfolio.files.length} files`);
      }, 100);
    } else {
      const currentFiles = ctx.files;
      let matched = 0;
      portfolio.files.forEach((saved: any) => {
        const exists = currentFiles.find(f => f.name === saved.name);
        if (exists) {
          setFileCapital(saved.name, saved.capital);
          setMultiplier(saved.name, saved.multiplier);
          setFileSlippage(saved.name, saved.slippage);
          setFileTimeFrame(saved.name, saved.timeFrame);
          matched++;
        }
      });
      if (matched > 0) {
        toast.success(`Applied settings to ${matched} matching files`);
      } else {
        toast.error(`Upload the CSV files first, then load this portfolio to apply settings`);
      }
    }
  };

  const handleEditStart = (p: typeof portfolios[0]) => {
    setEditingId(p.id);
    setEditName(p.name);
  };

  const handleEditSave = async (id: string) => {
    if (!editName.trim()) return;
    await updatePortfolioName(id, editName.trim());
    setEditingId(null);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-IN', { day: 'numeric', month: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
  };

  if (loading) {
    return (
      <div className="glass-panel flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <span className="ml-2 text-muted-foreground">Loading portfolios...</span>
      </div>
    );
  }

  return (
    <div className="glass-panel">
      <h3 className="text-sm font-bold text-foreground mb-3">Portfolio Library <span className="text-xs text-primary font-normal">(Cloud Synced)</span></h3>

      {/* Save input */}
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={saveName}
          onChange={(e) => setSaveName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          placeholder="Save current portfolio as..."
          className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary"
        />
        <Button
          onClick={handleSave}
          disabled={!saveName.trim() || !files.length}
          className="bg-success hover:bg-success/90 text-success-foreground font-semibold px-5"
          size="sm"
        >
          Save
        </Button>
      </div>

      {/* Saved portfolios list */}
      <div className="space-y-2">
        {portfolios.map(p => {
          const hasData = p.files.some((f: any) => f.csvText);
          return (
            <div
              key={p.id}
              className="flex items-center justify-between bg-card border border-border rounded-lg px-3 py-2.5 hover:border-primary/30 transition-all cursor-pointer group"
              onClick={() => handleLoad(p)}
            >
              <div className="flex-1 min-w-0">
                {editingId === p.id ? (
                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleEditSave(p.id)}
                      className="bg-background border border-primary rounded px-2 py-0.5 text-sm text-foreground outline-none"
                      autoFocus
                    />
                    <button onClick={() => handleEditSave(p.id)} className="p-1 text-success hover:bg-success/10 rounded"><Check size={14} /></button>
                    <button onClick={() => setEditingId(null)} className="p-1 text-muted-foreground hover:bg-secondary rounded"><X size={14} /></button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <FolderOpen size={14} className="text-primary shrink-0" />
                      <span className="text-sm font-bold text-foreground">{p.name}</span>
                      <span className="text-[0.6rem] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold">
                        {p.files.length} files
                      </span>
                      {!hasData && (
                        <span className="text-[0.6rem] px-1.5 py-0.5 rounded bg-warning/10 text-warning font-semibold">
                          settings only
                        </span>
                      )}
                    </div>
                    <div className="text-[0.65rem] text-muted-foreground">
                      Created: {formatDate(p.createdAt)} &nbsp;&nbsp; Mod: {formatDate(p.updatedAt)}
                    </div>
                  </>
                )}
              </div>
              <div className="flex items-center gap-1 ml-2" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => handleEditStart(p)}
                  className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-primary transition-colors opacity-0 group-hover:opacity-100"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => handleDelete(p.id)}
                  className="p-1.5 rounded hover:bg-destructive/10 text-destructive/70 hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          );
        })}
        {portfolios.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-2">No saved portfolios yet</p>
        )}
      </div>
    </div>
  );
}
