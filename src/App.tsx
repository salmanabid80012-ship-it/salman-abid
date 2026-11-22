import React, { useCallback, useEffect, useState } from 'react';
import {
  BarChart3,
  Bot,
  Calculator,
  Compass,
  FileText,
  FlaskConical,
  LayoutDashboard,
  ListChecks,
  Menu,
  Moon,
  Network,
  PackageSearch,
  Settings as SettingsIcon,
  Store,
  Sun,
  X,
} from 'lucide-react';
import { AIModelHubView } from './components/AIModelHubView.tsx';
import { AnalyticsView } from './components/AnalyticsView.tsx';
import { DashboardView } from './components/DashboardView.tsx';
import { DiscoveryView } from './components/DiscoveryView.tsx';
import { IntegrationsView } from './components/IntegrationsView.tsx';
import { ListingGeneratorView } from './components/ListingGeneratorView.tsx';
import { MarketplaceHubView } from './components/MarketplaceHubView.tsx';
import { OfflineIndicator } from './components/OfflineIndicator.tsx';
import { ProductQueueView } from './components/ProductQueueView.tsx';
import { ProfitCalculatorView } from './components/ProfitCalculatorView.tsx';
import { PWAInstallButton } from './components/PWAInstallButton.tsx';
import { ResearchView } from './components/ResearchView.tsx';
import { SettingsView } from './components/SettingsView.tsx';
import { SupplierHubView } from './components/SupplierHubView.tsx';
import type {
  ActivityEvent,
  AIProviderConfig,
  AITaskAssignment,
  AIUsageLog,
  AppSettings,
  DiscoveryConfig,
  ListingDraft,
  MarketplaceConnector,
  NavSection,
  ProductRecord,
  SupplierConnector,
} from './types/commerce.ts';

interface BootstrapPayload {
  products: ProductRecord[];
  discoveryConfigs: DiscoveryConfig[];
  suppliers: SupplierConnector[];
  marketplaces: MarketplaceConnector[];
  aiProviders: AIProviderConfig[];
  taskAssignments: AITaskAssignment[];
  aiUsageLogs: AIUsageLog[];
  listingDrafts: ListingDraft[];
  activityLogs: ActivityEvent[];
  settings: AppSettings;
  dailyProgress: { discoveredToday: number; dailyTarget: number };
}

const NAV_ITEMS: Array<{
  id: NavSection;
  label: string;
  icon: React.FC<{ className?: string }>;
}> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'discovery', label: 'Product Discovery', icon: Compass },
  { id: 'research', label: 'Product Research', icon: FlaskConical },
  { id: 'suppliers', label: 'Supplier Hub', icon: PackageSearch },
  { id: 'marketplaces', label: 'Marketplace Hub', icon: Store },
  { id: 'ai-hub', label: 'AI Model Hub', icon: Bot },
  { id: 'calculator', label: 'Profit Calculator', icon: Calculator },
  { id: 'listings', label: 'Listing Generator', icon: FileText },
  { id: 'queue', label: 'Product Queue', icon: ListChecks },
  { id: 'analytics', label: 'Analytics and Reports', icon: BarChart3 },
  { id: 'integrations', label: 'API and Integrations', icon: Network },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
];

export default function App() {
  const [activeSection, setActiveSection] = useState<NavSection>('dashboard');
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [data, setData] = useState<BootstrapPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);

  const notify = useCallback((message: string, tone: 'success' | 'error' = 'success') => {
    setToast({ message, tone });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(timer);
  }, [toast]);

  const applyTheme = useCallback((next: 'light' | 'dark') => {
    setTheme(next);
    if (next === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  const fetchWorkspace = useCallback(async () => {
    try {
      const resp = await fetch('/api/bootstrap');
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const payload = (await resp.json()) as BootstrapPayload;
      setData(payload);
      setLoadError(null);
      if (payload.settings?.theme) {
        applyTheme(payload.settings.theme);
      }
      if (!selectedProductId && payload.products.length > 0) {
        setSelectedProductId(payload.products[0].id);
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Unable to reach workspace API');
    } finally {
      setLoading(false);
    }
  }, [applyTheme, selectedProductId]);

  useEffect(() => {
    fetchWorkspace();
  }, [fetchWorkspace]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [activeSection]);

  const handleNavigate = (section: NavSection) => {
    setActiveSection(section);
    setMobileMenuOpen(false);
  };

  const handleSelectProduct = (productId: string, targetSection: NavSection) => {
    setSelectedProductId(productId);
    setActiveSection(targetSection);
    setMobileMenuOpen(false);
  };

  const currentNav = NAV_ITEMS.find((n) => n.id === activeSection) || NAV_ITEMS[0];

  const toggleTheme = async () => {
    const next = theme === 'light' ? 'dark' : 'light';
    applyTheme(next);
    if (data?.settings) {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data.settings, theme: next }),
      }).catch(() => {});
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex h-14 items-center px-5 border-b border-slate-200 dark:border-slate-800">
          <span className="font-display text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap">
            Universal Commerce AI
          </span>
        </div>

        <nav aria-label="Primary navigation" className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavigate(item.id)}
                className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  active
                    ? 'bg-teal-50 text-teal-800 dark:bg-teal-950/50 dark:text-teal-300'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="border-t border-slate-200 p-4 dark:border-slate-800 flex items-center gap-3">
          <img
            src="/src/assets/images/avatar_commerce_operator_1795376465159.jpg"
            alt="Commerce Operations Director"
            referrerPolicy="no-referrer"
            className="h-8 w-8 rounded-full object-cover border border-slate-200 dark:border-slate-700 shrink-0"
          />
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
              {data?.settings.workspaceName || 'Commerce Workspace'}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {data?.settings.defaultCountry || 'US'} · {data?.settings.defaultCurrency || 'USD'}
            </p>
          </div>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-slate-950/50"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative z-10 flex w-72 max-w-[85vw] flex-col bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800">
            <div className="flex h-14 items-center justify-between px-4 border-b border-slate-200 dark:border-slate-800">
              <span className="font-display text-sm font-bold text-slate-900 dark:text-slate-100">
                Universal Commerce AI
              </span>
              <button
                type="button"
                aria-label="Close navigation menu"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <nav aria-label="Mobile navigation" className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleNavigate(item.id)}
                    className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors cursor-pointer ${
                      active
                        ? 'bg-teal-50 text-teal-800 dark:bg-teal-950/50 dark:text-teal-300'
                        : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        {/* Top Bar Contract: Breadcrumb / Title — Actions */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-4 border-b border-slate-200 bg-white/95 px-4 sm:px-6 backdrop-blur-xs dark:border-slate-800 dark:bg-slate-900/95">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              aria-label="Open navigation menu"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
            >
              <Menu className="h-4 w-4" aria-hidden="true" />
            </button>
            <div className="flex items-center gap-2 text-xs sm:text-sm min-w-0">
              <span className="hidden sm:inline text-slate-400 dark:text-slate-500 whitespace-nowrap">
                Workspace
              </span>
              <span className="hidden sm:inline text-slate-300 dark:text-slate-700" aria-hidden="true">
                /
              </span>
              <h1 className="font-display font-semibold text-slate-900 dark:text-slate-100 truncate">
                {currentNav.label}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <PWAInstallButton />
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
              className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 cursor-pointer"
            >
              {theme === 'light' ? (
                <Moon className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Sun className="h-3.5 w-3.5" aria-hidden="true" />
              )}
            </button>
            <button
              type="button"
              onClick={() => handleNavigate('discovery')}
              className="rounded-lg bg-teal-700 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-teal-800 whitespace-nowrap shrink-0 cursor-pointer"
            >
              New Discovery
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 max-w-[1440px] w-full mx-auto">
          {loading && !data ? (
            <div className="space-y-4" aria-busy="true" aria-label="Loading workspace">
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-24 rounded-xl border border-slate-200 bg-white animate-pulse dark:border-slate-800 dark:bg-slate-900"
                  />
                ))}
              </div>
              <div className="h-64 rounded-xl border border-slate-200 bg-white animate-pulse dark:border-slate-800 dark:bg-slate-900" />
            </div>
          ) : loadError ? (
            <div className="rounded-xl border border-rose-200 bg-white p-8 text-center dark:border-rose-900 dark:bg-slate-900">
              <p className="text-sm font-semibold text-rose-700 dark:text-rose-400">
                Failed to load commerce workspace
              </p>
              <p className="mt-1 text-xs text-slate-500">{loadError}</p>
              <button
                type="button"
                onClick={fetchWorkspace}
                className="mt-4 rounded-lg bg-teal-700 px-4 py-2 text-xs font-medium text-white cursor-pointer"
              >
                Retry Connection
              </button>
            </div>
          ) : data ? (
            <>
              {activeSection === 'dashboard' && (
                <DashboardView
                  products={data.products}
                  suppliers={data.suppliers}
                  marketplaces={data.marketplaces}
                  aiProviders={data.aiProviders}
                  activityLogs={data.activityLogs}
                  dailyProgress={data.dailyProgress}
                  onNavigate={handleNavigate}
                  onSelectProduct={handleSelectProduct}
                />
              )}

              {activeSection === 'discovery' && (
                <DiscoveryView
                  configs={data.discoveryConfigs}
                  customCategories={data.settings.customCategories}
                  suppliers={data.suppliers}
                  marketplaces={data.marketplaces}
                  defaultDailyTarget={data.settings.defaultDailyTarget}
                  onRefresh={fetchWorkspace}
                  onNotify={notify}
                  onSelectProduct={handleSelectProduct}
                />
              )}

              {activeSection === 'research' && (
                <ResearchView
                  products={data.products}
                  selectedProductId={selectedProductId}
                  onSelectProductId={setSelectedProductId}
                  onNavigate={handleNavigate}
                  onRefresh={fetchWorkspace}
                  onNotify={notify}
                />
              )}

              {activeSection === 'suppliers' && (
                <SupplierHubView
                  suppliers={data.suppliers}
                  onRefresh={fetchWorkspace}
                  onNotify={notify}
                />
              )}

              {activeSection === 'marketplaces' && (
                <MarketplaceHubView
                  marketplaces={data.marketplaces}
                  globalPublishingAllowed={data.settings.allowMarketplacePublishing}
                  onRefresh={fetchWorkspace}
                  onNotify={notify}
                />
              )}

              {activeSection === 'ai-hub' && (
                <AIModelHubView
                  providers={data.aiProviders}
                  taskAssignments={data.taskAssignments}
                  usageLogs={data.aiUsageLogs}
                  onRefresh={fetchWorkspace}
                  onNotify={notify}
                />
              )}

              {activeSection === 'calculator' && (
                <ProfitCalculatorView
                  products={data.products}
                  selectedProductId={selectedProductId}
                  onSelectProductId={setSelectedProductId}
                  onRefresh={fetchWorkspace}
                  onNotify={notify}
                />
              )}

              {activeSection === 'listings' && (
                <ListingGeneratorView
                  products={data.products}
                  marketplaces={data.marketplaces}
                  drafts={data.listingDrafts}
                  selectedProductId={selectedProductId}
                  onSelectProductId={setSelectedProductId}
                  onRefresh={fetchWorkspace}
                  onNotify={notify}
                />
              )}

              {activeSection === 'queue' && (
                <ProductQueueView
                  products={data.products}
                  onRefresh={fetchWorkspace}
                  onSelectProduct={handleSelectProduct}
                  onNotify={notify}
                />
              )}

              {activeSection === 'analytics' && (
                <AnalyticsView
                  products={data.products}
                  aiProviders={data.aiProviders}
                  aiUsageLogs={data.aiUsageLogs}
                />
              )}

              {activeSection === 'integrations' && (
                <IntegrationsView
                  suppliers={data.suppliers}
                  marketplaces={data.marketplaces}
                  aiProviders={data.aiProviders}
                  onRefresh={fetchWorkspace}
                  onNavigate={handleNavigate}
                  onNotify={notify}
                />
              )}

              {activeSection === 'settings' && (
                <SettingsView
                  settings={data.settings}
                  onRefresh={fetchWorkspace}
                  onThemeChange={applyTheme}
                  onNotify={notify}
                />
              )}
            </>
          ) : null}
        </main>
      </div>

      {/* Non-blocking Toast Banner */}
      {toast && (
        <div
          role="status"
          className={`fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-lg border px-4 py-2.5 text-xs font-medium shadow-md ${
            toast.tone === 'error'
              ? 'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-100'
              : 'border-teal-300 bg-white text-slate-900 dark:border-teal-800 dark:bg-slate-900 dark:text-slate-100'
          }`}
        >
          <span>{toast.message}</span>
          <button
            type="button"
            aria-label="Dismiss notification"
            onClick={() => setToast(null)}
            className="text-slate-400 hover:text-slate-700 cursor-pointer"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      )}

      <OfflineIndicator />
    </div>
  );
}
