"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import * as XLSX from "xlsx";

type UploadRecord = {
  year: number | string;
  month: number | string;
  sourceName: string;
  uploadedAt: string;
  storedRows: number | string;
};

const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

const payrollFields = [
  { name: "FECHA DATA", required: "Sí", format: "Fecha dd/mm/aaaa", purpose: "Periodo de la carga; debe ser igual en todas las filas." },
  { name: "DNI", required: "Sí", format: "Texto o número", purpose: "Identificador único del trabajador." },
  { name: "FECHA INGRESO", required: "Sí", format: "Fecha dd/mm/aaaa", purpose: "Determina los ingresos y la antigüedad." },
  { name: "FECHA CESE", required: "No", format: "Fecha o vacío", purpose: "Completar únicamente cuando exista un cese." },
  { name: "AREA", required: "Sí", format: "Texto", purpose: "Gerencia o área organizacional." },
  { name: "DOTACION", required: "Sí", format: "Texto", purpose: "Grupo de dotación del trabajador." },
  { name: "REGION / REGIÓN", required: "Recomendado", format: "Norte, Sur, Centro u Oriente", purpose: "Macroregión para el mapa de calor." },
  { name: "CIUDAD / DIVISION", required: "Recomendado", format: "Texto", purpose: "Ciudad para el detalle territorial; DIVISION funciona como alternativa." },
  { name: "CATEGORIA", required: "Recomendado", format: "Texto", purpose: "Categoría o unidad para el nivel de detalle." },
];

const termFields = [
  { name: "Número de Documento", required: "Sí", format: "Texto o número", purpose: "Debe coincidir con el DNI de la planilla." },
  { name: "Fecha Término Trabajo", required: "Sí", format: "Fecha dd/mm/aaaa", purpose: "Debe coincidir con la fecha de cese." },
  { name: "Razón de Término", required: "Sí", format: "Texto", purpose: "Clasifica la salida como deseada o no deseada." },
];

function downloadWorkbook() {
  const workbook = XLSX.utils.book_new();
  const payrollHeaders = ["FECHA DATA", "DNI", "FECHA INGRESO", "FECHA CESE", "AREA", "DOTACION", "REGION", "CIUDAD", "CATEGORIA"];
  const payrollSheet = XLSX.utils.aoa_to_sheet([payrollHeaders]);
  payrollSheet["!cols"] = payrollHeaders.map((header) => ({ wch: Math.max(header.length + 4, 18) }));
  XLSX.utils.book_append_sheet(workbook, payrollSheet, "Planilla mensual");

  const termHeaders = ["Número de Documento", "Fecha Término Trabajo", "Razón de Término"];
  const termSheet = XLSX.utils.aoa_to_sheet([termHeaders]);
  termSheet["!cols"] = [{ wch: 24 }, { wch: 26 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(workbook, termSheet, "Términos");

  XLSX.writeFile(workbook, "Plantilla_unica_rotacion.xlsx");
}

function FieldTable({ rows }: { rows: typeof payrollFields }) {
  return <div className="data-table-wrap">
    <table className="data-table structure-table">
      <thead><tr><th>Columna exacta</th><th>Obligatorio</th><th>Formato</th><th>Uso en el tablero</th></tr></thead>
      <tbody>{rows.map((row) => <tr key={row.name}><td><strong>{row.name}</strong></td><td>{row.required}</td><td>{row.format}</td><td>{row.purpose}</td></tr>)}</tbody>
    </table>
  </div>;
}

export default function FilesPage() {
  const [uploads, setUploads] = useState<UploadRecord[]>([]);
  const [status, setStatus] = useState("Consultando las cargas registradas…");
  const [loading, setLoading] = useState(true);

  const loadUploads = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/uploaded-data", { cache: "no-store" });
      const result = await response.json() as { uploads?: UploadRecord[]; error?: string };
      if (!response.ok) throw new Error(result.error ?? "No se pudo consultar el historial.");
      setUploads(result.uploads ?? []);
      setStatus(result.uploads?.length ? "" : "Todavía no existen archivos cargados desde el módulo de actualización.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "No se pudo consultar el historial.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadUploads(); }, []);

  return <main className="app-shell files-shell">
    <div className="dashboard">
      <header className="masthead files-masthead">
        <div className="masthead-top">
          <div className="brand-line"><span className="brand-mark">N</span> PEOPLE ANALYTICS · NOGASA</div>
          <Link className="header-link" href="/">← Volver al tablero</Link>
        </div>
        <div className="masthead-copy">
          <div>
            <p className="eyebrow">CONTROL DE INFORMACIÓN</p>
            <h1>Archivos y estructura de carga</h1>
            <p className="masthead-subtitle">Consulta qué periodos fueron incorporados y descarga la plantilla única con las dos hojas que requiere el tablero.</p>
          </div>
        </div>
      </header>

      <section className="files-summary">
        <article><span>Periodos cargados</span><strong>{new Set(uploads.map((item) => `${item.year}-${item.month}`)).size}</strong><small>registrados en la base</small></article>
        <article><span>Archivos identificados</span><strong>{uploads.length}</strong><small>un libro de actualización por carga</small></article>
        <article><span>Datos personales guardados</span><strong>0</strong><small>solo se conservan indicadores agregados</small></article>
      </section>

      <section className="panel files-section">
        <div className="panel-heading">
          <div><p className="kicker">HISTORIAL DE ACTUALIZACIONES</p><h2>Archivos cargados</h2><p>Se muestra el nombre original registrado al procesar cada periodo. Los archivos Excel no se almacenan ni pueden descargarse desde el tablero.</p></div>
          <button className="secondary-action" onClick={() => void loadUploads()} disabled={loading}>{loading ? "Consultando…" : "Actualizar lista"}</button>
        </div>
        {uploads.length ? <div className="data-table-wrap">
          <table className="data-table">
            <thead><tr><th>Periodo</th><th>Archivo procesado</th><th>Fecha de carga</th><th>Registros agregados</th><th>Estado</th></tr></thead>
            <tbody>{uploads.map((item, index) => {
              const month = Number(item.month);
              const date = new Date(item.uploadedAt);
              return <tr key={`${item.year}-${item.month}-${item.sourceName}-${index}`}>
                <td><strong>{monthNames[month - 1]} {item.year}</strong></td>
                <td>{item.sourceName}</td>
                <td>{Number.isNaN(date.getTime()) ? "Sin fecha" : new Intl.DateTimeFormat("es-PE", { dateStyle: "medium", timeStyle: "short" }).format(date)}</td>
                <td>{Number(item.storedRows).toLocaleString("es-PE")}</td>
                <td><span className="status-pill">Procesado</span></td>
              </tr>;
            })}</tbody>
          </table>
        </div> : <div className="empty-state" role="status" aria-live="polite">{status}</div>}
      </section>

      <section className="panel files-section">
        <div className="panel-heading">
          <div><p className="kicker">ARCHIVO ÚNICO</p><h2>Plantilla de actualización mensual</h2><p>El libro debe contener las hojas “Planilla mensual” y “Términos”. El sistema las reconoce por sus cabeceras.</p></div>
          <button className="primary-action" onClick={downloadWorkbook}>Descargar plantilla única</button>
        </div>
        <div className="panel-heading">
          <div><p className="kicker">HOJA 1</p><h3>Planilla mensual</h3><p>Debe contener una fila por trabajador y respetar estas cabeceras.</p></div>
        </div>
        <FieldTable rows={payrollFields} />
        <div className="panel-heading" style={{ marginTop: 24 }}>
          <div><p className="kicker">HOJA 2</p><h3>Términos</h3><p>Relaciona cada cese con la planilla y permite clasificar correctamente la rotación.</p></div>
        </div>
        <FieldTable rows={termFields} />
      </section>

      <section className="load-rules">
        <div><p className="kicker">ANTES DE CARGAR</p><h2>Validaciones recomendadas</h2></div>
        <ol>
          <li>Utiliza un solo archivo Excel con las hojas “Planilla mensual” y “Términos”.</li>
          <li>Mantén las cabeceras exactamente como aparecen en la plantilla.</li>
          <li>Verifica que FECHA DATA corresponda al mes que deseas actualizar.</li>
          <li>Asegura que DNI, fecha de cese y fecha de término coincidan entre ambas hojas.</li>
          <li>No combines dos meses diferentes dentro de una misma carga.</li>
        </ol>
      </section>

      <footer>Fuente: historial de actualizaciones almacenado en la base del dashboard.</footer>
    </div>
  </main>;
}
