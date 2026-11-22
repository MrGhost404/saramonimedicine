import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  AlertTriangle,
  BarChart3,
  LayoutDashboard,
  Moon,
  Package,
  RefreshCw,
  Settings,
  Sun,
  Users,
  Wifi,
  WifiOff,
} from 'lucide-react';
import {AlertsView} from './components/AlertsView';
import {CustomersView} from './components/CustomersView';
import {InventoryView} from './components/InventoryView';
import {InvoiceModal} from './components/InvoiceModal';
import {PWAInstallButton} from './components/PWAInstallButton';
import {ReportsView} from './components/ReportsView';
import {SettingsView} from './components/SettingsView';
import {WorkspaceView} from './components/WorkspaceView';
import {usePharmacyStore} from './hooks/usePharmacyStore';
import {formatNumber, t} from './i18n/translations';
import {
  createSaleAndDeductStock,
  deleteMedicineFromFirestore,
  fetchDailySalesFromFirestore,
  fetchMedicinesFromFirestore,
  saveMedicineToFirestore,
  type DailySaleRecord,
} from './service/pharmacyFirestore';
import type {ActiveTab, Medicine, Sale, SaleItem} from './types/pharmacy';
import {getMedicineAlertFlags} from './utils/alerts';

export default function App() {
  const store = usePharmacyStore();
  const [activeTab, setActiveTab] = useState<ActiveTab>('workspace');
  const [activeInvoice, setActiveInvoice] = useState<Sale | null>(null);

  // Firestore-এর জন্য অতিরিক্ত স্টেট
  const [firestoreMedicines, setFirestoreMedicines] = useState<Medicine[] | null>(
    null,
  );
  const [firestoreDailySales, setFirestoreDailySales] = useState<
    DailySaleRecord[]
  >([]);
  const [isFirestoreLoading, setIsFirestoreLoading] = useState<boolean>(true);

  const lang = store.settings.language;

  // Firestore থেকে ওষুধ ও আজকের ডেইলি সেলস লোড করা
  const loadFirestoreData = useCallback(async () => {
    setIsFirestoreLoading(true);
    try {
      const [meds, todaySales] = await Promise.all([
        fetchMedicinesFromFirestore(),
        fetchDailySalesFromFirestore(),
      ]);
      setFirestoreMedicines(meds);
      setFirestoreDailySales(todaySales);
    } catch (error) {
      console.error('Failed to load Firestore data:', error);
    } finally {
      setIsFirestoreLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFirestoreData();
  }, [loadFirestoreData]);

  // Firestore ডেটা পাওয়া গেলে সেটি প্রাধান্য পাবে, না থাকলে store-এর ডেটা ফলব্যাক হিসেবে থাকবে
  const activeMedicines = useMemo(
    () => (firestoreMedicines !== null ? firestoreMedicines : store.medicines),
    [firestoreMedicines, store.medicines],
  );

  // ওষুধ সেভ বা আপডেট হ্যান্ডলার
  const handleSaveMedicine = useCallback(
    async (
      medicine: Omit<Medicine, 'id' | 'updatedAt'> & {id?: string},
    ): Promise<Medicine> => {
      const updatedAt = new Date().toISOString();
      const savedId = await saveMedicineToFirestore(
        {...medicine, updatedAt} as Medicine,
      );
      const updatedMeds = await fetchMedicinesFromFirestore();
      setFirestoreMedicines(updatedMeds);

      const savedMedicine: Medicine = {
        ...medicine,
        id: savedId,
        updatedAt,
      };
      if (typeof store.saveMedicine === 'function') {
        await store.saveMedicine(savedMedicine);
      }
      return savedMedicine;
    },
    [store],
  );

  // 
  // ওষুধ ডিলিট হ্যান্ডলার
  const handleDeleteMedicine = useCallback(
    async (medicineId: string) => {
      await deleteMedicineFromFirestore(medicineId);
      const updatedMeds = await fetchMedicinesFromFirestore();
      setFirestoreMedicines(updatedMeds);

      if (typeof store.removeMedicine === 'function') {
        await store.removeMedicine(medicineId);
      }
    },
    [store],
  );

  // বিক্রয় সাবমিট করে Firestore-এ সেলস সেভ ও স্টক আপডেট হ্যান্ডলার
  const handleSubmitSale = useCallback(
    async (salePayload: unknown) => {
      const payload = (salePayload ?? {}) as Partial<Sale> & {
        items?: SaleItem[];
        totalAmount?: number;
        total?: number;
        invoiceNo?: string;
      };

      const items = Array.isArray(payload.items) ? payload.items : [];
      const totalAmount = Number(payload.totalAmount ?? payload.total ?? 0);

      if (items.length > 0) {
        await createSaleAndDeductStock({
          items,
          totalAmount,
          invoiceNo: payload.invoiceNo,
        });

        const [updatedMeds, updatedSales] = await Promise.all([
          fetchMedicinesFromFirestore(),
          fetchDailySalesFromFirestore(),
        ]);
        setFirestoreMedicines(updatedMeds);
        setFirestoreDailySales(updatedSales);
      }

      if (typeof store.submitSale === 'function') {
        return await store.submitSale(salePayload as never);
      }
    },
    [store],
  );

  const alertCount = useMemo(() => {
    let count = 0;
    for (const m of activeMedicines) {
      const flags = getMedicineAlertFlags(m, store.settings.expiryAlertDays);
      if (flags.isExpired || flags.isExpiringSoon || flags.isLowStock) {
        count++;
      }
    }
    return count;
  }, [activeMedicines, store.settings.expiryAlertDays]);

  const navItems: Array<{
    id: ActiveTab;
    label: string;
    icon: React.ComponentType<{className?: string}>;
    badge?: number;
  }> = [
    {id: 'workspace', label: t(lang, 'navWorkspace'), icon: LayoutDashboard},
    {id: 'inventory', label: t(lang, 'navInventory'), icon: Package},
    {id: 'customers', label: t(lang, 'navCustomers'), icon: Users},
    {id: 'reports', label: t(lang, 'navReports'), icon: BarChart3},
    {
      id: 'alerts',
      label: t(lang, 'navAlerts'),
      icon: AlertTriangle,
      badge: alertCount > 0 ? alertCount : undefined,
    },
    {id: 'settings', label: t(lang, 'navSettings'), icon: Settings},
  ];

  const displayTitle =
    lang === 'bn'
      ? store.settings.pharmacyName
      : store.settings.pharmacyNameEn;

  const isAppLoading = store.isLoading && isFirestoreLoading;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="no-print flex min-h-screen">
        {/* Desktop Sidebar */}
        <aside className="no-print hidden lg:flex lg:w-64 lg:shrink-0 lg:flex-col lg:border-r lg:border-slate-200 lg:bg-white dark:lg:border-slate-800 dark:lg:bg-slate-900">
          <div className="flex h-16 items-center gap-3 border-b border-slate-200 px-5 dark:border-slate-800">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white font-bold text-sm">
              +
            </div>
            <span className="truncate text-sm font-bold text-slate-900 dark:text-white">
              {displayTitle}
            </span>
          </div>

          <nav className="flex-1 space-y-1 p-3">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-xs font-semibold transition whitespace-nowrap ${
                    isActive
                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100'
                  }`}
                >
                  <span className="flex items-center gap-2.5 truncate">
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </span>
                  {item.badge !== undefined && (
                    <span className="font-mono-num ml-2 text-xs font-bold text-amber-600 dark:text-amber-400">
                      {formatNumber(item.badge, lang)}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Sidebar Utility Footer: Connectivity, Theme & Language */}
          <div className="space-y-3 border-t border-slate-200 p-4 dark:border-slate-800">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 font-medium text-slate-600 dark:text-slate-400">
                {store.isOnline ? (
                  <Wifi className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <WifiOff className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                )}
                <span>
                  {store.isOnline
                    ? store.wsConnected
                      ? t(lang, 'syncedStatus')
                      : 'Online'
                    : t(lang, 'offlineStatus')}
                </span>
              </span>

              {store.pendingSyncCount > 0 && store.isOnline && (
                <button
                  type="button"
                  onClick={() => void store.flushSyncQueue()}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 hover:underline dark:text-emerald-400"
                >
                  <RefreshCw
                    className={`h-3 w-3 ${store.isSyncing ? 'animate-spin' : ''}`}
                  />
                  <span>{t(lang, 'syncNow')}</span>
                </button>
              )}
            </div>

            {store.pendingSyncCount > 0 && (
              <div className="text-[11px] font-medium text-amber-600 dark:text-amber-400">
                {formatNumber(store.pendingSyncCount, lang)}{' '}
                {t(lang, 'pendingSyncCount')}
              </div>
            )}

            <div className="flex items-center justify-between gap-2 pt-1">
              <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800">
                <button
                  type="button"
                  onClick={() => void store.saveSettings({language: 'bn'})}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
                    lang === 'bn'
                      ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white'
                      : 'text-slate-500'
                  }`}
                >
                  বাংলা
                </button>
                <button
                  type="button"
                  onClick={() => void store.saveSettings({language: 'en'})}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
                    lang === 'en'
                      ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white'
                      : 'text-slate-500'
                  }`}
                >
                  EN
                </button>
              </div>

              <button
                type="button"
                onClick={() =>
                  void store.saveSettings({
                    theme: store.settings.theme === 'dark' ? 'light' : 'dark',
                  })
                }
                aria-label="Toggle Dark Mode"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                {store.settings.theme === 'dark' ? (
                  <Sun className="h-4 w-4" />
                ) : (
                  <Moon className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
        </aside>

        {/* Main Content Column */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Clean 3-Zone Top Bar */}
          <header className="no-print sticky top-0 z-30 flex h-14 sm:h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white/95 px-4 backdrop-blur-md sm:px-6 dark:border-slate-800 dark:bg-slate-900/95">
            <div className="min-w-0">
              <span className="block truncate text-base font-bold text-slate-900 lg:hidden dark:text-white">
                {displayTitle}
              </span>
              <span className="hidden truncate text-sm font-semibold text-slate-700 lg:block dark:text-slate-200">
                {navItems.find((n) => n.id === activeTab)?.label}
              </span>
            </div>

            <div className="hidden md:flex items-center gap-5 text-xs font-medium text-slate-500 dark:text-slate-400">
              <button
                type="button"
                onClick={() => setActiveTab('workspace')}
                className={`whitespace-nowrap shrink-0 hover:text-slate-900 dark:hover:text-white ${
                  activeTab === 'workspace'
                    ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                    : ''
                }`}
              >
                {t(lang, 'navWorkspace')}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('inventory')}
                className={`whitespace-nowrap shrink-0 hover:text-slate-900 dark:hover:text-white ${
                  activeTab === 'inventory'
                    ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                    : ''
                }`}
              >
                {t(lang, 'navInventory')}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('reports')}
                className={`whitespace-nowrap shrink-0 hover:text-slate-900 dark:hover:text-white ${
                  activeTab === 'reports'
                    ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                    : ''
                }`}
              >
                {t(lang, 'navReports')}
              </button>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <PWAInstallButton lang={lang} />
              <button
                type="button"
                onClick={() => setActiveTab('workspace')}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700 whitespace-nowrap shrink-0 lg:hidden"
              >
                <span>{t(lang, 'newBill')}</span>
              </button>
            </div>
          </header>

          {/* Offline Connectivity Banner */}
          {!store.isOnline && (
            <div className="no-print flex items-center justify-between bg-amber-500 px-4 py-2 text-xs font-semibold text-white sm:px-6">
              <div className="flex items-center gap-2">
                <WifiOff className="h-3.5 w-3.5 shrink-0" />
                <span>
                  {lang === 'bn'
                    ? 'অফলাইন মোড সক্রিয় — সকল বিল ও ডাটা ডিভাইসে সেভ হচ্ছে এবং ইন্টারনেট ফিরলে অটো-সিঙ্ক হবে।'
                    : 'Offline Mode — Changes are saved locally and will auto-sync when online.'}
                </span>
              </div>
              {store.pendingSyncCount > 0 && (
                <span className="font-mono-num whitespace-nowrap">
                  {formatNumber(store.pendingSyncCount, lang)}{' '}
                  {t(lang, 'pendingSyncCount')}
                </span>
              )}
            </div>
          )}

          {/* Main Viewport */}
          <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 pb-24 sm:px-6 lg:pb-8">
            {isAppLoading ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {[0, 1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="h-28 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
                    />
                  ))}
                </div>
                <div className="h-96 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" />
              </div>
            ) : (
              <>
                {activeTab === 'workspace' && (
                  <WorkspaceView
                    medicines={activeMedicines}
                    customers={store.customers}
                    sales={store.sales}
                    settings={store.settings}
                    lang={lang}
                    onSubmitSale={handleSubmitSale as never}
                    onQuickAddCustomer={store.saveCustomer}
                    onOpenInvoice={(sale) => setActiveInvoice(sale)}
                    onNavigateTab={(tab) => setActiveTab(tab)}
                  />
                )}
                {activeTab === 'inventory' && (
                  <InventoryView
                    medicines={activeMedicines}
                    settings={store.settings}
                    lang={lang}
                    onSaveMedicine={handleSaveMedicine}
                    onDeleteMedicine={handleDeleteMedicine}
                  />
                )}
                {activeTab === 'customers' && (
                  <CustomersView
                    customers={store.customers}
                    sales={store.sales}
                    settings={store.settings}
                    lang={lang}
                    vaultPassphrase={store.vaultPassphrase}
                    onSaveCustomer={store.saveCustomer}
                    onCollectDue={store.collectCustomerDue}
                    onDeleteCustomer={store.removeCustomer}
                    onOpenInvoice={(sale) => setActiveInvoice(sale)}
                  />
                )}
                {activeTab === 'reports' && (
                  <ReportsView
                    sales={store.sales}
                    settings={store.settings}
                    lang={lang}
                    onOpenInvoice={(sale) => setActiveInvoice(sale)}
                  />
                )}
                {activeTab === 'alerts' && (
                  <AlertsView
                    medicines={activeMedicines}
                    settings={store.settings}
                    lang={lang}
                    onSaveMedicine={handleSaveMedicine}
                    onDeleteMedicine={handleDeleteMedicine}
                  />
                )}
                {activeTab === 'settings' && (
                  <SettingsView
                    medicines={activeMedicines}
                    customers={store.customers}
                    sales={store.sales}
                    settings={store.settings}
                    lang={lang}
                    vaultPassphrase={store.vaultPassphrase}
                    onSetVaultPassphrase={store.setVaultPassphrase}
                    onSaveSettings={store.saveSettings}
                    onRestoreSnapshot={store.restoreSnapshot}
                    onShowToast={store.showToast}
                  />
                )}
              </>
            )}
          </main>
        </div>
      </div>

      {/* Mobile Fixed Bottom Thumb-Zone Tab Bar (<= 15% viewport cap) */}
      <nav className="no-print fixed right-0 bottom-0 left-0 z-40 grid h-16 grid-cols-5 items-center border-t border-slate-200 bg-white/95 backdrop-blur-md pb-safe lg:hidden dark:border-slate-800 dark:bg-slate-900/95">
        {(
          [
            ['workspace', LayoutDashboard, lang === 'bn' ? 'POS' : 'POS'],
            ['inventory', Package, lang === 'bn' ? 'স্টক' : 'Stock'],
            ['customers', Users, lang === 'bn' ? 'ক্রেতা' : 'Clients'],
            ['reports', BarChart3, lang === 'bn' ? 'রিপোর্ট' : 'Reports'],
            ['settings', Settings, lang === 'bn' ? 'সেটিংস' : 'Settings'],
          ] as const
        ).map(([id, Icon, shortLabel]) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`flex min-h-[44px] flex-col items-center justify-center gap-0.5 text-[10px] font-semibold transition ${
                isActive
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <Icon className="h-5 w-5" />
              <span>{shortLabel}</span>
            </button>
          );
        })}
      </nav>

      {/* Automated Invoice Preview Modal */}
      <InvoiceModal
        sale={activeInvoice}
        settings={store.settings}
        lang={lang}
        onClose={() => setActiveInvoice(null)}
      />

      {/* Feedback Toast */}
      {store.toast && (
        <div
          role="status"
          className={`no-print fixed right-4 bottom-20 z-50 rounded-xl px-4 py-3 text-xs font-semibold text-white shadow-lg lg:bottom-6 ${
            store.toast.type === 'error'
              ? 'bg-red-600'
              : store.toast.type === 'warning'
                ? 'bg-amber-600'
                : store.toast.type === 'info'
                  ? 'bg-slate-800'
                  : 'bg-emerald-600'
          }`}
        >
          {store.toast.message}
        </div>
      )}
    </div>
  );
}