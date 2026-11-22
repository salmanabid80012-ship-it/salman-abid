import React, { useState } from 'react';
import { Calculator, Check, FileText, Sparkles, XCircle } from 'lucide-react';
import { AI_TASK_DEFINITIONS } from '../data/catalogConstants.ts';
import type {
  AITaskKey,
  NavSection,
  ProductRecord,
  ProductStatus,
} from '../types/commerce.ts';
import {
  calculateOpportunityScore,
  calculateProfitability,
} from '../utils/commerceMath.ts';
import { ProductThumbnail } from './ProductThumbnail.tsx';

interface ResearchViewProps {
  products: ProductRecord[];
  selectedProductId: string | null;
  onSelectProductId: (id: string) => void;
  onNavigate: (section: NavSection) => void;
  onRefresh: () => Promise<void>;
  onNotify: (message: string, tone?: 'success' | 'error') => void;
}

export const ResearchView: React.FC<ResearchViewProps> = ({
  products,
  selectedProductId,
  onSelectProductId,
  onNavigate,
  onRefresh,
  onNotify,
}) => {
  const product = products.find((p) => p.id === selectedProductId) || products[0] || null;
  const [selectedTask, setSelectedTask] = useState<AITaskKey>('product_research');
  const [aiRunning, setAiRunning] = useState(false);

  if (!product) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-10 text-center dark:border-slate-800 dark:bg-slate-900">
        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
          No products in your research pipeline yet.
        </p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Run Product Discovery to populate candidate items across any category.
        </p>
        <button
          type="button"
          onClick={() => onNavigate('discovery')}
          className="mt-4 rounded-lg bg-teal-700 px-4 py-2 text-xs font-medium text-white hover:bg-teal-800 cursor-pointer"
        >
          Open Product Discovery
        </button>
      </div>
    );
  }

  const profit = calculateProfitability({
    sellingPrice: product.sellingPrice,
    supplierCost: product.supplierCost,
    shippingCost: product.shippingCost,
    packagingCost: product.packagingCost,
    marketplaceFeePct: product.marketplaceFeePct,
    paymentFeePct: product.paymentFeePct,
    paymentFixedFee: 0.3,
    adSpendPct: product.adSpendPct,
    returnAllowancePct: product.returnAllowancePct,
    customsPct: product.customsPct,
    taxPct: 0,
  });

  const bestShippingDays =
    product.supplierQuotes.length > 0
      ? Math.min(...product.supplierQuotes.map((q) => q.estimatedDaysMax || 8))
      : 7;

  const scoreDetail = calculateOpportunityScore({
    netMarginPct: profit.netMarginPct,
    netProfit: profit.netProfit,
    estimatedMonthlySales: product.estimatedMonthlySales,
    competitionLevel: product.competitionLevel,
    avgShippingDays: bestShippingDays,
    hasInStockSupplier: product.supplierQuotes.some((q) => q.stockCount === null || q.stockCount > 0),
  });

  const updateStatus = async (status: ProductStatus) => {
    try {
      const resp = await fetch(`/api/products/${product.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!resp.ok) throw new Error('Status update failed');
      await onRefresh();
      onNotify(`Marked "${product.title}" as ${status.replace('_', ' ')}`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Update failed', 'error');
    }
  };

  const runAIResearch = async () => {
    setAiRunning(true);
    try {
      const resp = await fetch(`/api/products/${product.id}/ai-research`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskKey: selectedTask }),
      });
      const data = (await resp.json()) as { error?: string; aiResult?: { providerName: string; modelId: string } };
      if (!resp.ok) throw new Error(data.error || 'AI analysis failed');
      await onRefresh();
      onNotify(
        `Completed ${selectedTask.replace('_', ' ')} via ${data.aiResult?.providerName} (${data.aiResult?.modelId})`
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'AI analysis failed', 'error');
    } finally {
      setAiRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Product Switcher & Quick Decisions */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <label htmlFor="research-product-select" className="text-xs font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap">
            Active Product
          </label>
          <select
            id="research-product-select"
            value={product.id}
            onChange={(e) => onSelectProductId(e.target.value)}
            className="w-full max-w-md rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          >
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.sku} · {p.title} ({p.opportunityScore}/100)
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => updateStatus('shortlisted')}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap cursor-pointer"
          >
            Shortlist
          </button>
          <button
            type="button"
            onClick={() => updateStatus('approved')}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800 whitespace-nowrap cursor-pointer"
          >
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
            Approve
          </button>
          <button
            type="button"
            onClick={() => updateStatus('rejected')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50 dark:border-rose-900/60 dark:text-rose-400 dark:hover:bg-rose-950/30 whitespace-nowrap cursor-pointer"
          >
            <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
            Reject
          </button>
          <button
            type="button"
            onClick={() => onNavigate('calculator')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 whitespace-nowrap cursor-pointer"
          >
            <Calculator className="h-3.5 w-3.5" aria-hidden="true" />
            Profit Model
          </button>
          <button
            type="button"
            onClick={() => onNavigate('listings')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 whitespace-nowrap cursor-pointer"
          >
            <FileText className="h-3.5 w-3.5" aria-hidden="true" />
            Create Listing
          </button>
        </div>
      </div>

      {/* Header Dossier + Opportunity Scoring */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 lg:col-span-8">
          <div className="flex flex-col gap-4 sm:flex-row">
            <ProductThumbnail
              src={product.imageUrl}
              alt={product.title}
              category={product.category}
              className="h-36 w-48"
            />
            <div className="min-w-0 flex-1">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {product.sku} · {product.category} · {product.targetCountry} · Status:{' '}
                <span className="font-medium text-slate-800 dark:text-slate-200">
                  {product.status.replace('_', ' ')}
                </span>
              </p>
              <h2 className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">
                {product.title}
              </h2>

              <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4 border-t border-slate-100 pt-4 dark:border-slate-800">
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Selling Price</p>
                  <p className="mt-0.5 font-mono text-base font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                    ${product.sellingPrice.toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Landed Cost</p>
                  <p className="mt-0.5 font-mono text-base font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                    ${profit.landedProductCost.toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Net Unit Profit</p>
                  <p
                    className={`mt-0.5 font-mono text-base font-semibold tabular-nums ${
                      profit.netProfit >= 0
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    ${profit.netProfit.toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Net Margin / ROI</p>
                  <p className="mt-0.5 font-mono text-base font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                    {profit.netMarginPct.toFixed(1)}% / {profit.roiPct.toFixed(0)}%
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 border-t border-slate-100 pt-4 sm:grid-cols-2 dark:border-slate-800">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Demand & Audience
              </h3>
              <p className="mt-1 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                {product.researchNotes?.demandSummary || 'Pending research summary.'}
              </p>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                Est. Monthly Demand:{' '}
                <span className="font-mono font-medium tabular-nums text-slate-800 dark:text-slate-200">
                  {product.estimatedMonthlySales} units/mo
                </span>
              </p>
            </div>
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Competition & Risk Factors
              </h3>
              <p className="mt-1 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                {product.researchNotes?.competitionSummary || 'Pending competitive scan.'}
              </p>
              {product.researchNotes?.riskFactors && product.researchNotes.riskFactors.length > 0 && (
                <ul className="mt-2 list-disc pl-4 text-xs text-slate-600 dark:text-slate-400 space-y-0.5">
                  {product.researchNotes.riskFactors.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        {/* Opportunity Score Card */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 lg:col-span-4">
          <div className="flex items-baseline justify-between">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Opportunity Score Breakdown
            </h3>
            <span className="font-mono text-2xl font-bold tabular-nums text-teal-700 dark:text-teal-400">
              {scoreDetail.score}
              <span className="text-xs font-normal text-slate-400">/100</span>
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Rating: <span className="font-medium text-slate-800 dark:text-slate-200">{scoreDetail.verdict} Opportunity</span>
          </p>

          <div className="mt-4 space-y-2.5 text-xs">
            {[
              { label: 'Net Margin Depth', val: scoreDetail.components.marginScore, max: 30 },
              { label: 'Unit Profit Dollars', val: scoreDetail.components.profitDollarScore, max: 20 },
              { label: 'Market Demand Velocity', val: scoreDetail.components.demandScore, max: 25 },
              { label: 'Competition Headroom', val: scoreDetail.components.competitionScore, max: 15 },
              { label: 'Logistics & Stock', val: scoreDetail.components.logisticsScore, max: 10 },
            ].map((row) => (
              <div key={row.label}>
                <div className="flex justify-between text-slate-700 dark:text-slate-300">
                  <span>{row.label}</span>
                  <span className="font-mono tabular-nums">
                    {row.val} / {row.max}
                  </span>
                </div>
                <div className="mt-1 h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className="h-full rounded-full bg-teal-600"
                    style={{ width: `${Math.round((row.val / row.max) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* AI Research Workbench */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              AI Intelligence Analysis
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Routes through the provider & model assigned in AI Model Hub
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Select AI analysis task"
              value={selectedTask}
              onChange={(e) => setSelectedTask(e.target.value as AITaskKey)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              {AI_TASK_DEFINITIONS.map((t) => (
                <option key={t.taskKey} value={t.taskKey}>
                  {t.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={runAIResearch}
              disabled={aiRunning}
              className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-teal-800 disabled:opacity-50 whitespace-nowrap cursor-pointer"
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              {aiRunning ? 'Running Analysis...' : 'Run Assigned AI Model'}
            </button>
          </div>
        </div>

        {product.researchNotes?.aiSummary ? (
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/50">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Model Output · {product.researchNotes.aiModelUsed} ·{' '}
              {new Date(product.researchNotes.researchedAt).toLocaleString()}
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800 dark:text-slate-200 leading-relaxed">
              {product.researchNotes.aiSummary}
            </p>
          </div>
        ) : (
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            No AI deep-dive run saved for this SKU yet. Choose a task above to invoke your configured AI model.
          </p>
        )}
      </div>

      {/* Supplier Comparison + Marketplace Benchmarks */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
          <div className="border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Supplier Quote Comparison
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
                  <th className="px-4 py-2.5">Supplier</th>
                  <th className="px-3 py-2.5 text-right">Unit Cost</th>
                  <th className="px-3 py-2.5 text-right">Shipping</th>
                  <th className="px-3 py-2.5 text-right">ETA</th>
                  <th className="px-4 py-2.5 text-right">Stock</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {product.supplierQuotes.map((q) => (
                  <tr key={q.supplierId}>
                    <td className="px-4 py-2.5 font-medium text-slate-900 dark:text-slate-100">
                      {q.supplierName}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                      ${q.unitCost.toFixed(2)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                      {q.supportsLiveShipping ? `$${q.shippingCost.toFixed(2)}` : 'Unsupported'}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                      {q.supportsLiveShipping ? `${q.estimatedDaysMin}-${q.estimatedDaysMax}d` : 'N/A'}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400">
                      {q.supportsInventory && q.stockCount !== null ? q.stockCount : 'Not supported'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
          <div className="border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Marketplace Price & Demand Benchmarks
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
                  <th className="px-4 py-2.5">Marketplace</th>
                  <th className="px-3 py-2.5 text-right">Range</th>
                  <th className="px-3 py-2.5 text-right">Avg Price</th>
                  <th className="px-3 py-2.5 text-right">Fee %</th>
                  <th className="px-4 py-2.5 text-right">Competition</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {product.marketplaceBenchmarks.map((b) => (
                  <tr key={`${b.marketplaceId}-${b.country}`}>
                    <td className="px-4 py-2.5 font-medium text-slate-900 dark:text-slate-100">
                      {b.marketplaceName} ({b.country})
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums whitespace-nowrap">
                      ${b.minSellingPrice.toFixed(0)}–${b.maxSellingPrice.toFixed(0)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums font-medium whitespace-nowrap">
                      ${b.avgSellingPrice.toFixed(2)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums whitespace-nowrap">
                      {b.referralFeePct.toFixed(2)}%
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-700 dark:text-slate-300">
                      {b.competitionLevel}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Specifications */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Normalized Product Specifications & Keywords
        </h3>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Object.entries(product.specifications).map(([key, val]) => (
            <div key={key} className="rounded-lg border border-slate-100 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-800/40">
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{key}</p>
              <p className="mt-0.5 text-xs font-medium text-slate-900 dark:text-slate-100">{val}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
          Keywords: {product.keywords.join(' · ')}
        </p>
      </div>
    </div>
  );
};
