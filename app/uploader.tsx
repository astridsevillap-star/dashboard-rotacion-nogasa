"use client";

import { useState } from "react";
import * as XLSX from "xlsx";

type Props = { onUploaded: () => Promise<void> | void };
type SheetRow = Record<string, unknown>;
type UploadKind = "payroll" | "terms";
type PayrollParseResult = { records: PayrollRecord[]; periods: string[]; duplicatesResolved: number };
type PayrollRecord = {
  personHash: string;
  period: string;
  hireDate: string;
  exitDate: string;
  area: string;
  dotacion: string;
  macroRegion: string;
  region: string;
  category: string;
};

const text = (value: unknown) => String(value ?? "").trim();
const normalized = (value: unknown) => text(value)
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "_")
  .replace(/^_+|_+$/g, "");
const valueFor = (row: SheetRow, aliases: string[]) => {
  const values = new Map(Object.entries(row).map(([key, value]) => [normalized(key), value]));
  for (const alias of aliases) {
    const value = values.get(normalized(alias));
    if (value !== undefined && text(value)) return value;
  }
  return "";
};
const plain = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
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

async function rowsFor(file: File, required: string[]): Promise<SheetRow[]> {
  const bytes = await file.arrayBuffer();
  const book = XLSX.read(bytes, { type: "array", cellDates: true });
  const sheets = book.SheetNames.map((name) => ({ name, matrix: matrixFor(book.Sheets[name]) }));
  const target = sheets.find(({ matrix }) => hasColumns(matrix, required));
  if (!target) throw new Error(`No se encontró una hoja con las columnas: ${required.join(", ")}.`);
  const headerIndex = target.matrix.findIndex((row) => hasColumns([row], required));
  const headers = target.matrix[headerIndex].map(text);
  return target.matrix
    .slice(headerIndex + 1)
    .filter((row) => row.some((cell) => text(cell)))
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index]])));
}

async function hashValues(values: string[]) {
  const unique = Array.from(new Set(values));
  const pairs = await Promise.all(unique.map(async (value) => {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    const hash = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
    return [value, hash] as const;
  }));
  return new Map(pairs);
}

function periodFor(row: SheetRow) {
  const date = dateValue(valueFor(row, ["FECHA DATA", "FECHA DE DATA", "MES PLANILLA"]));
  return date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}` : "";
}

function recordPriority(row: SheetRow, period: string) {
  const [year, month] = period.split("-").map(Number);
  const lastDay = new Date(year, month, 0);
  const hireDate = dateValue(valueFor(row, ["FECHA INGRESO", "FECHA DE INGRESO", "FECHA INICIO"]));
  const exitDate = dateValue(valueFor(row, ["FECHA CESE", "FECHA DE CESE", "FECHA TÉRMINO TRABAJO"]));
  const activeAtClose = (!hireDate || hireDate <= lastDay) && (!exitDate || exitDate >= lastDay);
  return [activeAtClose ? 1 : 0, hireDate?.getTime() ?? 0, exitDate?.getTime() ?? 0] as const;
}

function preferredRow(current: SheetRow, candidate: SheetRow, period: string) {
  const currentPriority = recordPriority(current, period);
  const candidatePriority = recordPriority(candidate, period);
  for (let index = 0; index < currentPriority.length; index += 1) {
    if (candidatePriority[index] !== currentPriority[index]) return candidatePriority[index] > currentPriority[index] ? candidate : current;
  }
  return candidate;
}

async function payrollRecords(file: File): Promise<PayrollParseResult> {
  const rows = await rowsFor(file, ["FECHA DATA", "DNI"]);
  if (!rows.length) throw new Error("El archivo de Planilla está vacío.");
  const selectedRows = new Map<string, SheetRow>();
  let duplicatesResolved = 0;
  for (const row of rows) {
    const identifier = text(valueFor(row, ["DNI", "Número de Documento", "N° Documento"]));
    if (!identifier) throw new Error("Todas las filas de Planilla deben incluir DNI.");
    const period = periodFor(row);
    if (!period) throw new Error("Todas las filas deben incluir una FECHA DATA válida.");
    const key = `${period}|${identifier}`;
    const current = selectedRows.get(key);
    if (current) {
      duplicatesResolved += 1;
      selectedRows.set(key, preferredRow(current, row, period));
    } else {
      selectedRows.set(key, row);
    }
  }
  const uniqueRows = Array.from(selectedRows.values());
  const identifiers = uniqueRows.map((row) => text(valueFor(row, ["DNI", "Número de Documento", "N° Documento"])));
  const hashes = await hashValues(identifiers);
  const periods = Array.from(new Set(uniqueRows.map(periodFor))).sort();

  const records = uniqueRows.map((row) => {
    const period = periodFor(row);
    const identifier = text(valueFor(row, ["DNI", "Número de Documento", "N° Documento"]));
    const gerencia = text(valueFor(row, ["GERENCIA", "GERENCIA / ÁREA", "GERENCIA AREA"]));
    const sourceArea = text(valueFor(row, ["ÁREA", "AREA"]));
    const organizationalArea = gerencia;
    const dotacion = text(valueFor(row, ["DOTACIÓN", "DOTACION", "GRUPO DE DOTACIÓN", "GRUPO DOTACION"]));
    const city = text(valueFor(row, ["CIUDAD", "DIVISIÓN", "DIVISION", "SEDE"])) || "SIN CIUDAD";
    if (!organizationalArea || !dotacion) {
      throw new Error("Todas las filas deben incluir GERENCIA (o AREA) y DOTACIÓN. Revise las cabeceras y los valores vacíos.");
    }
    return {
      personHash: hashes.get(identifier)!,
      period,
      hireDate: isoDay(dateValue(valueFor(row, ["FECHA INGRESO", "FECHA DE INGRESO", "FECHA INICIO"]))),
      exitDate: isoDay(dateValue(valueFor(row, ["FECHA CESE", "FECHA DE CESE", "FECHA TÉRMINO TRABAJO"]))),
      area: organizationalArea,
      dotacion,
      macroRegion: macroRegionFor(city, text(valueFor(row, ["REGIÓN", "REGION", "MACROREGIÓN", "MACROREGION"]))),
      region: city,
      category: text(valueFor(row, ["CATEGORÍA", "CATEGORIA"])) || sourceArea || "SIN CATEGORÍA",
    };
  });
  return { records, periods, duplicatesResolved };
}

async function termRecords(file: File) {
  const rows = await rowsFor(file, ["Número de Documento", "Fecha Término Trabajo", "Razón de Término"]);
  if (!rows.length) throw new Error("El archivo de Términos está vacío.");
  const identifiers = rows.map((row) => text(valueFor(row, ["Número de Documento", "N° Documento", "DNI"]))).filter(Boolean);
  if (identifiers.length !== rows.length) throw new Error("Todas las filas de Términos deben incluir Número de Documento.");
  const hashes = await hashValues(identifiers);
  const unique = new Map<string, Record<string, unknown>>();
  rows.forEach((row) => {
    const identifier = text(valueFor(row, ["Número de Documento", "N° Documento", "DNI"]));
    const termDate = isoDay(dateValue(valueFor(row, ["Fecha Término Trabajo", "Fecha de Término", "Fecha Cese"])));
    const reason = normalized(valueFor(row, ["Razón de Término", "Razon Termino", "Motivo de Cese"]));
    if (!termDate || !reason) throw new Error("Todas las filas de Términos deben incluir fecha y razón de término válidas.");
    const record = { personHash: hashes.get(identifier), termDate, reason };
    unique.set(`${record.personHash}|${termDate}`, record);
  });
  return Array.from(unique.values());
}

export default function MonthlyUploader({ onUploaded }: Props) {
  const [payrollFile, setPayrollFile] = useState<File | null>(null);
  const [termsFile, setTermsFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState<UploadKind | null>(null);

  const process = async (kind: UploadKind) => {
    const file = kind === "payroll" ? payrollFile : termsFile;
    if (!file || !password) return setStatus(`Selecciona el archivo de ${kind === "payroll" ? "Planilla" : "Términos"} e ingresa la clave.`);
    setBusy(kind);
    setStatus(`Validando y procesando ${kind === "payroll" ? "Planilla" : "Términos"}…`);
    try {
      let periodLabel = "";
      let duplicatesResolved = 0;
      if (kind === "payroll") {
        const parsed = await payrollRecords(file);
        duplicatesResolved = parsed.duplicatesResolved;
        for (let index = 0; index < parsed.periods.length; index += 1) {
          const period = parsed.periods[index];
          setStatus(`Guardando Planilla · ${period} (${index + 1} de ${parsed.periods.length})…`);
          const records = parsed.records.filter((record) => record.period === period);
          const response = await fetch("/api/uploaded-data", {
            method: "POST",
            headers: { "content-type": "application/json", "x-upload-password": password },
            body: JSON.stringify({ kind, records, sourceName: file.name }),
          });
          const result = await response.json() as { error?: string; period?: string };
          if (!response.ok) throw new Error(`${period}: ${result.error ?? "No se pudo guardar la actualización."}`);
        }
        periodLabel = parsed.periods.length === 1
          ? parsed.periods[0]
          : `${parsed.periods[0]} a ${parsed.periods.at(-1)} · ${parsed.periods.length} periodos`;
      } else {
        const records = await termRecords(file);
        const response = await fetch("/api/uploaded-data", {
          method: "POST",
          headers: { "content-type": "application/json", "x-upload-password": password },
          body: JSON.stringify({ kind, records, sourceName: file.name }),
        });
        const result = await response.json() as { error?: string; period?: string };
        if (!response.ok) throw new Error(result.error ?? "No se pudo guardar la actualización.");
        periodLabel = result.period ?? "";
      }
      await onUploaded();
      const duplicateNote = duplicatesResolved ? ` · ${duplicatesResolved} duplicidad(es) resuelta(s) por vigencia al cierre` : "";
      setStatus(`${kind === "payroll" ? "Planilla" : "Términos"} incorporado correctamente${periodLabel ? ` · ${periodLabel}` : ""}${duplicateNote}. El dashboard ya fue recalculado.`);
      if (kind === "payroll") setPayrollFile(null); else setTermsFile(null);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Ocurrió un error al procesar el archivo.");
    } finally {
      setBusy(null);
    }
  };

  return <section className="upload-panel independent-uploader">
    <div>
      <p className="kicker">ACTUALIZACIÓN INDEPENDIENTE</p>
      <h3>Cargar Planilla o Términos</h3>
      <p>Cada archivo se procesa por separado. La Planilla puede contener uno o varios meses; cada periodo se reemplaza de forma independiente. No necesita cargar Términos para incorporar una Planilla.</p>
    </div>
    <div className="independent-upload-fields">
      <label className="upload-password">Clave de actualización<input type="password" value={password} autoComplete="current-password" onChange={(e) => setPassword(e.target.value)} /></label>
      <label>Archivo de Planilla<input type="file" accept=".xlsx,.xls" onChange={(e) => setPayrollFile(e.target.files?.[0] ?? null)} /></label>
      <button onClick={() => void process("payroll")} disabled={busy !== null}>{busy === "payroll" ? "Procesando…" : "Cargar Planilla"}</button>
      <label>Archivo de Términos<input type="file" accept=".xlsx,.xls" onChange={(e) => setTermsFile(e.target.files?.[0] ?? null)} /></label>
      <button onClick={() => void process("terms")} disabled={busy !== null}>{busy === "terms" ? "Procesando…" : "Cargar Términos"}</button>
    </div>
    {status && <p className="upload-message" role="status">{status}</p>}
  </section>;
}
