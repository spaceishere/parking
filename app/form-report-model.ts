import type { CellObject, WorkSheet } from "xlsx";

export type FormTaskGroup = {
  floor: string;
  tasks: string[];
};

export type FormRecord = {
  id: string;
  sourceRow: number;
  startedAt: string;
  completedAt: string;
  startedTimestamp: number;
  completedTimestamp: number;
  dateKey: string;
  durationSeconds: number;
  worker: string;
  safety: string;
  cleaningType: string;
  floor: string;
  taskGroups: FormTaskGroup[];
  tasks: string[];
  extraWork: string;
  extraFloor: string;
  b1: string;
  emergencyStairs: string;
  escalator: string;
  restroomLocation: string;
  toiletPaper: string;
  soap: string;
  trash: string;
  odor: string;
  mirror: string;
  toilet: string;
  sink: string;
  answers: Array<{ label: string; value: string }>;
};

export type FormReport = {
  fileName: string;
  fileSize: number;
  sheetName: string;
  columns: string[];
  records: FormRecord[];
  startDate: string;
  endDate: string;
};

export type FormSummary = {
  totalRecords: number;
  uniqueWorkers: number;
  safetyYes: number;
  safetyNo: number;
  safetyRate: number;
  mainCleaning: number;
  partialCleaning: number;
  urgentCleaning: number;
  extraWork: number;
  restroomChecks: number;
  attentionRecords: number;
};

type XlsxApi = typeof import("xlsx");

const cleanText = (value: unknown) => String(value ?? "")
  .replace(/\u00a0/g, " ")
  .replace(/\s+/g, " ")
  .trim();

function normalized(value: unknown) {
  return cleanText(value).toLowerCase();
}

function displayCell(XLSX: XlsxApi, cell?: CellObject) {
  return cell ? cleanText(XLSX.utils.format_cell(cell)) : "";
}

function sheetRows(XLSX: XlsxApi, sheet: WorkSheet) {
  const reference = sheet["!ref"];
  if (!reference) return [] as string[][];
  const range = XLSX.utils.decode_range(reference);
  const rows: string[][] = [];

  for (let rowIndex = range.s.r; rowIndex <= range.e.r; rowIndex += 1) {
    const row: string[] = [];
    for (let columnIndex = range.s.c; columnIndex <= range.e.c; columnIndex += 1) {
      const address = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
      row.push(displayCell(XLSX, sheet[address]));
    }
    rows.push(row);
  }

  return rows;
}

function findColumn(columns: string[], matcher: (column: string) => boolean) {
  return columns.findIndex((column) => matcher(normalized(column)));
}

function valueAt(row: string[], index: number) {
  return index >= 0 ? cleanText(row[index]) : "";
}

function normalizeChoice(value: string) {
  const cleaned = cleanText(value);
  if (!cleaned) return "";
  if (cleaned.startsWith("[") && cleaned.endsWith("]")) {
    try {
      const parsed = JSON.parse(cleaned) as unknown;
      if (Array.isArray(parsed)) return parsed.map(cleanText).filter(Boolean).join(", ");
    } catch {
      return cleaned.replace(/^\["?|"?\]$/g, "");
    }
  }
  return cleaned;
}

function normalizeYesNo(value: string) {
  const cleaned = normalizeChoice(value);
  const lower = normalized(cleaned);
  if (lower.startsWith("тийм")) return "Тийм";
  if (lower.startsWith("үгүй")) return "Үгүй";
  return cleaned;
}

function normalizeCleaningType(value: string) {
  const cleaned = normalizeChoice(value);
  const lower = normalized(cleaned);
  if (lower.includes("хэсэгчилсэн")) return "Хэсэгчилсэн цэвэрлэгээ";
  if (lower.includes("яаралтай")) return "Яаралтай дуудлагаар";
  if (lower.includes("үндсэн")) return "Үндсэн цэвэрлэгээ";
  return cleaned || "Тодорхойгүй";
}

function canonicalTask(value: string) {
  const cleaned = cleanText(value);
  const lower = normalized(cleaned);
  if (lower.includes("ариун цэврийн") && lower.includes("цэвэрлэгээ")) return "Ариун цэврийн өрөөний цэвэрлэгээ";
  if (lower.includes("лифт") && lower.includes("нүүр")) return "Лифтний нүүр арчих";
  if (lower.includes("лифт") && lower.includes("урд") && lower.includes("чийгтэй")) return "Лифтний урд талын чийгтэй цэвэрлэгээ";
  if (lower.includes("урсдаг шат") && lower.includes("шил")) return "Урсдаг шатны шил арчих";
  if (lower.includes("заалны тоос")) return "Заалны тоос арчих";
  if (lower.includes("хог шүүр")) return "Хог шүүрдэх";
  if (lower.includes("шал угаах")) return "Шал угаах";
  if (lower.includes("хогийн сав")) return "Хогийн сав цэвэрлэх";
  if (lower.includes("цонхны тавцан")) return "Цонхны тавцан арчих";
  if (lower.includes("тавилганы тоос")) return "Тавилгын тоос арчих";
  if (lower.includes("хана цэвэрлэх")) return "Хана цэвэрлэх";
  if (lower.includes("дрож") && lower.includes("тоос")) return "Дрож тоос сорох";
  if (lower.includes("төрсөн өдрийн өрөө")) return "Төрсөн өдрийн өрөө цэвэрлэх";
  if (lower.includes("лифт") && lower.includes("дотор")) return "Лифтний дотор талын цэвэрлэгээ";
  if (lower.includes("заалны хог")) return "Заалны хог авах";
  if (lower.includes("урд хэсгийн үүд")) return "Урд үүдний цэвэрлэгээ";
  if (lower.includes("хойд хэсгийн үүд")) return "Хойд үүдний цэвэрлэгээ";
  return cleaned;
}

function splitTasks(value: string) {
  return [...new Set(cleanText(value)
    .split(";")
    .map(canonicalTask)
    .filter(Boolean))];
}

function parseFormDate(value: string) {
  const match = cleanText(value).match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return { timestamp: 0, dateKey: "" };
  const yearValue = Number(match[3]);
  const year = yearValue < 100 ? 2000 + yearValue : yearValue;
  const month = Number(match[1]);
  const day = Number(match[2]);
  const timestamp = Date.UTC(year, month - 1, day, Number(match[4]), Number(match[5]), Number(match[6] ?? 0));
  const dateKey = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return { timestamp, dateKey };
}

export function attentionItems(record: FormRecord) {
  const items: string[] = [];
  if (normalizeYesNo(record.safety) === "Үгүй") items.push("ХАБЭА заавар");
  const paper = normalized(record.toiletPaper);
  if (paper.includes("дууссан") && !paper.includes("шинээр дүүргэв")) items.push("00 цаас дууссан");
  if (normalized(record.soap).includes("дүүргэлтгүй")) items.push("Саван дүүргэлтгүй");
  if (normalizeYesNo(record.trash) === "Үгүй") items.push("Хогийн сав");
  if (normalized(record.odor).includes("бохир үнэртэй")) items.push("Эвгүй үнэр");
  if (normalizeYesNo(record.mirror) === "Үгүй") items.push("Толь");
  if (normalizeYesNo(record.toilet) === "Үгүй") items.push("Суултуур");
  if (normalizeYesNo(record.sink) === "Үгүй") items.push("Угаалтуур, цорго");
  return items;
}

export function workedFloors(record: FormRecord) {
  return [...new Set([
    record.floor,
    record.extraFloor,
    ...record.taskGroups.map((group) => group.floor),
  ].filter(Boolean))];
}

export function compareFloors(a: string, b: string) {
  const aNumber = Number(a.match(/\d+/)?.[0] ?? Number.MAX_SAFE_INTEGER);
  const bNumber = Number(b.match(/\d+/)?.[0] ?? Number.MAX_SAFE_INTEGER);
  return aNumber - bNumber || a.localeCompare(b);
}

export function formSummary(records: FormRecord[]): FormSummary {
  const safetyYes = records.filter((record) => normalizeYesNo(record.safety) === "Тийм").length;
  const safetyNo = records.filter((record) => normalizeYesNo(record.safety) === "Үгүй").length;
  return {
    totalRecords: records.length,
    uniqueWorkers: new Set(records.map((record) => record.worker).filter(Boolean)).size,
    safetyYes,
    safetyNo,
    safetyRate: safetyYes + safetyNo ? Math.round((safetyYes / (safetyYes + safetyNo)) * 100) : 0,
    mainCleaning: records.filter((record) => record.cleaningType === "Үндсэн цэвэрлэгээ").length,
    partialCleaning: records.filter((record) => record.cleaningType === "Хэсэгчилсэн цэвэрлэгээ").length,
    urgentCleaning: records.filter((record) => record.cleaningType === "Яаралтай дуудлагаар").length,
    extraWork: records.filter((record) => normalizeYesNo(record.extraWork) === "Тийм").length,
    restroomChecks: records.filter((record) => Boolean(record.restroomLocation)).length,
    attentionRecords: records.filter((record) => attentionItems(record).length > 0).length,
  };
}

export async function parseFormReportFile(file: File): Promise<FormReport> {
  const xlsxModule = (await import("xlsx")) as unknown as { default?: XlsxApi } & Partial<XlsxApi>;
  const XLSX = (xlsxModule.default ?? xlsxModule) as XlsxApi;
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true, cellNF: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("Excel файл дотор sheet олдсонгүй.");

  const rows = sheetRows(XLSX, workbook.Sheets[sheetName]);
  const columns = rows[0] ?? [];
  const startIndex = findColumn(columns, (column) => column === "start time");
  const completionIndex = findColumn(columns, (column) => column === "completion time");
  const idIndex = findColumn(columns, (column) => column === "id");
  const safetyIndex = findColumn(columns, (column) => column.includes("хабэа-ын"));
  const workerIndex = findColumn(columns, (column) => column.includes("таны нэр хэн"));
  const cleaningTypeIndex = findColumn(columns, (column) => column.includes("цэвэрлэгээ үйлчилгээ хийсэн цаг"));
  const floorIndex = findColumn(columns, (column) => column.includes("цэвэрлэж буй давхар"));
  const taskIndexes = columns
    .map((column, index) => normalized(column).startsWith("цэвэрлэгээний нэр төрлүүд") ? index : -1)
    .filter((index) => index >= 0);
  const extraWorkIndex = findColumn(columns, (column) => column.includes("нэмэлт давхар авч"));
  const extraFloorIndex = findColumn(columns, (column) => column.includes("хэдэн давхарт нэмэлтээр"));
  const b1Index = findColumn(columns, (column) => column.startsWith("b1 зогсоо"));
  const emergencyStairsIndex = findColumn(columns, (column) => column.includes("аваарын шатны"));
  const escalatorIndex = findColumn(columns, (column) => column.includes("урсдаг шатны цэвэрлэгээ"));
  const restroomLocationIndex = findColumn(columns, (column) => column.startsWith("байршил та хэдэн давхарт"));
  const toiletPaperIndex = findColumn(columns, (column) => column.startsWith("00 цаас"));
  const soapIndex = findColumn(columns, (column) => column.includes("гарын шингэн саван"));
  const trashIndex = findColumn(columns, (column) => column.includes("хогийн сав суллаж"));
  const odorIndex = findColumn(columns, (column) => column.includes("эвгүй үнэр"));
  const mirrorIndex = findColumn(columns, (column) => column.includes("толь хэвийн"));
  const toiletIndex = findColumn(columns, (column) => column.includes("суултуурууд хэвийн"));
  const sinkIndex = findColumn(columns, (column) => column.includes("угаалтуур цорго"));

  if ([startIndex, workerIndex, cleaningTypeIndex, floorIndex].some((index) => index < 0) || taskIndexes.length === 0) {
    throw new Error("Энэ файл өдөр тутмын хяналтын Forms тайлан биш байна.");
  }

  const records = rows.slice(1).map((row, rowOffset): FormRecord | null => {
    const startedAt = valueAt(row, startIndex);
    const completedAt = valueAt(row, completionIndex);
    const worker = normalizeChoice(valueAt(row, workerIndex));
    const started = parseFormDate(startedAt);
    const completed = parseFormDate(completedAt);
    if (!startedAt && !worker && !valueAt(row, idIndex)) return null;

    const taskGroups = taskIndexes.map((index, taskIndex) => ({
      floor: `${taskIndex + 1}-р давхар`,
      tasks: splitTasks(valueAt(row, index)),
    })).filter((group) => group.tasks.length > 0);
    const tasks = [...new Set(taskGroups.flatMap((group) => group.tasks))];
    const answers = columns.map((label, index) => ({ label: cleanText(label), value: valueAt(row, index) }))
      .filter((answer) => answer.label && answer.value);

    return {
      id: valueAt(row, idIndex) || `row-${rowOffset + 2}`,
      sourceRow: rowOffset + 2,
      startedAt,
      completedAt,
      startedTimestamp: started.timestamp,
      completedTimestamp: completed.timestamp,
      dateKey: started.dateKey,
      durationSeconds: started.timestamp && completed.timestamp ? Math.max(0, Math.round((completed.timestamp - started.timestamp) / 1000)) : 0,
      worker: worker || "Нэргүй",
      safety: normalizeYesNo(valueAt(row, safetyIndex)),
      cleaningType: normalizeCleaningType(valueAt(row, cleaningTypeIndex)),
      floor: normalizeChoice(valueAt(row, floorIndex)) || "Тодорхойгүй",
      taskGroups,
      tasks,
      extraWork: normalizeYesNo(valueAt(row, extraWorkIndex)),
      extraFloor: normalizeChoice(valueAt(row, extraFloorIndex)),
      b1: normalizeYesNo(valueAt(row, b1Index)),
      emergencyStairs: normalizeYesNo(valueAt(row, emergencyStairsIndex)),
      escalator: normalizeYesNo(valueAt(row, escalatorIndex)),
      restroomLocation: normalizeChoice(valueAt(row, restroomLocationIndex)),
      toiletPaper: normalizeChoice(valueAt(row, toiletPaperIndex)),
      soap: normalizeChoice(valueAt(row, soapIndex)),
      trash: normalizeYesNo(valueAt(row, trashIndex)),
      odor: normalizeChoice(valueAt(row, odorIndex)),
      mirror: normalizeYesNo(valueAt(row, mirrorIndex)),
      toilet: normalizeYesNo(valueAt(row, toiletIndex)),
      sink: normalizeYesNo(valueAt(row, sinkIndex)),
      answers,
    };
  }).filter((record): record is FormRecord => Boolean(record));

  if (!records.length) throw new Error("Файлаас хяналтын бүртгэл олдсонгүй.");
  const dates = records.map((record) => record.dateKey).filter(Boolean).sort();

  return {
    fileName: file.name,
    fileSize: file.size,
    sheetName,
    columns,
    records,
    startDate: dates[0] ?? "",
    endDate: dates.at(-1) ?? "",
  };
}
