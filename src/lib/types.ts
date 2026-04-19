export interface RawTrade {
  tradeNum: number;
  type: string;
  dateTime: Date;
  signal: string;
  price: number;
  qty: number;
  posValue: number;
  netPnl: number;
  netPnlPct: number;
  runUp: number;
  runUpPct: number;
  drawdown: number;
  drawdownPct: number;
  cumPnl: number;
  cumPnlPct: number;
  fileName?: string;
}

export interface Trade {
  tradeNum: number;
  entryDate: Date;
  exitDate: Date;
  entryPrice: number;
  exitPrice: number;
  signal: string;
  qty: number;
  posValue: number;
  netPnl: number;
  netPnlPct: number;
  runUp: number;
  runUpPct: number;
  drawdown: number;
  drawdownPct: number;
  cumPnl: number;
  cumPnlPct: number;
  isWin: boolean;
  direction: 'long' | 'short';
  fileName?: string;
}

export interface FileData {
  name: string;
  trades: Trade[];
  visible: boolean;
  multiplier: number;
  capital: number;
  slippage: number;
  timeFrame: string;
  csvText?: string;
}

export interface DrawdownDetail {
  type: string;
  amount: number;
  peakDate: Date | null;
  troughDate: Date | null;
  recoveryDate: Date | null;
  recoveryDays: number;
  recoveryTrades: number;
  totalTradesInDD: number;
  peakValue: number;
  troughValue: number;
}

export interface DashboardMetrics {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  grossProfit: number;
  grossLoss: number;
  netProfit: number;
  profitFactor: number;
  maxDrawdown: number;
  maxDrawdownPct: number;
  payoffRatio: number;
  avgWin: number;
  avgLoss: number;
  expectancy: number;
  monthlyConsistency: number;
  yearlyConsistency: number;
  statisticalRobustness: number;
  standOverDD: {
    days: number;
    startDate: Date | null;
    endDate: Date | null;
    peakValue: number;
    lowestValue: number;
    currentValue: number;
  };
  maxConsecWins: number;
  maxConsecLosses: number;
  // New metrics
  totalReturnPct: number;
  cagr: number;
  sharpeRatio: number;
  sortinoRatio: number;
  calmarRatio: number;
  riskRewardRatio: number;
  avgWinAmount: number;
  avgLossAmount: number;
  closedTradeDD: DrawdownDetail;
  intraDayDD: DrawdownDetail;
  maxDDDetail: DrawdownDetail;
  top5Wins: Trade[];
  top5Losses: Trade[];
}

export interface MonthlyData {
  month: string;
  pnl: number;
  trades: number;
  wins: number;
}

export interface EquityPoint {
  date: string;
  equity: number;
}

export interface YearOverview {
  year: number;
  totalPnl: number;
  grossProfit: number;
  grossLoss: number;
  maxDrawdown: number;
  totalTrades: number;
  totalWins: number;
  totalLosses: number;
  winRate: number;
  profitableMonths: number;
  lossMonths: number;
  months: { month: number; pnl: number; trades: number; wins: number; losses: number }[];
}

export interface StreakDetail {
  length: number;
  startDate: Date;
  endDate: Date;
  trades: Trade[];
  totalPnl: number;
}

export interface EfficiencyByYear {
  year: number;
  strategies: { name: string; netProfit: number; maxDD: number; intraDD: number; efficiency: number; trades: number }[];
}

export type TabId = 'dashboard' | 'charts' | 'time' | 'streaks' | 'trades' | 'correlation' | 'efficiency' | 'yearOverview' | 'capitalUtil' | 'pnlEntry' | 'pnlDashboard' | 'monthlyPnl' | 'portfolio' | 'vix' | 'aiAnalysis';

export interface VixDataPoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface ManualTrade {
  id: string;
  date: string;       // entry date YYYY-MM-DD
  owner: string;
  type: string;        // Intraday, Delivery, F&O, etc.
  subCategory: string; // Sub category
  exitDate: string;    // YYYY-MM-DD
  pl: number;
  remark: string;
  lastEdited?: string;
  lastEditedMsg?: string;
}

export interface PortfolioEntry {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  fund: number;
  charges: number;
  profit: number;
  sharing: number;
  remark: string;
}

export interface DateFilter {
  startDate: Date | null;
  endDate: Date | null;
}
