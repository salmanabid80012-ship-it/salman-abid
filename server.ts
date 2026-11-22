import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import {
  compareAIModels,
  getAIProvider,
  listAIProviders,
  listAIUsageLogs,
  listTaskAssignments,
  runAssignedAITask,
  saveAIProvider,
  saveTaskAssignment,
  testAIProviderConnection,
} from './server/ai/aiRouter.ts';
import {
  canAuthorizePublish,
  getMarketplace,
  listMarketplaces,
  researchMarketplacePrices,
  saveMarketplace,
  testMarketplaceConnection,
} from './server/connectors/marketplaces.ts';
import {
  getSupplier,
  listSuppliers,
  saveSupplier,
  searchSupplierCatalog,
  testSupplierConnection,
} from './server/connectors/suppliers.ts';
import { encryptSecret, maskSecret, validateOutboundUrl } from './server/cryptoVault.ts';
import {
  getDb,
  getWorkspaceSettings,
  logActivity,
  saveWorkspaceSettings,
} from './server/db.ts';
import { runUniversalDiscovery } from './server/discoveryEngine.ts';
import type {
  ActivityEvent,
  AIProviderConfig,
  AITaskAssignment,
  AITaskKey,
  AppSettings,
  DiscoveryConfig,
  ListingDraft,
  MarketplaceConnector,
  ProductRecord,
  ProductStatus,
  SupplierConnector,
} from './src/types/commerce.ts';
import { getMarketplaceFeeDefaults } from './src/utils/commerceMath.ts';

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

async function startServer() {
  const db = getDb();
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  // Health endpoint
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'universal-commerce-ai-agent', timestamp: new Date().toISOString() });
  });

  // Bootstrap full state (zero secrets returned)
  app.get('/api/bootstrap', (_req, res) => {
    try {
      const productRows = db
        .prepare('SELECT payload FROM products ORDER BY updated_at DESC')
        .all() as Array<{ payload: string }>;
      const products = productRows.map((r) => JSON.parse(r.payload) as ProductRecord);

      const cfgRows = db
        .prepare('SELECT payload FROM discovery_configs ORDER BY created_at DESC')
        .all() as Array<{ payload: string }>;
      const discoveryConfigs = cfgRows.map((r) => JSON.parse(r.payload) as DiscoveryConfig);

      const draftRows = db
        .prepare('SELECT payload FROM listing_drafts ORDER BY updated_at DESC')
        .all() as Array<{ payload: string }>;
      const listingDrafts = draftRows.map((r) => JSON.parse(r.payload) as ListingDraft);

      const actRows = db
        .prepare('SELECT payload FROM activity_logs ORDER BY created_at DESC LIMIT 40')
        .all() as Array<{ payload: string }>;
      const activityLogs = actRows.map((r) => JSON.parse(r.payload) as ActivityEvent);

      const todayPrefix = new Date().toISOString().slice(0, 10);
      const discoveredToday = products.filter((p) => p.discoveredAt.startsWith(todayPrefix)).length;
      const settings = getWorkspaceSettings();

      res.json({
        products,
        discoveryConfigs,
        suppliers: listSuppliers(),
        marketplaces: listMarketplaces(),
        aiProviders: listAIProviders(),
        taskAssignments: listTaskAssignments(),
        aiUsageLogs: listAIUsageLogs(60),
        listingDrafts,
        activityLogs,
        settings,
        dailyProgress: {
          discoveredToday,
          dailyTarget: settings.defaultDailyTarget,
        },
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load workspace' });
    }
  });

  // Products CRUD & Queue Decisions
  app.patch('/api/products/:id', (req, res) => {
    const id = req.params.id;
    const row = db.prepare('SELECT payload FROM products WHERE id = ?').get(id) as
      | { payload: string }
      | undefined;
    if (!row) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }
    const existing = JSON.parse(row.payload) as ProductRecord;
    const body = req.body as Partial<ProductRecord>;
    const updated: ProductRecord = {
      ...existing,
      ...body,
      id: existing.id,
      updatedAt: new Date().toISOString(),
    };
    db.prepare(
      'UPDATE products SET title = ?, category = ?, status = ?, opportunity_score = ?, updated_at = ?, payload = ? WHERE id = ?'
    ).run(
      updated.title,
      updated.category,
      updated.status,
      updated.opportunityScore,
      updated.updatedAt,
      JSON.stringify(updated),
      id
    );

    if (body.status && body.status !== existing.status) {
      logActivity('queue', `Updated "${updated.title.slice(0, 42)}"`, `Status changed from ${existing.status} to ${body.status}.`);
    }
    res.json({ product: updated });
  });

  app.post('/api/products/bulk-status', (req, res) => {
    const { ids, status } = req.body as { ids?: string[]; status?: ProductStatus };
    if (!Array.isArray(ids) || !status) {
      res.status(400).json({ error: 'ids array and status are required' });
      return;
    }
    const now = new Date().toISOString();
    const selectStmt = db.prepare('SELECT payload FROM products WHERE id = ?');
    const updateStmt = db.prepare(
      'UPDATE products SET status = ?, updated_at = ?, payload = ? WHERE id = ?'
    );
    const updatedList: ProductRecord[] = [];
    for (const id of ids) {
      const row = selectStmt.get(id) as { payload: string } | undefined;
      if (!row) continue;
      const p = JSON.parse(row.payload) as ProductRecord;
      p.status = status;
      p.updatedAt = now;
      updateStmt.run(status, now, JSON.stringify(p), id);
      updatedList.push(p);
    }
    logActivity('queue', `Bulk updated ${updatedList.length} products`, `Applied status "${status}".`);
    res.json({ updated: updatedList });
  });

  app.delete('/api/products/:id', (req, res) => {
    const id = req.params.id;
    const result = db.prepare('DELETE FROM products WHERE id = ?').run(id);
    if (result.changes === 0) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }
    logActivity('queue', 'Removed product from pipeline', `Product ID ${id} deleted.`);
    res.json({ ok: true });
  });

  // AI Research enrichment for a specific product
  app.post('/api/products/:id/ai-research', async (req, res) => {
    const id = req.params.id;
    const { taskKey = 'product_research', overrideProviderId, overrideModelId } = req.body as {
      taskKey?: AITaskKey;
      overrideProviderId?: string;
      overrideModelId?: string;
    };
    const row = db.prepare('SELECT payload FROM products WHERE id = ?').get(id) as
      | { payload: string }
      | undefined;
    if (!row) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }
    const product = JSON.parse(row.payload) as ProductRecord;
    const prompt = `Analyze this e-commerce product for task "${taskKey}":
Title: ${product.title}
Category: ${product.category}
Target Country: ${product.targetCountry}
Marketplace: ${product.primaryMarketplace}
Selling Price: $${product.sellingPrice}
Supplier Cost: $${product.supplierCost} + Shipping: $${product.shippingCost}
Estimated Monthly Sales: ${product.estimatedMonthlySales}
Competition Level: ${product.competitionLevel}
Specifications: ${JSON.stringify(product.specifications)}

Provide concise, actionable commercial intelligence (demand drivers, competitive differentiation, margin risks, and concrete recommendation in under 180 words).`;

    try {
      const aiRes = await runAssignedAITask({
        taskKey,
        prompt,
        systemInstruction:
          'You are a senior e-commerce market analyst. Be concrete, quantitative, and concise.',
        overrideProviderId,
        overrideModelId,
      });

      const updated: ProductRecord = {
        ...product,
        researchNotes: {
          demandSummary: product.researchNotes?.demandSummary || '',
          competitionSummary: product.researchNotes?.competitionSummary || '',
          riskFactors: product.researchNotes?.riskFactors || [],
          targetAudience: product.researchNotes?.targetAudience || '',
          aiSummary: aiRes.text,
          aiModelUsed: `${aiRes.providerName} (${aiRes.modelId})`,
          researchedAt: new Date().toISOString(),
        },
        updatedAt: new Date().toISOString(),
      };

      db.prepare('UPDATE products SET updated_at = ?, payload = ? WHERE id = ?').run(
        updated.updatedAt,
        JSON.stringify(updated),
        id
      );

      logActivity(
        'research',
        `AI ${taskKey} on ${product.sku}`,
        `Generated via ${aiRes.providerName} (${aiRes.modelId}) in ${aiRes.latencyMs}ms.`
      );
      res.json({ product: updated, aiResult: aiRes });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'AI analysis failed' });
    }
  });

  // Discovery Configs & Execution
  app.post('/api/discovery/configs', (req, res) => {
    const cfg = req.body as Partial<DiscoveryConfig>;
    if (!cfg.name || !cfg.name.trim()) {
      res.status(400).json({ error: 'Configuration name is required' });
      return;
    }
    const now = new Date().toISOString();
    const full: DiscoveryConfig = {
      id: cfg.id || `cfg-${Date.now()}`,
      name: cfg.name.trim(),
      categories: Array.isArray(cfg.categories) ? cfg.categories : [],
      allCategories: Boolean(cfg.allCategories),
      keywords: Array.isArray(cfg.keywords) ? cfg.keywords : [],
      dailyTarget: Math.max(1, Math.min(500, Number(cfg.dailyTarget) || 25)),
      minCost: Math.max(0, Number(cfg.minCost) || 0),
      maxCost: Math.max(1, Number(cfg.maxCost) || 200),
      targetCountries: Array.isArray(cfg.targetCountries) && cfg.targetCountries.length > 0 ? cfg.targetCountries : ['US'],
      targetMarketplaces: Array.isArray(cfg.targetMarketplaces) && cfg.targetMarketplaces.length > 0 ? cfg.targetMarketplaces : ['ebay'],
      minExpectedProfit: Number(cfg.minExpectedProfit) || 0,
      minNetMarginPct: Number(cfg.minNetMarginPct) || 0,
      enabledSuppliers: Array.isArray(cfg.enabledSuppliers) ? cfg.enabledSuppliers : [],
      createdAt: cfg.createdAt || now,
    };

    db.prepare(
      'INSERT OR REPLACE INTO discovery_configs (id, name, created_at, payload) VALUES (?, ?, ?, ?)'
    ).run(full.id, full.name, full.createdAt, JSON.stringify(full));

    logActivity('discovery', `Saved discovery config "${full.name}"`, `Daily target: ${full.dailyTarget} products.`);
    res.json({ config: full });
  });

  app.delete('/api/discovery/configs/:id', (req, res) => {
    db.prepare('DELETE FROM discovery_configs WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  app.post('/api/discovery/run', (req, res) => {
    const config = req.body as DiscoveryConfig;
    if (!config || typeof config.dailyTarget !== 'number' || config.dailyTarget < 1) {
      res.status(400).json({ error: 'Valid discovery configuration with dailyTarget >= 1 is required' });
      return;
    }
    try {
      const result = runUniversalDiscovery(config);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Discovery run failed' });
    }
  });

  // Supplier Hub routes
  app.post('/api/suppliers', (req, res) => {
    const body = req.body as Partial<SupplierConnector>;
    if (!body.name?.trim() || !body.baseUrl?.trim()) {
      res.status(400).json({ error: 'Supplier name and baseUrl are required' });
      return;
    }
    const urlCheck = validateOutboundUrl(body.baseUrl.trim());
    if (!urlCheck.valid) {
      res.status(400).json({ error: urlCheck.reason });
      return;
    }
    const id = body.id || `sup-${Date.now()}`;
    const connector: SupplierConnector = {
      id,
      name: body.name.trim(),
      type: body.type || 'custom',
      enabled: body.enabled ?? true,
      baseUrl: body.baseUrl.trim(),
      authHeaderName: body.authHeaderName?.trim() || 'Authorization',
      hasCredentials: false,
      connectionStatus: 'unconfigured',
      capabilities: body.capabilities || {
        supportsSearch: true,
        supportsCostLookup: true,
        supportsLiveShipping: false,
        supportsInventory: false,
        supportsSpecs: false,
        supportsOrderSync: false,
      },
      notes: body.notes?.trim() || 'Custom REST supplier connector.',
    };
    saveSupplier(connector);
    logActivity('supplier', `Added supplier "${connector.name}"`, 'Custom connector registered.');
    res.json({ supplier: connector });
  });

  app.patch('/api/suppliers/:id', (req, res) => {
    const existing = getSupplier(req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Supplier not found' });
      return;
    }
    const body = req.body as Partial<SupplierConnector>;
    if (body.baseUrl) {
      const check = validateOutboundUrl(body.baseUrl);
      if (!check.valid) {
        res.status(400).json({ error: check.reason });
        return;
      }
    }
    const updated: SupplierConnector = {
      ...existing,
      ...body,
      id: existing.id,
      connectionStatus:
        body.enabled === false ? 'disabled' : existing.hasCredentials ? existing.connectionStatus : 'unconfigured',
    };
    saveSupplier(updated);
    res.json({ supplier: updated });
  });

  app.post('/api/suppliers/:id/credentials', (req, res) => {
    const existing = getSupplier(req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Supplier not found' });
      return;
    }
    const { apiKey } = req.body as { apiKey?: string };
    if (!apiKey || apiKey.trim().length < 6) {
      res.status(400).json({ error: 'API credential must be at least 6 characters' });
      return;
    }
    const encrypted = encryptSecret(apiKey.trim());
    const masked = maskSecret(apiKey.trim());
    db.prepare(
      'INSERT OR REPLACE INTO encrypted_secrets (scope, entity_id, encrypted_value, masked_value, updated_at) VALUES (?, ?, ?, ?, ?)'
    ).run('supplier', existing.id, encrypted, masked, new Date().toISOString());

    existing.hasCredentials = true;
    existing.maskedCredential = masked;
    existing.connectionStatus = 'unconfigured';
    saveSupplier(existing);
    logActivity('supplier', `Saved encrypted credentials for ${existing.name}`, `Masked token ${masked} stored in backend vault.`);
    res.json({ supplier: existing });
  });

  app.post('/api/suppliers/:id/test', async (req, res) => {
    try {
      const result = await testSupplierConnection(req.params.id);
      res.json(result);
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : 'Test failed' });
    }
  });

  app.get('/api/suppliers/catalog', (req, res) => {
    const query = typeof req.query.q === 'string' ? req.query.q : '';
    const category = typeof req.query.category === 'string' ? req.query.category : '';
    const supplierId = typeof req.query.supplierId === 'string' ? req.query.supplierId : '';
    const items = searchSupplierCatalog({ query, category, supplierId });
    res.json({ items });
  });

  // Marketplace Hub routes
  app.post('/api/marketplaces', (req, res) => {
    const body = req.body as Partial<MarketplaceConnector>;
    if (!body.name?.trim() || !body.baseUrl?.trim()) {
      res.status(400).json({ error: 'Marketplace name and baseUrl are required' });
      return;
    }
    const urlCheck = validateOutboundUrl(body.baseUrl.trim());
    if (!urlCheck.valid) {
      res.status(400).json({ error: urlCheck.reason });
      return;
    }
    const connector: MarketplaceConnector = {
      id: body.id || `mkt-${Date.now()}`,
      name: body.name.trim(),
      type: body.type || 'custom',
      enabled: body.enabled ?? true,
      publishingEnabled: false, // Always disabled by default
      countries: Array.isArray(body.countries) && body.countries.length > 0 ? body.countries : ['US'],
      defaultFeePct: Number(body.defaultFeePct) || 12,
      baseUrl: body.baseUrl.trim(),
      hasCredentials: false,
      connectionStatus: 'unconfigured',
      capabilities: body.capabilities || {
        supportsProductSearch: true,
        supportsPricingTrends: false,
        supportsCategoryFees: true,
        supportsDraftPreparation: true,
        supportsDirectPublish: false,
      },
      policyNote: body.policyNote?.trim() || 'Custom marketplace connector. Direct publishing disabled by default.',
    };
    saveMarketplace(connector);
    logActivity('marketplace', `Added marketplace "${connector.name}"`, 'Publishing disabled by default.');
    res.json({ marketplace: connector });
  });

  app.patch('/api/marketplaces/:id', (req, res) => {
    const existing = getMarketplace(req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Marketplace not found' });
      return;
    }
    const body = req.body as Partial<MarketplaceConnector>;
    const updated: MarketplaceConnector = {
      ...existing,
      ...body,
      id: existing.id,
    };
    saveMarketplace(updated);
    res.json({ marketplace: updated });
  });

  app.post('/api/marketplaces/:id/credentials', (req, res) => {
    const existing = getMarketplace(req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Marketplace not found' });
      return;
    }
    const { apiKey } = req.body as { apiKey?: string };
    if (!apiKey || apiKey.trim().length < 6) {
      res.status(400).json({ error: 'Credential must be at least 6 characters' });
      return;
    }
    const encrypted = encryptSecret(apiKey.trim());
    const masked = maskSecret(apiKey.trim());
    db.prepare(
      'INSERT OR REPLACE INTO encrypted_secrets (scope, entity_id, encrypted_value, masked_value, updated_at) VALUES (?, ?, ?, ?, ?)'
    ).run('marketplace', existing.id, encrypted, masked, new Date().toISOString());

    existing.hasCredentials = true;
    existing.maskedCredential = masked;
    saveMarketplace(existing);
    logActivity('marketplace', `Saved encrypted credentials for ${existing.name}`, `Masked token ${masked} stored in backend vault.`);
    res.json({ marketplace: existing });
  });

  app.post('/api/marketplaces/:id/test', async (req, res) => {
    try {
      const result = await testMarketplaceConnection(req.params.id);
      res.json(result);
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : 'Test failed' });
    }
  });

  app.get('/api/marketplaces/research', (req, res) => {
    const query = typeof req.query.q === 'string' ? req.query.q : 'universal product';
    const country = typeof req.query.country === 'string' ? req.query.country : 'US';
    const marketplaceId = typeof req.query.marketplaceId === 'string' ? req.query.marketplaceId : '';
    const benchmarks = researchMarketplacePrices({
      query,
      country,
      marketplaceIds: marketplaceId ? [marketplaceId] : undefined,
    });
    res.json({ benchmarks });
  });

  // AI Model Hub routes
  app.post('/api/ai/providers', (req, res) => {
    const body = req.body as Partial<AIProviderConfig>;
    if (!body.name?.trim() || !body.baseUrl?.trim() || !body.defaultModel?.trim()) {
      res.status(400).json({ error: 'Provider name, baseUrl, and defaultModel are required' });
      return;
    }
    const urlCheck = validateOutboundUrl(body.baseUrl.trim());
    if (!urlCheck.valid) {
      res.status(400).json({ error: urlCheck.reason });
      return;
    }
    const provider: AIProviderConfig = {
      id: body.id || `ai-${Date.now()}`,
      name: body.name.trim(),
      type: 'custom_openai',
      enabled: body.enabled ?? true,
      isDefault: false,
      isFallback: false,
      baseUrl: body.baseUrl.trim(),
      defaultModel: body.defaultModel.trim(),
      availableModels:
        Array.isArray(body.availableModels) && body.availableModels.length > 0
          ? body.availableModels
          : [body.defaultModel.trim()],
      hasCredentials: false,
      credentialSource: 'none',
      connectionStatus: 'unconfigured',
      monthlySpendLimitUsd: Math.max(1, Number(body.monthlySpendLimitUsd) || 25),
      currentMonthSpendUsd: 0,
      totalTokensUsed: 0,
    };
    saveAIProvider(provider);
    logActivity('ai', `Added custom AI provider "${provider.name}"`, `Endpoint ${provider.baseUrl}`);
    res.json({ provider });
  });

  app.patch('/api/ai/providers/:id', (req, res) => {
    const existing = getAIProvider(req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'AI provider not found' });
      return;
    }
    const body = req.body as Partial<AIProviderConfig>;
    if (body.isDefault) {
      for (const other of listAIProviders()) {
        if (other.id !== existing.id && other.isDefault) {
          other.isDefault = false;
          saveAIProvider(other);
        }
      }
    }
    if (body.isFallback) {
      for (const other of listAIProviders()) {
        if (other.id !== existing.id && other.isFallback) {
          other.isFallback = false;
          saveAIProvider(other);
        }
      }
    }
    const updated: AIProviderConfig = {
      ...existing,
      ...body,
      id: existing.id,
      type: existing.type,
    };
    saveAIProvider(updated);
    res.json({ provider: updated, allProviders: listAIProviders() });
  });

  app.post('/api/ai/providers/:id/credentials', (req, res) => {
    const existing = getAIProvider(req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'AI provider not found' });
      return;
    }
    if (existing.type === 'gemini') {
      res.status(400).json({
        error: 'Google Gemini uses the server-side GEMINI_API_KEY environment secret and cannot be overwritten from the client.',
      });
      return;
    }
    const { apiKey } = req.body as { apiKey?: string };
    if (!apiKey || apiKey.trim().length < 8) {
      res.status(400).json({ error: 'API key must be at least 8 characters' });
      return;
    }
    const encrypted = encryptSecret(apiKey.trim());
    const masked = maskSecret(apiKey.trim());
    db.prepare(
      'INSERT OR REPLACE INTO encrypted_secrets (scope, entity_id, encrypted_value, masked_value, updated_at) VALUES (?, ?, ?, ?, ?)'
    ).run('ai_provider', existing.id, encrypted, masked, new Date().toISOString());

    existing.hasCredentials = true;
    existing.credentialSource = 'encrypted_vault';
    existing.maskedCredential = masked;
    existing.enabled = true;
    saveAIProvider(existing);
    logActivity('ai', `Updated API key for ${existing.name}`, `Encrypted secret ${masked} saved.`);
    res.json({ provider: existing });
  });

  app.post('/api/ai/providers/:id/test', async (req, res) => {
    try {
      const result = await testAIProviderConnection(req.params.id);
      res.json(result);
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : 'Test failed' });
    }
  });

  app.put('/api/ai/tasks', (req, res) => {
    const assignment = req.body as AITaskAssignment;
    if (!assignment?.taskKey || !assignment.providerId || !assignment.modelId) {
      res.status(400).json({ error: 'taskKey, providerId, and modelId are required' });
      return;
    }
    saveTaskAssignment(assignment);
    res.json({ assignment, allAssignments: listTaskAssignments() });
  });

  app.post('/api/ai/run', async (req, res) => {
    const { taskKey, prompt, systemInstruction, overrideProviderId, overrideModelId } = req.body as {
      taskKey?: AITaskKey;
      prompt?: string;
      systemInstruction?: string;
      overrideProviderId?: string;
      overrideModelId?: string;
    };
    if (!taskKey || !prompt?.trim()) {
      res.status(400).json({ error: 'taskKey and prompt are required' });
      return;
    }
    try {
      const result = await runAssignedAITask({
        taskKey,
        prompt: prompt.trim(),
        systemInstruction: systemInstruction || 'You are a concise e-commerce commerce analyst.',
        overrideProviderId,
        overrideModelId,
      });
      res.json({ result });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'AI execution failed' });
    }
  });

  app.post('/api/ai/compare', async (req, res) => {
    const { targets, prompt, systemInstruction, taskKey, userConfirmed } = req.body as {
      targets?: Array<{ providerId: string; modelId: string }>;
      prompt?: string;
      systemInstruction?: string;
      taskKey?: AITaskKey;
      userConfirmed?: boolean;
    };
    if (!userConfirmed) {
      res.status(400).json({ error: 'Explicit user confirmation is required before running multi-model comparison.' });
      return;
    }
    if (!Array.isArray(targets) || targets.length < 2 || !prompt?.trim()) {
      res.status(400).json({ error: 'Select at least 2 models and provide a prompt.' });
      return;
    }
    try {
      const results = await compareAIModels({
        targets,
        prompt: prompt.trim(),
        systemInstruction: systemInstruction || 'You are a concise e-commerce optimization specialist.',
        taskKey: taskKey || 'product_research',
      });
      logActivity('ai', `Multi-model comparison (${targets.length} models)`, `Compared ${targets.map((t) => t.modelId).join(', ')}.`);
      res.json({ results });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Comparison failed' });
    }
  });

  // Listing Generator routes
  app.post('/api/listings/generate', async (req, res) => {
    const { productId, marketplaceId, country, language, mode } = req.body as {
      productId?: string;
      marketplaceId?: string;
      country?: string;
      language?: string;
      mode?: 'ai' | 'structured';
    };
    if (!productId || !marketplaceId) {
      res.status(400).json({ error: 'productId and marketplaceId are required' });
      return;
    }
    const row = db.prepare('SELECT payload FROM products WHERE id = ?').get(productId) as
      | { payload: string }
      | undefined;
    if (!row) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }
    const product = JSON.parse(row.payload) as ProductRecord;
    const feeDefaults = getMarketplaceFeeDefaults(marketplaceId);
    const lang = language || 'en';
    const targetCountry = country || product.targetCountry;

    if (mode === 'structured') {
      const rawTitle = `${product.title} - ${product.category} (${targetCountry})`;
      const seoTitle = rawTitle.slice(0, feeDefaults.titleMaxChars);
      const draft: ListingDraft = {
        id: `draft-${Date.now()}`,
        productId: product.id,
        marketplaceId,
        country: targetCountry,
        language: lang,
        seoTitle,
        bulletPoints: [
          `Category-verified ${product.category} specification: ${Object.entries(product.specifications).map(([k, v]) => `${k}: ${v}`).slice(0, 2).join(', ') || 'Commercial grade finish'}`,
          `Prepared for ${marketplaceId.toUpperCase()} (${targetCountry}) compliance with max ${feeDefaults.titleMaxChars}-character title formatting`,
          `Transparent landed economics modeled at $${product.sellingPrice.toFixed(2)} retail target`,
        ],
        descriptionHtmlSafe: `${product.title}. ${product.researchNotes?.demandSummary || ''} Specifications: ${Object.entries(product.specifications).map(([k, v]) => `${k}: ${v}`).join('; ')}.`,
        tags: product.keywords.slice(0, feeDefaults.maxTags),
        suggestedPrice: product.sellingPrice,
        publishAuthorized: false,
        status: 'draft',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      db.prepare(
        'INSERT INTO listing_drafts (id, product_id, marketplace_id, updated_at, payload) VALUES (?, ?, ?, ?, ?)'
      ).run(draft.id, draft.productId, draft.marketplaceId, draft.updatedAt, JSON.stringify(draft));
      logActivity('listing', `Generated structured draft for ${product.sku}`, `Marketplace: ${marketplaceId} (${lang}).`);
      res.json({ draft, source: 'structured' });
      return;
    }

    // AI generation mode
    const taskKey: AITaskKey = lang !== 'en' ? 'multilingual_content' : 'product_description';
    const prompt = `Generate an optimized e-commerce listing in JSON format ONLY (no markdown fences) for:
Product: ${product.title}
Category: ${product.category}
Marketplace: ${marketplaceId} (Max SEO title characters: ${feeDefaults.titleMaxChars}, Max tags: ${feeDefaults.maxTags})
Target Country: ${targetCountry}
Language code: ${lang}
Specifications: ${JSON.stringify(product.specifications)}
Keywords: ${product.keywords.join(', ')}

Return strictly valid JSON with keys:
{
  "seoTitle": "string within ${feeDefaults.titleMaxChars} chars",
  "bulletPoints": ["4 concise bullet points"],
  "descriptionHtmlSafe": "plain text 2-paragraph commercial description without HTML tags",
  "tags": ["up to ${feeDefaults.maxTags} search keywords"]
}`;

    try {
      const aiRes = await runAssignedAITask({
        taskKey,
        prompt,
        systemInstruction:
          'You are an expert e-commerce copywriter. Return ONLY valid JSON matching the requested schema.',
      });

      const cleaned = aiRes.text
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim();
      const parsed = JSON.parse(cleaned) as {
        seoTitle?: string;
        bulletPoints?: string[];
        descriptionHtmlSafe?: string;
        tags?: string[];
      };

      const now = new Date().toISOString();
      const draft: ListingDraft = {
        id: `draft-${Date.now()}`,
        productId: product.id,
        marketplaceId,
        country: targetCountry,
        language: lang,
        seoTitle: (parsed.seoTitle || product.title).slice(0, feeDefaults.titleMaxChars),
        bulletPoints: Array.isArray(parsed.bulletPoints) ? parsed.bulletPoints.slice(0, 6) : [],
        descriptionHtmlSafe: parsed.descriptionHtmlSafe || product.title,
        tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, feeDefaults.maxTags) : product.keywords.slice(0, feeDefaults.maxTags),
        suggestedPrice: product.sellingPrice,
        publishAuthorized: false,
        status: 'draft',
        createdAt: now,
        updatedAt: now,
      };
      db.prepare(
        'INSERT INTO listing_drafts (id, product_id, marketplace_id, updated_at, payload) VALUES (?, ?, ?, ?, ?)'
      ).run(draft.id, draft.productId, draft.marketplaceId, draft.updatedAt, JSON.stringify(draft));

      logActivity('listing', `AI listing generated for ${product.sku}`, `${aiRes.providerName} (${aiRes.modelId}) for ${marketplaceId}/${lang}.`);
      res.json({ draft, source: 'ai', aiResult: aiRes });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'AI listing generation failed' });
    }
  });

  app.patch('/api/listings/:id', (req, res) => {
    const id = req.params.id;
    const row = db.prepare('SELECT payload FROM listing_drafts WHERE id = ?').get(id) as
      | { payload: string }
      | undefined;
    if (!row) {
      res.status(404).json({ error: 'Listing draft not found' });
      return;
    }
    const existing = JSON.parse(row.payload) as ListingDraft;
    const body = req.body as Partial<ListingDraft>;
    const updated: ListingDraft = {
      ...existing,
      ...body,
      id: existing.id,
      updatedAt: new Date().toISOString(),
    };
    db.prepare('UPDATE listing_drafts SET updated_at = ?, payload = ? WHERE id = ?').run(
      updated.updatedAt,
      JSON.stringify(updated),
      id
    );
    res.json({ draft: updated });
  });

  app.post('/api/listings/:id/authorize-publish', (req, res) => {
    const id = req.params.id;
    const { explicitConfirmation } = req.body as { explicitConfirmation?: boolean };
    if (!explicitConfirmation) {
      res.status(400).json({ error: 'Explicit user confirmation is required.' });
      return;
    }
    const row = db.prepare('SELECT payload FROM listing_drafts WHERE id = ?').get(id) as
      | { payload: string }
      | undefined;
    if (!row) {
      res.status(404).json({ error: 'Listing draft not found' });
      return;
    }
    const existing = JSON.parse(row.payload) as ListingDraft;
    const gate = canAuthorizePublish(existing.marketplaceId);
    if (!gate.allowed) {
      res.status(403).json({ error: gate.reason });
      return;
    }
    existing.publishAuthorized = true;
    existing.status = 'authorized_export';
    existing.updatedAt = new Date().toISOString();
    db.prepare('UPDATE listing_drafts SET updated_at = ?, payload = ? WHERE id = ?').run(
      existing.updatedAt,
      JSON.stringify(existing),
      id
    );
    logActivity('listing', `Authorized draft ${existing.id} for ${existing.marketplaceId}`, 'Explicit seller authorization recorded.');
    res.json({ draft: existing });
  });

  // Settings & safe workspace export
  app.put('/api/settings', (req, res) => {
    const current = getWorkspaceSettings();
    const body = req.body as Partial<AppSettings>;
    const updated: AppSettings = {
      ...current,
      ...body,
      defaultDailyTarget: Math.max(1, Math.min(500, Number(body.defaultDailyTarget ?? current.defaultDailyTarget))),
      globalMonthlyAiBudgetUsd: Math.max(1, Number(body.globalMonthlyAiBudgetUsd ?? current.globalMonthlyAiBudgetUsd)),
    };
    saveWorkspaceSettings(updated);
    logActivity('settings', 'Updated workspace settings', `Daily target: ${updated.defaultDailyTarget}, Publishing lock: ${updated.allowMarketplacePublishing ? 'Unlocked' : 'Locked'}.`);
    res.json({ settings: updated });
  });

  app.get('/api/export', (_req, res) => {
    const productRows = db.prepare('SELECT payload FROM products').all() as Array<{ payload: string }>;
    const cfgRows = db.prepare('SELECT payload FROM discovery_configs').all() as Array<{ payload: string }>;
    const draftRows = db.prepare('SELECT payload FROM listing_drafts').all() as Array<{ payload: string }>;
    res.json({
      exportedAt: new Date().toISOString(),
      note: 'API credentials and vault secrets are intentionally excluded from exports.',
      settings: getWorkspaceSettings(),
      products: productRows.map((r) => JSON.parse(r.payload)),
      discoveryConfigs: cfgRows.map((r) => JSON.parse(r.payload)),
      listingDrafts: draftRows.map((r) => JSON.parse(r.payload)),
    });
  });

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Universal Commerce AI Agent listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
