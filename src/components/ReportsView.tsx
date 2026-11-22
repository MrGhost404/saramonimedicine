import React, {useMemo, useState} from 'react';
import {Download, FileText} from 'lucide-react';
import {
  formatDateOnly,
  formatDateTime,
  formatMoney,
  formatNumber,
  t,
} from '../i18n/translations';
import type {Language, PharmacySettings, Sale} from '../types/pharmacy';

interface ReportsViewProps {
  sales: Sale[];
  settings: PharmacySettings;
  lang: Language;
  onOpenInvoice: (sale: Sale) => void;
}

export const ReportsView: React.FC<ReportsViewProps> = ({
  sales,
  settings,
  lang,
  onOpenInvoice,
}) => {
  const [period, setPeriod] = useState<'today' | '7d' | '30d' | 'all'>('all');
  const currency = settings.currencySymbol || '৳';

  const filteredSales = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    return sales.filter((s) => {
      if (period === 'today') return s.createdAt.slice(0, 10) === todayStr;
      if (period === '7d') {
        const cutoff = new Date(now.getTime() - 7 * 86400000);
        return new Date(s.createdAt) >= cutoff;
      }
      if (period === '30d') {
        const cutoff = new Date(now.getTime() - 30 * 86400000);
        return new Date(s.createdAt) >= cutoff;
      }
      return true;
    });
  }, [period, sales]);

  const periodTotals = useMemo(() => {
    const revenue = filteredSales.reduce((a, s) => a + s.totalAmount, 0);
    const cost = filteredSales.reduce((a, s) => a + s.totalCost, 0);
    const discount = filteredSales.reduce((a, s) => a + s.totalDiscountAmount, 0);
    const profit = filteredSales.reduce((a, s) => a + s.netProfit, 0);
    return {revenue, cost, discount, profit};
  }, [filteredSales]);

  // Daily breakdown aggregation
  const dailyRows = useMemo(() => {
    const map = new Map<
      string,
      {
        date: string;
        count: number;
        revenue: number;
        discount: number;
        cost: number;
        profit: number;
      }
    >();

    for (const s of filteredSales) {
      const dateKey = s.createdAt.slice(0, 10);
      const curr = map.get(dateKey) || {
        date: dateKey,
        count: 0,
        revenue: 0,
        discount: 0,
        cost: 0,
        profit: 0,
      };
      curr.count += 1;
      curr.revenue += s.totalAmount;
      curr.discount += s.totalDiscountAmount;
      curr.cost += s.totalCost;
      curr.profit += s.netProfit;
      map.set(dateKey, curr);
    }

    return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date));
  }, [filteredSales]);

  // 7-day chart buckets
  const chartDays = useMemo(() => {
    const days: Array<{
      label: string;
      dateKey: string;
      revenue: number;
      profit: number;
    }> = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000);
      const dateKey = d.toISOString().slice(0, 10);
      const daySales = sales.filter((s) => s.createdAt.slice(0, 10) === dateKey);
      days.push({
        label: new Intl.DateTimeFormat(lang === 'bn' ? 'bn-BD' : 'en-US', {
          month: 'short',
          day: 'numeric',
        }).format(d),
        dateKey,
        revenue: daySales.reduce((a, s) => a + s.totalAmount, 0),
        profit: daySales.reduce((a, s) => a + s.netProfit, 0),
      });
    }
    return days;
  }, [lang, sales]);

  const maxChartVal = Math.max(
    100,
    ...chartDays.map((d) => d.revenue),
  );

  const handleExportCsv = () => {
    const header = [
      'Invoice',
      'Date',
      'Customer',
      'PaymentMethod',
      'Subtotal',
      'Discount',
      'TotalAmount',
      'PurchaseCost',
      'NetProfit',
    ].join(',');
    const rows = filteredSales.map((s) =>
      [
        s.invoiceNumber,
        s.createdAt,
        `"${s.customerName.replace(/"/g, '""')}"`,
        s.paymentMethod,
        s.subtotal.toFixed(2),
        s.totalDiscountAmount.toFixed(2),
        s.totalAmount.toFixed(2),
        s.totalCost.toFixed(2),
        s.netProfit.toFixed(2),
      ].join(','),
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([`\uFEFF${csv}`], {type: 'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `saramoni-sales-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white">
            {t(lang, 'reportsTitle')}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
            {(
              [
                ['today', t(lang, 'todayOnly')],
                ['7d', t(lang, 'last7Days')],
                ['30d', t(lang, 'last30Days')],
                ['all', t(lang, 'allDates')],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setPeriod(key)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition whitespace-nowrap ${
                  period === key
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap"
          >
            <Download className="h-3.5 w-3.5" />
            <span>{t(lang, 'exportCsv')}</span>
          </button>
        </div>
      </div>

      {/* Period Summary Strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {t(lang, 'totalRevenuePeriod')}
          </div>
          <div className="font-mono-num mt-2 text-2xl font-bold text-slate-900 dark:text-white">
            {formatMoney(periodTotals.revenue, currency, lang)}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {t(lang, 'totalCostPeriod')}
          </div>
          <div className="font-mono-num mt-2 text-2xl font-bold text-slate-700 dark:text-slate-200">
            {formatMoney(periodTotals.cost, currency, lang)}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {t(lang, 'totalDiscountPeriod')}
          </div>
          <div className="font-mono-num mt-2 text-2xl font-bold text-amber-600 dark:text-amber-400">
            {formatMoney(periodTotals.discount, currency, lang)}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {t(lang, 'netProfitPeriod')}
          </div>
          <div className="font-mono-num mt-2 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            {formatMoney(periodTotals.profit, currency, lang)}
          </div>
        </div>
      </div>

      {/* 7-Day Visual Bar Chart */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">
            {t(lang, 'dailyTrend')}
          </h2>
          <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-xs bg-slate-300 dark:bg-slate-600" />
              {lang === 'bn' ? 'মোট বিক্রি' : 'Sales'}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-xs bg-emerald-600 dark:bg-emerald-500" />
              {lang === 'bn' ? 'নিট লাভ' : 'Net Profit'}
            </span>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-7 items-end gap-3 h-48 pt-4">
          {chartDays.map((day) => {
            const revPct = Math.round((day.revenue / maxChartVal) * 100);
            const profPct = Math.round((day.profit / maxChartVal) * 100);
            return (
              <div
                key={day.dateKey}
                className="group flex h-full flex-col items-center justify-end gap-2"
              >
                <div className="relative flex w-full max-w-[44px] flex-1 items-end justify-center gap-1">
                  <div
                    title={`${day.label}: ${formatMoney(day.revenue, currency, lang)}`}
                    style={{height: `${Math.max(4, revPct)}%`}}
                    className="w-1/2 rounded-t-md bg-slate-200 transition-all group-hover:bg-slate-300 dark:bg-slate-700 dark:group-hover:bg-slate-600"
                  />
                  <div
                    title={`${day.label}: ${formatMoney(day.profit, currency, lang)}`}
                    style={{height: `${Math.max(4, profPct)}%`}}
                    className="w-1/2 rounded-t-md bg-emerald-600 transition-all group-hover:bg-emerald-500 dark:bg-emerald-500"
                  />
                </div>
                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">
                  {day.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Daily Breakdown Table & Invoice Archive */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-6 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              {lang === 'bn' ? 'দৈনিক বিক্রয় সারসংক্ষেপ' : 'Daily Sales Breakdown'}
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
                  <th className="px-4 py-3">{t(lang, 'dateLabel')}</th>
                  <th className="px-3 py-3 text-right">#</th>
                  <th className="px-3 py-3 text-right">{t(lang, 'lineTotal')}</th>
                  <th className="px-3 py-3 text-right">{t(lang, 'discountPct')}</th>
                  <th className="px-4 py-3 text-right">{t(lang, 'lineProfit')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {dailyRows.map((row) => (
                  <tr key={row.date}>
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                      {formatDateOnly(row.date, lang)}
                    </td>
                    <td className="font-mono-num px-3 py-3 text-right text-slate-600 dark:text-slate-400">
                      {formatNumber(row.count, lang)}
                    </td>
                    <td className="font-mono-num px-3 py-3 text-right font-semibold text-slate-900 dark:text-white">
                      {formatMoney(row.revenue, currency, lang)}
                    </td>
                    <td className="font-mono-num px-3 py-3 text-right text-amber-600 dark:text-amber-400">
                      {formatMoney(row.discount, currency, lang)}
                    </td>
                    <td className="font-mono-num px-4 py-3 text-right font-semibold text-emerald-600 dark:text-emerald-400">
                      {formatMoney(row.profit, currency, lang)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="lg:col-span-6 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              {t(lang, 'recentInvoices')}
            </h2>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[380px] overflow-y-auto">
            {filteredSales.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono-num text-xs font-bold text-emerald-600 dark:text-emerald-400">
                      {s.invoiceNumber}
                    </span>
                    <span className="text-xs text-slate-400">·</span>
                    <span className="truncate text-xs font-medium text-slate-800 dark:text-slate-200">
                      {s.customerName}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                    {formatDateTime(s.createdAt, lang)} ·{' '}
                    {t(lang, 'lineProfit')}:{' '}
                    <span className="font-mono-num text-emerald-600 dark:text-emerald-400">
                      {formatMoney(s.netProfit, currency, lang)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span className="font-mono-num text-sm font-bold text-slate-900 dark:text-white">
                    {formatMoney(s.totalAmount, currency, lang)}
                  </span>
                  <button
                    type="button"
                    onClick={() => onOpenInvoice(s)}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    <span>{lang === 'bn' ? 'ইনভয়েস' : 'Invoice'}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
