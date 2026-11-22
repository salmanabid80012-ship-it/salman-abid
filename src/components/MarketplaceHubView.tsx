import React, { useState } from 'react';
import { KeyRound, Lock, Plus, Search, ShieldCheck } from 'lucide-react';
import { TARGET_COUNTRIES } from '../data/catalogConstants.ts';
import type { MarketplaceBenchmark, MarketplaceConnector } from '../types/commerce.ts';

interface MarketplaceHubViewProps {
  marketplaces: MarketplaceConnector[];
  globalPublishingAllowed: boolean;
  onRefresh: () => Promise<void>;
  onNotify: (message: string, tone?: 'success' | 'error') => void;
}

export const MarketplaceHubView: React.FC<MarketplaceHubViewProps> = ({
  marketplaces,
  globalPublishingAllowed,
  onRefresh,
  onNotify,
}) => {
  const [credentialTarget, setCredentialTarget] = useState<string | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [testingId, setTestingId] = useState<string | null>(null);

  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newFee, setNewFee] = useState(12);

  const [researchQuery, setResearchQuery] = useState('leather messenger bag');
  const [researchCountry, setResearchCountry] = useState('US');
  const [benchmarks, setBenchmarks] = useState<MarketplaceBenchmark[]>([]);

  const saveCredentials = async (id: string) => {
    if (apiKeyInput.trim().length < 6) {
      onNotify('Enter a token of at least 6 characters.', 'error');
      return;
    }
    try {
      const resp = await fetch(`/api/marketplaces/${id}/credentials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: apiKeyInput.trim() }),
      });
      const data = (await resp.json()) as { error?: string };
      if (!resp.ok) throw new Error(data.error || 'Failed to save credentials');
      setApiKeyInput('');
      setCredentialTarget(null);
      await onRefresh();
      onNotify('Marketplace credential stored in encrypted backend vault');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Save failed', 'error');
    }
  };

  const testConnection = async (id: string) => {
    setTestingId(id);
    try {
      const resp = await fetch(`/api/marketplaces/${id}/test`, { method: 'POST' });
      const data = (await resp.json()) as { ok: boolean; message: string };
      await onRefresh();
      onNotify(data.message, data.ok ? 'success' : 'error');
    } catch {
      onNotify('Connection test failed', 'error');
    } finally {
      setTestingId(null);
    }
  };

  const toggleEnabled = async (m: MarketplaceConnector) => {
    await fetch(`/api/marketplaces/${m.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !m.enabled }),
    });
    await onRefresh();
    onNotify(`${m.name} ${!m.enabled ? 'enabled' : 'disabled'}`);
  };

  const togglePublishing = async (m: MarketplaceConnector) => {
    if (!globalPublishingAllowed && !m.publishingEnabled) {
      onNotify(
        'Global Marketplace Publishing is locked in Settings. Unlock it in Settings before enabling connector publishing.',
        'error'
      );
      return;
    }
    await fetch(`/api/marketplaces/${m.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ publishingEnabled: !m.publishingEnabled }),
    });
    await onRefresh();
    onNotify(
      `${m.name} publishing ${!m.publishingEnabled ? 'authorized for manual exports' : 'locked'}`
    );
  };

  const addMarketplace = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const resp = await fetch('/api/marketplaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName,
          baseUrl: newUrl,
          defaultFeePct: Number(newFee) || 12,
        }),
      });
      const data = (await resp.json()) as { error?: string };
      if (!resp.ok) throw new Error(data.error || 'Failed to add marketplace');
      setNewName('');
      setNewUrl('');
      setShowAdd(false);
      await onRefresh();
      onNotify('Added custom marketplace connector (publishing disabled by default)');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Add failed', 'error');
    }
  };

  const runMarketResearch = async () => {
    try {
      const qs = new URLSearchParams({ q: researchQuery, country: researchCountry });
      const resp = await fetch(`/api/marketplaces/research?${qs.toString()}`);
      const data = (await resp.json()) as { benchmarks: MarketplaceBenchmark[] };
      setBenchmarks(data.benchmarks || []);
    } catch {
      onNotify('Marketplace research query failed', 'error');
    }
  };

  return (
    <div className="space-y-6">
      {/* Safety Governance Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start gap-3">
          {globalPublishingAllowed ? (
            <ShieldCheck className="mt-0.5 h-5 w-5 text-amber-600 shrink-0" aria-hidden="true" />
          ) : (
            <Lock className="mt-0.5 h-5 w-5 text-teal-700 dark:text-teal-400 shrink-0" aria-hidden="true" />
          )}
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Marketplace Publishing Safety Lock:{' '}
              {globalPublishingAllowed ? 'Unlocked (Per-Listing Confirmation Required)' : 'Disabled by Default'}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              No listing is ever published and no supplier order is ever placed without explicit seller authorization.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowAdd((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3.5 py-2 text-xs font-medium text-white hover:bg-teal-800 whitespace-nowrap cursor-pointer"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Add Custom Marketplace
        </button>
      </div>

      {showAdd && (
        <form
          onSubmit={addMarketplace}
          className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 space-y-4"
        >
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Add Custom Marketplace Connector
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="mkt-name" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Marketplace Name
              </label>
              <input
                id="mkt-name"
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Walmart Marketplace"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
            <div>
              <label htmlFor="mkt-url" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                API Endpoint URL
              </label>
              <input
                id="mkt-url"
                required
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder="https://marketplace.walmartapis.com/v3"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
            <div>
              <label htmlFor="mkt-fee" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Default Referral Fee (%)
              </label>
              <input
                id="mkt-fee"
                type="number"
                step="0.25"
                value={newFee}
                onChange={(e) => setNewFee(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAdd(false)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs dark:border-slate-700 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-teal-700 px-4 py-1.5 text-xs font-medium text-white hover:bg-teal-800 cursor-pointer"
            >
              Save Marketplace
            </button>
          </div>
        </form>
      )}

      {/* Marketplace Cards */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {marketplaces.map((m) => (
          <div
            key={m.id}
            className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 flex flex-col justify-between"
          >
            <div>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {m.name}
                  </h3>
                  <p className="mt-0.5 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                    {m.connectionStatus} · Fee {m.defaultFeePct}% · Countries: {m.countries.join(', ')}
                  </p>
                </div>
                <label className="inline-flex items-center gap-1.5 text-xs font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={m.enabled}
                    onChange={() => toggleEnabled(m)}
                    aria-label={`Enable ${m.name}`}
                    className="h-4 w-4 rounded border-slate-300 text-teal-700"
                  />
                  <span>{m.enabled ? 'Active' : 'Off'}</span>
                </label>
              </div>

              <p className="mt-2.5 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                {m.policyNote}
              </p>

              <div className="mt-3 grid grid-cols-2 gap-1 text-xs text-slate-700 dark:text-slate-300">
                <span>Product Search: {m.capabilities.supportsProductSearch ? 'Yes' : 'No'}</span>
                <span>Price Trends: {m.capabilities.supportsPricingTrends ? 'Yes' : 'No'}</span>
                <span>Category Fees: {m.capabilities.supportsCategoryFees ? 'Yes' : 'No'}</span>
                <span>Draft Prep: {m.capabilities.supportsDraftPreparation ? 'Yes' : 'No'}</span>
              </div>

              <div className="mt-3 flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-800/40">
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  Direct Publishing
                </span>
                <button
                  type="button"
                  onClick={() => togglePublishing(m)}
                  className={`rounded px-2 py-0.5 text-[11px] font-medium cursor-pointer ${
                    m.publishingEnabled
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                      : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
                  }`}
                >
                  {m.publishingEnabled ? 'Authorized' : 'Disabled (Safe)'}
                </button>
              </div>
              {m.lastError && (
                <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">{m.lastError}</p>
              )}
            </div>

            <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
              {credentialTarget === m.id ? (
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder="OAuth / Seller API token"
                    className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={() => saveCredentials(m.id)}
                    className="rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-medium text-white cursor-pointer"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setCredentialTarget(null)}
                    className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs dark:border-slate-700 cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCredentialTarget(m.id)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
                    {m.hasCredentials ? 'Update Token' : 'Configure API'}
                  </button>
                  <button
                    type="button"
                    onClick={() => testConnection(m.id)}
                    disabled={testingId === m.id}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    {testingId === m.id ? 'Testing...' : 'Test Connection'}
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Marketplace Competitor & Price Research */}
      <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Cross-Marketplace Competitor & Pricing Research
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Compare average prices, price spreads, listing counts, and referral fees
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Target country for marketplace research"
              value={researchCountry}
              onChange={(e) => setResearchCountry(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              {TARGET_COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} · {c.name}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={researchQuery}
              onChange={(e) => setResearchQuery(e.target.value)}
              placeholder="Product keyword..."
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
            <button
              type="button"
              onClick={runMarketResearch}
              className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-teal-800 cursor-pointer"
            >
              <Search className="h-3.5 w-3.5" aria-hidden="true" />
              Analyze Marketplaces
            </button>
          </div>
        </div>

        {benchmarks.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
                  <th className="px-5 py-2.5">Marketplace</th>
                  <th className="px-3 py-2.5 text-right">Min Price</th>
                  <th className="px-3 py-2.5 text-right">Avg Price</th>
                  <th className="px-3 py-2.5 text-right">Max Price</th>
                  <th className="px-3 py-2.5 text-right">Competing Listings</th>
                  <th className="px-3 py-2.5 text-right">Est. Monthly Demand</th>
                  <th className="px-5 py-2.5 text-right">Referral Fee</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {benchmarks.map((b) => (
                  <tr key={b.marketplaceId}>
                    <td className="px-5 py-2.5 font-medium text-slate-900 dark:text-slate-100">
                      {b.marketplaceName} ({b.country})
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">${b.minSellingPrice.toFixed(2)}</td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums font-semibold">${b.avgSellingPrice.toFixed(2)}</td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">${b.maxSellingPrice.toFixed(2)}</td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                      {b.activeListingsCount !== null ? b.activeListingsCount : 'Not supported'}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">{b.estimatedMonthlyDemand}</td>
                    <td className="px-5 py-2.5 text-right font-mono tabular-nums">{b.referralFeePct.toFixed(2)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-5 py-6 text-xs text-slate-500 dark:text-slate-400">
            Enter a product keyword above and click Analyze Marketplaces to compare pricing bands and fee structures.
          </p>
        )}
      </div>
    </div>
  );
};
