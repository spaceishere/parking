"use client";

import { ArrowRight, Building2, ClipboardCheck, LockKeyhole } from "lucide-react";
import { lazy, Suspense, useState } from "react";

const ParkingModule = lazy(() => import("./ExcelUploader").then((module) => ({ default: module.ExcelUploader })));
const FormModule = lazy(() => import("./FormDashboard").then((module) => ({ default: module.FormDashboard })));

type Module = "home" | "parking" | "form";

function ModuleLoading() {
  return (
    <main className="portal-shell">
      <header className="topbar portal-topbar">
        <div className="brand"><span className="brand-mark" aria-hidden="true">H</span><span><strong>Хяналтын төв</strong><small>Тайланг нээж байна</small></span></div>
      </header>
      <div className="module-loading"><span className="upload-icon"><FileSpreadsheetIcon /></span><strong>Тайланг нээж байна...</strong></div>
    </main>
  );
}

function FileSpreadsheetIcon() {
  return <ClipboardCheck size={27} aria-hidden="true" />;
}

export function OperationsPortal() {
  const [activeModule, setActiveModule] = useState<Module>("home");

  if (activeModule === "parking") {
    return <Suspense fallback={<ModuleLoading />}><ParkingModule onBack={() => setActiveModule("home")} /></Suspense>;
  }

  if (activeModule === "form") {
    return <Suspense fallback={<ModuleLoading />}><FormModule onBack={() => setActiveModule("home")} /></Suspense>;
  }

  return (
    <main className="portal-shell">
      <header className="topbar portal-topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">H</span>
          <span><strong>Хяналтын төв</strong><small>Excel тайлангийн нэгдсэн систем</small></span>
        </div>
        <div className="local-badge"><LockKeyhole size={15} />Файл төхөөрөмж дээр уншигдана</div>
      </header>

      <section className="portal-home">
        <div className="portal-heading">
          <p className="eyebrow">ТАЙЛАНГИЙН ТӨРӨЛ</p>
          <h1>Аль тайлангаа шалгах вэ?</h1>
        </div>

        <div className="module-grid">
          <button className="module-choice parking" type="button" onClick={() => setActiveModule("parking")}>
            <span className="module-icon" aria-hidden="true"><Building2 size={30} /></span>
            <span className="module-copy">
              <small>2 EXCEL ФАЙЛ</small>
              <strong>Parking</strong>
              <span>Зогсоолын тайлан</span>
            </span>
            <span className="module-arrow" aria-hidden="true"><ArrowRight size={21} /></span>
          </button>

          <button className="module-choice form" type="button" onClick={() => setActiveModule("form")}>
            <span className="module-icon" aria-hidden="true"><ClipboardCheck size={30} /></span>
            <span className="module-copy">
              <small>1 EXCEL ФАЙЛ</small>
              <strong>Form</strong>
              <span>Өдөр тутмын хяналт</span>
            </span>
            <span className="module-arrow" aria-hidden="true"><ArrowRight size={21} /></span>
          </button>
        </div>
      </section>
    </main>
  );
}
