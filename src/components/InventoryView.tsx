import React, {useMemo, useState} from 'react';
import {Edit3, Plus, Search, Trash2, X} from 'lucide-react';
import {formatMoney, formatNumber, t} from '../i18n/translations';
import type {
  Language,
  Medicine,
  PharmacySettings,
} from '../types/pharmacy';
import {getMedicineAlertFlags} from '../utils/alerts';
import {getMedicineStockBreakdown} from '../utils/stock';

interface InventoryViewProps {
  medicines: Medicine[];
  settings: PharmacySettings;
  lang: Language;
  onSaveMedicine: (
    med: Omit<Medicine, 'id' | 'updatedAt'> & {id?: string},
  ) => Promise<Medicine>;
  onDeleteMedicine: (id: string) => Promise<void>;
}

const EMPTY_FORM = {
  id: '',
  name: '',
  genericName: '',
  category: '',
  manufacturer: '',
  batchNumber: '',
  expiryDate: new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10),
  purchasePrice: 0,
  sellingPrice: 0,
  piecesPerPack: 10,
  stockQty: 0,
  minStockAlert: 150,
  unit: 'পাতা (১০টি)',
};

export const InventoryView: React.FC<InventoryViewProps> = ({
  medicines,
  settings,
  lang,
  onSaveMedicine,
  onDeleteMedicine,
}) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'healthy' | 'low_stock' | 'expiring_soon' | 'expired'
  >('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const currency = settings.currencySymbol || '৳';
  const isCompact = settings.tableDensity === 'compact';

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return medicines.filter((m) => {
      const flags = getMedicineAlertFlags(m, settings.expiryAlertDays);
      if (statusFilter === 'healthy' && flags.primaryStatus !== 'healthy') {
        return false;
      }
      if (statusFilter === 'low_stock' && !flags.isLowStock) return false;
      if (statusFilter === 'expiring_soon' && !flags.isExpiringSoon) return false;
      if (statusFilter === 'expired' && !flags.isExpired) return false;

      if (!q) return true;
      return (
        m.name.toLowerCase().includes(q) ||
        m.genericName.toLowerCase().includes(q) ||
        m.batchNumber.toLowerCase().includes(q) ||
        m.manufacturer.toLowerCase().includes(q)
      );
    });
  }, [medicines, search, settings.expiryAlertDays, statusFilter]);

  const openAdd = () => {
    setForm(EMPTY_FORM);
    setModalOpen(true);
  };

  const openEdit = (med: Medicine) => {
    setForm({
      id: med.id,
      name: med.name,
      genericName: med.genericName,
      category: med.category,
      manufacturer: med.manufacturer,
      batchNumber: med.batchNumber,
      expiryDate: med.expiryDate,
      purchasePrice: med.purchasePrice,
      sellingPrice: med.sellingPrice,
      piecesPerPack: Math.max(1, med.piecesPerPack || 1),
      stockQty: med.stockQty,
      minStockAlert: med.minStockAlert,
      unit: med.unit,
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.batchNumber.trim()) return;
    await onSaveMedicine({
      id: form.id || undefined,
      name: form.name.trim(),
      genericName: form.genericName.trim(),
      category: form.category.trim(),
      manufacturer: form.manufacturer.trim(),
      batchNumber: form.batchNumber.trim(),
      expiryDate: form.expiryDate,
      purchasePrice: Number(form.purchasePrice) || 0,
      sellingPrice: Number(form.sellingPrice) || 0,
      piecesPerPack: Math.max(1, Math.floor(Number(form.piecesPerPack) || 1)),
      stockQty: Math.max(0, Math.floor(Number(form.stockQty) || 0)),
      minStockAlert: Math.max(0, Math.floor(Number(form.minStockAlert) || 10)),
      unit: form.unit.trim() || 'পিস',
    });
    setModalOpen(false);
  };

  return (
    <div className="space-y-5">
      {/* Header & Controls */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white">
            {t(lang, 'inventoryTitle')}
          </h1>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {formatNumber(medicines.length, lang)} {t(lang, 'stockItemsCount')}
          </p>
        </div>

        <button
          type="button"
          onClick={openAdd}
          className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700 whitespace-nowrap shrink-0"
        >
          <Plus className="h-4 w-4" />
          <span>{t(lang, 'addMedicine')}</span>
        </button>
      </div>

      {/* Search & Segmented Filter */}
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800 dark:bg-slate-900">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t(lang, 'searchPlaceholder')}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pr-4 pl-10 text-sm text-slate-900 focus:border-emerald-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
          {(
            [
              ['all', t(lang, 'filterAll')],
              ['healthy', t(lang, 'filterInStock')],
              ['low_stock', t(lang, 'filterLowStock')],
              ['expiring_soon', t(lang, 'filterExpiringSoon')],
              ['expired', t(lang, 'filterExpired')],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setStatusFilter(key)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition whitespace-nowrap shrink-0 ${
                statusFilter === key
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Inventory Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {filtered.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {lang === 'bn'
                ? 'এই ফিল্টারে কোনো ওষুধ পাওয়া যায়নি'
                : 'No medicines match this filter'}
            </p>
            <button
              type="button"
              onClick={openAdd}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>{t(lang, 'addMedicine')}</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
                  <th className="px-4 py-3">{t(lang, 'medicineName')}</th>
                  <th className="px-3 py-3">{t(lang, 'batchNumber')}</th>
                  <th className="px-3 py-3">{t(lang, 'expiryDate')}</th>
                  <th className="px-3 py-3 text-right">{t(lang, 'purchasePrice')}</th>
                  <th className="px-3 py-3 text-right">{t(lang, 'sellingPrice')}</th>
                  <th className="px-3 py-3 text-right">{t(lang, 'unitProfit')}</th>
                  <th className="px-3 py-3 text-right">{t(lang, 'stockQty')}</th>
                  <th className="px-3 py-3">{t(lang, 'statusLabel')}</th>
                  <th className="px-4 py-3 text-right">{t(lang, 'actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {filtered.map((med) => {
                  const flags = getMedicineAlertFlags(med, settings.expiryAlertDays);
                  const stockInfo = getMedicineStockBreakdown(med, lang);
                  const ppp = stockInfo.piecesPerPack;
                  const unitProfit = med.sellingPrice - med.purchasePrice;
                  const singleBuy = stockInfo.piecePurchasePrice;
                  const singleSell = stockInfo.pieceSellingPrice;
                  const singleProfit = singleSell - singleBuy;
                  const marginPct =
                    med.sellingPrice > 0
                      ? (unitProfit / med.sellingPrice) * 100
                      : 0;
                  const cellPad = isCompact ? 'py-2' : 'py-3.5';
                  const unitShort = stockInfo.unitShort;

                  return (
                    <tr
                      key={med.id}
                      className="transition hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                    >
                      <td className={`px-4 ${cellPad}`}>
                        <div className="font-semibold text-slate-900 dark:text-slate-100">
                          {med.name}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {med.genericName}
                          {med.manufacturer ? ` · ${med.manufacturer}` : ''}
                          {ppp > 1
                            ? ` · ${formatNumber(ppp, lang)} ${t(lang, 'pieceLabelShort')}/${unitShort}`
                            : ''}
                        </div>
                      </td>
                      <td className={`font-mono-num px-3 ${cellPad} text-xs text-slate-700 dark:text-slate-300`}>
                        {med.batchNumber}
                      </td>
                      <td className={`font-mono-num px-3 ${cellPad} text-xs`}>
                        <div className="text-slate-800 dark:text-slate-200">
                          {med.expiryDate}
                        </div>
                        <div
                          className={
                            flags.isExpired
                              ? 'text-red-600 dark:text-red-400'
                              : flags.isExpiringSoon
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-slate-400'
                          }
                        >
                          {flags.isExpired
                            ? `${Math.abs(flags.daysUntilExpiry)}d ${lang === 'bn' ? 'আগে মেয়াদ শেষ' : 'ago'}`
                            : `${flags.daysUntilExpiry}d`}
                        </div>
                      </td>
                      <td className={`font-mono-num px-3 ${cellPad} text-right`}>
                        <div className="text-slate-700 dark:text-slate-300">
                          {formatMoney(med.purchasePrice, currency, lang)}
                          <span className="text-[11px] text-slate-400">/{unitShort}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          {formatMoney(singleBuy, currency, lang)}/{t(lang, 'pieceLabelShort')}
                        </div>
                      </td>
                      <td className={`font-mono-num px-3 ${cellPad} text-right`}>
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {formatMoney(med.sellingPrice, currency, lang)}
                          <span className="text-[11px] font-normal text-slate-400">/{unitShort}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          {formatMoney(singleSell, currency, lang)}/{t(lang, 'pieceLabelShort')}
                        </div>
                      </td>
                      <td className={`font-mono-num px-3 ${cellPad} text-right`}>
                        <div className="font-semibold text-emerald-600 dark:text-emerald-400">
                          +{formatMoney(unitProfit, currency, lang)}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          +{formatMoney(singleProfit, currency, lang)}/{t(lang, 'pieceLabelShort')} · {marginPct.toFixed(1)}%
                        </div>
                      </td>
                      <td className={`font-mono-num px-3 ${cellPad} text-right`}>
                        <div
                          className={`font-semibold ${
                            flags.isOutOfStock
                              ? 'text-red-600 dark:text-red-400'
                              : flags.isLowStock
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-slate-900 dark:text-slate-100'
                          }`}
                        >
                          {stockInfo.primaryLabel}
                        </div>
                        {stockInfo.secondaryLabel && (
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            {stockInfo.secondaryLabel}
                          </div>
                        )}
                      </td>
                      <td className={`px-3 ${cellPad} text-xs font-medium whitespace-nowrap`}>
                        {flags.isExpired ? (
                          <span className="text-red-600 dark:text-red-400">
                            {t(lang, 'filterExpired')}
                          </span>
                        ) : flags.isLowStock ? (
                          <span className="text-amber-600 dark:text-amber-400">
                            {t(lang, 'filterLowStock')}
                          </span>
                        ) : flags.isExpiringSoon ? (
                          <span className="text-amber-600 dark:text-amber-400">
                            {t(lang, 'filterExpiringSoon')}
                          </span>
                        ) : (
                          <span className="text-emerald-600 dark:text-emerald-400">
                            {t(lang, 'filterInStock')}
                          </span>
                        )}
                      </td>
                      <td className={`px-4 ${cellPad} text-right whitespace-nowrap`}>
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEdit(med)}
                            aria-label={t(lang, 'editMedicine')}
                            className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                          >
                            <Edit3 className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void onDeleteMedicine(med.id)}
                            aria-label={t(lang, 'delete')}
                            className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Medicine Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3.5 dark:border-slate-800">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                {form.id ? t(lang, 'editMedicine') : t(lang, 'addMedicine')}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={(e) => void handleSubmit(e)} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                    {t(lang, 'medicineName')} *
                  </label>
                  <input
                    required
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({...form, name: e.target.value})}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                    {t(lang, 'genericName')}
                  </label>
                  <input
                    type="text"
                    value={form.genericName}
                    onChange={(e) =>
                      setForm({...form, genericName: e.target.value})
                    }
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                    {t(lang, 'manufacturerLabel')}
                  </label>
                  <input
                    type="text"
                    value={form.manufacturer}
                    onChange={(e) =>
                      setForm({...form, manufacturer: e.target.value})
                    }
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                    {t(lang, 'batchNumber')} *
                  </label>
                  <input
                    required
                    type="text"
                    value={form.batchNumber}
                    onChange={(e) =>
                      setForm({...form, batchNumber: e.target.value})
                    }
                    className="font-mono-num mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                    {t(lang, 'expiryDate')} *
                  </label>
                  <input
                    required
                    type="date"
                    value={form.expiryDate}
                    onChange={(e) =>
                      setForm({...form, expiryDate: e.target.value})
                    }
                    className="font-mono-num mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                    {t(lang, 'piecesPerPackLabel')} *
                  </label>
                  <input
                    required
                    type="number"
                    min={1}
                    value={form.piecesPerPack}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        piecesPerPack: Math.max(1, Number(e.target.value) || 1),
                      })
                    }
                    className="font-mono-num mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                    {t(lang, 'unitLabel')}
                  </label>
                  <input
                    type="text"
                    value={form.unit}
                    onChange={(e) => setForm({...form, unit: e.target.value})}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                    {t(lang, 'stripRate')} — {lang === 'bn' ? 'কিনা দাম' : 'Buy'} ({currency}) *
                  </label>
                  <input
                    required
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.purchasePrice}
                    onChange={(e) =>
                      setForm({...form, purchasePrice: Number(e.target.value)})
                    }
                    className="font-mono-num mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                    {t(lang, 'singlePieceRate')} — {lang === 'bn' ? 'কিনা দাম' : 'Buy'} ({currency})
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={Number(
                      (
                        form.purchasePrice / Math.max(1, form.piecesPerPack)
                      ).toFixed(2),
                    )}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        purchasePrice: Number(
                          (
                            (Number(e.target.value) || 0) *
                            Math.max(1, form.piecesPerPack)
                          ).toFixed(2),
                        ),
                      })
                    }
                    className="font-mono-num mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                    {t(lang, 'stripRate')} — {lang === 'bn' ? 'বিক্রি দাম' : 'Sell'} ({currency}) *
                  </label>
                  <input
                    required
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.sellingPrice}
                    onChange={(e) =>
                      setForm({...form, sellingPrice: Number(e.target.value)})
                    }
                    className="font-mono-num mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                    {t(lang, 'singlePieceRate')} — {lang === 'bn' ? 'বিক্রি দাম' : 'Sell'} ({currency})
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={Number(
                      (
                        form.sellingPrice / Math.max(1, form.piecesPerPack)
                      ).toFixed(2),
                    )}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        sellingPrice: Number(
                          (
                            (Number(e.target.value) || 0) *
                            Math.max(1, form.piecesPerPack)
                          ).toFixed(2),
                        ),
                      })
                    }
                    className="font-mono-num mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>
                {Math.max(1, form.piecesPerPack || 1) > 1 ? (
                  <>
                    <div className="sm:col-span-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-950/60">
                      <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                        {t(lang, 'stockQty')} ({t(lang, 'sellByStrip')} + {t(lang, 'sellByPiece')}) *
                      </div>
                      <div className="mt-2.5 grid grid-cols-3 gap-3">
                        <div>
                          <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                            {t(lang, 'stripsCountLabel')}
                          </label>
                          <input
                            type="number"
                            min={0}
                            value={Math.floor(
                              form.stockQty / Math.max(1, form.piecesPerPack || 1),
                            )}
                            onChange={(e) => {
                              const ppp = Math.max(1, form.piecesPerPack || 1);
                              const strips = Math.max(0, Math.floor(Number(e.target.value) || 0));
                              const loose = form.stockQty % ppp;
                              setForm({...form, stockQty: strips * ppp + loose});
                            }}
                            className="font-mono-num mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                            {t(lang, 'loosePiecesLabel')}
                          </label>
                          <input
                            type="number"
                            min={0}
                            value={
                              form.stockQty % Math.max(1, form.piecesPerPack || 1)
                            }
                            onChange={(e) => {
                              const ppp = Math.max(1, form.piecesPerPack || 1);
                              const strips = Math.floor(form.stockQty / ppp);
                              const loose = Math.max(0, Math.floor(Number(e.target.value) || 0));
                              setForm({...form, stockQty: strips * ppp + loose});
                            }}
                            className="font-mono-num mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                            {t(lang, 'totalPiecesLabel')}
                          </label>
                          <input
                            required
                            type="number"
                            min={0}
                            value={form.stockQty}
                            onChange={(e) =>
                              setForm({
                                ...form,
                                stockQty: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                              })
                            }
                            className="font-mono-num mt-1 w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm font-semibold text-emerald-700 dark:border-emerald-800 dark:bg-slate-900 dark:text-emerald-400"
                          />
                        </div>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                        {t(lang, 'minAlert')} ({t(lang, 'stripsCountLabel')})
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={Math.floor(
                          form.minStockAlert / Math.max(1, form.piecesPerPack || 1),
                        )}
                        onChange={(e) => {
                          const ppp = Math.max(1, form.piecesPerPack || 1);
                          const strips = Math.max(0, Math.floor(Number(e.target.value) || 0));
                          setForm({...form, minStockAlert: strips * ppp});
                        }}
                        className="font-mono-num mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                        {t(lang, 'minAlert')} ({t(lang, 'totalPiecesLabel')})
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={form.minStockAlert}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            minStockAlert: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                          })
                        }
                        className="font-mono-num mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                        {t(lang, 'stockQty')} *
                      </label>
                      <input
                        required
                        type="number"
                        min={0}
                        value={form.stockQty}
                        onChange={(e) =>
                          setForm({...form, stockQty: Number(e.target.value)})
                        }
                        className="font-mono-num mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                        {t(lang, 'minAlert')}
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={form.minStockAlert}
                        onChange={(e) =>
                          setForm({...form, minStockAlert: Number(e.target.value)})
                        }
                        className="font-mono-num mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                      />
                    </div>
                  </>
                )}
                <div>
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                    {t(lang, 'categoryLabel')}
                  </label>
                  <input
                    type="text"
                    value={form.category}
                    onChange={(e) => setForm({...form, category: e.target.value})}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-4 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  {t(lang, 'cancel')}
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-emerald-600 px-5 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                >
                  {t(lang, 'save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
