import type { CellObject, WorkSheet } from "xlsx";

export type ReportType = "registry" | "daily";

export type CellData = {
  raw: string | number | boolean | null;
  display: string;
  link?: string;
};

export type ParsedReport = {
  type: ReportType;
  title: string;
  fileName: string;
  fileSize: number;
  sheetName: string;
  startDate: string;
  endDate: string;
  columns: string[];
  rows: CellData[][];
};

export type RegistryRecord = {
  id: string;
  rowIndex: number;
  plate: string;
  customerType: string;
  enteredAt: string;
  exitedAt: string;
  minutes: number;
  calculatedAmount: number;
  dueAmount: number;
  paidAmount: number;
  discountAmount: number;
  paymentType: string;
  cashier: string;
  parking: string;
  zone: string;
  receiptId: string;
  transactionId: string;
  correctedPlate: string;
  correctedBy: string;
  correctedAt: string;
  manualEntryUser: string;
  manualEntryNote: string;
  exitUser: string;
  exitType: string;
  exitNote: string;
  entryCarImage?: string;
  entryPlateImage?: string;
  exitCarImage?: string;
  exitPlateImage?: string;
  cells: CellData[];
};

export type PaymentMethod = {
  name: string;
  amount: number;
  count: number;
};

export type DailySummary = {
  totalAmount: number;
  paidCount: number;
  discountAmount: number;
  discountCount: number;
  methods: PaymentMethod[];
  parkingRows: CellData[][];
};

export type RegistryStats = {
  totalVisits: number;
  totalRevenue: number;
  paidVisits: number;
  freeUnder30: number;
  freeOver30: number;
  expectedButUnpaid: number;
  manualEntries: number;
  manualExits: number;
  plateCorrections: number;
  missingExitImage: number;
  openVisits: number;
  averageMinutes: number;
  duplicateTransactions: number;
};

type XlsxApi = typeof import("xlsx");

const text = (value: CellData | undefined) => value?.display.trim() ?? "";

export function number(value: CellData | undefined) {
  if (!value) return 0;
  if (typeof value.raw === "number" && Number.isFinite(value.raw)) return value.raw;
  const parsed = Number(value.display.replace(/[₮,\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function safeLink(target?: string) {
  if (!target) return undefined;
  try {
    const url = new URL(target);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function toCellData(XLSX: XlsxApi, cell?: CellObject): CellData {
  if (!cell) return { raw: null, display: "" };
  const rawValue = cell.v;
  const raw =
    rawValue instanceof Date
      ? rawValue.toISOString()
      : typeof rawValue === "string" ||
          typeof rawValue === "number" ||
          typeof rawValue === "boolean"
        ? rawValue
        : null;

  return {
    raw,
    display: XLSX.utils.format_cell(cell).trim(),
    link: safeLink(cell.l?.Target),
  };
}

function sheetMatrix(XLSX: XlsxApi, sheet: WorkSheet) {
  const reference = sheet["!ref"];
  if (!reference) return [] as CellData[][];
  const range = XLSX.utils.decode_range(reference);
  const rows: CellData[][] = [];

  for (let rowIndex = range.s.r; rowIndex <= range.e.r; rowIndex += 1) {
    const row: CellData[] = [];
    for (let columnIndex = range.s.c; columnIndex <= range.e.c; columnIndex += 1) {
      const address = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
      row.push(toCellData(XLSX, sheet[address]));
    }
    rows.push(row);
  }

  return rows;
}

function reportTypeFromRows(rows: CellData[][]): ReportType | null {
  const firstRows = rows
    .slice(0, 12)
    .flat()
    .map((cell) => cell.display.toLowerCase());

  if (
    firstRows.includes("машины дугаар") &&
    firstRows.includes("зогссон минут") &&
    firstRows.includes("төлсөн дүн")
  ) {
    return "registry";
  }

  if (firstRows.includes("нийт төлбөр") && firstRows.includes("нийт төлсөн тоо")) {
    return "daily";
  }

  return null;
}

function findHeaderRow(rows: CellData[][], type: ReportType) {
  return rows.slice(0, 15).findIndex((row) => {
    const values = row.map((cell) => cell.display.toLowerCase());
    return type === "registry"
      ? values.includes("машины дугаар") && values.includes("зогссон минут")
      : values.includes("нийт төлбөр") && values.includes("нийт төлсөн тоо");
  });
}

function uniqueHeaders(row: CellData[]) {
  const used = new Map<string, number>();
  return row.map((cell, index) => {
    const base = cell.display.trim() || `Багана ${index + 1}`;
    const count = used.get(base) ?? 0;
    used.set(base, count + 1);
    return count === 0 ? base : `${base} (${count + 1})`;
  });
}

function metadataValue(rows: CellData[][], label: string) {
  const row = rows.slice(0, 8).find((candidate) => text(candidate[0]) === label);
  return text(row?.[1]);
}

export async function parseReportFile(file: File): Promise<ParsedReport> {
  const xlsxModule = await import("xlsx");
  const XLSX = ("read" in xlsxModule ? xlsxModule : xlsxModule.default) as XlsxApi;
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, {
    type: "array",
    cellDates: true,
    cellNF: true,
  });

  for (const sheetName of workbook.SheetNames) {
    const matrix = sheetMatrix(XLSX, workbook.Sheets[sheetName]);
    const type = reportTypeFromRows(matrix);
    if (!type) continue;

    const headerIndex = findHeaderRow(matrix, type);
    if (headerIndex < 0) continue;
    const columns = uniqueHeaders(matrix[headerIndex]);
    const rows = matrix
      .slice(headerIndex + 1)
      .filter((row) => row.some((cell) => cell.display.trim() !== ""))
      .map((row) =>
        Array.from({ length: columns.length }, (_, index) =>
          row[index] ?? { raw: null, display: "" },
        ),
      );

    return {
      type,
      title: text(matrix[0]?.[0]) || (type === "registry" ? "Нийт бүртгэл тайлан" : "Өдөр тутмын тайлан"),
      fileName: file.name,
      fileSize: file.size,
      sheetName,
      startDate: metadataValue(matrix, "Эхлэх огноо"),
      endDate: metadataValue(matrix, "Дуусах огноо"),
      columns,
      rows,
    };
  }

  throw new Error("Энэ файл UB Parking-ийн өдөр тутмын эсвэл нийт бүртгэл тайлан биш байна.");
}

function columnIndex(report: ParsedReport, name: string) {
  return report.columns.findIndex((column) => column.trim() === name);
}

function cell(report: ParsedReport, row: CellData[], name: string) {
  const index = columnIndex(report, name);
  return index >= 0 ? row[index] : undefined;
}

function hasValue(value: string) {
  const normalized = value.trim().toLowerCase();
  return normalized !== "" && normalized !== "nan";
}

export function registryRecords(report: ParsedReport) {
  return report.rows
    .map<RegistryRecord>((row, rowIndex) => {
      const plate = text(cell(report, row, "Машины дугаар"));
      const enteredAt = text(cell(report, row, "Зогсоолд орсон огноо"));
      return {
        id: `${rowIndex}-${plate}-${enteredAt}`,
        rowIndex,
        plate,
        customerType: text(cell(report, row, "Үйлчлүүлэгчийн төрөл")),
        enteredAt,
        exitedAt: text(cell(report, row, "Зогсоолоос гарсан огноо")),
        minutes: number(cell(report, row, "Зогссон минут")),
        calculatedAmount: number(cell(report, row, "Тооцоолсон дүн")),
        dueAmount: number(cell(report, row, "Төлбөл зохих дүн")),
        paidAmount: number(cell(report, row, "Төлсөн дүн")),
        discountAmount: number(cell(report, row, "Хөнгөлөлтийн дүн")),
        paymentType: text(cell(report, row, "Төлбөрийн төрөл")),
        cashier: text(cell(report, row, "Кассчин")),
        parking: text(cell(report, row, "Зогсоолын нэр")),
        zone: text(cell(report, row, "Бүсийн нэр")),
        receiptId: text(cell(report, row, "Ибаримт ДДТД")),
        transactionId: text(cell(report, row, "Гүйлгээний дугаар")),
        correctedPlate: text(cell(report, row, "Засахын өмнөх дугаар")),
        correctedBy: text(cell(report, row, "Дугаар зассан хэргэлэгч")),
        correctedAt: text(cell(report, row, "Дугаар зассан огноо")),
        manualEntryUser: text(cell(report, row, "Гараар оруулсан хэрэглэгч")),
        manualEntryNote: text(cell(report, row, "Гараар оруулсан тайлбар")),
        exitUser: text(cell(report, row, "Гаргасан хэрэглэгч")),
        exitType: text(cell(report, row, "Гаргасан төрөл")),
        exitNote: text(cell(report, row, "Гаргасан тайлбар")),
        entryCarImage: cell(report, row, "Орох үеийн машины зураг")?.link,
        entryPlateImage: cell(report, row, "Орох үеийн дугаарын зураг")?.link,
        exitCarImage: cell(report, row, "Гарах үеийн машины зураг")?.link,
        exitPlateImage: cell(report, row, "Гарах үеийн дугаарын зураг")?.link,
        cells: row,
      };
    })
    .filter(
      (record) =>
        record.plate.trim().toLowerCase() !== "нийт" &&
        (hasValue(record.plate) || hasValue(record.enteredAt)),
    );
}

export function dailySummary(report: ParsedReport): DailySummary {
  const totalRow = report.rows.find((row) => text(row[0]).toLowerCase() === "нийт");
  const parkingRows = report.rows.filter((row) => text(row[0]).toLowerCase() !== "нийт");
  const summaryRow = totalRow ?? parkingRows[0] ?? [];
  const totalIndex = columnIndex(report, "Нийт төлбөр");
  const methods: PaymentMethod[] = [];

  for (let index = totalIndex + 2; index < report.columns.length - 1; index += 2) {
    const amountHeader = report.columns[index];
    const countHeader = report.columns[index + 1] ?? "";
    if (!countHeader.toLowerCase().includes("тоо")) continue;
    const amount = number(summaryRow[index]);
    const count = number(summaryRow[index + 1]);
    if (amount > 0 || count > 0) methods.push({ name: amountHeader, amount, count });
  }

  return {
    totalAmount: number(cell(report, summaryRow, "Нийт төлбөр")),
    paidCount: number(cell(report, summaryRow, "Нийт төлсөн тоо")),
    discountAmount: number(cell(report, summaryRow, "Нийт хөнгөлөлт")),
    discountCount: number(cell(report, summaryRow, "Нийт хөнгөлөлт тоо")),
    methods: methods.sort((a, b) => b.amount - a.amount),
    parkingRows,
  };
}

export function registryStats(records: RegistryRecord[]): RegistryStats {
  const transactionCounts = new Map<string, number>();
  records.forEach((record) => {
    if (hasValue(record.transactionId)) {
      transactionCounts.set(record.transactionId, (transactionCounts.get(record.transactionId) ?? 0) + 1);
    }
  });

  const totalMinutes = records.reduce((sum, record) => sum + record.minutes, 0);
  return {
    totalVisits: records.length,
    totalRevenue: records.reduce((sum, record) => sum + record.paidAmount, 0),
    paidVisits: records.filter((record) => record.paidAmount > 0).length,
    freeUnder30: records.filter((record) => record.minutes < 30 && record.paidAmount <= 0).length,
    freeOver30: records.filter((record) => record.minutes >= 30 && record.paidAmount <= 0).length,
    expectedButUnpaid: records.filter(
      (record) => Math.max(record.calculatedAmount, record.dueAmount) > 0 && record.paidAmount <= 0,
    ).length,
    manualEntries: records.filter(
      (record) => hasValue(record.manualEntryUser) || hasValue(record.manualEntryNote),
    ).length,
    manualExits: records.filter(
      (record) => hasValue(record.exitUser) || hasValue(record.exitType) || hasValue(record.exitNote),
    ).length,
    plateCorrections: records.filter((record) => hasValue(record.correctedPlate)).length,
    missingExitImage: records.filter((record) => !record.exitCarImage || !record.exitPlateImage).length,
    openVisits: records.filter((record) => !hasValue(record.exitedAt)).length,
    averageMinutes: records.length ? Math.round(totalMinutes / records.length) : 0,
    duplicateTransactions: [...transactionCounts.values()].filter((count) => count > 1).length,
  };
}

export function reportCell(report: ParsedReport, row: CellData[], name: string) {
  return cell(report, row, name);
}

export function meaningful(value: string) {
  return hasValue(value);
}
