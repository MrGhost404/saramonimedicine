import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import type {
  Customer,
  Medicine,
  PharmacySettings,
  PharmacySnapshot,
  Sale,
  SaleItem,
} from '../src/types/pharmacy.ts';

const dataDir = path.resolve(process.env.DATA_DIR || './data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, {recursive: true});
}

const dbPath = path.join(dataDir, 'arogyapos.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS medicines (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      generic_name TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT '',
      manufacturer TEXT NOT NULL DEFAULT '',
      batch_number TEXT NOT NULL,
      expiry_date TEXT NOT NULL,
      purchase_price REAL NOT NULL,
      selling_price REAL NOT NULL,
      pieces_per_pack INTEGER NOT NULL DEFAULT 1,
      stock_qty INTEGER NOT NULL,
      min_stock_alert INTEGER NOT NULL DEFAULT 15,
      stock_in_pieces INTEGER NOT NULL DEFAULT 1,
      unit TEXT NOT NULL DEFAULT 'পিস',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT '',
      due_balance REAL NOT NULL DEFAULT 0,
      total_spent REAL NOT NULL DEFAULT 0,
      visit_count INTEGER NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT '',
      encrypted_notes TEXT DEFAULT '',
      last_visit TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sales (
      id TEXT PRIMARY KEY,
      invoice_number TEXT NOT NULL UNIQUE,
      customer_id TEXT,
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL DEFAULT '',
      items_json TEXT NOT NULL,
      subtotal REAL NOT NULL,
      extra_discount_percent REAL NOT NULL DEFAULT 0,
      total_discount_amount REAL NOT NULL DEFAULT 0,
      vat_percent REAL NOT NULL DEFAULT 0,
      vat_amount REAL NOT NULL DEFAULT 0,
      total_amount REAL NOT NULL,
      paid_amount REAL NOT NULL,
      due_amount REAL NOT NULL DEFAULT 0,
      total_cost REAL NOT NULL,
      net_profit REAL NOT NULL,
      payment_method TEXT NOT NULL DEFAULT 'cash',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      pharmacy_name TEXT NOT NULL,
      pharmacy_name_en TEXT NOT NULL,
      tagline TEXT NOT NULL,
      license_number TEXT NOT NULL,
      phone TEXT NOT NULL,
      address TEXT NOT NULL,
      currency_symbol TEXT NOT NULL,
      default_vat_percent REAL NOT NULL,
      expiry_alert_days INTEGER NOT NULL,
      language TEXT NOT NULL,
      theme TEXT NOT NULL,
      table_density TEXT NOT NULL,
      encryption_enabled INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_medicines_batch ON medicines(batch_number);
    CREATE INDEX IF NOT EXISTS idx_medicines_expiry ON medicines(expiry_date);
    CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at);
  `);

  // Safe migration for existing databases lacking pieces_per_pack
  const medCols = db.prepare('PRAGMA table_info(medicines)').all() as Array<{
    name: string;
  }>;
  if (!medCols.some((c) => c.name === 'pieces_per_pack')) {
    db.exec(
      'ALTER TABLE medicines ADD COLUMN pieces_per_pack INTEGER NOT NULL DEFAULT 1',
    );
    db.exec(`
      UPDATE medicines
      SET pieces_per_pack = CASE
        WHEN unit LIKE '%১০%' OR unit LIKE '%10%' THEN 10
        WHEN unit LIKE '%৬%' OR unit LIKE '%6%' THEN 6
        ELSE 1
      END
    `);
  }

  // Safe one-time migration converting strip-based stock_qty/min_stock_alert to pieces
  const updatedMedCols = db.prepare('PRAGMA table_info(medicines)').all() as Array<{
    name: string;
  }>;
  if (!updatedMedCols.some((c) => c.name === 'stock_in_pieces')) {
    db.exec(
      'ALTER TABLE medicines ADD COLUMN stock_in_pieces INTEGER NOT NULL DEFAULT 1',
    );
    db.exec(`
      UPDATE medicines
      SET stock_qty = stock_qty * MAX(1, pieces_per_pack),
          min_stock_alert = min_stock_alert * MAX(1, pieces_per_pack)
    `);
  }

  seedInitialDataIfEmpty();
}

function isoDateDaysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function isoDateTimeDaysAgo(days: number, hour = 11): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, 25, 0, 0);
  return d.toISOString();
}

function seedInitialDataIfEmpty(): void {
  const now = new Date().toISOString();

  const existingSettings = db
    .prepare(
      'SELECT id, pharmacy_name, pharmacy_name_en, phone, license_number FROM settings WHERE id = 1',
    )
    .get() as
    | {
        id: number;
        pharmacy_name: string;
        pharmacy_name_en: string;
        phone: string;
        license_number: string;
      }
    | undefined;

  if (!existingSettings) {
    db.prepare(
      `INSERT INTO settings (
        id, pharmacy_name, pharmacy_name_en, tagline, license_number,
        phone, address, currency_symbol, default_vat_percent,
        expiry_alert_days, language, theme, table_density,
        encryption_enabled, updated_at
      ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'সারা মনি মেডিসিন কর্নার',
      'Sara Moni Medicine Corner',
      'সঠিক ওষুধ, ন্যায্য মূল্য ও ডিজিটাল সেবা',
      '',
      '01851768368, 01745858682',
      'বড়রিয়া বাজার, ঘারিন্দা, টাঙ্গাইল সদর',
      '৳',
      0,
      60,
      'bn',
      'light',
      'comfortable',
      0,
      now,
    );
  } else {
    if (
      existingSettings.pharmacy_name.includes('আরোগ্য') ||
      existingSettings.pharmacy_name.trim() === 'সার মনি মেডিসিন কর্নার' ||
      existingSettings.pharmacy_name_en.includes('Arogya')
    ) {
      db.prepare(
        `UPDATE settings SET pharmacy_name = ?, pharmacy_name_en = ?, address = ?, updated_at = ? WHERE id = 1`,
      ).run(
        'সারা মনি মেডিসিন কর্নার',
        'Sara Moni Medicine Corner',
        'বড়রিয়া বাজার, ঘারিন্দা, টাঙ্গাইল সদর',
        now,
      );
    }
    if (existingSettings.phone === '+880 1711-004820') {
      db.prepare(
        `UPDATE settings SET phone = ?, updated_at = ? WHERE id = 1`,
      ).run('01851768368, 01745858682', now);
    }
    if (existingSettings.license_number === 'DGDA-DHK-24819') {
      db.prepare(
        `UPDATE settings SET license_number = '', updated_at = ? WHERE id = 1`,
      ).run(now);
    }
  }

  const medCount = (
    db.prepare('SELECT COUNT(*) as cnt FROM medicines').get() as {cnt: number}
  ).cnt;

  if (medCount === 0) {
    const seedMedicines: Medicine[] = [
      {
        id: 'med-101',
        name: 'নাপা এক্সটেন্ড ৬৬৫ মি.গ্রা.',
        genericName: 'Paracetamol 665mg',
        category: 'ব্যথানাশক ও জ্বর',
        manufacturer: 'Beximco Pharma',
        batchNumber: 'NPX-2604A',
        expiryDate: isoDateDaysFromNow(320),
        purchasePrice: 16.5,
        sellingPrice: 20.0,
        piecesPerPack: 10,
        stockQty: 1450,
        minStockAlert: 250,
        unit: 'পাতা (১০টি)',
        updatedAt: now,
      },
      {
        id: 'med-102',
        name: 'সেকলো ২০ মি.গ্রা. ক্যাপসুল',
        genericName: 'Omeprazole 20mg',
        category: 'গ্যাস্ট্রিক ও আলসার',
        manufacturer: 'Square Pharma',
        batchNumber: 'SEC-2611B',
        expiryDate: isoDateDaysFromNow(240),
        purchasePrice: 48.0,
        sellingPrice: 60.0,
        piecesPerPack: 10,
        stockQty: 880,
        minStockAlert: 200,
        unit: 'পাতা (১০টি)',
        updatedAt: now,
      },
      {
        id: 'med-103',
        name: 'সার্জেল ২০ মি.গ্রা. ক্যাপসুল',
        genericName: 'Esomeprazole 20mg',
        category: 'গ্যাস্ট্রিক ও আলসার',
        manufacturer: 'Healthcare Pharma',
        batchNumber: 'SRG-2509C',
        expiryDate: isoDateDaysFromNow(24), // Expiring soon!
        purchasePrice: 56.0,
        sellingPrice: 70.0,
        piecesPerPack: 10,
        stockQty: 340,
        minStockAlert: 150,
        unit: 'পাতা (১০টি)',
        updatedAt: now,
      },
      {
        id: 'med-104',
        name: 'এজিথ ৫০০ মি.গ্রা. ট্যাবলেট',
        genericName: 'Azithromycin 500mg',
        category: 'অ্যান্টিবায়োটিক',
        manufacturer: 'Square Pharma',
        batchNumber: 'AZT-2602K',
        expiryDate: isoDateDaysFromNow(185),
        purchasePrice: 148.0,
        sellingPrice: 180.0,
        piecesPerPack: 6,
        stockQty: 54, // Low stock! (9 strips)
        minStockAlert: 90,
        unit: 'পাতা (৬টি)',
        updatedAt: now,
      },
      {
        id: 'med-105',
        name: 'মোনাস ১০ মি.গ্রা. ট্যাবলেট',
        genericName: 'Montelukast 10mg',
        category: 'শ্বাসকষ্ট ও অ্যালার্জি',
        manufacturer: 'ACME Lab',
        batchNumber: 'MNS-2608M',
        expiryDate: isoDateDaysFromNow(290),
        purchasePrice: 140.0,
        sellingPrice: 175.0,
        piecesPerPack: 10,
        stockQty: 420,
        minStockAlert: 120,
        unit: 'পাতা (১০টি)',
        updatedAt: now,
      },
      {
        id: 'med-106',
        name: 'ফেক্সো ১২০ মি.গ্রা. ট্যাবলেট',
        genericName: 'Fexofenadine 120mg',
        category: 'অ্যান্টি-হিস্টামিন',
        manufacturer: 'Square Pharma',
        batchNumber: 'FXO-2512R',
        expiryDate: isoDateDaysFromNow(38), // Expiring soon!
        purchasePrice: 68.0,
        sellingPrice: 85.0,
        piecesPerPack: 10,
        stockQty: 260,
        minStockAlert: 150,
        unit: 'পাতা (১০টি)',
        updatedAt: now,
      },
      {
        id: 'med-107',
        name: 'ম্যাক্সপ্রো ২০ মি.গ্রা. MUPS',
        genericName: 'Esomeprazole 20mg',
        category: 'গ্যাস্ট্রিক ও আলসার',
        manufacturer: 'Renata PLC',
        batchNumber: 'MXP-2607P',
        expiryDate: isoDateDaysFromNow(410),
        purchasePrice: 57.5,
        sellingPrice: 70.0,
        piecesPerPack: 10,
        stockQty: 1120,
        minStockAlert: 200,
        unit: 'পাতা (১০টি)',
        updatedAt: now,
      },
      {
        id: 'med-108',
        name: 'গ্লুকোফেজ ৫০০ মি.গ্রা.',
        genericName: 'Metformin HCl 500mg',
        category: 'ডায়াবেটিস',
        manufacturer: 'Sanofi',
        batchNumber: 'GLP-2605D',
        expiryDate: isoDateDaysFromNow(210),
        purchasePrice: 36.0,
        sellingPrice: 45.0,
        piecesPerPack: 10,
        stockQty: 70, // Low stock! (7 strips)
        minStockAlert: 200,
        unit: 'পাতা (১০টি)',
        updatedAt: now,
      },
      {
        id: 'med-109',
        name: 'সিভিট ২৫০ মি.গ্রা. চিউয়েবল',
        genericName: 'Vitamin C 250mg',
        category: 'ভিটামিন ও সাপ্লিমেন্ট',
        manufacturer: 'Square Pharma',
        batchNumber: 'CVT-2609V',
        expiryDate: isoDateDaysFromNow(365),
        purchasePrice: 15.0,
        sellingPrice: 19.0,
        piecesPerPack: 10,
        stockQty: 1900,
        minStockAlert: 300,
        unit: 'পাতা (১০টি)',
        updatedAt: now,
      },
      {
        id: 'med-110',
        name: 'এন্টাসিড প্লাস সিরাপ ২০০ মি.লি.',
        genericName: 'Aluminium + Magnesium + Simethicone',
        category: 'গ্যাস্ট্রিক ও আলসার',
        manufacturer: 'Beximco Pharma',
        batchNumber: 'ANT-2410X',
        expiryDate: isoDateDaysFromNow(-8), // Expired!
        purchasePrice: 76.0,
        sellingPrice: 95.0,
        piecesPerPack: 1,
        stockQty: 6,
        minStockAlert: 10,
        unit: 'বোতল',
        updatedAt: now,
      },
      {
        id: 'med-111',
        name: 'স্যাভলন অ্যান্টিসেপটিক লিকুইড',
        genericName: 'Chlorhexidine + Cetrimide',
        category: 'প্রাথমিক চিকিৎসা',
        manufacturer: 'ACI Limited',
        batchNumber: 'SAV-2603S',
        expiryDate: isoDateDaysFromNow(450),
        purchasePrice: 64.0,
        sellingPrice: 80.0,
        piecesPerPack: 1,
        stockQty: 52,
        minStockAlert: 10,
        unit: 'বোতল (১১২ মি.লি.)',
        updatedAt: now,
      },
      {
        id: 'med-112',
        name: 'টাফনিল ২০০ মি.গ্রা. ট্যাবলেট',
        genericName: 'Tolfenamic Acid 200mg',
        category: 'মাইগ্রেন ও ব্যথা',
        manufacturer: 'Eskayef Pharma',
        batchNumber: 'TUF-2606E',
        expiryDate: isoDateDaysFromNow(275),
        purchasePrice: 82.0,
        sellingPrice: 100.0,
        piecesPerPack: 10,
        stockQty: 600,
        minStockAlert: 150,
        unit: 'পাতা (১০টি)',
        updatedAt: now,
      },
    ];

    const insertMed = db.prepare(`
      INSERT INTO medicines (
        id, name, generic_name, category, manufacturer, batch_number,
        expiry_date, purchase_price, selling_price, pieces_per_pack,
        stock_qty, min_stock_alert, unit, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertManyMeds = db.transaction((items: Medicine[]) => {
      for (const m of items) {
        insertMed.run(
          m.id,
          m.name,
          m.genericName,
          m.category,
          m.manufacturer,
          m.batchNumber,
          m.expiryDate,
          m.purchasePrice,
          m.sellingPrice,
          m.piecesPerPack,
          m.stockQty,
          m.minStockAlert,
          m.unit,
          m.updatedAt,
        );
      }
    });
    insertManyMeds(seedMedicines);
  }

  const custCount = (
    db.prepare('SELECT COUNT(*) as cnt FROM customers').get() as {cnt: number}
  ).cnt;

  if (custCount === 0) {
    const seedCustomers: Customer[] = [
      {
        id: 'cust-1',
        name: 'মোঃ রফিকুল ইসলাম',
        phone: '01712-458910',
        address: 'কলাবাগান, ঢাকা',
        dueBalance: 240,
        totalSpent: 4820,
        visitCount: 9,
        notes: 'ডায়াবেটিসের নিয়মিত ওষুধ (Metformin 500mg) নেন।',
        encryptedNotes: '',
        lastVisit: isoDateTimeDaysAgo(0, 10),
        updatedAt: now,
      },
      {
        id: 'cust-2',
        name: 'তাসনিম আক্তার',
        phone: '01819-332104',
        address: 'ধানমন্ডি রোড ৭/এ',
        dueBalance: 0,
        totalSpent: 3150,
        visitCount: 6,
        notes: 'পেনিসিলিন অ্যালার্জি আছে — অ্যান্টিবায়োটিকে সতর্কতা।',
        encryptedNotes: '',
        lastVisit: isoDateTimeDaysAgo(1, 16),
        updatedAt: now,
      },
      {
        id: 'cust-3',
        name: 'ডা. কামরুল হাসান',
        phone: '01911-784520',
        address: 'গ্রিন রোড ক্লিনিক',
        dueBalance: 550,
        totalSpent: 12600,
        visitCount: 14,
        notes: 'মাসিক চেম্বার সাপ্লাই, ২ সপ্তাহ পরপর বিল পরিশোধ।',
        encryptedNotes: '',
        lastVisit: isoDateTimeDaysAgo(2, 13),
        updatedAt: now,
      },
      {
        id: 'cust-4',
        name: 'নুসরাত জাহান মিম',
        phone: '01675-901234',
        address: 'সায়েন্স ল্যাবরেটরি মোড়',
        dueBalance: 0,
        totalSpent: 1940,
        visitCount: 4,
        notes: 'শিশু ও পরিবারের ভিটামিন সাপ্লিমেন্ট ক্রেতা।',
        encryptedNotes: '',
        lastVisit: isoDateTimeDaysAgo(3, 18),
        updatedAt: now,
      },
    ];

    const insertCust = db.prepare(`
      INSERT INTO customers (
        id, name, phone, address, due_balance, total_spent,
        visit_count, notes, encrypted_notes, last_visit, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertManyCust = db.transaction((items: Customer[]) => {
      for (const c of items) {
        insertCust.run(
          c.id,
          c.name,
          c.phone,
          c.address,
          c.dueBalance,
          c.totalSpent,
          c.visitCount,
          c.notes,
          c.encryptedNotes || '',
          c.lastVisit,
          c.updatedAt,
        );
      }
    });
    insertManyCust(seedCustomers);
  }

  const salesCount = (
    db.prepare('SELECT COUNT(*) as cnt FROM sales').get() as {cnt: number}
  ).cnt;

  if (salesCount === 0) {
    const seedSales: Sale[] = [
      {
        id: 'sale-901',
        invoiceNumber: 'INV-2026-0101',
        customerId: 'cust-1',
        customerName: 'মোঃ রফিকুল ইসলাম',
        customerPhone: '01712-458910',
        items: [
          {
            medicineId: 'med-108',
            medicineName: 'গ্লুকোফেজ ৫০০ মি.গ্রা.',
            batchNumber: 'GLP-2605D',
            unit: 'পাতা (১০টি)',
            qty: 4,
            purchasePrice: 36,
            sellingPrice: 45,
            discountPercent: 5,
            lineSubtotal: 180,
            lineDiscountAmount: 9,
            lineTotal: 171,
            lineCost: 144,
            lineProfit: 27,
          },
          {
            medicineId: 'med-101',
            medicineName: 'নাপা এক্সটেন্ড ৬৬৫ মি.গ্রা.',
            batchNumber: 'NPX-2604A',
            unit: 'পাতা (১০টি)',
            qty: 3,
            purchasePrice: 16.5,
            sellingPrice: 20,
            discountPercent: 0,
            lineSubtotal: 60,
            lineDiscountAmount: 0,
            lineTotal: 60,
            lineCost: 49.5,
            lineProfit: 10.5,
          },
        ],
        subtotal: 240,
        extraDiscountPercent: 0,
        totalDiscountAmount: 9,
        vatPercent: 0,
        vatAmount: 0,
        totalAmount: 231,
        paidAmount: 231,
        dueAmount: 0,
        totalCost: 193.5,
        netProfit: 37.5,
        paymentMethod: 'cash',
        notes: 'নিয়মিত প্রেসক্রিপশন ডেলিভারি',
        createdAt: isoDateTimeDaysAgo(0, 9),
      },
      {
        id: 'sale-902',
        invoiceNumber: 'INV-2026-0102',
        customerId: null,
        customerName: 'নগদ ক্রেতা (Walk-in)',
        customerPhone: '',
        items: [
          {
            medicineId: 'med-104',
            medicineName: 'এজিথ ৫০০ মি.গ্রা. ট্যাবলেট',
            batchNumber: 'AZT-2602K',
            unit: 'পাতা (৬টি)',
            qty: 2,
            purchasePrice: 148,
            sellingPrice: 180,
            discountPercent: 5,
            lineSubtotal: 360,
            lineDiscountAmount: 18,
            lineTotal: 342,
            lineCost: 296,
            lineProfit: 46,
          },
          {
            medicineId: 'med-107',
            medicineName: 'ম্যাক্সপ্রো ২০ মি.গ্রা. MUPS',
            batchNumber: 'MXP-2607P',
            unit: 'পাতা (১০টি)',
            qty: 3,
            purchasePrice: 57.5,
            sellingPrice: 70,
            discountPercent: 0,
            lineSubtotal: 210,
            lineDiscountAmount: 0,
            lineTotal: 210,
            lineCost: 172.5,
            lineProfit: 37.5,
          },
        ],
        subtotal: 570,
        extraDiscountPercent: 0,
        totalDiscountAmount: 18,
        vatPercent: 0,
        vatAmount: 0,
        totalAmount: 552,
        paidAmount: 552,
        dueAmount: 0,
        totalCost: 468.5,
        netProfit: 83.5,
        paymentMethod: 'bkash',
        notes: '',
        createdAt: isoDateTimeDaysAgo(0, 14),
      },
      {
        id: 'sale-903',
        invoiceNumber: 'INV-2026-0098',
        customerId: 'cust-2',
        customerName: 'তাসনিম আক্তার',
        customerPhone: '01819-332104',
        items: [
          {
            medicineId: 'med-105',
            medicineName: 'মোনাস ১০ মি.গ্রা. ট্যাবলেট',
            batchNumber: 'MNS-2608M',
            unit: 'পাতা (১০টি)',
            qty: 2,
            purchasePrice: 140,
            sellingPrice: 175,
            discountPercent: 4,
            lineSubtotal: 350,
            lineDiscountAmount: 14,
            lineTotal: 336,
            lineCost: 280,
            lineProfit: 56,
          },
          {
            medicineId: 'med-109',
            medicineName: 'সিভিট ২৫০ মি.গ্রা. চিউয়েবল',
            batchNumber: 'CVT-2609V',
            unit: 'পাতা (১০টি)',
            qty: 5,
            purchasePrice: 15,
            sellingPrice: 19,
            discountPercent: 0,
            lineSubtotal: 95,
            lineDiscountAmount: 0,
            lineTotal: 95,
            lineCost: 75,
            lineProfit: 20,
          },
        ],
        subtotal: 445,
        extraDiscountPercent: 0,
        totalDiscountAmount: 14,
        vatPercent: 0,
        vatAmount: 0,
        totalAmount: 431,
        paidAmount: 431,
        dueAmount: 0,
        totalCost: 355,
        netProfit: 76,
        paymentMethod: 'nagad',
        notes: '',
        createdAt: isoDateTimeDaysAgo(1, 16),
      },
      {
        id: 'sale-904',
        invoiceNumber: 'INV-2026-0095',
        customerId: 'cust-3',
        customerName: 'ডা. কামরুল হাসান',
        customerPhone: '01911-784520',
        items: [
          {
            medicineId: 'med-111',
            medicineName: 'স্যাভলন অ্যান্টিসেপটিক লিকুইড',
            batchNumber: 'SAV-2603S',
            unit: 'বোতল (১১২ মি.লি.)',
            qty: 10,
            purchasePrice: 64,
            sellingPrice: 80,
            discountPercent: 6,
            lineSubtotal: 800,
            lineDiscountAmount: 48,
            lineTotal: 752,
            lineCost: 640,
            lineProfit: 112,
          },
          {
            medicineId: 'med-112',
            medicineName: 'টাফনিল ২০০ মি.গ্রা. ট্যাবলেট',
            batchNumber: 'TUF-2606E',
            unit: 'পাতা (১০টি)',
            qty: 5,
            purchasePrice: 82,
            sellingPrice: 100,
            discountPercent: 5,
            lineSubtotal: 500,
            lineDiscountAmount: 25,
            lineTotal: 475,
            lineCost: 410,
            lineProfit: 65,
          },
        ],
        subtotal: 1300,
        extraDiscountPercent: 0,
        totalDiscountAmount: 73,
        vatPercent: 0,
        vatAmount: 0,
        totalAmount: 1227,
        paidAmount: 1000,
        dueAmount: 227,
        totalCost: 1050,
        netProfit: 177,
        paymentMethod: 'card',
        notes: 'ক্লিনিক সাপ্লাই',
        createdAt: isoDateTimeDaysAgo(2, 13),
      },
      {
        id: 'sale-905',
        invoiceNumber: 'INV-2026-0091',
        customerId: 'cust-4',
        customerName: 'নুসরাত জাহান মিম',
        customerPhone: '01675-901234',
        items: [
          {
            medicineId: 'med-102',
            medicineName: 'সেকলো ২০ মি.গ্রা. ক্যাপসুল',
            batchNumber: 'SEC-2611B',
            unit: 'পাতা (১০টি)',
            qty: 6,
            purchasePrice: 48,
            sellingPrice: 60,
            discountPercent: 5,
            lineSubtotal: 360,
            lineDiscountAmount: 18,
            lineTotal: 342,
            lineCost: 288,
            lineProfit: 54,
          },
        ],
        subtotal: 360,
        extraDiscountPercent: 0,
        totalDiscountAmount: 18,
        vatPercent: 0,
        vatAmount: 0,
        totalAmount: 342,
        paidAmount: 342,
        dueAmount: 0,
        totalCost: 288,
        netProfit: 54,
        paymentMethod: 'cash',
        notes: '',
        createdAt: isoDateTimeDaysAgo(3, 18),
      },
    ];

    const insertSale = db.prepare(`
      INSERT INTO sales (
        id, invoice_number, customer_id, customer_name, customer_phone,
        items_json, subtotal, extra_discount_percent, total_discount_amount,
        vat_percent, vat_amount, total_amount, paid_amount, due_amount,
        total_cost, net_profit, payment_method, notes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertManySales = db.transaction((items: Sale[]) => {
      for (const s of items) {
        insertSale.run(
          s.id,
          s.invoiceNumber,
          s.customerId,
          s.customerName,
          s.customerPhone,
          JSON.stringify(s.items),
          s.subtotal,
          s.extraDiscountPercent,
          s.totalDiscountAmount,
          s.vatPercent,
          s.vatAmount,
          s.totalAmount,
          s.paidAmount,
          s.dueAmount,
          s.totalCost,
          s.netProfit,
          s.paymentMethod,
          s.notes,
          s.createdAt,
        );
      }
    });
    insertManySales(seedSales);
  }
}

function mapMedicineRow(row: Record<string, unknown>): Medicine {
  return {
    id: String(row.id),
    name: String(row.name),
    genericName: String(row.generic_name || ''),
    category: String(row.category || ''),
    manufacturer: String(row.manufacturer || ''),
    batchNumber: String(row.batch_number),
    expiryDate: String(row.expiry_date),
    purchasePrice: Number(row.purchase_price),
    sellingPrice: Number(row.selling_price),
    piecesPerPack: Math.max(1, Number(row.pieces_per_pack || 1)),
    stockQty: Number(row.stock_qty),
    minStockAlert: Number(row.min_stock_alert),
    unit: String(row.unit || 'পিস'),
    updatedAt: String(row.updated_at),
  };
}

function mapCustomerRow(row: Record<string, unknown>): Customer {
  return {
    id: String(row.id),
    name: String(row.name),
    phone: String(row.phone || ''),
    address: String(row.address || ''),
    dueBalance: Number(row.due_balance),
    totalSpent: Number(row.total_spent),
    visitCount: Number(row.visit_count),
    notes: String(row.notes || ''),
    encryptedNotes: String(row.encrypted_notes || ''),
    lastVisit: String(row.last_visit),
    updatedAt: String(row.updated_at),
  };
}

function mapSaleRow(row: Record<string, unknown>): Sale {
  return {
    id: String(row.id),
    invoiceNumber: String(row.invoice_number),
    customerId: row.customer_id ? String(row.customer_id) : null,
    customerName: String(row.customer_name),
    customerPhone: String(row.customer_phone || ''),
    items: JSON.parse(String(row.items_json)) as SaleItem[],
    subtotal: Number(row.subtotal),
    extraDiscountPercent: Number(row.extra_discount_percent),
    totalDiscountAmount: Number(row.total_discount_amount),
    vatPercent: Number(row.vat_percent),
    vatAmount: Number(row.vat_amount),
    totalAmount: Number(row.total_amount),
    paidAmount: Number(row.paid_amount),
    dueAmount: Number(row.due_amount),
    totalCost: Number(row.total_cost),
    netProfit: Number(row.net_profit),
    paymentMethod: String(row.payment_method) as Sale['paymentMethod'],
    notes: String(row.notes || ''),
    createdAt: String(row.created_at),
  };
}

function mapSettingsRow(row: Record<string, unknown>): PharmacySettings {
  return {
    pharmacyName: String(row.pharmacy_name),
    pharmacyNameEn: String(row.pharmacy_name_en),
    tagline: String(row.tagline),
    licenseNumber: String(row.license_number),
    phone: String(row.phone),
    address: String(row.address),
    currencySymbol: String(row.currency_symbol),
    defaultVatPercent: Number(row.default_vat_percent),
    expiryAlertDays: Number(row.expiry_alert_days),
    language: String(row.language) as PharmacySettings['language'],
    theme: String(row.theme) as PharmacySettings['theme'],
    tableDensity: String(row.table_density) as PharmacySettings['tableDensity'],
    encryptionEnabled: Boolean(row.encryption_enabled),
    updatedAt: String(row.updated_at),
  };
}

export function getFullSnapshot(): PharmacySnapshot {
  const medRows = db
    .prepare('SELECT * FROM medicines ORDER BY name ASC')
    .all() as Record<string, unknown>[];
  const custRows = db
    .prepare('SELECT * FROM customers ORDER BY last_visit DESC')
    .all() as Record<string, unknown>[];
  const saleRows = db
    .prepare('SELECT * FROM sales ORDER BY created_at DESC')
    .all() as Record<string, unknown>[];
  const settingsRow = db
    .prepare('SELECT * FROM settings WHERE id = 1')
    .get() as Record<string, unknown>;

  return {
    medicines: medRows.map(mapMedicineRow),
    customers: custRows.map(mapCustomerRow),
    sales: saleRows.map(mapSaleRow),
    settings: mapSettingsRow(settingsRow),
  };
}

export function upsertMedicine(med: Medicine): Medicine {
  const updatedAt = med.updatedAt || new Date().toISOString();
  const piecesPerPack = Math.max(1, Math.floor(Number(med.piecesPerPack || 1)));
  db.prepare(
    `INSERT INTO medicines (
      id, name, generic_name, category, manufacturer, batch_number,
      expiry_date, purchase_price, selling_price, pieces_per_pack,
      stock_qty, min_stock_alert, unit, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      generic_name = excluded.generic_name,
      category = excluded.category,
      manufacturer = excluded.manufacturer,
      batch_number = excluded.batch_number,
      expiry_date = excluded.expiry_date,
      purchase_price = excluded.purchase_price,
      selling_price = excluded.selling_price,
      pieces_per_pack = excluded.pieces_per_pack,
      stock_qty = excluded.stock_qty,
      min_stock_alert = excluded.min_stock_alert,
      unit = excluded.unit,
      updated_at = excluded.updated_at`,
  ).run(
    med.id,
    med.name,
    med.genericName,
    med.category,
    med.manufacturer,
    med.batchNumber,
    med.expiryDate,
    med.purchasePrice,
    med.sellingPrice,
    piecesPerPack,
    med.stockQty,
    med.minStockAlert,
    med.unit,
    updatedAt,
  );
  const row = db
    .prepare('SELECT * FROM medicines WHERE id = ?')
    .get(med.id) as Record<string, unknown>;
  return mapMedicineRow(row);
}

export function deleteMedicine(id: string): boolean {
  const info = db.prepare('DELETE FROM medicines WHERE id = ?').run(id);
  return info.changes > 0;
}

export function upsertCustomer(cust: Customer): Customer {
  const updatedAt = cust.updatedAt || new Date().toISOString();
  db.prepare(
    `INSERT INTO customers (
      id, name, phone, address, due_balance, total_spent,
      visit_count, notes, encrypted_notes, last_visit, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      phone = excluded.phone,
      address = excluded.address,
      due_balance = excluded.due_balance,
      total_spent = excluded.total_spent,
      visit_count = excluded.visit_count,
      notes = excluded.notes,
      encrypted_notes = excluded.encrypted_notes,
      last_visit = excluded.last_visit,
      updated_at = excluded.updated_at`,
  ).run(
    cust.id,
    cust.name,
    cust.phone,
    cust.address,
    cust.dueBalance,
    cust.totalSpent,
    cust.visitCount,
    cust.notes,
    cust.encryptedNotes || '',
    cust.lastVisit,
    updatedAt,
  );
  const row = db
    .prepare('SELECT * FROM customers WHERE id = ?')
    .get(cust.id) as Record<string, unknown>;
  return mapCustomerRow(row);
}

export function payCustomerDue(id: string, amount: number): Customer | null {
  const existing = db
    .prepare('SELECT * FROM customers WHERE id = ?')
    .get(id) as Record<string, unknown> | undefined;
  if (!existing) return null;
  const currentDue = Number(existing.due_balance);
  const nextDue = Math.max(0, Number((currentDue - amount).toFixed(2)));
  const updatedAt = new Date().toISOString();
  db.prepare(
    'UPDATE customers SET due_balance = ?, updated_at = ? WHERE id = ?',
  ).run(nextDue, updatedAt, id);
  const updated = db
    .prepare('SELECT * FROM customers WHERE id = ?')
    .get(id) as Record<string, unknown>;
  return mapCustomerRow(updated);
}

export function deleteCustomer(id: string): boolean {
  const info = db.prepare('DELETE FROM customers WHERE id = ?').run(id);
  return info.changes > 0;
}

export function createSaleTransaction(sale: Sale): {
  sale: Sale;
  updatedMedicines: Medicine[];
  updatedCustomer: Customer | null;
} {
  const tx = db.transaction((inputSale: Sale) => {
    // Idempotency guard for offline retry
    const existing = db
      .prepare('SELECT * FROM sales WHERE id = ?')
      .get(inputSale.id) as Record<string, unknown> | undefined;
    if (existing) {
      return {
        sale: mapSaleRow(existing),
        updatedMedicines: [],
        updatedCustomer: null,
      };
    }

    db.prepare(
      `INSERT INTO sales (
        id, invoice_number, customer_id, customer_name, customer_phone,
        items_json, subtotal, extra_discount_percent, total_discount_amount,
        vat_percent, vat_amount, total_amount, paid_amount, due_amount,
        total_cost, net_profit, payment_method, notes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      inputSale.id,
      inputSale.invoiceNumber,
      inputSale.customerId,
      inputSale.customerName,
      inputSale.customerPhone,
      JSON.stringify(inputSale.items),
      inputSale.subtotal,
      inputSale.extraDiscountPercent,
      inputSale.totalDiscountAmount,
      inputSale.vatPercent,
      inputSale.vatAmount,
      inputSale.totalAmount,
      inputSale.paidAmount,
      inputSale.dueAmount,
      inputSale.totalCost,
      inputSale.netProfit,
      inputSale.paymentMethod,
      inputSale.notes,
      inputSale.createdAt,
    );

    const updatedMedicines: Medicine[] = [];
    const now = new Date().toISOString();

    for (const item of inputSale.items) {
      const deductPieces =
        typeof item.piecesDeducted === 'number' && item.piecesDeducted >= 0
          ? Math.floor(item.piecesDeducted)
          : item.sellUnit === 'strip' &&
              item.piecesPerPack &&
              item.piecesPerPack > 1
            ? Math.floor(item.qty * item.piecesPerPack)
            : Math.max(0, Math.floor(item.qty));

      db.prepare(
        `UPDATE medicines
         SET stock_qty = MAX(0, stock_qty - ?), updated_at = ?
         WHERE id = ?`,
      ).run(deductPieces, now, item.medicineId);

      const medRow = db
        .prepare('SELECT * FROM medicines WHERE id = ?')
        .get(item.medicineId) as Record<string, unknown> | undefined;
      if (medRow) {
        updatedMedicines.push(mapMedicineRow(medRow));
      }
    }

    let updatedCustomer: Customer | null = null;
    if (inputSale.customerId) {
      db.prepare(
        `UPDATE customers
         SET total_spent = total_spent + ?,
             due_balance = due_balance + ?,
             visit_count = visit_count + 1,
             last_visit = ?,
             updated_at = ?
         WHERE id = ?`,
      ).run(
        inputSale.totalAmount,
        inputSale.dueAmount,
        inputSale.createdAt,
        now,
        inputSale.customerId,
      );

      const custRow = db
        .prepare('SELECT * FROM customers WHERE id = ?')
        .get(inputSale.customerId) as Record<string, unknown> | undefined;
      if (custRow) {
        updatedCustomer = mapCustomerRow(custRow);
      }
    }

    const savedRow = db
      .prepare('SELECT * FROM sales WHERE id = ?')
      .get(inputSale.id) as Record<string, unknown>;

    return {
      sale: mapSaleRow(savedRow),
      updatedMedicines,
      updatedCustomer,
    };
  });

  return tx(sale);
}

export function updateSettings(next: PharmacySettings): PharmacySettings {
  const updatedAt = new Date().toISOString();
  db.prepare(
    `UPDATE settings SET
      pharmacy_name = ?,
      pharmacy_name_en = ?,
      tagline = ?,
      license_number = ?,
      phone = ?,
      address = ?,
      currency_symbol = ?,
      default_vat_percent = ?,
      expiry_alert_days = ?,
      language = ?,
      theme = ?,
      table_density = ?,
      encryption_enabled = ?,
      updated_at = ?
    WHERE id = 1`,
  ).run(
    next.pharmacyName,
    next.pharmacyNameEn,
    next.tagline,
    next.licenseNumber,
    next.phone,
    next.address,
    next.currencySymbol,
    next.defaultVatPercent,
    next.expiryAlertDays,
    next.language,
    next.theme,
    next.tableDensity,
    next.encryptionEnabled ? 1 : 0,
    updatedAt,
  );
  const row = db
    .prepare('SELECT * FROM settings WHERE id = 1')
    .get() as Record<string, unknown>;
  return mapSettingsRow(row);
}

export function restoreFullSnapshot(snapshot: PharmacySnapshot): PharmacySnapshot {
  const tx = db.transaction((data: PharmacySnapshot) => {
    db.prepare('DELETE FROM medicines').run();
    db.prepare('DELETE FROM customers').run();
    db.prepare('DELETE FROM sales').run();

    for (const m of data.medicines) {
      upsertMedicine(m);
    }
    for (const c of data.customers) {
      upsertCustomer(c);
    }
    const insertSale = db.prepare(`
      INSERT INTO sales (
        id, invoice_number, customer_id, customer_name, customer_phone,
        items_json, subtotal, extra_discount_percent, total_discount_amount,
        vat_percent, vat_amount, total_amount, paid_amount, due_amount,
        total_cost, net_profit, payment_method, notes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const s of data.sales) {
      insertSale.run(
        s.id,
        s.invoiceNumber,
        s.customerId,
        s.customerName,
        s.customerPhone,
        JSON.stringify(s.items),
        s.subtotal,
        s.extraDiscountPercent,
        s.totalDiscountAmount,
        s.vatPercent,
        s.vatAmount,
        s.totalAmount,
        s.paidAmount,
        s.dueAmount,
        s.totalCost,
        s.netProfit,
        s.paymentMethod,
        s.notes,
        s.createdAt,
      );
    }
    if (data.settings) {
      updateSettings(data.settings);
    }
    return getFullSnapshot();
  });

  return tx(snapshot);
}

export function checkDatabaseHealth(): boolean {
  try {
    const row = db.prepare('SELECT 1 as ok').get() as {ok: number};
    return row?.ok === 1;
  } catch {
    return false;
  }
}
