import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateProfitability,
  calculateOpportunityScore,
  checkListingCompliance,
  getMarketplaceFeeDefaults,
} from './commerceMath.ts';

test('calculateProfitability computes accurate net profit, margin, ROI, and break-even', () => {
  const result = calculateProfitability({
    sellingPrice: 100,
    supplierCost: 28,
    shippingCost: 7,
    packagingCost: 2,
    marketplaceFeePct: 15,
    paymentFeePct: 3,
    paymentFixedFee: 0.3,
    adSpendPct: 10,
    returnAllowancePct: 2,
    customsPct: 5,
    taxPct: 0,
  });

  // Customs = 28 * 0.05 = 1.40
  assert.equal(result.customsCost, 1.4);
  // Landed = 28 + 7 + 2 + 1.4 = 38.40
  assert.equal(result.landedProductCost, 38.4);
  // Variable fees: 15 + 3.30 + 10 + 2 = 30.30
  assert.equal(result.marketplaceFee, 15);
  assert.equal(result.paymentFee, 3.3);
  assert.equal(result.adSpendCost, 10);
  assert.equal(result.returnReserve, 2);
  // Total = 38.40 + 30.30 = 68.70
  assert.equal(result.totalCosts, 68.7);
  assert.equal(result.netProfit, 31.3);
  assert.equal(result.netMarginPct, 31.3);
  assert.ok(result.breakEvenPrice > 0 && result.breakEvenPrice < 100);
});

test('calculateProfitability handles zero selling price gracefully', () => {
  const result = calculateProfitability({
    sellingPrice: 0,
    supplierCost: 15,
    shippingCost: 5,
    packagingCost: 1,
    marketplaceFeePct: 13.25,
    paymentFeePct: 0,
    paymentFixedFee: 0.3,
    adSpendPct: 8,
    returnAllowancePct: 2,
    customsPct: 0,
    taxPct: 0,
  });

  assert.equal(result.grossRevenue, 0);
  assert.equal(result.paymentFee, 0);
  assert.equal(result.netProfit, -21);
  assert.equal(result.netMarginPct, 0);
});

test('calculateOpportunityScore scores high-margin low-competition fast-shipping products high', () => {
  const high = calculateOpportunityScore({
    netMarginPct: 36,
    netProfit: 24,
    estimatedMonthlySales: 650,
    competitionLevel: 'Low',
    avgShippingDays: 4,
    hasInStockSupplier: true,
  });
  assert.equal(high.score, 100);
  assert.equal(high.verdict, 'High');

  const low = calculateOpportunityScore({
    netMarginPct: 8,
    netProfit: 3,
    estimatedMonthlySales: 40,
    competitionLevel: 'High',
    avgShippingDays: 18,
    hasInStockSupplier: false,
  });
  assert.ok(low.score < 52);
  assert.equal(low.verdict, 'Low');
});

test('checkListingCompliance enforces marketplace title and tag limits', () => {
  const ebayRules = getMarketplaceFeeDefaults('ebay');
  assert.equal(ebayRules.titleMaxChars, 80);

  const overTitle = 'A'.repeat(85);
  const check = checkListingCompliance('ebay', overTitle, ['a', 'b']);
  assert.equal(check.titleCompliant, false);
  assert.equal(check.tagsCompliant, true);

  const etsyCheck = checkListingCompliance('etsy', 'Handcrafted Leather Messenger Bag', Array(13).fill('tag'));
  assert.equal(etsyCheck.titleCompliant, true);
  assert.equal(etsyCheck.tagsCompliant, true);

  const etsyTooManyTags = checkListingCompliance('etsy', 'Handcrafted Bag', Array(14).fill('tag'));
  assert.equal(etsyTooManyTags.tagsCompliant, false);
});
