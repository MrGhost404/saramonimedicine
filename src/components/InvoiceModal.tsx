import React, {useState} from 'react';
import {Download, Printer, X} from 'lucide-react';
import {
  formatDateTime,
  formatMoney,
  formatNumber,
  t,
} from '../i18n/translations';
import type {Language, PharmacySettings, Sale} from '../types/pharmacy';

interface InvoiceModalProps {
  sale: Sale | null;
  settings: PharmacySettings;
  lang: Language;
  onClose: () => void;
}

export const InvoiceModal: React.FC<InvoiceModalProps> = ({
  sale,
  settings,
  lang,
  onClose,
}) => {
  const [printFormat, setPrintFormat] = useState<'a4' | 'thermal'>('a4');

  if (!sale) return null;

  const currency = settings.currencySymbol || '৳';
  const displayPharmacyName =
    lang === 'bn' ? settings.pharmacyName : settings.pharmacyNameEn;

  const esc = (val: string): string =>
    String(val ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const buildPrintableHtml = (
    mode: 'a4' | 'thermal',
    includeToolbar = false,
  ): string => {
    const isThermal = mode === 'thermal';

    const rowsHtml = sale.items
      .map((item, idx) =>
        isThermal
          ? `
          <tr>
            <td style="padding:4px 0;border-bottom:1px dashed #cbd5e1;">
              <div style="font-weight:600;">${idx + 1}. ${esc(item.medicineName)}</div>
              <div style="font-size:10px;color:#475569;">${esc(item.batchNumber)} · ${item.qty} ${esc(item.unit)} x ${esc(currency)}${item.sellingPrice.toFixed(2)} ${item.discountPercent > 0 ? `(-${item.discountPercent}%)` : ''}</div>
            </td>
            <td style="padding:4px 0;border-bottom:1px dashed #cbd5e1;text-align:right;font-weight:600;vertical-align:top;white-space:nowrap;">${esc(currency)}${item.lineTotal.toFixed(2)}</td>
          </tr>`
          : `
          <tr>
            <td style="padding:8px;border-bottom:1px solid #e2e8f0;">
              ${idx + 1}. ${esc(item.medicineName)}
              <div style="font-size:11px;color:#64748b;">${esc(t(lang, 'batchNumber'))}: ${esc(item.batchNumber)}</div>
            </td>
            <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right;">${item.qty} ${esc(item.unit)}</td>
            <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right;">${esc(currency)} ${item.sellingPrice.toFixed(2)}</td>
            <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right;">${item.discountPercent}%</td>
            <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:600;">${esc(currency)} ${item.lineTotal.toFixed(2)}</td>
          </tr>`,
      )
      .join('');

    const toolbarHtml = includeToolbar
      ? `<div class="print-toolbar">
          <button type="button" onclick="window.focus();window.print();" class="btn-print">${esc(t(lang, 'printInvoice'))}</button>
          <button type="button" onclick="window.close();" class="btn-close">${esc(t(lang, 'close'))}</button>
        </div>`
      : '';

    const toolbarCss = `
      .print-toolbar { display:flex; justify-content:center; gap:10px; padding:12px; margin-bottom:14px; background:#f1f5f9; border:1px solid #cbd5e1; border-radius:8px; }
      .btn-print { background:#059669; color:#fff; border:none; border-radius:6px; padding:8px 16px; font-size:13px; font-weight:600; cursor:pointer; }
      .btn-close { background:#fff; color:#334155; border:1px solid #cbd5e1; border-radius:6px; padding:8px 14px; font-size:13px; font-weight:500; cursor:pointer; }
      @media print { .print-toolbar { display:none !important; } }
    `;

    if (isThermal) {
      return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8" />
<title>${esc(sale.invoiceNumber)} - ${esc(displayPharmacyName)}</title>
<style>
  @page { size: 80mm auto; margin: 4mm; }
  body { font-family: system-ui, -apple-system, sans-serif; color: #000; width: 72mm; margin: 0 auto; padding: 4px; font-size: 11px; line-height: 1.4; }
  .center { text-align: center; }
  .divider { border-top: 1px dashed #334155; margin: 8px 0; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  .row { display: flex; justify-content: space-between; padding: 2px 0; }
  .grand { font-weight: 700; font-size: 13px; border-top: 1px solid #000; padding-top: 4px; margin-top: 4px; }
  ${toolbarCss}
</style>
</head>
<body>
  ${toolbarHtml}
  <div class="center">
    <div style="font-size:15px;font-weight:700;">${esc(displayPharmacyName)}</div>
    <div style="font-size:10px;">${esc(settings.address)}</div>
    <div style="font-size:10px;">${esc(settings.phone)}</div>
  </div>
  <div class="divider"></div>
  <div class="row"><span>${esc(t(lang, 'invoiceNo'))}:</span><strong>${esc(sale.invoiceNumber)}</strong></div>
  <div class="row"><span>${esc(t(lang, 'dateLabel'))}:</span><span>${esc(formatDateTime(sale.createdAt, lang))}</span></div>
  <div class="row"><span>${esc(t(lang, 'billTo'))}:</span><span>${esc(sale.customerName)}</span></div>
  <div class="divider"></div>
  <table><tbody>${rowsHtml}</tbody></table>
  <div class="divider"></div>
  <div class="row"><span>${esc(t(lang, 'subtotal'))}</span><span>${esc(currency)} ${sale.subtotal.toFixed(2)}</span></div>
  <div class="row"><span>${esc(t(lang, 'totalDiscount'))}</span><span>-${esc(currency)} ${sale.totalDiscountAmount.toFixed(2)}</span></div>
  ${sale.vatPercent > 0 ? `<div class="row"><span>${esc(t(lang, 'vatPct'))} (${sale.vatPercent}%)</span><span>${esc(currency)} ${sale.vatAmount.toFixed(2)}</span></div>` : ''}
  <div class="row grand"><span>${esc(t(lang, 'netPayable'))}</span><span>${esc(currency)} ${sale.totalAmount.toFixed(2)}</span></div>
  <div class="row"><span>${esc(t(lang, 'paidAmount'))}</span><span>${esc(currency)} ${sale.paidAmount.toFixed(2)}</span></div>
  ${sale.dueAmount > 0 ? `<div class="row"><span>${esc(t(lang, 'dueAmount'))}</span><span>${esc(currency)} ${sale.dueAmount.toFixed(2)}</span></div>` : ''}
  <div class="divider"></div>
  <p class="center" style="font-size:10px;margin:8px 0 0;">${esc(t(lang, 'thankYouNote'))}</p>
</body>
</html>`;
    }

    return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8" />
<title>${esc(sale.invoiceNumber)} - ${esc(displayPharmacyName)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  body { font-family: system-ui, -apple-system, sans-serif; color: #0f172a; max-width: 720px; margin: 0 auto; padding: 16px; }
  .head { display:flex; justify-content:space-between; border-bottom:2px solid #059669; padding-bottom:16px; margin-bottom:20px; }
  table { width:100%; border-collapse:collapse; margin:16px 0; font-size:14px; }
  th { text-align:left; padding:8px; background:#f8fafc; border-bottom:1px solid #cbd5e1; }
  .totals { margin-left:auto; width:280px; font-size:14px; }
  .totals div { display:flex; justify-content:space-between; padding:4px 0; }
  .grand { border-top:2px solid #0f172a; font-weight:700; font-size:16px; margin-top:6px; padding-top:8px !important; }
  ${toolbarCss}
</style>
</head>
<body>
  ${toolbarHtml}
  <div class="head">
    <div>
      <h1 style="margin:0;font-size:22px;color:#059669;">${esc(displayPharmacyName)}</h1>
      <p style="margin:4px 0;font-size:13px;color:#475569;">${esc(settings.address)}</p>
      <p style="margin:2px 0;font-size:13px;color:#475569;">${esc(settings.phone)}</p>
    </div>
    <div style="text-align:right;">
      <h2 style="margin:0;font-size:16px;">${esc(t(lang, 'invoicePreview'))}</h2>
      <p style="margin:4px 0;font-family:monospace;font-weight:600;">${esc(sale.invoiceNumber)}</p>
      <p style="margin:2px 0;font-size:12px;color:#64748b;">${esc(formatDateTime(sale.createdAt, lang))}</p>
    </div>
  </div>
  <p style="font-size:14px;"><strong>${esc(t(lang, 'billTo'))}:</strong> ${esc(sale.customerName)} ${sale.customerPhone ? `(${esc(sale.customerPhone)})` : ''}</p>
  <table>
    <thead>
      <tr>
        <th>${esc(t(lang, 'medicineName'))}</th>
        <th style="text-align:right;">${esc(t(lang, 'itemQty'))}</th>
        <th style="text-align:right;">${esc(t(lang, 'unitPrice'))}</th>
        <th style="text-align:right;">${esc(t(lang, 'discountPct'))}</th>
        <th style="text-align:right;">${esc(t(lang, 'lineTotal'))}</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <div class="totals">
    <div><span>${esc(t(lang, 'subtotal'))}</span><span>${esc(currency)} ${sale.subtotal.toFixed(2)}</span></div>
    <div><span>${esc(t(lang, 'totalDiscount'))}</span><span>-${esc(currency)} ${sale.totalDiscountAmount.toFixed(2)}</span></div>
    <div><span>${esc(t(lang, 'vatPct'))} (${sale.vatPercent}%)</span><span>${esc(currency)} ${sale.vatAmount.toFixed(2)}</span></div>
    <div class="grand"><span>${esc(t(lang, 'netPayable'))}</span><span>${esc(currency)} ${sale.totalAmount.toFixed(2)}</span></div>
    <div><span>${esc(t(lang, 'paidAmount'))}</span><span>${esc(currency)} ${sale.paidAmount.toFixed(2)}</span></div>
    <div><span>${esc(t(lang, 'dueAmount'))}</span><span>${esc(currency)} ${sale.dueAmount.toFixed(2)}</span></div>
  </div>
  <p style="margin-top:32px;text-align:center;font-size:12px;color:#64748b;">${esc(t(lang, 'thankYouNote'))}</p>
</body>
</html>`;
  };

  // Direct Print: opens a clean print window and launches browser print settings dialog,
  // with synchronous in-page @media print fallback if popups are restricted.
  const handleDirectPrint = () => {
    const html = buildPrintableHtml(printFormat, true);
    let openedWindow = false;
    try {
      const printWin = window.open(
        '',
        '_blank',
        'width=900,height=740,scrollbars=yes,resizable=yes',
      );
      if (printWin && !printWin.closed) {
        openedWindow = true;
        printWin.document.open();
        printWin.document.write(html);
        printWin.document.close();
        void printWin.document.body?.offsetHeight;
        printWin.focus();
        printWin.print();
      }
    } catch {
      openedWindow = false;
    }

    if (!openedWindow) {
      window.print();
    }
  };

  const handleDownloadHtml = () => {
    const html = buildPrintableHtml(printFormat, false);
    const blob = new Blob([html], {type: 'text/html;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sale.invoiceNumber}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="print-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div
        data-print-format={printFormat}
        className="print-invoice-sheet relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900"
      >
        {/* Modal Actions Header */}
        <div className="no-print flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <h2 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white">
            {t(lang, 'invoicePreview')} ·{' '}
            <span className="font-mono-num text-emerald-600 dark:text-emerald-400">
              {sale.invoiceNumber}
            </span>
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            {/* A4 / Thermal Print Format Toggle */}
            <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800">
              <button
                type="button"
                onClick={() => setPrintFormat('a4')}
                className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition whitespace-nowrap ${
                  printFormat === 'a4'
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white'
                    : 'text-slate-500'
                }`}
              >
                {t(lang, 'printA4')}
              </button>
              <button
                type="button"
                onClick={() => setPrintFormat('thermal')}
                className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition whitespace-nowrap ${
                  printFormat === 'thermal'
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white'
                    : 'text-slate-500'
                }`}
              >
                {t(lang, 'printThermal')}
              </button>
            </div>

            <button
              type="button"
              onClick={handleDirectPrint}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700 whitespace-nowrap"
            >
              <Printer className="h-3.5 w-3.5" />
              <span>{t(lang, 'printInvoice')}</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadHtml}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap"
            >
              <Download className="h-3.5 w-3.5" />
              <span>{t(lang, 'downloadReceipt')}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label={t(lang, 'close')}
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Printable Invoice Body */}
        <div className="print-scroll-area overflow-y-auto p-6 sm:p-8">
          <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-6 sm:flex-row dark:border-slate-800">
            <div>
              <h3 className="text-xl font-bold text-emerald-700 dark:text-emerald-400">
                {displayPharmacyName}
              </h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {settings.tagline}
              </p>
              <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                {settings.address}
              </p>
              <p className="font-mono-num mt-0.5 text-xs text-slate-600 dark:text-slate-300">
                {settings.phone}
              </p>
            </div>

            <div className="sm:text-right">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {t(lang, 'invoiceNo')}
              </div>
              <div className="font-mono-num mt-0.5 text-base font-bold text-slate-900 dark:text-white">
                {sale.invoiceNumber}
              </div>
              <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                {formatDateTime(sale.createdAt, lang)}
              </div>
              <div className="mt-1 text-xs font-medium text-slate-700 dark:text-slate-300">
                {t(lang, 'paymentMethod')}: {sale.paymentMethod.toUpperCase()}
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-2 text-sm">
            <div>
              <span className="text-slate-500 dark:text-slate-400">
                {t(lang, 'billTo')}:{' '}
              </span>
              <span className="font-semibold text-slate-900 dark:text-white">
                {sale.customerName}
              </span>
              {sale.customerPhone && (
                <span className="font-mono-num ml-2 text-xs text-slate-500 dark:text-slate-400">
                  · {sale.customerPhone}
                </span>
              )}
            </div>
          </div>

          {/* Line Items */}
          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <th className="py-2.5 pr-3">{t(lang, 'medicineName')}</th>
                  <th className="px-3 py-2.5 text-right">{t(lang, 'itemQty')}</th>
                  <th className="px-3 py-2.5 text-right">{t(lang, 'unitPrice')}</th>
                  <th className="px-3 py-2.5 text-right">{t(lang, 'discountPct')}</th>
                  <th className="py-2.5 pl-3 text-right">{t(lang, 'lineTotal')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                {sale.items.map((item, idx) => (
                  <tr key={`${item.medicineId}-${idx}`}>
                    <td className="py-3 pr-3">
                      <div className="font-medium text-slate-900 dark:text-slate-100">
                        {item.medicineName}
                      </div>
                      <div className="font-mono-num text-xs text-slate-500 dark:text-slate-400">
                        {t(lang, 'batchNumber')}: {item.batchNumber}
                      </div>
                    </td>
                    <td className="font-mono-num px-3 py-3 text-right text-slate-700 dark:text-slate-300">
                      {formatNumber(item.qty, lang)}{' '}
                      <span className="text-xs text-slate-400">{item.unit}</span>
                    </td>
                    <td className="font-mono-num px-3 py-3 text-right text-slate-700 dark:text-slate-300">
                      {formatMoney(item.sellingPrice, currency, lang)}
                    </td>
                    <td className="font-mono-num px-3 py-3 text-right text-slate-600 dark:text-slate-400">
                      {item.discountPercent}%
                    </td>
                    <td className="font-mono-num py-3 pl-3 text-right font-semibold text-slate-900 dark:text-white">
                      {formatMoney(item.lineTotal, currency, lang)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Summary Totals */}
          <div className="mt-6 flex flex-col items-end border-t border-slate-200 pt-5 dark:border-slate-800">
            <div className="w-full max-w-xs space-y-2 text-sm">
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>{t(lang, 'subtotal')}</span>
                <span className="font-mono-num">
                  {formatMoney(sale.subtotal, currency, lang)}
                </span>
              </div>
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>{t(lang, 'totalDiscount')}</span>
                <span className="font-mono-num text-amber-600 dark:text-amber-400">
                  -{formatMoney(sale.totalDiscountAmount, currency, lang)}
                </span>
              </div>
              {sale.vatPercent > 0 && (
                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span>
                    {t(lang, 'vatPct')} ({sale.vatPercent}%)
                  </span>
                  <span className="font-mono-num">
                    {formatMoney(sale.vatAmount, currency, lang)}
                  </span>
                </div>
              )}
              <div className="flex justify-between border-t border-slate-200 pt-2.5 text-base font-bold text-slate-900 dark:border-slate-800 dark:text-white">
                <span>{t(lang, 'netPayable')}</span>
                <span className="font-mono-num text-emerald-600 dark:text-emerald-400">
                  {formatMoney(sale.totalAmount, currency, lang)}
                </span>
              </div>
              <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>{t(lang, 'paidAmount')}</span>
                <span className="font-mono-num">
                  {formatMoney(sale.paidAmount, currency, lang)}
                </span>
              </div>
              {sale.dueAmount > 0 && (
                <div className="flex justify-between text-xs font-semibold text-red-600 dark:text-red-400">
                  <span>{t(lang, 'dueAmount')}</span>
                  <span className="font-mono-num">
                    {formatMoney(sale.dueAmount, currency, lang)}
                  </span>
                </div>
              )}
              <div className="no-print flex justify-between border-t border-dashed border-slate-200 pt-2 text-xs text-emerald-700 dark:border-slate-800 dark:text-emerald-400">
                <span>{t(lang, 'estimatedProfit')} (Internal)</span>
                <span className="font-mono-num font-semibold">
                  {formatMoney(sale.netProfit, currency, lang)}
                </span>
              </div>
            </div>
          </div>

          <p className="mt-8 border-t border-slate-100 pt-4 text-center text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
            {t(lang, 'thankYouNote')}
          </p>
        </div>
      </div>
    </div>
  );
};
