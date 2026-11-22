import type {Medicine} from '../types/pharmacy';

export type MedicineStatus = 'expired' | 'expiring_soon' | 'low_stock' | 'healthy';

export function getDaysUntilExpiry(expiryDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${expiryDate}T00:00:00`);
  if (Number.isNaN(target.getTime())) return 999;
  const diffMs = target.getTime() - today.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

export function getMedicineAlertFlags(
  med: Medicine,
  expiryAlertDays: number,
): {
  daysUntilExpiry: number;
  isExpired: boolean;
  isExpiringSoon: boolean;
  isLowStock: boolean;
  isOutOfStock: boolean;
  primaryStatus: MedicineStatus;
} {
  const daysUntilExpiry = getDaysUntilExpiry(med.expiryDate);
  const isExpired = daysUntilExpiry < 0;
  const isExpiringSoon = !isExpired && daysUntilExpiry <= expiryAlertDays;
  const isOutOfStock = med.stockQty <= 0;
  const isLowStock = med.stockQty <= med.minStockAlert;

  let primaryStatus: MedicineStatus = 'healthy';
  if (isExpired) primaryStatus = 'expired';
  else if (isLowStock) primaryStatus = 'low_stock';
  else if (isExpiringSoon) primaryStatus = 'expiring_soon';

  return {
    daysUntilExpiry,
    isExpired,
    isExpiringSoon,
    isLowStock,
    isOutOfStock,
    primaryStatus,
  };
}
