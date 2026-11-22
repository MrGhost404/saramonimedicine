import React, {useEffect, useMemo, useState} from 'react';
import {
  Edit3,
  Lock,
  Plus,
  Search,
  Trash2,
  Wallet,
  X,
} from 'lucide-react';
import {
  formatDateOnly,
  formatMoney,
  formatNumber,
  t,
} from '../i18n/translations';
import type {
  Customer,
  Language,
  PharmacySettings,
  Sale,
} from '../types/pharmacy';
import {decryptText} from '../utils/crypto';

interface CustomersViewProps {
  customers: Customer[];
  sales: Sale[];
  settings: PharmacySettings;
  lang: Language;
  vaultPassphrase: string;
  onSaveCustomer: (
    cust: Omit<
      Customer,
      'id' | 'updatedAt' | 'totalSpent' | 'visitCount' | 'lastVisit'
    > & {id?: string},
  ) => Promise<Customer>;
  onCollectDue: (customerId: string, amount: number) => Promise<void>;
  onDeleteCustomer: (id: string) => Promise<void>;
  onOpenInvoice: (sale: Sale) => void;
}

export const CustomersView: React.FC<CustomersViewProps> = ({
  customers,
  sales,
  settings,
  lang,
  vaultPassphrase,
  onSaveCustomer,
  onCollectDue,
  onDeleteCustomer,
  onOpenInvoice,
}) => {
  const [search, setSearch] = useState('');
  const [onlyDue, setOnlyDue] = useState(false);
  const [decryptedNotesMap, setDecryptedNotesMap] = useState<Record<string, string>>({});
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<{
    id: string;
    name: string;
    phone: string;
    address: string;
    dueBalance: number;
    notes: string;
  }>({
    id: '',
    name: '',
    phone: '',
    address: '',
    dueBalance: 0,
    notes: '',
  });
  const [payModalCust, setPayModalCust] = useState<Customer | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [selectedCustId, setSelectedCustId] = useState<string | null>(null);

  const currency = settings.currencySymbol || '৳';

  // Decrypt E2EE customer notes in memory when vault passphrase is provided
  useEffect(() => {
    let cancelled = false;
    async function decryptAll() {
      const nextMap: Record<string, string> = {};
      for (const c of customers) {
        if (c.encryptedNotes) {
          if (vaultPassphrase) {
            try {
              nextMap[c.id] = await decryptText(c.encryptedNotes, vaultPassphrase);
            } catch {
              nextMap[c.id] = '';
            }
          }
        } else if (c.notes) {
          nextMap[c.id] = c.notes;
        }
      }
      if (!cancelled) setDecryptedNotesMap(nextMap);
    }
    void decryptAll();
    return () => {
      cancelled = true;
    };
  }, [customers, vaultPassphrase]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return customers.filter((c) => {
      if (onlyDue && c.dueBalance <= 0) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        c.address.toLowerCase().includes(q)
      );
    });
  }, [customers, onlyDue, search]);

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === selectedCustId) || null,
    [customers, selectedCustId],
  );

  const selectedCustomerSales = useMemo(() => {
    if (!selectedCustomer) return [];
    return sales.filter((s) => s.customerId === selectedCustomer.id);
  }, [sales, selectedCustomer]);

  const openAdd = () => {
    setEditing({
      id: '',
      name: '',
      phone: '',
      address: '',
      dueBalance: 0,
      notes: '',
    });
    setModalOpen(true);
  };

  const openEdit = (c: Customer) => {
    setEditing({
      id: c.id,
      name: c.name,
      phone: c.phone,
      address: c.address,
      dueBalance: c.dueBalance,
      notes: decryptedNotesMap[c.id] || c.notes || '',
    });
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing.name.trim()) return;
    await onSaveCustomer({
      id: editing.id || undefined,
      name: editing.name.trim(),
      phone: editing.phone.trim(),
      address: editing.address.trim(),
      dueBalance: Math.max(0, Number(editing.dueBalance) || 0),
      notes: editing.notes,
    });
    setModalOpen(false);
  };

  const handleCollectDueSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payModalCust) return;
    const amt = Number(payAmount);
    if (!Number.isFinite(amt) || amt <= 0) return;
    await onCollectDue(payModalCust.id, amt);
    setPayModalCust(null);
    setPayAmount('');
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white">
            {t(lang, 'customersTitle')}
          </h1>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {formatNumber(customers.length, lang)}{' '}
            {lang === 'bn' ? 'জন নিবন্ধিত কাস্টমার' : 'registered customers'}
          </p>
        </div>
        <button
          type="button"
          onClick={openAdd}
          className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700 whitespace-nowrap shrink-0"
        >
          <Plus className="h-4 w-4" />
          <span>{t(lang, 'addCustomer')}</span>
        </button>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800 dark:bg-slate-900">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={
              lang === 'bn'
                ? 'কাস্টমারের নাম, মোবাইল বা ঠিকানা দিয়ে খুঁজুন...'
                : 'Search customer by name, phone, or address...'
            }
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pr-4 pl-10 text-sm text-slate-900 focus:border-emerald-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
        </div>

        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
          <button
            type="button"
            onClick={() => setOnlyDue(false)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition whitespace-nowrap ${
              !onlyDue
                ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            {t(lang, 'filterAll')}
          </button>
          <button
            type="button"
            onClick={() => setOnlyDue(true)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition whitespace-nowrap ${
              onlyDue
                ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            {t(lang, 'dueBalance')}
          </button>
        </div>
      </div>

      {/* Customer List + Purchase History Split */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          {filtered.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-slate-500">
              {lang === 'bn'
                ? 'কোনো কাস্টমার পাওয়া যায়নি'
                : 'No matching customers found'}
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {filtered.map((c) => {
                const isEncryptedLocked = Boolean(c.encryptedNotes) && !decryptedNotesMap[c.id];
                const noteText = decryptedNotesMap[c.id] || c.notes;
                const isSelected = selectedCustId === c.id;

                return (
                  <div
                    key={c.id}
                    onClick={() => setSelectedCustId(c.id)}
                    className={`cursor-pointer p-4 sm:p-5 transition ${
                      isSelected
                        ? 'bg-emerald-50/50 dark:bg-emerald-950/20'
                        : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="truncate text-sm font-bold text-slate-900 dark:text-white">
                            {c.name}
                          </h3>
                          {c.encryptedNotes && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                              <Lock className="h-3 w-3" />
                              E2EE
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-slate-500 dark:text-slate-400">
                          <span className="font-mono-num">{c.phone || '—'}</span>
                          <span aria-hidden="true">·</span>
                          <span>{c.address || '—'}</span>
                          <span aria-hidden="true">·</span>
                          <span>
                            {t(lang, 'visitCount')}:{' '}
                            <span className="font-mono-num">
                              {formatNumber(c.visitCount, lang)}
                            </span>
                          </span>
                        </div>
                        <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                          {isEncryptedLocked
                            ? t(lang, 'lockedNoteHint')
                            : noteText || (lang === 'bn' ? 'কোনো নোট নেই' : 'No medical notes')}
                        </p>
                      </div>

                      <div className="flex items-center justify-between gap-4 sm:flex-col sm:items-end">
                        <div className="sm:text-right">
                          <div className="text-[11px] text-slate-400">
                            {t(lang, 'totalSpent')}
                          </div>
                          <div className="font-mono-num text-sm font-bold text-slate-900 dark:text-white">
                            {formatMoney(c.totalSpent, currency, lang)}
                          </div>
                          {c.dueBalance > 0 && (
                            <div className="font-mono-num mt-0.5 text-xs font-semibold text-red-600 dark:text-red-400">
                              {t(lang, 'dueBalance')}:{' '}
                              {formatMoney(c.dueBalance, currency, lang)}
                            </div>
                          )}
                        </div>

                        <div
                          className="flex items-center gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {c.dueBalance > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                setPayModalCust(c);
                                setPayAmount(String(c.dueBalance));
                              }}
                              className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                            >
                              <Wallet className="h-3.5 w-3.5" />
                              <span>{t(lang, 'collectDue')}</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => openEdit(c)}
                            aria-label={t(lang, 'editCustomer')}
                            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-white"
                          >
                            <Edit3 className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void onDeleteCustomer(c.id)}
                            aria-label={t(lang, 'delete')}
                            className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Selected Customer Invoice History */}
        <div className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">
            {selectedCustomer
              ? `${selectedCustomer.name} — ${t(lang, 'recentInvoices')}`
              : lang === 'bn'
                ? 'কাস্টমারের ক্রয় ইতিহাস'
                : 'Customer Purchase History'}
          </h2>
          {!selectedCustomer ? (
            <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
              {lang === 'bn'
                ? 'যেকোনো কাস্টমারের ওপর ক্লিক করে তাঁর পূর্ববর্তী ইনভয়েসগুলো দেখুন।'
                : 'Select any customer on the left to inspect their invoice history.'}
            </p>
          ) : selectedCustomerSales.length === 0 ? (
            <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
              {lang === 'bn'
                ? 'এই কাস্টমারের এখনো কোনো ইনভয়েস নেই।'
                : 'No invoices recorded for this customer yet.'}
            </p>
          ) : (
            <div className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
              {selectedCustomerSales.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onOpenInvoice(s)}
                  className="flex w-full items-center justify-between py-3 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800/40 rounded-lg px-2"
                >
                  <div>
                    <div className="font-mono-num text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                      {s.invoiceNumber}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      {formatDateOnly(s.createdAt, lang)} ·{' '}
                      {formatNumber(s.items.length, lang)}{' '}
                      {lang === 'bn' ? 'আইটেম' : 'items'}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono-num text-sm font-bold text-slate-900 dark:text-white">
                      {formatMoney(s.totalAmount, currency, lang)}
                    </div>
                    {s.dueAmount > 0 && (
                      <div className="font-mono-num text-[11px] text-red-600 dark:text-red-400">
                        {t(lang, 'dueAmount')}: {formatMoney(s.dueAmount, currency, lang)}
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Add / Edit Customer Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3.5 dark:border-slate-800">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                {editing.id ? t(lang, 'editCustomer') : t(lang, 'addCustomer')}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={(e) => void handleSave(e)} className="mt-4 space-y-3.5">
              <div>
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  {t(lang, 'customerName')} *
                </label>
                <input
                  required
                  type="text"
                  value={editing.name}
                  onChange={(e) => setEditing({...editing, name: e.target.value})}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  {t(lang, 'phone')}
                </label>
                <input
                  type="text"
                  value={editing.phone}
                  onChange={(e) => setEditing({...editing, phone: e.target.value})}
                  className="font-mono-num mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  {t(lang, 'address')}
                </label>
                <input
                  type="text"
                  value={editing.address}
                  onChange={(e) => setEditing({...editing, address: e.target.value})}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  {t(lang, 'dueBalance')} ({currency})
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={editing.dueBalance}
                  onChange={(e) =>
                    setEditing({...editing, dueBalance: Number(e.target.value)})
                  }
                  className="font-mono-num mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                    {t(lang, 'medicalNotes')}
                  </label>
                  {vaultPassphrase && (
                    <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                      {t(lang, 'encryptedBadge')}
                    </span>
                  )}
                </div>
                <textarea
                  rows={3}
                  value={editing.notes}
                  onChange={(e) => setEditing({...editing, notes: e.target.value})}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium dark:border-slate-700"
                >
                  {t(lang, 'cancel')}
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                >
                  {t(lang, 'save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Collect Due Modal */}
      {payModalCust && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              {t(lang, 'collectDue')} — {payModalCust.name}
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              {t(lang, 'dueBalance')}:{' '}
              <span className="font-mono-num font-semibold text-red-600">
                {formatMoney(payModalCust.dueBalance, currency, lang)}
              </span>
            </p>
            <form onSubmit={(e) => void handleCollectDueSubmit(e)} className="mt-4 space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  {t(lang, 'payDueAmount')} ({currency})
                </label>
                <input
                  required
                  type="number"
                  min={1}
                  max={payModalCust.dueBalance}
                  step="0.01"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="font-mono-num mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPayModalCust(null)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium dark:border-slate-700"
                >
                  {t(lang, 'cancel')}
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                >
                  {t(lang, 'confirmPayment')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
