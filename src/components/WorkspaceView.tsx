import React, {useMemo, useState} from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Minus,
  Plus,
  Receipt,
  Search,
  Trash2,
  UserPlus,
} from 'lucide-react';
import {
  formatMoney,
  formatNumber,
  t,
} from '../i18n/translations';
import type {
  Customer,
  Language,
  Medicine,
  PaymentMethod,
  PharmacySettings,
  Sale,
  SaleItem,
} from '../types/pharmacy';
import {getMedicineAlertFlags} from '../utils/alerts';
import {getMedicineStockBreakdown} from '../utils/stock';

interface CartLine {
  key: string;
  medicine: Medicine;
  sellUnit: 'piece' | 'strip';
  qty: number;
  discountPercent: number;
}

interface WorkspaceViewProps {
  medicines: Medicine[];
  customers: Customer[];
  sales: Sale[];
  settings: PharmacySettings;
  lang: Language;
  onSubmitSale: (
    sale: Omit<Sale, 'id' | 'invoiceNumber' | 'createdAt'>,
  ) => Promise<Sale>;
  onQuickAddCustomer: (
    input: Omit<
      Customer,
      'id' | 'updatedAt' | 'totalSpent' | 'visitCount' | 'lastVisit'
    >,
  ) => Promise<Customer>;
  onOpenInvoice: (sale: Sale) => void;
  onNavigateTab: (tab: 'alerts' | 'reports' | 'inventory') => void;
}

export const WorkspaceView: React.FC<WorkspaceViewProps> = ({
  medicines,
  customers,
  sales,
  settings,
  lang,
  onSubmitSale,
  onQuickAddCustomer,
  onOpenInvoice,
  onNavigateTab,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [catalogFilter, setCatalogFilter] = useState<'all' | 'in_stock' | 'alerts'>('all');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [extraDiscountPercent, setExtraDiscountPercent] = useState<number>(0);
  const [vatPercent, setVatPercent] = useState<number>(settings.defaultVatPercent || 0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [customPaid, setCustomPaid] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Quick customer add inline modal
  const [showQuickCust, setShowQuickCust] = useState(false);
  const [quickCustName, setQuickCustName] = useState('');
  const [quickCustPhone, setQuickCustPhone] = useState('');

  const currency = settings.currencySymbol || '৳';
  const todayStr = new Date().toISOString().slice(0, 10);

  // Today's live KPI metrics
  const kpiStats = useMemo(() => {
    const todaysSales = sales.filter((s) => s.createdAt.slice(0, 10) === todayStr);
    const todayRevenue = todaysSales.reduce((acc, s) => acc + s.totalAmount, 0);
    const todayProfit = todaysSales.reduce((acc, s) => acc + s.netProfit, 0);
    const todayDiscount = todaysSales.reduce(
      (acc, s) => acc + s.totalDiscountAmount,
      0,
    );
    const todaySubtotal = todaysSales.reduce((acc, s) => acc + s.subtotal, 0);
    const avgDiscountPct =
      todaySubtotal > 0 ? (todayDiscount / todaySubtotal) * 100 : 0;
    const profitMarginPct =
      todayRevenue > 0 ? (todayProfit / todayRevenue) * 100 : 0;

    let alertCount = 0;
    let totalStockValue = 0;
    for (const m of medicines) {
      const ppp = Math.max(1, m.piecesPerPack || 1);
      totalStockValue += (m.purchasePrice / ppp) * m.stockQty;
      const flags = getMedicineAlertFlags(m, settings.expiryAlertDays);
      if (flags.isExpired || flags.isExpiringSoon || flags.isLowStock) {
        alertCount++;
      }
    }

    return {
      todayCount: todaysSales.length,
      todayRevenue,
      todayProfit,
      todayDiscount,
      avgDiscountPct,
      profitMarginPct,
      alertCount,
      totalStockValue,
    };
  }, [medicines, sales, settings.expiryAlertDays, todayStr]);

  // Filtered Medicine Search (Name, Generic, Batch Number)
  const filteredMedicines = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return medicines.filter((m) => {
      const flags = getMedicineAlertFlags(m, settings.expiryAlertDays);
      if (catalogFilter === 'in_stock' && (flags.isOutOfStock || flags.isExpired)) {
        return false;
      }
      if (
        catalogFilter === 'alerts' &&
        !flags.isExpired &&
        !flags.isExpiringSoon &&
        !flags.isLowStock
      ) {
        return false;
      }
      if (!q) return true;
      return (
        m.name.toLowerCase().includes(q) ||
        m.genericName.toLowerCase().includes(q) ||
        m.batchNumber.toLowerCase().includes(q) ||
        m.manufacturer.toLowerCase().includes(q)
      );
    });
  }, [catalogFilter, medicines, searchQuery, settings.expiryAlertDays]);

  const getCartPiecesForMed = (
    lines: CartLine[],
    medId: string,
    excludeKey?: string,
  ): number =>
    lines.reduce((sum, line) => {
      if (line.medicine.id !== medId || line.key === excludeKey) return sum;
      const ppp = Math.max(1, line.medicine.piecesPerPack || 1);
      const mult = line.sellUnit === 'strip' && ppp > 1 ? ppp : 1;
      return sum + line.qty * mult;
    }, 0);

  const addToCart = (
    med: Medicine,
    preferredUnit: 'piece' | 'strip' = 'piece',
  ) => {
    const flags = getMedicineAlertFlags(med, settings.expiryAlertDays);
    if (flags.isExpired || med.stockQty <= 0) return;

    const ppp = Math.max(1, med.piecesPerPack || 1);
    const sellUnit: 'piece' | 'strip' =
      ppp > 1 ? preferredUnit : 'piece';
    const mult = sellUnit === 'strip' ? ppp : 1;
    const key = `${med.id}:${sellUnit}`;

    setCart((prev) => {
      const usedPieces = getCartPiecesForMed(prev, med.id);
      const remainingPieces = med.stockQty - usedPieces;
      if (remainingPieces < mult) return prev;

      const existing = prev.find((line) => line.key === key);
      if (existing) {
        return prev.map((line) =>
          line.key === key ? {...line, qty: line.qty + 1} : line,
        );
      }
      return [...prev, {key, medicine: med, sellUnit, qty: 1, discountPercent: 0}];
    });
  };

  const updateCartQty = (lineKey: string, nextQty: number) => {
    setCart((prev) =>
      prev
        .map((line) => {
          if (line.key !== lineKey) return line;
          const ppp = Math.max(1, line.medicine.piecesPerPack || 1);
          const mult = line.sellUnit === 'strip' && ppp > 1 ? ppp : 1;
          const otherPieces = getCartPiecesForMed(
            prev,
            line.medicine.id,
            lineKey,
          );
          const maxQty = Math.floor(
            Math.max(0, line.medicine.stockQty - otherPieces) / mult,
          );
          const clamped = Math.max(0, Math.min(Math.floor(nextQty || 0), maxQty));
          return {...line, qty: clamped};
        })
        .filter((line) => line.qty > 0),
    );
  };

  const switchCartLineUnit = (
    lineKey: string,
    targetUnit: 'piece' | 'strip',
  ) => {
    setCart((prev) => {
      const targetLine = prev.find((l) => l.key === lineKey);
      if (!targetLine || targetLine.sellUnit === targetUnit) return prev;
      const ppp = Math.max(1, targetLine.medicine.piecesPerPack || 1);
      if (ppp <= 1) return prev;

      const newKey = `${targetLine.medicine.id}:${targetUnit}`;
      const newMult = targetUnit === 'strip' ? ppp : 1;
      const otherPiecesExcludingCurrent = getCartPiecesForMed(
        prev,
        targetLine.medicine.id,
        lineKey,
      );
      const availForThis =
        targetLine.medicine.stockQty - otherPiecesExcludingCurrent;
      if (availForThis < newMult) return prev;

      const existingSibling = prev.find((l) => l.key === newKey);
      if (existingSibling) {
        const siblingMult = existingSibling.sellUnit === 'strip' ? ppp : 1;
        const maxCombined = Math.floor(availForThis / siblingMult);
        const mergedQty = Math.min(maxCombined, existingSibling.qty + targetLine.qty);
        return prev
          .filter((l) => l.key !== lineKey)
          .map((l) => (l.key === newKey ? {...l, qty: mergedQty} : l));
      }

      const clampedQty = Math.max(
        1,
        Math.min(targetLine.qty, Math.floor(availForThis / newMult)),
      );
      return prev.map((l) =>
        l.key === lineKey
          ? {...l, key: newKey, sellUnit: targetUnit, qty: clampedQty}
          : l,
      );
    });
  };

  const updateCartDiscount = (lineKey: string, pct: number) => {
    const safePct = Math.max(0, Math.min(90, Number.isFinite(pct) ? pct : 0));
    setCart((prev) =>
      prev.map((line) =>
        line.key === lineKey ? {...line, discountPercent: safePct} : line,
      ),
    );
  };

  // Real-time financial calculation
  const billSummary = useMemo(() => {
    const computedItems: SaleItem[] = cart.map((line) => {
      const ppp = Math.max(1, line.medicine.piecesPerPack || 1);
      const isStrip = line.sellUnit === 'strip' && ppp > 1;
      const unitSellingPrice =
        ppp > 1 && !isStrip ? line.medicine.sellingPrice / ppp : line.medicine.sellingPrice;
      const unitPurchasePrice =
        ppp > 1 && !isStrip ? line.medicine.purchasePrice / ppp : line.medicine.purchasePrice;
      const unitLabel =
        ppp > 1 && !isStrip
          ? lang === 'bn'
            ? 'পিস'
            : 'pcs'
          : line.medicine.unit;
      const piecesDeducted = isStrip ? line.qty * ppp : line.qty;

      const lineSubtotal = Number((unitSellingPrice * line.qty).toFixed(2));
      const lineDiscountAmount = Number(
        ((lineSubtotal * line.discountPercent) / 100).toFixed(2),
      );
      const lineTotal = Number((lineSubtotal - lineDiscountAmount).toFixed(2));
      const lineCost = Number((unitPurchasePrice * line.qty).toFixed(2));
      const lineProfit = Number((lineTotal - lineCost).toFixed(2));

      return {
        medicineId: line.medicine.id,
        medicineName: line.medicine.name,
        batchNumber: line.medicine.batchNumber,
        unit: unitLabel,
        qty: line.qty,
        sellUnit: line.sellUnit,
        piecesPerPack: ppp,
        piecesDeducted,
        purchasePrice: Number(unitPurchasePrice.toFixed(2)),
        sellingPrice: Number(unitSellingPrice.toFixed(2)),
        discountPercent: line.discountPercent,
        lineSubtotal,
        lineDiscountAmount,
        lineTotal,
        lineCost,
        lineProfit,
      };
    });

    const subtotal = computedItems.reduce((acc, i) => acc + i.lineSubtotal, 0);
    const itemDiscountSum = computedItems.reduce(
      (acc, i) => acc + i.lineDiscountAmount,
      0,
    );
    const afterItemDiscount = subtotal - itemDiscountSum;
    const extraDiscountAmt = (afterItemDiscount * extraDiscountPercent) / 100;
    const totalDiscountAmount = itemDiscountSum + extraDiscountAmt;
    const taxableBase = afterItemDiscount - extraDiscountAmt;
    const vatAmount = (taxableBase * vatPercent) / 100;
    const totalAmount = Math.max(0, Number((taxableBase + vatAmount).toFixed(2)));
    const totalCost = computedItems.reduce((acc, i) => acc + i.lineCost, 0);
    const netProfit = Number((taxableBase - totalCost).toFixed(2));

    const paidAmount =
      paymentMethod === 'due'
        ? Math.max(0, Math.min(totalAmount, Number(customPaid) || 0))
        : totalAmount;
    const dueAmount = Math.max(0, Number((totalAmount - paidAmount).toFixed(2)));

    return {
      computedItems,
      subtotal,
      totalDiscountAmount,
      vatAmount,
      totalAmount,
      paidAmount,
      dueAmount,
      totalCost,
      netProfit,
    };
  }, [cart, customPaid, extraDiscountPercent, paymentMethod, vatPercent]);

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0 || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const cust = customers.find((c) => c.id === selectedCustomerId) || null;
      const createdSale = await onSubmitSale({
        customerId: cust ? cust.id : null,
        customerName: cust ? cust.name : t(lang, 'walkInCustomer'),
        customerPhone: cust ? cust.phone : '',
        items: billSummary.computedItems,
        subtotal: billSummary.subtotal,
        extraDiscountPercent,
        totalDiscountAmount: billSummary.totalDiscountAmount,
        vatPercent,
        vatAmount: billSummary.vatAmount,
        totalAmount: billSummary.totalAmount,
        paidAmount: billSummary.paidAmount,
        dueAmount: billSummary.dueAmount,
        totalCost: billSummary.totalCost,
        netProfit: billSummary.netProfit,
        paymentMethod,
        notes: '',
      });
      setCart([]);
      setExtraDiscountPercent(0);
      setCustomPaid('');
      setPaymentMethod('cash');
      onOpenInvoice(createdSale);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuickCustomerSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickCustName.trim()) return;
    const created = await onQuickAddCustomer({
      name: quickCustName.trim(),
      phone: quickCustPhone.trim(),
      address: '',
      dueBalance: 0,
      notes: '',
    });
    setSelectedCustomerId(created.id);
    setQuickCustName('');
    setQuickCustPhone('');
    setShowQuickCust(false);
  };

  return (
    <div className="space-y-6">
      {/* 4-Column KPI Strip */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {t(lang, 'todaySales')}
          </div>
          <div className="font-mono-num mt-2 text-2xl font-bold text-slate-900 dark:text-white">
            {formatMoney(kpiStats.todayRevenue, currency, lang)}
          </div>
          <div className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <span className="font-mono-num font-medium text-emerald-600 dark:text-emerald-400">
              {formatNumber(kpiStats.todayCount, lang)}
            </span>
            <span>{t(lang, 'invoicesToday')}</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {t(lang, 'todayProfit')}
          </div>
          <div className="font-mono-num mt-2 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            {formatMoney(kpiStats.todayProfit, currency, lang)}
          </div>
          <div className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <span>{t(lang, 'profitMargin')}:</span>
            <span className="font-mono-num font-medium text-slate-700 dark:text-slate-300">
              {kpiStats.profitMarginPct.toFixed(1)}%
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {t(lang, 'todayDiscount')}
          </div>
          <div className="font-mono-num mt-2 text-2xl font-bold text-slate-900 dark:text-white">
            {formatMoney(kpiStats.todayDiscount, currency, lang)}
          </div>
          <div className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <span>{t(lang, 'avgDiscountRate')}:</span>
            <span className="font-mono-num font-medium text-amber-600 dark:text-amber-400">
              {kpiStats.avgDiscountPct.toFixed(1)}%
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onNavigateTab('alerts')}
          className="rounded-xl border border-slate-200 bg-white p-5 text-left transition hover:border-emerald-500/50 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-emerald-500/40"
        >
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>{t(lang, 'alertCountLabel')}</span>
            {kpiStats.alertCount > 0 && (
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            )}
          </div>
          <div className="font-mono-num mt-2 text-2xl font-bold text-amber-600 dark:text-amber-400">
            {formatNumber(kpiStats.alertCount, lang)}
          </div>
          <div className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
            {t(lang, 'totalInventoryValue')}:{' '}
            <span className="font-mono-num font-medium text-slate-700 dark:text-slate-300">
              {formatMoney(kpiStats.totalStockValue, currency, lang)}
            </span>
          </div>
        </button>
      </section>

      {/* Main Split: Medicine Search & Catalog (Left) + Quick POS Billing (Right) */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        {/* Left: Medicine & Batch Search */}
        <section className="lg:col-span-7 rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-200 p-4 sm:p-5 dark:border-slate-800">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t(lang, 'searchPlaceholder')}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2.5 pr-4 pl-10 text-sm text-slate-900 placeholder-slate-400 transition focus:border-emerald-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-emerald-500"
                />
              </div>

              <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
                {(
                  [
                    ['all', t(lang, 'filterAll')],
                    ['in_stock', t(lang, 'filterInStock')],
                    ['alerts', t(lang, 'alertCountLabel')],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setCatalogFilter(key)}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition whitespace-nowrap shrink-0 ${
                      catalogFilter === key
                        ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800/80 max-h-[600px] overflow-y-auto">
            {filteredMedicines.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  {lang === 'bn'
                    ? 'সার্চের সাথে কোনো ওষুধ বা ব্যাচ পাওয়া যায়নি'
                    : 'No matching medicine or batch found'}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setCatalogFilter('all');
                  }}
                  className="mt-3 text-xs font-semibold text-emerald-600 hover:underline dark:text-emerald-400"
                >
                  {lang === 'bn' ? 'ফিল্টার রিসেট করুন' : 'Reset filter'}
                </button>
              </div>
            ) : (
              filteredMedicines.map((med) => {
                const flags = getMedicineAlertFlags(med, settings.expiryAlertDays);
                const stockInfo = getMedicineStockBreakdown(med, lang);
                const ppp = stockInfo.piecesPerPack;
                const unitProfit = med.sellingPrice - med.purchasePrice;
                const disabled = flags.isExpired || flags.isOutOfStock;
                const pieceLine = cart.find((c) => c.key === `${med.id}:piece`);
                const stripLine = cart.find((c) => c.key === `${med.id}:strip`);
                const usedPieces = getCartPiecesForMed(cart, med.id);
                const remainingPieces = Math.max(0, med.stockQty - usedPieces);
                const canAddPiece = !disabled && remainingPieces >= 1;
                const canAddStrip = !disabled && remainingPieces >= ppp;

                return (
                  <div
                    key={med.id}
                    className="flex flex-col justify-between gap-3 px-4 py-3.5 transition hover:bg-slate-50/80 sm:flex-row sm:items-center sm:px-5 dark:hover:bg-slate-800/40"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {med.name}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                        <span>{med.genericName}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono-num">
                          {t(lang, 'batchNumber')}: {med.batchNumber}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span
                          className={
                            flags.isExpired
                              ? 'font-semibold text-red-600 dark:text-red-400'
                              : flags.isExpiringSoon
                                ? 'font-semibold text-amber-600 dark:text-amber-400'
                                : ''
                          }
                        >
                          {t(lang, 'expiryDate')}: {med.expiryDate}
                          {flags.isExpired
                            ? ` (${lang === 'bn' ? 'মেয়াদোত্তীর্ণ' : 'Expired'})`
                            : flags.isExpiringSoon
                              ? ` (${flags.daysUntilExpiry}d)`
                              : ''}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3 sm:justify-end">
                      <div className="text-left sm:text-right">
                        {ppp > 1 ? (
                          <>
                            <div className="font-mono-num text-sm font-bold text-slate-900 dark:text-white">
                              {formatMoney(stockInfo.pieceSellingPrice, currency, lang)}
                              <span className="text-[11px] font-normal text-slate-400">
                                /{t(lang, 'pieceLabelShort')}
                              </span>
                            </div>
                            <div className="font-mono-num text-[11px] text-slate-500 dark:text-slate-400">
                              {formatMoney(med.sellingPrice, currency, lang)}/{stockInfo.unitShort} ·{' '}
                              <span className="text-emerald-600 dark:text-emerald-400">
                                +{formatMoney(unitProfit, currency, lang)}
                              </span>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="font-mono-num text-sm font-bold text-slate-900 dark:text-white">
                              {formatMoney(med.sellingPrice, currency, lang)}
                              <span className="text-[11px] font-normal text-slate-400">
                                /{stockInfo.unitShort}
                              </span>
                            </div>
                            <div className="font-mono-num text-[11px] text-slate-500 dark:text-slate-400">
                              {lang === 'bn' ? 'কিনা' : 'Buy'}:{' '}
                              {formatMoney(med.purchasePrice, currency, lang)} ·{' '}
                              <span className="text-emerald-600 dark:text-emerald-400">
                                +{formatMoney(unitProfit, currency, lang)}
                              </span>
                            </div>
                          </>
                        )}
                      </div>

                      <div className="text-right">
                        <div
                          className={`font-mono-num text-xs font-semibold ${
                            flags.isOutOfStock
                              ? 'text-red-600 dark:text-red-400'
                              : flags.isLowStock
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {ppp > 1 ? stockInfo.secondaryLabel : stockInfo.primaryLabel}
                        </div>
                        <div className="font-mono-num text-[11px] text-slate-400">
                          {ppp > 1
                            ? stockInfo.primaryLabel
                            : flags.isLowStock
                              ? lang === 'bn'
                                ? 'কম স্টক'
                                : 'Low'
                              : lang === 'bn'
                                ? 'মজুদ'
                                : 'Stock'}
                        </div>
                      </div>

                      {ppp > 1 ? (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            disabled={!canAddPiece}
                            onClick={() => addToCart(med, 'piece')}
                            className={`inline-flex min-h-[38px] items-center justify-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition whitespace-nowrap ${
                              !canAddPiece
                                ? 'cursor-not-allowed bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-600'
                                : pieceLine
                                  ? 'border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
                                  : 'bg-emerald-600 text-white hover:bg-emerald-700'
                            }`}
                          >
                            <Plus className="h-3.5 w-3.5" />
                            <span>
                              {pieceLine
                                ? `${formatNumber(pieceLine.qty, lang)} ${t(lang, 'addByPiece')}`
                                : t(lang, 'addByPiece')}
                            </span>
                          </button>

                          <button
                            type="button"
                            disabled={!canAddStrip}
                            onClick={() => addToCart(med, 'strip')}
                            className={`inline-flex min-h-[38px] items-center justify-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition whitespace-nowrap ${
                              !canAddStrip
                                ? 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-600'
                                : stripLine
                                  ? 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
                            }`}
                          >
                            <Plus className="h-3.5 w-3.5" />
                            <span>
                              {stripLine
                                ? `${formatNumber(stripLine.qty, lang)} ${t(lang, 'addByStrip')}`
                                : t(lang, 'addByStrip')}
                            </span>
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={!canAddPiece}
                          onClick={() => addToCart(med, 'piece')}
                          className={`inline-flex min-h-[40px] min-w-[40px] items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition whitespace-nowrap shrink-0 ${
                            !canAddPiece
                              ? 'cursor-not-allowed bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-600'
                              : pieceLine
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:border-emerald-800 dark:text-emerald-300'
                                : 'bg-emerald-600 text-white hover:bg-emerald-700'
                          }`}
                        >
                          <Plus className="h-4 w-4" />
                          <span>
                            {pieceLine
                              ? `${formatNumber(pieceLine.qty, lang)}`
                              : lang === 'bn'
                                ? 'যোগ'
                                : 'Add'}
                          </span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* Right: Quick POS Billing & Invoice Builder */}
        <section className="lg:col-span-5 rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                {t(lang, 'quickPosTitle')}
              </h2>
            </div>
            {cart.length > 0 && (
              <button
                type="button"
                onClick={() => setCart([])}
                className="text-xs font-medium text-red-600 hover:underline dark:text-red-400"
              >
                {t(lang, 'clearCart')}
              </button>
            )}
          </div>

          <form onSubmit={handleCheckout} className="p-5 space-y-4">
            {/* Customer Selector */}
            <div>
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  {t(lang, 'selectCustomer')}
                </label>
                <button
                  type="button"
                  onClick={() => setShowQuickCust((v) => !v)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:underline dark:text-emerald-400"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  <span>{t(lang, 'addNewCustomerQuick')}</span>
                </button>
              </div>
              <select
                value={selectedCustomerId}
                onChange={(e) => setSelectedCustomerId(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 focus:border-emerald-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                <option value="">{t(lang, 'walkInCustomer')}</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.phone ? `(${c.phone})` : ''}
                  </option>
                ))}
              </select>

              {showQuickCust && (
                <div className="mt-2 flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
                  <input
                    type="text"
                    value={quickCustName}
                    onChange={(e) => setQuickCustName(e.target.value)}
                    placeholder={t(lang, 'customerName')}
                    className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
                  />
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={quickCustPhone}
                      onChange={(e) => setQuickCustPhone(e.target.value)}
                      placeholder={t(lang, 'phone')}
                      className="flex-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
                    />
                    <button
                      type="button"
                      onClick={(e) => void handleQuickCustomerSave(e)}
                      className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                    >
                      {t(lang, 'save')}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Cart Items */}
            {cart.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center dark:border-slate-800">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  {t(lang, 'cartEmptyTitle')}
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {t(lang, 'cartEmptyDesc')}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800 max-h-[310px] overflow-y-auto">
                {cart.map((line, idx) => {
                  const itemCalc = billSummary.computedItems[idx];
                  const ppp = Math.max(1, line.medicine.piecesPerPack || 1);
                  const mult = line.sellUnit === 'strip' && ppp > 1 ? ppp : 1;
                  const otherPieces = getCartPiecesForMed(
                    cart,
                    line.medicine.id,
                    line.key,
                  );
                  const availPieces = Math.max(
                    0,
                    line.medicine.stockQty - otherPieces,
                  );
                  const maxQty = Math.floor(availPieces / mult);
                  const canSwitchToStrip = availPieces >= ppp;

                  return (
                    <div key={line.key} className="p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                            {line.medicine.name}
                          </div>
                          <div className="font-mono-num text-[11px] text-slate-500 dark:text-slate-400">
                            {line.medicine.batchNumber} ·{' '}
                            {formatMoney(itemCalc?.sellingPrice || 0, currency, lang)}/
                            {line.sellUnit === 'strip' && ppp > 1
                              ? line.medicine.unit.split(' ')[0]
                              : ppp > 1
                                ? t(lang, 'pieceLabelShort')
                                : line.medicine.unit.split(' ')[0]}
                            {line.sellUnit === 'strip' && ppp > 1
                              ? ` (${formatNumber(line.qty * ppp, lang)} ${t(lang, 'pieceLabelShort')})`
                              : ''}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {ppp > 1 && (
                            <div className="flex items-center rounded-md bg-slate-100 p-0.5 dark:bg-slate-800">
                              <button
                                type="button"
                                onClick={() => switchCartLineUnit(line.key, 'piece')}
                                className={`rounded px-2 py-0.5 text-[11px] font-semibold transition ${
                                  line.sellUnit === 'piece'
                                    ? 'bg-white text-emerald-700 shadow-xs dark:bg-slate-900 dark:text-emerald-400'
                                    : 'text-slate-500'
                                }`}
                              >
                                {t(lang, 'sellByPiece')}
                              </button>
                              <button
                                type="button"
                                disabled={!canSwitchToStrip}
                                onClick={() => switchCartLineUnit(line.key, 'strip')}
                                className={`rounded px-2 py-0.5 text-[11px] font-semibold transition ${
                                  line.sellUnit === 'strip'
                                    ? 'bg-white text-emerald-700 shadow-xs dark:bg-slate-900 dark:text-emerald-400'
                                    : !canSwitchToStrip
                                      ? 'cursor-not-allowed text-slate-300 dark:text-slate-600'
                                      : 'text-slate-500'
                                }`}
                              >
                                {t(lang, 'sellByStrip')}
                              </button>
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => updateCartQty(line.key, 0)}
                            className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-700">
                          <button
                            type="button"
                            onClick={() => updateCartQty(line.key, line.qty - 1)}
                            className="flex h-8 w-8 items-center justify-center text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <input
                            type="number"
                            min={1}
                            max={maxQty}
                            value={line.qty}
                            onChange={(e) =>
                              updateCartQty(line.key, Number(e.target.value))
                            }
                            className="font-mono-num w-11 bg-transparent text-center text-xs font-semibold focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => updateCartQty(line.key, line.qty + 1)}
                            className="flex h-8 w-8 items-center justify-center text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] text-slate-500">
                            {t(lang, 'discountPct')}:
                          </span>
                          <input
                            type="number"
                            min={0}
                            max={90}
                            step={0.5}
                            value={line.discountPercent}
                            onChange={(e) =>
                              updateCartDiscount(line.key, Number(e.target.value))
                            }
                            className="font-mono-num w-14 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-right text-xs dark:border-slate-700 dark:bg-slate-950"
                          />
                        </div>

                        <div className="text-right">
                          <div className="font-mono-num text-xs font-bold text-slate-900 dark:text-white">
                            {formatMoney(itemCalc?.lineTotal || 0, currency, lang)}
                          </div>
                          <div className="font-mono-num text-[11px] text-emerald-600 dark:text-emerald-400">
                            {t(lang, 'lineProfit')}:{' '}
                            {formatMoney(itemCalc?.lineProfit || 0, currency, lang)}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Extra Discount, VAT & Payment Method */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-500 dark:text-slate-400">
                  {t(lang, 'extraDiscount')}
                </label>
                <input
                  type="number"
                  min={0}
                  max={80}
                  step={0.5}
                  value={extraDiscountPercent}
                  onChange={(e) =>
                    setExtraDiscountPercent(
                      Math.max(0, Math.min(80, Number(e.target.value) || 0)),
                    )
                  }
                  className="font-mono-num mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 dark:text-slate-400">
                  {t(lang, 'vatPct')}
                </label>
                <input
                  type="number"
                  min={0}
                  max={30}
                  step={0.5}
                  value={vatPercent}
                  onChange={(e) =>
                    setVatPercent(
                      Math.max(0, Math.min(30, Number(e.target.value) || 0)),
                    )
                  }
                  className="font-mono-num mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-slate-500 dark:text-slate-400">
                {t(lang, 'paymentMethod')}
              </label>
              <div className="mt-1.5 grid grid-cols-3 gap-1.5 sm:grid-cols-5">
                {(
                  [
                    ['cash', t(lang, 'payCash')],
                    ['bkash', t(lang, 'payBkash')],
                    ['nagad', t(lang, 'payNagad')],
                    ['card', t(lang, 'payCard')],
                    ['due', t(lang, 'payDue')],
                  ] as const
                ).map(([method, label]) => (
                  <button
                    key={method}
                    type="button"
                    onClick={() => setPaymentMethod(method)}
                    className={`rounded-lg border px-2 py-2 text-xs font-medium transition whitespace-nowrap ${
                      paymentMethod === method
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-700 dark:border-emerald-500 dark:bg-emerald-950/50 dark:text-emerald-300'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {paymentMethod === 'due' && (
              <div>
                <label className="text-xs text-slate-500 dark:text-slate-400">
                  {t(lang, 'paidAmount')}
                </label>
                <input
                  type="number"
                  min={0}
                  max={billSummary.totalAmount}
                  value={customPaid}
                  onChange={(e) => setCustomPaid(e.target.value)}
                  placeholder="0"
                  className="font-mono-num mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
            )}

            {/* Financial Totals */}
            <div className="space-y-1.5 border-t border-slate-200 pt-3.5 text-sm dark:border-slate-800">
              <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>{t(lang, 'subtotal')}</span>
                <span className="font-mono-num">
                  {formatMoney(billSummary.subtotal, currency, lang)}
                </span>
              </div>
              <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>{t(lang, 'totalDiscount')}</span>
                <span className="font-mono-num text-amber-600 dark:text-amber-400">
                  -{formatMoney(billSummary.totalDiscountAmount, currency, lang)}
                </span>
              </div>
              <div className="flex justify-between text-xs text-emerald-700 dark:text-emerald-400">
                <span>{t(lang, 'estimatedProfit')}</span>
                <span className="font-mono-num font-semibold">
                  {formatMoney(billSummary.netProfit, currency, lang)}
                </span>
              </div>
              <div className="flex justify-between pt-1.5 text-base font-bold text-slate-900 dark:text-white">
                <span>{t(lang, 'netPayable')}</span>
                <span className="font-mono-num text-emerald-600 dark:text-emerald-400">
                  {formatMoney(billSummary.totalAmount, currency, lang)}
                </span>
              </div>
            </div>

            <button
              type="submit"
              disabled={cart.length === 0 || isSubmitting}
              className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>{t(lang, 'generateInvoiceBtn')}</span>
            </button>
          </form>
        </section>
      </div>
    </div>
  );
};
