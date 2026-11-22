import React, { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type {
  AIProviderConfig,
  MarketplaceConnector,
  NavSection,
  SupplierConnector,
} from '../types/commerce.ts';

interface IntegrationsViewProps {
  suppliers: SupplierConnector[];
  marketplaces: MarketplaceConnector[];
  aiProviders: AIProviderConfig[];
  onRefresh: () => Promise<void>;
  onNavigate: (section: NavSection) => void;
  onNotify: (message: string, tone?: 'success' | 'error') => void;
}

export const IntegrationsView: React.FC<IntegrationsViewProps> = ({
  suppliers,
  marketplaces,
  aiProviders,
  onRefresh,
  onNavigate,
  onNotify,
}) => {
  const [testingAll, setTestingAll] = useState(false);

  const testConnector = async (kind: 'suppliers' | 'marketplaces' | 'ai/providers', id: string) => {
    try {
      const resp = await fetch(`/api/${kind}/${id}/test`, { method: 'POST' });
      const data = (await resp.json()) as { ok: boolean; message: string };
      await onRefresh();
      onNotify(data.message, data.ok ? 'success' : 'error');
    } catch {
      onNotify('Diagnostics probe failed', 'error');
    }
  };

  const runHealthSweep = async () => {
    setTestingAll(true);
    try {
      const resp = await fetch('/api/health');
      const data = (await resp.json()) as { ok: boolean; timestamp: string };
      onNotify(
        data.ok
          ? `Backend API healthy (${new Date(data.timestamp).toLocaleTimeString()})`
          : 'Backend health check failed',
        data.ok ? 'success' : 'error'
      );
    } finally {
      setTestingAll(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            API & Integrations Directory
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Unified view of supplier, marketplace, and AI endpoints. All credentials stay encrypted server-side.
          </p>
        </div>
        <button
          type="button"
          onClick={runHealthSweep}
          disabled={testingAll}
          className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3.5 py-2 text-xs font-medium text-white hover:bg-teal-800 cursor-pointer"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          Verify Backend API
        </button>
      </div>

      {/* Unified Connectors Table */}
      <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
                <th className="px-5 py-3">Integration</th>
                <th className="px-3 py-3">Domain</th>
                <th className="px-3 py-3">Endpoint</th>
                <th className="px-3 py-3">Credential Status</th>
                <th className="px-3 py-3">Connection</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {suppliers.map((s) => (
                <tr key={`sup-${s.id}`}>
                  <td className="px-5 py-3 font-medium text-slate-900 dark:text-slate-100">
                    {s.name}
                  </td>
                  <td className="px-3 py-3 text-slate-600 dark:text-slate-400">Supplier</td>
                  <td className="px-3 py-3 font-mono text-[11px] text-slate-500 truncate max-w-[220px]">
                    {s.baseUrl}
                  </td>
                  <td className="px-3 py-3 font-mono">
                    {s.hasCredentials ? s.maskedCredential : 'Unconfigured'}
                  </td>
                  <td className="px-3 py-3">{s.connectionStatus}</td>
                  <td className="px-5 py-3 text-right space-x-2 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => testConnector('suppliers', s.id)}
                      className="rounded border border-slate-200 px-2.5 py-1 text-xs hover:bg-slate-50 dark:border-slate-700 cursor-pointer"
                    >
                      Test
                    </button>
                    <button
                      type="button"
                      onClick={() => onNavigate('suppliers')}
                      className="text-teal-700 hover:underline dark:text-teal-400 cursor-pointer"
                    >
                      Configure
                    </button>
                  </td>
                </tr>
              ))}
              {marketplaces.map((m) => (
                <tr key={`mkt-${m.id}`}>
                  <td className="px-5 py-3 font-medium text-slate-900 dark:text-slate-100">
                    {m.name}
                  </td>
                  <td className="px-3 py-3 text-slate-600 dark:text-slate-400">Marketplace</td>
                  <td className="px-3 py-3 font-mono text-[11px] text-slate-500 truncate max-w-[220px]">
                    {m.baseUrl}
                  </td>
                  <td className="px-3 py-3 font-mono">
                    {m.hasCredentials ? m.maskedCredential : 'Unconfigured'}
                  </td>
                  <td className="px-3 py-3">{m.connectionStatus}</td>
                  <td className="px-5 py-3 text-right space-x-2 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => testConnector('marketplaces', m.id)}
                      className="rounded border border-slate-200 px-2.5 py-1 text-xs hover:bg-slate-50 dark:border-slate-700 cursor-pointer"
                    >
                      Test
                    </button>
                    <button
                      type="button"
                      onClick={() => onNavigate('marketplaces')}
                      className="text-teal-700 hover:underline dark:text-teal-400 cursor-pointer"
                    >
                      Configure
                    </button>
                  </td>
                </tr>
              ))}
              {aiProviders.map((a) => (
                <tr key={`ai-${a.id}`}>
                  <td className="px-5 py-3 font-medium text-slate-900 dark:text-slate-100">
                    {a.name}
                  </td>
                  <td className="px-3 py-3 text-slate-600 dark:text-slate-400">AI Provider</td>
                  <td className="px-3 py-3 font-mono text-[11px] text-slate-500 truncate max-w-[220px]">
                    {a.baseUrl}
                  </td>
                  <td className="px-3 py-3 font-mono">
                    {a.credentialSource === 'server_env'
                      ? 'Server Env Secret'
                      : a.hasCredentials
                        ? a.maskedCredential || 'Encrypted'
                        : 'Unconfigured'}
                  </td>
                  <td className="px-3 py-3">{a.connectionStatus}</td>
                  <td className="px-5 py-3 text-right space-x-2 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => testConnector('ai/providers', a.id)}
                      className="rounded border border-slate-200 px-2.5 py-1 text-xs hover:bg-slate-50 dark:border-slate-700 cursor-pointer"
                    >
                      Test
                    </button>
                    <button
                      type="button"
                      onClick={() => onNavigate('ai-hub')}
                      className="text-teal-700 hover:underline dark:text-teal-400 cursor-pointer"
                    >
                      Configure
                    </button>
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
