import React, { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import type { ProductRecord, ProfitInput } from '../types/commerce.ts';
import {
  buildPriceSensitivityRows,
  calculateProfitability,
  getMarketplaceFeeDefaults,
} from '../utils/commerceMath.ts';

interface ProfitCalculatorViewProps {
  products: ProductRecord[];
  selectedProductId: string | null;
  onSelectProductId: (id: string) => void;
  onRefresh: () => Promise<void>;
  onNotify: (message: string, tone?: 'success' | 'error') => void;
}

export const ProfitCalculatorView: React.FC<ProfitCalculatorViewProps> = ({
  products,
  selectedProductId,
  onSelectProductId,
  onRefresh,
  onNotify,
}) => {
  const activeProduct = products.find((p) => p.id === selectedProductId) || products[0] || null;

  const [form, setForm] = useState<ProfitInput>({
    sellingPrice: activeProduct?.sellingPrice ?? 89,
    supplierCost: activeProduct?.supplierCost ?? 26,
    shippingCost: activeProduct?.shippingCost ?? 8.5,
    packagingCost: activeProduct?.packagingCost ?? 2.0,
    marketplaceFeePct: activeProduct?.marketplaceFeePct ?? 15,
    paymentFeePct: activeProduct?.paymentFeePct ?? 0,
    paymentFixedFee: 0.3,
    adSpendPct: activeProduct?.adSpendPct ?? 10,
    returnAllowancePct: activeProduct?.returnAllowancePct ?? 2.5,
    customsPct: activeProduct?.customsPct ?? 3.5,
    taxPct: 0,
  });

  useEffect(() => {
    if (!activeProduct) return;
    const defaults = getMarketplaceFeeDefaults(activeProduct.primaryMarketplace);
    setForm({
      sellingPrice: activeProduct.sellingPrice,
      supplierCost: activeProduct.supplierCost,
      shippingCost: activeProduct.shippingCost,
      packagingCost: activeProduct.packagingCost,
      marketplaceFeePct: activeProduct.marketplaceFeePct,
      paymentFeePct: activeProduct.paymentFeePct,
      paymentFixedFee: defaults.paymentFixedFee,
      adSpendPct: activeProduct.adSpendPct,
      returnAllowancePct: activeProduct.returnAllowancePct,
      customsPct: activeProduct.customsPct,
      taxPct: 0,
    });
  }, [activeProduct?.id]);

  const breakdown = calculateProfitability(form);
  const sensitivityRows = buildPriceSensitivityRows(form);

  const applyMarketplacePreset = (mkt: string) => {
    const d = getMarketplaceFeeDefaults(mkt);
    setForm((prev) => ({
      ...prev,
      marketplaceFeePct: d.marketplaceFeePct,
      paymentFeePct: d.paymentFeePct,
      paymentFixedFee: d.paymentFixedFee,
    }));
  };

  const handleSaveToProduct = async () => {
    if (!activeProduct) return;
    try {
      const resp = await fetch(`/api/products/${activeProduct.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sellingPrice: form.sellingPrice,
          supplierCost: form.supplierCost,
          shippingCost: form.shippingCost,
          packagingCost: form.packagingCost,
          marketplaceFeePct: form.marketplaceFeePct,
          paymentFeePct: form.paymentFeePct,
          adSpendPct: form.adSpendPct,
          returnAllowancePct: form.returnAllowancePct,
          customsPct: form.customsPct,
        }),
      });
      if (!resp.ok) throw new Error('Failed to save economics');
      await onRefresh();
      onNotify(`Updated unit economics on ${activeProduct.sku}`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Save failed', 'error');
    }
  };

  const fields: Array<{ key: keyof ProfitInput; label: string; step?: string }> = [
    { key: 'sellingPrice', label: 'Selling Price ($)', step: '0.50' },
    { key: 'supplierCost', label: 'Supplier Unit Cost ($)', step: '0.50' },
    { key: 'shippingCost', label: 'Shipping & Freight ($)', step: '0.25' },
    { key: 'packagingCost', label: 'Packaging & Prep ($)', step: '0.25' },
    { key: 'marketplaceFeePct', label: 'Marketplace Referral Fee (%)', step: '0.25' },
    { key: 'paymentFeePct', label: 'Payment Processing Fee (%)', step: '0.1' },
    { key: 'paymentFixedFee', label: 'Payment Fixed Fee ($)', step: '0.05' },
    { key: 'adSpendPct', label: 'Ad Spend / TACoS (%)', step: '0.5' },
    { key: 'returnAllowancePct', label: 'Return Reserve (%)', step: '0.5' },
    { key: 'customsPct', label: 'Customs / Import Duty (%)', step: '0.5' },
    { key: 'taxPct', label: 'Sales Tax / VAT Reserve (%)', step: '0.5' },
  ];

  return (
    <div className="space-y-6">
      {/* Top Product Loader + Marketplace Fee Presets */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-3 flex-1 min-w-[240px]">
          <label htmlFor="calc-product-select" className="text-xs font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap">
            Load Product
          </label>
          <select
            id="calc-product-select"
            value={activeProduct?.id || ''}
            onChange={(e) => onSelectProductId(e.target.value)}
            className="w-full max-w-md rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          >
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.sku} · {p.title}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500 dark:text-slate-400">Fee Presets:</span>
          {(['ebay', 'amazon', 'etsy'] as const).map((mkt) => (
            <button
              key={mkt}
              type="button"
              onClick={() => applyMarketplacePreset(mkt)}
              className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium uppercase text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer"
            >
              {mkt}
            </button>
          ))}
          {activeProduct && (
            <button
              type="button"
              onClick={handleSaveToProduct}
              className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-teal-800 whitespace-nowrap cursor-pointer"
            >
              <Save className="h-3.5 w-3.5" aria-hidden="true" />
              Save to Product
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Input Grid */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 lg:col-span-6">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Unit Cost & Expense Inputs
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            All metrics calculate deterministically in real time
          </p>

          <div className="mt-4 grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            {fields.map((f) => (
              <div key={f.key}>
                <label
                  htmlFor={`calc-${f.key}`}
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  {f.label}
                </label>
                <input
                  id={`calc-${f.key}`}
                  type="number"
                  min={0}
                  step={f.step || '0.1'}
                  value={form[f.key]}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      [f.key]: Math.max(0, Number(e.target.value) || 0),
                    }))
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-mono text-sm tabular-nums text-slate-900 focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Ledger Breakdown + Sensitivity */}
        <div className="space-y-6 lg:col-span-6">
          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Profit & Margin Ledger
            </h2>

            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4 border-b border-slate-200 pb-4 dark:border-slate-800">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Net Profit</p>
                <p
                  data-testid="calc-net-profit"
                  className={`mt-1 font-mono text-xl font-semibold tabular-nums ${
                    breakdown.netProfit >= 0
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  ${breakdown.netProfit.toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Net Margin</p>
                <p
                  data-testid="calc-net-margin"
                  className="mt-1 font-mono text-xl font-semibold tabular-nums text-slate-900 dark:text-slate-100"
                >
                  {breakdown.netMarginPct.toFixed(1)}%
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">ROI</p>
                <p className="mt-1 font-mono text-xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                  {breakdown.roiPct.toFixed(1)}%
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Break-Even</p>
                <p className="mt-1 font-mono text-xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                  ${breakdown.breakEvenPrice.toFixed(2)}
                </p>
              </div>
            </div>

            <dl className="mt-4 divide-y divide-slate-100 text-xs dark:divide-slate-800">
              {[
                ['Gross Selling Revenue', breakdown.grossRevenue],
                ['Landed Product Cost (Unit + Ship + Prep + Duty)', -breakdown.landedProductCost],
                ['Marketplace Referral Fee', -breakdown.marketplaceFee],
                ['Payment Processing Fee', -breakdown.paymentFee],
                ['Ad Spend / TACoS Allocation', -breakdown.adSpendCost],
                ['Return & Refund Reserve', -breakdown.returnReserve],
                ['Tax / VAT Reserve', -breakdown.taxCost],
              ].map(([label, amount]) => (
                <div key={String(label)} className="flex items-center justify-between py-2">
                  <dt className="text-slate-600 dark:text-slate-400">{label}</dt>
                  <dd className="font-mono tabular-nums font-medium text-slate-900 dark:text-slate-100">
                    {Number(amount) < 0
                      ? `-$${Math.abs(Number(amount)).toFixed(2)}`
                      : `$${Number(amount).toFixed(2)}`}
                  </dd>
                </div>
              ))}
              <div className="flex items-center justify-between py-2.5 font-semibold">
                <dt className="text-slate-900 dark:text-slate-100">Total Cost Burden</dt>
                <dd className="font-mono tabular-nums text-slate-900 dark:text-slate-100">
                  ${breakdown.totalCosts.toFixed(2)}
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
            <div className="border-b border-slate-200 px-5 py-3 dark:border-slate-800">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Price Sensitivity Matrix
              </h3>
            </div>
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
                  <th className="px-4 py-2">Retail Price</th>
                  <th className="px-3 py-2 text-right">Net Profit</th>
                  <th className="px-3 py-2 text-right">Net Margin</th>
                  <th className="px-4 py-2 text-right">ROI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {sensitivityRows.map((row) => (
                  <tr key={row.price}>
                    <td className="px-4 py-2 font-mono tabular-nums font-medium text-slate-900 dark:text-slate-100">
                      ${row.price.toFixed(2)}
                    </td>
                    <td
                      className={`px-3 py-2 text-right font-mono tabular-nums ${
                        row.netProfit >= 0
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      ${row.netProfit.toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      {row.netMarginPct.toFixed(1)}%
                    </td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums">
                      {row.roiPct.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
