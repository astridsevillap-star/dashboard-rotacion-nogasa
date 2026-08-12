"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type Row = {
  id: string;
  termDate: string;
  reason: string | null;
  overrideBucket: "employee" | "company" | null;
  personName: string | null;
  area: string | null;
  dotacion: string | null;
  macroRegion: string | null;
  region: string | null;
  computedBucket: "employee" | "company" | null;
};

const monthNames = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const monthLabel = (isoDate: string) => {
  const [year, month, day] = isoDate.split("-").map(Number);
  return `${String(day).padStart(2, "0")} ${monthNames[month - 1]} ${year}`;
};
const reasonLabelFallback: Record<string, string> = {
  renuncia: "Renuncia",
  mutuo_disenso: "Mutuo disenso",
  terminacion_de_la_obra: "Terminación de obra",
  despido: "Despido",
  jubilacion: "Jubilación",
  fallecimiento: "Fallecimiento",
  no_se_inicio_relacion_laboral: "No inició relación laboral",
  injustificado: "Injustificado",
};

export default function ClassificationPage() {
  const [password, setPassword] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [reasonLabels, setReasonLabels] = useState<Record<string, string>>(reasonLabelFallback);
  const [search, setSearch] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = async () => {
    if (!password) return setStatus("Ingresa la clave de actualización.");
    setLoading(true);
    setStatus("Consultando ceses…");
    try {
      const response = await fetch("/api/classification", { headers: { "x-upload-password": password }, cache: "no-store" });
      const result = await response.json() as { rows?: Row[]; reasonLabels?: Record<string, string>; error?: string };
      if (!response.ok) throw new Error(result.error ?? "No se pudo consultar la información.");
      setRows(result.rows ?? []);
      setReasonLabels({ ...reasonLabelFallback, ...(result.reasonLabels ?? {}) });
      setUnlocked(true);
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Ocurrió un error al consultar.");
    } finally {
      setLoading(false);
    }
  };

  const setBucket = async (row: Row, bucket: "employee" | "company" | null) => {
    setSavingId(row.id);
    try {
      const response = await fetch("/api/classification", {
        method: "POST",
        headers: { "content-type": "application/json", "x-upload-password": password },
        body: JSON.stringify({ id: row.id, bucket }),
      });
      const result = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok) throw new Error(result.error ?? "No se pudo guardar el cambio.");
      setRows((current) => current.map((item) => item.id === row.id
        ? { ...item, overrideBucket: bucket, computedBucket: bucket ?? item.computedBucket }
        : item));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Ocurrió un error al guardar.");
    } finally {
      setSavingId(null);
    }
  };

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) => [row.personName, row.area, row.dotacion, row.region].some((value) => (value ?? "").toLowerCase().includes(term)));
  }, [rows, search]);

  const missingNames = rows.filter((row) => !row.personName).length;

  if (!unlocked) {
    return <main className="app-shell"><div className="dashboard">
      <header className="masthead files-masthead">
        <div className="masthead-top">
          <div className="brand-line"><span className="brand-mark">N</span> PEOPLE ANALYTICS · NOGASA</div>
          <div className="masthead-actions"><Link className="header-link" href="/">Volver al tablero</Link></div>
        </div>
        <div className="masthead-copy">
          <div>
            <p className="eyebrow">ACCESO RESTRINGIDO</p>
            <h1>Clasificación de ceses</h1>
            <p className="masthead-subtitle">Revisa quién está siendo considerado como rotación deseada o no deseada, y corrige los casos que lo requieran. Esta vista muestra nombres reales y solo es accesible con la clave de actualización.</p>
          </div>
        </div>
      </header>
      <section className="panel classification-gate">
        <label>Clave de actualización<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void load()} /></label>
        <button onClick={() => void load()} disabled={loading}>{loading ? "Verificando…" : "Ingresar"}</button>
        {status && <p className="upload-message" role="status">{status}</p>}
      </section>
    </div></main>;
  }

  return <main className="app-shell"><div className="dashboard">
    <header className="masthead files-masthead">
      <div className="masthead-top">
        <div className="brand-line"><span className="brand-mark">N</span> PEOPLE ANALYTICS · NOGASA</div>
        <div className="masthead-actions"><Link className="header-link" href="/">Volver al tablero</Link></div>
      </div>
      <div className="masthead-copy">
        <div>
          <p className="eyebrow">ACCESO RESTRINGIDO</p>
          <h1>Clasificación de ceses</h1>
          <p className="masthead-subtitle">{rows.length} ceses cargados · {missingNames} sin nombre registrado. Reclasificar un caso actualiza el tablero de inmediato.</p>
        </div>
      </div>
    </header>

    {missingNames > 0 && <section className="panel"><p className="upload-message" role="status">Hay {missingNames} ceses sin nombre porque la Planilla de ese periodo se cargó antes de incorporar la columna de nombre. Para completarlos, vuelve a cargar esa Planilla incluyendo "NOMBRES Y APELLIDOS" (o similar) desde el panel de carga del tablero.</p></section>}

    <section className="panel">
      <div className="panel-heading"><div><p className="kicker">BUSCAR</p><h3>Filtrar por nombre, área o ciudad</h3></div></div>
      <div className="independent-upload-fields"><label>Buscar<input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nombre, área o ciudad…" /></label></div>
    </section>

    <section className="panel">
      <div className="panel-heading"><div><p className="kicker">CESES REGISTRADOS</p><h3>Rotación deseada / no deseada por persona</h3><p>La columna "Clasificación" refleja el motivo cargado; usa los botones para corregirla caso por caso.</p></div><span className="badge">{filtered.length} de {rows.length}</span></div>
      <div className="data-table-wrap"><table className="data-table">
        <thead><tr><th>Persona</th><th>Área</th><th>Ciudad</th><th>Fecha de cese</th><th>Motivo</th><th>Clasificación</th></tr></thead>
        <tbody>{filtered.map((row) => {
          const bucket = row.overrideBucket ?? row.computedBucket;
          const disabled = row.reason === "no_se_inicio_relacion_laboral" || savingId === row.id;
          return <tr key={row.id}>
            <td><strong>{row.personName || "Sin nombre registrado"}</strong></td>
            <td>{row.area || "—"}</td>
            <td>{row.region || "—"}</td>
            <td>{monthLabel(row.termDate)}</td>
            <td>{row.reason ? (reasonLabels[row.reason] ?? row.reason) : "—"}</td>
            <td>
              <div className="bucket-toggle">
                <button type="button" disabled={disabled} className={bucket === "employee" ? "active alert" : ""} onClick={() => void setBucket(row, "employee")}>No deseada</button>
                <button type="button" disabled={disabled} className={bucket === "company" ? "active ok" : ""} onClick={() => void setBucket(row, "company")}>Deseada</button>
                {row.overrideBucket && <button type="button" className="reset-link" onClick={() => void setBucket(row, null)}>Restablecer</button>}
              </div>
            </td>
          </tr>;
        })}</tbody>
      </table></div>
      {status && <p className="upload-message" role="status">{status}</p>}
    </section>
  </div></main>;
}
