import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ManualTrade, PortfolioEntry, FileData } from '@/lib/types';
import { parseCSV } from '@/lib/csv-parser';

// File DD Mappings
export function useFileDDMappings() {
  const [mappings, setMappings] = useState<Record<string, { closedDD: number; intraDD: number }>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadMappings();
  }, []);

  const loadMappings = async () => {
    const { data, error } = await supabase
      .from('file_dd_mappings')
      .select('*');
    
    if (!error && data) {
      const map: Record<string, { closedDD: number; intraDD: number }> = {};
      data.forEach(row => {
        map[row.file_name] = { closedDD: Number(row.closed_dd) || 0, intraDD: Number(row.intra_dd) || 0 };
      });
      setMappings(map);
    }
    setLoading(false);
  };

  const saveMapping = async (fileName: string, closedDD: number, intraDD: number) => {
    const existing = await supabase
      .from('file_dd_mappings')
      .select('id')
      .eq('file_name', fileName)
      .single();

    if (existing.data) {
      await supabase
        .from('file_dd_mappings')
        .update({ closed_dd: closedDD, intra_dd: intraDD, updated_at: new Date().toISOString() })
        .eq('file_name', fileName);
    } else {
      await supabase
        .from('file_dd_mappings')
        .insert({ file_name: fileName, closed_dd: closedDD, intra_dd: intraDD });
    }
    
    setMappings(prev => ({ ...prev, [fileName]: { closedDD, intraDD } }));
  };

  const deleteMapping = async (fileName: string) => {
    await supabase.from('file_dd_mappings').delete().eq('file_name', fileName);
    setMappings(prev => {
      const updated = { ...prev };
      delete updated[fileName];
      return updated;
    });
  };

  return { mappings, loading, saveMapping, deleteMapping, reload: loadMappings };
}

// Manual Trades
export function useManualTradesDB() {
  const [trades, setTrades] = useState<ManualTrade[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTrades();
  }, []);

  const loadTrades = async () => {
    const { data, error } = await supabase
      .from('manual_trades')
      .select('*')
      .order('date', { ascending: false });
    
    if (!error && data) {
      setTrades(data.map(row => ({
        id: row.id,
        date: row.date,
        owner: row.owner || '',
        type: row.type || '',
        subCategory: row.sub_category || '',
        exitDate: row.exit_date || '',
        pl: Number(row.pl) || 0,
        remark: row.remark || '',
        lastEdited: row.last_edited || undefined,
        lastEditedMsg: row.last_edited_msg || undefined,
      })));
    }
    setLoading(false);
  };

  const addTrade = async (trade: Omit<ManualTrade, 'id'>) => {
    const { data, error } = await supabase
      .from('manual_trades')
      .insert({
        date: trade.date,
        owner: trade.owner,
        type: trade.type,
        sub_category: trade.subCategory,
        exit_date: trade.exitDate,
        pl: trade.pl,
        remark: trade.remark,
        last_edited: trade.lastEdited,
        last_edited_msg: trade.lastEditedMsg,
      })
      .select()
      .single();
    
    if (!error && data) {
      const newTrade: ManualTrade = {
        id: data.id,
        date: data.date,
        owner: data.owner || '',
        type: data.type || '',
        subCategory: data.sub_category || '',
        exitDate: data.exit_date || '',
        pl: Number(data.pl) || 0,
        remark: data.remark || '',
        lastEdited: data.last_edited || undefined,
        lastEditedMsg: data.last_edited_msg || undefined,
      };
      setTrades(prev => [newTrade, ...prev]);
    }
  };

  const updateTrade = async (id: string, updates: Partial<ManualTrade>) => {
    const now = new Date();
    const timeStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' }) + ' ' +
      now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    
    await supabase
      .from('manual_trades')
      .update({
        date: updates.date,
        owner: updates.owner,
        type: updates.type,
        sub_category: updates.subCategory,
        exit_date: updates.exitDate,
        pl: updates.pl,
        remark: updates.remark,
        last_edited: now.toISOString(),
        last_edited_msg: `Edited: ${timeStr}`,
      })
      .eq('id', id);
    
    setTrades(prev => prev.map(t => t.id === id ? { ...t, ...updates, lastEdited: now.toISOString(), lastEditedMsg: `Edited: ${timeStr}` } : t));
  };

  const removeTrade = async (id: string) => {
    await supabase.from('manual_trades').delete().eq('id', id);
    setTrades(prev => prev.filter(t => t.id !== id));
  };

  const importTrades = async (rawTrades: ManualTrade[]) => {
    // Clear existing and insert all
    await supabase.from('manual_trades').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    
    const inserts = rawTrades.map(t => ({
      date: t.date,
      owner: t.owner,
      type: t.type,
      sub_category: t.subCategory,
      exit_date: t.exitDate,
      pl: t.pl,
      remark: t.remark,
      last_edited: t.lastEdited,
      last_edited_msg: t.lastEditedMsg,
    }));
    
    if (inserts.length > 0) {
      await supabase.from('manual_trades').insert(inserts);
    }
    await loadTrades();
  };

  return { trades, loading, addTrade, updateTrade, removeTrade, importTrades, reload: loadTrades };
}

// Portfolio Entries (for Portfolio tab)
export function usePortfolioEntriesDB() {
  const [entries, setEntries] = useState<PortfolioEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadEntries();
  }, []);

  const loadEntries = async () => {
    const { data, error } = await supabase
      .from('portfolio_entries')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (!error && data) {
      setEntries(data.map(row => ({
        id: row.id,
        name: row.name,
        startDate: row.start_date,
        endDate: row.end_date,
        fund: Number(row.fund) || 0,
        charges: Number(row.charges) || 0,
        profit: Number(row.profit) || 0,
        sharing: Number(row.sharing) || 0,
        remark: row.remark || '',
      })));
    }
    setLoading(false);
  };

  const addEntry = async (entry: Omit<PortfolioEntry, 'id'>) => {
    const { data, error } = await supabase
      .from('portfolio_entries')
      .insert({
        name: entry.name,
        start_date: entry.startDate,
        end_date: entry.endDate,
        fund: entry.fund,
        charges: entry.charges,
        profit: entry.profit,
        sharing: entry.sharing,
        remark: entry.remark,
      })
      .select()
      .single();
    
    if (!error && data) {
      setEntries(prev => [{
        id: data.id,
        name: data.name,
        startDate: data.start_date,
        endDate: data.end_date,
        fund: Number(data.fund) || 0,
        charges: Number(data.charges) || 0,
        profit: Number(data.profit) || 0,
        sharing: Number(data.sharing) || 0,
        remark: data.remark || '',
      }, ...prev]);
    }
  };

  const updateEntry = async (id: string, updates: Partial<PortfolioEntry>) => {
    await supabase
      .from('portfolio_entries')
      .update({
        name: updates.name,
        start_date: updates.startDate,
        end_date: updates.endDate,
        fund: updates.fund,
        charges: updates.charges,
        profit: updates.profit,
        sharing: updates.sharing,
        remark: updates.remark,
      })
      .eq('id', id);
    
    setEntries(prev => prev.map(e => e.id === id ? { ...e, ...updates } : e));
  };

  const removeEntry = async (id: string) => {
    await supabase.from('portfolio_entries').delete().eq('id', id);
    setEntries(prev => prev.filter(e => e.id !== id));
  };

  return { entries, loading, addEntry, updateEntry, removeEntry, reload: loadEntries };
}

// Saved Portfolios (Portfolio Library)
interface SavedPortfolio {
  id: string;
  name: string;
  files: any[];
  globalCapital: number;
  createdAt: string;
  updatedAt: string;
}

export function useSavedPortfolios() {
  const [portfolios, setPortfolios] = useState<SavedPortfolio[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPortfolios();
  }, []);

  const loadPortfolios = async () => {
    const { data, error } = await supabase
      .from('portfolios')
      .select('*')
      .order('updated_at', { ascending: false });
    
    if (!error && data) {
      setPortfolios(data.map(row => ({
        id: row.id,
        name: row.name,
        files: row.files as any[],
        globalCapital: Number(row.global_capital) || 0,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })));
    }
    setLoading(false);
  };

  const savePortfolio = async (name: string, files: any[], globalCapital: number) => {
    const existing = portfolios.find(p => p.name === name);
    
    if (existing) {
      await supabase
        .from('portfolios')
        .update({ files, global_capital: globalCapital, updated_at: new Date().toISOString() })
        .eq('id', existing.id);
      
      setPortfolios(prev => prev.map(p => p.id === existing.id ? { ...p, files, globalCapital, updatedAt: new Date().toISOString() } : p));
    } else {
      const { data, error } = await supabase
        .from('portfolios')
        .insert({ name, files, global_capital: globalCapital })
        .select()
        .single();
      
      if (!error && data) {
        setPortfolios(prev => [{
          id: data.id,
          name: data.name,
          files: data.files as any[],
          globalCapital: Number(data.global_capital) || 0,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
        }, ...prev]);
      }
    }
  };

  const updatePortfolioName = async (id: string, name: string) => {
    await supabase
      .from('portfolios')
      .update({ name, updated_at: new Date().toISOString() })
      .eq('id', id);
    
    setPortfolios(prev => prev.map(p => p.id === id ? { ...p, name, updatedAt: new Date().toISOString() } : p));
  };

  const deletePortfolio = async (id: string) => {
    await supabase.from('portfolios').delete().eq('id', id);
    setPortfolios(prev => prev.filter(p => p.id !== id));
  };

  return { portfolios, loading, savePortfolio, updatePortfolioName, deletePortfolio, reload: loadPortfolios };
}

// Uploaded Files (CSV persistence)
export interface UploadedFileRecord {
  fileName: string;
  csvText: string;
  capital: number;
  multiplier: number;
  slippage: number;
  timeFrame: string;
  visible: boolean;
}

export function useUploadedFiles() {
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);

  const loadFiles = useCallback(async (): Promise<UploadedFileRecord[]> => {
    const { data, error } = await supabase
      .from('uploaded_files')
      .select('*')
      .order('created_at', { ascending: true });

    setLoading(false);
    setLoaded(true);

    if (!error && data) {
      return data.map(row => ({
        fileName: row.file_name,
        csvText: row.csv_text,
        capital: Number(row.capital) || 0,
        multiplier: Number(row.multiplier) || 1,
        slippage: Number(row.slippage) || 0,
        timeFrame: row.time_frame || '15m',
        visible: row.visible !== false,
      }));
    }
    return [];
  }, []);

  const saveFile = useCallback(async (file: UploadedFileRecord) => {
    await supabase
      .from('uploaded_files')
      .upsert({
        file_name: file.fileName,
        csv_text: file.csvText,
        capital: file.capital,
        multiplier: file.multiplier,
        slippage: file.slippage,
        time_frame: file.timeFrame,
        visible: file.visible,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,file_name' });
  }, []);

  const updateFileSettings = useCallback(async (fileName: string, updates: Partial<UploadedFileRecord>) => {
    const updateObj: any = { updated_at: new Date().toISOString() };
    if (updates.capital !== undefined) updateObj.capital = updates.capital;
    if (updates.multiplier !== undefined) updateObj.multiplier = updates.multiplier;
    if (updates.slippage !== undefined) updateObj.slippage = updates.slippage;
    if (updates.timeFrame !== undefined) updateObj.time_frame = updates.timeFrame;
    if (updates.visible !== undefined) updateObj.visible = updates.visible;

    await supabase
      .from('uploaded_files')
      .update(updateObj)
      .eq('file_name', fileName);
  }, []);

  const deleteFile = useCallback(async (fileName: string) => {
    await supabase.from('uploaded_files').delete().eq('file_name', fileName);
  }, []);

  return { loading, loaded, loadFiles, saveFile, updateFileSettings, deleteFile };
}
