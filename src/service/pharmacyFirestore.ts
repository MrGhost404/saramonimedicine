import {
  collection,
  doc,
  getDocs,
  addDoc,
  setDoc,
  deleteDoc,
  query,
  orderBy,
  where,
  runTransaction,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { getSaleItemPiecesDeducted } from "../utils/stock";
import type { Medicine, SaleItem } from "../types/pharmacy";

export interface DailySaleRecord {
  id?: string;
  invoiceNo?: string;
  items: SaleItem[];
  totalAmount: number;
  dateKey: string;
  createdAt?: unknown;
}

export function getTodayDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function cleanFirestorePayload(data: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(data)) {
    if (key === "id" || val === undefined) continue;
    result[key] = val;
  }
  return result;
}

function getSaleItemField(item: SaleItem, keys: string[]): string {
  const record = item as unknown as Record<string, unknown>;
  for (const key of keys) {
    const val = record[key];
    if (typeof val === "string" && val.trim().length > 0) {
      return val.trim();
    }
    if (typeof val === "number") {
      return String(val);
    }
  }
  return "";
}

export async function fetchMedicinesFromFirestore(): Promise<Medicine[]> {
  const q = query(collection(db, "medicines"), orderBy("name", "asc"));
  const snapshot = await getDocs(q);

  return snapshot.docs.map((item) => ({
    id: item.id,
    ...(item.data() as Omit<Medicine, "id">),
  }));
}

export async function saveMedicineToFirestore(medicine: Medicine): Promise<string> {
  const raw = medicine as unknown as Record<string, unknown>;
  const rawId = raw.id;
  const payload = cleanFirestorePayload(raw);

  if (typeof rawId === "string" && rawId.trim().length > 0) {
    const medId = rawId.trim();
    await setDoc(
      doc(db, "medicines", medId),
      {
        ...payload,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    return medId;
  }

  const docRef = await addDoc(collection(db, "medicines"), {
    ...payload,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function deleteMedicineFromFirestore(medicineId: string): Promise<void> {
  await deleteDoc(doc(db, "medicines", medicineId));
}

export async function createSaleAndDeductStock(params: {
  items: SaleItem[];
  totalAmount: number;
  invoiceNo?: string;
}): Promise<string> {
  const { items, totalAmount, invoiceNo } = params;
  const dateKey = getTodayDateKey();

  const cleanItems = items.map((item) =>
    cleanFirestorePayload(item as unknown as Record<string, unknown>)
  );

  return await runTransaction(db, async (transaction) => {
    const medSnapshots = await Promise.all(
      items.map((item) => {
        const medId = getSaleItemField(item, ["medicineId", "medId", "id"]);
        const medLabel =
          getSaleItemField(item, ["medicineName", "name", "title"]) || "Unknown";

        if (!medId) {
          throw new Error(`Medicine ID missing for item: ${medLabel}`);
        }
        const medRef = doc(db, "medicines", medId);
        return transaction
          .get(medRef)
          .then((snap) => ({ item, medId, medLabel, medRef, snap }));
      })
    );

    for (const { medLabel, medRef, snap, item } of medSnapshots) {
      if (!snap.exists()) {
        throw new Error(`Medicine not found in inventory: ${medLabel}`);
      }

      const currentStock = Math.max(
        0,
        Math.floor(Number(snap.data().stockQty || 0))
      );
      const piecesToDeduct = getSaleItemPiecesDeducted(item);

      if (currentStock < piecesToDeduct) {
        throw new Error(
          `Insufficient stock for ${medLabel}: available ${currentStock}, required ${piecesToDeduct}`
        );
      }

      transaction.update(medRef, {
        stockQty: currentStock - piecesToDeduct,
        updatedAt: serverTimestamp(),
      });
    }

    const saleDocRef = doc(collection(db, "sales"));
    transaction.set(saleDocRef, {
      invoiceNo: invoiceNo || `INV-${Date.now()}`,
      items: cleanItems,
      totalAmount,
      dateKey,
      createdAt: serverTimestamp(),
    });

    return saleDocRef.id;
  });
}

export async function fetchDailySalesFromFirestore(
  dateKey: string = getTodayDateKey()
): Promise<DailySaleRecord[]> {
  const q = query(collection(db, "sales"), where("dateKey", "==", dateKey));
  const snapshot = await getDocs(q);

  const records = snapshot.docs.map((docSnap) => {
    const data = docSnap.data();
    const createdAtDate =
      data.createdAt instanceof Timestamp ? data.createdAt.toDate() : null;

    return {
      id: docSnap.id,
      invoiceNo: data.invoiceNo,
      items: Array.isArray(data.items) ? data.items : [],
      totalAmount: Number(data.totalAmount || 0),
      dateKey: String(data.dateKey || dateKey),
      createdAt: createdAtDate,
    };
  });

  return records.sort((a, b) => {
    const timeA = a.createdAt instanceof Date ? a.createdAt.getTime() : 0;
    const timeB = b.createdAt instanceof Date ? b.createdAt.getTime() : 0;
    return timeB - timeA;
  });
}