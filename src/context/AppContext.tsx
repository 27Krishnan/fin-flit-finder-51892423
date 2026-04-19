import React, { createContext, useContext, useState, useCallback, useMemo, useEffect, ReactNode } from 'react';
import { FileData, Trade, TabId, DateFilter, VixDataPoint } from '@/lib/types';
import { parseCSV } from '@/lib/csv-parser';
import { sampleCSV } from '@/lib/sample-data';
import { useUploadedFiles } from '@/hooks/useDatabase';
import { useAuth } from '@/context/AuthContext';

interface AppState {
  files: FileData[];
  activeTab: TabId;
  allTrades: Trade[];
  globalCapital: number;
  dateFilter: DateFilter;
  vixData: VixDataPoint[];
  rawVixRows: VixDataPoint[];
}

interface AppContextType extends AppState {
  setActiveTab: (tab: TabId) => void;
  addFile: (name: string, csvText: string) => void;
  removeFile: (name: string) => void;
  toggleFileVisibility: (name: string) => void;
  setMultiplier: (name: string, multiplier: number) => void;
  setFileCapital: (name: string, capital: number) => void;
  setFileSlippage: (name: string, slippage: number) => void;
  setFileTimeFrame: (name: string, timeFrame: string) => void;
  setGlobalCapital: (capital: number) => void;
  setDateFilter: (filter: DateFilter) => void;
  clearDateFilter: () => void;
  clearAllFiles: () => void;
  loadSampleData: () => void;
  setVixData: (data: VixDataPoint[]) => void;
  setRawVixRows: (data: VixDataPoint[]) => void;
  filesLoading: boolean;
}

const AppContext = createContext<AppContextType | null>(null);

export function useAppContext() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used within AppProvider');
  return ctx;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [files, setFiles] = useState<FileData[]>([]);
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [dateFilter, setDateFilter] = useState<DateFilter>({ startDate: null, endDate: null });
  const [vixData, setVixData] = useState<VixDataPoint[]>([]);
  const [rawVixRows, setRawVixRows] = useState<VixDataPoint[]>([]);
  const { session } = useAuth();
  const { loadFiles, saveFile, updateFileSettings, deleteFile, loading: filesLoading } = useUploadedFiles();

  // Save active file names to localStorage whenever files change
  useEffect(() => {
    if (session) {
      const activeNames = files.map(f => f.name);
      localStorage.setItem('active_file_names', JSON.stringify(activeNames));
    }
  }, [files, session]);

  // Load only last-active files from DB on login
  useEffect(() => {
    if (!session) {
      setFiles([]);
      return;
    }
    const savedActiveNames: string[] = JSON.parse(localStorage.getItem('active_file_names') || '[]');
    if (savedActiveNames.length === 0) return; // Start fresh if nothing was active

    loadFiles().then(records => {
      if (records.length > 0) {
        const loaded: FileData[] = records
          .filter(r => savedActiveNames.includes(r.fileName))
          .map(r => {
            const trades = parseCSV(r.csvText, r.fileName);
            return {
              name: r.fileName,
              trades,
              visible: r.visible,
              multiplier: r.multiplier,
              capital: r.capital,
              slippage: r.slippage,
              timeFrame: r.timeFrame,
              csvText: r.csvText,
            };
          }).filter(f => f.trades.length > 0);
        setFiles(loaded);
      }
    });
  }, [session]);

  const globalCapital = useMemo(() => {
    return files.filter(f => f.visible).reduce((s, f) => s + (f.capital || 0), 0);
  }, [files]);

  const setGlobalCapital = useCallback((_capital: number) => {}, []);

  const clearDateFilter = useCallback(() => {
    setDateFilter({ startDate: null, endDate: null });
  }, []);

  const allTrades = useMemo(() => {
    let trades = files
      .filter(f => f.visible)
      .flatMap(f => f.trades.map(t => ({
        ...t,
        netPnl: (t.netPnl * f.multiplier) - (t.posValue * f.multiplier * f.slippage / 100),
        drawdown: t.drawdown * f.multiplier,
      })))
      .sort((a, b) => a.exitDate.getTime() - b.exitDate.getTime());

    if (dateFilter.startDate) {
      const startTime = dateFilter.startDate.getTime();
      trades = trades.filter(t => t.exitDate.getTime() >= startTime);
    }
    if (dateFilter.endDate) {
      const endTime = dateFilter.endDate.getTime() + 86400000 - 1;
      trades = trades.filter(t => t.exitDate.getTime() <= endTime);
    }

    return trades;
  }, [files, dateFilter]);

  const addFile = useCallback((name: string, csvText: string) => {
    const trades = parseCSV(csvText, name);
    if (!trades.length) return;
    const estimatedCapital = Math.max(...trades.map(t => t.posValue), 0);
    setFiles(prev => {
      const existing = prev.find(f => f.name === name);
      if (existing) {
        // Update DB
        saveFile({ fileName: name, csvText, capital: existing.capital, multiplier: existing.multiplier, slippage: existing.slippage, timeFrame: existing.timeFrame, visible: existing.visible });
        return prev.map(f => f.name === name ? { ...f, trades, csvText } : f);
      }
      const cap = Math.round(estimatedCapital);
      // Save to DB
      saveFile({ fileName: name, csvText, capital: cap, multiplier: 1, slippage: 0, timeFrame: '15m', visible: true });
      return [...prev, { name, trades, visible: true, multiplier: 1, capital: cap, slippage: 0, timeFrame: '15m', csvText }];
    });
  }, [saveFile]);

  const removeFile = useCallback((name: string) => {
    setFiles(prev => prev.filter(f => f.name !== name));
    deleteFile(name);
  }, [deleteFile]);

  const toggleFileVisibility = useCallback((name: string) => {
    setFiles(prev => {
      const file = prev.find(f => f.name === name);
      if (file) updateFileSettings(name, { visible: !file.visible });
      return prev.map(f => f.name === name ? { ...f, visible: !f.visible } : f);
    });
  }, [updateFileSettings]);

  const setMultiplier = useCallback((name: string, multiplier: number) => {
    setFiles(prev => prev.map(f => f.name === name ? { ...f, multiplier } : f));
    updateFileSettings(name, { multiplier });
  }, [updateFileSettings]);

  const setFileCapital = useCallback((name: string, capital: number) => {
    setFiles(prev => prev.map(f => f.name === name ? { ...f, capital } : f));
    updateFileSettings(name, { capital });
  }, [updateFileSettings]);

  const setFileSlippage = useCallback((name: string, slippage: number) => {
    setFiles(prev => prev.map(f => f.name === name ? { ...f, slippage } : f));
    updateFileSettings(name, { slippage });
  }, [updateFileSettings]);

  const setFileTimeFrame = useCallback((name: string, timeFrame: string) => {
    setFiles(prev => prev.map(f => f.name === name ? { ...f, timeFrame } : f));
    updateFileSettings(name, { timeFrame });
  }, [updateFileSettings]);

  const clearAllFiles = useCallback(() => {
    setFiles([]);
    localStorage.setItem('active_file_names', '[]');
  }, []);

  const loadSampleData = useCallback(() => {
    addFile('NIFTY-Sample.csv', sampleCSV);
  }, [addFile]);

  const contextValue = useMemo(() => ({
    files, activeTab, allTrades, globalCapital, dateFilter, vixData, rawVixRows, filesLoading,
    setActiveTab, addFile, removeFile, toggleFileVisibility, setMultiplier,
    setFileCapital, setFileSlippage, setFileTimeFrame, setGlobalCapital,
    setDateFilter, clearDateFilter, clearAllFiles, loadSampleData, setVixData, setRawVixRows,
  }), [files, activeTab, allTrades, globalCapital, dateFilter, vixData, rawVixRows, filesLoading,
    setActiveTab, addFile, removeFile, toggleFileVisibility, setMultiplier,
    setFileCapital, setFileSlippage, setFileTimeFrame, setGlobalCapital,
    setDateFilter, clearDateFilter, clearAllFiles, loadSampleData, setVixData, setRawVixRows]);

  return (
    <AppContext.Provider value={contextValue}>
      {children}
    </AppContext.Provider>
  );
}
