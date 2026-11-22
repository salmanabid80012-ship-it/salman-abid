import React, { useState } from 'react';
import { GitCompare, KeyRound, Plus, ShieldAlert, Wrench } from 'lucide-react';
import type {
  AIProviderConfig,
  AITaskAssignment,
  AITaskKey,
  AIUsageLog,
} from '../types/commerce.ts';

interface AIModelHubViewProps {
  providers: AIProviderConfig[];
  taskAssignments: AITaskAssignment[];
  usageLogs: AIUsageLog[];
  onRefresh: () => Promise<void>;
  onNotify: (message: string, tone?: 'success' | 'error') => void;
}

interface CompareResultItem {
  providerId: string;
  providerName: string;
  modelId: string;
  ok: boolean;
  error?: string;
  text: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
}

export const AIModelHubView: React.FC<AIModelHubViewProps> = ({
  providers,
  taskAssignments,
  usageLogs,
  onRefresh,
  onNotify,
}) => {
  const [credentialTarget, setCredentialTarget] = useState<string | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [testingId, setTestingId] = useState<string | null>(null);

  const [showAddCustom, setShowAddCustom] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customBaseUrl, setCustomBaseUrl] = useState('');
  const [customModel, setCustomModel] = useState('');
  const [customSpendLimit, setCustomSpendLimit] = useState(25);

  const [comparePrompt, setComparePrompt] = useState(
    'Evaluate market positioning, target buyer objections, and 3 SEO keyword angles for a Full-Grain Chestnut Leather 15" Laptop Satchel priced at $138 on Etsy US.'
  );
  const [compareTaskKey, setCompareTaskKey] = useState<AITaskKey>('product_research');
  const [compareTargets, setCompareTargets] = useState<Array<{ providerId: string; modelId: string }>>([
    { providerId: 'gemini', modelId: 'gemini-4-hydrogen' },
    { providerId: 'gemini', modelId: 'gemini-4-neon' },
  ]);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [compareResults, setCompareResults] = useState<CompareResultItem[]>([]);

  const updateProvider = async (id: string, patch: Partial<AIProviderConfig>) => {
    try {
      const resp = await fetch(`/api/ai/providers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!resp.ok) throw new Error('Update failed');
      await onRefresh();
      onNotify('Updated AI provider configuration');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Update failed', 'error');
    }
  };

  const saveProviderKey = async (id: string) => {
    if (apiKeyInput.trim().length < 8) {
      onNotify('API key must be at least 8 characters.', 'error');
      return;
    }
    try {
      const resp = await fetch(`/api/ai/providers/${id}/credentials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: apiKeyInput.trim() }),
      });
      const data = (await resp.json()) as { error?: string };
      if (!resp.ok) throw new Error(data.error || 'Failed to save API key');
      setApiKeyInput('');
      setCredentialTarget(null);
      await onRefresh();
      onNotify('Third-party AI API key encrypted and stored on backend');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Save failed', 'error');
    }
  };

  const testProvider = async (id: string) => {
    setTestingId(id);
    try {
      const resp = await fetch(`/api/ai/providers/${id}/test`, { method: 'POST' });
      const data = (await resp.json()) as { ok: boolean; message: string };
      await onRefresh();
      onNotify(data.message, data.ok ? 'success' : 'error');
    } catch {
      onNotify('Provider test failed', 'error');
    } finally {
      setTestingId(null);
    }
  };

  const addCustomProvider = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const resp = await fetch('/api/ai/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: customName,
          baseUrl: customBaseUrl,
          defaultModel: customModel,
          availableModels: [customModel],
          monthlySpendLimitUsd: customSpendLimit,
        }),
      });
      const data = (await resp.json()) as { error?: string };
      if (!resp.ok) throw new Error(data.error || 'Failed to add provider');
      setCustomName('');
      setCustomBaseUrl('');
      setCustomModel('');
      setShowAddCustom(false);
      await onRefresh();
      onNotify('Added custom OpenAI-compatible AI endpoint');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Add failed', 'error');
    }
  };

  const updateTaskAssignment = async (
    assignment: AITaskAssignment,
    providerId: string,
    modelId?: string
  ) => {
    const targetProvider = providers.find((p) => p.id === providerId);
    const nextModel = modelId || targetProvider?.defaultModel || assignment.modelId;
    try {
      const resp = await fetch('/api/ai/tasks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...assignment,
          providerId,
          modelId: nextModel,
        }),
      });
      if (!resp.ok) throw new Error('Failed to update task routing');
      await onRefresh();
      onNotify(`Routed "${assignment.label}" to ${targetProvider?.name} (${nextModel})`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Update failed', 'error');
    }
  };

  const toggleCompareTarget = (providerId: string, modelId: string) => {
    const exists = compareTargets.some(
      (t) => t.providerId === providerId && t.modelId === modelId
    );
    if (exists) {
      setCompareTargets(
        compareTargets.filter((t) => !(t.providerId === providerId && t.modelId === modelId))
      );
    } else {
      setCompareTargets([...compareTargets, { providerId, modelId }]);
    }
  };

  const executeConfirmedCompare = async () => {
    setShowConfirmModal(false);
    setComparing(true);
    try {
      const resp = await fetch('/api/ai/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targets: compareTargets,
          prompt: comparePrompt,
          taskKey: compareTaskKey,
          userConfirmed: true,
        }),
      });
      const data = (await resp.json()) as { results?: CompareResultItem[]; error?: string };
      if (!resp.ok) throw new Error(data.error || 'Comparison failed');
      setCompareResults(data.results || []);
      await onRefresh();
      onNotify(`Completed multi-model comparison across ${compareTargets.length} models`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Comparison failed', 'error');
    } finally {
      setComparing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Multi-Provider AI Model Hub
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Manage AI providers, fallback routing, monthly spend caps, and per-task model assignments. All credentials stay server-side.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAddCustom((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3.5 py-2 text-xs font-medium text-white hover:bg-teal-800 whitespace-nowrap cursor-pointer"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Add OpenAI-Compatible Endpoint
        </button>
      </div>

      {showAddCustom && (
        <form
          onSubmit={addCustomProvider}
          className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 space-y-4"
        >
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Register Custom OpenAI-Compatible Endpoint
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <div>
              <label htmlFor="ai-c-name" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Provider Name
              </label>
              <input
                id="ai-c-name"
                required
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="e.g. OpenRouter / vLLM"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
            <div>
              <label htmlFor="ai-c-url" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Base URL
              </label>
              <input
                id="ai-c-url"
                required
                value={customBaseUrl}
                onChange={(e) => setCustomBaseUrl(e.target.value)}
                placeholder="https://openrouter.ai/api/v1"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
            <div>
              <label htmlFor="ai-c-model" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Default Model ID
              </label>
              <input
                id="ai-c-model"
                required
                value={customModel}
                onChange={(e) => setCustomModel(e.target.value)}
                placeholder="qwen/qwen-2.5-72b-instruct"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
            <div>
              <label htmlFor="ai-c-limit" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Monthly Spend Cap ($)
              </label>
              <input
                id="ai-c-limit"
                type="number"
                min={1}
                value={customSpendLimit}
                onChange={(e) => setCustomSpendLimit(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAddCustom(false)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs dark:border-slate-700 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-teal-700 px-4 py-1.5 text-xs font-medium text-white hover:bg-teal-800 cursor-pointer"
            >
              Add Provider
            </button>
          </div>
        </form>
      )}

      {/* Provider Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {providers.map((p) => (
          <div
            key={p.id}
            className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 flex flex-col justify-between"
          >
            <div>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {p.name}
                  </h3>
                  <p className="mt-0.5 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                    {p.connectionStatus} · Spend ${p.currentMonthSpendUsd.toFixed(4)} / $
                    {p.monthlySpendLimitUsd.toFixed(2)}
                  </p>
                </div>
                <label className="inline-flex items-center gap-1.5 text-xs font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={p.enabled}
                    onChange={() => updateProvider(p.id, { enabled: !p.enabled })}
                    aria-label={`Enable ${p.name}`}
                    className="h-4 w-4 rounded border-slate-300 text-teal-700"
                  />
                  <span>{p.enabled ? 'Enabled' : 'Off'}</span>
                </label>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label
                    htmlFor={`model-${p.id}`}
                    className="block text-[11px] font-medium text-slate-500 dark:text-slate-400"
                  >
                    Default Model
                  </label>
                  <select
                    id={`model-${p.id}`}
                    value={p.defaultModel}
                    onChange={(e) => updateProvider(p.id, { defaultModel: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    {p.availableModels.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor={`cap-${p.id}`}
                    className="block text-[11px] font-medium text-slate-500 dark:text-slate-400"
                  >
                    Spend Limit ($/mo)
                  </label>
                  <input
                    id={`cap-${p.id}`}
                    type="number"
                    min={1}
                    value={p.monthlySpendLimitUsd}
                    onChange={(e) =>
                      updateProvider(p.id, {
                        monthlySpendLimitUsd: Math.max(1, Number(e.target.value) || 1),
                      })
                    }
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                <button
                  type="button"
                  onClick={() => updateProvider(p.id, { isDefault: true })}
                  className={`rounded px-2 py-0.5 text-[11px] font-medium cursor-pointer ${
                    p.isDefault
                      ? 'bg-teal-700 text-white'
                      : 'border border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'
                  }`}
                >
                  {p.isDefault ? 'Primary Default' : 'Set Default'}
                </button>
                <button
                  type="button"
                  onClick={() => updateProvider(p.id, { isFallback: !p.isFallback })}
                  className={`rounded px-2 py-0.5 text-[11px] font-medium cursor-pointer ${
                    p.isFallback
                      ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900'
                      : 'border border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'
                  }`}
                >
                  {p.isFallback ? 'Fallback Active' : 'Set Fallback'}
                </button>
              </div>

              {p.type === 'gemini' ? (
                <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                  Credentials managed automatically via server-side environment secret (Settings &gt; Secrets).
                </p>
              ) : (
                <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                  Vault status: {p.hasCredentials ? `Encrypted key (${p.maskedCredential || 'env'})` : 'No API key saved'}
                </p>
              )}

              {p.lastError && (
                <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">{p.lastError}</p>
              )}
            </div>

            <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
              {p.type !== 'gemini' && credentialTarget === p.id ? (
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder={`Enter ${p.name} API key`}
                    className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={() => saveProviderKey(p.id)}
                    className="rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-medium text-white cursor-pointer"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCredentialTarget(null);
                      setApiKeyInput('');
                    }}
                    className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs dark:border-slate-700 cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  {p.type !== 'gemini' && (
                    <button
                      type="button"
                      onClick={() => setCredentialTarget(p.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
                      {p.hasCredentials ? 'Rotate Key' : 'Set API Key'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => testProvider(p.id)}
                    disabled={testingId === p.id}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    <Wrench className="h-3.5 w-3.5" aria-hidden="true" />
                    {testingId === p.id ? 'Testing...' : 'Test Connection'}
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* 12 AI Task Assignments */}
      <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
        <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Per-Task AI Model Routing (12 Commerce Workflows)
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Assign the optimal provider and model for each research, scoring, and copywriting workflow
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
                <th className="px-5 py-2.5">Workflow Task</th>
                <th className="px-3 py-2.5">Provider</th>
                <th className="px-5 py-2.5">Model</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {taskAssignments.map((task) => {
                const selectedProv =
                  providers.find((p) => p.id === task.providerId) || providers[0];
                return (
                  <tr key={task.taskKey}>
                    <td className="px-5 py-2.5">
                      <p className="font-medium text-slate-900 dark:text-slate-100">{task.label}</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {task.description}
                      </p>
                    </td>
                    <td className="px-3 py-2.5">
                      <select
                        aria-label={`Provider for ${task.label}`}
                        value={task.providerId}
                        onChange={(e) => updateTaskAssignment(task, e.target.value)}
                        className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                      >
                        {providers.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-5 py-2.5">
                      <select
                        aria-label={`Model for ${task.label}`}
                        value={task.modelId}
                        onChange={(e) =>
                          updateTaskAssignment(task, task.providerId, e.target.value)
                        }
                        className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                      >
                        {(selectedProv?.availableModels || [task.modelId]).map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Multi-Model Side-by-Side Comparison */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Multi-Model Side-by-Side Comparison
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Submit the same commerce prompt across multiple models to compare response quality, speed, and cost
            </p>
          </div>
          <button
            type="button"
            disabled={comparing || compareTargets.length < 2}
            onClick={() => setShowConfirmModal(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-4 py-2 text-xs font-medium text-white hover:bg-teal-800 disabled:opacity-50 whitespace-nowrap cursor-pointer"
          >
            <GitCompare className="h-3.5 w-3.5" aria-hidden="true" />
            {comparing ? 'Running Comparison...' : `Compare ${compareTargets.length} Models`}
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="lg:col-span-5 space-y-2">
            <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
              Select 2 or more models
            </p>
            <div className="max-h-48 overflow-y-auto space-y-1.5 rounded-lg border border-slate-200 p-2.5 dark:border-slate-800">
              {providers.flatMap((p) =>
                p.availableModels.slice(0, 3).map((m) => {
                  const checked = compareTargets.some(
                    (t) => t.providerId === p.id && t.modelId === m
                  );
                  return (
                    <label
                      key={`${p.id}-${m}`}
                      className="flex items-center justify-between rounded px-2 py-1 text-xs hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      <span>
                        {p.name} · <span className="font-mono">{m}</span>
                      </span>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleCompareTarget(p.id, m)}
                        className="h-3.5 w-3.5 rounded border-slate-300 text-teal-700"
                      />
                    </label>
                  );
                })
              )}
            </div>
          </div>

          <div className="lg:col-span-7 space-y-3">
            <div className="flex items-center justify-between">
              <label htmlFor="compare-prompt" className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Evaluation Prompt
              </label>
              <select
                aria-label="Comparison task type"
                value={compareTaskKey}
                onChange={(e) => setCompareTaskKey(e.target.value as AITaskKey)}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                {taskAssignments.map((t) => (
                  <option key={t.taskKey} value={t.taskKey}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <textarea
              id="compare-prompt"
              rows={4}
              value={comparePrompt}
              onChange={(e) => setComparePrompt(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white p-3 text-sm text-slate-900 focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>
        </div>

        {compareResults.length > 0 && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {compareResults.map((res) => (
              <div
                key={`${res.providerId}-${res.modelId}`}
                className="rounded-lg border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/40"
              >
                <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-2 dark:border-slate-700">
                  <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    {res.providerName} · <span className="font-mono">{res.modelId}</span>
                  </p>
                  <p className="font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                    {res.latencyMs}ms · {res.inputTokens + res.outputTokens} tok · $
                    {res.estimatedCostUsd.toFixed(5)}
                  </p>
                </div>
                {res.ok ? (
                  <p className="mt-2.5 whitespace-pre-wrap text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                    {res.text}
                  </p>
                ) : (
                  <p className="mt-2.5 text-xs text-rose-600 dark:text-rose-400">{res.error}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Confirmation Modal for Multi-Model Comparison */}
      {showConfirmModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-compare-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-lg dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-start gap-3">
              <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <h3 id="confirm-compare-title" className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Confirm Multi-Model Execution
                </h3>
                <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  You are about to send this prompt simultaneously to{' '}
                  <strong>{compareTargets.length} AI models</strong> (
                  {compareTargets.map((t) => t.modelId).join(', ')}). This will incur token usage across each selected provider.
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-medium text-slate-700 dark:border-slate-700 dark:text-slate-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeConfirmedCompare}
                className="rounded-lg bg-teal-700 px-4 py-2 text-xs font-medium text-white hover:bg-teal-800 cursor-pointer"
              >
                Confirm & Run Comparison
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Recent AI Usage Logs */}
      <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
        <div className="border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            AI Token & Cost Telemetry Log
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
                <th className="px-5 py-2">Provider / Model</th>
                <th className="px-3 py-2">Task</th>
                <th className="px-3 py-2 text-right">Tokens</th>
                <th className="px-3 py-2 text-right">Latency</th>
                <th className="px-3 py-2 text-right">Est. Cost</th>
                <th className="px-5 py-2 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {usageLogs.slice(0, 10).map((log) => (
                <tr key={log.id}>
                  <td className="px-5 py-2">
                    {log.providerName} · <span className="font-mono">{log.modelId}</span>
                  </td>
                  <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{log.taskKey}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    {log.inputTokens + log.outputTokens}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">{log.latencyMs}ms</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    ${log.estimatedCostUsd.toFixed(5)}
                  </td>
                  <td className="px-5 py-2 text-right">
                    {log.status === 'success' ? 'Success' : 'Error'}
                  </td>
                </tr>
              ))}
              {usageLogs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-5 text-center text-slate-500">
                    No AI invocations logged yet.
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
