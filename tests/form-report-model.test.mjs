import assert from "node:assert/strict";
import test from "node:test";
import XLSX from "xlsx";
import { attentionItems, formSummary, parseFormReportFile } from "../app/form-report-model.ts";

const headers = [
  "ID",
  "Start time",
  "Completion time",
  "Email",
  "Name",
  "Last modified time",
  "ХАБЭА-ын заавар зааварчилгаатай танилцсан эсэх",
  "Таны нэр хэн бэ?",
  "Цэвэрлэгээ үйлчилгээ хийсэн цаг",
  "Та цэвэрлэж буй давхараа сонгоорой",
  "Цэвэрлэгээний нэр төрлүүд /Цэвэрлэсэн хэсгүүдээ сонгоно/",
  "Та нэмэлт давхар авч ажиллаж байна уу?",
  "Та хэдэн давхарт нэмэлтээр ажиллаж байна вэ?",
  "B1 зогсооолын цэвэрлэгээ хийсэн тэмдэглэл",
  "Аваарын шатны цэвэрлэгээ хийсэн тэмдэглэл",
  "Урсдаг шатны цэвэрлэгээ хийсэн тэмдэглэл",
  "Байршил Та хэдэн давхарт ажил гүйцэтгэж байна",
  "00 цаас бүрэн байгаа эсэх",
  "Гарын шингэн саван бүрэн байгаа эсэх",
  "Хогийн сав суллаж, уут сольсон эсэх",
  "00 өрөөний эвгүй үнэр болон агааржуулалт хэвийн эсэх",
  "00 өрөөнүүдийн толь хэвийн байгаа эсэх",
  "00 өрөөнүүдийн суултуурууд хэвийн байгаа эсэх",
  "00 өрөөний угаалтуур цорго хэвийн байгаа эсэх",
];

test("parses and summarizes a Forms control workbook", async () => {
  const rows = [
    headers,
    ["1", "8/7/26 09:00:00", "8/7/26 09:02:00", "", "", "", "Тийм", "Ажилтан А", "Үндсэн цэвэрлэгээ", "1-р давхар", "Шал угаах;Хог шүүрдэх;", "Тийм", "3-р давхар", "Тийм", "Үгүй", "Тийм", "2 давхар эр", "00 цаасны ороолт дүүрэн", "Дүүргэлттэй", "Тийм", "Бохир үнэргүй", "Тийм", "Тийм", "Тийм"],
    ["2", "8/7/26 10:00:00", "8/7/26 10:01:00", "", "", "", "Үгүй", "Ажилтан Б", "Хэсэгчилсэн цэвэрлэгээ", "2-р давхар", "Ариун цэврийн өрөөний цэвэрлэгээ;", "Үгүй", "", "", "", "", "2 давхар эм", "00 цаасны ороолт дууссан", "Дүүргэлтгүй", "Үгүй", "Бохир үнэртэй", "Үгүй", "Үгүй", "Үгүй"],
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "Sheet1");
  const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  const report = await parseFormReportFile(new File([bytes], "control.xlsx"));
  const summary = formSummary(report.records);

  assert.equal(report.records.length, 2);
  assert.equal(report.startDate, "2026-08-07");
  assert.equal(summary.uniqueWorkers, 2);
  assert.equal(summary.mainCleaning, 1);
  assert.equal(summary.partialCleaning, 1);
  assert.equal(summary.safetyNo, 1);
  assert.equal(summary.attentionRecords, 1);
  assert.deepEqual(attentionItems(report.records[1]), [
    "ХАБЭА заавар",
    "00 цаас дууссан",
    "Саван дүүргэлтгүй",
    "Хогийн сав",
    "Эвгүй үнэр",
    "Толь",
    "Суултуур",
    "Угаалтуур, цорго",
  ]);
});
