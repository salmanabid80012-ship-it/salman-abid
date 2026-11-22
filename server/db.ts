import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  AI_TASK_DEFINITIONS,
  STANDARD_CATEGORIES,
} from '../src/data/catalogConstants.ts';
import type {
  ActivityEvent,
  AIProviderConfig,
  AITaskAssignment,
  AIUsageLog,
  AppSettings,
  DiscoveryConfig,
  ListingDraft,
  MarketplaceConnector,
  ProductRecord,
  SupplierConnector,
} from '../src/types/commerce.ts';

const DATA_DIR = path.resolve(process.cwd(), '.data');
const DB_PATH = path.join(DATA_DIR, 'commerce.db');

let dbInstance: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (dbInstance) return dbInstance;

  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');

  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      sku TEXT NOT NULL,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      status TEXT NOT NULL,
      opportunity_score INTEGER NOT NULL,
      discovered_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS discovery_configs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS suppliers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      enabled INTEGER NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS marketplaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      enabled INTEGER NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ai_providers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      enabled INTEGER NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ai_task_assignments (
      task_key TEXT PRIMARY KEY,
      payload TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ai_usage_logs (
      id TEXT PRIMARY KEY,
      provider_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS listing_drafts (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      marketplace_id TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS activity_logs (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      created_at TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      payload TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS encrypted_secrets (
      scope TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      encrypted_value TEXT NOT NULL,
      masked_value TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (scope, entity_id)
    );
  `);

  dbInstance = db;
  seedInitialData(db);
  return db;
}

function seedInitialData(db: DatabaseSync): void {
  const existingProducts = db.prepare('SELECT COUNT(*) as cnt FROM products').get() as {
    cnt: number;
  };
  if (existingProducts.cnt > 0) return;

  const now = new Date().toISOString();
  const yesterday = new Date(Date.now() - 86400_000).toISOString();

  const initialSettings: AppSettings = {
    workspaceName: 'Global Commerce Operations',
    defaultCurrency: 'USD',
    defaultCountry: 'US',
    defaultDailyTarget: 25,
    allowMarketplacePublishing: false,
    globalMonthlyAiBudgetUsd: 150,
    customCategories: [],
    theme: 'light',
  };
  db.prepare('INSERT OR IGNORE INTO app_settings (key, payload) VALUES (?, ?)').run(
    'workspace',
    JSON.stringify(initialSettings)
  );

  const initialSuppliers: SupplierConnector[] = [
    {
      id: 'cj_dropshipping',
      name: 'CJ Dropshipping',
      type: 'cj_dropshipping',
      enabled: true,
      baseUrl: 'https://developers.cjdropshipping.com/api2.0/v1',
      authHeaderName: 'CJ-Access-Token',
      hasCredentials: false,
      connectionStatus: 'unconfigured',
      capabilities: {
        supportsSearch: true,
        supportsCostLookup: true,
        supportsLiveShipping: true,
        supportsInventory: true,
        supportsSpecs: true,
        supportsOrderSync: false,
      },
      notes: 'Supports catalog search, warehouse stock counts, variant specs, and freight estimation.',
    },
    {
      id: 'aliexpress',
      name: 'AliExpress Open Platform',
      type: 'aliexpress',
      enabled: true,
      baseUrl: 'https://api-sg.aliexpress.com/sync',
      authHeaderName: 'Authorization',
      hasCredentials: false,
      connectionStatus: 'unconfigured',
      capabilities: {
        supportsSearch: true,
        supportsCostLookup: true,
        supportsLiveShipping: true,
        supportsInventory: false,
        supportsSpecs: true,
        supportsOrderSync: false,
      },
      notes: 'Supports product pricing, shipping corridors, and item attributes; real-time SKU stock requires order-level check.',
    },
    {
      id: 'autods',
      name: 'AutoDS',
      type: 'autods',
      enabled: true,
      baseUrl: 'https://api.autods.com/v1',
      authHeaderName: 'X-Api-Key',
      hasCredentials: false,
      connectionStatus: 'unconfigured',
      capabilities: {
        supportsSearch: true,
        supportsCostLookup: true,
        supportsLiveShipping: false,
        supportsInventory: true,
        supportsSpecs: false,
        supportsOrderSync: true,
      },
      notes: 'Supports inventory monitoring, cost sync, and order routing; shipping estimates depend on upstream warehouse.',
    },
  ];

  const insertSupplier = db.prepare(
    'INSERT INTO suppliers (id, name, type, enabled, payload) VALUES (?, ?, ?, ?, ?)'
  );
  for (const s of initialSuppliers) {
    insertSupplier.run(s.id, s.name, s.type, s.enabled ? 1 : 0, JSON.stringify(s));
  }

  const initialMarketplaces: MarketplaceConnector[] = [
    {
      id: 'ebay',
      name: 'eBay Browse & Inventory API',
      type: 'ebay',
      enabled: true,
      publishingEnabled: false,
      countries: ['US', 'UK', 'DE', 'CA', 'AU'],
      defaultFeePct: 13.25,
      baseUrl: 'https://api.ebay.com/buy/browse/v1',
      hasCredentials: false,
      connectionStatus: 'unconfigured',
      capabilities: {
        supportsProductSearch: true,
        supportsPricingTrends: true,
        supportsCategoryFees: true,
        supportsDraftPreparation: true,
        supportsDirectPublish: false,
      },
      policyNote: 'Publishing disabled by default. Requires explicit OAuth seller token and manual per-listing authorization.',
    },
    {
      id: 'amazon',
      name: 'Amazon Selling Partner (SP-API)',
      type: 'amazon',
      enabled: true,
      publishingEnabled: false,
      countries: ['US', 'UK', 'DE', 'CA', 'JP', 'AE'],
      defaultFeePct: 15.0,
      baseUrl: 'https://sellingpartnerapi-na.amazon.com',
      hasCredentials: false,
      connectionStatus: 'unconfigured',
      capabilities: {
        supportsProductSearch: true,
        supportsPricingTrends: true,
        supportsCategoryFees: true,
        supportsDraftPreparation: true,
        supportsDirectPublish: false,
      },
      policyNote: 'Restricted to authorized seller research and fee estimation until SP-API credentials are verified.',
    },
    {
      id: 'etsy',
      name: 'Etsy Open API v3',
      type: 'etsy',
      enabled: true,
      publishingEnabled: false,
      countries: ['US', 'UK', 'DE', 'CA', 'AU'],
      defaultFeePct: 6.5,
      baseUrl: 'https://openapi.etsy.com/v3',
      hasCredentials: false,
      connectionStatus: 'unconfigured',
      capabilities: {
        supportsProductSearch: true,
        supportsPricingTrends: false,
        supportsCategoryFees: true,
        supportsDraftPreparation: true,
        supportsDirectPublish: false,
      },
      policyNote: 'Suitable for handmade, artisan leather, home decor, and personalized goods. Direct publishing disabled by default.',
    },
  ];

  const insertMarketplace = db.prepare(
    'INSERT INTO marketplaces (id, name, type, enabled, payload) VALUES (?, ?, ?, ?, ?)'
  );
  for (const m of initialMarketplaces) {
    insertMarketplace.run(m.id, m.name, m.type, m.enabled ? 1 : 0, JSON.stringify(m));
  }

  const hasGeminiEnv = Boolean(process.env.GEMINI_API_KEY?.trim());
  const initialAIProviders: AIProviderConfig[] = [
    {
      id: 'gemini',
      name: 'Google Gemini',
      type: 'gemini',
      enabled: true,
      isDefault: true,
      isFallback: false,
      baseUrl: 'https://generativelanguage.googleapis.com',
      defaultModel: 'gemini-4-hydrogen',
      availableModels: [
        'gemini-4-hydrogen',
        'gemini-3.1-flash-lite',
        'gemini-4-neon',
        'gemini-4-carbon',
        'gemini-4-argon',
      ],
      hasCredentials: hasGeminiEnv,
      credentialSource: hasGeminiEnv ? 'server_env' : 'none',
      connectionStatus: hasGeminiEnv ? 'connected' : 'unconfigured',
      monthlySpendLimitUsd: 50,
      currentMonthSpendUsd: 0,
      totalTokensUsed: 0,
    },
    {
      id: 'openai',
      name: 'OpenAI',
      type: 'openai',
      enabled: false,
      isDefault: false,
      isFallback: true,
      baseUrl: 'https://api.openai.com/v1',
      defaultModel: 'gpt-4o-mini',
      availableModels: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1', 'o3-mini'],
      hasCredentials: Boolean(process.env.OPENAI_API_KEY?.trim()),
      credentialSource: process.env.OPENAI_API_KEY?.trim() ? 'server_env' : 'none',
      connectionStatus: process.env.OPENAI_API_KEY?.trim() ? 'connected' : 'unconfigured',
      monthlySpendLimitUsd: 40,
      currentMonthSpendUsd: 0,
      totalTokensUsed: 0,
    },
    {
      id: 'anthropic',
      name: 'Anthropic Claude',
      type: 'anthropic',
      enabled: false,
      isDefault: false,
      isFallback: false,
      baseUrl: 'https://api.anthropic.com/v1',
      defaultModel: 'claude-3-5-sonnet-latest',
      availableModels: ['claude-3-5-sonnet-latest', 'claude-3-5-haiku-latest', 'claude-3-7-sonnet-latest'],
      hasCredentials: Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
      credentialSource: process.env.ANTHROPIC_API_KEY?.trim() ? 'server_env' : 'none',
      connectionStatus: process.env.ANTHROPIC_API_KEY?.trim() ? 'connected' : 'unconfigured',
      monthlySpendLimitUsd: 40,
      currentMonthSpendUsd: 0,
      totalTokensUsed: 0,
    },
    {
      id: 'deepseek',
      name: 'DeepSeek',
      type: 'deepseek',
      enabled: false,
      isDefault: false,
      isFallback: false,
      baseUrl: 'https://api.deepseek.com/v1',
      defaultModel: 'deepseek-chat',
      availableModels: ['deepseek-chat', 'deepseek-reasoner'],
      hasCredentials: Boolean(process.env.DEEPSEEK_API_KEY?.trim()),
      credentialSource: process.env.DEEPSEEK_API_KEY?.trim() ? 'server_env' : 'none',
      connectionStatus: process.env.DEEPSEEK_API_KEY?.trim() ? 'connected' : 'unconfigured',
      monthlySpendLimitUsd: 25,
      currentMonthSpendUsd: 0,
      totalTokensUsed: 0,
    },
    {
      id: 'xai',
      name: 'xAI Grok',
      type: 'xai',
      enabled: false,
      isDefault: false,
      isFallback: false,
      baseUrl: 'https://api.x.ai/v1',
      defaultModel: 'grok-2-latest',
      availableModels: ['grok-2-latest', 'grok-beta'],
      hasCredentials: Boolean(process.env.XAI_API_KEY?.trim()),
      credentialSource: process.env.XAI_API_KEY?.trim() ? 'server_env' : 'none',
      connectionStatus: process.env.XAI_API_KEY?.trim() ? 'connected' : 'unconfigured',
      monthlySpendLimitUsd: 25,
      currentMonthSpendUsd: 0,
      totalTokensUsed: 0,
    },
  ];

  const insertProvider = db.prepare(
    'INSERT INTO ai_providers (id, name, type, enabled, payload) VALUES (?, ?, ?, ?, ?)'
  );
  for (const p of initialAIProviders) {
    insertProvider.run(p.id, p.name, p.type, p.enabled ? 1 : 0, JSON.stringify(p));
  }

  const insertTask = db.prepare(
    'INSERT INTO ai_task_assignments (task_key, payload) VALUES (?, ?)'
  );
  for (const def of AI_TASK_DEFINITIONS) {
    const modelId =
      def.taskKey === 'competition_analysis' || def.taskKey === 'opportunity_analysis'
        ? 'gemini-4-neon'
        : 'gemini-4-hydrogen';
    const assignment: AITaskAssignment = {
      taskKey: def.taskKey,
      label: def.label,
      description: def.description,
      providerId: 'gemini',
      modelId,
    };
    insertTask.run(def.taskKey, JSON.stringify(assignment));
  }

  const initialProducts: ProductRecord[] = [
    {
      id: 'prod-101',
      sku: 'UC-LTH-401',
      title: 'Full-Grain Chestnut Leather Messenger Satchel 15"',
      category: 'Leather Products',
      imageUrl: '/src/assets/images/product_leather_messenger_1795376464219.jpg',
      status: 'shortlisted',
      sellingPrice: 138.0,
      supplierCost: 44.5,
      shippingCost: 11.0,
      packagingCost: 2.5,
      marketplaceFeePct: 6.5,
      paymentFeePct: 3.0,
      adSpendPct: 9.0,
      returnAllowancePct: 2.0,
      customsPct: 4.0,
      estimatedMonthlySales: 420,
      competitionLevel: 'Low',
      opportunityScore: 86,
      targetCountry: 'US',
      primaryMarketplace: 'etsy',
      primarySupplier: 'cj_dropshipping',
      keywords: ['full grain leather bag', 'mens leather satchel', '15 inch laptop messenger', 'brass buckle bag'],
      specifications: {
        Material: 'Vegetable-tanned full-grain cowhide',
        Dimensions: '40 x 29 x 11 cm',
        Hardware: 'Solid brushed brass buckles',
        Weight: '1.35 kg',
      },
      supplierQuotes: [
        {
          supplierId: 'cj_dropshipping',
          supplierName: 'CJ Dropshipping',
          unitCost: 44.5,
          shippingCost: 11.0,
          estimatedDaysMin: 5,
          estimatedDaysMax: 8,
          stockCount: 184,
          moq: 1,
          currency: 'USD',
          supportsInventory: true,
          supportsLiveShipping: true,
          lastCheckedAt: now,
        },
        {
          supplierId: 'aliexpress',
          supplierName: 'AliExpress Open Platform',
          unitCost: 47.0,
          shippingCost: 9.5,
          estimatedDaysMin: 9,
          estimatedDaysMax: 15,
          stockCount: null,
          moq: 1,
          currency: 'USD',
          supportsInventory: false,
          supportsLiveShipping: true,
          lastCheckedAt: now,
        },
      ],
      marketplaceBenchmarks: [
        {
          marketplaceId: 'etsy',
          marketplaceName: 'Etsy',
          country: 'US',
          avgSellingPrice: 142.0,
          minSellingPrice: 112.0,
          maxSellingPrice: 195.0,
          activeListingsCount: 318,
          estimatedMonthlyDemand: 420,
          competitionLevel: 'Low',
          referralFeePct: 6.5,
        },
        {
          marketplaceId: 'amazon',
          marketplaceName: 'Amazon',
          country: 'US',
          avgSellingPrice: 129.0,
          minSellingPrice: 98.0,
          maxSellingPrice: 179.0,
          activeListingsCount: 890,
          estimatedMonthlyDemand: 510,
          competitionLevel: 'Medium',
          referralFeePct: 15.0,
        },
      ],
      researchNotes: {
        demandSummary: 'Strong year-round gifting and commuter demand with 18% QoQ search growth for vegetable-tanned satchels.',
        competitionSummary: 'Top Etsy listings rely on generic studio shots; brass hardware + padded 15" laptop sleeve differentiates cleanly.',
        riskFactors: ['Leather color batch variance', 'Dimensional weight shipping surcharges on expedited parcels'],
        targetAudience: 'Remote professionals, architects, and gift buyers aged 26-48',
        researchedAt: now,
      },
      discoveredAt: yesterday,
      updatedAt: now,
    },
    {
      id: 'prod-102',
      sku: 'UC-OFF-208',
      title: 'Anodized Aluminum Architectural LED Desk Lamp',
      category: 'Office Supplies',
      imageUrl: '/src/assets/images/product_smart_lamp_1795376463936.jpg',
      status: 'approved',
      sellingPrice: 89.0,
      supplierCost: 26.0,
      shippingCost: 8.5,
      packagingCost: 2.0,
      marketplaceFeePct: 15.0,
      paymentFeePct: 0.0,
      adSpendPct: 10.0,
      returnAllowancePct: 2.5,
      customsPct: 3.5,
      estimatedMonthlySales: 680,
      competitionLevel: 'Medium',
      opportunityScore: 84,
      targetCountry: 'US',
      primaryMarketplace: 'amazon',
      primarySupplier: 'cj_dropshipping',
      keywords: ['architectural desk lamp', 'cri 95 led task light', 'aluminum studio lamp', 'glare free monitor lamp'],
      specifications: {
        Material: 'CNC anodized 6063 aluminum',
        ColorTemp: '2700K - 6000K stepless dimming',
        CRI: 'Ra >= 95',
        Power: 'USB-C PD 18W',
      },
      supplierQuotes: [
        {
          supplierId: 'cj_dropshipping',
          supplierName: 'CJ Dropshipping',
          unitCost: 26.0,
          shippingCost: 8.5,
          estimatedDaysMin: 4,
          estimatedDaysMax: 7,
          stockCount: 540,
          moq: 1,
          currency: 'USD',
          supportsInventory: true,
          supportsLiveShipping: true,
          lastCheckedAt: now,
        },
        {
          supplierId: 'autods',
          supplierName: 'AutoDS',
          unitCost: 28.4,
          shippingCost: 7.0,
          estimatedDaysMin: 5,
          estimatedDaysMax: 9,
          stockCount: 310,
          moq: 1,
          currency: 'USD',
          supportsInventory: true,
          supportsLiveShipping: false,
          lastCheckedAt: now,
        },
      ],
      marketplaceBenchmarks: [
        {
          marketplaceId: 'amazon',
          marketplaceName: 'Amazon',
          country: 'US',
          avgSellingPrice: 91.5,
          minSellingPrice: 68.0,
          maxSellingPrice: 129.0,
          activeListingsCount: 640,
          estimatedMonthlyDemand: 680,
          competitionLevel: 'Medium',
          referralFeePct: 15.0,
        },
      ],
      researchNotes: {
        demandSummary: 'Steady home-office upgrade velocity; high conversion on CRI 95+ eye-care claims.',
        competitionSummary: 'Moderate competition around $79-$99; matte anodized finishes outperform glossy plastics.',
        riskFactors: ['UL/FCC adapter compliance documentation required for Amazon US'],
        targetAudience: 'Designers, software engineers, and home office setups',
        researchedAt: now,
      },
      discoveredAt: yesterday,
      updatedAt: now,
    },
    {
      id: 'prod-103',
      sku: 'UC-HMK-314',
      title: 'Matte Slate Ceramic Pour-Over Coffee Carafe & Dripper Set',
      category: 'Home and Kitchen',
      imageUrl: '/src/assets/images/product_ceramic_pourover_1795376465105.jpg',
      status: 'awaiting_review',
      sellingPrice: 54.0,
      supplierCost: 14.2,
      shippingCost: 6.8,
      packagingCost: 2.2,
      marketplaceFeePct: 13.25,
      paymentFeePct: 0.0,
      adSpendPct: 8.0,
      returnAllowancePct: 3.0,
      customsPct: 3.0,
      estimatedMonthlySales: 520,
      competitionLevel: 'Low',
      opportunityScore: 81,
      targetCountry: 'DE',
      primaryMarketplace: 'ebay',
      primarySupplier: 'aliexpress',
      keywords: ['ceramic pour over set', 'matte black coffee dripper', 'v60 stoneware carafe', 'specialty coffee brewer'],
      specifications: {
        Material: 'High-fired matte stoneware ceramic',
        Capacity: '600 ml carafe',
        FilterType: 'Conical 02 paper filter',
        DishwasherSafe: 'Yes',
      },
      supplierQuotes: [
        {
          supplierId: 'aliexpress',
          supplierName: 'AliExpress Open Platform',
          unitCost: 14.2,
          shippingCost: 6.8,
          estimatedDaysMin: 7,
          estimatedDaysMax: 12,
          stockCount: null,
          moq: 1,
          currency: 'USD',
          supportsInventory: false,
          supportsLiveShipping: true,
          lastCheckedAt: now,
        },
        {
          supplierId: 'cj_dropshipping',
          supplierName: 'CJ Dropshipping',
          unitCost: 15.8,
          shippingCost: 6.2,
          estimatedDaysMin: 5,
          estimatedDaysMax: 9,
          stockCount: 412,
          moq: 1,
          currency: 'USD',
          supportsInventory: true,
          supportsLiveShipping: true,
          lastCheckedAt: now,
        },
      ],
      marketplaceBenchmarks: [
        {
          marketplaceId: 'ebay',
          marketplaceName: 'eBay',
          country: 'DE',
          avgSellingPrice: 56.0,
          minSellingPrice: 42.0,
          maxSellingPrice: 74.0,
          activeListingsCount: 215,
          estimatedMonthlyDemand: 520,
          competitionLevel: 'Low',
          referralFeePct: 13.25,
        },
      ],
      researchNotes: {
        demandSummary: 'Specialty coffee gear remains resilient across EU and US markets with strong gift bundle potential.',
        competitionSummary: 'Low listing density for coordinated matte slate carafe + dripper sets.',
        riskFactors: ['Fragile ceramic transit protection requires molded pulp insert'],
        targetAudience: 'Home baristas and specialty coffee enthusiasts',
        researchedAt: now,
      },
      discoveredAt: now,
      updatedAt: now,
    },
    {
      id: 'prod-104',
      sku: 'UC-ELC-509',
      title: 'Brushed Steel Hybrid ANC Wireless Studio Headphones',
      category: 'Electronics',
      imageUrl: '/src/assets/images/product_anc_headphones_1795376464336.jpg',
      status: 'awaiting_review',
      sellingPrice: 118.0,
      supplierCost: 46.0,
      shippingCost: 9.0,
      packagingCost: 2.5,
      marketplaceFeePct: 15.0,
      paymentFeePct: 0.0,
      adSpendPct: 14.0,
      returnAllowancePct: 4.5,
      customsPct: 5.0,
      estimatedMonthlySales: 890,
      competitionLevel: 'High',
      opportunityScore: 63,
      targetCountry: 'US',
      primaryMarketplace: 'amazon',
      primarySupplier: 'autods',
      keywords: ['hybrid anc headphones', 'wireless studio headphones', '60h battery bluetooth 5.4', 'multipoint over ear'],
      specifications: {
        Drivers: '40mm beryllium-coated dynamic',
        ANC: '-42dB Hybrid Active Noise Cancellation',
        Battery: '60 hours playback, USB-C fast charge',
        Codec: 'AAC / SBC / LDAC',
      },
      supplierQuotes: [
        {
          supplierId: 'autods',
          supplierName: 'AutoDS',
          unitCost: 46.0,
          shippingCost: 9.0,
          estimatedDaysMin: 4,
          estimatedDaysMax: 7,
          stockCount: 95,
          moq: 1,
          currency: 'USD',
          supportsInventory: true,
          supportsLiveShipping: false,
          lastCheckedAt: now,
        },
      ],
      marketplaceBenchmarks: [
        {
          marketplaceId: 'amazon',
          marketplaceName: 'Amazon',
          country: 'US',
          avgSellingPrice: 119.0,
          minSellingPrice: 79.0,
          maxSellingPrice: 179.0,
          activeListingsCount: 3420,
          estimatedMonthlyDemand: 890,
          competitionLevel: 'High',
          referralFeePct: 15.0,
        },
      ],
      researchNotes: {
        demandSummary: 'High search volume, but elevated TACoS (14%) and return rates compress net margin.',
        competitionSummary: 'Crowded incumbent space; requires clear acoustic test data or extended warranty positioning.',
        riskFactors: ['High category ad CPCs', 'Lithium battery air-freight restrictions', '4.5% return allowance'],
        targetAudience: 'Commuters and remote workers seeking sub-$130 ANC audio',
        researchedAt: now,
      },
      discoveredAt: now,
      updatedAt: now,
    },
    {
      id: 'prod-105',
      sku: 'UC-TLS-712',
      title: 'Grade-5 Machined Titanium 12-in-1 Pocket Multi-Tool & Carabiner',
      category: 'Tools and Hardware',
      imageUrl: '/src/assets/images/product_titanium_multitool_1795376464098.jpg',
      status: 'shortlisted',
      sellingPrice: 64.0,
      supplierCost: 17.5,
      shippingCost: 4.5,
      packagingCost: 1.5,
      marketplaceFeePct: 13.25,
      paymentFeePct: 0.0,
      adSpendPct: 8.5,
      returnAllowancePct: 1.5,
      customsPct: 3.0,
      estimatedMonthlySales: 560,
      competitionLevel: 'Low',
      opportunityScore: 89,
      targetCountry: 'US',
      primaryMarketplace: 'ebay',
      primarySupplier: 'cj_dropshipping',
      keywords: ['titanium edc multitool', 'cnc pocket tool', 'everyday carry carabiner', '12 in 1 camping tool'],
      specifications: {
        Alloy: 'TC4 Grade-5 Titanium',
        Functions: '12 integrated tools + spring gate carabiner',
        Weight: '78 g',
        Finish: 'Bead-blasted matte titanium',
      },
      supplierQuotes: [
        {
          supplierId: 'cj_dropshipping',
          supplierName: 'CJ Dropshipping',
          unitCost: 17.5,
          shippingCost: 4.5,
          estimatedDaysMin: 4,
          estimatedDaysMax: 7,
          stockCount: 720,
          moq: 1,
          currency: 'USD',
          supportsInventory: true,
          supportsLiveShipping: true,
          lastCheckedAt: now,
        },
      ],
      marketplaceBenchmarks: [
        {
          marketplaceId: 'ebay',
          marketplaceName: 'eBay',
          country: 'US',
          avgSellingPrice: 66.0,
          minSellingPrice: 48.0,
          maxSellingPrice: 88.0,
          activeListingsCount: 184,
          estimatedMonthlyDemand: 560,
          competitionLevel: 'Low',
          referralFeePct: 13.25,
        },
      ],
      researchNotes: {
        demandSummary: 'Low parcel weight ($4.50 shipping) and strong EDC enthusiast repeat purchase behavior.',
        competitionSummary: 'Most competitors sell heavier stainless steel clones; genuine TC4 titanium commands 2x price.',
        riskFactors: ['Verify alloy grade via supplier material certificate'],
        targetAudience: 'Outdoor hikers, technicians, and EDC collectors',
        researchedAt: now,
      },
      discoveredAt: now,
      updatedAt: now,
    },
    {
      id: 'prod-106',
      sku: 'UC-PET-804',
      title: 'Steam Mist Self-Cleaning Silicone Pet Grooming Brush',
      category: 'Pet Supplies',
      imageUrl: '',
      status: 'rejected',
      sellingPrice: 24.0,
      supplierCost: 8.2,
      shippingCost: 5.5,
      packagingCost: 1.2,
      marketplaceFeePct: 15.0,
      paymentFeePct: 0.0,
      adSpendPct: 18.0,
      returnAllowancePct: 4.0,
      customsPct: 3.0,
      estimatedMonthlySales: 950,
      competitionLevel: 'High',
      opportunityScore: 44,
      targetCountry: 'UK',
      primaryMarketplace: 'amazon',
      primarySupplier: 'aliexpress',
      keywords: ['steam cat brush', 'self cleaning pet brush', 'deshedding dog mist comb'],
      specifications: {
        Battery: 'USB rechargeable 150mAh',
        Bristles: 'Food-grade rounded silicone',
        Tank: '28ml water mist reservoir',
      },
      supplierQuotes: [
        {
          supplierId: 'aliexpress',
          supplierName: 'AliExpress Open Platform',
          unitCost: 8.2,
          shippingCost: 5.5,
          estimatedDaysMin: 8,
          estimatedDaysMax: 14,
          stockCount: null,
          moq: 1,
          currency: 'USD',
          supportsInventory: false,
          supportsLiveShipping: true,
          lastCheckedAt: now,
        },
      ],
      marketplaceBenchmarks: [
        {
          marketplaceId: 'amazon',
          marketplaceName: 'Amazon',
          country: 'UK',
          avgSellingPrice: 22.99,
          minSellingPrice: 14.99,
          maxSellingPrice: 29.99,
          activeListingsCount: 2400,
          estimatedMonthlyDemand: 950,
          competitionLevel: 'High',
          referralFeePct: 15.0,
        },
      ],
      researchNotes: {
        demandSummary: 'High impulse volume, but price erosion below $24 makes paid acquisition unprofitable.',
        competitionSummary: 'Saturated across Amazon UK and eBay with >2,000 identical generic SKUs.',
        riskFactors: ['Negative net margin after 18% ad spend', 'High price-war pressure'],
        targetAudience: 'Pet owners',
        researchedAt: now,
      },
      discoveredAt: yesterday,
      updatedAt: now,
    },
  ];

  const insertProduct = db.prepare(
    'INSERT INTO products (id, sku, title, category, status, opportunity_score, discovered_at, updated_at, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  for (const p of initialProducts) {
    insertProduct.run(
      p.id,
      p.sku,
      p.title,
      p.category,
      p.status,
      p.opportunityScore,
      p.discoveredAt,
      p.updatedAt,
      JSON.stringify(p)
    );
  }

  const initialDiscoveryConfig: DiscoveryConfig = {
    id: 'cfg-default',
    name: 'Global Multi-Category High-Margin Scan',
    categories: STANDARD_CATEGORIES.slice(0, 6),
    allCategories: true,
    keywords: ['ergonomic', 'titanium', 'minimalist', 'wireless', 'ceramic'],
    dailyTarget: 25,
    minCost: 10,
    maxCost: 80,
    targetCountries: ['US', 'UK', 'DE'],
    targetMarketplaces: ['ebay', 'amazon', 'etsy'],
    minExpectedProfit: 12,
    minNetMarginPct: 22,
    enabledSuppliers: ['cj_dropshipping', 'aliexpress', 'autods'],
    createdAt: now,
  };
  db.prepare(
    'INSERT INTO discovery_configs (id, name, created_at, payload) VALUES (?, ?, ?, ?)'
  ).run(
    initialDiscoveryConfig.id,
    initialDiscoveryConfig.name,
    initialDiscoveryConfig.createdAt,
    JSON.stringify(initialDiscoveryConfig)
  );

  const initialDraft: ListingDraft = {
    id: 'draft-101',
    productId: 'prod-101',
    marketplaceId: 'etsy',
    country: 'US',
    language: 'en',
    seoTitle: 'Full-Grain Chestnut Leather Messenger Bag 15" Laptop Satchel Solid Brass',
    bulletPoints: [
      'Hand-selected vegetable-tanned full-grain chestnut cowhide leather that develops a rich patina',
      'Padded internal 15-inch laptop sleeve with dual front organizer pockets',
      'Heavy-duty solid brushed brass buckles and reinforced shoulder strap pad',
      'Quick-release magnetic snaps concealed beneath traditional buckle straps',
    ],
    descriptionHtmlSafe:
      'Built for daily studio, commute, and travel use, this 15-inch messenger satchel pairs full-grain chestnut cowhide with solid brushed brass hardware. Inside, a dedicated cushioned compartment protects laptops up to 15.6 inches alongside pockets for notebooks, cables, and chargers.',
    tags: [
      'leather messenger bag',
      'full grain satchel',
      '15 inch laptop bag',
      'mens leather briefcase',
      'chestnut leather',
      'brass buckle bag',
      'commuter work bag',
    ],
    suggestedPrice: 138.0,
    publishAuthorized: false,
    status: 'draft',
    createdAt: now,
    updatedAt: now,
  };
  db.prepare(
    'INSERT INTO listing_drafts (id, product_id, marketplace_id, updated_at, payload) VALUES (?, ?, ?, ?, ?)'
  ).run(
    initialDraft.id,
    initialDraft.productId,
    initialDraft.marketplaceId,
    initialDraft.updatedAt,
    JSON.stringify(initialDraft)
  );

  const initialActivities: ActivityEvent[] = [
    {
      id: 'act-1',
      category: 'discovery',
      title: 'Multi-category scan completed',
      detail: 'Evaluated 6 candidate SKUs across Leather Products, Office Supplies, Home & Kitchen, Electronics, and Tools.',
      createdAt: now,
    },
    {
      id: 'act-2',
      category: 'queue',
      title: 'Approved Anodized Aluminum Desk Lamp',
      detail: 'SKU UC-OFF-208 cleared 24.8% net margin threshold on Amazon US.',
      createdAt: now,
    },
    {
      id: 'act-3',
      category: 'marketplace',
      title: 'Publishing safety lock active',
      detail: 'All marketplace direct-publish endpoints remain disabled until explicit seller authorization.',
      createdAt: yesterday,
    },
  ];
  const insertAct = db.prepare(
    'INSERT INTO activity_logs (id, category, created_at, payload) VALUES (?, ?, ?, ?)'
  );
  for (const a of initialActivities) {
    insertAct.run(a.id, a.category, a.createdAt, JSON.stringify(a));
  }
}

export function logActivity(
  category: ActivityEvent['category'],
  title: string,
  detail: string
): ActivityEvent {
  const db = getDb();
  const event: ActivityEvent = {
    id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    category,
    title,
    detail,
    createdAt: new Date().toISOString(),
  };
  db.prepare(
    'INSERT INTO activity_logs (id, category, created_at, payload) VALUES (?, ?, ?, ?)'
  ).run(event.id, event.category, event.createdAt, JSON.stringify(event));
  return event;
}

export function getWorkspaceSettings(): AppSettings {
  const db = getDb();
  const row = db
    .prepare('SELECT payload FROM app_settings WHERE key = ?')
    .get('workspace') as { payload: string } | undefined;
  if (!row) {
    return {
      workspaceName: 'Global Commerce Operations',
      defaultCurrency: 'USD',
      defaultCountry: 'US',
      defaultDailyTarget: 25,
      allowMarketplacePublishing: false,
      globalMonthlyAiBudgetUsd: 150,
      customCategories: [],
      theme: 'light',
    };
  }
  return JSON.parse(row.payload) as AppSettings;
}

export function saveWorkspaceSettings(settings: AppSettings): AppSettings {
  const db = getDb();
  db.prepare(
    'INSERT OR REPLACE INTO app_settings (key, payload) VALUES (?, ?)'
  ).run('workspace', JSON.stringify(settings));
  return settings;
}
