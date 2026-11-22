import React, { useState } from 'react';
import { Download, Plus, Save, X } from 'lucide-react';
import { TARGET_COUNTRIES } from '../data/catalogConstants.ts';
import type { AppSettings } from '../types/commerce.ts';

interface SettingsViewProps {
  settings: AppSettings;
  onRefresh: () => Promise<void>;
  onThemeChange: (theme: 'light' | 'dark') => void;
  onNotify: (message: string, tone?: 'success' | 'error') => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  onRefresh,
  onThemeChange,
  onNotify,
}) => {
  const [form, setForm] = useState<AppSettings>(settings);
  const [newCategory, setNewCategory] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const resp = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!resp.ok) throw new Error('Failed to save settings');
      onThemeChange(form.theme);
      await onRefresh();
      onNotify('Saved workspace settings');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const addCustomCategory = () => {
    const clean = newCategory.trim();
    if (!clean) return;
    if (!form.customCategories.includes(clean)) {
      setForm({ ...form, customCategories: [...form.customCategories, clean] });
    }
    setNewCategory('');
  };

  const downloadWorkspaceBackup = () => {
    window.location.assign('/api/export');
  };

  return (
    <form onSubmit={handleSave} className="space-y-6 max-w-4xl">
      <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 space-y-4">
        <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-3 dark:border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Workspace & Automation Preferences
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Configure default discovery targets, theme, currency, and safety locks
            </p>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-4 py-2 text-xs font-medium text-white hover:bg-teal-800 disabled:opacity-50 cursor-pointer"
          >
            <Save className="h-3.5 w-3.5" aria-hidden="true" />
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="set-ws-name" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Workspace Name
            </label>
            <input
              id="set-ws-name"
              type="text"
              value={form.workspaceName}
              onChange={(e) => setForm({ ...form, workspaceName: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>

          <div>
            <label htmlFor="set-country" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Default Target Country
            </label>
            <select
              id="set-country"
              value={form.defaultCountry}
              onChange={(e) => setForm({ ...form, defaultCountry: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              {TARGET_COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} · {c.name} ({c.currency})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="set-daily-target" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Default Daily Discovery Target
            </label>
            <input
              id="set-daily-target"
              type="number"
              min={1}
              max={500}
              value={form.defaultDailyTarget}
              onChange={(e) =>
                setForm({
                  ...form,
                  defaultDailyTarget: Math.max(1, Math.min(500, Number(e.target.value) || 25)),
                })
              }
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>

          <div>
            <label htmlFor="set-ai-budget" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Global Monthly AI Spend Budget ($)
            </label>
            <input
              id="set-ai-budget"
              type="number"
              min={1}
              value={form.globalMonthlyAiBudgetUsd}
              onChange={(e) =>
                setForm({
                  ...form,
                  globalMonthlyAiBudgetUsd: Math.max(1, Number(e.target.value) || 50),
                })
              }
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>

          <div>
            <label htmlFor="set-theme" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Interface Theme
            </label>
            <select
              id="set-theme"
              value={form.theme}
              onChange={(e) => {
                const next = e.target.value as 'light' | 'dark';
                setForm({ ...form, theme: next });
                onThemeChange(next);
              }}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="light">Light Workspace</option>
              <option value="dark">Dark Workspace</option>
            </select>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/40">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.allowMarketplacePublishing}
              onChange={(e) =>
                setForm({ ...form, allowMarketplacePublishing: e.target.checked })
              }
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-teal-700"
            />
            <div>
              <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                Allow Explicit Marketplace Export Authorization (Disabled by Default)
              </p>
              <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
                Keep unchecked to enforce research-only draft mode. Even when enabled, individual marketplace connectors and per-listing confirmations remain required.
              </p>
            </div>
          </label>
        </div>
      </div>

      {/* Custom Categories Manager */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 space-y-3">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Custom Product Categories
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Add niche verticals beyond the 15 universal built-in categories
        </p>
        <div className="flex gap-2 max-w-md">
          <input
            type="text"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            placeholder="e.g. Musical Instruments"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
          <button
            type="button"
            onClick={addCustomCategory}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 dark:border-slate-700 dark:text-slate-200 cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Add
          </button>
        </div>
        {form.customCategories.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {form.customCategories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() =>
                  setForm({
                    ...form,
                    customCategories: form.customCategories.filter((c) => c !== cat),
                  })
                }
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
              >
                <span>{cat}</span>
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Safe Export */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Workspace Data Backup
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Export products, discovery configs, and listing drafts. All encrypted API keys are automatically stripped.
          </p>
        </div>
        <button
          type="button"
          onClick={downloadWorkspaceBackup}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 cursor-pointer"
        >
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          Export Safe JSON
        </button>
      </div>
    </form>
  );
};
