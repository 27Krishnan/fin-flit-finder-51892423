import React, { useMemo } from 'react';
import { useAppContext } from '@/context/AppContext';
import Header from '@/components/Header';
import DashboardTab from '@/components/DashboardTab';
import ChartsTab from '@/components/ChartsTab';
import TimeTab from '@/components/TimeTab';
import StreaksTab from '@/components/StreaksTab';
import TradeLogTab from '@/components/TradeLogTab';
import CorrelationTab from '@/components/CorrelationTab';
import EfficiencyTab from '@/components/EfficiencyTab';
import YearOverviewTab from '@/components/YearOverviewTab';
import CapitalUtilTab from '@/components/CapitalUtilTab';
import PnlEntryTab from '@/components/PnlEntryTab';
import PnlDashboardTab from '@/components/PnlDashboardTab';
import MonthlyPnlTab from '@/components/MonthlyPnlTab';
import PortfolioTab from '@/components/PortfolioTab';
import VixTab from '@/components/VixTab';
import AIAnalysisTab from '@/components/AIAnalysisTab';

export default function Index() {
  const { activeTab } = useAppContext();

  const tabContent = useMemo(() => {
    switch (activeTab) {
      case 'dashboard': return <DashboardTab />;
      case 'charts': return <ChartsTab />;
      case 'yearOverview': return <YearOverviewTab />;
      case 'time': return <TimeTab />;
      case 'streaks': return <StreaksTab />;
      case 'trades': return <TradeLogTab />;
      case 'correlation': return <CorrelationTab />;
      case 'efficiency': return <EfficiencyTab />;
      case 'capitalUtil': return <CapitalUtilTab />;
      case 'pnlEntry': return <PnlEntryTab />;
      case 'pnlDashboard': return <PnlDashboardTab />;
      case 'monthlyPnl': return <MonthlyPnlTab />;
      case 'portfolio': return <PortfolioTab />;
      case 'vix': return <VixTab />;
      case 'aiAnalysis': return <AIAnalysisTab />;
      default: return <DashboardTab />;
    }
  }, [activeTab]);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="p-4 max-w-full">
        {tabContent}
      </main>
      <footer className="text-center text-xs text-muted-foreground py-6">
        FiFto Mechanism Backtest Viewer — Built with precision for serious traders
      </footer>
    </div>
  );
}
