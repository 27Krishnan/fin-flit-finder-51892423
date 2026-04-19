import { useAppContext } from '@/context/AppContext';
import { useAuth } from '@/context/AuthContext';
import { TabId } from '@/lib/types';
import { BarChart3, TrendingUp, Clock, Zap, List, GitBranch, Gauge, Upload, Eye, EyeOff, FileText, Calendar, Trash2, Wallet, CalendarIcon, Download, ChevronDown, ChevronUp, LogOut, XCircle } from 'lucide-react';
import AdminPanel from './AdminPanel';
import { useRef, useState, useCallback } from 'react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { calculateMetrics, getYearOverview } from '@/lib/metrics';
import PdfReport from './PdfReport';
import { exportPDF } from '@/lib/pdf-export';
import { createRoot } from 'react-dom/client';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <BarChart3 size={16} /> },
  { id: 'charts', label: 'Analysis', icon: <TrendingUp size={16} /> },
  { id: 'yearOverview', label: 'Year Overview', icon: <Calendar size={16} /> },
  { id: 'time', label: 'Time', icon: <Clock size={16} /> },
  { id: 'streaks', label: 'Streaks', icon: <Zap size={16} /> },
  { id: 'trades', label: 'Trade Log', icon: <List size={16} /> },
  { id: 'correlation', label: 'Correlation', icon: <GitBranch size={16} /> },
  { id: 'efficiency', label: 'Efficiency', icon: <Gauge size={16} /> },
  { id: 'vix', label: 'VIX', icon: <TrendingUp size={16} /> },
  { id: 'capitalUtil', label: 'Capital Util', icon: <Wallet size={16} /> },
  { id: 'pnlEntry', label: 'P&L Entry', icon: <Upload size={16} /> },
  { id: 'pnlDashboard', label: 'P&L Dashboard', icon: <BarChart3 size={16} /> },
  { id: 'monthlyPnl', label: 'Monthly P&L', icon: <Calendar size={16} /> },
  { id: 'portfolio', label: 'Portfolio', icon: <Wallet size={16} /> },
  { id: 'aiAnalysis', label: 'AI Analysis', icon: <TrendingUp size={16} /> },
];

export default function Header() {
  const { activeTab, setActiveTab, files, addFile, removeFile, toggleFileVisibility, setMultiplier, setFileCapital, setFileSlippage, setFileTimeFrame, loadSampleData, dateFilter, setDateFilter, clearDateFilter, clearAllFiles, allTrades, globalCapital } = useAppContext();
  const { user, signOut } = useAuth();
  const isAdmin = user?.email === 'charmkrish@gmail.com';
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pdfRef = useRef<HTMLDivElement>(null);
  const [multiplierInputs, setMultiplierInputs] = useState<Record<string, string>>({});
  const [sourcesExpanded, setSourcesExpanded] = useState(true);
  const [exporting, setExporting] = useState(false);

  const handleExportPDF = useCallback(async () => {
    if (!allTrades.length || exporting) return;
    setExporting(true);
    toast.info('Generating PDF report with AI analysis...');
    try {
      const visibleFiles = files.filter(f => f.visible);
      const totalCapital = visibleFiles.reduce((s, f) => s + (f.capital * f.multiplier), 0) || globalCapital;
      const metrics = calculateMetrics(allTrades, totalCapital);
      const years = getYearOverview(allTrades);
      const fileNames = visibleFiles.map(f => f.name.replace('.csv', '')).join(', ');

      // Call AI to generate strategy overview
      let strategyOverview = '';
      let keyHighlights: string[] = [];
      try {
        const yearlyStr = years.map(y => `${y.year}: PnL=${y.totalPnl}, WR=${y.winRate.toFixed(1)}%, Trades=${y.totalTrades}`).join('; ');
        const { data, error } = await supabase.functions.invoke('analyze-strategy', {
          body: {
            metrics: {
              netProfit: metrics.netProfit,
              winRate: metrics.winRate,
              profitFactor: metrics.profitFactor,
              maxDrawdown: metrics.maxDrawdown,
              avgWin: metrics.avgWin,
              avgLoss: metrics.avgLoss,
              payoffRatio: metrics.payoffRatio,
              sharpeRatio: metrics.sharpeRatio,
              sortinoRatio: metrics.sortinoRatio,
              maxConsecLosses: metrics.maxConsecLosses,
            },
            tradeCount: metrics.totalTrades,
            capital: totalCapital,
            fileNames,
            yearlyData: yearlyStr,
          },
        });
        if (!error && data) {
          strategyOverview = data.strategyOverview || '';
          keyHighlights = data.keyHighlights || [];
        }
      } catch (aiErr) {
        console.warn('AI analysis fallback:', aiErr);
      }

      // Create temporary container for PDF rendering
      const container = document.createElement('div');
      document.body.appendChild(container);

      const root = createRoot(container);
      const reportRef = { current: null as HTMLDivElement | null };

      await new Promise<void>((resolve) => {
        root.render(
          <PdfReport
            ref={(el) => { reportRef.current = el; setTimeout(resolve, 500); }}
            metrics={metrics}
            trades={allTrades}
            capital={totalCapital}
            files={files}
            strategyOverview={strategyOverview}
            keyHighlights={keyHighlights}
          />
        );
      });

      if (reportRef.current) {
        await exportPDF(reportRef.current, 'FiFto_Portfolio_Report');
      }

      root.unmount();
      document.body.removeChild(container);
      toast.success('PDF report downloaded!');
    } catch (err) {
      console.error('PDF export failed:', err);
      toast.error('PDF export failed');
    } finally {
      setExporting(false);
    }
  }, [allTrades, files, globalCapital, exporting]);
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFiles = e.target.files;
    if (!uploadedFiles) return;
    Array.from(uploadedFiles).forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target?.result as string;
        addFile(file.name, text);
      };
      reader.readAsText(file);
    });
    e.target.value = '';
  };

  const handleMultiplierChange = (fileName: string, rawValue: string) => {
    setMultiplierInputs(prev => ({ ...prev, [fileName]: rawValue }));
    const num = parseFloat(rawValue);
    if (!isNaN(num) && num > 0) {
      setMultiplier(fileName, num);
    }
  };

  const handleMultiplierBlur = (fileName: string, currentMultiplier: number) => {
    const raw = multiplierInputs[fileName];
    const num = parseFloat(raw);
    if (isNaN(num) || num <= 0) {
      setMultiplierInputs(prev => ({ ...prev, [fileName]: currentMultiplier.toString() }));
    }
  };

  const getMultiplierDisplay = (fileName: string, multiplier: number) => {
    return multiplierInputs[fileName] !== undefined ? multiplierInputs[fileName] : multiplier.toString();
  };

  const hasDateFilter = dateFilter.startDate || dateFilter.endDate;

  return (
    <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-extrabold tracking-tight uppercase text-foreground">
          FiFto <span className="text-primary">Backtest</span> Viewer
        </h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:-translate-y-0.5 transition-all"
            style={{ boxShadow: '0 4px 12px hsla(199, 89%, 58%, 0.3)' }}
          >
            <Upload size={14} /> Upload CSV
          </button>
          {allTrades.length > 0 && (
            <button
              onClick={handleExportPDF}
              disabled={exporting}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-success text-success-foreground text-sm font-semibold hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ boxShadow: '0 4px 12px hsla(160, 84%, 39%, 0.3)' }}
            >
              <Download size={14} /> {exporting ? 'Generating...' : 'Export PDF'}
            </button>
          )}
          {isAdmin && <AdminPanel />}
          <button
            onClick={signOut}
            title={user?.email || 'Sign out'}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-destructive/10 text-destructive text-sm font-medium hover:bg-destructive/20 transition-all"
          >
            <LogOut size={14} /> Logout
          </button>
          {files.length === 0 && (
            <button
              onClick={loadSampleData}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary text-secondary-foreground text-sm font-medium hover:bg-surface-hover transition-all"
            >
              <FileText size={14} /> Load Sample
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            multiple
            onChange={handleFileUpload}
            className="hidden"
          />
        </div>
      </div>

      {/* Active Data Sources */}
      {files.length > 0 && (
        <div className="px-4 pb-2">
          <button
            onClick={() => setSourcesExpanded(!sourcesExpanded)}
            className="flex items-center gap-1.5 text-[0.6rem] uppercase tracking-widest text-muted-foreground font-semibold mb-1.5 hover:text-foreground transition-colors"
          >
            Active Data Sources ({files.length})
            {sourcesExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
          <button
            onClick={clearAllFiles}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[0.6rem] uppercase tracking-wider font-semibold text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors ml-2"
            title="Clear all files from view (does not delete from saved data)"
          >
            <XCircle size={11} /> Clear All
          </button>
          {sourcesExpanded && <div className="flex flex-wrap items-start gap-2 max-h-[30vh] overflow-y-auto">
            {files.map(f => (
              <div
                key={f.name}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs transition-all ${
                  f.visible
                    ? 'bg-card border-border'
                    : 'bg-background/60 border-transparent opacity-50'
                }`}
              >
                <span className="font-bold text-foreground max-w-[100px] truncate">{f.name}</span>

                {/* Visibility toggle */}
                <button onClick={() => toggleFileVisibility(f.name)} className="p-0.5 rounded hover:bg-secondary transition-colors">
                  {f.visible ? <Eye size={12} className="text-primary" /> : <EyeOff size={12} className="text-muted-foreground" />}
                </button>

                {/* Delete */}
                <button onClick={() => removeFile(f.name)} className="p-0.5 rounded hover:bg-destructive/10 text-destructive/70 hover:text-destructive transition-colors">
                  <Trash2 size={12} />
                </button>

                {/* Separator */}
                <div className="w-px h-4 bg-border/50" />

                {/* Capital - with label */}
                <span className="text-[0.6rem] text-muted-foreground font-semibold uppercase">Capital</span>
                <input
                  type="number"
                  placeholder="0"
                  value={f.capital || ''}
                  onChange={(e) => setFileCapital(f.name, Number(e.target.value) || 0)}
                  className="w-24 bg-background border border-border rounded px-1.5 py-0.5 text-xs mono text-foreground outline-none focus:border-primary"
                />

                {/* Separator */}
                <div className="w-px h-4 bg-border/50" />

                {/* Slippage % - with label */}
                <span className="text-[0.6rem] text-muted-foreground font-semibold uppercase">Slip%</span>
                <input
                  type="number"
                  placeholder="0"
                  step="0.1"
                  value={f.slippage || ''}
                  onChange={(e) => setFileSlippage(f.name, Number(e.target.value) || 0)}
                  className="w-16 bg-background border border-border rounded px-1.5 py-0.5 text-xs mono text-foreground outline-none focus:border-primary"
                  style={{ color: f.slippage ? 'hsl(0, 72%, 51%)' : undefined }}
                />

                {/* Separator */}
                <div className="w-px h-4 bg-border/50" />

                {/* Multiplier - with label, using string state to allow free typing */}
                <span className="text-[0.6rem] text-muted-foreground font-semibold uppercase">Mult</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={getMultiplierDisplay(f.name, f.multiplier)}
                  onChange={(e) => handleMultiplierChange(f.name, e.target.value)}
                  onBlur={() => handleMultiplierBlur(f.name, f.multiplier)}
                  className="w-16 bg-background border border-border rounded px-1.5 py-0.5 text-xs mono text-foreground outline-none focus:border-primary text-center"
                />

                {/* Separator */}
                <div className="w-px h-4 bg-border/50" />

                {/* Time Frame */}
                <span className="text-[0.6rem] text-muted-foreground font-semibold uppercase">Time</span>
                <select
                  value={f.timeFrame || '15m'}
                  onChange={(e) => setFileTimeFrame(f.name, e.target.value)}
                  className="w-16 bg-background border border-border rounded px-1 py-0.5 text-xs mono text-foreground outline-none focus:border-primary"
                >
                  <option value="5m">5m</option>
                  <option value="15m">15m</option>
                  <option value="30m">30m</option>
                  <option value="1h">1h</option>
                  <option value="4h">4h</option>
                  <option value="1d">1d</option>
                </select>
              </div>
            ))}

            {/* Add more button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center justify-center w-7 h-7 rounded-lg border border-dashed border-border text-muted-foreground hover:text-primary hover:border-primary transition-colors"
            >
              <span className="text-lg leading-none">+</span>
            </button>
          </div>}
        </div>
      )}

      {/* Date Filter */}
      {files.length > 0 && (
        <div className="px-4 pb-2">
          <div className="flex items-center gap-4 bg-card/50 border border-border rounded-lg px-4 py-2">
            <span className="text-[0.7rem] font-bold uppercase tracking-wider text-muted-foreground">Date Filter</span>
            
            {/* Start Date */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Start:</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      "w-[130px] justify-start text-left font-normal h-8 text-xs",
                      !dateFilter.startDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-3 w-3" />
                    {dateFilter.startDate ? format(dateFilter.startDate, "dd-MM-yyyy") : "dd-mm-yyyy"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={dateFilter.startDate || undefined}
                    onSelect={(date) => setDateFilter({ ...dateFilter, startDate: date || null })}
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* End Date */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">End:</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      "w-[130px] justify-start text-left font-normal h-8 text-xs",
                      !dateFilter.endDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-3 w-3" />
                    {dateFilter.endDate ? format(dateFilter.endDate, "dd-MM-yyyy") : "dd-mm-yyyy"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={dateFilter.endDate || undefined}
                    onSelect={(date) => setDateFilter({ ...dateFilter, endDate: date || null })}
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Clear Button */}
            {hasDateFilter && (
              <Button
                variant="secondary"
                size="sm"
                onClick={clearDateFilter}
                className="h-8 px-4 text-xs font-semibold"
              >
                Clear
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Tab navigation */}
      <nav className="px-4 pb-2 flex gap-2 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`tab-pill items-center gap-1.5 whitespace-nowrap flex flex-col ${
              activeTab === tab.id ? 'tab-pill-active' : 'tab-pill-inactive'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </nav>
    </header>
  );
}
