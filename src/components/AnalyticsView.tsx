import React from 'react';
import { Download } from 'lucide-react';
import type { AIProviderConfig, AIUsageLog, ProductRecord } from '../types/commerce.ts';
import { calculateProfitability } from '../utils/commerceMath.ts';

interface AnalyticsViewProps {
  products: ProductRecord[];
  aiProviders: AIProviderConfig[];
  aiUsageLogs: AIUsageLog[];
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({
  products,
  aiProviders,
  aiUsageLogs,
}) => {
  const byCategory = new Map<
    string,
    { count: number; avgScore: number; avgMargin: number; totalScore: number; totalMargin: number }
  >();
  const byMarketplace = new Map<string, { count: number; avgMargin: number; totalMargin: number }>();

  for (const p of products) {
    const prof = calculateProfitability({
      sellingPrice: p.sellingPrice,
      supplierCost: p.supplierCost,
      shippingCost: p.shippingCost,
      packagingCost: p.packagingCost,
      marketplaceFeePct: p.marketplaceFeePct,
      paymentFeePct: p.paymentFeePct,
      paymentFixedFee: 0.3,
      adSpendPct: p.adSpendPct,
      returnAllowancePct: p.returnAllowancePct,
      customsPct: p.customsPct,
      taxPct: 0,
    });

    const catEntry = byCategory.get(p.category) || {
      count: 0,
      avgScore: 0,
      avgMargin: 0,
      totalScore: 0,
      totalMargin: 0,
    };
    catEntry.count += 1;
    catEntry.totalScore += p.opportunityScore;
    catEntry.totalMargin += prof.netMarginPct;
    catEntry.avgScore = Math.round(catEntry.totalScore / catEntry.count);
    catEntry.avgMargin = Math.round((catEntry.totalMargin / catEntry.count) * 10) / 10;
    byCategory.set(p.category, catEntry);

    const mktKey = p.primaryMarketplace.toUpperCase();
    const mktEntry = byMarketplace.get(mktKey) || { count: 0, avgMargin: 0, totalMargin: 0 };
    mktEntry.count += 1;
    mktEntry.totalMargin += prof.netMarginPct;
    mktEntry.avgMargin = Math.round((mktEntry.totalMargin / mktEntry.count) * 10) / 10;
    byMarketplace.set(mktKey, mktEntry);
  }

  const categoryRows = Array.from(byCategory.entries()).sort(
    (a, b) => b[1].avgScore - a[1].avgScore
  );
  const marketplaceRows = Array.from(byMarketplace.entries());

  const totalAiSpend = aiProviders.reduce((s, p) => s + p.currentMonthSpendUsd, 0);
  const totalTokens = aiProviders.reduce((s, p) => s + p.totalTokensUsed, 0);

  const downloadReport = () => {
    const report = {
      generatedAt: new Date().toISOString(),
      productCount: products.length,
      categoryBreakdown: categoryRows.map(([category, stats]) => ({ category, ...stats })),
      marketplaceBreakdown: marketplaceRows.map(([marketplace, stats]) => ({
        marketplace,
        ...stats,
      })),
      aiSummary: {
        totalMonthlySpendUsd: totalAiSpend,
        totalTokensUsed: totalTokens,
        recentExecutions: aiUsageLogs.length,
      },
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `commerce-analytics-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Portfolio Analytics & Margin Reports
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Cross-category opportunity density, marketplace profitability, and AI compute spend
          </p>
        </div>
        <button
          type="button"
          onClick={downloadReport}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
        >
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          Download Report JSON
        </button>
      </div>

      {/* Category Opportunity Bars */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 lg:col-span-7">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Category Performance & Average Opportunity Score
          </h3>
          <div className="mt-4 space-y-3.5">
            {categoryRows.map(([cat, stats]) => (
              <div key={cat}>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    {cat} · {stats.count} SKU{stats.count > 1 ? 's' : ''}
                  </span>
                  <span className="font-mono tabular-nums text-slate-600 dark:text-slate-400">
                    Avg Margin {stats.avgMargin}% · Score {stats.avgScore}/100
                  </span>
                </div>
                <div className="mt-1.5 h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className="h-full rounded-full bg-teal-600"
                    style={{ width: `${Math.min(100, stats.avgScore)}%` }}
                  />
                </div>
              </div>
            ))}
            {categoryRows.length === 0 && (
              <p className="text-xs text-slate-500">No product data available.</p>
            )}
          </div>
        </div>

        <div className="space-y-6 lg:col-span-5">
          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Marketplace Mix & Net Margins
            </h3>
            <div className="mt-4 divide-y divide-slate-100 text-xs dark:divide-slate-800">
              {marketplaceRows.map(([mkt, stats]) => (
                <div key={mkt} className="flex items-center justify-between py-2.5">
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    {mkt} ({stats.count} products)
                  </span>
                  <span className="font-mono tabular-nums font-medium text-slate-900 dark:text-slate-100">
                    {stats.avgMargin.toFixed(1)}% avg margin
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              AI Spend & Token Consumption
            </h3>
            <div className="mt-3 grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Month-to-Date Spend</p>
                <p className="mt-1 font-mono text-xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                  ${totalAiSpend.toFixed(4)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Total Tokens Processed</p>
                <p className="mt-1 font-mono text-xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                  {totalTokens.toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
