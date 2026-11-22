import React from 'react';
import { ArrowRight, CheckCircle2, Clock, Layers, ShieldAlert, TrendingUp } from 'lucide-react';
import type {
  ActivityEvent,
  AIProviderConfig,
  MarketplaceConnector,
  NavSection,
  ProductRecord,
  SupplierConnector,
} from '../types/commerce.ts';
import { calculateProfitability } from '../utils/commerceMath.ts';
import { ProductThumbnail } from './ProductThumbnail.tsx';

interface DashboardViewProps {
  products: ProductRecord[];
  suppliers: SupplierConnector[];
  marketplaces: MarketplaceConnector[];
  aiProviders: AIProviderConfig[];
  activityLogs: ActivityEvent[];
  dailyProgress: { discoveredToday: number; dailyTarget: number };
  onNavigate: (section: NavSection) => void;
  onSelectProduct: (productId: string, targetSection: NavSection) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  products,
  suppliers,
  marketplaces,
  aiProviders,
  activityLogs,
  dailyProgress,
  onNavigate,
  onSelectProduct,
}) => {
  const totalDiscovered = products.length;
  const researchedCount = products.filter((p) => Boolean(p.researchNotes)).length;
  const approvedCount = products.filter((p) => p.status === 'approved').length;
  const rejectedCount = products.filter((p) => p.status === 'rejected').length;
  const shortlistedCount = products.filter((p) => p.status === 'shortlisted').length;
  const awaitingCount = products.filter((p) => p.status === 'awaiting_review').length;

  const activeProducts = products.filter((p) => p.status !== 'rejected');
  const estimatedMonthlyProfitPool = activeProducts.reduce((acc, p) => {
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
    return acc + Math.max(0, prof.netProfit) * Math.round(p.estimatedMonthlySales * 0.08);
  }, 0);

  const progressPct = Math.min(
    100,
    Math.round((dailyProgress.discoveredToday / Math.max(1, dailyProgress.dailyTarget)) * 100)
  );

  const connectedSuppliers = suppliers.filter((s) => s.connectionStatus === 'connected').length;
  const enabledSuppliers = suppliers.filter((s) => s.enabled).length;
  const connectedMarketplaces = marketplaces.filter((m) => m.connectionStatus === 'connected').length;
  const enabledMarketplaces = marketplaces.filter((m) => m.enabled).length;
  const connectedAI = aiProviders.filter((a) => a.connectionStatus === 'connected' && a.enabled).length;
  const enabledAI = aiProviders.filter((a) => a.enabled).length;

  const topOpportunities = [...products]
    .filter((p) => p.status !== 'rejected')
    .sort((a, b) => b.opportunityScore - a.opportunityScore)
    .slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Primary Pipeline KPI Strip */}
      <section aria-label="Pipeline metrics">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Discovered</p>
            <p className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
              {totalDiscovered}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {researchedCount} researched
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Awaiting Review</p>
            <p className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-amber-600 dark:text-amber-400">
              {awaitingCount}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">In triage queue</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Shortlisted</p>
            <p className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-teal-700 dark:text-teal-400">
              {shortlistedCount}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Ready for deep dive</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Approved</p>
            <p className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
              {approvedCount}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Cleared margin rules</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Rejected</p>
            <p className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-slate-700 dark:text-slate-300">
              {rejectedCount}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Filtered by unit economics</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Est. Profit Pool</p>
            <p className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
              ${Math.round(estimatedMonthlyProfitPool).toLocaleString()}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Monthly @ 8% share</p>
          </div>
        </div>
      </section>

      {/* Daily Discovery Progress + Integration Health */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 lg:col-span-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Daily Discovery Progress
              </h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Configurable across all categories and active suppliers
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('discovery')}
              className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Run Discovery
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>

          <div className="mt-5">
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                {dailyProgress.discoveredToday}{' '}
                <span className="text-sm font-normal text-slate-500 dark:text-slate-400">
                  / {dailyProgress.dailyTarget} products today
                </span>
              </span>
              <span className="font-mono text-sm font-medium tabular-nums text-teal-700 dark:text-teal-400">
                {progressPct}%
              </span>
            </div>
            <div className="mt-2.5 h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                className="h-full rounded-full bg-teal-600 transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
              Adjust daily target, category scope, and profit floors in Product Discovery or Settings.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 lg:col-span-7">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Infrastructure Connection Status
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('integrations')}
              className="text-xs font-medium text-teal-700 hover:underline dark:text-teal-400 whitespace-nowrap shrink-0 cursor-pointer"
            >
              View Matrix
            </button>
          </div>

          <div className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
            <div className="flex items-center justify-between py-3 gap-4">
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  Supplier Connectors
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {suppliers.map((s) => s.name).join(' · ')}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300">
                  {connectedSuppliers} connected / {enabledSuppliers} enabled
                </span>
                <button
                  type="button"
                  onClick={() => onNavigate('suppliers')}
                  className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap cursor-pointer"
                >
                  Manage
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between py-3 gap-4">
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  Marketplace Connectors
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {marketplaces.map((m) => m.name.split(' ')[0]).join(' · ')} · Direct publishing disabled by default
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300">
                  {connectedMarketplaces} connected / {enabledMarketplaces} enabled
                </span>
                <button
                  type="button"
                  onClick={() => onNavigate('marketplaces')}
                  className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap cursor-pointer"
                >
                  Manage
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between py-3 gap-4">
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  AI Model Providers
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {aiProviders.filter((p) => p.enabled).map((p) => p.name).join(' · ') || 'No active providers'}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300">
                  {connectedAI} ready / {enabledAI} enabled
                </span>
                <button
                  type="button"
                  onClick={() => onNavigate('ai-hub')}
                  className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap cursor-pointer"
                >
                  Configure
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Top Opportunities Table + Recent Activity */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 lg:col-span-8 overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Highest Opportunity Products
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Ranked by composite margin, unit profit, demand velocity, and competition
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('queue')}
              className="text-xs font-medium text-teal-700 hover:underline dark:text-teal-400 whitespace-nowrap cursor-pointer"
            >
              Open Full Queue
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
                  <th className="px-5 py-2.5">Product</th>
                  <th className="px-3 py-2.5 text-right">Retail</th>
                  <th className="px-3 py-2.5 text-right">Net Profit</th>
                  <th className="px-3 py-2.5 text-right">Margin</th>
                  <th className="px-3 py-2.5 text-right">Score</th>
                  <th className="px-5 py-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {topOpportunities.map((p) => {
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
                  return (
                    <tr
                      key={p.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <ProductThumbnail
                            src={p.imageUrl}
                            alt={p.title}
                            category={p.category}
                            className="h-10 w-12"
                          />
                          <div className="min-w-0">
                            <p className="truncate font-medium text-slate-900 dark:text-slate-100 max-w-[260px]">
                              {p.title}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {p.category} · {p.primaryMarketplace.toUpperCase()} · {p.status.replace('_', ' ')}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                        ${p.sellingPrice.toFixed(2)}
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums font-medium text-emerald-700 dark:text-emerald-400">
                        ${prof.netProfit.toFixed(2)}
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                        {prof.netMarginPct.toFixed(1)}%
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                        {p.opportunityScore}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => onSelectProduct(p.id, 'research')}
                          className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap cursor-pointer"
                        >
                          Inspect
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {topOpportunities.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-sm text-slate-500">
                      No active opportunities yet. Run Product Discovery to evaluate candidates.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 lg:col-span-4">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Recent Research Activity
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Persisted workspace audit trail
          </p>

          <div className="mt-4 space-y-4">
            {activityLogs.slice(0, 7).map((act) => (
              <div key={act.id} className="flex gap-3 border-b border-slate-100 pb-3 last:border-none last:pb-0 dark:border-slate-800">
                <div className="mt-0.5 text-slate-400 dark:text-slate-500 shrink-0">
                  {act.category === 'discovery' ? (
                    <Layers className="h-4 w-4" aria-hidden="true" />
                  ) : act.category === 'queue' ? (
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  ) : act.category === 'marketplace' ? (
                    <ShieldAlert className="h-4 w-4" aria-hidden="true" />
                  ) : act.category === 'research' ? (
                    <TrendingUp className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Clock className="h-4 w-4" aria-hidden="true" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    {act.title}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    {act.detail}
                  </p>
                  <p className="mt-1 font-mono text-[11px] text-slate-400 dark:text-slate-500">
                    {new Date(act.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
