"use client";

import { useEffect, useMemo, useState } from "react";
import { unitData, type UnitRow } from "./data";
import MonthlyUploader from "./uploader";

type Month = {
  key: string;
  year: number;
  monthNumber: number;
  month: string;
  hires: number;
  exits: number;
  headcount: number;
  turnover: number;
  employee: number;
  company: number;
  desert3: number;
  desert6: number;
};

const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const MONTHLY_TARGET = 4;
type DataRow = UnitRow & { y: number };
const seedData: DataRow[] = unitData.map((row) => ({ ...row, y: 2026 }));
const monthLabel = (year: number, month: number) => `${monthNames[month - 1]} ${String(year).slice(-2)}`;
const smoothPath = (points: Array<{ x: number; y: number }>) => {
  if (!points.length) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  return points.slice(1).reduce((path, point, index) => {
    const previous = points[index];
    const before = points[index - 1] ?? previous;
    const after = points[index + 2] ?? point;
    const c1x = previous.x + (point.x - before.x) / 6;
    const c1y = previous.y + (point.y - before.y) / 6;
    const c2x = point.x - (after.x - previous.x) / 6;
    const c2y = point.y - (after.y - previous.y) / 6;
    return `${path} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${point.x} ${point.y}`;
  }, `M ${points[0].x} ${points[0].y}`);
};

function LineChart({ data, series, showTarget = false }: { data: Month[]; series: Array<{ key: keyof Month; color: string; label: string; format: "percent" | "count" }>; showTarget?: boolean }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const width = 720;
  const height = 230;
  const pad = 30;
  const values = data.flatMap((d) => series.map((s) => Number(d[s.key])));
  const max = Math.max(...values, showTarget ? MONTHLY_TARGET : 1, 1) * 1.25;
  const point = (value: number, index: number) => ({
    x: pad + (index * (width - pad * 2)) / Math.max(data.length - 1, 1),
    y: height - pad - (value / max) * (height - pad * 2),
  });
  const hoverX = hoverIndex === null ? 0 : point(0, hoverIndex).x;
  return (
    <div className="chart-frame">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Gráfico mensual" onPointerMove={(event) => { const box = event.currentTarget.getBoundingClientRect(); const x = ((event.clientX - box.left) / box.width) * width; const index = Math.round(((x - pad) / (width - pad * 2)) * Math.max(data.length - 1, 1)); setHoverIndex(Math.max(0, Math.min(data.length - 1, index))); }} onPointerLeave={() => setHoverIndex(null)}>
        {[0, 1, 2, 3].map((i) => <line key={i} x1={pad} x2={width - pad} y1={pad + i * 48} y2={pad + i * 48} className="grid-line" />)}
        {showTarget && <g><line x1={pad} x2={width - pad} y1={point(MONTHLY_TARGET, 0).y} y2={point(MONTHLY_TARGET, 0).y} className="target-line" /><text x={width - pad} y={point(MONTHLY_TARGET, 0).y - 7} textAnchor="end" className="target-label">Meta 4%</text></g>}
        {series.map((s) => {
          const pts = data.map((d, i) => point(Number(d[s.key]), i));
          return <g key={String(s.key)}>
            <path d={smoothPath(pts)} fill="none" stroke={s.color} strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />
            {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={hoverIndex === i ? 7 : 5} fill="white" stroke={s.color} strokeWidth="3" />)}
          </g>;
        })}
        {data.map((d, i) => <text key={d.month} x={point(0, i).x} y={height - 5} textAnchor="middle" className="axis-label">{d.month}</text>)}
        {hoverIndex !== null && <g className="hover-tooltip"><line x1={hoverX} x2={hoverX} y1={pad} y2={height - pad} /><rect x={Math.min(Math.max(hoverX - 78, 8), width - 164)} y="8" width="156" height={36 + series.length * 20} rx="10" /><text x={Math.min(Math.max(hoverX, 86), width - 86)} y="28" textAnchor="middle" className="hover-title">{data[hoverIndex].month}</text>{series.map((s, index) => { const value = Number(data[hoverIndex][s.key]); const label = s.format === "percent" ? `${value.toFixed(2)}%` : value.toFixed(0); return <text key={String(s.key)} x={Math.min(Math.max(hoverX, 86), width - 86)} y={49 + index * 20} textAnchor="middle" fill={s.color}>{s.label}: {label}</text>; })}</g>}
      </svg>
      <div className="legend">{series.map((s) => <span key={String(s.key)}><i style={{ background: s.color }} />{s.label}</span>)}{showTarget && <span><i className="target-swatch" />Meta mensual 4%</span>}</div>
    </div>
  );
}

export default function Home() {
  const [period, setPeriod] = useState("Todos los periodos");
  const [area, setArea] = useState("Todas las gerencias / áreas");
  const [group, setGroup] = useState("Toda la dotación");
  const [view, setView] = useState<"porcentaje" | "eventos">("porcentaje");
  const [heatmapArea, setHeatmapArea] = useState<string | null>(null);
  const [uploadedRows, setUploadedRows] = useState<DataRow[]>([]);
  const refreshUploaded = async () => {
    const response = await fetch("/api/uploaded-data", { cache: "no-store" });
    if (!response.ok) return;
    const result = await response.json() as { rows?: DataRow[] };
    setUploadedRows(result.rows ?? []);
  };
  useEffect(() => {
    fetch("/api/uploaded-data").then((response) => response.json()).then((result: { rows?: DataRow[] }) => setUploadedRows(result.rows ?? []));
  }, []);
  const allUnits = useMemo(() => {
    const rows = new Map<string, DataRow>();
    seedData.forEach((row) => rows.set([row.y,row.m,row.a,row.d,row.r,row.q].join("|"), row));
    uploadedRows.forEach((row) => rows.set([row.y,row.m,row.a,row.d,row.r,row.q].join("|"), row));
    return Array.from(rows.values());
  }, [uploadedRows]);
  const areas = useMemo(() => ["Todas las gerencias / áreas", ...Array.from(new Set(allUnits.map((row) => row.a))).sort()], [allUnits]);
  const groups = useMemo(() => ["Toda la dotación", ...Array.from(new Set(allUnits.map((row) => row.d))).sort()], [allUnits]);
  const availablePeriods = useMemo(() => Array.from(new Set(allUnits.map((row) => `${row.y}-${String(row.m).padStart(2, "0")}`))).sort(), [allUnits]);
  const monthlyData = useMemo(() => availablePeriods.map((key) => {
    const [year, monthNumber] = key.split("-").map(Number);
    const rows = allUnits.filter((r) => r.y === year && r.m === monthNumber && (area === areas[0] || r.a === area) && (group === groups[0] || r.d === group));
    const headcount = rows.reduce((sum, r) => sum + r.h, 0);
    const hires = rows.reduce((sum, r) => sum + r.i, 0);
    const exits = rows.reduce((sum, r) => sum + r.c, 0);
    return {
      key,
      year,
      monthNumber,
      month: monthLabel(year, monthNumber),
      hires,
      exits,
      headcount,
      turnover: headcount ? ((hires + exits) / 2 / headcount) * 100 : 0,
      employee: rows.reduce((sum, r) => sum + r.v, 0),
      company: rows.reduce((sum, r) => sum + r.x, 0),
      desert3: rows.reduce((sum, r) => sum + r.d3, 0),
      desert6: rows.reduce((sum, r) => sum + r.d6, 0),
    };
  }), [availablePeriods, allUnits, area, group, areas, groups]);
  const data = useMemo(() => monthlyData.filter((row) => period === "Todos los periodos" || row.key === period), [monthlyData, period]);
  const totals = useMemo(() => ({
    hires: data.reduce((a, b) => a + b.hires, 0),
    exits: data.reduce((a, b) => a + b.exits, 0),
    headcount: Math.round(data.reduce((a, b) => a + b.headcount, 0) / data.length),
    turnover: data.reduce((a, b) => a + b.turnover, 0) / data.length,
    employee: data.reduce((a, b) => a + b.employee, 0),
    company: data.reduce((a, b) => a + b.company, 0),
    desert3: data.reduce((a, b) => a + b.desert3, 0),
    desert6: data.reduce((a, b) => a + b.desert6, 0),
    employeeRate: data.reduce((sum, row) => sum + (row.headcount ? row.employee / row.headcount * 100 : 0), 0) / data.length,
    companyRate: data.reduce((sum, row) => sum + (row.headcount ? row.company / row.headcount * 100 : 0), 0) / data.length,
  }), [data]);
  const exitChartData = useMemo(() => data.map((row) => {
    if (view === "eventos" || row.exits === 0) return row;
    return { ...row, employee: row.headcount ? (row.employee / row.headcount) * 100 : 0, company: row.headcount ? (row.company / row.headcount) * 100 : 0 };
  }), [data, view]);
  const currentMonth = useMemo(() => data.at(-1) ?? { key: "", year: 0, monthNumber: 0, month: "Sin datos", hires: 0, exits: 0, headcount: 0, turnover: 0, employee: 0, company: 0, desert3: 0, desert6: 0 }, [data]);
  const currentEmployeeRate = currentMonth.headcount ? currentMonth.employee / currentMonth.headcount * 100 : 0;
  const currentCompanyRate = currentMonth.headcount ? currentMonth.company / currentMonth.headcount * 100 : 0;
  const isAllPeriods = period === "Todos los periodos";
  const summaryHires = isAllPeriods ? totals.hires : currentMonth.hires;
  const summaryExits = isAllPeriods ? totals.exits : currentMonth.exits;
  const summaryHeadcount = isAllPeriods ? totals.headcount : currentMonth.headcount;
  const summaryTurnover = isAllPeriods ? totals.turnover : currentMonth.turnover;
  const summaryEmployee = isAllPeriods ? totals.employee : currentMonth.employee;
  const summaryCompany = isAllPeriods ? totals.company : currentMonth.company;
  const summaryEmployeeRate = isAllPeriods ? totals.employeeRate : currentEmployeeRate;
  const summaryCompanyRate = isAllPeriods ? totals.companyRate : currentCompanyRate;
  const desertionPeriods = useMemo(() => {
    if (!currentMonth.key) return [];
    const currentIndex = monthlyData.findIndex((row) => row.key === currentMonth.key);
    return currentIndex < 0 ? [] : monthlyData.slice(Math.max(0, currentIndex - 2), currentIndex + 1);
  }, [monthlyData, currentMonth.key]);
  const hires90 = desertionPeriods.reduce((sum, row) => sum + row.hires, 0);
  const desert3Count = desertionPeriods.reduce((sum, row) => sum + row.desert3, 0);
  const desert3Rate = hires90 ? (desert3Count / hires90) * 100 : 0;
  const impactArea = useMemo(() => {
    const selectedPeriods = new Set(data.map((row) => row.key));
    const rows = allUnits.filter((row) => selectedPeriods.has(`${row.y}-${String(row.m).padStart(2, "0")}`) && (area === areas[0] || row.a === area) && (group === groups[0] || row.d === group));
    const byArea = new Map<string, { exits: number; headcount: number }>();
    rows.forEach((row) => { const value = byArea.get(row.a) ?? { exits: 0, headcount: 0 }; value.exits += row.v; value.headcount += row.h; byArea.set(row.a, value); });
    const top = Array.from(byArea.entries()).sort((a, b) => b[1].exits - a[1].exits || b[1].headcount - a[1].headcount)[0];
    return top ? { name: top[0], exits: top[1].exits, rate: top[1].headcount ? top[1].exits / top[1].headcount * 100 : 0, contribution: totals.employee ? top[1].exits / totals.employee * 100 : 0 } : null;
  }, [data, allUnits, area, group, areas, groups, totals.employee]);
  const reviewAreas = useMemo(() => {
    if (!currentMonth.key) return [];
    const previousMonth = data.length > 1 ? data[data.length - 2] : null;
    const aggregate = (key: string) => {
      const map = new Map<string, { area: string; group: string; headcount: number; exits: number }>();
      allUnits.filter((row) => `${row.y}-${String(row.m).padStart(2, "0")}` === key && (area === areas[0] || row.a === area) && (group === groups[0] || row.d === group)).forEach((row) => {
        const item = map.get(row.a) ?? { area: row.a, group: row.d, headcount: 0, exits: 0 };
        item.headcount += row.h; item.exits += row.v;
        if (item.group !== row.d) item.group = "Varias dotaciones";
        map.set(row.a, item);
      });
      return map;
    };
    const current = aggregate(currentMonth.key);
    const previous = previousMonth ? aggregate(previousMonth.key) : new Map<string, { area: string; group: string; headcount: number; exits: number }>();
    return Array.from(current.values()).map((item) => {
      const rate = item.headcount ? item.exits / item.headcount * 100 : 0;
      const old = previous.get(item.area);
      const oldRate = old?.headcount ? old.exits / old.headcount * 100 : null;
      return { ...item, rate, variation: oldRate === null ? null : rate - oldRate };
    }).filter((item) => item.exits > 0).sort((a, b) => b.exits - a.exits || b.rate - a.rate).slice(0, 5);
  }, [currentMonth, data, allUnits, area, group, areas, groups]);

  const latestPeriod = availablePeriods.at(-1) ?? "2026-06";
  const [latestYear, latestMonth] = latestPeriod.split("-").map(Number);
  const heatmapRows = useMemo(() => allUnits.filter((row) => row.y === latestYear && row.m === latestMonth && (group === groups[0] || row.d === group)), [allUnits, latestYear, latestMonth, group, groups]);
  const heatmapAreas = useMemo(() => Array.from(new Set(heatmapRows.map((row) => row.a))).sort(), [heatmapRows]);
  const heatmapRegions = useMemo(() => Array.from(new Set(heatmapRows.map((row) => row.r))).sort(), [heatmapRows]);
  const heatmapValue = (gerencia: string, region: string) => {
    const rows = heatmapRows.filter((row) => row.a === gerencia && row.r === region);
    const headcount = rows.reduce((sum, row) => sum + row.h, 0);
    const workerExits = rows.reduce((sum, row) => sum + row.v, 0);
    return headcount ? (workerExits / headcount) * 100 : null;
  };
  const heatmapDetail = useMemo(() => heatmapArea ? heatmapRows.filter((row) => row.a === heatmapArea).sort((a, b) => a.r.localeCompare(b.r) || a.q.localeCompare(b.q)) : [], [heatmapArea, heatmapRows]);

  const reset = () => { setPeriod("Todos los periodos"); setArea(areas[0]); setGroup(groups[0]); setHeatmapArea(null); };
  return <main className="app-shell">
    <div className="dashboard">
      <header className="masthead">
        <div className="masthead-top">
          <div className="brand-line"><span className="brand-mark">N</span> PEOPLE ANALYTICS · NOGASA</div>
          <p className="period-label">Periodo disponible · {availablePeriods.length ? `${monthLabel(Number(availablePeriods[0].slice(0,4)), Number(availablePeriods[0].slice(5)))}–${monthLabel(latestYear, latestMonth)}` : "Sin datos"}</p>
        </div>
        <div className="masthead-copy">
          <div>
            <p className="eyebrow">GESTIÓN DE PERSONAS</p>
            <h1>Rotación y permanencia</h1>
            <p className="masthead-subtitle">Una lectura ejecutiva de ingresos, ceses, dotación y deserción para tomar decisiones con contexto.</p>
          </div>
          <div className="source-stamp"><span>ÚLTIMA ACTUALIZACIÓN</span><strong>14 julio 2026</strong></div>
        </div>
      </header>

      <MonthlyUploader onUploaded={refreshUploaded} />

      <section className="filter-bar" aria-label="Filtros del dashboard">
        <div className="filters">
          <label>Periodo<select value={period} onChange={(e) => setPeriod(e.target.value)}><option>Todos los periodos</option>{availablePeriods.map((key) => { const [year, month] = key.split("-").map(Number); return <option key={key} value={key}>{monthLabel(year, month)}</option>; })}</select></label>
          <label>Gerencia / área<select value={area} onChange={(e) => setArea(e.target.value)}>{areas.map((v) => <option key={v}>{v}</option>)}</select></label>
          <label>Grupo de dotación<select value={group} onChange={(e) => setGroup(e.target.value)}>{groups.map((v) => <option key={v}>{v}</option>)}</select></label>
        </div>
        <button className="reset-button" onClick={reset}>Limpiar filtros</button>
      </section>

      <div className="section-heading"><div><p className="kicker">{isAllPeriods ? "DATOS ACUMULADOS DEL PERIODO" : "DATOS DEL MES"}</p><h2>{isAllPeriods ? "Todos los periodos" : currentMonth.month}</h2></div><p>{isAllPeriods ? "Los eventos se acumulan y la dotación corresponde al promedio mensual del periodo." : "Los cuadros muestran únicamente el mes seleccionado."}</p></div>

      <section className="metric-strip">
        <article><span>Ingresos</span><strong>{summaryHires}</strong><small>{isAllPeriods ? "eventos acumulados" : "eventos del mes"}</small></article>
        <article><span>Ceses</span><strong>{summaryExits}</strong><small>{isAllPeriods ? "eventos acumulados" : "eventos del mes"}</small></article>
        <article><span>Dotación</span><strong>{summaryHeadcount.toLocaleString("es-PE")}</strong><small>{isAllPeriods ? "promedio mensual del periodo" : "promedio del mes"}</small></article>
        <article><span>Rotación total</span><strong>{summaryTurnover.toFixed(2)}%</strong><small>{isAllPeriods ? "promedio mensual del periodo" : "resultado del mes"}</small></article>
        <article><span>Rotación no deseada</span><strong>{summaryEmployeeRate.toFixed(2)}%</strong><small>{summaryEmployee} ceses · meta 4%</small></article>
        <article><span>Empresa</span><strong>{summaryCompanyRate.toFixed(2)}%</strong><small>{summaryCompany} ceses</small></article>
      </section>

      <section className="story-card">
        <div><p className="story-label">PANORAMA DEL PERIODO</p><h2>{totals.employee >= totals.company ? "Las salidas por decisión del trabajador concentran la mayor parte de los ceses." : "Las salidas por decisión de la empresa concentran la mayor parte de los ceses."}</h2><p>Los indicadores se recalculan con la ubicación organizacional que tenía cada trabajador en cada mes.</p></div>
        <div className="story-aside"><span>Rotación promedio del periodo</span><strong>{totals.turnover.toFixed(2)}%</strong><small>{area} · {group}</small></div>
      </section>

      <section className="panel-grid">
        <article className="panel">
          <div className="panel-heading"><div><p className="kicker">EVOLUCIÓN</p><h3>Rotación mensual</h3><p>Comportamiento del KPI durante el periodo seleccionado.</p></div><span className="badge">% mensual</span></div>
          <LineChart data={data} series={[{ key: "turnover", color: "#d6001c", label: "Rotación total", format: "percent" }]} />
        </article>
        <article className="panel">
          <div className="panel-heading"><div><p className="kicker">ORIGEN DEL CESE</p><h3>No deseada vs. empresa</h3><p>Compara la causa de salida en el tiempo.</p></div></div>
          <div className="segment"><button aria-pressed={view === "porcentaje"} onClick={() => setView("porcentaje")}>Porcentaje</button><button aria-pressed={view === "eventos"} onClick={() => setView("eventos")}>Eventos</button></div>
          <LineChart data={exitChartData} series={[{ key: "employee", color: "#d6001c", label: "No deseada", format: view === "porcentaje" ? "percent" : "count" }, { key: "company", color: "#0957c3", label: "Decisión empresa", format: view === "porcentaje" ? "percent" : "count" }]} />
          <div className="split-summary"><span><i className="red" />No deseada <strong>{view === "eventos" ? totals.employee : `${totals.employeeRate.toFixed(2)}%`}</strong></span><span><i className="blue" />Empresa <strong>{view === "eventos" ? totals.company : `${totals.companyRate.toFixed(2)}%`}</strong></span></div>
        </article>
      </section>

      <section className="panel table-panel">
        <div className="panel-heading"><div><p className="kicker">DETALLE MENSUAL</p><h3>Rotación total y origen de los ceses</h3><p>La meta se evaluará después, únicamente sobre la rotación no deseada.</p></div><span className="badge">{data.length} {data.length === 1 ? "mes" : "meses"}</span></div>
        <div className="table-wrap"><table><thead><tr><th>Mes</th><th>Ingresos</th><th>Ceses</th><th>Dotación prom.</th><th>Rotación total</th><th>No deseada N°</th><th>No deseada %</th><th>Empresa N°</th><th>Empresa %</th></tr></thead><tbody>{data.map((d) => <tr key={d.key}><td><strong>{d.month}</strong></td><td>{d.hires}</td><td>{d.exits}</td><td>{d.headcount.toLocaleString("es-PE")}</td><td><span className="rate">{d.turnover.toFixed(2)}%</span></td><td>{d.employee}</td><td><span className="worker-rate">{d.headcount ? ((d.employee / d.headcount) * 100).toFixed(2) : "0.00"}%</span></td><td>{d.company}</td><td><span className="company-rate">{d.headcount ? ((d.company / d.headcount) * 100).toFixed(2) : "0.00"}%</span></td></tr>)}</tbody></table></div>
      </section>

      <section className="worker-analysis panel">
        <div className="panel-heading"><div><p className="kicker">ANÁLISIS DE ROTACIÓN NO DESEADA</p><h3>Meta, deserción e impacto organizacional</h3><p>La referencia mensual de 4% se compara exclusivamente con los ceses por decisión del trabajador.</p></div><span className={totals.employeeRate <= MONTHLY_TARGET ? "goal-ok" : "goal-alert"}>{totals.employeeRate <= MONTHLY_TARGET ? "Dentro de meta" : "Supera la meta"}</span></div>
        <div className="worker-analysis-grid">
          <article className="worker-rate-card"><span>Rotación no deseada</span><strong>{totals.employeeRate.toFixed(2)}%</strong><small>{totals.employee} ceses ÷ dotación promedio mensual · meta ≤ 4%</small></article>
          <article><span>Deserción &lt;3 meses</span><strong>{desert3Count} <small>· {desert3Rate.toFixed(2)}%</small></strong><p>{desert3Count} salidas antes de 3 meses ÷ {hires90} ingresos de los últimos 90 días.</p></article>
          <article><span>Deserción hasta 6 meses</span><strong>{totals.desert6} <small>· {totals.employee ? (totals.desert6 / totals.employee * 100).toFixed(2) : "0.00"}%</small></strong><p>Acumulado hasta 6 meses ÷ total de salidas del trabajador.</p></article>
          <article><span>Área de mayor impacto</span><strong className="impact-name">{impactArea?.name ?? "Sin datos"}</strong><p>{impactArea ? `${impactArea.exits} ceses · ${impactArea.rate.toFixed(2)}% de rotación · ${impactArea.contribution.toFixed(1)}% de los ceses del trabajador` : "No hay ceses por decisión del trabajador en la selección."}</p></article>
        </div>
      </section>

      <section className="review-panel panel">
        <div className="panel-heading"><div><p className="kicker">FOCO DE GESTIÓN</p><h3>Principales áreas a revisar</h3><p>Áreas con más ceses por decisión del trabajador en el último mes mostrado.</p></div><span className="period-chip">{currentMonth.month}</span></div>
        <div className="review-table"><div className="review-head"><span>Área</span><span>Dotación</span><span>Ceses no deseados</span><span>Rotación</span><span>Variación mensual</span></div>{reviewAreas.length ? reviewAreas.map((item) => <article key={item.area} className="review-row"><div><strong>{item.area}</strong><small>{item.group}</small></div><span>{item.headcount.toLocaleString("es-PE")}</span><span>{item.exits}</span><span><b className={item.rate > MONTHLY_TARGET ? "review-alert" : "review-ok"}>{item.rate.toFixed(2)}%</b></span><span>{item.variation === null ? <b className="review-neutral">Sin base</b> : <b className={item.variation > 0 ? "review-alert" : "review-ok"}>{item.variation > 0 ? "↗" : item.variation < 0 ? "↘" : "→"} {Math.abs(item.variation).toFixed(2)} pp</b>}</span></article>) : <p className="empty-review">No hay ceses por decisión del trabajador en el último mes seleccionado.</p>}</div>
      </section>

      <section className="panel heatmap-panel">
        <div className="panel-heading"><div><p className="kicker">ÚLTIMO MES · {monthLabel(latestYear, latestMonth).toUpperCase()}</p><h3>Mapa de calor por regiones y ciudades</h3><p>Vista inicial: gerencia por región. Haz clic en una gerencia para ingresar al detalle de ciudad/sucursal y área. El color representa la rotación no deseada.</p></div><span className="badge">Meta no deseada 4%</span></div>
        <div className="heatmap-scroll"><div className="heatmap-grid" style={{ gridTemplateColumns: `minmax(230px, 1.5fr) repeat(${heatmapRegions.length}, minmax(92px, 1fr))` }}>
          <div className="heat-corner">Gerencia ↓ / Región →</div>{heatmapRegions.map((region) => <div className="heat-region" key={region}>{region}</div>)}
          {heatmapAreas.map((gerencia) => <div className="heat-row" key={gerencia} style={{ display: "contents" }}><button className={heatmapArea === gerencia ? "heat-area active" : "heat-area"} onClick={() => setHeatmapArea(heatmapArea === gerencia ? null : gerencia)}>{gerencia}</button>{heatmapRegions.map((region) => { const value = heatmapValue(gerencia, region); return <div key={`${gerencia}-${region}`} className={value === null ? "heat-cell empty" : value <= MONTHLY_TARGET ? "heat-cell good" : "heat-cell alert"}>{value === null ? "—" : `${value.toFixed(2)}%`}</div>; })}</div>)}
        </div></div>
        {heatmapArea && <div className="heat-detail"><div className="heat-detail-heading"><div><p className="kicker">NIVEL INTERNO · CIUDAD / SUCURSAL / ÁREA</p><h3>{heatmapArea}</h3></div><button onClick={() => setHeatmapArea(null)}>Volver al mapa</button></div><div className="table-wrap"><table><thead><tr><th>Región / ciudad</th><th>Sucursal / dotación</th><th>Área / categoría</th><th>Dotación</th><th>Ceses no deseados</th><th>Rotación no deseada</th><th>Meta no deseada</th></tr></thead><tbody>{heatmapDetail.map((row, index) => { const rate = row.h ? row.v / row.h * 100 : 0; return <tr key={`${row.r}-${row.q}-${row.d}-${index}`}><td>{row.r}</td><td>{row.d}</td><td>{row.q}</td><td>{row.h}</td><td>{row.v}</td><td><span className="worker-rate">{rate.toFixed(2)}%</span></td><td><span className={rate <= MONTHLY_TARGET ? "goal-ok" : "goal-alert"}>{rate <= MONTHLY_TARGET ? "Dentro de meta" : "Supera 4%"}</span></td></tr>; })}</tbody></table></div></div>}
      </section>

      <details className="methodology"><summary>¿Qué se calcula en cada tasa?</summary><div><p><strong>Rotación total:</strong> ((ingresos + ceses) ÷ 2) ÷ dotación promedio × 100. Es descriptiva y no se compara con la meta.</p><p><strong>Rotación no deseada:</strong> ceses por decisión del trabajador ÷ dotación promedio × 100. Solo esta tasa se compara con la meta mensual de 4%.</p><p><strong>Deserción &lt;3 meses:</strong> salidas antes de 3 meses ÷ ingresos de los últimos 90 días × 100. La deserción acumulada hasta 6 meses conserva como referencia las salidas por decisión del trabajador.</p></div></details>
      <footer>Fuente: planillas mensuales y términos de contrato · Último periodo: {monthLabel(latestYear, latestMonth)}</footer>
    </div>
  </main>;
}
