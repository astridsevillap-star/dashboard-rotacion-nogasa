// Batch upload API — deployment refresh 2026-08-08
import { createHash, createHmac } from "node:crypto";
import postgres from "postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type AggregateRow = { y:number;m:number;a:string;d:string;g?:string;r:string;q:string;h:number;hs?:number;he?:number;i:number;c:number;v:number;x:number;d3:number;d6:number };
type PayrollRecord = { personHash:string;personName?:string;period:string;hireDate:string;exitDate:string;area:string;dotacion:string;macroRegion:string;region:string;category:string };
type TermRecord = { personHash:string;termDate:string;reason:string };

const monthNames = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const periodPattern = /^(20\d{2})-(0[1-9]|1[0-2])$/;
const datePattern = /^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const hashPattern = /^[a-f0-9]{64}$/;

type Database = ReturnType<typeof postgres>;

declare global {
  var nogasaDatabase: Database | undefined;
}

function database(): Database {
  const url = process.env.SUPABASE_DATABASE_URL;
  if (!url) throw new Error("SUPABASE_DATABASE_URL no está configurada.");
  if (!globalThis.nogasaDatabase) {
    const connectionUrl = new URL(url);
    if (connectionUrl.hostname.includes("pooler.supabase.com") && connectionUrl.port === "5432") {
      connectionUrl.port = "6543";
    }
    globalThis.nogasaDatabase = postgres(connectionUrl.toString(), {
      ssl: "require",
      max: 1,
      prepare: false,
      idle_timeout: 2,
      connect_timeout: 15,
      max_lifetime: 60,
    });
  }
  return globalThis.nogasaDatabase;
}

const safeText = (value: unknown, fallback: string, max = 180) => String(value ?? "").trim().slice(0, max) || fallback;
const recordId = (parts: string[]) => createHash("sha256").update(parts.join("|")).digest("hex");
const protectedPersonHash = (hash: string) => createHmac("sha256", process.env.UPLOAD_PASSWORD!).update(hash).digest("hex");

function periodLabel(keys: string[]) {
  const sorted = [...keys].sort();
  const label = (key: string) => {
    const [year, month] = key.split("-").map(Number);
    return `${monthNames[month - 1]} ${year}`;
  };
  return sorted.length === 1 ? label(sorted[0]) : `${label(sorted[0])} – ${label(sorted[sorted.length - 1])}`;
}

async function replaceSource(sql: Database, sourceType: "Planilla" | "Términos", period: string, sourceName: string, uploadedAt: string, storedRows: number) {
  const label = periodLabel([period]);
  const id = recordId(["source", sourceType, period]);
  await sql`DELETE FROM uploaded_sources WHERE source_type=${sourceType} AND period_label=${label}`;
  await sql`INSERT INTO uploaded_sources (id,source_type,period_label,source_name,uploaded_at,stored_rows)
    VALUES (${id},${sourceType},${label},${sourceName},${uploadedAt},${storedRows})`;
}

async function rebuildPeriod(sql: Database, key: string, sourceName: string) {
  const match = key.match(periodPattern);
  if (!match) return;
  const year = Number(match[1]);
  const month = Number(match[2]);
  await sql`SELECT public.rebuild_uploaded_period(${year}, ${month}, ${sourceName})`;
}

async function stagePayroll(sql: Database, phase: "start" | "append" | "commit", period: string, records: PayrollRecord[], sourceName: string, expectedRows?: number) {
  if (!periodPattern.test(period)) throw new Error("El periodo de Planilla no es válido.");
  const [year, month] = period.split("-").map(Number);

  if (phase === "start") {
    const expected = Number(expectedRows);
    if (!Number.isInteger(expected) || expected < 1 || expected > 20000) throw new Error("La cantidad esperada de filas no es válida.");
    await sql`DELETE FROM uploaded_payroll WHERE year=${year} AND month=${month}`;
    return period;
  }

  if (phase === "append") {
    if (!records.length || records.length > 250) throw new Error("El lote de Planilla debe contener entre 1 y 250 filas.");
    if (records.some((record) => record.period !== period || !hashPattern.test(record.personHash) || (record.hireDate && !datePattern.test(record.hireDate)) || (record.exitDate && !datePattern.test(record.exitDate)))) {
      throw new Error("El lote contiene identificadores, fechas o periodos inválidos.");
    }
    const uploadedAt = new Date().toISOString();
    const values = records.map((record) => {
      const personHash = protectedPersonHash(record.personHash);
      return {
        id: recordId([period, personHash]),
        year,
        month,
        person_hash: personHash,
        person_name: safeText(record.personName, "", 180) || null,
        hire_date: record.hireDate,
        exit_date: record.exitDate,
        area: safeText(record.area, "SIN ÁREA"),
        dotacion: safeText(record.dotacion, "SIN DOTACIÓN"),
        macro_region: safeText(record.macroRegion, "SIN REGIÓN", 80),
        region: safeText(record.region, "SIN CIUDAD"),
        category: safeText(record.category, "SIN CATEGORÍA"),
        uploaded_at: uploadedAt,
        source_name: sourceName,
      };
    });
    await sql`INSERT INTO uploaded_payroll ${sql(values,
      "id","year","month","person_hash","person_name","hire_date","exit_date","area","dotacion","macro_region","region","category","uploaded_at","source_name"
    )} ON CONFLICT (id) DO UPDATE SET
      person_name=EXCLUDED.person_name,hire_date=EXCLUDED.hire_date,exit_date=EXCLUDED.exit_date,area=EXCLUDED.area,
      dotacion=EXCLUDED.dotacion,macro_region=EXCLUDED.macro_region,region=EXCLUDED.region,
      category=EXCLUDED.category,uploaded_at=EXCLUDED.uploaded_at,source_name=EXCLUDED.source_name`;
    return period;
  }

  const expected = Number(expectedRows);
  if (!Number.isInteger(expected) || expected < 1 || expected > 20000) throw new Error("La cantidad esperada de filas no es válida.");
  const countResult = await sql`SELECT COUNT(*)::INTEGER AS count FROM uploaded_payroll WHERE year=${year} AND month=${month}`;
  const storedRows = Number(countResult[0]?.count ?? 0);
  if (storedRows !== expectedRows) {
    throw new Error(`El periodo ${period} quedó incompleto: se recibieron ${storedRows} de ${expectedRows} filas. Vuelva a cargar el archivo; el periodo se reiniciará automáticamente.`);
  }
  await rebuildPeriod(sql, period, sourceName);
  const uploadedAt = new Date().toISOString();
  await replaceSource(sql, "Planilla", period, sourceName, uploadedAt, storedRows);
  return period;
}

async function savePayroll(sql: Database, records: PayrollRecord[], sourceName: string) {
  if (!records.length || records.length > 20000) throw new Error("No se encontraron filas válidas de Planilla.");
  const periods = Array.from(new Set(records.map((record) => record.period)));
  if (periods.length !== 1 || !periodPattern.test(periods[0])) throw new Error("La Planilla debe corresponder a un único periodo válido.");
  if (records.some((record) => !hashPattern.test(record.personHash) || (record.hireDate && !datePattern.test(record.hireDate)) || (record.exitDate && !datePattern.test(record.exitDate)))) throw new Error("La Planilla contiene identificadores o fechas inválidas.");
  if (new Set(records.map((record) => record.personHash)).size !== records.length) throw new Error("La Planilla contiene DNI duplicados. Cada persona debe figurar una sola vez por periodo.");
  const [year, month] = periods[0].split("-").map(Number);
  const uploadedAt = new Date().toISOString();
  const values = records.map((record) => {
    const area = safeText(record.area, "SIN ÁREA");
    const dotacion = safeText(record.dotacion, "SIN DOTACIÓN");
    const macroRegion = safeText(record.macroRegion, "SIN REGIÓN", 80);
    const region = safeText(record.region, "SIN CIUDAD");
    const category = safeText(record.category, "SIN CATEGORÍA");
    const personHash = protectedPersonHash(record.personHash);
    return {
      id: recordId([record.period, personHash]), year, month, person_hash: personHash,
      person_name: safeText(record.personName, "", 180) || null,
      hire_date: record.hireDate, exit_date: record.exitDate, area, dotacion, macro_region: macroRegion,
      region, category, uploaded_at: uploadedAt, source_name: sourceName,
    };
  });
  await sql`DELETE FROM uploaded_payroll WHERE year=${year} AND month=${month}`;
  await sql`INSERT INTO uploaded_payroll ${sql(values,
    "id","year","month","person_hash","person_name","hire_date","exit_date","area","dotacion","macro_region","region","category","uploaded_at","source_name"
  )}`;
  await rebuildPeriod(sql, periods[0], sourceName);
  await replaceSource(sql, "Planilla", periods[0], sourceName, uploadedAt, records.length);
  return periods[0];
}

async function saveTerms(sql: Database, records: TermRecord[], sourceName: string) {
  if (!records.length || records.length > 20000) throw new Error("No se encontraron filas válidas de Términos.");
  if (records.some((record) => !hashPattern.test(record.personHash) || !datePattern.test(record.termDate) || !safeText(record.reason, "", 120))) throw new Error("El archivo de Términos contiene identificadores, fechas o razones inválidas.");
  const periods = Array.from(new Set(records.map((record) => record.termDate.slice(0, 7)))).sort();
  const uploadedAt = new Date().toISOString();
  const values = records.map((record) => {
    const reason = safeText(record.reason, "sin_clasificar", 120);
    const personHash = protectedPersonHash(record.personHash);
    return {
      id: recordId([personHash, record.termDate]), person_hash: personHash, term_date: record.termDate,
      reason, uploaded_at: uploadedAt, source_name: sourceName,
    };
  });
  for (const key of periods) await sql`DELETE FROM uploaded_terms WHERE LEFT(term_date, 7)=${key}`;
  await sql`INSERT INTO uploaded_terms ${sql(values, "id","person_hash","term_date","reason","uploaded_at","source_name")}`;
  for (const key of periods) {
    await rebuildPeriod(sql, key, sourceName);
    const storedRows = records.filter((record) => record.termDate.startsWith(key)).length;
    await replaceSource(sql, "Términos", key, sourceName, uploadedAt, storedRows);
  }
  return periods.length === 1 ? periods[0] : periodLabel(periods);
}

async function saveLegacy(sql: Database, rows: AggregateRow[], sourceName: string) {
  if (!rows.length || rows.length > 5000) throw new Error("No se encontraron filas agregadas válidas.");
  if (rows.some((row) => !Number.isInteger(row.y) || row.m < 1 || row.m > 12 || [row.h,row.i,row.c,row.v,row.x,row.d3,row.d6].some((value) => !Number.isFinite(value) || value < 0))) throw new Error("El archivo contiene indicadores inválidos.");
  const uploadedAt = new Date().toISOString();
  const values = rows.map((row) => ({
    id: [row.y,row.m,row.a,row.d,row.r,row.q].join("|"), year: row.y, month: row.m, area: row.a, dotacion: row.d,
    macro_region: safeText(row.g, "SIN REGIÓN", 80), region: row.r, category: row.q, headcount: row.h,
    headcount_start: Number.isFinite(row.hs) ? row.hs! : row.h, headcount_end: Number.isFinite(row.he) ? row.he! : row.h,
    hires: row.i, exits: row.c, employee: row.v, company: row.x, desert3: row.d3, desert6: row.d6,
    uploaded_at: uploadedAt, source_name: sourceName,
  }));
  await sql`INSERT INTO uploaded_units ${sql(values,
    "id","year","month","area","dotacion","macro_region","region","category","headcount","headcount_start","headcount_end","hires","exits","employee","company","desert3","desert6","uploaded_at","source_name"
  )} ON CONFLICT (id) DO UPDATE SET macro_region=EXCLUDED.macro_region,headcount=EXCLUDED.headcount,headcount_start=EXCLUDED.headcount_start,headcount_end=EXCLUDED.headcount_end,hires=EXCLUDED.hires,exits=EXCLUDED.exits,employee=EXCLUDED.employee,company=EXCLUDED.company,desert3=EXCLUDED.desert3,desert6=EXCLUDED.desert6,uploaded_at=EXCLUDED.uploaded_at,source_name=EXCLUDED.source_name`;
  return `${rows[0].y}-${String(rows[0].m).padStart(2, "0")}`;
}

export async function GET() {
  try {
    const sql = database();
    const rows = await sql`SELECT year AS y,month AS m,area AS a,dotacion AS d,macro_region AS g,region AS r,category AS q,headcount AS h,COALESCE(headcount_start,headcount) AS hs,COALESCE(headcount_end,headcount) AS he,hires AS i,exits AS c,employee AS v,company AS x,desert3 AS d3,desert6 AS d6 FROM uploaded_units ORDER BY year,month,macro_region,region,area,category`;
    const uploads = await sql`SELECT "sourceType","periodLabel","sourceName","uploadedAt","storedRows" FROM (
      SELECT DISTINCT ON (source_type,period_label)
        source_type AS "sourceType",period_label AS "periodLabel",source_name AS "sourceName",
        uploaded_at AS "uploadedAt",stored_rows AS "storedRows"
      FROM uploaded_sources
      ORDER BY source_type,period_label,uploaded_at DESC
    ) AS latest_sources ORDER BY "uploadedAt" DESC`;
    const quality = await sql`SELECT
      payroll.year,
      payroll.month,
      COUNT(*)::INTEGER AS "payrollRows",
      COUNT(DISTINCT payroll.person_hash)::INTEGER AS "distinctPeople",
      COUNT(*) FILTER (WHERE payroll.area='SIN ÁREA')::INTEGER AS "missingArea",
      COUNT(*) FILTER (WHERE payroll.dotacion='SIN DOTACIÓN')::INTEGER AS "missingDotacion",
      COUNT(*) FILTER (WHERE payroll.region='SIN CIUDAD')::INTEGER AS "missingRegion",
      COUNT(*) FILTER (WHERE payroll.category='SIN CATEGORÍA')::INTEGER AS "missingCategory",
      COALESCE((SELECT SUM(units.headcount) FROM uploaded_units units WHERE units.year=payroll.year AND units.month=payroll.month),0)::INTEGER AS headcount,
      COALESCE((SELECT SUM(COALESCE(units.headcount_start,units.headcount)) FROM uploaded_units units WHERE units.year=payroll.year AND units.month=payroll.month),0)::INTEGER AS "headcountStart",
      COALESCE((SELECT SUM(COALESCE(units.headcount_end,units.headcount)) FROM uploaded_units units WHERE units.year=payroll.year AND units.month=payroll.month),0)::INTEGER AS "headcountEnd"
      FROM uploaded_payroll payroll
      GROUP BY payroll.year,payroll.month
      ORDER BY payroll.year,payroll.month`;
    const legacyUploads = await sql`SELECT 'Carga consolidada' AS "sourceType", CONCAT(month,'/',year) AS "periodLabel", source_name AS "sourceName",MAX(uploaded_at) AS "uploadedAt",COUNT(*)::INTEGER AS "storedRows" FROM uploaded_units GROUP BY year,month,source_name ORDER BY MAX(uploaded_at) DESC`;
    return Response.json({ rows, uploads: uploads.length ? uploads : legacyUploads, quality }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo consultar la base de datos." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!process.env.UPLOAD_PASSWORD || request.headers.get("x-upload-password") !== process.env.UPLOAD_PASSWORD) return Response.json({ error: "Clave de actualización incorrecta." }, { status: 401 });
  try {
    const payload = await request.json() as { kind?: "payroll" | "terms"; phase?: "start" | "append" | "commit"; period?: string; expectedRows?: number; records?: PayrollRecord[] | TermRecord[]; rows?: AggregateRow[]; sourceName?: string };
    const sql = database();
    const sourceName = safeText(payload.sourceName, "archivo de actualización");
    let period: string;
    if (payload.kind === "payroll" && payload.phase) period = await stagePayroll(sql, payload.phase, safeText(payload.period, "", 7), (payload.records ?? []) as PayrollRecord[], sourceName, payload.expectedRows);
    else if (payload.kind === "payroll") period = await savePayroll(sql, (payload.records ?? []) as PayrollRecord[], sourceName);
    else if (payload.kind === "terms") period = await saveTerms(sql, (payload.records ?? []) as TermRecord[], sourceName);
    else period = await saveLegacy(sql, payload.rows ?? [], sourceName);
    return Response.json({ ok: true, period });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo guardar la actualización." }, { status: 500 });
  }
}
