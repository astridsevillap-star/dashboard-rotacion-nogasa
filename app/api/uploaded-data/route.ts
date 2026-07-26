import { neon } from "@neondatabase/serverless";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type IncomingRow = { y:number;m:number;a:string;d:string;g?:string;r:string;q:string;h:number;i:number;c:number;v:number;x:number;d3:number;d6:number };

function database() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL no está configurada.");
  return neon(url);
}

async function ensureSchema() {
  const sql = database();
  await sql`CREATE TABLE IF NOT EXISTS uploaded_units (
    id TEXT PRIMARY KEY,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
    area TEXT NOT NULL,
    dotacion TEXT NOT NULL,
    macro_region TEXT NOT NULL DEFAULT 'SIN REGIÓN',
    region TEXT NOT NULL,
    category TEXT NOT NULL,
    headcount INTEGER NOT NULL,
    hires INTEGER NOT NULL,
    exits INTEGER NOT NULL,
    employee INTEGER NOT NULL,
    company INTEGER NOT NULL,
    desert3 INTEGER NOT NULL,
    desert6 INTEGER NOT NULL,
    uploaded_at TIMESTAMPTZ NOT NULL,
    source_name TEXT NOT NULL
  )`;
  await sql`ALTER TABLE uploaded_units ADD COLUMN IF NOT EXISTS macro_region TEXT NOT NULL DEFAULT 'SIN REGIÓN'`;
}

export async function GET() {
  try {
    await ensureSchema();
    const sql = database();
    const rows = await sql`SELECT year AS y, month AS m, area AS a, dotacion AS d, macro_region AS g, region AS r, category AS q, headcount AS h, hires AS i, exits AS c, employee AS v, company AS x, desert3 AS d3, desert6 AS d6 FROM uploaded_units ORDER BY year, month, macro_region, region, area, category`;
    const uploads = await sql`SELECT year, month, source_name AS "sourceName", MAX(uploaded_at) AS "uploadedAt", COUNT(*)::INTEGER AS "storedRows" FROM uploaded_units GROUP BY year, month, source_name ORDER BY year DESC, month DESC, MAX(uploaded_at) DESC`;
    return Response.json({ rows, uploads }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo consultar la base de datos." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!process.env.UPLOAD_PASSWORD || request.headers.get("x-upload-password") !== process.env.UPLOAD_PASSWORD) {
    return Response.json({ error: "Clave de actualización incorrecta." }, { status: 401 });
  }
  try {
    const payload = await request.json() as { rows?: IncomingRow[]; sourceName?: string };
    const rows = payload.rows ?? [];
    if (!rows.length || rows.length > 5000) return Response.json({ error: "No se encontraron filas agregadas válidas." }, { status: 400 });
    if (rows.some((row) => !Number.isInteger(row.y) || row.m < 1 || row.m > 12 || [row.h,row.i,row.c,row.v,row.x,row.d3,row.d6].some((value) => !Number.isFinite(value) || value < 0))) {
      return Response.json({ error: "El archivo contiene indicadores inválidos." }, { status: 400 });
    }
    await ensureSchema();
    const sql = database();
    const sourceName = (payload.sourceName ?? "archivo mensual").slice(0, 180);
    const uploadedAt = new Date().toISOString();
    const queries = rows.map((row) => {
      const id = [row.y, row.m, row.a, row.d, row.r, row.q].join("|");
      const macroRegion = (row.g ?? "SIN REGIÓN").slice(0, 80);
      return sql`INSERT INTO uploaded_units (id, year, month, area, dotacion, macro_region, region, category, headcount, hires, exits, employee, company, desert3, desert6, uploaded_at, source_name)
        VALUES (${id}, ${row.y}, ${row.m}, ${row.a}, ${row.d}, ${macroRegion}, ${row.r}, ${row.q}, ${row.h}, ${row.i}, ${row.c}, ${row.v}, ${row.x}, ${row.d3}, ${row.d6}, ${uploadedAt}, ${sourceName})
        ON CONFLICT (id) DO UPDATE SET macro_region=EXCLUDED.macro_region, headcount=EXCLUDED.headcount, hires=EXCLUDED.hires, exits=EXCLUDED.exits, employee=EXCLUDED.employee, company=EXCLUDED.company, desert3=EXCLUDED.desert3, desert6=EXCLUDED.desert6, uploaded_at=EXCLUDED.uploaded_at, source_name=EXCLUDED.source_name`;
    });
    for (let index = 0; index < queries.length; index += 250) {
      await sql.transaction(queries.slice(index, index + 250));
    }
    return Response.json({ ok: true, rows: rows.length, period: `${rows[0].y}-${String(rows[0].m).padStart(2, "0")}` });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo guardar la actualización." }, { status: 500 });
  }
}
