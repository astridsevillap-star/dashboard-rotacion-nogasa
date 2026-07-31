"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import * as XLSX from "xlsx";

type UploadRecord = {
  sourceType?: string;
  periodLabel?: string;
  year?: number | string;
  month?: number | string;
  sourceName: string;
  uploadedAt: string;
  storedRows: number | string;
};
type QualityRecord = {
  year: number | string;
  month: number | string;
  payrollRows: number | string;
  distinctPeople: number | string;
  headcount: number | string;
  missingArea: number | string;
  missingDotacion: number | string;
  missingRegion: number | string;
  missingCategory: number | string;
};

const monthNames = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const payrollFields = [
  { name:"FECHA DATA",required:"Sí",format:"Fecha dd/mm/aaaa",purpose:"Periodo de la carga; debe ser igual en todas las filas." },
  { name:"DNI",required:"Sí",format:"Texto o número",purpose:"Identificador utilizado únicamente para vincular registros." },
  { name:"FECHA INGRESO",required:"Sí",format:"Fecha dd/mm/aaaa",purpose:"Determina los ingresos y la antigüedad." },
  { name:"FECHA CESE",required:"No",format:"Fecha o vacío",purpose:"Completar únicamente cuando exista un cese." },
  { name:"GERENCIA / AREA",required:"Sí",format:"Texto",purpose:"Gerencia organizacional. Se recomienda utilizar GERENCIA; AREA se mantiene como alternativa." },
  { name:"DOTACIÓN / DOTACION",required:"Sí",format:"Texto",purpose:"Grupo de dotación del trabajador." },
  { name:"ÁREA / CATEGORIA",required:"Recomendado",format:"Texto",purpose:"Área o categoría para el nivel de detalle." },
  { name:"REGION / REGIÓN",required:"Recomendado",format:"Norte, Sur, Centro u Oriente",purpose:"Macroregión para el mapa de calor." },
  { name:"CIUDAD / DIVISION",required:"Recomendado",format:"Texto",purpose:"Ciudad para el detalle territorial; DIVISION funciona como alternativa." },
];
const termFields = [
  { name:"Número de Documento",required:"Sí",format:"Texto o número",purpose:"Debe coincidir con el DNI de la Planilla." },
  { name:"Fecha Término Trabajo",required:"Sí",format:"Fecha dd/mm/aaaa",purpose:"Debe coincidir con la fecha de cese." },
  { name:"Razón de Término",required:"Sí",format:"Texto",purpose:"Clasifica la salida como deseada o no deseada." },
];

function downloadTemplate(kind: "payroll" | "terms") {
  const workbook = XLSX.utils.book_new();
  if (kind === "payroll") {
    const headers = ["FECHA DATA","DNI","FECHA INGRESO","FECHA CESE","GERENCIA","DOTACIÓN","ÁREA","REGIÓN","DIVISIÓN"];
    const sheet = XLSX.utils.aoa_to_sheet([headers]);
    sheet["!cols"] = headers.map((header) => ({ wch: Math.max(header.length + 4, 18) }));
    XLSX.utils.book_append_sheet(workbook, sheet, "Planilla mensual");
    XLSX.writeFile(workbook, "Plantilla_planilla_rotacion.xlsx");
  } else {
    const headers = ["Número de Documento","Fecha Término Trabajo","Razón de Término"];
    const sheet = XLSX.utils.aoa_to_sheet([headers]);
    sheet["!cols"] = [{ wch:24 },{ wch:26 },{ wch:30 }];
    XLSX.utils.book_append_sheet(workbook, sheet, "Términos");
    XLSX.writeFile(workbook, "Plantilla_terminos_rotacion.xlsx");
  }
}

function FieldTable({ rows }: { rows: typeof payrollFields }) {
  return <div className="data-table-wrap"><table className="data-table structure-table">
    <thead><tr><th>Columna exacta</th><th>Obligatorio</th><th>Formato</th><th>Uso en el tablero</th></tr></thead>
    <tbody>{rows.map((row) => <tr key={row.name}><td><strong>{row.name}</strong></td><td>{row.required}</td><td>{row.format}</td><td>{row.purpose}</td></tr>)}</tbody>
  </table></div>;
}

export default function FilesPage() {
  const [uploads, setUploads] = useState<UploadRecord[]>([]);
  const [quality, setQuality] = useState<QualityRecord[]>([]);
  const [status, setStatus] = useState("Consultando las cargas registradas…");
  const [loading, setLoading] = useState(true);

  const loadUploads = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/uploaded-data", { cache: "no-store" });
      const result = await response.json() as { uploads?: UploadRecord[]; quality?: QualityRecord[]; error?: string };
      if (!response.ok) throw new Error(result.error ?? "No se pudo consultar el historial.");
      setUploads(result.uploads ?? []);
      setQuality(result.quality ?? []);
      setStatus(result.uploads?.length ? "" : "Todavía no existen archivos cargados desde el módulo de actualización.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "No se pudo consultar el historial.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    fetch("/api/uploaded-data", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json() as { uploads?: UploadRecord[]; quality?: QualityRecord[]; error?: string };
        if (!response.ok) throw new Error(result.error ?? "No se pudo consultar el historial.");
        return result;
      })
      .then((result) => {
        if (!active) return;
        setUploads(result.uploads ?? []);
        setQuality(result.quality ?? []);
        setStatus(result.uploads?.length ? "" : "Todavía no existen archivos cargados desde el módulo de actualización.");
      })
      .catch((error: unknown) => {
        if (active) setStatus(error instanceof Error ? error.message : "No se pudo consultar el historial.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  return <main className="app-shell files-shell"><div className="dashboard">
    <header className="masthead files-masthead">
      <div className="masthead-top"><div className="brand-line"><span className="brand-mark">N</span> PEOPLE ANALYTICS · NOGASA</div><Link className="header-link" href="/">← Volver al tablero</Link></div>
      <div className="masthead-copy"><div><p className="eyebrow">CONTROL DE INFORMACIÓN</p><h1>Archivos y estructura de carga</h1><p className="masthead-subtitle">Consulta qué archivos fueron incorporados y descarga por separado la estructura de Planilla o Términos.</p></div></div>
    </header>

    <section className="files-summary">
      <article><span>Cargas registradas</span><strong>{uploads.length}</strong><small>Planilla y Términos independientes</small></article>
      <article><span>Formatos disponibles</span><strong>2</strong><small>una plantilla por tipo de archivo</small></article>
      <article><span>DNI originales guardados</span><strong>0</strong><small>se utilizan identificadores no reversibles</small></article>
    </section>

    <section className="panel files-section">
      <div className="panel-heading"><div><p className="kicker">QA DE DATOS</p><h2>Control de unicidad y consistencia</h2><p>Para cada periodo, las filas de Planilla, las personas únicas y la dotación consolidada deben coincidir.</p></div><span className="badge">{quality.length} {quality.length === 1 ? "periodo" : "periodos"}</span></div>
      {quality.length ? <div className="data-table-wrap"><table className="data-table">
        <thead><tr><th>Periodo</th><th>Filas Planilla</th><th>Personas únicas</th><th>Dotación tablero</th><th>Gerencia / dotación vacía</th><th>Ubicación / categoría vacía</th><th>Resultado</th></tr></thead>
        <tbody>{quality.map((item) => {
          const month = Number(item.month);
          const payrollRows = Number(item.payrollRows);
          const distinctPeople = Number(item.distinctPeople);
          const headcount = Number(item.headcount);
          const missingCritical = Number(item.missingArea) + Number(item.missingDotacion);
          const missingOptional = Number(item.missingRegion) + Number(item.missingCategory);
          const inconsistent = payrollRows !== distinctPeople || headcount !== distinctPeople || missingCritical > 0;
          const result = inconsistent ? "Revisar" : missingOptional > 0 ? "Advertencia" : "Conforme";
          return <tr key={`${item.year}-${month}`}>
            <td><strong>{monthNames[month - 1]} {item.year}</strong></td>
            <td>{payrollRows.toLocaleString("es-PE")}</td>
            <td>{distinctPeople.toLocaleString("es-PE")}</td>
            <td>{headcount.toLocaleString("es-PE")}</td>
            <td>{missingCritical.toLocaleString("es-PE")}</td>
            <td>{missingOptional.toLocaleString("es-PE")}</td>
            <td><span className={`qa-pill ${inconsistent ? "qa-alert" : missingOptional > 0 ? "qa-warning" : "qa-ok"}`}>{result}</span></td>
          </tr>;
        })}</tbody>
      </table></div> : <div className="empty-state">El control se activará con la siguiente carga de Planilla.</div>}
    </section>

    <section className="panel files-section">
      <div className="panel-heading"><div><p className="kicker">HISTORIAL DE ACTUALIZACIONES</p><h2>Archivos cargados</h2><p>Cada carga registra su tipo, periodo, nombre original y fecha de procesamiento.</p></div><button className="secondary-action" onClick={() => void loadUploads()} disabled={loading}>{loading ? "Consultando…" : "Actualizar lista"}</button></div>
      {uploads.length ? <div className="data-table-wrap"><table className="data-table">
        <thead><tr><th>Tipo</th><th>Periodo</th><th>Archivo procesado</th><th>Fecha de carga</th><th>Registros</th><th>Estado</th></tr></thead>
        <tbody>{uploads.map((item, index) => {
          const month = Number(item.month);
          const legacyPeriod = item.year && month ? `${monthNames[month - 1]} ${item.year}` : "";
          const date = new Date(item.uploadedAt);
          return <tr key={`${item.sourceName}-${item.uploadedAt}-${index}`}><td><strong>{item.sourceType ?? "Carga"}</strong></td><td>{item.periodLabel ?? legacyPeriod ?? "Sin periodo"}</td><td>{item.sourceName}</td><td>{Number.isNaN(date.getTime()) ? "Sin fecha" : new Intl.DateTimeFormat("es-PE", { dateStyle:"medium",timeStyle:"short" }).format(date)}</td><td>{Number(item.storedRows).toLocaleString("es-PE")}</td><td><span className="status-pill">Procesado</span></td></tr>;
        })}</tbody>
      </table></div> : <div className="empty-state" role="status" aria-live="polite">{status}</div>}
    </section>

    <section className="panel files-section">
      <div className="panel-heading"><div><p className="kicker">FORMATO 1 · INDEPENDIENTE</p><h2>Planilla mensual</h2><p>Puede cargarla sin adjuntar Términos. Actualiza dotación, ingresos y ceses del periodo.</p></div><button className="primary-action" onClick={() => downloadTemplate("payroll")}>Descargar plantilla de Planilla</button></div>
      <FieldTable rows={payrollFields} />
    </section>

    <section className="panel files-section">
      <div className="panel-heading"><div><p className="kicker">FORMATO 2 · INDEPENDIENTE</p><h2>Términos</h2><p>Puede cargarlo sin adjuntar Planilla. Reclasifica las salidas de los periodos incluidos cuando exista información de Planilla vinculada.</p></div><button className="primary-action" onClick={() => downloadTemplate("terms")}>Descargar plantilla de Términos</button></div>
      <FieldTable rows={termFields} />
    </section>

    <section className="load-rules">
      <div><p className="kicker">ANTES DE CARGAR</p><h2>Funcionamiento independiente</h2></div>
      <ol>
        <li>Cargue únicamente el archivo que desea actualizar: Planilla o Términos.</li>
        <li>Mantenga las cabeceras exactamente como aparecen en cada plantilla.</li>
        <li>La Planilla debe contener un solo mes por carga.</li>
        <li>El archivo de Términos puede contener uno o varios meses; cada mes incluido reemplaza su clasificación anterior.</li>
        <li>Si Términos se carga primero, quedará disponible y se aplicará cuando posteriormente se incorpore la Planilla correspondiente.</li>
      </ol>
    </section>
    <footer>Fuente: historial de actualizaciones almacenado en la base del dashboard.</footer>
  </div></main>;
}
