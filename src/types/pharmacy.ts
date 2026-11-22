export type Language = 'bn' | 'en';
export type ThemeMode = 'light' | 'dark';
export type TableDensity = 'compact' | 'comfortable';
export type PaymentMethod = 'cash' | 'bkash' | 'nagad' | 'card' | 'due';

export interface Medicine {
  id: string;
  name: string;
  genericName: string;
  category: string;
  manufacturer: string;
  batchNumber: string;
  expiryDate: string; // YYYY-MM-DD
  purchasePrice: number;
  sellingPrice: number;
  piecesPerPack: number;
  stockQty: number;
  minStockAlert: number;
  unit: string;
  updatedAt: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  address: string;
  dueBalance: number;
  totalSpent: number;
  visitCount: number;
  notes: string;
  encryptedNotes?: string;
  lastVisit: string;
  updatedAt: string;
}

export interface SaleItem {
  medicineId: string;
  medicineName: string;
  batchNumber: string;
  unit: string;
  qty: number;
  sellUnit?: 'strip' | 'piece';
  piecesPerPack?: number;
  piecesDeducted?: number;
  purchasePrice: number;
  sellingPrice: number;
  discountPercent: number;
  lineSubtotal: number;
  lineDiscountAmount: number;
  lineTotal: number;
  lineCost: number;
  lineProfit: number;
}

export interface Sale {
  id: string;
  invoiceNumber: string;
  customerId: string | null;
  customerName: string;
  customerPhone: string;
  items: SaleItem[];
  subtotal: number;
  extraDiscountPercent: number;
  totalDiscountAmount: number;
  vatPercent: number;
  vatAmount: number;
  totalAmount: number;
  paidAmount: number;
  dueAmount: number;
  totalCost: number;
  netProfit: number;
  paymentMethod: PaymentMethod;
  notes: string;
  createdAt: string;
}

export interface PharmacySettings {
  pharmacyName: string;
  pharmacyNameEn: string;
  tagline: string;
  licenseNumber: string;
  phone: string;
  address: string;
  currencySymbol: string;
  defaultVatPercent: number;
  expiryAlertDays: number;
  language: Language;
  theme: ThemeMode;
  tableDensity: TableDensity;
  encryptionEnabled: boolean;
  updatedAt: string;
}

export interface PharmacySnapshot {
  medicines: Medicine[];
  customers: Customer[];
  sales: Sale[];
  settings: PharmacySettings;
}

export interface SyncMutation {
  opId: string;
  entity: 'medicine' | 'customer' | 'sale' | 'settings';
  action: 'upsert' | 'delete' | 'create_sale' | 'pay_due';
  payload: Record<string, unknown>;
  timestamp: string;
}

export type ActiveTab =
  | 'workspace'
  | 'inventory'
  | 'customers'
  | 'reports'
  | 'alerts'
  | 'settings';
