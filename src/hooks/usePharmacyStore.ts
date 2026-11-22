import {useCallback, useEffect, useRef, useState} from 'react';
import type {
  Customer,
  Medicine,
  PharmacySettings,
  PharmacySnapshot,
  Sale,
  SyncMutation,
} from '../types/pharmacy';
import {encryptText} from '../utils/crypto';
import {
  enqueueMutation,
  getPendingMutations,
  loadCachedSnapshot,
  removeMutations,
  saveCachedSnapshot,
} from '../utils/offlineDb';
import {getSaleItemPiecesDeducted} from '../utils/stock';
import {useOnlineStatus} from './usePWAInstall';

const DEFAULT_SETTINGS: PharmacySettings = {
  pharmacyName: 'সারা মনি মেডিসিন কর্নার',
  pharmacyNameEn: 'Sara Moni Medicine Corner',
  tagline: 'সঠিক ওষুধ, ন্যায্য মূল্য ও ডিজিটাল সেবা',
  licenseNumber: '',
  phone: '01851768368, 01745858682',
  address: 'বড়রিয়া বাজার, ঘারিন্দা, টাঙ্গাইল সদর',
  currencySymbol: '৳',
  defaultVatPercent: 0,
  expiryAlertDays: 60,
  language: 'bn',
  theme: 'light',
  tableDensity: 'comfortable',
  encryptionEnabled: false,
  updatedAt: new Date().toISOString(),
};

function makeId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function usePharmacyStore() {
  const isOnline = useOnlineStatus();
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [settings, setSettings] = useState<PharmacySettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const [wsConnected, setWsConnected] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [vaultPassphrase, setVaultPassphrase] = useState<string>('');
  const [toast, setToast] = useState<{
    id: string;
    message: string;
    type: 'success' | 'info' | 'warning' | 'error';
  } | null>(null);

  const snapshotRef = useRef<PharmacySnapshot>({
    medicines: [],
    customers: [],
    sales: [],
    settings: DEFAULT_SETTINGS,
  });

  useEffect(() => {
    snapshotRef.current = {medicines, customers, sales, settings};
    void saveCachedSnapshot(snapshotRef.current);
  }, [medicines, customers, sales, settings]);

  // Apply Tailwind v4 .dark class & <html lang> whenever settings update
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', settings.theme === 'dark');
    root.lang = settings.language;
  }, [settings.theme, settings.language]);

  const showToast = useCallback(
    (
      message: string,
      type: 'success' | 'info' | 'warning' | 'error' = 'success',
    ) => {
      const id = makeId('toast');
      setToast({id, message, type});
      window.setTimeout(() => {
        setToast((curr) => (curr?.id === id ? null : curr));
      }, 3600);
    },
    [],
  );

  const applySnapshot = useCallback((data: PharmacySnapshot) => {
    setMedicines(data.medicines || []);
    setCustomers(data.customers || []);
    setSales(data.sales || []);
    if (data.settings) {
      setSettings(data.settings);
    }
  }, []);

  const refreshPendingCount = useCallback(async () => {
    const pending = await getPendingMutations();
    setPendingSyncCount(pending.length);
  }, []);

  const flushSyncQueue = useCallback(async () => {
    if (!navigator.onLine) return;
    const pending = await getPendingMutations();
    if (pending.length === 0) {
      setPendingSyncCount(0);
      return;
    }

    setIsSyncing(true);
    try {
      const res = await fetch('/api/sync/batch', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({mutations: pending}),
      });
      if (!res.ok) throw new Error('Sync batch failed');
      const data = (await res.json()) as {
        results: Array<{opId: string; ok: boolean}>;
        snapshot: PharmacySnapshot;
      };
      const doneIds = data.results.filter((r) => r.ok).map((r) => r.opId);
      await removeMutations(doneIds);
      await refreshPendingCount();
      if (data.snapshot) {
        applySnapshot(data.snapshot);
      }
      showToast(
        settings.language === 'bn'
          ? 'অফলাইন ডাটা সার্ভারে সিঙ্ক সম্পন্ন হয়েছে'
          : 'Offline changes synced to server',
        'success',
      );
    } catch {
      // Keep mutations in IndexedDB for next retry
    } finally {
      setIsSyncing(false);
    }
  }, [applySnapshot, refreshPendingCount, settings.language, showToast]);

  // Initial load: IndexedDB first (zero-latency offline), then server bootstrap
  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      const cached = await loadCachedSnapshot();
      if (!cancelled && cached) {
        applySnapshot(cached);
        setIsLoading(false);
      }
      await refreshPendingCount();

      if (navigator.onLine) {
        try {
          const pending = await getPendingMutations();
          if (pending.length > 0) {
            await flushSyncQueue();
          } else {
            const res = await fetch('/api/bootstrap');
            if (res.ok) {
              const remote = (await res.json()) as PharmacySnapshot;
              if (!cancelled) {
                applySnapshot(remote);
              }
            }
          }
        } catch {
          // Offline or server unreachable — continue seamlessly with IndexedDB data
        }
      }
      if (!cancelled) setIsLoading(false);
    }
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [applySnapshot, flushSyncQueue, refreshPendingCount]);

  // Auto-flush queue when browser regains connectivity
  useEffect(() => {
    if (isOnline) {
      void flushSyncQueue();
    }
  }, [isOnline, flushSyncQueue]);

  // WebSocket Real-Time Sync Hub
  useEffect(() => {
    if (!isOnline) {
      setWsConnected(false);
      return;
    }

    let ws: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let pingTimer: number | null = null;
    let unmounted = false;
    let backoff = 1500;

    const connect = () => {
      if (unmounted) return;
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(`${proto}//${window.location.host}/ws`);

      ws.onopen = () => {
        setWsConnected(true);
        backoff = 1500;
        pingTimer = window.setInterval(() => {
          if (ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({type: 'ping'}));
          }
        }, 25000);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(String(event.data)) as {
            type: string;
            payload: unknown;
          };
          if (msg.type === 'medicine:upsert') {
            const med = msg.payload as Medicine;
            setMedicines((prev) => {
              const exists = prev.some((m) => m.id === med.id);
              const next = exists
                ? prev.map((m) => (m.id === med.id ? med : m))
                : [med, ...prev];
              return next.sort((a, b) => a.name.localeCompare(b.name));
            });
          } else if (msg.type === 'medicine:delete') {
            const {id} = msg.payload as {id: string};
            setMedicines((prev) => prev.filter((m) => m.id !== id));
          } else if (msg.type === 'customer:upsert') {
            const cust = msg.payload as Customer;
            setCustomers((prev) => {
              const exists = prev.some((c) => c.id === cust.id);
              return exists
                ? prev.map((c) => (c.id === cust.id ? cust : c))
                : [cust, ...prev];
            });
          } else if (msg.type === 'customer:delete') {
            const {id} = msg.payload as {id: string};
            setCustomers((prev) => prev.filter((c) => c.id !== id));
          } else if (msg.type === 'sale:created') {
            const res = msg.payload as {
              sale: Sale;
              updatedMedicines: Medicine[];
              updatedCustomer: Customer | null;
            };
            setSales((prev) =>
              prev.some((s) => s.id === res.sale.id) ? prev : [res.sale, ...prev],
            );
            if (res.updatedMedicines?.length) {
              setMedicines((prev) =>
                prev.map((m) => {
                  const found = res.updatedMedicines.find((u) => u.id === m.id);
                  return found || m;
                }),
              );
            }
            if (res.updatedCustomer) {
              const cust = res.updatedCustomer;
              setCustomers((prev) =>
                prev.map((c) => (c.id === cust.id ? cust : c)),
              );
            }
          } else if (msg.type === 'settings:updated') {
            setSettings(msg.payload as PharmacySettings);
          } else if (msg.type === 'state:reset') {
            applySnapshot(msg.payload as PharmacySnapshot);
          }
        } catch {
          // Ignore malformed WS payloads
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        if (pingTimer) window.clearInterval(pingTimer);
        if (!unmounted) {
          reconnectTimer = window.setTimeout(connect, backoff);
          backoff = Math.min(10000, backoff * 1.5);
        }
      };

      ws.onerror = () => {
        ws?.close();
      };
    };

    connect();

    return () => {
      unmounted = true;
      if (pingTimer) window.clearInterval(pingTimer);
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [applySnapshot, isOnline]);

  const queueOffline = useCallback(
    async (mutation: Omit<SyncMutation, 'opId' | 'timestamp'>) => {
      await enqueueMutation({
        ...mutation,
        opId: makeId('op'),
        timestamp: new Date().toISOString(),
      });
      await refreshPendingCount();
    },
    [refreshPendingCount],
  );

  // Actions
  const saveMedicine = useCallback(
    async (input: Omit<Medicine, 'id' | 'updatedAt'> & {id?: string}) => {
      const med: Medicine = {
        ...input,
        id: input.id || makeId('med'),
        updatedAt: new Date().toISOString(),
      };
      setMedicines((prev) => {
        const exists = prev.some((m) => m.id === med.id);
        const next = exists
          ? prev.map((m) => (m.id === med.id ? med : m))
          : [med, ...prev];
        return next.sort((a, b) => a.name.localeCompare(b.name));
      });

      try {
        if (!navigator.onLine) throw new Error('offline');
        const res = await fetch('/api/medicines', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(med),
        });
        if (!res.ok) throw new Error('server_error');
      } catch {
        await queueOffline({
          entity: 'medicine',
          action: 'upsert',
          payload: med as unknown as Record<string, unknown>,
        });
      }
      showToast(
        settings.language === 'bn'
          ? 'ওষুধের তথ্য সংরক্ষিত হয়েছে'
          : 'Medicine saved successfully',
      );
      return med;
    },
    [queueOffline, settings.language, showToast],
  );

  const removeMedicine = useCallback(
    async (id: string) => {
      setMedicines((prev) => prev.filter((m) => m.id !== id));
      try {
        if (!navigator.onLine) throw new Error('offline');
        const res = await fetch(`/api/medicines/${encodeURIComponent(id)}`, {
          method: 'DELETE',
        });
        if (!res.ok) throw new Error('server_error');
      } catch {
        await queueOffline({
          entity: 'medicine',
          action: 'delete',
          payload: {id},
        });
      }
      showToast(
        settings.language === 'bn' ? 'ওষুধ মুছে ফেলা হয়েছে' : 'Medicine deleted',
        'info',
      );
    },
    [queueOffline, settings.language, showToast],
  );

  const saveCustomer = useCallback(
    async (
      input: Omit<
        Customer,
        'id' | 'updatedAt' | 'totalSpent' | 'visitCount' | 'lastVisit'
      > & {
        id?: string;
        totalSpent?: number;
        visitCount?: number;
        lastVisit?: string;
      },
    ) => {
      const existing = input.id
        ? customers.find((c) => c.id === input.id)
        : undefined;
      const now = new Date().toISOString();

      let notesToPersist = input.notes;
      let encryptedNotesToPersist = input.encryptedNotes || '';

      if (vaultPassphrase && input.notes.trim()) {
        encryptedNotesToPersist = await encryptText(
          input.notes,
          vaultPassphrase,
        );
        notesToPersist = '';
      }

      const cust: Customer = {
        id: input.id || makeId('cust'),
        name: input.name,
        phone: input.phone,
        address: input.address,
        dueBalance: input.dueBalance,
        totalSpent: input.totalSpent ?? existing?.totalSpent ?? 0,
        visitCount: input.visitCount ?? existing?.visitCount ?? 0,
        lastVisit: input.lastVisit ?? existing?.lastVisit ?? now,
        notes: notesToPersist,
        encryptedNotes: encryptedNotesToPersist,
        updatedAt: now,
      };

      setCustomers((prev) => {
        const exists = prev.some((c) => c.id === cust.id);
        return exists
          ? prev.map((c) => (c.id === cust.id ? cust : c))
          : [cust, ...prev];
      });

      try {
        if (!navigator.onLine) throw new Error('offline');
        const res = await fetch('/api/customers', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(cust),
        });
        if (!res.ok) throw new Error('server_error');
      } catch {
        await queueOffline({
          entity: 'customer',
          action: 'upsert',
          payload: cust as unknown as Record<string, unknown>,
        });
      }

      showToast(
        settings.language === 'bn'
          ? 'কাস্টমার তথ্য সংরক্ষিত হয়েছে'
          : 'Customer saved',
      );
      return cust;
    },
    [customers, queueOffline, settings.language, showToast, vaultPassphrase],
  );

  const collectCustomerDue = useCallback(
    async (customerId: string, amount: number) => {
      setCustomers((prev) =>
        prev.map((c) =>
          c.id === customerId
            ? {
                ...c,
                dueBalance: Math.max(0, Number((c.dueBalance - amount).toFixed(2))),
                updatedAt: new Date().toISOString(),
              }
            : c,
        ),
      );

      try {
        if (!navigator.onLine) throw new Error('offline');
        const res = await fetch(
          `/api/customers/${encodeURIComponent(customerId)}/pay-due`,
          {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({amount}),
          },
        );
        if (!res.ok) throw new Error('server_error');
      } catch {
        await queueOffline({
          entity: 'customer',
          action: 'pay_due',
          payload: {id: customerId, amount},
        });
      }
      showToast(
        settings.language === 'bn'
          ? 'বকেয়া পরিশোধ রেকর্ড করা হয়েছে'
          : 'Due payment recorded',
      );
    },
    [queueOffline, settings.language, showToast],
  );

  const removeCustomer = useCallback(
    async (id: string) => {
      setCustomers((prev) => prev.filter((c) => c.id !== id));
      try {
        if (!navigator.onLine) throw new Error('offline');
        const res = await fetch(`/api/customers/${encodeURIComponent(id)}`, {
          method: 'DELETE',
        });
        if (!res.ok) throw new Error('server_error');
      } catch {
        await queueOffline({
          entity: 'customer',
          action: 'delete',
          payload: {id},
        });
      }
      showToast(
        settings.language === 'bn' ? 'কাস্টমার মুছে ফেলা হয়েছে' : 'Customer removed',
        'info',
      );
    },
    [queueOffline, settings.language, showToast],
  );

  const submitSale = useCallback(
    async (saleInput: Omit<Sale, 'id' | 'invoiceNumber' | 'createdAt'>) => {
      const now = new Date();
      const seq = String(sales.length + 101).padStart(4, '0');
      const sale: Sale = {
        ...saleInput,
        id: makeId('sale'),
        invoiceNumber: `INV-${now.getFullYear()}-${seq}-${Math.floor(10 + Math.random() * 89)}`,
        createdAt: now.toISOString(),
      };

      // Optimistic local state updates
      setSales((prev) => [sale, ...prev]);
      setMedicines((prev) =>
        prev.map((m) => {
          const deducted = sale.items
            .filter((i) => i.medicineId === m.id)
            .reduce((sum, i) => sum + getSaleItemPiecesDeducted(i), 0);
          return deducted > 0
            ? {...m, stockQty: Math.max(0, m.stockQty - deducted)}
            : m;
        }),
      );
      if (sale.customerId) {
        setCustomers((prev) =>
          prev.map((c) =>
            c.id === sale.customerId
              ? {
                  ...c,
                  totalSpent: c.totalSpent + sale.totalAmount,
                  dueBalance: c.dueBalance + sale.dueAmount,
                  visitCount: c.visitCount + 1,
                  lastVisit: sale.createdAt,
                }
              : c,
          ),
        );
      }

      try {
        if (!navigator.onLine) throw new Error('offline');
        const res = await fetch('/api/sales', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(sale),
        });
        if (!res.ok) throw new Error('server_error');
      } catch {
        await queueOffline({
          entity: 'sale',
          action: 'create_sale',
          payload: sale as unknown as Record<string, unknown>,
        });
      }

      showToast(
        settings.language === 'bn'
          ? `ইনভয়েস ${sale.invoiceNumber} তৈরি হয়েছে`
          : `Invoice ${sale.invoiceNumber} created`,
      );
      return sale;
    },
    [queueOffline, sales.length, settings.language, showToast],
  );

  const saveSettings = useCallback(
    async (partial: Partial<PharmacySettings>) => {
      const next: PharmacySettings = {
        ...settings,
        ...partial,
        updatedAt: new Date().toISOString(),
      };
      setSettings(next);
      try {
        if (!navigator.onLine) throw new Error('offline');
        const res = await fetch('/api/settings', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(next),
        });
        if (!res.ok) throw new Error('server_error');
      } catch {
        await queueOffline({
          entity: 'settings',
          action: 'upsert',
          payload: next as unknown as Record<string, unknown>,
        });
      }
    },
    [queueOffline, settings],
  );

  const restoreSnapshot = useCallback(
    async (snapshot: PharmacySnapshot) => {
      applySnapshot(snapshot);
      if (navigator.onLine) {
        const res = await fetch('/api/backup/restore', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(snapshot),
        });
        if (!res.ok) throw new Error('Restore failed on server');
      }
      showToast(
        settings.language === 'bn'
          ? 'ব্যাকআপ সফলভাবে রিস্টোর করা হয়েছে'
          : 'Backup restored successfully',
      );
    },
    [applySnapshot, settings.language, showToast],
  );

  return {
    medicines,
    customers,
    sales,
    settings,
    isLoading,
    isOnline,
    wsConnected,
    pendingSyncCount,
    isSyncing,
    vaultPassphrase,
    setVaultPassphrase,
    toast,
    showToast,
    flushSyncQueue,
    saveMedicine,
    removeMedicine,
    saveCustomer,
    collectCustomerDue,
    removeCustomer,
    submitSale,
    saveSettings,
    restoreSnapshot,
  };
}
