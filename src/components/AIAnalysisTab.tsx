import React, { useState, useMemo } from 'react';
import { useAppContext } from '@/context/AppContext';
import { calculateMetrics, getYearOverview, getStreaks, getCorrelationMatrix, getEfficiencyData } from '@/lib/metrics';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Brain, CheckCircle2, AlertTriangle, XCircle, TrendingUp, Shield, Zap, RefreshCw, Loader2, Info, ArrowUp, ArrowDown, Minus } from 'lucide-react';
import { toast } from 'sonner';
import { formatINR } from '@/lib/format';

interface MetricAnalysis {
  name: string;
  value: string;
  status: 'excellent' | 'good' | 'moderate' | 'warning' | 'poor';
  comment: string;
}

interface Suggestion {
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
}

interface AnalysisResult {
  overallRating: string;
  overallScore: number;
  summary: string;
  metrics: MetricAnalysis[];
  strengths: string[];
  weaknesses: string[];
  suggestions: Suggestion[];
  riskAssessment: { level: string; comment: string };
  portfolioHealth: { diversification: string; consistency: string; riskManagement: string; comment: string };
}

const statusConfig = {
  excellent: { color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', icon: CheckCircle2, label: 'Excellent' },
  good: { color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/20', icon: CheckCircle2, label: 'Good' },
  moderate: { color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20', icon: Info, label: 'Moderate' },
  warning: { color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20', icon: AlertTriangle, label: 'Warning' },
  poor: { color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20', icon: XCircle, label: 'Poor' },
};

const priorityConfig = {
  high: { color: 'text-red-400', bg: 'bg-red-500/10', label: 'High Priority' },
  medium: { color: 'text-yellow-400', bg: 'bg-yellow-500/10', label: 'Medium' },
  low: { color: 'text-blue-400', bg: 'bg-blue-500/10', label: 'Low' },
};

const healthColor = (v: string) => {
  if (v === 'good') return 'text-emerald-400';
  if (v === 'moderate') return 'text-yellow-400';
  return 'text-red-400';
};

export default function AIAnalysisTab() {
  const { allTrades, files, globalCapital, vixData } = useAppContext();
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);

  const visibleFiles = files.filter(f => f.visible);
  const totalCapital = visibleFiles.reduce((s, f) => s + (f.capital || 0) * (f.multiplier || 1), 0) || globalCapital;
  const metrics = useMemo(() => calculateMetrics(allTrades, totalCapital), [allTrades, totalCapital]);

  const runAnalysis = async () => {
    if (allTrades.length === 0) {
      toast.error('No trade data loaded. Upload CSV files first.');
      return;
    }

    setLoading(true);
    try {
      const years = getYearOverview(allTrades);
      const yearlyStr = years.map(y => `${y.year}: P&L=₹${y.totalPnl.toLocaleString('en-IN')}, Trades=${y.totalTrades}, WinRate=${y.winRate.toFixed(1)}%, DD=₹${y.maxDrawdown.toLocaleString('en-IN')}`).join('; ');

      const streaks = getStreaks(allTrades);
      const streakStr = `WinStreaks(max=${streaks.winStreaks[0]?.length || 0}), LossStreaks(max=${streaks.lossStreaks[0]?.length || 0})`;

      const fileNames = visibleFiles.map(f => f.name).join(', ');

      let corrSummary = '';
      if (visibleFiles.length > 1) {
        const corrMatrix = getCorrelationMatrix(files);
        const pairs: string[] = [];
        for (let i = 0; i < corrMatrix.labels.length; i++) {
          for (let j = i + 1; j < corrMatrix.labels.length; j++) {
            pairs.push(`${corrMatrix.labels[i]} vs ${corrMatrix.labels[j]}: ${corrMatrix.matrix[i][j].toFixed(2)}`);
          }
        }
        corrSummary = pairs.join('; ');
      }

      const effData = getEfficiencyData(files);
      const effStr = effData.map(e => `${e.name}: Profit=₹${e.netProfit.toLocaleString('en-IN')}, ClosedDD=₹${e.closedDD.toLocaleString('en-IN')}, ER=${e.efficiency === Infinity ? '∞' : e.efficiency.toFixed(2)}`).join('; ');

      let vixStr = '';
      if (vixData.length > 0) {
        const avgVix = vixData.reduce((s, v) => s + v.close, 0) / vixData.length;
        vixStr = `Avg VIX: ${avgVix.toFixed(2)}, Data points: ${vixData.length}`;
      }

      const { data, error } = await supabase.functions.invoke('ai-trading-analysis', {
        body: {
          metrics: {
            totalTrades: metrics.totalTrades,
            winningTrades: metrics.winningTrades,
            losingTrades: metrics.losingTrades,
            winRate: metrics.winRate,
            netProfit: metrics.netProfit,
            grossProfit: metrics.grossProfit,
            grossLoss: metrics.grossLoss,
            profitFactor: metrics.profitFactor,
            payoffRatio: metrics.payoffRatio,
            avgWin: metrics.avgWin,
            avgLoss: metrics.avgLoss,
            maxDrawdown: metrics.maxDrawdown,
            maxDrawdownPct: metrics.maxDrawdownPct,
            expectancy: metrics.expectancy,
            cagr: metrics.cagr,
            sharpeRatio: metrics.sharpeRatio,
            sortinoRatio: metrics.sortinoRatio,
            calmarRatio: metrics.calmarRatio,
            totalReturnPct: metrics.totalReturnPct,
            maxConsecWins: metrics.maxConsecWins,
            maxConsecLosses: metrics.maxConsecLosses,
            monthlyConsistency: metrics.monthlyConsistency,
            yearlyConsistency: metrics.yearlyConsistency,
            statisticalRobustness: metrics.statisticalRobustness,
          },
          files: fileNames,
          yearlyData: yearlyStr,
          streakData: streakStr,
          correlationSummary: corrSummary,
          efficiencyData: effStr,
          vixSummary: vixStr,
        },
      });

      if (error) throw error;
      if (data?.error) {
        toast.error(data.error);
        return;
      }

      setAnalysis(data);
      toast.success('AI Analysis complete!');
    } catch (e: any) {
      console.error('AI analysis failed:', e);
      toast.error('Analysis failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (allTrades.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
        <Brain className="w-16 h-16 text-muted-foreground/40" />
        <h2 className="text-xl font-semibold text-foreground">No Data to Analyze</h2>
        <p className="text-sm text-muted-foreground max-w-md">Upload CSV files first, then come back here for AI-powered deep analysis of your trading strategy.</p>
      </div>
    );
  }

  const scoreColor = (s: number) => s >= 80 ? 'text-emerald-400' : s >= 60 ? 'text-green-400' : s >= 40 ? 'text-yellow-400' : s >= 20 ? 'text-orange-400' : 'text-red-400';
  const scoreRing = (s: number) => s >= 80 ? 'border-emerald-500' : s >= 60 ? 'border-green-500' : s >= 40 ? 'border-yellow-500' : s >= 20 ? 'border-orange-500' : 'border-red-500';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Brain className="w-7 h-7 text-primary" />
          <div>
            <h1 className="text-xl font-bold text-foreground">Lovable AI Analysis</h1>
            <p className="text-xs text-muted-foreground">Deep strategy analysis powered by AI</p>
          </div>
        </div>
        <Button onClick={runAnalysis} disabled={loading} className="gap-2">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {loading ? 'Analyzing...' : analysis ? 'Re-Analyze' : 'Run Analysis'}
        </Button>
      </div>

      {!analysis && !loading && (
        <Card className="border-dashed border-2 border-primary/20">
          <CardContent className="flex flex-col items-center justify-center py-16 space-y-4">
            <Brain className="w-20 h-20 text-primary/30" />
            <h2 className="text-lg font-semibold text-foreground">Ready to Analyze</h2>
            <p className="text-sm text-muted-foreground max-w-lg text-center">
              Click "Run Analysis" to let AI deeply analyze your {metrics.totalTrades} trades across {visibleFiles.length} file(s). 
              Every metric will be evaluated with actionable insights.
            </p>
          </CardContent>
        </Card>
      )}

      {loading && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-20 space-y-4">
            <Loader2 className="w-12 h-12 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">AI is analyzing {metrics.totalTrades} trades...</p>
            <p className="text-xs text-muted-foreground/60">This may take a few seconds</p>
          </CardContent>
        </Card>
      )}

      {analysis && !loading && (
        <>
          {/* Overall Score */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="md:col-span-1">
              <CardContent className="flex flex-col items-center justify-center py-8">
                <div className={`w-28 h-28 rounded-full border-4 ${scoreRing(analysis.overallScore)} flex items-center justify-center mb-3`}>
                  <span className={`text-4xl font-bold ${scoreColor(analysis.overallScore)}`}>{analysis.overallScore}</span>
                </div>
                <span className="text-sm font-semibold text-foreground">{analysis.overallRating}</span>
                <span className="text-xs text-muted-foreground mt-1">Overall Score</span>
              </CardContent>
            </Card>
            <Card className="md:col-span-2">
              <CardHeader className="pb-2"><CardTitle className="text-sm">Summary</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm text-foreground/80 leading-relaxed">{analysis.summary}</p>
                {/* Risk & Health */}
                <div className="grid grid-cols-2 gap-3 mt-4">
                  <div className="p-3 rounded-lg bg-muted/30 border border-border">
                    <div className="flex items-center gap-2 mb-1">
                      <Shield className="w-4 h-4 text-primary" />
                      <span className="text-xs font-semibold text-foreground">Risk Level</span>
                    </div>
                    <p className="text-sm font-bold text-foreground">{analysis.riskAssessment.level}</p>
                    <p className="text-xs text-muted-foreground mt-1">{analysis.riskAssessment.comment}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/30 border border-border">
                    <div className="flex items-center gap-2 mb-1">
                      <Zap className="w-4 h-4 text-primary" />
                      <span className="text-xs font-semibold text-foreground">Portfolio Health</span>
                    </div>
                    <div className="space-y-1 mt-1">
                      <div className="flex justify-between text-xs"><span className="text-muted-foreground">Diversification</span><span className={healthColor(analysis.portfolioHealth.diversification)}>{analysis.portfolioHealth.diversification}</span></div>
                      <div className="flex justify-between text-xs"><span className="text-muted-foreground">Consistency</span><span className={healthColor(analysis.portfolioHealth.consistency)}>{analysis.portfolioHealth.consistency}</span></div>
                      <div className="flex justify-between text-xs"><span className="text-muted-foreground">Risk Mgmt</span><span className={healthColor(analysis.portfolioHealth.riskManagement)}>{analysis.portfolioHealth.riskManagement}</span></div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Metric-by-Metric Analysis */}
          <Card>
            <CardHeader><CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="w-4 h-4" /> Metric-by-Metric Analysis</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {analysis.metrics.map((m, i) => {
                  const cfg = statusConfig[m.status] || statusConfig.moderate;
                  const Icon = cfg.icon;
                  return (
                    <div key={i} className={`p-3 rounded-lg border ${cfg.bg}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-foreground">{m.name}</span>
                        <div className="flex items-center gap-1">
                          <Icon className={`w-3.5 h-3.5 ${cfg.color}`} />
                          <span className={`text-xs font-medium ${cfg.color}`}>{cfg.label}</span>
                        </div>
                      </div>
                      <p className="text-lg font-bold text-foreground">{m.value}</p>
                      <p className="text-xs text-muted-foreground mt-1">{m.comment}</p>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Strengths & Weaknesses */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><ArrowUp className="w-4 h-4 text-emerald-400" /> Strengths</CardTitle></CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {analysis.strengths.map((s, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                      <span className="text-foreground/80">{s}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><ArrowDown className="w-4 h-4 text-red-400" /> Weaknesses</CardTitle></CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {analysis.weaknesses.map((w, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <AlertTriangle className="w-4 h-4 text-orange-400 mt-0.5 shrink-0" />
                      <span className="text-foreground/80">{w}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>

          {/* Suggestions */}
          <Card>
            <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Zap className="w-4 h-4" /> Actionable Suggestions</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3">
                {analysis.suggestions.map((s, i) => {
                  const pcfg = priorityConfig[s.priority] || priorityConfig.medium;
                  return (
                    <div key={i} className="p-3 rounded-lg bg-muted/20 border border-border">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${pcfg.bg} ${pcfg.color}`}>{pcfg.label}</span>
                        <span className="text-sm font-semibold text-foreground">{s.title}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{s.description}</p>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
