"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronDown,
  CircleAlert,
  ClipboardCheck,
  Eye,
  FileSpreadsheet,
  FileUp,
  Layers3,
  ListChecks,
  LockKeyhole,
  RotateCcw,
  Search,
  ShieldCheck,
  UploadCloud,
  Users,
  X,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import type { ChangeEvent, DragEvent, ReactNode } from "react";
import {
  FormRecord,
  FormReport,
  attentionItems,
  formSummary,
  parseFormReportFile,
} from "./form-report-model";

type PeriodFilter = "all" | "7" | "30" | "90";
type ChartDatum = { name: string; value: number };

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const PAGE_SIZE = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const CHART_COLORS = ["#0d6b45", "#1769aa", "#e0a800", "#b42318", "#4d7c6b", "#6d8797"];
const numberFormatter = new Intl.NumberFormat("mn-MN");
const dateTimeFormatter = new Intl.DateTimeFormat("mn-MN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
});
const dateFormatter = new Intl.DateTimeFormat("mn-MN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "UTC",
});

function formatCount(value: number) {
  return numberFormatter.format(value);
}

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(timestamp: number, fallback = "-") {
  return timestamp ? dateTimeFormatter.format(new Date(timestamp)) : fallback;
}

function formatDateKey(value: string) {
  if (!value) return "-";
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isNaN(timestamp) ? value : dateFormatter.format(new Date(timestamp));
}

function formatDuration(seconds: number) {
  if (!seconds) return "-";
  if (seconds < 60) return `${seconds} сек`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${minutes} мин ${rest} сек` : `${minutes} мин`;
}

function ranked(values: string[], limit?: number): ChartDatum[] {
  const counts = new Map<string, number>();
  values.filter(Boolean).forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  const result = [...counts.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
  return typeof limit === "number" ? result.slice(0, limit) : result;
}

function trendData(records: FormRecord[]) {
  const timestamps = records.map((record) => record.startedTimestamp).filter(Boolean);
  const spanDays = timestamps.length ? (Math.max(...timestamps) - Math.min(...timestamps)) / DAY_MS : 0;
  const monthly = spanDays > 70;
  const counts = new Map<string, number>();
  records.forEach((record) => {
    if (!record.dateKey) return;
    const key = monthly ? record.dateKey.slice(0, 7) : record.dateKey;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => ({
    name: monthly ? key.replace("-", ".") : key.slice(5).replace("-", "/"),
    value,
  }));
}

function FormMetric({
  label,
  value,
  note,
  icon,
  tone = "default",
}: {
  label: string;
  value: string;
  note?: string;
  icon: ReactNode;
  tone?: "default" | "success" | "warning" | "danger" | "blue";
}) {
  return (
    <div className={`metric-card ${tone}`}>
      <span className="metric-icon" aria-hidden="true">{icon}</span>
      <span className="metric-label">{label}</span>
      <strong>{value}</strong>
      {note && <small>{note}</small>}
    </div>
  );
}

function ChartPanel({ eyebrow, title, className = "", children }: { eyebrow: string; title: string; className?: string; children: ReactNode }) {
  return (
    <section className={`chart-panel ${className}`}>
      <div className="section-title-row compact">
        <div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2></div>
      </div>
      <div className="chart-canvas">{children}</div>
    </section>
  );
}

function EmptyChart() {
  return <div className="empty-chart"><ListChecks size={23} /><span>Харуулах мэдээлэл алга</span></div>;
}

function FormRecordDrawer({ record, onClose }: { record: FormRecord; onClose: () => void }) {
  const issues = attentionItems(record);
  const facilityChecks = [
    ["B1 зогсоол", record.b1],
    ["Аваарын шат", record.emergencyStairs],
    ["Урсдаг шат", record.escalator],
  ];
  const restroomChecks = [
    ["Байршил", record.restroomLocation],
    ["00 цаас", record.toiletPaper],
    ["Гарын саван", record.soap],
    ["Хогийн сав", record.trash],
    ["Үнэр, агааржуулалт", record.odor],
    ["Толь", record.mirror],
    ["Суултуур", record.toilet],
    ["Угаалтуур, цорго", record.sink],
  ];

  return (
    <div className="drawer-backdrop" role="presentation">
      <aside className="detail-drawer form-detail-drawer" aria-label={`${record.worker} хяналтын дэлгэрэнгүй`}>
        <header className="drawer-header">
          <div>
            <p className="eyebrow">FORM БҮРТГЭЛИЙН ДЭЛГЭРЭНГҮЙ</p>
            <h2>{record.worker}</h2>
            <span className="status-chip blue">{record.floor}</span>
            <span className={`status-chip ${issues.length ? "red" : "green"}`}>{issues.length ? `${issues.length} анхаарах` : "Хэвийн"}</span>
          </div>
          <button className="icon-button" type="button" onClick={onClose} title="Хаах" aria-label="Дэлгэрэнгүйг хаах"><X size={19} /></button>
        </header>

        <div className="drawer-content">
          <section>
            <h3>Үндсэн мэдээлэл</h3>
            <dl className="key-details">
              <div><dt>Эхэлсэн</dt><dd>{formatDate(record.startedTimestamp, record.startedAt)}</dd></div>
              <div><dt>Дууссан</dt><dd>{formatDate(record.completedTimestamp, record.completedAt)}</dd></div>
              <div><dt>Бөглөсөн хугацаа</dt><dd>{formatDuration(record.durationSeconds)}</dd></div>
              <div><dt>Цэвэрлэгээ</dt><dd>{record.cleaningType}</dd></div>
              <div><dt>Үндсэн давхар</dt><dd>{record.floor}</dd></div>
              <div><dt>ХАБЭА</dt><dd>{record.safety || "-"}</dd></div>
            </dl>
          </section>

          {issues.length > 0 && (
            <section className="manual-note form-attention-note">
              <h3><CircleAlert size={16} /> Анхаарах хариулт</h3>
              <p>{issues.join(" · ")}</p>
            </section>
          )}

          <section>
            <h3>Хийсэн ажлууд</h3>
            <div className="task-groups">
              {record.taskGroups.map((group) => (
                <div className="task-group" key={group.floor}>
                  <strong>{group.floor}</strong>
                  <div className="task-chips">{group.tasks.map((task) => <span key={task}>{task}</span>)}</div>
                </div>
              ))}
              {record.taskGroups.length === 0 && <p className="muted-copy">Ажлын сонголт бөглөөгүй.</p>}
            </div>
          </section>

          <section>
            <h3>Нэмэлт ажлын мэдээлэл</h3>
            <dl className="all-details compact-details">
              <div><dt>Нэмэлт давхар</dt><dd>{record.extraWork || "-"}</dd></div>
              <div><dt>Ажилласан давхар</dt><dd>{record.extraFloor || "-"}</dd></div>
              {facilityChecks.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || "-"}</dd></div>)}
            </dl>
          </section>

          <section>
            <h3>Ариун цэврийн өрөөний хяналт</h3>
            <dl className="all-details compact-details">
              {restroomChecks.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || "-"}</dd></div>)}
            </dl>
          </section>

          <section>
            <h3>Excel-ийн бүх бөглөсөн хариулт</h3>
            <dl className="all-details">
              {record.answers.map((answer, index) => (
                <div key={`${answer.label}-${index}`}><dt>{answer.label}</dt><dd>{answer.value}</dd></div>
              ))}
            </dl>
          </section>
        </div>
      </aside>
    </div>
  );
}

export function FormDashboard({ onBack }: { onBack?: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [report, setReport] = useState<FormReport | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isReading, setIsReading] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [period, setPeriod] = useState<PeriodFilter>("all");
  const [worker, setWorker] = useState("all");
  const [floor, setFloor] = useState("all");
  const [cleaningType, setCleaningType] = useState("all");
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [selectedRecord, setSelectedRecord] = useState<FormRecord | null>(null);

  const records = useMemo(() => report?.records ?? [], [report]);
  const workers = useMemo(() => [...new Set(records.map((record) => record.worker))].sort(), [records]);
  const floors = useMemo(() => [...new Set(records.map((record) => record.floor))].sort(), [records]);
  const cleaningTypes = useMemo(() => [...new Set(records.map((record) => record.cleaningType))].sort(), [records]);
  const latestTimestamp = useMemo(() => Math.max(...records.map((record) => record.startedTimestamp), 0), [records]);

  const filteredRecords = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const cutoff = period === "all" ? 0 : latestTimestamp - (Number(period) - 1) * DAY_MS;
    return records.filter((record) => {
      if (cutoff && record.startedTimestamp < cutoff) return false;
      if (worker !== "all" && record.worker !== worker) return false;
      if (floor !== "all" && record.floor !== floor) return false;
      if (cleaningType !== "all" && record.cleaningType !== cleaningType) return false;
      if (attentionOnly && attentionItems(record).length === 0) return false;
      if (!normalizedQuery) return true;
      return [record.worker, record.floor, record.cleaningType, record.extraFloor, ...record.tasks]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    }).sort((a, b) => b.startedTimestamp - a.startedTimestamp || b.sourceRow - a.sourceRow);
  }, [attentionOnly, cleaningType, floor, latestTimestamp, period, query, records, worker]);

  const summary = useMemo(() => formSummary(filteredRecords), [filteredRecords]);
  const employeeData = useMemo(() => ranked(filteredRecords.map((record) => record.worker), 10), [filteredRecords]);
  const floorData = useMemo(() => ranked(filteredRecords.map((record) => record.floor)), [filteredRecords]);
  const cleaningTypeData = useMemo(() => ranked(filteredRecords.map((record) => record.cleaningType)), [filteredRecords]);
  const taskData = useMemo(() => ranked(filteredRecords.flatMap((record) => record.tasks), 10), [filteredRecords]);
  const issueData = useMemo(() => ranked(filteredRecords.flatMap(attentionItems)), [filteredRecords]);
  const submissionsTrend = useMemo(() => trendData(filteredRecords), [filteredRecords]);
  const pageCount = Math.max(1, Math.ceil(filteredRecords.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = filteredRecords.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const resetFilters = () => {
    setQuery("");
    setPeriod("all");
    setWorker("all");
    setFloor("all");
    setCleaningType("all");
    setAttentionOnly(false);
    setPage(1);
  };

  const readFile = async (file?: File) => {
    if (!file || !/\.xlsx?$/i.test(file.name)) {
      setError("Өдөр тутмын хяналтын .xlsx эсвэл .xls файл сонгоно уу.");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError("Файлын хэмжээ 25 MB-аас их байна.");
      return;
    }
    setIsReading(true);
    setError("");
    try {
      setReport(await parseFormReportFile(file));
      resetFilters();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Файлыг уншиж чадсангүй.");
    } finally {
      setIsReading(false);
      if (inputRef.current) inputRef.current.value = "";
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

  return (
    <main className="app-shell form-shell">
      <header className="topbar">
        <button className="brand brand-button" type="button" onClick={onBack} aria-label="Тайлангийн сонголт руу буцах">
          <span className="brand-mark form-mark" aria-hidden="true">F</span>
          <span><strong>Өдөр тутмын хяналт</strong><small>Forms тайлан шинжлэх</small></span>
        </button>
        {report ? (
          <div className="topbar-actions">
            <span className="period-label"><CalendarDays size={15} />{formatDateKey(report.startDate)} – {formatDateKey(report.endDate)}</span>
            <button className="secondary-button" type="button" onClick={() => inputRef.current?.click()}><RotateCcw size={16} />Файл солих</button>
          </div>
        ) : (
          <div className="local-badge"><LockKeyhole size={15} />Файл төхөөрөмж дээр уншигдана</div>
        )}
        <input ref={inputRef} className="file-input" type="file" accept=".xlsx,.xls" onChange={handleInput} aria-label="Өдөр тутмын хяналтын тайлан сонгох" />
      </header>

      {!report ? (
        <section className="upload-workspace" id="main">
          <div className="upload-heading">
            <p className="eyebrow">FORM ТАЙЛАН ОРУУЛАХ</p>
            <h1>Өдөр тутмын хяналтаа шинжлэх</h1>
            <p>Microsoft Forms-оос татсан хяналтын Excel файлаа сонгоно.</p>
          </div>
          <div
            className={`upload-zone single-upload ${isDragging ? "dragging" : ""}`}
            onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setIsDragging(false); }}
            onDrop={handleDrop}
          >
            <span className="upload-icon" aria-hidden="true">{isReading ? <FileSpreadsheet size={30} /> : <UploadCloud size={30} />}</span>
            <div><h2>{isReading ? "Хяналтын мэдээллийг уншиж байна..." : "Form Excel файлаа энд чирнэ үү"}</h2><p>XLSX эсвэл XLS · 25 MB хүртэл</p></div>
            <button className="primary-button" type="button" disabled={isReading} onClick={() => inputRef.current?.click()}><FileUp size={18} />{isReading ? "Түр хүлээнэ үү" : "Файл сонгох"}</button>
          </div>
          {error && <div className="error-message" role="alert"><CircleAlert size={18} /><span>{error}</span><button type="button" onClick={() => setError("")} aria-label="Алдааг хаах"><X size={16} /></button></div>}
        </section>
      ) : (
        <div className="dashboard form-dashboard" id="main">
          <div className="dashboard-heading">
            <div><p className="eyebrow">{formatDateKey(report.startDate)} – {formatDateKey(report.endDate)}</p><h1>Өдөр тутмын хяналтын тайлан</h1><p>{report.fileName} · {formatFileSize(report.fileSize)}</p></div>
            <span className="match-badge success"><Check size={16} />{formatCount(report.records.length)} мөр уншсан</span>
          </div>

          <section className="form-filterbar" aria-label="Form тайлангийн шүүлтүүр">
            <label className="search-field">
              <Search size={17} aria-hidden="true" />
              <input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Ажилтан, давхар, хийсэн ажил..." aria-label="Form бүртгэл хайх" />
              {query && <button type="button" onClick={() => { setQuery(""); setPage(1); }} aria-label="Хайлтыг цэвэрлэх"><X size={15} /></button>}
            </label>
            <label className="select-field">
              <select value={period} onChange={(event) => { setPeriod(event.target.value as PeriodFilter); setPage(1); }} aria-label="Хугацаагаар шүүх">
                <option value="all">Бүх хугацаа</option><option value="7">Сүүлийн 7 хоног</option><option value="30">Сүүлийн 30 хоног</option><option value="90">Сүүлийн 90 хоног</option>
              </select><ChevronDown size={16} aria-hidden="true" />
            </label>
            <label className="select-field">
              <select value={worker} onChange={(event) => { setWorker(event.target.value); setPage(1); }} aria-label="Ажилтнаар шүүх">
                <option value="all">Бүх ажилтан</option>{workers.map((name) => <option key={name} value={name}>{name}</option>)}
              </select><ChevronDown size={16} aria-hidden="true" />
            </label>
            <label className="select-field">
              <select value={floor} onChange={(event) => { setFloor(event.target.value); setPage(1); }} aria-label="Давхраар шүүх">
                <option value="all">Бүх давхар</option>{floors.map((name) => <option key={name} value={name}>{name}</option>)}
              </select><ChevronDown size={16} aria-hidden="true" />
            </label>
            <label className="select-field">
              <select value={cleaningType} onChange={(event) => { setCleaningType(event.target.value); setPage(1); }} aria-label="Цэвэрлэгээний төрлөөр шүүх">
                <option value="all">Бүх төрөл</option>{cleaningTypes.map((name) => <option key={name} value={name}>{name}</option>)}
              </select><ChevronDown size={16} aria-hidden="true" />
            </label>
            <label className="attention-toggle">
              <input type="checkbox" checked={attentionOnly} onChange={(event) => { setAttentionOnly(event.target.checked); setPage(1); }} />
              <span className="toggle-box" aria-hidden="true">{attentionOnly && <Check size={13} />}</span>
              <span>Анхаарах</span>
            </label>
          </section>

          <section className="metrics-grid form-metrics">
            <FormMetric label="Нийт бүртгэл" value={formatCount(summary.totalRecords)} note="Одоогийн шүүлт" icon={<ClipboardCheck size={21} />} />
            <FormMetric label="Ажилтан" value={formatCount(summary.uniqueWorkers)} note="Давхардалгүй" icon={<Users size={21} />} tone="blue" />
            <FormMetric label="ХАБЭА танилцсан" value={`${summary.safetyRate}%`} note={`${formatCount(summary.safetyNo)} үгүй хариулт`} icon={<ShieldCheck size={21} />} tone={summary.safetyNo ? "warning" : "success"} />
            <FormMetric label="Үндсэн цэвэрлэгээ" value={formatCount(summary.mainCleaning)} note="Бүртгэлийн тоо" icon={<Layers3 size={21} />} tone="success" />
            <FormMetric label="Нэмэлт давхар" value={formatCount(summary.extraWork)} note={`${formatCount(summary.restroomChecks)} 00 хяналт`} icon={<ListChecks size={21} />} />
            <FormMetric label="Анхаарах бүртгэл" value={formatCount(summary.attentionRecords)} note="Хариултаар илэрсэн" icon={<CircleAlert size={21} />} tone={summary.attentionRecords ? "danger" : "success"} />
          </section>

          {filteredRecords.length > 0 ? (
            <section className="form-chart-grid">
              <ChartPanel eyebrow="ХУГАЦААНЫ ХАНДЛАГА" title="Бүртгэлийн тоо" className="wide-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={submissionsTrend} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                    <defs><linearGradient id="submissionFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0d6b45" stopOpacity={0.32} /><stop offset="100%" stopColor="#0d6b45" stopOpacity={0.03} /></linearGradient></defs>
                    <CartesianGrid stroke="#e4eae6" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#657169" }} tickLine={false} axisLine={false} minTickGap={24} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "#657169" }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ border: "1px solid #d9e0dc", borderRadius: 6, fontSize: 12 }} />
                    <Area type="monotone" dataKey="value" name="Бүртгэл" stroke="#0d6b45" strokeWidth={2} fill="url(#submissionFill)" />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartPanel>

              <ChartPanel eyebrow="АЖИЛТАН" title="Бүртгэлээр тэргүүлсэн ажилтан">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={employeeData} layout="vertical" margin={{ top: 0, right: 12, left: 8, bottom: 0 }}>
                    <CartesianGrid stroke="#e4eae6" horizontal={false} />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10, fill: "#657169" }} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="name" width={84} tick={{ fontSize: 10, fill: "#34443b" }} tickLine={false} axisLine={false} />
                    <Tooltip cursor={{ fill: "#f2f5f2" }} contentStyle={{ border: "1px solid #d9e0dc", borderRadius: 6, fontSize: 12 }} />
                    <Bar dataKey="value" name="Бүртгэл" fill="#1769aa" radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartPanel>

              <ChartPanel eyebrow="ДАВХАР" title="Үндсэн ажлын байршил">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={floorData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                    <CartesianGrid stroke="#e4eae6" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#657169" }} tickLine={false} axisLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "#657169" }} tickLine={false} axisLine={false} />
                    <Tooltip cursor={{ fill: "#f2f5f2" }} contentStyle={{ border: "1px solid #d9e0dc", borderRadius: 6, fontSize: 12 }} />
                    <Bar dataKey="value" name="Бүртгэл" fill="#0d6b45" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartPanel>

              <ChartPanel eyebrow="ЦЭВЭРЛЭГЭЭНИЙ ТӨРӨЛ" title="Ажлын төрлийн харьцаа">
                <div className="pie-layout">
                  <div className="pie-chart">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={cleaningTypeData} dataKey="value" nameKey="name" innerRadius={54} outerRadius={86} paddingAngle={2}>
                          {cleaningTypeData.map((entry, index) => <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}
                        </Pie>
                        <Tooltip contentStyle={{ border: "1px solid #d9e0dc", borderRadius: 6, fontSize: 12 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="chart-legend">
                    {cleaningTypeData.map((entry, index) => <div key={entry.name}><span style={{ background: CHART_COLORS[index % CHART_COLORS.length] }} /><strong>{entry.name}</strong><b>{formatCount(entry.value)}</b></div>)}
                  </div>
                </div>
              </ChartPanel>

              <ChartPanel eyebrow="ХИЙСЭН АЖИЛ" title="Хамгийн олон сонгогдсон ажил">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={taskData} layout="vertical" margin={{ top: 0, right: 12, left: 36, bottom: 0 }}>
                    <CartesianGrid stroke="#e4eae6" horizontal={false} />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10, fill: "#657169" }} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="name" width={138} tick={{ fontSize: 9, fill: "#34443b" }} tickLine={false} axisLine={false} />
                    <Tooltip cursor={{ fill: "#f2f5f2" }} contentStyle={{ border: "1px solid #d9e0dc", borderRadius: 6, fontSize: 12 }} />
                    <Bar dataKey="value" name="Сонгосон" fill="#4d7c6b" radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartPanel>

              <ChartPanel eyebrow="АНХААРАХ ХАРИУЛТ" title="Шалгах шаардлагатай үзүүлэлт">
                {issueData.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={issueData} layout="vertical" margin={{ top: 0, right: 12, left: 20, bottom: 0 }}>
                      <CartesianGrid stroke="#e4eae6" horizontal={false} />
                      <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10, fill: "#657169" }} tickLine={false} axisLine={false} />
                      <YAxis type="category" dataKey="name" width={108} tick={{ fontSize: 10, fill: "#34443b" }} tickLine={false} axisLine={false} />
                      <Tooltip cursor={{ fill: "#fff0ee" }} contentStyle={{ border: "1px solid #efd1cc", borderRadius: 6, fontSize: 12 }} />
                      <Bar dataKey="value" name="Бүртгэл" fill="#b42318" radius={[0, 3, 3, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <EmptyChart />}
              </ChartPanel>
            </section>
          ) : (
            <div className="no-results"><CircleAlert size={22} /><strong>Энэ шүүлтэд тохирох бүртгэл олдсонгүй.</strong><button className="text-button" type="button" onClick={resetFilters}>Шүүлтүүр цэвэрлэх</button></div>
          )}

          <section className="data-section form-records-section">
            <div className="section-title-row">
              <div><p className="eyebrow">FORM БҮРТГЭЛ</p><h2>Хяналтын дэлгэрэнгүй жагсаалт</h2></div>
              <span className="result-count">{formatCount(filteredRecords.length)} бүртгэл</span>
            </div>
            <div className="table-frame">
              <div className="table-scroll" role="region" aria-label="Өдөр тутмын хяналтын бүртгэлийн хүснэгт">
                <table className="form-table">
                  <thead><tr><th>Огноо</th><th>Ажилтан</th><th>Давхар</th><th>Цэвэрлэгээний төрөл</th><th className="numeric">Хийсэн ажил</th><th>Нэмэлт давхар</th><th>ХАБЭА</th><th>Төлөв</th><th className="action-column"><span className="sr-only">Дэлгэрэнгүй</span></th></tr></thead>
                  <tbody>
                    {pageRows.map((record) => {
                      const issues = attentionItems(record);
                      return (
                        <tr key={`${record.id}-${record.sourceRow}`}>
                          <td>{formatDate(record.startedTimestamp, record.startedAt)}</td>
                          <td><button className="plate-button form-name-button" type="button" onClick={() => setSelectedRecord(record)}>{record.worker}</button></td>
                          <td>{record.floor}</td>
                          <td>{record.cleaningType}</td>
                          <td className="numeric">{formatCount(record.tasks.length)}</td>
                          <td>{record.extraFloor || "-"}</td>
                          <td><span className={`status-chip ${record.safety === "Үгүй" ? "red" : "green"}`}>{record.safety || "-"}</span></td>
                          <td><span className={`status-chip ${issues.length ? "red" : "neutral"}`}>{issues.length ? `${issues.length} анхаарах` : "Хэвийн"}</span></td>
                          <td className="action-column"><button className="icon-button" type="button" onClick={() => setSelectedRecord(record)} title="Дэлгэрэнгүй харах" aria-label={`${record.worker} дэлгэрэнгүй`}><Eye size={17} /></button></td>
                        </tr>
                      );
                    })}
                    {pageRows.length === 0 && <tr><td className="empty-row" colSpan={9}>Энэ шүүлтэд тохирох бүртгэл олдсонгүй.</td></tr>}
                  </tbody>
                </table>
              </div>
              <div className="pagination">
                <span>{formatCount(filteredRecords.length)}-с {(safePage - 1) * PAGE_SIZE + (pageRows.length ? 1 : 0)}–{(safePage - 1) * PAGE_SIZE + pageRows.length}</span>
                <div>
                  <button className="icon-button" type="button" disabled={safePage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} title="Өмнөх хуудас" aria-label="Өмнөх хуудас"><ArrowLeft size={17} /></button>
                  <span>{safePage} / {pageCount}</span>
                  <button className="icon-button" type="button" disabled={safePage >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))} title="Дараах хуудас" aria-label="Дараах хуудас"><ArrowRight size={17} /></button>
                </div>
              </div>
            </div>
          </section>
        </div>
      )}

      {selectedRecord && <FormRecordDrawer record={selectedRecord} onClose={() => setSelectedRecord(null)} />}
    </main>
  );
}
