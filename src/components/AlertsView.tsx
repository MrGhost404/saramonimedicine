import React, {useMemo, useState} from 'react';
import {AlertOctagon, AlertTriangle, PackagePlus, Trash2} from 'lucide-react';
import {formatNumber, t} from '../i18n/translations';
import type {Language, Medicine, PharmacySettings} from '../types/pharmacy';
import {getMedicineAlertFlags} from '../utils/alerts';
import {getMedicineStockBreakdown} from '../utils/stock';

interface AlertsViewProps {
  medicines: Medicine[];
  settings: PharmacySettings;
  lang: Language;
  onSaveMedicine: (
    med: Omit<Medicine, 'id' | 'updatedAt'> & {id?: string},
  ) => Promise<Medicine>;
  onDeleteMedicine: (id: string) => Promise<void>;
}

export const AlertsView: React.FC<AlertsViewProps> = ({
  medicines,
  settings,
  lang,
  onSaveMedicine,
  onDeleteMedicine,
}) => {
  const [restockTarget, setRestockTarget] = useState<Medicine | null>(null);
  const [addStrips, setAddStrips] = useState('10');
  const [addPcs, setAddPcs] = useState('0');

  const {expired, expiringSoon, lowStock} = useMemo(() => {
    const exp: Array<{med: Medicine; days: number}> = [];
    const soon: Array<{med: Medicine; days: number}> = [];
    const low: Medicine[] = [];

    for (const m of medicines) {
      const flags = getMedicineAlertFlags(m, settings.expiryAlertDays);
      if (flags.isExpired) exp.push({med: m, days: Math.abs(flags.daysUntilExpiry)});
      else if (flags.isExpiringSoon) soon.push({med: m, days: flags.daysUntilExpiry});
      if (flags.isLowStock) low.push(m);
    }

    exp.sort((a, b) => b.days - a.days);
    soon.sort((a, b) => a.days - b.days);
    low.sort((a, b) => a.stockQty - b.stockQty);

    return {expired: exp, expiringSoon: soon, lowStock: low};
  }, [medicines, settings.expiryAlertDays]);

  const handleRestock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restockTarget) return;
    const ppp = Math.max(1, restockTarget.piecesPerPack || 1);
    const strips = Math.max(0, Math.floor(Number(addStrips) || 0));
    const pcs = Math.max(0, Math.floor(Number(addPcs) || 0));
    const totalAddPieces = ppp > 1 ? strips * ppp + pcs : Math.max(strips, pcs);
    if (totalAddPieces <= 0) return;

    await onSaveMedicine({
      ...restockTarget,
      stockQty: restockTarget.stockQty + totalAddPieces,
    });
    setRestockTarget(null);
    setAddStrips('10');
    setAddPcs('0');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold text-slate-900 dark:text-white">
          {t(lang, 'alertsTitle')}
        </h1>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          {lang === 'bn'
            ? `মেয়াদ সতর্কতা সীমা: ${formatNumber(settings.expiryAlertDays, lang)} দিন`
            : `Configured expiry warning window: ${settings.expiryAlertDays} days`}
        </p>
      </div>

      {/* 1. Expired Batches */}
      <section className="overflow-hidden rounded-xl border border-red-200 bg-white dark:border-red-900/50 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-red-100 bg-red-50/60 px-5 py-3.5 dark:border-red-900/40 dark:bg-red-950/30">
          <div className="flex items-center gap-2 text-sm font-bold text-red-700 dark:text-red-400">
            <AlertOctagon className="h-4 w-4" />
            <span>{t(lang, 'expiredTitle')}</span>
          </div>
          <span className="font-mono-num text-xs font-bold text-red-700 dark:text-red-400">
            {formatNumber(expired.length, lang)}
          </span>
        </div>

        {expired.length === 0 ? (
          <div className="px-5 py-6 text-xs text-slate-500 dark:text-slate-400">
            {lang === 'bn'
              ? 'কোনো মেয়াদোত্তীর্ণ ব্যাচ পাওয়া যায়নি।'
              : 'No expired medicine batches found.'}
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {expired.map(({med, days}) => (
              <div
                key={med.id}
                className="flex flex-col justify-between gap-3 px-5 py-3.5 sm:flex-row sm:items-center"
              >
                <div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">
                    {med.name}
                  </div>
                  <div className="font-mono-num mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    {t(lang, 'batchNumber')}: {med.batchNumber} · {med.expiryDate} ·{' '}
                    <span className="font-semibold text-red-600 dark:text-red-400">
                      {formatNumber(days, lang)} {t(lang, 'daysExpired')}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void onDeleteMedicine(med.id)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40 self-start sm:self-center"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>{t(lang, 'delete')}</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 2. Expiring Soon */}
      <section className="overflow-hidden rounded-xl border border-amber-200 bg-white dark:border-amber-900/50 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-amber-100 bg-amber-50/60 px-5 py-3.5 dark:border-amber-900/40 dark:bg-amber-950/20">
          <div className="flex items-center gap-2 text-sm font-bold text-amber-800 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4" />
            <span>{t(lang, 'expiringSoonTitle')}</span>
          </div>
          <span className="font-mono-num text-xs font-bold text-amber-800 dark:text-amber-400">
            {formatNumber(expiringSoon.length, lang)}
          </span>
        </div>

        {expiringSoon.length === 0 ? (
          <div className="px-5 py-6 text-xs text-slate-500 dark:text-slate-400">
            {lang === 'bn'
              ? 'আসন্ন মেয়াদোত্তীর্ণ কোনো ব্যাচ নেই।'
              : 'No batches approaching expiry within the configured window.'}
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {expiringSoon.map(({med, days}) => {
              const stockInfo = getMedicineStockBreakdown(med, lang);
              return (
                <div
                  key={med.id}
                  className="flex items-center justify-between gap-3 px-5 py-3.5"
                >
                  <div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-white">
                      {med.name}
                    </div>
                    <div className="font-mono-num mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      {t(lang, 'batchNumber')}: {med.batchNumber} · {med.expiryDate} ·{' '}
                      {t(lang, 'stockQty')}: {stockInfo.primaryLabel}
                      {stockInfo.secondaryLabel ? ` (${stockInfo.secondaryLabel})` : ''}
                    </div>
                  </div>
                  <span className="font-mono-num text-xs font-bold text-amber-600 dark:text-amber-400 whitespace-nowrap">
                    {formatNumber(days, lang)} {t(lang, 'daysLeft')}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 3. Low Stock */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/70 px-5 py-3.5 dark:border-slate-800 dark:bg-slate-950/60">
          <div className="text-sm font-bold text-slate-900 dark:text-white">
            {t(lang, 'lowStockTitle')}
          </div>
          <span className="font-mono-num text-xs font-bold text-amber-600 dark:text-amber-400">
            {formatNumber(lowStock.length, lang)}
          </span>
        </div>

        {lowStock.length === 0 ? (
          <div className="px-5 py-6 text-xs text-slate-500 dark:text-slate-400">
            {lang === 'bn'
              ? 'সব ওষুধের স্টক পর্যাপ্ত রয়েছে।'
              : 'All medicines are stocked above minimum thresholds.'}
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {lowStock.map((med) => {
              const stockInfo = getMedicineStockBreakdown(med, lang);
              const ppp = stockInfo.piecesPerPack;
              return (
                <div
                  key={med.id}
                  className="flex flex-col justify-between gap-3 px-5 py-3.5 sm:flex-row sm:items-center"
                >
                  <div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-white">
                      {med.name}
                    </div>
                    <div className="font-mono-num mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      {med.manufacturer} · {t(lang, 'stockQty')}:{' '}
                      <span className="font-bold text-red-600 dark:text-red-400">
                        {stockInfo.primaryLabel}
                        {stockInfo.secondaryLabel ? ` (${stockInfo.secondaryLabel})` : ''}
                      </span>{' '}
                      / {t(lang, 'minAlert')}:{' '}
                      {ppp > 1
                        ? `${formatNumber(Math.floor(med.minStockAlert / ppp), lang)} ${stockInfo.unitShort} (${formatNumber(med.minStockAlert, lang)} ${t(lang, 'pieceLabelShort')})`
                        : formatNumber(med.minStockAlert, lang)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setRestockTarget(med);
                      setAddStrips(ppp > 1 ? '10' : '25');
                      setAddPcs('0');
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700 self-start sm:self-center"
                  >
                    <PackagePlus className="h-3.5 w-3.5" />
                    <span>{t(lang, 'restockNow')}</span>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Restock Modal */}
      {restockTarget && (() => {
        const targetInfo = getMedicineStockBreakdown(restockTarget, lang);
        const ppp = targetInfo.piecesPerPack;
        const addedTotal =
          ppp > 1
            ? Math.max(0, Math.floor(Number(addStrips) || 0)) * ppp +
              Math.max(0, Math.floor(Number(addPcs) || 0))
            : Math.max(0, Math.floor(Number(addStrips) || 0));

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {t(lang, 'restockNow')} — {restockTarget.name}
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                {t(lang, 'stockQty')}: {targetInfo.primaryLabel}
                {targetInfo.secondaryLabel ? ` · ${targetInfo.secondaryLabel}` : ''}
              </p>
              <form onSubmit={(e) => void handleRestock(e)} className="mt-4 space-y-4">
                {ppp > 1 ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                          + {t(lang, 'stripsCountLabel')}
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={addStrips}
                          onChange={(e) => setAddStrips(e.target.value)}
                          className="font-mono-num mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                          + {t(lang, 'loosePiecesLabel')}
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={addPcs}
                          onChange={(e) => setAddPcs(e.target.value)}
                          className="font-mono-num mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                        />
                      </div>
                    </div>
                    <div className="font-mono-num rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                      + {formatNumber(addedTotal, lang)} {t(lang, 'totalPiecesLabel')}
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                      {lang === 'bn' ? 'নতুন যোগকৃত পরিমাণ' : 'Quantity to Add'}
                    </label>
                    <input
                      required
                      type="number"
                      min={1}
                      value={addStrips}
                      onChange={(e) => setAddStrips(e.target.value)}
                      className="font-mono-num mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                    />
                  </div>
                )}
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setRestockTarget(null)}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium dark:border-slate-700"
                  >
                    {t(lang, 'cancel')}
                  </button>
                  <button
                    type="submit"
                    disabled={addedTotal <= 0}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {t(lang, 'save')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
