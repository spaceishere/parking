"use client";

import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BadgeDollarSign,
  CameraOff,
  CarFront,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Clock3,
  ExternalLink,
  Eye,
  FileCheck2,
  FileSpreadsheet,
  FileUp,
  ImageOff,
  ListChecks,
  LockKeyhole,
  ReceiptText,
  RotateCcw,
  Search,
  ShieldCheck,
  Timer,
  UploadCloud,
  WalletCards,
  Wrench,
  X,
} from "lucide-react";
import Image from "next/image";
import { useMemo, useRef, useState } from "react";
import type { ChangeEvent, DragEvent, ReactNode } from "react";
import {
  DailySummary,
  ParsedReport,
  RegistryRecord,
  RegistryStats,
  ReportType,
  dailySummary,
  isContractRecord,
  isHourlyRecord,
  meaningful,
  parseReportFile,
  registryRecords,
  registryStats,
  reportCell,
} from "./report-model";

type Reports = Partial<Record<ReportType, ParsedReport>>;
type View = "registry" | "daily" | "audit";
type FilterKey =
  | "all"
  | "hourly"
  | "contract"
  | "paid"
  | "free-under-30"
  | "free-over-30"
  | "expected-unpaid"
  | "manual-entry"
  | "manual-exit"
  | "plate-correction"
  | "missing-image"
  | "duplicate-transaction"
  | "open";
type SortKey = "newest" | "duration" | "amount";
type CustomerTypeFilter = "all" | "hourly" | "contract";

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const PAGE_SIZE = 50;
const numberFormatter = new Intl.NumberFormat("mn-MN");
const currencyFormatter = new Intl.NumberFormat("mn-MN", {
  style: "currency",
  currency: "MNT",
  maximumFractionDigits: 0,
});

const FILTER_LABELS: Record<FilterKey, string> = {
  all: "Бүх бүртгэл",
  hourly: "Цагийн төлбөртэй машин",
  contract: "Гэрээт машин",
  paid: "Төлбөр төлсөн",
  "free-under-30": "30 мин хүрээгүй, төлбөргүй",
  "free-over-30": "30+ мин, төлбөргүй",
  "expected-unpaid": "Төлбөр бодогдсон ч төлөөгүй",
  "manual-entry": "Гараар оруулсан",
  "manual-exit": "Гараар гаргасан",
  "plate-correction": "Дугаар зассан",
  "missing-image": "Гарах зураг дутуу",
  "duplicate-transaction": "Давхардсан гүйлгээ",
  open: "Гараагүй бүртгэл",
};

function formatCurrency(value: number) {
  return currencyFormatter.format(value);
}

function formatCount(value: number) {
  return numberFormatter.format(value);
}

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}ц ${rest}м` : `${hours} цаг`;
}

function displayDate(value: string) {
  if (!value) return "-";
  const parsed = new Date(value.includes(" ") ? value.replace(" ", "T") : value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("mn-MN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: value.includes(":") ? "2-digit" : undefined,
    minute: value.includes(":") ? "2-digit" : undefined,
    hour12: false,
  }).format(parsed);
}

function recordStatus(record: RegistryRecord) {
  if (!meaningful(record.exitedAt)) return { label: "Гараагүй", tone: "blue" };
  if (record.paidAmount > 0) return { label: "Төлсөн", tone: "green" };
  if (isContractRecord(record)) return { label: "Гэрээгээр", tone: "blue" };
  if (record.minutes < 30) return { label: "30 мин дотор", tone: "neutral" };
  if (Math.max(record.calculatedAmount, record.dueAmount) > 0) {
    return { label: "Төлбөргүй", tone: "red" };
  }
  return { label: "30+ мин төлбөргүй", tone: "yellow" };
}

function vehicleType(record: RegistryRecord) {
  if (isContractRecord(record)) return { label: "Гэрээт", tone: "contract" };
  if (isHourlyRecord(record)) return { label: "Цагийн", tone: "hourly" };
  return { label: record.customerType || "Тодорхойгүй", tone: "other" };
}

function matchesFilter(record: RegistryRecord, filter: FilterKey, duplicateTransactions = new Set<string>()) {
  switch (filter) {
    case "hourly":
      return isHourlyRecord(record);
    case "contract":
      return isContractRecord(record);
    case "paid":
      return record.paidAmount > 0;
    case "free-under-30":
      return isHourlyRecord(record) && record.minutes < 30 && record.paidAmount <= 0;
    case "free-over-30":
      return isHourlyRecord(record) && record.minutes >= 30 && record.paidAmount <= 0;
    case "expected-unpaid":
      return isHourlyRecord(record) && Math.max(record.calculatedAmount, record.dueAmount) > 0 && record.paidAmount <= 0;
    case "manual-entry":
      return meaningful(record.manualEntryUser) || meaningful(record.manualEntryNote);
    case "manual-exit":
      return meaningful(record.exitUser) || meaningful(record.exitType) || meaningful(record.exitNote);
    case "plate-correction":
      return meaningful(record.correctedPlate);
    case "missing-image":
      return !record.exitCarImage || !record.exitPlateImage;
    case "duplicate-transaction":
      return duplicateTransactions.has(record.transactionId);
    case "open":
      return !meaningful(record.exitedAt);
    default:
      return true;
  }
}

function MetricCard({
  label,
  value,
  note,
  icon,
  tone = "default",
  onClick,
  active = false,
}: {
  label: string;
  value: string;
  note?: string;
  icon: ReactNode;
  tone?: "default" | "success" | "warning" | "danger" | "blue";
  onClick?: () => void;
  active?: boolean;
}) {
  const content = (
    <>
      <span className="metric-icon" aria-hidden="true">{icon}</span>
      <span className="metric-label">{label}</span>
      <strong>{value}</strong>
      {note && <small>{note}</small>}
    </>
  );

  return onClick ? (
    <button className={`metric-card ${tone} ${active ? "active" : ""}`} type="button" onClick={onClick}>
      {content}
    </button>
  ) : (
    <div className={`metric-card ${tone}`}>{content}</div>
  );
}

function ReportSlot({ type, report }: { type: ReportType; report?: ParsedReport }) {
  const label = type === "registry" ? "Нийт бүртгэл тайлан" : "Өдөр тутмын тайлан";
  return (
    <div className={`report-slot ${report ? "loaded" : ""}`}>
      <span className="slot-icon" aria-hidden="true">
        {report ? <FileCheck2 size={22} /> : <FileSpreadsheet size={22} />}
      </span>
      <div>
        <strong>{label}</strong>
        <span>{report ? `${report.fileName} · ${formatFileSize(report.fileSize)}` : "Файл хүлээж байна"}</span>
      </div>
      <span className="slot-status">{report ? <Check size={16} /> : "1 файл"}</span>
    </div>
  );
}

function RegistryTable({
  records,
  report,
  selectedFilter,
  onSelect,
}: {
  records: RegistryRecord[];
  report: ParsedReport;
  selectedFilter: FilterKey;
  onSelect: (record: RegistryRecord) => void;
}) {
  const lockedCustomerType: Exclude<CustomerTypeFilter, "all"> | null = selectedFilter === "contract"
    ? "contract"
    : ["hourly", "free-under-30", "free-over-30", "expected-unpaid"].includes(selectedFilter)
      ? "hourly"
      : null;
  const [query, setQuery] = useState("");
  const [customerType, setCustomerType] = useState<CustomerTypeFilter>(lockedCustomerType ?? "all");
  const [paymentType, setPaymentType] = useState("all");
  const [sort, setSort] = useState<SortKey>("newest");
  const [page, setPage] = useState(1);
  const paymentTypes = useMemo(
    () => [...new Set(records.map((record) => record.paymentType).filter(meaningful))].sort(),
    [records],
  );
  const duplicateTransactions = useMemo(() => {
    const counts = new Map<string, number>();
    records.forEach((record) => {
      if (meaningful(record.transactionId)) {
        counts.set(record.transactionId, (counts.get(record.transactionId) ?? 0) + 1);
      }
    });
    return new Set([...counts.entries()].filter(([, count]) => count > 1).map(([transaction]) => transaction));
  }, [records]);
  const effectiveCustomerType = lockedCustomerType ?? customerType;

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return records
      .filter((record) => matchesFilter(record, selectedFilter, duplicateTransactions))
      .filter((record) => {
        if (effectiveCustomerType === "hourly") return isHourlyRecord(record);
        if (effectiveCustomerType === "contract") return isContractRecord(record);
        return true;
      })
      .filter((record) => paymentType === "all" || record.paymentType === paymentType)
      .filter((record) => {
        if (!normalizedQuery) return true;
        return [record.plate, record.transactionId, record.receiptId, record.cashier, record.exitNote]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      })
      .sort((a, b) => {
        if (sort === "duration") return b.minutes - a.minutes;
        if (sort === "amount") return b.paidAmount - a.paidAmount;
        return b.enteredAt.localeCompare(a.enteredAt);
      });
  }, [records, selectedFilter, duplicateTransactions, effectiveCustomerType, paymentType, query, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <section className="data-section">
      <div className="section-title-row">
        <div>
          <p className="eyebrow">МАШИНЫ ЖАГСААЛТ</p>
          <h2>{FILTER_LABELS[selectedFilter]}</h2>
        </div>
        <span className="result-count">{formatCount(filtered.length)} бүртгэл</span>
      </div>

      <div className="filterbar">
        <label className="search-field">
          <Search size={17} aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => { setQuery(event.target.value); setPage(1); }}
            placeholder="Машины дугаар, гүйлгээ, кассчин..."
            aria-label="Бүртгэл хайх"
          />
          {query && (
            <button type="button" onClick={() => { setQuery(""); setPage(1); }} aria-label="Хайлтыг цэвэрлэх">
              <X size={15} />
            </button>
          )}
        </label>
        <label className="select-field">
          <select
            value={effectiveCustomerType}
            disabled={Boolean(lockedCustomerType)}
            onChange={(event) => { setCustomerType(event.target.value as CustomerTypeFilter); setPage(1); }}
            aria-label="Машины төрлөөр шүүх"
          >
            <option value="all">Бүх машины төрөл</option>
            <option value="hourly">Цагийн төлбөртэй</option>
            <option value="contract">Гэрээт машин</option>
          </select>
          <ChevronDown size={16} aria-hidden="true" />
        </label>
        <label className="select-field">
          <select value={paymentType} onChange={(event) => { setPaymentType(event.target.value); setPage(1); }} aria-label="Төлбөрийн төрлөөр шүүх">
            <option value="all">Бүх төлбөрийн төрөл</option>
            {paymentTypes.map((method) => <option key={method} value={method}>{method}</option>)}
          </select>
          <ChevronDown size={16} aria-hidden="true" />
        </label>
        <label className="select-field sort-field">
          <select value={sort} onChange={(event) => { setSort(event.target.value as SortKey); setPage(1); }} aria-label="Жагсаалтыг эрэмбэлэх">
            <option value="newest">Сүүлд орсноор</option>
            <option value="duration">Удаан зогссоноор</option>
            <option value="amount">Их төлбөрөөр</option>
          </select>
          <ChevronDown size={16} aria-hidden="true" />
        </label>
      </div>

      <div className="table-frame">
        <div className="table-scroll" role="region" aria-label={`${report.title} бүртгэлийн хүснэгт`}>
          <table className="registry-table">
            <thead>
              <tr>
                <th>Машины дугаар</th>
                <th>Машины төрөл</th>
                <th>Төлөв</th>
                <th>Орсон</th>
                <th>Гарсан</th>
                <th>Хугацаа</th>
                <th className="numeric">Тооцоолсон</th>
                <th className="numeric">Төлсөн</th>
                <th>Төлбөрийн төрөл</th>
                <th>Кассчин</th>
                <th className="action-column"><span className="sr-only">Дэлгэрэнгүй</span></th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((record) => {
                const status = recordStatus(record);
                const type = vehicleType(record);
                return (
                  <tr key={record.id}>
                    <td><button className="plate-button" type="button" onClick={() => onSelect(record)}>{record.plate || "Дугааргүй"}</button></td>
                    <td><span className={`vehicle-type-chip ${type.tone}`}>{type.label}</span></td>
                    <td><span className={`status-chip ${status.tone}`}>{status.label}</span></td>
                    <td>{displayDate(record.enteredAt)}</td>
                    <td>{displayDate(record.exitedAt)}</td>
                    <td>{formatDuration(record.minutes)}</td>
                    <td className="numeric">{formatCurrency(record.calculatedAmount)}</td>
                    <td className="numeric paid-cell">{formatCurrency(record.paidAmount)}</td>
                    <td>{record.paymentType || "-"}</td>
                    <td>{record.cashier || "-"}</td>
                    <td className="action-column">
                      <button className="icon-button" type="button" onClick={() => onSelect(record)} title="Дэлгэрэнгүй харах" aria-label={`${record.plate} дэлгэрэнгүй`}>
                        <Eye size={17} />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {pageRows.length === 0 && (
                <tr><td className="empty-row" colSpan={11}>Энэ шүүлтэд тохирох бүртгэл олдсонгүй.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="pagination">
          <span>{formatCount(filtered.length)}-с {(safePage - 1) * PAGE_SIZE + (pageRows.length ? 1 : 0)}–{(safePage - 1) * PAGE_SIZE + pageRows.length}</span>
          <div>
            <button className="icon-button" type="button" disabled={safePage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} title="Өмнөх хуудас" aria-label="Өмнөх хуудас">
              <ArrowLeft size={17} />
            </button>
            <span>{safePage} / {pageCount}</span>
            <button className="icon-button" type="button" disabled={safePage >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))} title="Дараах хуудас" aria-label="Дараах хуудас">
              <ArrowRight size={17} />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function RecordDrawer({ record, report, onClose }: { record: RegistryRecord; report: ParsedReport; onClose: () => void }) {
  const images = [
    { label: "Орох үеийн машин", url: record.entryCarImage },
    { label: "Орох үеийн дугаар", url: record.entryPlateImage },
    { label: "Гарах үеийн машин", url: record.exitCarImage },
    { label: "Гарах үеийн дугаар", url: record.exitPlateImage },
  ];
  const status = recordStatus(record);
  const type = vehicleType(record);

  return (
    <div className="drawer-backdrop" role="presentation">
      <aside className="detail-drawer" aria-label={`${record.plate} дэлгэрэнгүй`}>
        <header className="drawer-header">
          <div>
            <p className="eyebrow">БҮРТГЭЛИЙН ДЭЛГЭРЭНГҮЙ</p>
            <h2>{record.plate || "Дугааргүй машин"}</h2>
            <span className={`vehicle-type-chip ${type.tone}`}>{type.label}</span>
            <span className={`status-chip ${status.tone}`}>{status.label}</span>
          </div>
          <button className="icon-button" type="button" onClick={onClose} title="Хаах" aria-label="Дэлгэрэнгүйг хаах"><X size={19} /></button>
        </header>

        <div className="drawer-content">
          <section>
            <h3>Камерын зураг</h3>
            <div className="image-grid">
              {images.map((item) => item.url ? (
                <a key={item.label} className="camera-image" href={item.url} target="_blank" rel="noreferrer">
                  <Image src={item.url} alt={item.label} width={640} height={400} unoptimized />
                  <span>{item.label}<ExternalLink size={13} /></span>
                </a>
              ) : (
                <div key={item.label} className="camera-image missing">
                  <ImageOff size={24} aria-hidden="true" />
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3>Үндсэн мэдээлэл</h3>
            <dl className="key-details">
              <div><dt>Орсон</dt><dd>{displayDate(record.enteredAt)}</dd></div>
              <div><dt>Гарсан</dt><dd>{displayDate(record.exitedAt)}</dd></div>
              <div><dt>Зогссон</dt><dd>{formatDuration(record.minutes)}</dd></div>
              <div><dt>Тооцоолсон</dt><dd>{formatCurrency(record.calculatedAmount)}</dd></div>
              <div><dt>Төлсөн</dt><dd>{formatCurrency(record.paidAmount)}</dd></div>
              <div><dt>Төлбөрийн төрөл</dt><dd>{record.paymentType || "-"}</dd></div>
            </dl>
          </section>

          {(meaningful(record.exitUser) || meaningful(record.exitType) || meaningful(record.exitNote)) && (
            <section className="manual-note">
              <h3><AlertTriangle size={16} /> Гараар гаргасан мэдээлэл</h3>
              <p>{[record.exitUser, record.exitType, record.exitNote].filter(meaningful).join(" · ")}</p>
            </section>
          )}

          <section>
            <h3>Бүх баганын мэдээлэл</h3>
            <dl className="all-details">
              {report.columns.map((column, index) => {
                const value = record.cells[index]?.display ?? "";
                if (!meaningful(value) || value === "Зураг") return null;
                return <div key={`${column}-${index}`}><dt>{column}</dt><dd>{value}</dd></div>;
              })}
            </dl>
          </section>
        </div>
      </aside>
    </div>
  );
}

function DailyView({ report, summary }: { report: ParsedReport; summary: DailySummary }) {
  const maxMethodAmount = Math.max(...summary.methods.map((method) => method.amount), 1);
  return (
    <div className="view-stack">
      <section className="metrics-grid four">
        <MetricCard label="Нийт төлбөр" value={formatCurrency(summary.totalAmount)} icon={<BadgeDollarSign size={21} />} tone="success" />
        <MetricCard label="Төлбөрийн тоо" value={formatCount(summary.paidCount)} icon={<ReceiptText size={21} />} />
        <MetricCard label="Нийт хөнгөлөлт" value={formatCurrency(summary.discountAmount)} icon={<WalletCards size={21} />} tone="blue" />
        <MetricCard label="Хөнгөлөлтийн тоо" value={formatCount(summary.discountCount)} icon={<ListChecks size={21} />} />
      </section>

      <section className="split-section">
        <div className="section-block payment-breakdown">
          <div className="section-title-row compact">
            <div><p className="eyebrow">ТӨЛБӨРИЙН СУВАГ</p><h2>Орлогын задаргаа</h2></div>
          </div>
          <div className="method-list">
            {summary.methods.map((method) => (
              <div className="method-row" key={method.name}>
                <div><strong>{method.name}</strong><span>{formatCount(method.count)} төлөлт</span></div>
                <strong>{formatCurrency(method.amount)}</strong>
                <span className="bar-track"><span style={{ width: `${(method.amount / maxMethodAmount) * 100}%` }} /></span>
              </div>
            ))}
          </div>
        </div>

        <div className="section-block daily-locations">
          <div className="section-title-row compact">
            <div><p className="eyebrow">БАЙРШИЛ</p><h2>Зогсоолын нэгтгэл</h2></div>
          </div>
          <div className="location-list">
            {summary.parkingRows.map((row, index) => (
              <div className="location-row" key={index}>
                <div><strong>{reportCell(report, row, "Зогсоолын нэр")?.display || "Зогсоол"}</strong><span>{reportCell(report, row, "Бүсийн нэр")?.display || "-"}</span></div>
                <div><strong>{formatCurrency(Number(reportCell(report, row, "Нийт төлбөр")?.raw) || 0)}</strong><span>{formatCount(Number(reportCell(report, row, "Нийт төлсөн тоо")?.raw) || 0)} төлөлт</span></div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function AuditView({
  stats,
  daily,
  onOpenFilter,
  samePeriod,
}: {
  stats: RegistryStats;
  daily: DailySummary;
  onOpenFilter: (filter: FilterKey) => void;
  samePeriod: boolean;
}) {
  const amountDifference = stats.totalRevenue - daily.totalAmount;
  const countDifference = stats.paidVisits - daily.paidCount;
  const reconciled = Math.abs(amountDifference) < 1 && countDifference === 0 && samePeriod;
  const checks: Array<{ label: string; value: number; filter: FilterKey; tone: string; note: string }> = [
    { label: "30 мин хүрээгүй, төлбөргүй", value: stats.freeUnder30, filter: "free-under-30", tone: "neutral", note: "Зөвхөн цагийн машин" },
    { label: "30+ мин, төлбөргүй", value: stats.freeOver30, filter: "free-over-30", tone: "warning", note: "Зөвхөн цагийн машин" },
    { label: "Төлбөр бодогдсон ч төлөөгүй", value: stats.expectedButUnpaid, filter: "expected-unpaid", tone: "danger", note: "Зөвхөн цагийн машин" },
    { label: "Гараар оруулсан", value: stats.manualEntries, filter: "manual-entry", tone: "blue", note: "Хэрэглэгч эсвэл тайлбартай" },
    { label: "Гараар гаргасан", value: stats.manualExits, filter: "manual-exit", tone: "blue", note: "Хэрэглэгч, төрөл, тайлбартай" },
    { label: "Дугаар зассан", value: stats.plateCorrections, filter: "plate-correction", tone: "blue", note: "Засалтын мөрүүд" },
    { label: "Гарах зураг дутуу", value: stats.missingExitImage, filter: "missing-image", tone: "warning", note: "Машин эсвэл дугаарын зураг" },
    { label: "Гараагүй бүртгэл", value: stats.openVisits, filter: "open", tone: "warning", note: "Гарсан огноо хоосон" },
    { label: "Давхардсан гүйлгээ", value: stats.duplicateTransactions, filter: "duplicate-transaction", tone: "danger", note: "Ижил гүйлгээний дугаар 2+ удаа" },
  ];

  return (
    <div className="view-stack">
      <section className={`reconciliation ${reconciled ? "matched" : "mismatch"}`}>
        <span className="reconcile-icon" aria-hidden="true">{reconciled ? <ShieldCheck size={25} /> : <CircleAlert size={25} />}</span>
        <div>
          <p className="eyebrow">ХОЁР ТАЙЛАНГИЙН ТУЛГАЛТ</p>
          <h2>{reconciled ? "Орлого ба төлөлтийн тоо таарч байна" : "Тайлан хооронд зөрүү байна"}</h2>
          <p>{samePeriod ? "Ижил хугацааны тайлан" : "Файлуудын эхлэх/дуусах огноо өөр байна"}</p>
        </div>
        <dl>
          <div><dt>Орлогын зөрүү</dt><dd>{formatCurrency(amountDifference)}</dd></div>
          <div><dt>Төлөлтийн тооны зөрүү</dt><dd>{formatCount(countDifference)}</dd></div>
        </dl>
      </section>

      <section className="audit-section">
        <div className="section-title-row">
          <div><p className="eyebrow">ШАЛГАХ МЭДЭЭЛЭЛ</p><h2>Анхаарах болон лавлах бүртгэл</h2></div>
        </div>
        <div className="audit-list">
          {checks.map((check) => (
            <button className={`audit-row ${check.tone}`} type="button" key={check.filter} onClick={() => onOpenFilter(check.filter)}>
              <span className="audit-dot" />
              <span><strong>{check.label}</strong><small>{check.note}</small></span>
              <b>{formatCount(check.value)}</b>
              <ArrowRight size={18} aria-hidden="true" />
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

export function ExcelUploader() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [reports, setReports] = useState<Reports>({});
  const [isDragging, setIsDragging] = useState(false);
  const [isReading, setIsReading] = useState(false);
  const [error, setError] = useState("");
  const [activeView, setActiveView] = useState<View>("registry");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [selectedRecord, setSelectedRecord] = useState<RegistryRecord | null>(null);

  const registryReport = reports.registry;
  const dailyReport = reports.daily;
  const ready = Boolean(registryReport && dailyReport);
  const records = useMemo(() => registryReport ? registryRecords(registryReport) : [], [registryReport]);
  const stats = useMemo(() => registryStats(records), [records]);
  const daily = useMemo(() => dailyReport ? dailySummary(dailyReport) : null, [dailyReport]);
  const samePeriod = Boolean(
    registryReport && dailyReport &&
    registryReport.startDate === dailyReport.startDate &&
    registryReport.endDate === dailyReport.endDate,
  );

  const reset = () => {
    setReports({});
    setError("");
    setFilter("all");
    setActiveView("registry");
    setSelectedRecord(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const readFiles = async (files: File[]) => {
    const selected = files.filter((file) => file.name.toLowerCase().endsWith(".xlsx") || file.name.toLowerCase().endsWith(".xls"));
    if (!selected.length) {
      setError("Зөвхөн UB Parking-оос татсан .xlsx эсвэл .xls файл оруулна уу.");
      return;
    }
    if (selected.some((file) => file.size > MAX_FILE_SIZE)) {
      setError("Нэг файлын хэмжээ 25 MB-аас их байна.");
      return;
    }

    setIsReading(true);
    setError("");
    try {
      const parsed = await Promise.all(selected.map(parseReportFile));
      setReports((current) => {
        const next = { ...current };
        parsed.forEach((report) => { next[report.type] = report; });
        return next;
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Файлыг уншиж чадсангүй.");
    } finally {
      setIsReading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleInput = (event: ChangeEvent<HTMLInputElement>) => {
    void readFiles(Array.from(event.target.files ?? []));
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    void readFiles(Array.from(event.dataTransfer.files));
  };

  const openFiltered = (nextFilter: FilterKey) => {
    setFilter(nextFilter);
    setActiveView("registry");
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#main" aria-label="Зогсоолын хяналтын нүүр">
          <span className="brand-mark" aria-hidden="true">P</span>
          <span><strong>Зогсоолын хяналт</strong><small>UB Parking тайлан шалгах</small></span>
        </a>
        {ready ? (
          <div className="topbar-actions">
            <span className="period-label"><Clock3 size={15} />{registryReport?.startDate} – {registryReport?.endDate}</span>
            <button className="secondary-button" type="button" onClick={() => inputRef.current?.click()}><RotateCcw size={16} />Файл солих</button>
          </div>
        ) : (
          <div className="local-badge"><LockKeyhole size={15} />Файл local төхөөрөмж дээр уншигдана</div>
        )}
        <input ref={inputRef} className="file-input" type="file" accept=".xlsx,.xls" multiple onChange={handleInput} aria-label="UB Parking тайлан сонгох" />
      </header>

      {!ready ? (
        <section className="upload-workspace" id="main">
          <div className="upload-heading">
            <p className="eyebrow">2 ТАЙЛАН ОРУУЛАХ</p>
            <h1>UB Parking тайлангаа шалгах</h1>
            <p>“Нийт бүртгэл” болон “Өдөр тутмын” Excel файлаа сонгоно.</p>
          </div>
          <div
            className={`upload-zone ${isDragging ? "dragging" : ""}`}
            onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setIsDragging(false); }}
            onDrop={handleDrop}
          >
            <span className="upload-icon" aria-hidden="true">{isReading ? <FileSpreadsheet size={30} /> : <UploadCloud size={30} />}</span>
            <div><h2>{isReading ? "Тайланг уншиж байна..." : "2 Excel файлаа энд чирнэ үү"}</h2><p>XLSX эсвэл XLS · файл тус бүр 25 MB хүртэл</p></div>
            <button className="primary-button" type="button" disabled={isReading} onClick={() => inputRef.current?.click()}><FileUp size={18} />{isReading ? "Түр хүлээнэ үү" : "Файл сонгох"}</button>
          </div>
          <div className="report-slots">
            <ReportSlot type="registry" report={registryReport} />
            <ReportSlot type="daily" report={dailyReport} />
          </div>
          {error && <div className="error-message" role="alert"><CircleAlert size={18} /><span>{error}</span><button type="button" onClick={() => setError("")} aria-label="Алдааг хаах"><X size={16} /></button></div>}
          {(registryReport || dailyReport) && <button className="text-button" type="button" onClick={reset}>Оруулсан файлуудыг цэвэрлэх</button>}
        </section>
      ) : (
        <div className="dashboard" id="main">
          <div className="dashboard-heading">
            <div><p className="eyebrow">{registryReport?.startDate} – {registryReport?.endDate}</p><h1>Тайлангийн хяналт</h1><p>{registryReport?.fileName} · {dailyReport?.fileName}</p></div>
            <span className={`match-badge ${samePeriod ? "success" : "warning"}`}>{samePeriod ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}{samePeriod ? "Ижил хугацааны файл" : "Огноо зөрүүтэй"}</span>
          </div>

          <nav className="view-tabs" aria-label="Тайлангийн харагдац">
            <button type="button" className={activeView === "registry" ? "active" : ""} onClick={() => setActiveView("registry")}><CarFront size={17} />Нийт бүртгэл</button>
            <button type="button" className={activeView === "daily" ? "active" : ""} onClick={() => setActiveView("daily")}><BadgeDollarSign size={17} />Өдрийн нэгтгэл</button>
            <button type="button" className={activeView === "audit" ? "active" : ""} onClick={() => setActiveView("audit")}><ShieldCheck size={17} />Шалгалт</button>
          </nav>

          {activeView === "registry" && registryReport && (
            <div className="view-stack">
              <section className="metrics-grid eight">
                <MetricCard label="Нийт машин" value={formatCount(stats.totalVisits)} note={`Дундаж ${formatDuration(stats.averageMinutes)}`} icon={<CarFront size={21} />} onClick={() => openFiltered("all")} active={filter === "all"} />
                <MetricCard label="Цагийн төлбөртэй" value={formatCount(stats.hourlyVisits)} note="Үйлчлүүлэгчийн төрөл: Цаг" icon={<Clock3 size={21} />} onClick={() => openFiltered("hourly")} active={filter === "hourly"} />
                <MetricCard label="Гэрээт машин" value={formatCount(stats.contractVisits)} note="Үйлчлүүлэгчийн төрөл: Гэрээ" icon={<FileCheck2 size={21} />} tone="blue" onClick={() => openFiltered("contract")} active={filter === "contract"} />
                <MetricCard label="Нийт төлсөн" value={formatCurrency(stats.totalRevenue)} note={`${formatCount(stats.paidVisits)} төлөлт`} icon={<BadgeDollarSign size={21} />} tone="success" onClick={() => openFiltered("paid")} active={filter === "paid"} />
                <MetricCard label="30 мин хүрээгүй" value={formatCount(stats.freeUnder30)} note="Цагийн машин, төлбөргүй" icon={<Timer size={21} />} onClick={() => openFiltered("free-under-30")} active={filter === "free-under-30"} />
                <MetricCard label="30+ мин төлбөргүй" value={formatCount(stats.freeOver30)} note="Зөвхөн цагийн машин" icon={<CircleAlert size={21} />} tone="warning" onClick={() => openFiltered("free-over-30")} active={filter === "free-over-30"} />
                <MetricCard label="Гараар гаргасан" value={formatCount(stats.manualExits)} note="Тайлбартай мөр" icon={<Wrench size={21} />} tone="blue" onClick={() => openFiltered("manual-exit")} active={filter === "manual-exit"} />
                <MetricCard label="Зураг дутуу" value={formatCount(stats.missingExitImage)} note="Гарах үеийн зураг" icon={<CameraOff size={21} />} tone="danger" onClick={() => openFiltered("missing-image")} active={filter === "missing-image"} />
              </section>
              <RegistryTable key={filter} records={records} report={registryReport} selectedFilter={filter} onSelect={setSelectedRecord} />
            </div>
          )}

          {activeView === "daily" && dailyReport && daily && <DailyView report={dailyReport} summary={daily} />}
          {activeView === "audit" && daily && <AuditView stats={stats} daily={daily} samePeriod={samePeriod} onOpenFilter={openFiltered} />}
        </div>
      )}

      {selectedRecord && registryReport && <RecordDrawer record={selectedRecord} report={registryReport} onClose={() => setSelectedRecord(null)} />}
    </main>
  );
}
