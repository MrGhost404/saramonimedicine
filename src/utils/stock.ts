import {formatNumber} from '../i18n/translations';
import type {Language, Medicine, SaleItem} from '../types/pharmacy';

export interface StockBreakdown {
  piecesPerPack: number;
  totalPieces: number;
  strips: number;
  loosePieces: number;
  unitShort: string;
  piecePurchasePrice: number;
  pieceSellingPrice: number;
  stockCostValue: number;
  primaryLabel: string;
  secondaryLabel: string;
}

export function getMedicineStockBreakdown(
  med: Medicine,
  lang: Language,
): StockBreakdown {
  const piecesPerPack = Math.max(1, Math.floor(med.piecesPerPack || 1));
  const totalPieces = Math.max(0, Math.floor(med.stockQty || 0));
  const unitShort =
    med.unit?.split(' ')[0]?.trim() || (lang === 'bn' ? 'পাতা' : 'strip');
  const pieceWord = lang === 'bn' ? 'পিস' : 'pcs';

  const strips =
    piecesPerPack > 1 ? Math.floor(totalPieces / piecesPerPack) : totalPieces;
  const loosePieces = piecesPerPack > 1 ? totalPieces % piecesPerPack : 0;

  const piecePurchasePrice = med.purchasePrice / piecesPerPack;
  const pieceSellingPrice = med.sellingPrice / piecesPerPack;
  const stockCostValue = piecePurchasePrice * totalPieces;

  let primaryLabel = '';
  let secondaryLabel = '';

  if (piecesPerPack <= 1) {
    primaryLabel = `${formatNumber(totalPieces, lang)} ${unitShort}`;
  } else {
    primaryLabel =
      loosePieces > 0
        ? `${formatNumber(strips, lang)} ${unitShort} + ${formatNumber(loosePieces, lang)} ${pieceWord}`
        : `${formatNumber(strips, lang)} ${unitShort}`;
    secondaryLabel = `${formatNumber(totalPieces, lang)} ${pieceWord}`;
  }

  return {
    piecesPerPack,
    totalPieces,
    strips,
    loosePieces,
    unitShort,
    piecePurchasePrice,
    pieceSellingPrice,
    stockCostValue,
    primaryLabel,
    secondaryLabel,
  };
}

export function getSaleItemPiecesDeducted(item: SaleItem): number {
  if (typeof item.piecesDeducted === 'number' && item.piecesDeducted >= 0) {
    return Math.floor(item.piecesDeducted);
  }
  if (item.sellUnit === 'strip' && item.piecesPerPack && item.piecesPerPack > 1) {
    return Math.floor(item.qty * item.piecesPerPack);
  }
  return Math.max(0, Math.floor(item.qty));
}
