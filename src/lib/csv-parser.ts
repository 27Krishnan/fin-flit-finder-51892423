import { RawTrade, Trade } from './types';

export function parseCSV(csvText: string, fileName: string): Trade[] {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];

  const headerLine = lines[0].toLowerCase();

  // Auto-detect format by header
  if (headerLine.includes('transaction') && headerLine.includes('instrument') && headerLine.includes('entry price') && headerLine.includes('exit price')) {
    return parseMultiLegCSV(lines, fileName);
  }

  // Default: TradingView format
  return parseTradingViewCSV(lines, fileName);
}

/**
 * Parse multi-leg options CSV format:
 * Transaction, Instrument, Qty, Entry, Entry Price, Entry Time, Exit, Exit Price, Exit Time, Profit, Min Profit, Max Profit
 */
function parseMultiLegCSV(lines: string[], fileName: string): Trade[] {
  const rows = lines.slice(1).filter(l => l.trim());

  // Group rows by Transaction number
  const txnMap = new Map<number, Array<{
    instrument: string;
    qty: number;
    entry: string; // BUY/SELL
    entryPrice: number;
    entryTime: Date;
    exit: string;
    exitPrice: number;
    exitTime: Date;
    profit: number;
    minProfit: number;
    maxProfit: number;
  }>>();

  rows.forEach(line => {
    const cols = parseCSVLine(line);
    const txn = parseInt(cols[0]) || 0;
    if (!txn) return;

    if (!txnMap.has(txn)) txnMap.set(txn, []);
    txnMap.get(txn)!.push({
      instrument: cols[1]?.trim() || '',
      qty: parseInt(cols[2]) || 0,
      entry: cols[3]?.trim() || '',
      entryPrice: parseFloat(cols[4]) || 0,
      entryTime: parseTradeDate(cols[5]?.trim() || ''),
      exit: cols[6]?.trim() || '',
      exitPrice: parseFloat(cols[7]) || 0,
      exitTime: parseTradeDate(cols[8]?.trim() || ''),
      profit: parseFloat(cols[9]) || 0,
      minProfit: parseFloat(cols[10]) || 0,
      maxProfit: parseFloat(cols[11]) || 0,
    });
  });

  const trades: Trade[] = [];
  let cumPnl = 0;

  const sortedTxns = Array.from(txnMap.entries()).sort(([a], [b]) => a - b);

  sortedTxns.forEach(([txn, legs]) => {
    const totalProfit = legs.reduce((s, l) => s + l.profit, 0);
    const totalMaxProfit = legs.reduce((s, l) => s + l.maxProfit, 0);
    // Min profit across legs — sum of individual min profits gives worst-case heat
    const totalMinProfit = legs.reduce((s, l) => s + l.minProfit, 0);

    const entryDate = new Date(Math.min(...legs.map(l => l.entryTime.getTime())));
    const exitDate = new Date(Math.max(...legs.map(l => l.exitTime.getTime())));
    const avgEntryPrice = legs.reduce((s, l) => s + l.entryPrice, 0) / legs.length;
    const avgExitPrice = legs.reduce((s, l) => s + l.exitPrice, 0) / legs.length;
    const totalQty = legs.reduce((s, l) => s + l.qty, 0);

    // Direction: if first leg entry is SELL, it's a short strategy (options selling)
    const direction = legs[0].entry.toUpperCase() === 'SELL' ? 'short' : 'long';

    // posValue: total premium collected (entry price * qty for all legs)
    const posValue = legs.reduce((s, l) => s + (l.entryPrice * l.qty), 0);

    cumPnl += totalProfit;

    // drawdown: sum of absolute losses from losing legs (adverse excursion proxy)
    // Even winning trades may have legs that lost money
    const losingLegSum = legs.reduce((s, l) => s + (l.profit < 0 ? Math.abs(l.profit) : 0), 0);
    const drawdown = Math.max(losingLegSum, totalProfit < 0 ? Math.abs(totalProfit) : 0);

    // runUp: best profit achieved — use max of total profit and sum of winning legs
    const winningLegSum = legs.reduce((s, l) => s + (l.profit > 0 ? l.profit : 0), 0);
    const runUp = Math.max(winningLegSum, totalProfit > 0 ? totalProfit : 0);

    trades.push({
      tradeNum: txn,
      entryDate,
      exitDate,
      entryPrice: avgEntryPrice,
      exitPrice: avgExitPrice,
      signal: legs.map(l => l.instrument).join(' + '),
      qty: totalQty,
      posValue,
      netPnl: totalProfit,
      netPnlPct: posValue > 0 ? (totalProfit / posValue) * 100 : 0,
      runUp,
      runUpPct: posValue > 0 ? (runUp / posValue) * 100 : 0,
      drawdown,
      drawdownPct: posValue > 0 ? (drawdown / posValue) * 100 : 0,
      cumPnl,
      cumPnlPct: 0,
      isWin: totalProfit > 0,
      direction,
      fileName,
    });
  });

  return trades.sort((a, b) => a.exitDate.getTime() - b.exitDate.getTime());
}

/**
 * Original TradingView CSV parser
 */
function parseTradingViewCSV(lines: string[], fileName: string): Trade[] {
  const rows = lines.slice(1).filter(l => l.trim());

  const rawTrades: RawTrade[] = rows.map(line => {
    const cols = parseCSVLine(line);
    return {
      tradeNum: parseInt(cols[0]) || 0,
      type: cols[1]?.trim() || '',
      dateTime: parseTradeDate(cols[2]?.trim() || ''),
      signal: cols[3]?.trim() || '',
      price: parseFloat(cols[4]) || 0,
      qty: parseInt(cols[5]) || 0,
      posValue: parseFloat(cols[6]) || 0,
      netPnl: parseFloat(cols[7]) || 0,
      netPnlPct: parseFloat(cols[8]) || 0,
      runUp: parseFloat(cols[9]) || 0,
      runUpPct: parseFloat(cols[10]) || 0,
      drawdown: parseFloat(cols[11]) || 0,
      drawdownPct: parseFloat(cols[12]) || 0,
      cumPnl: parseFloat(cols[13]) || 0,
      cumPnlPct: parseFloat(cols[14]) || 0,
      fileName,
    };
  });

  const tradeMap = new Map<number, RawTrade[]>();
  rawTrades.forEach(rt => {
    if (!tradeMap.has(rt.tradeNum)) tradeMap.set(rt.tradeNum, []);
    tradeMap.get(rt.tradeNum)!.push(rt);
  });

  const trades: Trade[] = [];
  tradeMap.forEach((pair, tradeNum) => {
    if (pair.length < 1) return;
    const entry = pair.find(p => p.type.toLowerCase().includes('entry'));
    const exit = pair.find(p => p.type.toLowerCase().includes('exit'));
    const ref = exit || entry || pair[0];
    const direction = ref.type.toLowerCase().includes('long') ? 'long' : 'short';

    trades.push({
      tradeNum,
      entryDate: entry?.dateTime || ref.dateTime,
      exitDate: exit?.dateTime || ref.dateTime,
      entryPrice: entry?.price || ref.price,
      exitPrice: exit?.price || ref.price,
      signal: ref.signal,
      qty: ref.qty,
      posValue: ref.posValue,
      netPnl: ref.netPnl,
      netPnlPct: ref.netPnlPct,
      runUp: ref.runUp,
      runUpPct: ref.runUpPct,
      drawdown: ref.drawdown,
      drawdownPct: ref.drawdownPct,
      cumPnl: ref.cumPnl,
      cumPnlPct: ref.cumPnlPct,
      isWin: ref.netPnl > 0,
      direction,
      fileName,
    });
  });

  return trades.sort((a, b) => a.exitDate.getTime() - b.exitDate.getTime());
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') { inQuotes = !inQuotes; continue; }
    if (char === ',' && !inQuotes) { result.push(current); current = ''; continue; }
    current += char;
  }
  result.push(current);
  return result;
}

function parseTradeDate(s: string): Date {
  // Handle DD/MM/YYYY format
  const ddmmyyyy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\s*(.*)$/);
  if (ddmmyyyy) {
    const [, d, m, y, time] = ddmmyyyy;
    const dateStr = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}${time ? 'T' + time.trim() : ''}`;
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) return parsed;
  }

  // Handle "24 Feb 2025 09:16:00" format
  const namedMonth = s.match(/^(\d{1,2})\s+(\w{3})\s+(\d{4})\s+(.*)$/);
  if (namedMonth) {
    const [, day, mon, year, time] = namedMonth;
    const monthMap: Record<string, string> = {
      jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
      jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
    };
    const m = monthMap[mon.toLowerCase()];
    if (m) {
      const dateStr = `${year}-${m}-${day.padStart(2, '0')}T${time.trim()}`;
      const parsed = new Date(dateStr);
      if (!isNaN(parsed.getTime())) return parsed;
    }
  }

  const d = new Date(s.replace(' ', 'T'));
  return isNaN(d.getTime()) ? new Date() : d;
}
