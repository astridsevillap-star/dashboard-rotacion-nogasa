// Reclassification API — deseada/no deseada por persona, protegida por clave.
import postgres from "postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

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

function authorized(request: Request) {
  return Boolean(process.env.UPLOAD_PASSWORD) && request.headers.get("x-upload-password") === process.env.UPLOAD_PASSWORD;
}

const reasonLabels: Record<string, string> = {
  renuncia: "Renuncia",
  mutuo_disenso: "Mutuo disenso",
  terminacion_de_la_obra: "Terminación de obra",
  despido: "Despido",
  jubilacion: "Jubilación",
  fallecimiento: "Fallecimiento",
  no_se_inicio_relacion_laboral: "No inició relación laboral",
  injustificado: "Injustificado",
};

// GET requiere la clave: expone nombres reales, no puede ser público.
export async function GET(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Clave de actualización incorrecta." }, { status: 401 });
  try {
    const sql = database();
    const rows = await sql`
      SELECT
        t.id,
        t.term_date AS "termDate",
        t.reason,
        t.override_bucket AS "overrideBucket",
        p.person_name AS "personName",
        p.area,
        p.dotacion,
        p.macro_region AS "macroRegion",
        p.region,
        CASE
          WHEN t.reason = 'no_se_inicio_relacion_laboral' THEN NULL
          WHEN t.override_bucket IS NOT NULL THEN t.override_bucket
          WHEN t.reason IN ('renuncia','mutuo_disenso') THEN 'employee'
          WHEN t.reason IS NOT NULL THEN 'company'
          ELSE NULL
        END AS "computedBucket"
      FROM uploaded_terms t
      LEFT JOIN uploaded_payroll p
        ON p.person_hash = t.person_hash
       AND p.exit_date = t.term_date
      ORDER BY t.term_date DESC, p.area NULLS LAST`;
    return Response.json({ rows, reasonLabels }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo consultar la base de datos." }, { status: 500 });
  }
}

// POST setea o limpia la reclasificación manual de un cese y recalcula el mes afectado.
export async function POST(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Clave de actualización incorrecta." }, { status: 401 });
  try {
    const payload = await request.json() as { id?: string; bucket?: "employee" | "company" | null };
    const id = String(payload.id ?? "").trim();
    const bucket = payload.bucket === "employee" || payload.bucket === "company" ? payload.bucket : null;
    if (!id) return Response.json({ error: "Falta el identificador del registro." }, { status: 400 });
    const sql = database();
    const existing = await sql`SELECT term_date AS "termDate" FROM uploaded_terms WHERE id=${id} LIMIT 1`;
    if (!existing.length) return Response.json({ error: "No se encontró el registro de cese." }, { status: 404 });
    await sql`UPDATE uploaded_terms SET override_bucket=${bucket} WHERE id=${id}`;
    const [year, month] = String(existing[0].termDate).slice(0, 7).split("-").map(Number);
    await sql`SELECT public.rebuild_uploaded_period(${year}, ${month}, ${"Reclasificación manual"})`;
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo guardar la reclasificación." }, { status: 500 });
  }
}
