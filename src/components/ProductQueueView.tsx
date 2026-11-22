import React, { useMemo, useState } from 'react';
import { Check, Download, Trash2, XCircle } from 'lucide-react';
import type { NavSection, ProductRecord, ProductStatus } from '../types/commerce.ts';
import { calculateProfitability } from '../utils/commerceMath.ts';
import { ProductThumbnail } from './ProductThumbnail.tsx';

interface ProductQueueViewProps {
  products: ProductRecord[];
  onRefresh: () => Promise<void>;
  onSelectProduct: (productId: string, section: NavSection) => void;
  onNotify: (message: string, tone?: 'success' | 'error') => void;
}

export const ProductQueueView: React.FC<ProductQueueViewProps> = ({
  products,
  onRefresh,
  onSelectProduct,
  onNotify,
}) => {
  const [statusFilter, setStatusFilter] = useState<'all' | ProductStatus>('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'score' | 'profit' | 'updated'>('score');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const categories = useMemo(
    () => Array.from(new Set(products.map((p) => p.category))).sort(),
    [products]
  );

  const enriched = useMemo(() => {
    return products
      .map((p) => {
        const profit = calculateProfitability({
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
        return { product: p, profit };
      })
      .filter(({ product }) => {
        if (statusFilter !== 'all' && product.status !== statusFilter) return false;
        if (categoryFilter !== 'all' && product.category !== categoryFilter) return false;
        if (
          search.trim() &&
          !product.title.toLowerCase().includes(search.trim().toLowerCase()) &&
          !product.sku.toLowerCase().includes(search.trim().toLowerCase())
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'profit') return b.profit.netProfit - a.profit.netProfit;
        if (sortBy === 'updated') return b.product.updatedAt.localeCompare(a.product.updatedAt);
        return b.product.opportunityScore - a.product.opportunityScore;
      });
  }, [products, statusFilter, categoryFilter, search, sortBy]);

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const applyBulkStatus = async (status: ProductStatus) => {
    if (selectedIds.length === 0) return;
    try {
      const resp = await fetch('/api/products/bulk-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds, status }),
      });
      if (!resp.ok) throw new Error('Bulk update failed');
      setSelectedIds([]);
      await onRefresh();
      onNotify(`Updated ${selectedIds.length} products to ${status.replace('_', ' ')}`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Bulk update failed', 'error');
    }
  };

  const updateOne = async (id: string, status: ProductStatus) => {
    await fetch(`/api/products/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    await onRefresh();
    onNotify(`Product marked as ${status.replace('_', ' ')}`);
  };

  const removeOne = async (id: string, title: string) => {
    await fetch(`/api/products/${id}`, { method: 'DELETE' });
    setSelectedIds((prev) => prev.filter((x) => x !== id));
    await onRefresh();
    onNotify(`Removed "${title}" from queue`);
  };

  const exportCsv = () => {
    const header = [
      'SKU',
      'Title',
      'Category',
      'Status',
      'Country',
      'Marketplace',
      'RetailPrice',
      'SupplierCost',
      'ShippingCost',
      'NetProfit',
      'NetMarginPct',
      'OpportunityScore',
    ];
    const rows = enriched.map(({ product: p, profit }) => [
      p.sku,
      `"${p.title.replace(/"/g, '""')}"`,
      `"${p.category}"`,
      p.status,
      p.targetCountry,
      p.primaryMarketplace,
      p.sellingPrice.toFixed(2),
      p.supplierCost.toFixed(2),
      p.shippingCost.toFixed(2),
      profit.netProfit.toFixed(2),
      profit.netMarginPct.toFixed(1),
      p.opportunityScore,
    ]);
    const csv = [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `commerce-queue-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const statusTabs: Array<{ key: 'all' | ProductStatus; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'awaiting_review', label: 'Awaiting Review' },
    { key: 'shortlisted', label: 'Shortlisted' },
    { key: 'approved', label: 'Approved' },
    { key: 'rejected', label: 'Rejected' },
  ];

  return (
    <div className="space-y-4">
      {/* Filter & Actions Bar */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
            {statusTabs.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setStatusFilter(t.key)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                  statusFilter === t.key
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search title or SKU..."
              aria-label="Search product queue"
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
            <select
              aria-label="Filter by category"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="all">All Categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select
              aria-label="Sort products"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'score' | 'profit' | 'updated')}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="score">Sort: Opportunity Score</option>
              <option value="profit">Sort: Net Profit ($)</option>
              <option value="updated">Sort: Recently Updated</option>
            </select>
            <button
              type="button"
              onClick={exportCsv}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 whitespace-nowrap cursor-pointer"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              Export CSV
            </button>
          </div>
        </div>

        {selectedIds.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-teal-200 bg-teal-50/70 px-3 py-2 text-xs dark:border-teal-900 dark:bg-teal-950/40">
            <span className="font-medium text-teal-900 dark:text-teal-200">
              {selectedIds.length} selected
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => applyBulkStatus('shortlisted')}
                className="rounded bg-white px-2.5 py-1 font-medium text-slate-800 border border-slate-200 cursor-pointer"
              >
                Shortlist Selected
              </button>
              <button
                type="button"
                onClick={() => applyBulkStatus('approved')}
                className="rounded bg-emerald-700 px-2.5 py-1 font-medium text-white cursor-pointer"
              >
                Approve Selected
              </button>
              <button
                type="button"
                onClick={() => applyBulkStatus('rejected')}
                className="rounded bg-rose-700 px-2.5 py-1 font-medium text-white cursor-pointer"
              >
                Reject Selected
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Queue Table */}
      <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
                <th className="px-4 py-3 w-8">
                  <input
                    type="checkbox"
                    aria-label="Select all visible products"
                    checked={enriched.length > 0 && selectedIds.length === enriched.length}
                    onChange={(e) =>
                      setSelectedIds(
                        e.target.checked ? enriched.map((x) => x.product.id) : []
                      )
                    }
                    className="h-3.5 w-3.5 rounded border-slate-300 text-teal-700"
                  />
                </th>
                <th className="px-3 py-3">Product</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3 text-right">Retail</th>
                <th className="px-3 py-3 text-right">Net Profit</th>
                <th className="px-3 py-3 text-right">Margin</th>
                <th className="px-3 py-3 text-right">Score</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {enriched.map(({ product: p, profit }) => (
                <tr key={p.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      aria-label={`Select ${p.title}`}
                      checked={selectedIds.includes(p.id)}
                      onChange={() => toggleSelection(p.id)}
                      className="h-3.5 w-3.5 rounded border-slate-300 text-teal-700"
                    />
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-3">
                      <ProductThumbnail
                        src={p.imageUrl}
                        alt={p.title}
                        category={p.category}
                        className="h-9 w-11"
                      />
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={() => onSelectProduct(p.id, 'research')}
                          className="text-left font-medium text-slate-900 hover:text-teal-700 dark:text-slate-100 dark:hover:text-teal-400 cursor-pointer"
                        >
                          {p.title}
                        </button>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {p.sku} · {p.category} · {p.primaryMarketplace.toUpperCase()} ({p.targetCountry})
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap font-medium text-slate-700 dark:text-slate-300">
                    {p.status.replace('_', ' ')}
                  </td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums">
                    ${p.sellingPrice.toFixed(2)}
                  </td>
                  <td
                    className={`px-3 py-3 text-right font-mono tabular-nums font-medium ${
                      profit.netProfit >= 0
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    ${profit.netProfit.toFixed(2)}
                  </td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums">
                    {profit.netMarginPct.toFixed(1)}%
                  </td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums font-semibold">
                    {p.opportunityScore}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        aria-label={`Approve ${p.title}`}
                        onClick={() => updateOne(p.id, 'approved')}
                        className="rounded p-1.5 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/40 cursor-pointer"
                      >
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Reject ${p.title}`}
                        onClick={() => updateOne(p.id, 'rejected')}
                        className="rounded p-1.5 text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/40 cursor-pointer"
                      >
                        <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete ${p.title}`}
                        onClick={() => removeOne(p.id, p.title)}
                        className="rounded p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {enriched.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-8 text-center text-slate-500">
                    No products match the active queue filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
