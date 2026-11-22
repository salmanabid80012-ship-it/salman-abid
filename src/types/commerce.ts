export type NavSection =
  | 'dashboard'
  | 'discovery'
  | 'research'
  | 'suppliers'
  | 'marketplaces'
  | 'ai-hub'
  | 'calculator'
  | 'listings'
  | 'queue'
  | 'analytics'
  | 'integrations'
  | 'settings';

export type ProductStatus =
  | 'awaiting_review'
  | 'shortlisted'
  | 'approved'
  | 'rejected'
  | 'draft_ready';

export type CompetitionLevel = 'Low' | 'Medium' | 'High';

export interface SupplierQuote {
  supplierId: string;
  supplierName: string;
  unitCost: number;
  shippingCost: number;
  estimatedDaysMin: number;
  estimatedDaysMax: number;
  stockCount: number | null; // null if unsupported by connector
  moq: number;
  currency: string;
  supportsInventory: boolean;
  supportsLiveShipping: boolean;
  lastCheckedAt: string;
}

export interface MarketplaceBenchmark {
  marketplaceId: string;
  marketplaceName: string;
  country: string;
  avgSellingPrice: number;
  minSellingPrice: number;
  maxSellingPrice: number;
  activeListingsCount: number | null;
  estimatedMonthlyDemand: number;
  competitionLevel: CompetitionLevel;
  referralFeePct: number;
}

export interface ProductResearchNotes {
  demandSummary: string;
  competitionSummary: string;
  riskFactors: string[];
  targetAudience: string;
  aiSummary?: string;
  aiModelUsed?: string;
  researchedAt: string;
}

export interface ProductRecord {
  id: string;
  sku: string;
  title: string;
  category: string;
  imageUrl: string;
  status: ProductStatus;
  sellingPrice: number;
  supplierCost: number;
  shippingCost: number;
  packagingCost: number;
  marketplaceFeePct: number;
  paymentFeePct: number;
  adSpendPct: number;
  returnAllowancePct: number;
  customsPct: number;
  estimatedMonthlySales: number;
  competitionLevel: CompetitionLevel;
  opportunityScore: number;
  targetCountry: string;
  primaryMarketplace: string;
  primarySupplier: string;
  keywords: string[];
  specifications: Record<string, string>;
  supplierQuotes: SupplierQuote[];
  marketplaceBenchmarks: MarketplaceBenchmark[];
  researchNotes?: ProductResearchNotes;
  discoveredAt: string;
  updatedAt: string;
}

export interface DiscoveryConfig {
  id: string;
  name: string;
  categories: string[];
  allCategories: boolean;
  keywords: string[];
  dailyTarget: number;
  minCost: number;
  maxCost: number;
  targetCountries: string[];
  targetMarketplaces: string[];
  minExpectedProfit: number;
  minNetMarginPct: number;
  enabledSuppliers: string[];
  createdAt: string;
}

export interface SupplierCapabilities {
  supportsSearch: boolean;
  supportsCostLookup: boolean;
  supportsLiveShipping: boolean;
  supportsInventory: boolean;
  supportsSpecs: boolean;
  supportsOrderSync: boolean;
}

export interface SupplierConnector {
  id: string;
  name: string;
  type: 'cj_dropshipping' | 'aliexpress' | 'autods' | 'custom';
  enabled: boolean;
  baseUrl: string;
  authHeaderName?: string;
  hasCredentials: boolean;
  maskedCredential?: string;
  connectionStatus: 'connected' | 'unconfigured' | 'error' | 'disabled';
  lastTestedAt?: string;
  lastError?: string;
  capabilities: SupplierCapabilities;
  notes: string;
}

export interface MarketplaceCapabilities {
  supportsProductSearch: boolean;
  supportsPricingTrends: boolean;
  supportsCategoryFees: boolean;
  supportsDraftPreparation: boolean;
  supportsDirectPublish: boolean;
}

export interface MarketplaceConnector {
  id: string;
  name: string;
  type: 'ebay' | 'amazon' | 'etsy' | 'custom';
  enabled: boolean;
  publishingEnabled: boolean; // Always false by default per safety specification
  countries: string[];
  defaultFeePct: number;
  baseUrl: string;
  hasCredentials: boolean;
  maskedCredential?: string;
  connectionStatus: 'connected' | 'unconfigured' | 'error' | 'disabled';
  lastTestedAt?: string;
  lastError?: string;
  capabilities: MarketplaceCapabilities;
  policyNote: string;
}

export type AIProviderType =
  | 'gemini'
  | 'openai'
  | 'anthropic'
  | 'deepseek'
  | 'xai'
  | 'custom_openai';

export interface AIProviderConfig {
  id: string;
  name: string;
  type: AIProviderType;
  enabled: boolean;
  isDefault: boolean;
  isFallback: boolean;
  baseUrl: string;
  defaultModel: string;
  availableModels: string[];
  hasCredentials: boolean;
  credentialSource: 'server_env' | 'encrypted_vault' | 'none';
  maskedCredential?: string;
  connectionStatus: 'connected' | 'unconfigured' | 'error' | 'disabled';
  monthlySpendLimitUsd: number;
  currentMonthSpendUsd: number;
  totalTokensUsed: number;
  lastTestedAt?: string;
  lastError?: string;
}

export type AITaskKey =
  | 'product_research'
  | 'opportunity_analysis'
  | 'categorization'
  | 'seo_title'
  | 'product_description'
  | 'keyword_suggestions'
  | 'image_analysis'
  | 'specification_analysis'
  | 'competition_analysis'
  | 'profitability_explanation'
  | 'product_scoring'
  | 'multilingual_content';

export interface AITaskAssignment {
  taskKey: AITaskKey;
  label: string;
  description: string;
  providerId: string;
  modelId: string;
}

export interface AIUsageLog {
  id: string;
  providerId: string;
  providerName: string;
  modelId: string;
  taskKey: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  latencyMs: number;
  status: 'success' | 'error';
  errorMessage?: string;
  createdAt: string;
}

export interface ListingDraft {
  id: string;
  productId: string;
  marketplaceId: string;
  country: string;
  language: string;
  seoTitle: string;
  bulletPoints: string[];
  descriptionHtmlSafe: string;
  tags: string[];
  suggestedPrice: number;
  publishAuthorized: boolean;
  status: 'draft' | 'authorized_export' | 'exported';
  createdAt: string;
  updatedAt: string;
}

export interface ActivityEvent {
  id: string;
  category: 'discovery' | 'research' | 'supplier' | 'marketplace' | 'ai' | 'queue' | 'listing' | 'settings';
  title: string;
  detail: string;
  createdAt: string;
}

export interface AppSettings {
  workspaceName: string;
  defaultCurrency: string;
  defaultCountry: string;
  defaultDailyTarget: number;
  allowMarketplacePublishing: boolean;
  globalMonthlyAiBudgetUsd: number;
  customCategories: string[];
  theme: 'light' | 'dark';
}

export interface ProfitInput {
  sellingPrice: number;
  supplierCost: number;
  shippingCost: number;
  packagingCost: number;
  marketplaceFeePct: number;
  paymentFeePct: number;
  paymentFixedFee: number;
  adSpendPct: number;
  returnAllowancePct: number;
  customsPct: number;
  taxPct: number;
}

export interface ProfitBreakdown {
  grossRevenue: number;
  landedProductCost: number;
  customsCost: number;
  marketplaceFee: number;
  paymentFee: number;
  adSpendCost: number;
  returnReserve: number;
  taxCost: number;
  totalCosts: number;
  netProfit: number;
  netMarginPct: number;
  roiPct: number;
  breakEvenPrice: number;
  breakEvenRoas: number | null;
}
