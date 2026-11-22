import { STANDARD_CATEGORIES } from '../src/data/catalogConstants.ts';
import type {
  DiscoveryConfig,
  ProductRecord,
} from '../src/types/commerce.ts';
import {
  calculateOpportunityScore,
  calculateProfitability,
  getMarketplaceFeeDefaults,
} from '../src/utils/commerceMath.ts';
import { researchMarketplacePrices } from './connectors/marketplaces.ts';
import { buildSupplierQuotesForCategory, searchSupplierCatalog } from './connectors/suppliers.ts';
import { getDb, logActivity } from './db.ts';

export function runUniversalDiscovery(config: DiscoveryConfig): {
  discovered: ProductRecord[];
  evaluatedCount: number;
  skippedByFilters: number;
} {
  const db = getDb();
  const targetCount = Math.max(1, Math.min(500, Math.floor(config.dailyTarget || 25)));
  const activeCategories =
    config.allCategories || config.categories.length === 0
      ? STANDARD_CATEGORIES
      : config.categories;

  const existingRows = db.prepare('SELECT title FROM products').all() as Array<{ title: string }>;
  const existingTitles = new Set(existingRows.map((r) => r.title.toLowerCase()));

  const catalogItems = searchSupplierCatalog({});
  const candidatePool = catalogItems.filter((item) => {
    if (!config.allCategories && !activeCategories.includes(item.category)) {
      return false;
    }
    if (config.enabledSuppliers.length > 0 && !config.enabledSuppliers.includes(item.supplierId)) {
      return false;
    }
    if (config.keywords.length > 0) {
      const text = `${item.title} ${item.category}`.toLowerCase();
      const matchesKeyword = config.keywords.some((kw) => text.includes(kw.toLowerCase().trim()));
      // If user explicitly provided keywords, prioritize keyword matches but allow category matches when pool is small
      if (!matchesKeyword && config.keywords.length <= 2) {
        // Check if any catalog item matches the keywords at all
        const anyMatch = catalogItems.some((ci) =>
          config.keywords.some((kw) => `${ci.title} ${ci.category}`.toLowerCase().includes(kw.toLowerCase().trim()))
        );
        if (anyMatch) return false;
      }
    }
    return true;
  });

  const targetMarketplace = config.targetMarketplaces[0] || 'ebay';
  const targetCountry = config.targetCountries[0] || 'US';
  const feeDefaults = getMarketplaceFeeDefaults(targetMarketplace);

  const discovered: ProductRecord[] = [];
  let evaluatedCount = 0;
  let skippedByFilters = 0;

  const insertStmt = db.prepare(
    'INSERT INTO products (id, sku, title, category, status, opportunity_score, discovered_at, updated_at, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );

  // Deduplicate by title across supplier quotes while respecting dailyTarget
  const seenInRun = new Set<string>();
  const sourceItems = candidatePool.length > 0 ? candidatePool : catalogItems;

  for (let i = 0; i < sourceItems.length && discovered.length < targetCount; i++) {
    const item = sourceItems[i];
    const normalizedTitle = item.title.toLowerCase();
    if (seenInRun.has(normalizedTitle)) continue;
    seenInRun.add(normalizedTitle);
    evaluatedCount++;

    if (item.unitCost < config.minCost || item.unitCost > config.maxCost) {
      skippedByFilters++;
      continue;
    }

    const benchmarks = researchMarketplacePrices({
      query: item.title,
      marketplaceIds: config.targetMarketplaces,
      country: targetCountry,
    });
    const primaryBench = benchmarks[0];
    const sellingPrice = primaryBench
      ? Math.max(Math.round(item.unitCost * 2.65 * 100) / 100, primaryBench.avgSellingPrice)
      : Math.round(item.unitCost * 2.8 * 100) / 100;

    const shippingCost = item.shippingCost > 0 ? item.shippingCost : 5.5;
    const profit = calculateProfitability({
      sellingPrice,
      supplierCost: item.unitCost,
      shippingCost,
      packagingCost: 1.75,
      marketplaceFeePct: feeDefaults.marketplaceFeePct,
      paymentFeePct: feeDefaults.paymentFeePct,
      paymentFixedFee: feeDefaults.paymentFixedFee,
      adSpendPct: 9.0,
      returnAllowancePct: 2.0,
      customsPct: 3.5,
      taxPct: 0,
    });

    if (profit.netProfit < config.minExpectedProfit || profit.netMarginPct < config.minNetMarginPct) {
      skippedByFilters++;
      continue;
    }

    const uniqueSuffix = existingTitles.has(normalizedTitle)
      ? ` (${targetCountry} Batch)`
      : '';
    const finalTitle = `${item.title}${uniqueSuffix}`;
    existingTitles.add(finalTitle.toLowerCase());

    const quotes = buildSupplierQuotesForCategory(
      item.unitCost,
      shippingCost,
      config.enabledSuppliers
    );
    const competitionLevel = primaryBench?.competitionLevel || 'Medium';
    const monthlySales = primaryBench?.estimatedMonthlyDemand || 380;
    const scoreRes = calculateOpportunityScore({
      netMarginPct: profit.netMarginPct,
      netProfit: profit.netProfit,
      estimatedMonthlySales: monthlySales,
      competitionLevel,
      avgShippingDays: item.estimatedDaysMax || 7,
      hasInStockSupplier: quotes.some((q) => q.stockCount === null || q.stockCount > 0),
    });

    const now = new Date().toISOString();
    const id = `prod-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const sku = `UC-${item.category.slice(0, 3).toUpperCase()}-${Math.floor(100 + Math.random() * 899)}`;

    const record: ProductRecord = {
      id,
      sku,
      title: finalTitle,
      category: item.category,
      imageUrl: '',
      status: 'awaiting_review',
      sellingPrice,
      supplierCost: item.unitCost,
      shippingCost,
      packagingCost: 1.75,
      marketplaceFeePct: feeDefaults.marketplaceFeePct,
      paymentFeePct: feeDefaults.paymentFeePct,
      adSpendPct: 9.0,
      returnAllowancePct: 2.0,
      customsPct: 3.5,
      estimatedMonthlySales: monthlySales,
      competitionLevel,
      opportunityScore: scoreRes.score,
      targetCountry,
      primaryMarketplace: targetMarketplace,
      primarySupplier: item.supplierId,
      keywords: [
        ...config.keywords.slice(0, 3),
        item.category.toLowerCase(),
        ...item.title.toLowerCase().split(' ').slice(0, 3),
      ],
      specifications: item.specifications || { Source: item.supplierName },
      supplierQuotes: quotes,
      marketplaceBenchmarks: benchmarks,
      researchNotes: {
        demandSummary: `Discovered via ${config.name}. Estimated ${monthlySales} units/mo in ${targetCountry} across ${targetMarketplace}.`,
        competitionSummary: `Benchmark competition rated ${competitionLevel} with average price range $${primaryBench?.minSellingPrice ?? sellingPrice}–$${primaryBench?.maxSellingPrice ?? sellingPrice}.`,
        riskFactors: ['Verify supplier stock and transit times before scaling ad spend'],
        targetAudience: `${item.category} buyers in ${targetCountry}`,
        researchedAt: now,
      },
      discoveredAt: now,
      updatedAt: now,
    };

    insertStmt.run(
      record.id,
      record.sku,
      record.title,
      record.category,
      record.status,
      record.opportunityScore,
      record.discoveredAt,
      record.updatedAt,
      JSON.stringify(record)
    );
    discovered.push(record);
  }

  logActivity(
    'discovery',
    `Discovered ${discovered.length} products`,
    `Config "${config.name}" evaluated ${evaluatedCount} supplier items (target ${targetCount}/day, ${skippedByFilters} filtered out).`
  );

  return { discovered, evaluatedCount, skippedByFilters };
}
