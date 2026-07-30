"use client";

import { useState } from "react";
import * as XLSX from "xlsx";

type Props = { onUploaded: () => Promise<void> | void };
type SheetRow = Record<string, unknown>;
type UploadKind = "payroll" | "terms";

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

async function payrollRecords(file: File) {
  const rows = await rowsFor(file, ["FECHA DATA", "DNI"]);
  if (!rows.length) throw new Error("El archivo de Planilla está vacío.");
  const identifiers = rows.map((row) => text(valueFor(row, ["DNI", "Número de Documento", "N° Documento"]))).filter(Boolean);
  if (identifiers.length !== rows.length) throw new Error("Todas las filas de Planilla deben incluir DNI.");
  const seenIdentifiers = new Set<string>();
  const duplicateIdentifiers = new Set(identifiers.filter((identifier) => {
    if (seenIdentifiers.has(identifier)) return true;
    seenIdentifiers.add(identifier);
    return false;
  }));
  if (duplicateIdentifiers.size) {
    throw new Error(`La Planilla contiene ${duplicateIdentifiers.size} DNI duplicado(s). Cada persona debe figurar una sola vez por periodo.`);
  }
  const hashes = await hashValues(identifiers);
  const periods = new Set(rows.map((row) => {
    const date = dateValue(valueFor(row, ["FECHA DATA", "FECHA DE DATA", "MES PLANILLA"]));
    return date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}` : "";
  }));
  if (periods.has("")) throw new Error("Todas las filas deben incluir una FECHA DATA válida.");
  if (periods.size !== 1) throw new Error("La Planilla debe contener un solo periodo por carga.");

  const records = rows.map((row) => {
    const period = Array.from(periods)[0];
    const identifier = text(valueFor(row, ["DNI", "Número de Documento", "N° Documento"]));
    const gerencia = text(valueFor(row, ["GERENCIA", "GERENCIA / ÁREA", "GERENCIA AREA"]));
    const sourceArea = text(valueFor(row, ["ÁREA", "AREA"]));
    const organizationalArea = gerencia || sourceArea;
    const dotacion = text(valueFor(row, ["DOTACIÓN", "DOTACION", "GRUPO DE DOTACIÓN", "GRUPO DOTACION"]));
    const city = text(valueFor(row, ["CIUDAD", "DIVISIÓN", "DIVISION", "SEDE"])) || "SIN CIUDAD";
    if (!organizationalArea || !dotacion) {
      throw new Error("Todas las filas deben incluir GERENCIA (o AREA) y DOTACIÓN. Revise las cabeceras y los valores vacíos.");
    }
    return {
      personHash: hashes.get(identifier),
      period,
      hireDate: isoDay(dateValue(valueFor(row, ["FECHA INGRESO", "FECHA DE INGRESO", "FECHA INICIO"]))),
      exitDate: isoDay(dateValue(valueFor(row, ["FECHA CESE", "FECHA DE CESE", "FECHA TÉRMINO TRABAJO"]))),
      area: organizationalArea,
      dotacion,
      macroRegion: macroRegionFor(city, text(valueFor(row, ["REGIÓN", "REGION", "MACROREGIÓN", "MACROREGION"]))),
      region: city,
      category: text(valueFor(row, ["CATEGORÍA", "CATEGORIA"])) || (gerencia ? sourceArea : "") || "SIN CATEGORÍA",
    };
  });
  return records;
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
      const records = kind === "payroll" ? await payrollRecords(file) : await termRecords(file);
      const response = await fetch("/api/uploaded-data", {
        method: "POST",
        headers: { "content-type": "application/json", "x-upload-password": password },
        body: JSON.stringify({ kind, records, sourceName: file.name }),
      });
      const result = await response.json() as { error?: string; period?: string };
      if (!response.ok) throw new Error(result.error ?? "No se pudo guardar la actualización.");
      await onUploaded();
      setStatus(`${kind === "payroll" ? "Planilla" : "Términos"} incorporado correctamente${result.period ? ` · ${result.period}` : ""}. El dashboard ya fue recalculado.`);
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
      <p>Cada archivo se procesa por separado. No necesita cargar Términos para incorporar una Planilla, ni volver a cargar la Planilla cuando actualice Términos.</p>
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
