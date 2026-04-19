import { forwardRef } from 'react';
import fiftoLogo from '@/assets/fifto-logo.png';
import { DashboardMetrics, Trade, FileData } from '@/lib/types';
import { formatINR, formatNumber, formatDate } from '@/lib/format';
import { getMonthlyData, getEquityCurve, getYearOverview } from '@/lib/metrics';
import {
  ComposedChart, Area, Bar, XAxis, YAxis, CartesianGrid,
  BarChart, PieChart, Pie, Cell, ReferenceLine
} from 'recharts';

interface PdfReportProps {
  metrics: DashboardMetrics;
  trades: Trade[];
  capital: number;
  files: FileData[];
  strategyOverview?: string;
  keyHighlights?: string[];
}

const C = {
  bg: '#ffffff',
  card: '#f8fafc',
  cardAlt: '#f1f5f9',
  border: '#e2e8f0',
  borderLight: '#cbd5e1',
  primary: '#1e40af',
  primaryLight: '#3b82f6',
  success: '#16a34a',
  destructive: '#dc2626',
  warning: '#d97706',
  text: '#0f172a',
  textSecondary: '#475569',
  textDim: '#94a3b8',
  headerBg: '#1e293b',
  headerText: '#f8fafc',
};

const PAGE_WIDTH = 1400;
const PAGE_HEIGHT = 990;

const pageStyle: React.CSSProperties = {
  width: PAGE_WIDTH,
  minHeight: PAGE_HEIGHT,
  background: C.bg,
  color: C.text,
  fontFamily: "'Inter', -apple-system, sans-serif",
  position: 'relative',
  overflow: 'hidden',
  boxSizing: 'border-box',
};

const PdfReport = forwardRef<HTMLDivElement, PdfReportProps>(
  ({ metrics, trades, capital, files, strategyOverview, keyHighlights }, ref) => {
    const equityCurve = getEquityCurve(trades);
    const monthlyData = getMonthlyData(trades);
    const years = getYearOverview(trades);
    const visibleFiles = files.filter(f => f.visible && f.trades.length);

    let runningPeak = 0;
    const equityDD = equityCurve.map(pt => {
      if (pt.equity > runningPeak) runningPeak = pt.equity;
      return { date: pt.date, equity: pt.equity, dd: pt.equity - runningPeak };
    });

    const winPct = metrics.winRate;
    const lossPct = 100 - winPct;
    const pieData = [
      { name: 'Win', value: parseFloat(winPct.toFixed(1)), color: C.success },
      { name: 'Loss', value: parseFloat(lossPct.toFixed(1)), color: C.destructive },
    ];

    const dateRange = trades.length
      ? `${formatDate(trades[0].entryDate)} — ${formatDate(trades[trades.length - 1].exitDate)}`
      : '';
    

    const monthlyClean = monthlyData.map(m => ({
      ...m,
      label: m.month.slice(2),
    }));

    // Split monthly data for table pages (max 24 rows per page)
    const ROWS_PER_PAGE = 24;
    const monthlyPages: typeof monthlyData[] = [];
    for (let i = 0; i < monthlyData.length; i += ROWS_PER_PAGE) {
      monthlyPages.push(monthlyData.slice(i, i + ROWS_PER_PAGE));
    }

    return (
      <div
        ref={ref}
        style={{
          width: PAGE_WIDTH,
          background: C.bg,
          fontFamily: "'Inter', -apple-system, sans-serif",
          position: 'absolute',
          left: '-9999px',
          top: 0,
        }}
      >
        {/* ============ PAGE 1: Cover + Overview ============ */}
        <div style={pageStyle} data-pdf-page="1">
          <PageHeader dateRange={dateRange} capital={capital} />
          <div style={{ padding: '24px 44px 20px' }}>
            {/* Strategy Overview + Key Highlights */}
            {(strategyOverview || keyHighlights) && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                {strategyOverview && (
                  <SectionCard title="Strategy Overview">
                    <p style={{ fontSize: 12, lineHeight: 1.8, color: C.textSecondary, margin: 0 }}>
                      {strategyOverview}
                    </p>
                  </SectionCard>
                )}
                {keyHighlights && keyHighlights.length > 0 && (
                  <SectionCard title="Key Highlights">
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 2, color: C.textSecondary }}>
                      {keyHighlights.map((h, i) => <li key={i}>{h}</li>)}
                    </ul>
                  </SectionCard>
                )}
              </div>
            )}

            {/* KPI Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, marginBottom: 14 }}>
              <KpiCard label="Net Profit" value={formatINR(metrics.netProfit)} color={metrics.netProfit >= 0 ? C.success : C.destructive} highlight />
              <KpiCard label="Win Rate" value={`${formatNumber(metrics.winRate, 1)}%`} color={metrics.winRate >= 50 ? C.success : C.warning} />
              <KpiCard label="Profit Factor" value={formatNumber(metrics.profitFactor)} color={metrics.profitFactor >= 1.5 ? C.success : C.warning} />
              <KpiCard label="Max Drawdown" value={formatINR(metrics.maxDrawdown)} color={C.destructive} />
              <KpiCard label="Expectancy" value={formatINR(metrics.expectancy)} color={metrics.expectancy >= 0 ? C.success : C.destructive} />
              <KpiCard label="Total Trades" value={metrics.totalTrades.toLocaleString()} color={C.primary} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, marginBottom: 20 }}>
              <KpiCard label="Avg Win" value={formatINR(metrics.avgWin)} color={C.success} />
              <KpiCard label="Avg Loss" value={formatINR(metrics.avgLoss)} color={C.destructive} />
              <KpiCard label="Payoff Ratio" value={formatNumber(metrics.payoffRatio)} color={metrics.payoffRatio >= 1.5 ? C.success : C.warning} />
              <KpiCard label="Sharpe" value={formatNumber(metrics.sharpeRatio)} color={metrics.sharpeRatio >= 1 ? C.success : C.textDim} />
              <KpiCard label="Sortino" value={formatNumber(metrics.sortinoRatio)} color={metrics.sortinoRatio >= 1 ? C.success : C.textDim} />
              <KpiCard label="Consec Losses" value={metrics.maxConsecLosses.toString()} color={C.destructive} />
            </div>

            {/* Additional Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              {capital > 0 && <KpiCard label="CAGR" value={`${formatNumber(metrics.cagr, 1)}%`} color={metrics.cagr >= 0 ? C.success : C.destructive} />}
              <KpiCard label="Calmar Ratio" value={formatNumber(metrics.calmarRatio)} color={metrics.calmarRatio >= 1 ? C.success : C.textDim} />
              <KpiCard label="Winning Trades" value={metrics.winningTrades.toString()} color={C.success} />
              <KpiCard label="Losing Trades" value={metrics.losingTrades.toString()} color={C.destructive} />
            </div>
          </div>
          <PageFooter pageNum={1} />
        </div>

        {/* ============ PAGE 2: Charts ============ */}
        <div style={pageStyle} data-pdf-page="2">
          <PageSubHeader title="Equity Curve & Performance Charts" />
          <div style={{ padding: '20px 44px' }}>
            {/* Equity + Drawdown */}
            <ChartCard title="Equity Curve & Drawdown">
              <ComposedChart width={1290} height={280} data={equityDD} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 8, fill: C.textDim }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis yAxisId="eq" tick={{ fontSize: 8, fill: C.textDim }} tickLine={false} axisLine={false}
                  tickFormatter={v => `₹${(v / 100000).toFixed(1)}L`} />
                <YAxis yAxisId="dd" orientation="right" tick={{ fontSize: 8, fill: C.textDim }} tickLine={false} axisLine={false}
                  tickFormatter={v => `₹${(v / 1000).toFixed(0)}K`} />
                <ReferenceLine y={0} yAxisId="eq" stroke={C.border} />
                <Area yAxisId="eq" type="monotone" dataKey="equity" stroke={C.primaryLight} fill={C.primaryLight} strokeWidth={1.5} dot={false} fillOpacity={0.08} />
                <Bar yAxisId="dd" dataKey="dd" fill={C.destructive} fillOpacity={0.25} radius={0} />
              </ComposedChart>
            </ChartCard>

            {/* Win/Loss Pie + Monthly P&L Bar */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 3fr', gap: 14, marginTop: 18 }}>
              <ChartCard title="Win / Loss Ratio">
                <div style={{ position: 'relative', width: 280, height: 240 }}>
                  <PieChart width={280} height={200}>
                    <Pie data={pieData} cx={140} cy={95} innerRadius={50} outerRadius={78} paddingAngle={4} dataKey="value" startAngle={90} endAngle={-270} stroke="none">
                      {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                  </PieChart>
                  <div style={{
                    position: 'absolute', top: '38%', left: '50%', transform: 'translate(-50%, -50%)',
                    textAlign: 'center',
                  }}>
                    <div style={{ fontSize: 22, fontWeight: 900, color: C.text, fontFamily: "'JetBrains Mono', monospace" }}>
                      {formatNumber(winPct, 1)}%
                    </div>
                    <div style={{ fontSize: 9, color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Win Rate</div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 20, marginTop: 0 }}>
                    <LegendDot color={C.success} label={`Win ${metrics.winningTrades}`} />
                    <LegendDot color={C.destructive} label={`Loss ${metrics.losingTrades}`} />
                  </div>
                </div>
              </ChartCard>

              <ChartCard title="Monthly Net P&L">
                <BarChart width={950} height={240} data={monthlyClean} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 7, fill: C.textDim }} tickLine={false} axisLine={false} interval={Math.max(0, Math.floor(monthlyClean.length / 18))} />
                  <YAxis tick={{ fontSize: 8, fill: C.textDim }} tickLine={false} axisLine={false} tickFormatter={v => `₹${(v / 1000).toFixed(0)}K`} />
                  <ReferenceLine y={0} stroke={C.borderLight} strokeDasharray="3 3" />
                  <Bar dataKey="pnl" radius={[2, 2, 0, 0]} maxBarSize={16}>
                    {monthlyClean.map((entry, i) => (
                      <Cell key={i} fill={entry.pnl >= 0 ? C.success : C.destructive} fillOpacity={0.8} />
                    ))}
                  </Bar>
                </BarChart>
              </ChartCard>
            </div>
          </div>
          <PageFooter pageNum={2} />
        </div>

        {/* ============ PAGE 3: Yearly Summary + Top Trades ============ */}
        <div style={pageStyle} data-pdf-page="3">
          <PageSubHeader title="Yearly Performance & Top Trades" />
          <div style={{ padding: '20px 44px' }}>
            {/* Yearly Table */}
            {years.length > 0 && (
              <div style={{ borderRadius: 8, border: `1px solid ${C.border}`, overflow: 'hidden', marginBottom: 24 }}>
                <div style={{
                  padding: '10px 16px', background: C.cardAlt, borderBottom: `1px solid ${C.border}`,
                  fontSize: 11, fontWeight: 800, color: C.textSecondary, textTransform: 'uppercase', letterSpacing: '0.1em',
                }}>
                  Yearly Performance Summary
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr>
                      {['Year', 'Net P&L', 'Win Rate', 'Trades', 'Profit Mo.', 'Loss Mo.', 'Max DD'].map((h, i) => (
                        <th key={h} style={{
                          padding: '10px 16px', textAlign: i === 0 ? 'left' : 'right',
                          fontWeight: 700, color: C.textDim, fontSize: 10, textTransform: 'uppercase',
                          letterSpacing: '0.08em', borderBottom: `1px solid ${C.border}`, background: C.card,
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {years.map((y, idx) => (
                      <tr key={y.year} style={{ background: idx % 2 === 0 ? C.bg : C.card }}>
                        <td style={{ padding: '9px 16px', fontWeight: 800, fontSize: 13, color: C.text }}>{y.year}</td>
                        <td style={{ padding: '9px 16px', textAlign: 'right', fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: y.totalPnl >= 0 ? C.success : C.destructive }}>{formatINR(y.totalPnl)}</td>
                        <td style={{ padding: '9px 16px', textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", color: y.winRate >= 50 ? C.success : C.textSecondary }}>{formatNumber(y.winRate, 1)}%</td>
                        <td style={{ padding: '9px 16px', textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", color: C.textSecondary }}>{y.totalTrades}</td>
                        <td style={{ padding: '9px 16px', textAlign: 'right', fontWeight: 700, color: C.success }}>{y.profitableMonths}</td>
                        <td style={{ padding: '9px 16px', textAlign: 'right', fontWeight: 700, color: y.lossMonths > 0 ? C.destructive : C.textDim }}>{y.lossMonths}</td>
                        <td style={{ padding: '9px 16px', textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: C.destructive }}>{formatINR(y.maxDrawdown)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Top 5 Wins & Losses */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <TopTradesTable title="Top 5 Winning Trades" trades={metrics.top5Wins} color={C.success} />
              <TopTradesTable title="Top 5 Losing Trades" trades={metrics.top5Losses} color={C.destructive} />
            </div>
          </div>
          <PageFooter pageNum={3} />
        </div>

        {/* ============ PAGE 4+: Monthly P&L Tables ============ */}
        {monthlyPages.map((page, pageIdx) => (
          <div key={pageIdx} style={pageStyle} data-pdf-page={`${4 + pageIdx}`}>
            <PageSubHeader title={`Monthly P&L Detail${monthlyPages.length > 1 ? ` (${pageIdx + 1}/${monthlyPages.length})` : ''}`} />
            <div style={{ padding: '20px 44px' }}>
              <div style={{ borderRadius: 8, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr>
                      {['Month', 'Trades', 'Wins', 'Win Rate', 'Net P&L'].map((h, i) => (
                        <th key={h} style={{
                          padding: '10px 16px', textAlign: i === 0 ? 'left' : 'right',
                          fontWeight: 700, color: C.textDim, fontSize: 10, textTransform: 'uppercase',
                          letterSpacing: '0.08em', borderBottom: `1px solid ${C.border}`, background: C.card,
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {page.map((m, idx) => {
                      const wr = m.trades > 0 ? (m.wins / m.trades * 100) : 0;
                      return (
                        <tr key={m.month} style={{ background: idx % 2 === 0 ? C.bg : C.card }}>
                          <td style={{ padding: '8px 16px', fontWeight: 700, fontSize: 12, color: C.text }}>{m.month}</td>
                          <td style={{ padding: '8px 16px', textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", color: C.textSecondary }}>{m.trades}</td>
                          <td style={{ padding: '8px 16px', textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", color: C.success }}>{m.wins}</td>
                          <td style={{ padding: '8px 16px', textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", color: wr >= 50 ? C.success : C.textSecondary }}>{formatNumber(wr, 1)}%</td>
                          <td style={{ padding: '8px 16px', textAlign: 'right', fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: m.pnl >= 0 ? C.success : C.destructive }}>{formatINR(m.pnl)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            <PageFooter pageNum={4 + pageIdx} />
          </div>
        ))}
      </div>
    );
  }
);

PdfReport.displayName = 'PdfReport';

/* ---- Sub Components ---- */

function PageHeader({ dateRange, capital }: { dateRange: string; capital: number }) {
  return (
    <div style={{ padding: '24px 44px 20px', background: C.headerBg, color: C.headerText }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
        <img src={fiftoLogo} alt="FiFto" style={{ height: 70, marginBottom: 8 }} crossOrigin="anonymous" />
      </div>
      <div style={{ marginTop: 10, display: 'flex', justifyContent: 'center', gap: 32, fontSize: 12, color: '#94a3b8' }}>
        <span>{dateRange}</span>
        {capital > 0 && <span>Capital: {formatINR(capital)}</span>}
        <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          Report Date: {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
        </span>
      </div>
    </div>
  );
}

function PageSubHeader({ title }: { title: string }) {
  return (
    <div style={{
      padding: '16px 44px', background: C.headerBg, color: C.headerText,
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    }}>
      <div>
        <span style={{ fontSize: 20, fontWeight: 900, letterSpacing: '-0.02em' }}>FiFto</span>
        <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 12, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Portfolio Management
        </span>
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {title}
      </div>
    </div>
  );
}

function PageFooter({ pageNum }: { pageNum: number }) {
  return (
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0,
      padding: '12px 44px', borderTop: `1px solid ${C.border}`,
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      background: C.card, fontSize: 9, color: C.textDim,
    }}>
      <span>Generated by FiFto Portfolio Management · Confidential · For informational purposes only</span>
      <span>Page {pageNum} · Past performance does not guarantee future results</span>
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#f8fafc', borderRadius: 8, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
      <div style={{
        padding: '10px 16px', background: C.cardAlt, borderBottom: `1px solid ${C.border}`,
        fontSize: 11, fontWeight: 800, color: C.primary, textTransform: 'uppercase', letterSpacing: '0.1em',
      }}>
        {title}
      </div>
      <div style={{ padding: '14px 16px' }}>{children}</div>
    </div>
  );
}

function KpiCard({ label, value, color, highlight }: { label: string; value: string; color: string; highlight?: boolean }) {
  return (
    <div style={{
      background: highlight ? C.card : C.bg, borderRadius: 6, padding: '10px 14px',
      border: `1px solid ${C.border}`, borderLeft: `3px solid ${color}`,
    }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 900, color, fontFamily: "'JetBrains Mono', monospace", letterSpacing: '-0.02em' }}>{value}</div>
    </div>
  );
}

function ChartCard({ title, children, style }: { title: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ borderRadius: 8, border: `1px solid ${C.border}`, overflow: 'hidden', ...style }}>
      <div style={{
        padding: '10px 16px', background: C.cardAlt, borderBottom: `1px solid ${C.border}`,
        fontSize: 10, fontWeight: 800, color: C.textSecondary, textTransform: 'uppercase', letterSpacing: '0.1em',
      }}>
        {title}
      </div>
      <div style={{ padding: '12px 10px 8px', background: C.bg }}>{children}</div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
      <span style={{ fontSize: 10, color: C.textSecondary, fontWeight: 600 }}>{label}</span>
    </div>
  );
}

function TopTradesTable({ title, trades, color }: { title: string; trades: Trade[]; color: string }) {
  return (
    <div style={{ borderRadius: 8, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
      <div style={{
        padding: '10px 16px', background: C.cardAlt, borderBottom: `1px solid ${C.border}`,
        fontSize: 10, fontWeight: 800, color, textTransform: 'uppercase', letterSpacing: '0.1em',
      }}>
        {title}
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead>
          <tr>
            {['#', 'Date', 'Instrument', 'P&L'].map((h, i) => (
              <th key={h} style={{
                padding: '8px 12px', textAlign: i === 0 ? 'center' : i === 3 ? 'right' : 'left',
                fontWeight: 700, color: C.textDim, fontSize: 9, textTransform: 'uppercase',
                borderBottom: `1px solid ${C.border}`, background: C.card,
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {trades.map((t, idx) => (
            <tr key={idx} style={{ background: idx % 2 === 0 ? C.bg : C.card }}>
              <td style={{ padding: '7px 12px', textAlign: 'center', fontWeight: 700, color: C.textDim }}>{idx + 1}</td>
              <td style={{ padding: '7px 12px', fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: C.textSecondary }}>
                {formatDate(t.exitDate)}
              </td>
              <td style={{ padding: '7px 12px', fontWeight: 600, color: C.text, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {t.signal || t.fileName || '-'}
              </td>
              <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", color }}>
                {formatINR(t.netPnl)}
              </td>
            </tr>
          ))}
          {trades.length === 0 && (
            <tr><td colSpan={4} style={{ padding: '12px', textAlign: 'center', color: C.textDim, fontSize: 11 }}>No data</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default PdfReport;
