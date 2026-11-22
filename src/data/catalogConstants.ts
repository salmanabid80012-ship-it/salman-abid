import type { AITaskKey } from '../types/commerce.ts';

export const STANDARD_CATEGORIES: string[] = [
  'Clothing and Apparel',
  'Leather Products',
  'Shoes and Footwear',
  'Bags and Accessories',
  'Electronics',
  'Home and Kitchen',
  'Sports and Fitness',
  'Beauty and Personal Care',
  'Automotive Accessories',
  'Pet Supplies',
  'Toys and Games',
  'Office Supplies',
  'Tools and Hardware',
  'Jewelry',
  'Outdoor Products',
];

export const TARGET_COUNTRIES: Array<{ code: string; name: string; currency: string }> = [
  { code: 'US', name: 'United States', currency: 'USD' },
  { code: 'UK', name: 'United Kingdom', currency: 'GBP' },
  { code: 'DE', name: 'Germany', currency: 'EUR' },
  { code: 'CA', name: 'Canada', currency: 'CAD' },
  { code: 'AU', name: 'Australia', currency: 'AUD' },
  { code: 'JP', name: 'Japan', currency: 'JPY' },
  { code: 'AE', name: 'United Arab Emirates', currency: 'AED' },
];

export const AI_TASK_DEFINITIONS: Array<{
  taskKey: AITaskKey;
  label: string;
  description: string;
}> = [
  {
    taskKey: 'product_research',
    label: 'Product Research',
    description: 'Synthesize supplier specs, buyer demand, and positioning.',
  },
  {
    taskKey: 'opportunity_analysis',
    label: 'Product Opportunity Analysis',
    description: 'Evaluate upside potential, seasonality, and moat.',
  },
  {
    taskKey: 'categorization',
    label: 'Product Categorization',
    description: 'Map products to marketplace taxonomy trees accurately.',
  },
  {
    taskKey: 'seo_title',
    label: 'SEO Title Generation',
    description: 'Craft high-CTR titles matching marketplace character caps.',
  },
  {
    taskKey: 'product_description',
    label: 'Product Description Generation',
    description: 'Write benefit-led structured product copy and bullet points.',
  },
  {
    taskKey: 'keyword_suggestions',
    label: 'Keyword Suggestions',
    description: 'Identify high-intent long-tail search phrases and backend tags.',
  },
  {
    taskKey: 'image_analysis',
    label: 'Product Image Analysis',
    description: 'Assess visual quality, packaging cues, and lifestyle gaps.',
  },
  {
    taskKey: 'specification_analysis',
    label: 'Product Specification Analysis',
    description: 'Normalize dimensions, materials, compliance, and variants.',
  },
  {
    taskKey: 'competition_analysis',
    label: 'Competition Analysis',
    description: 'Benchmark incumbent sellers, review moats, and pricing bands.',
  },
  {
    taskKey: 'profitability_explanation',
    label: 'Profitability Explanations',
    description: 'Explain fee sensitivities, shipping risks, and break-even drivers.',
  },
  {
    taskKey: 'product_scoring',
    label: 'Product Scoring',
    description: 'Audit numeric opportunity scoring with qualitative rationale.',
  },
  {
    taskKey: 'multilingual_content',
    label: 'Multilingual Content Generation',
    description: 'Localize listings for international marketplaces.',
  },
];

export const SUPPORTED_LANGUAGES: Array<{ code: string; name: string }> = [
  { code: 'en', name: 'English' },
  { code: 'de', name: 'German' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ar', name: 'Arabic' },
];
