import React, { useEffect, useState } from 'react';
import { Download, Lock, Save, ShieldCheck, Sparkles, Wand2 } from 'lucide-react';
import { SUPPORTED_LANGUAGES, TARGET_COUNTRIES } from '../data/catalogConstants.ts';
import type {
  ListingDraft,
  MarketplaceConnector,
  ProductRecord,
} from '../types/commerce.ts';
import { checkListingCompliance } from '../utils/commerceMath.ts';

interface ListingGeneratorViewProps {
  products: ProductRecord[];
  marketplaces: MarketplaceConnector[];
  drafts: ListingDraft[];
  selectedProductId: string | null;
  onSelectProductId: (id: string) => void;
  onRefresh: () => Promise<void>;
  onNotify: (message: string, tone?: 'success' | 'error') => void;
}

export const ListingGeneratorView: React.FC<ListingGeneratorViewProps> = ({
  products,
  marketplaces,
  drafts,
  selectedProductId,
  onSelectProductId,
  onRefresh,
  onNotify,
}) => {
  const product = products.find((p) => p.id === selectedProductId) || products[0] || null;
  const [marketplaceId, setMarketplaceId] = useState(product?.primaryMarketplace || 'ebay');
  const [country, setCountry] = useState(product?.targetCountry || 'US');
  const [language, setLanguage] = useState('en');

  const matchingDraft =
    drafts.find((d) => d.productId === product?.id && d.marketplaceId === marketplaceId) ||
    drafts.find((d) => d.productId === product?.id) ||
    null;

  const [activeDraftId, setActiveDraftId] = useState<string | null>(matchingDraft?.id || null);
  const [seoTitle, setSeoTitle] = useState(matchingDraft?.seoTitle || product?.title || '');
  const [bulletsText, setBulletsText] = useState(
    matchingDraft?.bulletPoints.join('\n') || ''
  );
  const [description, setDescription] = useState(
    matchingDraft?.descriptionHtmlSafe || ''
  );
  const [tagsText, setTagsText] = useState(
    matchingDraft?.tags.join(', ') || product?.keywords.join(', ') || ''
  );

  const [generating, setGenerating] = useState(false);
  const [showPublishModal, setShowPublishModal] = useState(false);

  useEffect(() => {
    if (!product) return;
    const found =
      drafts.find((d) => d.productId === product.id && d.marketplaceId === marketplaceId) ||
      drafts.find((d) => d.productId === product.id);
    if (found) {
      setActiveDraftId(found.id);
      setSeoTitle(found.seoTitle);
      setBulletsText(found.bulletPoints.join('\n'));
      setDescription(found.descriptionHtmlSafe);
      setTagsText(found.tags.join(', '));
    } else {
      setActiveDraftId(null);
      setSeoTitle(product.title);
      setBulletsText(
        Object.entries(product.specifications)
          .map(([k, v]) => `${k}: ${v}`)
          .join('\n')
      );
      setDescription(product.researchNotes?.demandSummary || product.title);
      setTagsText(product.keywords.join(', '));
    }
  }, [product?.id, drafts.length]);

  if (!product) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Add or discover products first before generating marketplace listings.
        </p>
      </div>
    );
  }

  const tagsArray = tagsText
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  const compliance = checkListingCompliance(marketplaceId, seoTitle, tagsArray);

  const generateListing = async (mode: 'ai' | 'structured') => {
    setGenerating(true);
    try {
      const resp = await fetch('/api/listings/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: product.id,
          marketplaceId,
          country,
          language,
          mode,
        }),
      });
      const data = (await resp.json()) as { draft?: ListingDraft; error?: string };
      if (!resp.ok || !data.draft) throw new Error(data.error || 'Generation failed');
      setActiveDraftId(data.draft.id);
      setSeoTitle(data.draft.seoTitle);
      setBulletsText(data.draft.bulletPoints.join('\n'));
      setDescription(data.draft.descriptionHtmlSafe);
      setTagsText(data.draft.tags.join(', '));
      await onRefresh();
      onNotify(
        mode === 'ai'
          ? 'Generated AI-optimized marketplace listing draft'
          : 'Built structured compliance listing draft'
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Generation failed', 'error');
    } finally {
      setGenerating(false);
    }
  };

  const saveDraftEdits = async () => {
    if (!activeDraftId) {
      await generateListing('structured');
      return;
    }
    try {
      const resp = await fetch(`/api/listings/${activeDraftId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          marketplaceId,
          country,
          language,
          seoTitle,
          bulletPoints: bulletsText.split('\n').map((l) => l.trim()).filter(Boolean),
          descriptionHtmlSafe: description,
          tags: tagsArray,
        }),
      });
      if (!resp.ok) throw new Error('Save failed');
      await onRefresh();
      onNotify('Saved listing draft changes');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Save failed', 'error');
    }
  };

  const authorizePublish = async () => {
    if (!activeDraftId) return;
    try {
      const resp = await fetch(`/api/listings/${activeDraftId}/authorize-publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ explicitConfirmation: true }),
      });
      const data = (await resp.json()) as { error?: string };
      if (!resp.ok) throw new Error(data.error || 'Authorization blocked');
      setShowPublishModal(false);
      await onRefresh();
      onNotify('Draft authorized for export');
    } catch (err) {
      setShowPublishModal(false);
      onNotify(err instanceof Error ? err.message : 'Publish gate blocked', 'error');
    }
  };

  const exportDraftJson = () => {
    const payload = {
      sku: product.sku,
      marketplaceId,
      country,
      language,
      seoTitle,
      bulletPoints: bulletsText.split('\n').filter(Boolean),
      description,
      tags: tagsArray,
      suggestedPrice: product.sellingPrice,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${product.sku}-${marketplaceId}-listing.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Controls Bar */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="lg-product" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Product
            </label>
            <select
              id="lg-product"
              value={product.id}
              onChange={(e) => onSelectProductId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.sku} · {p.title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="lg-marketplace" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Target Marketplace
            </label>
            <select
              id="lg-marketplace"
              value={marketplaceId}
              onChange={(e) => setMarketplaceId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              {marketplaces.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="lg-country" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Target Country
            </label>
            <select
              id="lg-country"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              {TARGET_COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} · {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="lg-lang" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Output Language
            </label>
            <select
              id="lg-lang"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              {SUPPORTED_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
          <button
            type="button"
            disabled={generating}
            onClick={() => generateListing('ai')}
            className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3.5 py-2 text-xs font-medium text-white hover:bg-teal-800 disabled:opacity-50 cursor-pointer"
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            {generating ? 'Generating...' : 'Generate with Assigned AI'}
          </button>
          <button
            type="button"
            disabled={generating}
            onClick={() => generateListing('structured')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer"
          >
            <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />
            Build Rule-Based Draft
          </button>
          <button
            type="button"
            onClick={saveDraftEdits}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer"
          >
            <Save className="h-3.5 w-3.5" aria-hidden="true" />
            Save Draft
          </button>
          <button
            type="button"
            onClick={exportDraftJson}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Export JSON
          </button>
          <button
            type="button"
            onClick={() => setShowPublishModal(true)}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-2 text-xs font-medium text-amber-900 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300 cursor-pointer"
          >
            <Lock className="h-3.5 w-3.5" aria-hidden="true" />
            Authorize Export
          </button>
        </div>
      </div>

      {/* Editor */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 space-y-4">
        <div>
          <div className="flex items-center justify-between">
            <label htmlFor="lg-title" className="text-xs font-medium text-slate-700 dark:text-slate-300">
              SEO Listing Title
            </label>
            <span
              className={`font-mono text-xs tabular-nums ${
                compliance.titleCompliant
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              {compliance.titleLength} / {compliance.titleMaxChars} chars
            </span>
          </div>
          <input
            id="lg-title"
            type="text"
            value={seoTitle}
            onChange={(e) => setSeoTitle(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>

        <div>
          <label htmlFor="lg-bullets" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
            Key Feature Bullet Points (one per line)
          </label>
          <textarea
            id="lg-bullets"
            rows={4}
            value={bulletsText}
            onChange={(e) => setBulletsText(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-3 text-sm text-slate-900 focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>

        <div>
          <label htmlFor="lg-desc" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
            Product Description
          </label>
          <textarea
            id="lg-desc"
            rows={5}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-3 text-sm text-slate-900 focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label htmlFor="lg-tags" className="text-xs font-medium text-slate-700 dark:text-slate-300">
              Search Keywords / Backend Tags (comma-separated)
            </label>
            <span
              className={`font-mono text-xs tabular-nums ${
                compliance.tagsCompliant
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              {compliance.tagCount} / {compliance.maxTags} tags
            </span>
          </div>
          <input
            id="lg-tags"
            type="text"
            value={tagsText}
            onChange={(e) => setTagsText(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>
      </div>

      {/* Explicit Publish Authorization Modal */}
      {showPublishModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="auth-pub-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-lg dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-start gap-3">
              <ShieldCheck className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <h3 id="auth-pub-title" className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Explicit Seller Authorization Check
                </h3>
                <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Marketplace publishing is disabled by default. Authorizing this draft requires Global Marketplace Publishing to be unlocked in Settings and publishing enabled on{' '}
                  <strong>{marketplaceId.toUpperCase()}</strong>.
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowPublishModal(false)}
                className="rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-medium text-slate-700 dark:border-slate-700 dark:text-slate-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={authorizePublish}
                className="rounded-lg bg-teal-700 px-4 py-2 text-xs font-medium text-white hover:bg-teal-800 cursor-pointer"
              >
                Confirm Authorization
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
