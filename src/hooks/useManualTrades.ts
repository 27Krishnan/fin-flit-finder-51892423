import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { ManualTrade, PortfolioEntry } from '@/lib/types';
import { useManualTradesDB, usePortfolioEntriesDB } from './useDatabase';

const OWNERS_KEY = 'owners';
const TYPES_KEY = 'types';
const SUBCATEGORIES_KEY = 'subCategories';
const RECYCLE_KEY = 'pl_report_recycle_bin';
const GAS_URL_KEY = 'gas_url';

const DEFAULT_OWNERS = ['Owner 1', 'Owner 2'];
const DEFAULT_TYPES = ['Intraday', 'Delivery', 'F&O', 'Currency', 'Commodity'];

function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}

function saveJSON(key: string, data: any) {
  localStorage.setItem(key, JSON.stringify(data));
}

export function useManualTrades() {
  // Use database hooks for trades and portfolio entries
  const {
    trades: dbTrades,
    loading: tradesLoading,
    addTrade: dbAddTrade,
    updateTrade: dbUpdateTrade,
    removeTrade: dbRemoveTrade,
    importTrades: dbImportTrades,
  } = useManualTradesDB();

  const {
    entries: dbPortfolioEntries,
    loading: entriesLoading,
    addEntry: dbAddEntry,
    updateEntry: dbUpdateEntry,
    removeEntry: dbRemoveEntry,
  } = usePortfolioEntriesDB();

  // Local state for settings (still in localStorage for now)
  const [owners, setOwners] = useState<string[]>(() => loadJSON(OWNERS_KEY, DEFAULT_OWNERS));
  const [types, setTypes] = useState<string[]>(() => loadJSON(TYPES_KEY, DEFAULT_TYPES));
  const [subCategories, setSubCategories] = useState<string[]>(() => loadJSON(SUBCATEGORIES_KEY, []));
  const [recycleBin, setRecycleBin] = useState<ManualTrade[]>(() => loadJSON(RECYCLE_KEY, []));
  const [gasUrl, setGasUrl] = useState(() => localStorage.getItem(GAS_URL_KEY) || '');

  // Persist local settings
  useEffect(() => { saveJSON(OWNERS_KEY, owners); }, [owners]);
  useEffect(() => { saveJSON(TYPES_KEY, types); }, [types]);
  useEffect(() => { saveJSON(SUBCATEGORIES_KEY, subCategories); }, [subCategories]);
  useEffect(() => { saveJSON(RECYCLE_KEY, recycleBin); }, [recycleBin]);
  useEffect(() => { localStorage.setItem(GAS_URL_KEY, gasUrl); }, [gasUrl]);

  // Auto-sync to GAS whenever trades change (debounced)
  const autoSyncTimer = useRef<ReturnType<typeof setTimeout>>();
  const initialLoad = useRef(true);
  useEffect(() => {
    // Skip the initial load
    if (initialLoad.current) {
      initialLoad.current = false;
      return;
    }
    if (!gasUrl || dbTrades.length === 0) return;
    clearTimeout(autoSyncTimer.current);
    autoSyncTimer.current = setTimeout(() => {
      const dataPackage = {
        rows: dbTrades.map(t => ({ date: t.date, owner: t.owner, type: t.type, subCategory: t.subCategory, exitDate: t.exitDate, pl: t.pl.toString(), remark: t.remark, lastEdited: t.lastEdited, lastEditedMsg: t.lastEditedMsg })),
        owners,
        types,
        timestamp: new Date().toISOString(),
      };
      const iframe = document.createElement('iframe');
      iframe.name = 'gas-auto-sync';
      iframe.style.display = 'none';
      document.body.appendChild(iframe);
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = gasUrl;
      form.target = 'gas-auto-sync';
      const textarea = document.createElement('textarea');
      textarea.name = 'data';
      textarea.value = JSON.stringify(dataPackage);
      form.appendChild(textarea);
      document.body.appendChild(form);
      form.submit();
      setTimeout(() => { form.remove(); iframe.remove(); }, 3000);
      console.log('[Auto-sync] Pushed to GAS');
    }, 2000); // 2-second debounce
    return () => clearTimeout(autoSyncTimer.current);
  }, [dbTrades, gasUrl, owners, types]);

  const addTrade = useCallback(async (trade: Omit<ManualTrade, 'id'>) => {
    await dbAddTrade(trade);
  }, [dbAddTrade]);

  const updateTrade = useCallback(async (id: string, updates: Partial<ManualTrade>) => {
    await dbUpdateTrade(id, updates);
  }, [dbUpdateTrade]);

  const removeTrade = useCallback(async (id: string) => {
    const trade = dbTrades.find(t => t.id === id);
    if (trade) setRecycleBin(rb => [trade, ...rb]);
    await dbRemoveTrade(id);
  }, [dbTrades, dbRemoveTrade]);

  const restoreFromBin = useCallback(async (id: string) => {
    const item = recycleBin.find(t => t.id === id);
    if (item) {
      await dbAddTrade(item);
      setRecycleBin(prev => prev.filter(t => t.id !== id));
    }
  }, [recycleBin, dbAddTrade]);

  const permanentDelete = useCallback((id: string) => {
    setRecycleBin(prev => prev.filter(t => t.id !== id));
  }, []);

  const emptyRecycleBin = useCallback(() => setRecycleBin([]), []);

  const clearAll = useCallback(async () => {
    await dbImportTrades([]);
  }, [dbImportTrades]);

  const addOwner = useCallback((name: string) => {
    const trimmed = name.trim();
    if (trimmed && !owners.includes(trimmed)) setOwners(prev => [...prev, trimmed]);
  }, [owners]);

  const removeOwner = useCallback((name: string) => {
    setOwners(prev => prev.filter(o => o !== name));
  }, []);

  const addType = useCallback((name: string) => {
    const trimmed = name.trim();
    if (trimmed && !types.includes(trimmed)) setTypes(prev => [...prev, trimmed]);
  }, [types]);

  const removeType = useCallback((name: string) => {
    setTypes(prev => prev.filter(t => t !== name));
  }, []);

  const addSubCategory = useCallback((name: string) => {
    const trimmed = name.trim();
    if (trimmed && !subCategories.includes(trimmed)) setSubCategories(prev => [...prev, trimmed]);
  }, [subCategories]);

  const removeSubCategory = useCallback((name: string) => {
    setSubCategories(prev => prev.filter(s => s !== name));
  }, []);

  // Portfolio entries
  const addPortfolioEntry = useCallback(async (entry: Omit<PortfolioEntry, 'id'>) => {
    await dbAddEntry(entry);
  }, [dbAddEntry]);

  const updatePortfolioEntry = useCallback(async (id: string, updates: Partial<PortfolioEntry>) => {
    await dbUpdateEntry(id, updates);
  }, [dbUpdateEntry]);

  const removePortfolioEntry = useCallback(async (id: string) => {
    await dbRemoveEntry(id);
  }, [dbRemoveEntry]);

  // GAS Sync
  const pullFromGAS = useCallback(async () => {
    if (!gasUrl) throw new Error('No GAS URL configured');
    let url = gasUrl.trim();
    if (!url.endsWith('/exec')) {
      url = url.split('?')[0];
      if (!url.endsWith('/')) url += '/';
      url += 'exec';
    }

    let data: any;

    try {
      const resp = await fetch(`${url}?cachebust=${Date.now()}`, { redirect: 'follow' });
      if (resp.ok) {
        data = await resp.json();
      }
    } catch (e) {
      console.log('Direct fetch failed, trying JSONP...', e);
    }

    if (!data) {
      try {
        data = await new Promise<any>((resolve, reject) => {
          const cbName = '_gasCallback_' + Date.now();
          const timeout = setTimeout(() => { cleanup(); reject(new Error('JSONP timeout')); }, 15000);
          function cleanup() {
            clearTimeout(timeout);
            delete (window as any)[cbName];
            document.querySelector(`script[data-gas-cb="${cbName}"]`)?.remove();
          }
          (window as any)[cbName] = (result: any) => { cleanup(); resolve(result); };
          const script = document.createElement('script');
          script.setAttribute('data-gas-cb', cbName);
          script.src = `${url}?callback=${cbName}&cachebust=${Date.now()}`;
          script.onerror = () => { cleanup(); reject(new Error('JSONP script failed')); };
          document.body.appendChild(script);
        });
      } catch (e) {
        console.log('JSONP failed, trying allorigins proxy...', e);
      }
    }

    if (!data) {
      const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(`${url}?cachebust=${Date.now()}`)}`;
      const resp = await fetch(proxyUrl);
      if (!resp.ok) throw new Error(`All methods failed. HTTP ${resp.status}`);
      data = await resp.json();
    }

    if (!data || (!data.rows && !data.status)) {
      throw new Error('Invalid data received from GAS');
    }

    const rows = data.rows || [];
    if (rows.length > 0) {
      const imported: ManualTrade[] = rows.map((r: any) => ({
        id: crypto.randomUUID(),
        date: r.date || '',
        owner: r.owner || '',
        type: r.type || '',
        subCategory: r.subCategory || '',
        exitDate: r.exitDate || '',
        pl: parseFloat(r.pl) || 0,
        remark: r.remark || '',
        lastEdited: r.lastEdited,
        lastEditedMsg: r.lastEditedMsg,
      }));
      await dbImportTrades(imported);
    }
    if (data.owners?.length) setOwners(data.owners);
    if (data.types?.length) setTypes(data.types);
    return { ...data, status: 'success', importedCount: rows.length };
  }, [gasUrl, dbImportTrades]);

  const pushToGAS = useCallback(async () => {
    if (!gasUrl) throw new Error('No GAS URL configured');
    const dataPackage = {
      rows: dbTrades.map(t => ({ date: t.date, owner: t.owner, type: t.type, subCategory: t.subCategory, exitDate: t.exitDate, pl: t.pl.toString(), remark: t.remark, lastEdited: t.lastEdited, lastEditedMsg: t.lastEditedMsg })),
      owners,
      types,
      timestamp: new Date().toISOString(),
    };
    return new Promise<void>((resolve) => {
      const iframe = document.createElement('iframe');
      iframe.name = 'gas-push-frame';
      iframe.style.display = 'none';
      document.body.appendChild(iframe);
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = gasUrl;
      form.target = 'gas-push-frame';
      const textarea = document.createElement('textarea');
      textarea.name = 'data';
      textarea.value = JSON.stringify(dataPackage);
      form.appendChild(textarea);
      document.body.appendChild(form);
      form.submit();
      setTimeout(() => {
        form.remove();
        iframe.remove();
        resolve();
      }, 2000);
    });
  }, [gasUrl, dbTrades, owners, types]);

  const importTrades = useCallback(async (rawTrades: ManualTrade[]) => {
    await dbImportTrades(rawTrades);
  }, [dbImportTrades]);

  return {
    trades: dbTrades,
    loading: tradesLoading || entriesLoading,
    addTrade, updateTrade, removeTrade, clearAll, importTrades,
    owners, addOwner, removeOwner,
    types, addType, removeType,
    subCategories, addSubCategory, removeSubCategory,
    recycleBin, restoreFromBin, permanentDelete, emptyRecycleBin,
    portfolioEntries: dbPortfolioEntries, addPortfolioEntry, updatePortfolioEntry, removePortfolioEntry,
    gasUrl, setGasUrl, pullFromGAS, pushToGAS,
  };
}
