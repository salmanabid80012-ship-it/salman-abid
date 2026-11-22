import type {
  CompetitionLevel,
  DiscoveryConfig,
  ProductRecord,
  ProfitBreakdown,
  ProfitInput,
} from '../types/commerce.ts';

export function roundCurrency(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

export function calculateProfitability(input: ProfitInput): ProfitBreakdown {
  const sellingPrice = Math.max(0, input.sellingPrice || 0);
  const supplierCost = Math.max(0, input.supplierCost || 0);
  const shippingCost = Math.max(0, input.shippingCost || 0);
  const packagingCost = Math.max(0, input.packagingCost || 0);
  const customsPct = Math.max(0, input.customsPct || 0);
  const marketplaceFeePct = Math.max(0, input.marketplaceFeePct || 0);
  const paymentFeePct = Math.max(0, input.paymentFeePct || 0);
  const paymentFixedFee = Math.max(0, input.paymentFixedFee || 0);
  const adSpendPct = Math.max(0, input.adSpendPct || 0);
  const returnAllowancePct = Math.max(0, input.returnAllowancePct || 0);
  const taxPct = Math.max(0, input.taxPct || 0);

  const customsCost = roundCurrency(supplierCost * (customsPct / 100));
  const landedProductCost = roundCurrency(supplierCost + shippingCost + packagingCost + customsCost);

  const marketplaceFee = roundCurrency(sellingPrice * (marketplaceFeePct / 100));
  const paymentFee = sellingPrice > 0 ? roundCurrency(sellingPrice * (paymentFeePct / 100) + paymentFixedFee) : 0;
  const adSpendCost = roundCurrency(sellingPrice * (adSpendPct / 100));
  const returnReserve = roundCurrency(sellingPrice * (returnAllowancePct / 100));
  const taxCost = roundCurrency(sellingPrice * (taxPct / 100));

  const totalCosts = roundCurrency(
    landedProductCost + marketplaceFee + paymentFee + adSpendCost + returnReserve + taxCost
  );
  const netProfit = roundCurrency(sellingPrice - totalCosts);
  const netMarginPct = sellingPrice > 0 ? roundCurrency((netProfit / sellingPrice) * 100) : 0;
  const roiPct = landedProductCost > 0 ? roundCurrency((netProfit / landedProductCost) * 100) : 0;

  const variablePctSum =
    (marketplaceFeePct + paymentFeePct + adSpendPct + returnAllowancePct + taxPct) / 100;
  const fixedCosts = landedProductCost + paymentFixedFee;
  const breakEvenPrice =
    variablePctSum < 0.99 ? roundCurrency(fixedCosts / (1 - variablePctSum)) : 0;

  const breakEvenRoas =
    adSpendCost > 0
      ? roundCurrency(sellingPrice / Math.max(0.01, netProfit + adSpendCost))
      : netProfit > 0 && sellingPrice > 0
        ? roundCurrency(sellingPrice / netProfit)
        : null;

  return {
    grossRevenue: roundCurrency(sellingPrice),
    landedProductCost,
    customsCost,
    marketplaceFee,
    paymentFee,
    adSpendCost,
    returnReserve,
    taxCost,
    totalCosts,
    netProfit,
    netMarginPct,
    roiPct,
    breakEvenPrice,
    breakEvenRoas,
  };
}

export interface OpportunityScoreInput {
  netMarginPct: number;
  netProfit: number;
  estimatedMonthlySales: number;
  competitionLevel: CompetitionLevel;
  avgShippingDays: number;
  hasInStockSupplier: boolean;
}

export interface OpportunityScoreResult {
  score: number;
  verdict: 'High' | 'Moderate' | 'Low';
  components: {
    marginScore: number;
    profitDollarScore: number;
    demandScore: number;
    competitionScore: number;
    logisticsScore: number;
  };
}

export function calculateOpportunityScore(input: OpportunityScoreInput): OpportunityScoreResult {
  // 0-30 pts for margin (35%+ margin earns full 30 pts)
  const marginScore = Math.round(Math.max(0, Math.min(30, (input.netMarginPct / 35) * 30)));
  // 0-20 pts for unit profit ($20+ unit profit earns full 20 pts)
  const profitDollarScore = Math.round(Math.max(0, Math.min(20, (input.netProfit / 20) * 20)));
  // 0-25 pts for monthly demand (600+ monthly units earns full 25 pts)
  const demandScore = Math.round(Math.max(0, Math.min(25, (input.estimatedMonthlySales / 600) * 25)));
  // 0-15 pts for competition level
  const competitionScore =
    input.competitionLevel === 'Low' ? 15 : input.competitionLevel === 'Medium' ? 9 : 4;
  // 0-10 pts for shipping speed & stock availability
  const speedPts = input.avgShippingDays <= 5 ? 7 : input.avgShippingDays <= 10 ? 5 : 2;
  const stockPts = input.hasInStockSupplier ? 3 : 0;
  const logisticsScore = speedPts + stockPts;

  const score = Math.max(
    0,
    Math.min(100, marginScore + profitDollarScore + demandScore + competitionScore + logisticsScore)
  );
  const verdict = score >= 74 ? 'High' : score >= 52 ? 'Moderate' : 'Low';

  return {
    score,
    verdict,
    components: {
      marginScore,
      profitDollarScore,
      demandScore,
      competitionScore,
      logisticsScore,
    },
  };
}

export function getMarketplaceFeeDefaults(marketplaceId: string): {
  marketplaceFeePct: number;
  paymentFeePct: number;
  paymentFixedFee: number;
  titleMaxChars: number;
  maxTags: number;
} {
  switch (marketplaceId) {
    case 'amazon':
      return {
        marketplaceFeePct: 15,
        paymentFeePct: 0,
        paymentFixedFee: 0,
        titleMaxChars: 200,
        maxTags: 5,
      };
    case 'ebay':
      return {
        marketplaceFeePct: 13.25,
        paymentFeePct: 0,
        paymentFixedFee: 0.3,
        titleMaxChars: 80,
        maxTags: 8,
      };
    case 'etsy':
      return {
        marketplaceFeePct: 6.5,
        paymentFeePct: 3.0,
        paymentFixedFee: 0.25,
        titleMaxChars: 140,
        maxTags: 13,
      };
    default:
      return {
        marketplaceFeePct: 12,
        paymentFeePct: 2.9,
        paymentFixedFee: 0.3,
        titleMaxChars: 150,
        maxTags: 10,
      };
  }
}

export function checkListingCompliance(
  marketplaceId: string,
  title: string,
  tags: string[]
): {
  titleLength: number;
  titleMaxChars: number;
  titleCompliant: boolean;
  tagCount: number;
  maxTags: number;
  tagsCompliant: boolean;
} {
  const rules = getMarketplaceFeeDefaults(marketplaceId);
  const trimmedTitle = title.trim();
  return {
    titleLength: trimmedTitle.length,
    titleMaxChars: rules.titleMaxChars,
    titleCompliant: trimmedTitle.length > 0 && trimmedTitle.length <= rules.titleMaxChars,
    tagCount: tags.length,
    maxTags: rules.maxTags,
    tagsCompliant: tags.length <= rules.maxTags,
  };
}

export function productMatchesDiscoveryConfig(
  product: ProductRecord,
  config: Pick<
    DiscoveryConfig,
    | 'allCategories'
    | 'categories'
    | 'minCost'
    | 'maxCost'
    | 'minExpectedProfit'
    | 'minNetMarginPct'
    | 'enabledSuppliers'
  >
): boolean {
  if (!config.allCategories && config.categories.length > 0) {
    if (!config.categories.includes(product.category)) return false;
  }
  if (product.supplierCost < config.minCost || product.supplierCost > config.maxCost) {
    return false;
  }
  if (
    config.enabledSuppliers.length > 0 &&
    !config.enabledSuppliers.includes(product.primarySupplier)
  ) {
    return false;
  }
  const profit = calculateProfitability({
    sellingPrice: product.sellingPrice,
    supplierCost: product.supplierCost,
    shippingCost: product.shippingCost,
    packagingCost: product.packagingCost,
    marketplaceFeePct: product.marketplaceFeePct,
    paymentFeePct: product.paymentFeePct,
    paymentFixedFee: 0.3,
    adSpendPct: product.adSpendPct,
    returnAllowancePct: product.returnAllowancePct,
    customsPct: product.customsPct,
    taxPct: 0,
  });
  if (profit.netProfit < config.minExpectedProfit) return false;
  if (profit.netMarginPct < config.minNetMarginPct) return false;
  return true;
}

export function buildPriceSensitivityRows(input: ProfitInput): Array<{
  price: number;
  netProfit: number;
  netMarginPct: number;
  roiPct: number;
}> {
  const base = Math.max(5, input.sellingPrice || 20);
  const multipliers = [0.85, 0.92, 1.0, 1.08, 1.15];
  return multipliers.map((m) => {
    const price = roundCurrency(base * m);
    const res = calculateProfitability({ ...input, sellingPrice: price });
    return {
      price,
      netProfit: res.netProfit,
      netMarginPct: res.netMarginPct,
      roiPct: res.roiPct,
    };
  });
}
