import React, { useEffect, useState } from 'react';
import { KeyRound, Plus, Search, Wrench } from 'lucide-react';
import { STANDARD_CATEGORIES } from '../data/catalogConstants.ts';
import type { SupplierConnector } from '../types/commerce.ts';

interface SupplierCatalogItem {
  externalId: string;
  supplierId: string;
  supplierName: string;
  title: string;
  category: string;
  unitCost: number;
  shippingCost: number;
  estimatedDaysMin: number;
  estimatedDaysMax: number;
  stockCount: number | null;
  specifications: Record<string, string> | null;
  supportsInventory: boolean;
  supportsLiveShipping: boolean;
  supportsSpecs: boolean;
}

interface SupplierHubViewProps {
  suppliers: SupplierConnector[];
  onRefresh: () => Promise<void>;
  onNotify: (message: string, tone?: 'success' | 'error') => void;
}

export const SupplierHubView: React.FC<SupplierHubViewProps> = ({
  suppliers,
  onRefresh,
  onNotify,
}) => {
  const [credentialTarget, setCredentialTarget] = useState<string | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [testingId, setTestingId] = useState<string | null>(null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newAuthHeader, setNewAuthHeader] = useState('Authorization');
  const [newCaps, setNewCaps] = useState({
    supportsSearch: true,
    supportsCostLookup: true,
    supportsLiveShipping: false,
    supportsInventory: false,
    supportsSpecs: false,
    supportsOrderSync: false,
  });

  const [catalogQuery, setCatalogQuery] = useState('');
  const [catalogCategory, setCatalogCategory] = useState('all');
  const [catalogItems, setCatalogItems] = useState<SupplierCatalogItem[]>([]);
  const [searchingCatalog, setSearchingCatalog] = useState(false);

  const fetchCatalog = async () => {
    setSearchingCatalog(true);
    try {
      const qs = new URLSearchParams({
        q: catalogQuery,
        category: catalogCategory,
      });
      const resp = await fetch(`/api/suppliers/catalog?${qs.toString()}`);
      const data = (await resp.json()) as { items: SupplierCatalogItem[] };
      setCatalogItems(data.items || []);
    } catch {
      onNotify('Failed to query supplier catalogs', 'error');
    } finally {
      setSearchingCatalog(false);
    }
  };

  useEffect(() => {
    fetchCatalog();
  }, [suppliers.length]);

  const toggleEnabled = async (sup: SupplierConnector) => {
    try {
      const resp = await fetch(`/api/suppliers/${sup.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !sup.enabled }),
      });
      if (!resp.ok) throw new Error('Update failed');
      await onRefresh();
      onNotify(`${sup.name} ${!sup.enabled ? 'enabled' : 'disabled'}`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Update failed', 'error');
    }
  };

  const saveCredentials = async (id: string) => {
    if (apiKeyInput.trim().length < 6) {
      onNotify('Enter an API credential of at least 6 characters.', 'error');
      return;
    }
    try {
      const resp = await fetch(`/api/suppliers/${id}/credentials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: apiKeyInput.trim() }),
      });
      const data = (await resp.json()) as { error?: string };
      if (!resp.ok) throw new Error(data.error || 'Failed to save credential');
      setApiKeyInput('');
      setCredentialTarget(null);
      await onRefresh();
      onNotify('Supplier API credential encrypted and saved on backend');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Save failed', 'error');
    }
  };

  const testConnection = async (id: string) => {
    setTestingId(id);
    try {
      const resp = await fetch(`/api/suppliers/${id}/test`, { method: 'POST' });
      const data = (await resp.json()) as { ok: boolean; message: string };
      await onRefresh();
      onNotify(data.message, data.ok ? 'success' : 'error');
    } catch {
      onNotify('Connection test failed', 'error');
    } finally {
      setTestingId(null);
    }
  };

  const addCustomSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const resp = await fetch('/api/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName,
          baseUrl: newUrl,
          authHeaderName: newAuthHeader,
          capabilities: newCaps,
        }),
      });
      const data = (await resp.json()) as { error?: string };
      if (!resp.ok) throw new Error(data.error || 'Failed to add supplier');
      setNewName('');
      setNewUrl('');
      setShowAddModal(false);
      await onRefresh();
      onNotify('Added custom supplier connector');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Add failed', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Supplier Connectors & Capability Matrix
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Each connector declares its true supported API capabilities; unsupported data is marked explicitly.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAddModal((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3.5 py-2 text-xs font-medium text-white hover:bg-teal-800 whitespace-nowrap cursor-pointer"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Add Custom Supplier
        </button>
      </div>

      {showAddModal && (
        <form
          onSubmit={addCustomSupplier}
          className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 space-y-4"
        >
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Register Custom Supplier REST Connector
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="sup-new-name" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Supplier Name
              </label>
              <input
                id="sup-new-name"
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Spocket EU"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
            <div>
              <label htmlFor="sup-new-url" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                API Base URL (HTTPS)
              </label>
              <input
                id="sup-new-url"
                required
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder="https://api.supplier.com/v1"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
            <div>
              <label htmlFor="sup-new-hdr" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Auth Header Name
              </label>
              <input
                id="sup-new-hdr"
                value={newAuthHeader}
                onChange={(e) => setNewAuthHeader(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-4 text-xs">
            {(
              [
                ['supportsSearch', 'Catalog Search'],
                ['supportsCostLookup', 'Cost Lookup'],
                ['supportsLiveShipping', 'Live Shipping'],
                ['supportsInventory', 'Live Stock'],
                ['supportsSpecs', 'Product Specs'],
                ['supportsOrderSync', 'Order Sync'],
              ] as const
            ).map(([k, label]) => (
              <label key={k} className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newCaps[k]}
                  onChange={(e) => setNewCaps({ ...newCaps, [k]: e.target.checked })}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-teal-700"
                />
                <span>{label}</span>
              </label>
            ))}
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAddModal(false)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 dark:border-slate-700 dark:text-slate-300 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-teal-700 px-4 py-1.5 text-xs font-medium text-white hover:bg-teal-800 cursor-pointer"
            >
              Save Connector
            </button>
          </div>
        </form>
      )}

      {/* Supplier Cards */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {suppliers.map((sup) => (
          <div
            key={sup.id}
            className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 flex flex-col justify-between"
          >
            <div>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {sup.name}
                  </h3>
                  <p className="mt-0.5 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                    Status: {sup.connectionStatus} · {sup.hasCredentials ? `Key ${sup.maskedCredential}` : 'No credentials'}
                  </p>
                </div>
                <label className="inline-flex items-center gap-1.5 text-xs font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sup.enabled}
                    onChange={() => toggleEnabled(sup)}
                    aria-label={`Enable ${sup.name}`}
                    className="h-4 w-4 rounded border-slate-300 text-teal-700"
                  />
                  <span>{sup.enabled ? 'Enabled' : 'Disabled'}</span>
                </label>
              </div>

              <p className="mt-2.5 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                {sup.notes}
              </p>

              <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Declared Capabilities
                </p>
                <div className="mt-2 grid grid-cols-2 gap-y-1 text-xs">
                  <span>Catalog Search: {sup.capabilities.supportsSearch ? 'Supported' : 'Unsupported'}</span>
                  <span>Cost Lookup: {sup.capabilities.supportsCostLookup ? 'Supported' : 'Unsupported'}</span>
                  <span>Live Shipping: {sup.capabilities.supportsLiveShipping ? 'Supported' : 'Unsupported'}</span>
                  <span>Live Stock: {sup.capabilities.supportsInventory ? 'Supported' : 'Unsupported'}</span>
                  <span>Specs: {sup.capabilities.supportsSpecs ? 'Supported' : 'Unsupported'}</span>
                  <span>Order Sync: {sup.capabilities.supportsOrderSync ? 'Supported' : 'Unsupported'}</span>
                </div>
              </div>

              {sup.lastError && (
                <p className="mt-3 text-xs text-amber-700 dark:text-amber-400">{sup.lastError}</p>
              )}
            </div>

            <div className="mt-4 space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
              {credentialTarget === sup.id ? (
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder="Enter supplier API token"
                    className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={() => saveCredentials(sup.id)}
                    className="rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-800 whitespace-nowrap cursor-pointer"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCredentialTarget(null);
                      setApiKeyInput('');
                    }}
                    className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300 cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCredentialTarget(sup.id)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
                    {sup.hasCredentials ? 'Update Key' : 'Add Credentials'}
                  </button>
                  <button
                    type="button"
                    onClick={() => testConnection(sup.id)}
                    disabled={testingId === sup.id}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    <Wrench className="h-3.5 w-3.5" aria-hidden="true" />
                    {testingId === sup.id ? 'Testing...' : 'Test Connection'}
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Live Supplier Catalog Search & Comparison */}
      <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Multi-Supplier Catalog Search & Comparison
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Compare unit costs, shipping speed, and declared stock availability across enabled suppliers
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Filter catalog category"
              value={catalogCategory}
              onChange={(e) => setCatalogCategory(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="all">All Categories</option>
              {STANDARD_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={catalogQuery}
              onChange={(e) => setCatalogQuery(e.target.value)}
              placeholder="Search SKU or product..."
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
            <button
              type="button"
              onClick={fetchCatalog}
              disabled={searchingCatalog}
              className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-800 cursor-pointer"
            >
              <Search className="h-3.5 w-3.5" aria-hidden="true" />
              Search
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
                <th className="px-5 py-2.5">Product</th>
                <th className="px-3 py-2.5">Supplier</th>
                <th className="px-3 py-2.5 text-right">Unit Cost</th>
                <th className="px-3 py-2.5 text-right">Shipping</th>
                <th className="px-3 py-2.5 text-right">Delivery ETA</th>
                <th className="px-5 py-2.5 text-right">Stock</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {catalogItems.slice(0, 18).map((item) => (
                <tr key={item.externalId}>
                  <td className="px-5 py-2.5">
                    <p className="font-medium text-slate-900 dark:text-slate-100">{item.title}</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">{item.category}</p>
                  </td>
                  <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">{item.supplierName}</td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums">${item.unitCost.toFixed(2)}</td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                    {item.supportsLiveShipping ? `$${item.shippingCost.toFixed(2)}` : 'Not supported'}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                    {item.supportsLiveShipping ? `${item.estimatedDaysMin}-${item.estimatedDaysMax}d` : 'Not supported'}
                  </td>
                  <td className="px-5 py-2.5 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400">
                    {item.supportsInventory && item.stockCount !== null ? item.stockCount : 'Not supported'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
