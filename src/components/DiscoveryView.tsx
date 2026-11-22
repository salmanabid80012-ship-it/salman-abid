import React, { useState } from 'react';
import { BookmarkPlus, Play, Plus, Trash2, X } from 'lucide-react';
import { STANDARD_CATEGORIES, TARGET_COUNTRIES } from '../data/catalogConstants.ts';
import type {
  DiscoveryConfig,
  MarketplaceConnector,
  NavSection,
  ProductRecord,
  SupplierConnector,
} from '../types/commerce.ts';
import { calculateProfitability } from '../utils/commerceMath.ts';
import { ProductThumbnail } from './ProductThumbnail.tsx';

interface DiscoveryViewProps {
  configs: DiscoveryConfig[];
  customCategories: string[];
  suppliers: SupplierConnector[];
  marketplaces: MarketplaceConnector[];
  defaultDailyTarget: number;
  onRefresh: () => Promise<void>;
  onNotify: (message: string, tone?: 'success' | 'error') => void;
  onSelectProduct: (productId: string, section: NavSection) => void;
}

export const DiscoveryView: React.FC<DiscoveryViewProps> = ({
  configs,
  customCategories,
  suppliers,
  marketplaces,
  defaultDailyTarget,
  onRefresh,
  onNotify,
  onSelectProduct,
}) => {
  const allCategoryChoices = [...STANDARD_CATEGORIES, ...customCategories];

  const [configName, setConfigName] = useState('Custom Multi-Category Discovery');
  const [allCategories, setAllCategories] = useState(true);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([
    'Electronics',
    'Home and Kitchen',
    'Leather Products',
  ]);
  const [keywords, setKeywords] = useState<string[]>(['titanium', 'minimalist', 'wireless']);
  const [keywordInput, setKeywordInput] = useState('');
  const [dailyTarget, setDailyTarget] = useState<number>(defaultDailyTarget || 25);
  const [minCost, setMinCost] = useState<number>(8);
  const [maxCost, setMaxCost] = useState<number>(75);
  const [targetCountries, setTargetCountries] = useState<string[]>(['US', 'UK', 'DE']);
  const [targetMarketplaces, setTargetMarketplaces] = useState<string[]>(['ebay', 'amazon', 'etsy']);
  const [minExpectedProfit, setMinExpectedProfit] = useState<number>(10);
  const [minNetMarginPct, setMinNetMarginPct] = useState<number>(20);
  const [enabledSuppliers, setEnabledSuppliers] = useState<string[]>(
    suppliers.filter((s) => s.enabled).map((s) => s.id)
  );

  const [isRunning, setIsRunning] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastRunResults, setLastRunResults] = useState<{
    discovered: ProductRecord[];
    evaluatedCount: number;
    skippedByFilters: number;
  } | null>(null);

  const toggleItem = (list: string[], setList: (v: string[]) => void, value: string) => {
    setList(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);
  };

  const handleAddKeyword = () => {
    const clean = keywordInput.trim();
    if (!clean) return;
    if (!keywords.includes(clean)) {
      setKeywords([...keywords, clean]);
    }
    setKeywordInput('');
  };

  const loadConfig = (cfg: DiscoveryConfig) => {
    setConfigName(cfg.name);
    setAllCategories(cfg.allCategories);
    setSelectedCategories(cfg.categories);
    setKeywords(cfg.keywords);
    setDailyTarget(cfg.dailyTarget);
    setMinCost(cfg.minCost);
    setMaxCost(cfg.maxCost);
    setTargetCountries(cfg.targetCountries);
    setTargetMarketplaces(cfg.targetMarketplaces);
    setMinExpectedProfit(cfg.minExpectedProfit);
    setMinNetMarginPct(cfg.minNetMarginPct);
    setEnabledSuppliers(cfg.enabledSuppliers);
    onNotify(`Loaded configuration "${cfg.name}"`);
  };

  const buildPayload = (): DiscoveryConfig => ({
    id: `cfg-${Date.now()}`,
    name: configName.trim() || 'Untitled Discovery Config',
    categories: selectedCategories,
    allCategories,
    keywords,
    dailyTarget: Math.max(1, Math.min(500, Number(dailyTarget) || 25)),
    minCost: Math.max(0, Number(minCost) || 0),
    maxCost: Math.max(1, Number(maxCost) || 100),
    targetCountries: targetCountries.length > 0 ? targetCountries : ['US'],
    targetMarketplaces: targetMarketplaces.length > 0 ? targetMarketplaces : ['ebay'],
    minExpectedProfit: Number(minExpectedProfit) || 0,
    minNetMarginPct: Number(minNetMarginPct) || 0,
    enabledSuppliers: enabledSuppliers.length > 0 ? enabledSuppliers : suppliers.map((s) => s.id),
    createdAt: new Date().toISOString(),
  });

  const handleSaveConfig = async () => {
    if (!configName.trim()) {
      onNotify('Please enter a configuration name before saving.', 'error');
      return;
    }
    setIsSaving(true);
    try {
      const resp = await fetch('/api/discovery/configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload()),
      });
      const data = (await resp.json()) as { error?: string };
      if (!resp.ok) throw new Error(data.error || 'Failed to save configuration');
      await onRefresh();
      onNotify(`Saved discovery configuration "${configName.trim()}"`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Save failed', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteConfig = async (id: string) => {
    try {
      await fetch(`/api/discovery/configs/${id}`, { method: 'DELETE' });
      await onRefresh();
      onNotify('Removed saved configuration');
    } catch {
      onNotify('Failed to remove configuration', 'error');
    }
  };

  const handleRunDiscovery = async () => {
    setIsRunning(true);
    try {
      const resp = await fetch('/api/discovery/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload()),
      });
      const data = (await resp.json()) as {
        discovered: ProductRecord[];
        evaluatedCount: number;
        skippedByFilters: number;
        error?: string;
      };
      if (!resp.ok) throw new Error(data.error || 'Discovery run failed');
      setLastRunResults(data);
      await onRefresh();
      onNotify(
        `Discovered ${data.discovered.length} qualifying products (evaluated ${data.evaluatedCount})`
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Discovery run failed', 'error');
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Saved Configs Bar */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Saved Discovery Profiles
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Load or save reusable category, supplier, and margin discovery presets
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSaveConfig}
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 whitespace-nowrap cursor-pointer"
            >
              <BookmarkPlus className="h-3.5 w-3.5" aria-hidden="true" />
              {isSaving ? 'Saving...' : 'Save Configuration'}
            </button>
            <button
              type="button"
              onClick={handleRunDiscovery}
              disabled={isRunning}
              className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-4 py-2 text-xs font-medium text-white hover:bg-teal-800 disabled:opacity-50 whitespace-nowrap cursor-pointer"
            >
              <Play className="h-3.5 w-3.5" aria-hidden="true" />
              {isRunning ? 'Scanning Suppliers...' : 'Run Discovery Scan'}
            </button>
          </div>
        </div>

        {configs.length > 0 && (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {configs.map((cfg) => (
              <div
                key={cfg.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 dark:border-slate-800 dark:bg-slate-800/40"
              >
                <button
                  type="button"
                  onClick={() => loadConfig(cfg)}
                  className="min-w-0 text-left cursor-pointer"
                >
                  <p className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
                    {cfg.name}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {cfg.allCategories ? 'All Categories' : `${cfg.categories.length} categories`} ·{' '}
                    <span className="font-mono tabular-nums">{cfg.dailyTarget}</span>/day · Min{' '}
                    <span className="font-mono tabular-nums">{cfg.minNetMarginPct}%</span>
                  </p>
                </button>
                <button
                  type="button"
                  aria-label={`Delete configuration ${cfg.name}`}
                  onClick={() => handleDeleteConfig(cfg.id)}
                  className="rounded p-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Configuration Form */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left: Category Scope & Keywords */}
        <div className="space-y-6 lg:col-span-7">
          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Universal Category Selection
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Scan all product verticals or isolate specific categories
                </p>
              </div>
              <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-800 dark:text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allCategories}
                  onChange={(e) => setAllCategories(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-teal-700 focus:ring-teal-600"
                />
                Select All Categories
              </label>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
              {allCategoryChoices.map((cat) => {
                const checked = allCategories || selectedCategories.includes(cat);
                return (
                  <label
                    key={cat}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-colors cursor-pointer ${
                      checked
                        ? 'border-teal-600/40 bg-teal-50/60 text-slate-900 dark:border-teal-500/40 dark:bg-teal-950/30 dark:text-slate-100'
                        : 'border-slate-200 bg-white text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={allCategories}
                      onChange={() => toggleItem(selectedCategories, setSelectedCategories, cat)}
                      className="h-3.5 w-3.5 rounded border-slate-300 text-teal-700 focus:ring-teal-600"
                    />
                    <span className="truncate">{cat}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Custom Keywords & Discovery Profile Name
            </h3>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="discovery-config-name"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Configuration Name
                </label>
                <input
                  id="discovery-config-name"
                  type="text"
                  value={configName}
                  onChange={(e) => setConfigName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>

              <div>
                <label
                  htmlFor="discovery-keyword-input"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Add Custom Keyword
                </label>
                <div className="mt-1 flex gap-2">
                  <input
                    id="discovery-keyword-input"
                    type="text"
                    value={keywordInput}
                    onChange={(e) => setKeywordInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddKeyword();
                      }
                    }}
                    placeholder="e.g. ergonomic, anodized"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={handleAddKeyword}
                    aria-label="Add keyword"
                    className="inline-flex items-center rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>

            {keywords.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {keywords.map((kw) => (
                  <button
                    key={kw}
                    type="button"
                    onClick={() => setKeywords(keywords.filter((k) => k !== kw))}
                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
                  >
                    <span>{kw}</span>
                    <X className="h-3 w-3 text-slate-400" aria-hidden="true" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Targets, Costs, Geography & Suppliers */}
        <div className="space-y-6 lg:col-span-5">
          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Targets & Financial Guardrails
            </h3>

            <div className="mt-4 grid grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="daily-target-input"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Daily Discovery Target
                </label>
                <input
                  id="daily-target-input"
                  type="number"
                  min={1}
                  max={500}
                  value={dailyTarget}
                  onChange={(e) => setDailyTarget(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm tabular-nums text-slate-900 focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>

              <div>
                <label
                  htmlFor="min-margin-input"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Min Net Margin (%)
                </label>
                <input
                  id="min-margin-input"
                  type="number"
                  min={0}
                  max={90}
                  value={minNetMarginPct}
                  onChange={(e) => setMinNetMarginPct(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm tabular-nums text-slate-900 focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>

              <div>
                <label
                  htmlFor="min-cost-input"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Min Supplier Cost ($)
                </label>
                <input
                  id="min-cost-input"
                  type="number"
                  min={0}
                  value={minCost}
                  onChange={(e) => setMinCost(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm tabular-nums text-slate-900 focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>

              <div>
                <label
                  htmlFor="max-cost-input"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Max Supplier Cost ($)
                </label>
                <input
                  id="max-cost-input"
                  type="number"
                  min={1}
                  value={maxCost}
                  onChange={(e) => setMaxCost(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm tabular-nums text-slate-900 focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>

              <div className="col-span-2">
                <label
                  htmlFor="min-profit-input"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Minimum Expected Unit Profit ($)
                </label>
                <input
                  id="min-profit-input"
                  type="number"
                  min={0}
                  value={minExpectedProfit}
                  onChange={(e) => setMinExpectedProfit(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm tabular-nums text-slate-900 focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Target Countries, Marketplaces & Suppliers
            </h3>

            <div className="mt-3">
              <p className="text-xs font-medium text-slate-600 dark:text-slate-400">Countries</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {TARGET_COUNTRIES.map((c) => {
                  const active = targetCountries.includes(c.code);
                  return (
                    <button
                      key={c.code}
                      type="button"
                      onClick={() => toggleItem(targetCountries, setTargetCountries, c.code)}
                      className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                        active
                          ? 'border-teal-700 bg-teal-700 text-white'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                      }`}
                    >
                      {c.code}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-4">
              <p className="text-xs font-medium text-slate-600 dark:text-slate-400">Marketplaces</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {marketplaces.map((m) => {
                  const active = targetMarketplaces.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => toggleItem(targetMarketplaces, setTargetMarketplaces, m.id)}
                      className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                        active
                          ? 'border-teal-700 bg-teal-700 text-white'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                      }`}
                    >
                      {m.name.split(' ')[0]}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-4">
              <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
                Enabled Suppliers for Scan
              </p>
              <div className="mt-1.5 space-y-1.5">
                {suppliers.map((s) => {
                  const active = enabledSuppliers.includes(s.id);
                  return (
                    <label
                      key={s.id}
                      className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-xs dark:border-slate-800 cursor-pointer"
                    >
                      <span className="font-medium text-slate-800 dark:text-slate-200">
                        {s.name}
                      </span>
                      <input
                        type="checkbox"
                        checked={active}
                        onChange={() => toggleItem(enabledSuppliers, setEnabledSuppliers, s.id)}
                        className="h-4 w-4 rounded border-slate-300 text-teal-700"
                      />
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Discovery Scan Results */}
      {lastRunResults && (
        <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
          <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Latest Discovery Run Results
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Persisted {lastRunResults.discovered.length} products · Evaluated{' '}
              {lastRunResults.evaluatedCount} catalog items · {lastRunResults.skippedByFilters} filtered
              by cost/margin rules
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
                  <th className="px-5 py-2.5">Product</th>
                  <th className="px-3 py-2.5 text-right">Cost + Ship</th>
                  <th className="px-3 py-2.5 text-right">Est. Retail</th>
                  <th className="px-3 py-2.5 text-right">Net Profit</th>
                  <th className="px-3 py-2.5 text-right">Score</th>
                  <th className="px-5 py-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {lastRunResults.discovered.map((p) => {
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
                    <tr key={p.id}>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <ProductThumbnail
                            src={p.imageUrl}
                            alt={p.title}
                            category={p.category}
                            className="h-9 w-11"
                          />
                          <div>
                            <p className="font-medium text-slate-900 dark:text-slate-100">
                              {p.title}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {p.category} · {p.primarySupplier} · {p.targetCountry}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                        ${(p.supplierCost + p.shippingCost).toFixed(2)}
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                        ${p.sellingPrice.toFixed(2)}
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums font-medium text-emerald-700 dark:text-emerald-400">
                        ${prof.netProfit.toFixed(2)} ({prof.netMarginPct.toFixed(1)}%)
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                        {p.opportunityScore}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => onSelectProduct(p.id, 'research')}
                          className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 cursor-pointer"
                        >
                          Research
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
