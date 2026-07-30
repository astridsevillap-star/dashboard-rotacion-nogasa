"use client";

import { useState } from "react";
import * as XLSX from "xlsx";

type Props = { onUploaded: () => Promise<void> | void };
type SheetRow = Record<string, unknown>;

const text = (value: unknown) => String(value ?? "").trim();
const normalized = (value: unknown) => text(value).toLowerCase().replaceAll(" ", "_");
const dateValue = (value: unknown) => {
  if (value instanceof Date) return value;
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    return parsed ? new Date(parsed.y, parsed.m - 1, parsed.d) : null;
  }
  const raw = text(value);
  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (match) return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};
const isoDay = (date: Date | null) => date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}` : "";
const plain = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
const macroRegionFor = (city: string, provided = "") => {
  const named = plain(provided);
  if (named.includes("NORTE")) return "Norte";
  if (named.includes("SUR")) return "Sur";
  if (named.includes("ORIENTE") || named.includes("SELVA")) return "Oriente";
  if (named.includes("CENTRO")) return "Centro";
  const place = plain(city);
  if (["IQUITOS","PUCALLPA","TARAPOTO","MOYOBAMBA","JUANJUI","TINGO MARIA","PUERTO MALDONADO","LA MERCED"].some((name) => place.includes(name))) return "Oriente";
  if (["AREQUIPA","CUSCO","PUNO","TACNA","MOQUEGUA","ICA","AYACUCHO"].some((name) => place.includes(name))) return "Sur";
  if (["TUMBES","PIURA","SULLANA","TALARA","CHICLAYO","LAMBAYEQUE","TRUJILLO","CHIMBOTE","HUARAZ","CAJAMARCA","JAEN"].some((name) => place.includes(name))) return "Norte";
  return "Centro";
};

function matrixFor(sheet: XLSX.WorkSheet) {
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: true });
}

function hasColumns(matrix: unknown[][], required: string[]) {
  return matrix.some((row) => {
    const values = row.map((cell) => plain(text(cell)));
    return required.every((header) => values.includes(plain(header)));
  });
}

async function workbookRows(file: File): Promise<{ payrollRows: SheetRow[]; termRows: SheetRow[] }> {
  const bytes = await file.arrayBuffer();
  const book = XLSX.read(bytes, { type: "array", cellDates: true });
  const sheets = book.SheetNames.map((name) => ({ name, sheet: book.Sheets[name], matrix: matrixFor(book.Sheets[name]) }));
  const payroll = sheets.find(({ matrix }) => hasColumns(matrix, ["FECHA DATA", "DNI"]));
  const terms = sheets.find(({ matrix }) => hasColumns(matrix, ["Número de Documento", "Fecha Término Trabajo", "Razón de Término"]));

  if (!payroll) throw new Error("El archivo debe incluir una hoja con las columnas FECHA DATA y DNI.");
  if (!terms) throw new Error("El archivo debe incluir una hoja de Términos con Número de Documento, Fecha Término Trabajo y Razón de Término.");

  const payrollHeaderIndex = payroll.matrix.findIndex((row) => hasColumns([row], ["FECHA DATA", "DNI"]));
  const payrollHeaders = payroll.matrix[payrollHeaderIndex].map(text);
  const payrollRows = payroll.matrix
    .slice(payrollHeaderIndex + 1)
    .filter((row) => row.some((cell) => text(cell)))
    .map((row) => Object.fromEntries(payrollHeaders.map((header, index) => [header, row[index]])));

  const termHeaderIndex = terms.matrix.findIndex((row) => hasColumns([row], ["Número de Documento", "Fecha Término Trabajo", "Razón de Término"]));
  const termHeaders = terms.matrix[termHeaderIndex].map(text);
  const termRows = terms.matrix
    .slice(termHeaderIndex + 1)
    .filter((row) => row.some((cell) => text(cell)))
    .map((row) => Object.fromEntries(termHeaders.map((header, index) => [header, row[index]])));

  return { payrollRows, termRows };
}

export default function MonthlyUploader({ onUploaded }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const process = async () => {
    if (!file || !password) return setStatus("Selecciona el archivo de actualización e ingresa la clave.");
    setBusy(true); setStatus("Validando y consolidando el archivo…");
    try {
      const { payrollRows, termRows } = await workbookRows(file);
      if (!payrollRows.length) throw new Error("La hoja de planilla mensual está vacía.");
      const periodDate = dateValue(payrollRows[0]["FECHA DATA"]);
      if (!periodDate) throw new Error("No se pudo identificar FECHA DATA.");
      const year = periodDate.getFullYear();
      const month = periodDate.getMonth() + 1;
      const termMap = new Map(termRows.map((row) => [`${text(row["Número de Documento"])}|${isoDay(dateValue(row["Fecha Término Trabajo"]))}`, normalized(row["Razón de Término"])]));
      const unique = new Map<string, SheetRow>();
      payrollRows.forEach((row) => {
        const key = [row.DNI, row["FECHA INGRESO"], row["FECHA CESE"], row.AREA, row.DOTACION, row.REGION, row["REGIÓN"], row.CIUDAD, row.DIVISION, row.CATEGORIA].map(text).join("|");
        unique.set(key, row);
      });
      const groups = new Map<string, { y:number;m:number;a:string;d:string;g:string;r:string;q:string; people:Set<string>; hires:Set<string>; exits:Set<string>; voluntary:Set<string>; company:Set<string>; d3:Set<string>; d6:Set<string> }>();
      for (const row of unique.values()) {
        const dni = text(row.DNI); const ingreso = dateValue(row["FECHA INGRESO"]); const cese = dateValue(row["FECHA CESE"]);
        const area = text(row.AREA) || "SIN ÁREA";
        const dotacion = text(row.DOTACION) || "SIN DOTACIÓN";
        const city = text(row.CIUDAD) || text(row.DIVISION) || "SIN CIUDAD";
        const macroRegion = macroRegionFor(city, text(row.REGION) || text(row["REGIÓN"]));
        const category = text(row.CATEGORIA) || "SIN CATEGORÍA";
        const key = [area, dotacion, macroRegion, city, category].join("|");
        if (!groups.has(key)) groups.set(key, { y:year,m:month,a:area,d:dotacion,g:macroRegion,r:city,q:category,people:new Set(),hires:new Set(),exits:new Set(),voluntary:new Set(),company:new Set(),d3:new Set(),d6:new Set() });
        const group = groups.get(key)!; group.people.add(dni);
        if (ingreso && ingreso.getFullYear() === year && ingreso.getMonth() + 1 === month) group.hires.add(`${dni}|${isoDay(ingreso)}`);
        if (cese && cese.getFullYear() === year && cese.getMonth() + 1 === month) {
          const event = `${dni}|${isoDay(cese)}`; const reason = termMap.get(event) ?? "";
          if (reason !== "no_se_inicio_relacion_laboral") {
            group.exits.add(event);
            const isVoluntary = reason === "renuncia" || reason === "mutuo_disenso";
            if (isVoluntary) {
              group.voluntary.add(event);
              if (ingreso) { const days = Math.floor((cese.getTime() - ingreso.getTime()) / 86400000); if (days <= 90) group.d3.add(event); if (days <= 180) group.d6.add(event); }
            } else group.company.add(event);
          }
        }
      }
      const rows = Array.from(groups.values()).map((group) => ({ y:group.y,m:group.m,a:group.a,d:group.d,g:group.g,r:group.r,q:group.q,h:group.people.size,i:group.hires.size,c:group.exits.size,v:group.voluntary.size,x:group.company.size,d3:group.d3.size,d6:group.d6.size }));
      const response = await fetch("/api/uploaded-data", { method: "POST", headers: { "content-type": "application/json", "x-upload-password": password }, body: JSON.stringify({ rows, sourceName: file.name }) });
      const result = await response.json() as { error?: string; period?: string };
      if (!response.ok) throw new Error(result.error ?? "No se pudo guardar la actualización.");
      await onUploaded();
      setStatus(`Periodo ${result.period} incorporado correctamente. El dashboard ya fue actualizado.`);
      setFile(null);
    } catch (error) { setStatus(error instanceof Error ? error.message : "Ocurrió un error al procesar el archivo."); }
    finally { setBusy(false); }
  };

  return <section className="upload-panel">
    <div><p className="kicker">ACTUALIZACIÓN MENSUAL</p><h3>Cargar archivo de actualización</h3><p>Utiliza un solo Excel con las hojas “Planilla mensual” y “Términos”. Solo se guardan indicadores agregados; no se publican nombres ni DNI.</p></div>
    <div className="upload-fields"><label>Archivo del nuevo mes<input type="file" accept=".xlsx,.xls" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label><label>Clave de actualización<input type="password" value={password} autoComplete="current-password" onChange={(e) => setPassword(e.target.value)} /></label><button onClick={process} disabled={busy}>{busy ? "Procesando…" : "Actualizar dashboard"}</button></div>
    {status && <p className="upload-message" role="status">{status}</p>}
  </section>;
}
