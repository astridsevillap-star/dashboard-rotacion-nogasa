import { createHash, createHmac } from "node:crypto";
import postgres from "postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type AggregateRow = { y:number;m:number;a:string;d:string;g?:string;r:string;q:string;h:number;hs?:number;he?:number;i:number;c:number;v:number;x:number;d3:number;d6:number };
type PayrollRecord = { personHash:string;period:string;hireDate:string;exitDate:string;area:string;dotacion:string;macroRegion:string;region:string;category:string };
type TermRecord = { personHash:string;termDate:string;reason:string };

const monthNames = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const periodPattern = /^(20\d{2})-(0[1-9]|1[0-2])$/;
const datePattern = /^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const hashPattern = /^[a-f0-9]{64}$/;

type Database = ReturnType<typeof postgres>;

declare global {
  // Reutiliza el cliente entre solicitudes atendidas por la misma instancia de Vercel.
  // Sin este caché, cada GET/POST crea un pool nuevo que permanece abierto y agota
  // rápidamente el límite del Session Pooler de Supabase.
  var nogasaDatabase: Database | undefined;
}

function database(): Database {
  const url = process.env.SUPABASE_DATABASE_URL;
  if (!url) throw new Error("SUPABASE_DATABASE_URL no está configurada.");
  if (!globalThis.nogasaDatabase) {
    const connectionUrl = new URL(url);
    // Vercel es serverless: el Transaction Pooler (6543) multiplexa conexiones
    // y evita que cada instancia ocupe permanentemente un cliente del Session Pooler.
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

async function ensureSchema(sql: Database) {
  await sql`CREATE TABLE IF NOT EXISTS uploaded_units (
    id TEXT PRIMARY KEY, year INTEGER NOT NULL, month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
    area TEXT NOT NULL, dotacion TEXT NOT NULL, macro_region TEXT NOT NULL DEFAULT 'SIN REGIÓN',
    region TEXT NOT NULL, category TEXT NOT NULL, headcount INTEGER NOT NULL, hires INTEGER NOT NULL,
    exits INTEGER NOT NULL, employee INTEGER NOT NULL, company INTEGER NOT NULL, desert3 INTEGER NOT NULL,
    desert6 INTEGER NOT NULL, uploaded_at TIMESTAMPTZ NOT NULL, source_name TEXT NOT NULL
  )`;
  await sql`ALTER TABLE uploaded_units ADD COLUMN IF NOT EXISTS macro_region TEXT NOT NULL DEFAULT 'SIN REGIÓN'`;
  await sql`ALTER TABLE uploaded_units ADD COLUMN IF NOT EXISTS headcount_start INTEGER`;
  await sql`ALTER TABLE uploaded_units ADD COLUMN IF NOT EXISTS headcount_end INTEGER`;
  await sql`CREATE TABLE IF NOT EXISTS uploaded_payroll (
    id TEXT PRIMARY KEY, year INTEGER NOT NULL, month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
    person_hash TEXT NOT NULL, hire_date TEXT NOT NULL DEFAULT '', exit_date TEXT NOT NULL DEFAULT '',
    area TEXT NOT NULL, dotacion TEXT NOT NULL, macro_region TEXT NOT NULL, region TEXT NOT NULL,
    category TEXT NOT NULL, uploaded_at TIMESTAMPTZ NOT NULL, source_name TEXT NOT NULL
  )`;
  await sql`CREATE INDEX IF NOT EXISTS uploaded_payroll_period_idx ON uploaded_payroll(year, month)`;
  await sql`CREATE TABLE IF NOT EXISTS uploaded_terms (
    id TEXT PRIMARY KEY, person_hash TEXT NOT NULL, term_date TEXT NOT NULL, reason TEXT NOT NULL,
    uploaded_at TIMESTAMPTZ NOT NULL, source_name TEXT NOT NULL
  )`;
  await sql`CREATE INDEX IF NOT EXISTS uploaded_terms_period_idx ON uploaded_terms(term_date)`;
  await sql`CREATE TABLE IF NOT EXISTS uploaded_sources (
    id TEXT PRIMARY KEY, source_type TEXT NOT NULL, period_label TEXT NOT NULL, source_name TEXT NOT NULL,
    uploaded_at TIMESTAMPTZ NOT NULL, stored_rows INTEGER NOT NULL
  )`;
}

const safeText = (value: unknown, fallback: string, max = 180) => String(value ?? "").trim().slice(0, max) || fallback;
const recordId = (parts: string[]) => createHash("sha256").update(parts.join("|")).digest("hex");
const protectedPersonHash = (hash: string) => createHmac("sha256", process.env.UPLOAD_PASSWORD!).update(hash).digest("hex");
const daysBetween = (start: string, end: string) => Math.floor((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000);

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
  const payroll = await sql`SELECT person_hash, hire_date, exit_date, area, dotacion, macro_region, region, category
    FROM uploaded_payroll WHERE year=${year} AND month=${month}`;
  if (!payroll.length) return;
  const terms = await sql`SELECT person_hash, term_date, reason FROM uploaded_terms WHERE LEFT(term_date, 7)=${key}`;
  const existing = await sql`SELECT area, dotacion, macro_region, region, category, employee, company, desert3, desert6
    FROM uploaded_units WHERE year=${year} AND month=${month}`;
  const existingMap = new Map(existing.map((row) => [
    [row.area,row.dotacion,row.macro_region,row.region,row.category].join("|"),
    { employee:Number(row.employee),company:Number(row.company),desert3:Number(row.desert3),desert6:Number(row.desert6) },
  ]));
  const termMap = new Map(terms.map((row) => [`${row.person_hash}|${row.term_date}`, String(row.reason)]));
  const firstDay = `${key}-01`;
  const lastDay = `${key}-${String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, "0")}`;
  const groups = new Map<string, { a:string;d:string;g:string;r:string;q:string;people:Set<string>;peopleStart:Set<string>;peopleEnd:Set<string>;hires:Set<string>;exits:Set<string>;employee:Set<string>;company:Set<string>;d3:Set<string>;d6:Set<string> }>();

  for (const row of payroll) {
    const area = String(row.area);
    const dotacion = String(row.dotacion);
    const macroRegion = String(row.macro_region);
    const region = String(row.region);
    const category = String(row.category);
    const personHash = String(row.person_hash);
    const hireDate = String(row.hire_date);
    const exitDate = String(row.exit_date);
    const groupKey = [area, dotacion, macroRegion, region, category].join("|");
    if (!groups.has(groupKey)) groups.set(groupKey, { a:area,d:dotacion,g:macroRegion,r:region,q:category,people:new Set(),peopleStart:new Set(),peopleEnd:new Set(),hires:new Set(),exits:new Set(),employee:new Set(),company:new Set(),d3:new Set(),d6:new Set() });
    const group = groups.get(groupKey)!;
    group.people.add(personHash);
    const hiredByStart = !hireDate || hireDate <= firstDay;
    const hiredByEnd = !hireDate || hireDate <= lastDay;
    if (hiredByStart && (!exitDate || exitDate >= firstDay)) group.peopleStart.add(personHash);
    if (hiredByEnd && (!exitDate || exitDate >= lastDay)) group.peopleEnd.add(personHash);
    if (hireDate.startsWith(key)) group.hires.add(`${personHash}|${hireDate}`);
    if (exitDate.startsWith(key)) {
      const event = `${personHash}|${exitDate}`;
      const reason = termMap.get(event);
      if (reason !== "no_se_inicio_relacion_laboral") {
        group.exits.add(event);
        if (reason) {
          const voluntary = reason === "renuncia" || reason === "mutuo_disenso";
          if (voluntary) {
            group.employee.add(event);
            if (hireDate && daysBetween(hireDate, exitDate) <= 90) group.d3.add(event);
            if (hireDate && daysBetween(hireDate, exitDate) <= 180) group.d6.add(event);
          } else {
            group.company.add(event);
          }
        }
      }
    }
  }

  const uploadedAt = new Date().toISOString();
  const inserts = Array.from(groups.values()).map((group) => {
    const id = [year, month, group.a, group.d, group.r, group.q].join("|");
    const previous = existingMap.get([group.a,group.d,group.g,group.r,group.q].join("|"));
    const employee = terms.length ? group.employee.size : previous?.employee ?? 0;
    const company = terms.length ? group.company.size : previous?.company ?? 0;
    const desert3 = terms.length ? group.d3.size : previous?.desert3 ?? 0;
    const desert6 = terms.length ? group.d6.size : previous?.desert6 ?? 0;
    return sql`INSERT INTO uploaded_units (id, year, month, area, dotacion, macro_region, region, category, headcount, headcount_start, headcount_end, hires, exits, employee, company, desert3, desert6, uploaded_at, source_name)
      VALUES (${id},${year},${month},${group.a},${group.d},${group.g},${group.r},${group.q},${group.people.size},${group.peopleStart.size},${group.peopleEnd.size},${group.hires.size},${group.exits.size},${employee},${company},${desert3},${desert6},${uploadedAt},${sourceName})
      ON CONFLICT (id) DO UPDATE SET macro_region=EXCLUDED.macro_region,headcount=EXCLUDED.headcount,headcount_start=EXCLUDED.headcount_start,headcount_end=EXCLUDED.headcount_end,hires=EXCLUDED.hires,exits=EXCLUDED.exits,employee=EXCLUDED.employee,company=EXCLUDED.company,desert3=EXCLUDED.desert3,desert6=EXCLUDED.desert6,uploaded_at=EXCLUDED.uploaded_at,source_name=EXCLUDED.source_name`;
  });
  await sql`DELETE FROM uploaded_units WHERE year=${year} AND month=${month}`;
  for (const query of inserts) await query;
}

async function savePayroll(sql: Database, records: PayrollRecord[], sourceName: string) {
  if (!records.length || records.length > 20000) throw new Error("No se encontraron filas válidas de Planilla.");
  const periods = Array.from(new Set(records.map((record) => record.period)));
  if (periods.length !== 1 || !periodPattern.test(periods[0])) throw new Error("La Planilla debe corresponder a un único periodo válido.");
  if (records.some((record) => !hashPattern.test(record.personHash) || (record.hireDate && !datePattern.test(record.hireDate)) || (record.exitDate && !datePattern.test(record.exitDate)))) throw new Error("La Planilla contiene identificadores o fechas inválidas.");
  if (new Set(records.map((record) => record.personHash)).size !== records.length) throw new Error("La Planilla contiene DNI duplicados. Cada persona debe figurar una sola vez por periodo.");
  const [year, month] = periods[0].split("-").map(Number);
  const uploadedAt = new Date().toISOString();
  const inserts = records.map((record) => {
    const area = safeText(record.area, "SIN ÁREA");
    const dotacion = safeText(record.dotacion, "SIN DOTACIÓN");
    const macroRegion = safeText(record.macroRegion, "SIN REGIÓN", 80);
    const region = safeText(record.region, "SIN CIUDAD");
    const category = safeText(record.category, "SIN CATEGORÍA");
    const personHash = protectedPersonHash(record.personHash);
    const id = recordId([record.period, personHash]);
    return sql`INSERT INTO uploaded_payroll (id,year,month,person_hash,hire_date,exit_date,area,dotacion,macro_region,region,category,uploaded_at,source_name)
      VALUES (${id},${year},${month},${personHash},${record.hireDate},${record.exitDate},${area},${dotacion},${macroRegion},${region},${category},${uploadedAt},${sourceName})`;
  });
  await sql`DELETE FROM uploaded_payroll WHERE year=${year} AND month=${month}`;
  for (const query of inserts) await query;
  await rebuildPeriod(sql, periods[0], sourceName);
  await replaceSource(sql, "Planilla", periods[0], sourceName, uploadedAt, records.length);
  return periods[0];
}

async function saveTerms(sql: Database, records: TermRecord[], sourceName: string) {
  if (!records.length || records.length > 20000) throw new Error("No se encontraron filas válidas de Términos.");
  if (records.some((record) => !hashPattern.test(record.personHash) || !datePattern.test(record.termDate) || !safeText(record.reason, "", 120))) throw new Error("El archivo de Términos contiene identificadores, fechas o razones inválidas.");
  const periods = Array.from(new Set(records.map((record) => record.termDate.slice(0, 7)))).sort();
  const uploadedAt = new Date().toISOString();
  const deletes = periods.map((key) => sql`DELETE FROM uploaded_terms WHERE LEFT(term_date, 7)=${key}`);
  const inserts = records.map((record) => {
    const reason = safeText(record.reason, "sin_clasificar", 120);
    const personHash = protectedPersonHash(record.personHash);
    const id = recordId([personHash, record.termDate]);
    return sql`INSERT INTO uploaded_terms (id,person_hash,term_date,reason,uploaded_at,source_name) VALUES (${id},${personHash},${record.termDate},${reason},${uploadedAt},${sourceName})`;
  });
  for (const query of deletes) await query;
  for (const query of inserts) await query;
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
  const queries = rows.map((row) => {
    const id = [row.y,row.m,row.a,row.d,row.r,row.q].join("|");
    const macroRegion = safeText(row.g, "SIN REGIÓN", 80);
    const headcountStart = Number.isFinite(row.hs) ? row.hs! : row.h;
    const headcountEnd = Number.isFinite(row.he) ? row.he! : row.h;
    return sql`INSERT INTO uploaded_units (id,year,month,area,dotacion,macro_region,region,category,headcount,headcount_start,headcount_end,hires,exits,employee,company,desert3,desert6,uploaded_at,source_name)
      VALUES (${id},${row.y},${row.m},${row.a},${row.d},${macroRegion},${row.r},${row.q},${row.h},${headcountStart},${headcountEnd},${row.i},${row.c},${row.v},${row.x},${row.d3},${row.d6},${uploadedAt},${sourceName})
      ON CONFLICT (id) DO UPDATE SET macro_region=EXCLUDED.macro_region,headcount=EXCLUDED.headcount,headcount_start=EXCLUDED.headcount_start,headcount_end=EXCLUDED.headcount_end,hires=EXCLUDED.hires,exits=EXCLUDED.exits,employee=EXCLUDED.employee,company=EXCLUDED.company,desert3=EXCLUDED.desert3,desert6=EXCLUDED.desert6,uploaded_at=EXCLUDED.uploaded_at,source_name=EXCLUDED.source_name`;
  });
  for (const query of queries) await query;
  return `${rows[0].y}-${String(rows[0].m).padStart(2, "0")}`;
}

export async function GET() {
  try {
    const sql = database();
    await ensureSchema(sql);
    const periodsToRebuild = await sql`SELECT units.year,units.month,MAX(units.source_name) AS source_name
      FROM uploaded_units units
      WHERE (units.headcount_start IS NULL OR units.headcount_end IS NULL)
        AND EXISTS (SELECT 1 FROM uploaded_payroll payroll WHERE payroll.year=units.year AND payroll.month=units.month)
      GROUP BY units.year,units.month`;
    for (const item of periodsToRebuild) {
      const key = `${item.year}-${String(item.month).padStart(2, "0")}`;
      await rebuildPeriod(sql, key, String(item.source_name));
    }
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
      COALESCE((SELECT SUM(units.headcount) FROM uploaded_units units
        WHERE units.year=payroll.year AND units.month=payroll.month),0)::INTEGER AS headcount,
      COALESCE((SELECT SUM(COALESCE(units.headcount_start,units.headcount)) FROM uploaded_units units
        WHERE units.year=payroll.year AND units.month=payroll.month),0)::INTEGER AS "headcountStart",
      COALESCE((SELECT SUM(COALESCE(units.headcount_end,units.headcount)) FROM uploaded_units units
        WHERE units.year=payroll.year AND units.month=payroll.month),0)::INTEGER AS "headcountEnd"
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
    const payload = await request.json() as { kind?: "payroll" | "terms"; records?: PayrollRecord[] | TermRecord[]; rows?: AggregateRow[]; sourceName?: string };
    const sql = database();
    await ensureSchema(sql);
    const sourceName = safeText(payload.sourceName, "archivo de actualización");
    let period: string;
    if (payload.kind === "payroll") period = await savePayroll(sql, (payload.records ?? []) as PayrollRecord[], sourceName);
    else if (payload.kind === "terms") period = await saveTerms(sql, (payload.records ?? []) as TermRecord[], sourceName);
    else period = await saveLegacy(sql, payload.rows ?? [], sourceName);
    return Response.json({ ok: true, period });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo guardar la actualización." }, { status: 500 });
  }
}
