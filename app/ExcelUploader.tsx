"use client";

import {
  AlertCircle,
  Check,
  ChevronDown,
  Columns3,
  FileSpreadsheet,
  FileUp,
  LockKeyhole,
  RotateCcw,
  Rows3,
  Table2,
  UploadCloud,
  X,
} from "lucide-react";
import { ChangeEvent, DragEvent, useRef, useState } from "react";

type CellValue = string | number | boolean;

type SheetData = {
  columns: string[];
  rows: CellValue[][];
};

type WorkbookData = {
  fileName: string;
  fileSize: number;
  sheetNames: string[];
  sheets: Record<string, SheetData>;
};

type UploadState = "idle" | "reading" | "ready" | "error";

const MAX_FILE_SIZE = 15 * 1024 * 1024;
const VALID_EXTENSIONS = ["xlsx", "xls", "csv"];

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function makeUniqueHeaders(values: CellValue[], width: number) {
  const used = new Map<string, number>();

  return Array.from({ length: width }, (_, index) => {
    const base = String(values[index] ?? "").trim() || `Багана ${index + 1}`;
    const count = used.get(base) ?? 0;
    used.set(base, count + 1);
    return count === 0 ? base : `${base} (${count + 1})`;
  });
}

function prepareSheet(matrix: CellValue[][]): SheetData {
  if (matrix.length === 0) return { columns: [], rows: [] };

  const headerIndex = matrix
    .slice(0, 12)
    .findIndex((row) => row.filter((cell) => String(cell).trim() !== "").length >= 2);
  const safeHeaderIndex = headerIndex >= 0 ? headerIndex : 0;
  const sourceRows = matrix.slice(safeHeaderIndex + 1).filter((row) =>
    row.some((cell) => String(cell).trim() !== ""),
  );
  const width = Math.max(
    matrix[safeHeaderIndex]?.length ?? 0,
    ...sourceRows.map((row) => row.length),
  );

  return {
    columns: makeUniqueHeaders(matrix[safeHeaderIndex] ?? [], width),
    rows: sourceRows.map((row) =>
      Array.from({ length: width }, (_, index) => row[index] ?? ""),
    ),
  };
}

export function ExcelUploader() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState("");
  const [workbook, setWorkbook] = useState<WorkbookData | null>(null);
  const [activeSheet, setActiveSheet] = useState("");

  const resetUpload = () => {
    setWorkbook(null);
    setActiveSheet("");
    setError("");
    setUploadState("idle");
    if (inputRef.current) inputRef.current.value = "";
  };

  const readFile = async (file?: File) => {
    if (!file) return;

    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!VALID_EXTENSIONS.includes(extension)) {
      setError("Зөвхөн .xlsx, .xls эсвэл .csv файл оруулна уу.");
      setUploadState("error");
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setError("Файлын хэмжээ 15 MB-аас их байна.");
      setUploadState("error");
      return;
    }

    setError("");
    setUploadState("reading");

    try {
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const parsed = XLSX.read(buffer, { type: "array", cellDates: true });
      const sheets: Record<string, SheetData> = {};

      for (const sheetName of parsed.SheetNames) {
        const matrix = XLSX.utils.sheet_to_json<CellValue[]>(
          parsed.Sheets[sheetName],
          {
            header: 1,
            defval: "",
            raw: false,
            blankrows: false,
          },
        );
        sheets[sheetName] = prepareSheet(matrix);
      }

      if (parsed.SheetNames.length === 0) {
        throw new Error("empty-workbook");
      }

      setWorkbook({
        fileName: file.name,
        fileSize: file.size,
        sheetNames: parsed.SheetNames,
        sheets,
      });
      setActiveSheet(parsed.SheetNames[0]);
      setUploadState("ready");
    } catch {
      setError("Файлыг уншиж чадсангүй. Excel файл гэдгийг шалгаад дахин оролдоно уу.");
      setUploadState("error");
    }
  };

  const handleInput = (event: ChangeEvent<HTMLInputElement>) => {
    void readFile(event.target.files?.[0]);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    void readFile(event.dataTransfer.files?.[0]);
  };

  const currentSheet = workbook && activeSheet ? workbook.sheets[activeSheet] : null;
  const totalRows = workbook
    ? workbook.sheetNames.reduce((sum, name) => sum + workbook.sheets[name].rows.length, 0)
    : 0;

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#upload" aria-label="Зогсоолын тайлангийн нүүр">
          <span className="brand-mark" aria-hidden="true">P</span>
          <span>
            <strong>Зогсоолын тайлан</strong>
            <small>Excel мэдээлэл харах</small>
          </span>
        </a>
        <div className="local-badge">
          <LockKeyhole size={15} aria-hidden="true" />
          Файл зөвхөн энэ төхөөрөмж дээр уншигдана
        </div>
      </header>

      <section className="workspace" id="upload">
        <div className="section-heading">
          <div>
            <p className="eyebrow">ШИНЭ ТАЙЛАН</p>
            <h1>Excel тайлангаа оруулна уу</h1>
            <p>UB Parking-оос татсан файлаа оруулаад мэдээллээ шууд шалгана.</p>
          </div>
          {uploadState === "ready" && (
            <button className="secondary-button" type="button" onClick={resetUpload}>
              <RotateCcw size={17} aria-hidden="true" />
              Өөр файл
            </button>
          )}
        </div>

        {uploadState !== "ready" && (
          <div
            className={`dropzone ${isDragging ? "is-dragging" : ""} ${uploadState === "error" ? "has-error" : ""}`}
            onDragEnter={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node)) {
                setIsDragging(false);
              }
            }}
            onDrop={handleDrop}
          >
            <input
              ref={inputRef}
              className="file-input"
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleInput}
              aria-label="Excel файл сонгох"
            />
            <div className="upload-icon" aria-hidden="true">
              {uploadState === "reading" ? <FileSpreadsheet size={30} /> : <UploadCloud size={30} />}
            </div>
            <h2>{uploadState === "reading" ? "Файлыг уншиж байна..." : "Файлаа энд чирж оруулна уу"}</h2>
            <p>
              {uploadState === "reading"
                ? "Sheet болон баганын мэдээллийг бэлдэж байна."
                : "эсвэл төхөөрөмжөөсөө файл сонгоно уу"}
            </p>
            <button
              className="primary-button"
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploadState === "reading"}
            >
              <FileUp size={18} aria-hidden="true" />
              {uploadState === "reading" ? "Түр хүлээнэ үү" : "Excel файл сонгох"}
            </button>
            <div className="file-rules">
              <span><Check size={14} aria-hidden="true" /> XLSX, XLS, CSV</span>
              <span><Check size={14} aria-hidden="true" /> Дээд хэмжээ 15 MB</span>
            </div>
            {uploadState === "error" && (
              <div className="error-message" role="alert">
                <AlertCircle size={18} aria-hidden="true" />
                <span>{error}</span>
                <button type="button" onClick={resetUpload} aria-label="Алдааг хаах">
                  <X size={17} aria-hidden="true" />
                </button>
              </div>
            )}
          </div>
        )}

        {workbook && currentSheet && uploadState === "ready" && (
          <div className="results" aria-live="polite">
            <div className="file-summary">
              <div className="file-type-icon" aria-hidden="true">
                <FileSpreadsheet size={25} />
              </div>
              <div className="file-name">
                <div>
                  <h2>{workbook.fileName}</h2>
                  <span className="success-label"><Check size={13} /> Амжилттай уншлаа</span>
                </div>
                <p>{formatFileSize(workbook.fileSize)}</p>
              </div>
            </div>

            <div className="stats-grid">
              <div className="stat-item">
                <Table2 size={20} aria-hidden="true" />
                <span>Sheet</span>
                <strong>{workbook.sheetNames.length}</strong>
              </div>
              <div className="stat-item">
                <Rows3 size={20} aria-hidden="true" />
                <span>Нийт мөр</span>
                <strong>{totalRows.toLocaleString("mn-MN")}</strong>
              </div>
              <div className="stat-item">
                <Columns3 size={20} aria-hidden="true" />
                <span>Багана</span>
                <strong>{currentSheet.columns.length}</strong>
              </div>
            </div>

            <div className="preview-panel">
              <div className="preview-toolbar">
                <div>
                  <p className="eyebrow">ӨГӨГДЛИЙН PREVIEW</p>
                  <h2>Эхний {Math.min(currentSheet.rows.length, 8)} мөр</h2>
                </div>
                {workbook.sheetNames.length > 1 && (
                  <label className="sheet-picker">
                    <span>Sheet</span>
                    <select value={activeSheet} onChange={(event) => setActiveSheet(event.target.value)}>
                      {workbook.sheetNames.map((name) => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                    <ChevronDown size={16} aria-hidden="true" />
                  </label>
                )}
              </div>

              {currentSheet.columns.length > 0 ? (
                <div
                  className="table-scroll"
                  role="region"
                  aria-label={`${activeSheet} sheet-ийн хүснэгт`}
                >
                  <table>
                    <thead>
                      <tr>
                        <th className="row-number">#</th>
                        {currentSheet.columns.map((column) => <th key={column}>{column}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {currentSheet.rows.slice(0, 8).map((row, rowIndex) => (
                        <tr key={rowIndex}>
                          <td className="row-number">{rowIndex + 1}</td>
                          {currentSheet.columns.map((column, columnIndex) => (
                            <td key={`${column}-${columnIndex}`} title={String(row[columnIndex] ?? "")}>
                              {String(row[columnIndex] ?? "") || <span className="empty-cell">-</span>}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty-sheet">Энэ sheet дотор мэдээлэл олдсонгүй.</div>
              )}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
