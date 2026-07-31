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
  headcountStart: number;
  headcountEnd: number;
  headcount: number;
  turnover: number;
  benchmark: number;
  employee: number;
  company: number;
  desert3: number;
  desert6: number;
};

const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const MONTHLY_TARGET = 4;
type DataRow = UnitRow & { y: number; hs?: number; he?: number };
const seedData: DataRow[] = unitData.map((row) => ({ ...row, y: 2026 }));
const MACRO_REGIONS = ["Norte", "Sur", "Centro", "Oriente"] as const;
const plain = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
const macroRegionFor = (row: DataRow) => {
  const named = plain(row.g ?? "");
  if (named.includes("NORTE")) return "Norte";
  if (named.includes("SUR")) return "Sur";
  if (named.includes("ORIENTE") || named.includes("SELVA")) return "Oriente";
  if (named.includes("CENTRO")) return "Centro";
  const place = plain(row.r);
  if (["IQUITOS","PUCALLPA","TARAPOTO","MOYOBAMBA","JUANJUI","TINGO MARIA","PUERTO MALDONADO","LA MERCED"].some((name) => place.includes(name))) return "Oriente";
  if (["AREQUIPA","CUSCO","PUNO","TACNA","MOQUEGUA","ICA","AYACUCHO"].some((name) => place.includes(name))) return "Sur";
  if (["TUMBES","PIURA","SULLANA","TALARA","CHICLAYO","LAMBAYEQUE","TRUJILLO","CHIMBOTE","HUARAZ","CAJAMARCA","JAEN"].some((name) => place.includes(name))) return "Norte";
  return "Centro";
};
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
  const [heatmapFocus, setHeatmapFocus] = useState<{ area: string; region: string } | null>(null);
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
    const uploadedPeriods = new Set(uploadedRows.map((row) => `${row.y}-${String(row.m).padStart(2, "0")}`));
    const seedPeriods = new Set(seedData.map((row) => `${row.y}-${String(row.m).padStart(2, "0")}`));
    const incompleteUploadedPeriods = new Set(Array.from(uploadedPeriods).filter((key) => {
      const rows = uploadedRows.filter((row) => `${row.y}-${String(row.m).padStart(2, "0")}` === key);
      return seedPeriods.has(key) && rows.some((row) => row.a === "SIN ÁREA" || row.d === "SIN DOTACIÓN");
    }));
    const fallbackRows = seedData.filter((row) => {
      const key = `${row.y}-${String(row.m).padStart(2, "0")}`;
      return !uploadedPeriods.has(key) || incompleteUploadedPeriods.has(key);
    });
    const validUploadedRows = uploadedRows.filter((row) => !incompleteUploadedPeriods.has(`${row.y}-${String(row.m).padStart(2, "0")}`));
    return [...fallbackRows, ...validUploadedRows];
  }, [uploadedRows]);
  const areas = useMemo(() => ["Todas las gerencias / áreas", ...Array.from(new Set(allUnits.map((row) => row.a))).sort()], [allUnits]);
  const groups = useMemo(() => ["Toda la dotación", ...Array.from(new Set(allUnits.map((row) => row.d))).sort()], [allUnits]);
  const availablePeriods = useMemo(() => Array.from(new Set(allUnits.map((row) => `${row.y}-${String(row.m).padStart(2, "0")}`))).sort(), [allUnits]);
  const monthlyData = useMemo(() => availablePeriods.map((key, index) => {
    const [year, monthNumber] = key.split("-").map(Number);
    const matchesFilters = (row: DataRow) => (area === areas[0] || row.a === area) && (group === groups[0] || row.d === group);
    const rows = allUnits.filter((row) => row.y === year && row.m === monthNumber && matchesFilters(row));
    const hires = rows.reduce((sum, row) => sum + row.i, 0);
    const exits = rows.reduce((sum, row) => sum + row.c, 0);
    const hasMonthlyBounds = rows.length > 0 && rows.every((row) => typeof row.hs === "number" && typeof row.he === "number");
    const headcountEnd = rows.reduce((sum, row) => sum + (hasMonthlyBounds ? row.he! : row.h), 0);
    const previousKey = availablePeriods[index - 1];
    const [previousYear, previousMonth] = previousKey ? previousKey.split("-").map(Number) : [0, 0];
    const isConsecutive = previousKey && previousYear * 12 + previousMonth === year * 12 + monthNumber - 1;
    const previousRows = isConsecutive
      ? allUnits.filter((row) => row.y === previousYear && row.m === previousMonth && matchesFilters(row))
      : [];
    const previousEnd = previousRows.reduce((sum, row) => sum + (typeof row.he === "number" ? row.he : row.h), 0);
    const headcountStart = hasMonthlyBounds
      ? rows.reduce((sum, row) => sum + row.hs!, 0)
      : isConsecutive ? previousEnd : Math.max(0, headcountEnd - hires + exits);
    const headcount = (headcountStart + headcountEnd) / 2;
    return {
      key,
      year,
      monthNumber,
      month: monthLabel(year, monthNumber),
      hires,
      exits,
      headcountStart,
      headcountEnd,
      headcount,
      turnover: headcount ? (exits / headcount) * 100 : 0,
      benchmark: 0,
      employee: rows.reduce((sum, row) => sum + row.v, 0),
      company: rows.reduce((sum, row) => sum + row.x, 0),
      desert3: rows.reduce((sum, row) => sum + row.d3, 0),
      desert6: rows.reduce((sum, row) => sum + row.d6, 0),
    };
  }), [availablePeriods, allUnits, area, group, areas, groups]);
  const availableYears = useMemo(() => Array.from(new Set(monthlyData.map((row) => row.year))).sort((a, b) => a - b), [monthlyData]);
  const currentYear = availableYears.at(-1) ?? 2026;
  const comparisonYear = currentYear - 1;
  const currentYearData = useMemo(() => monthlyData.filter((row) => row.year === currentYear), [monthlyData, currentYear]);
  const benchmarkByMonth = useMemo(() => new Map(monthlyData.filter((row) => row.year === comparisonYear).map((row) => [row.monthNumber, row])), [monthlyData, comparisonYear]);
  const hasBenchmark = benchmarkByMonth.size > 0;
  const comparisonData = useMemo(() => currentYearData
    .filter((row) => !hasBenchmark || benchmarkByMonth.has(row.monthNumber))
    .map((row) => ({ ...row, month: monthNames[row.monthNumber - 1], benchmark: benchmarkByMonth.get(row.monthNumber)?.turnover ?? 0 })),
  [currentYearData, benchmarkByMonth, hasBenchmark]);
  const comparisonLatest = comparisonData.at(-1);
  const comparisonGap = hasBenchmark && comparisonLatest ? comparisonLatest.turnover - comparisonLatest.benchmark : null;
  const data = useMemo(() => monthlyData.filter((row) => period === "Todos los periodos" || row.key === period), [monthlyData, period]);
  const totals = useMemo(() => {
    const headcountExposure = data.reduce((sum, row) => sum + row.headcount, 0);
    const hires = data.reduce((sum, row) => sum + row.hires, 0);
    const exits = data.reduce((sum, row) => sum + row.exits, 0);
    const employee = data.reduce((sum, row) => sum + row.employee, 0);
    const company = data.reduce((sum, row) => sum + row.company, 0);
    return {
      hires,
      exits,
      headcount: data.length ? headcountExposure / data.length : 0,
      turnover: headcountExposure ? exits / headcountExposure * 100 : 0,
      employee,
      company,
      desert3: data.reduce((sum, row) => sum + row.desert3, 0),
      desert6: data.reduce((sum, row) => sum + row.desert6, 0),
      employeeRate: headcountExposure ? employee / headcountExposure * 100 : 0,
      companyRate: headcountExposure ? company / headcountExposure * 100 : 0,
    };
  }, [data]);
  const evolutionTotals = useMemo(() => {
    const headcountExposure = currentYearData.reduce((sum, row) => sum + row.headcount, 0);
    const employee = currentYearData.reduce((sum, row) => sum + row.employee, 0);
    const company = currentYearData.reduce((sum, row) => sum + row.company, 0);
    return {
      employee,
      company,
      employeeRate: headcountExposure ? employee / headcountExposure * 100 : 0,
      companyRate: headcountExposure ? company / headcountExposure * 100 : 0,
    };
  }, [currentYearData]);
  const exitChartData = useMemo(() => currentYearData.map((row) => {
    if (view === "eventos") return row;
    return { ...row, employee: row.headcount ? (row.employee / row.headcount) * 100 : 0, company: row.headcount ? (row.company / row.headcount) * 100 : 0 };
  }), [currentYearData, view]);
  const currentMonth = useMemo(() => data.at(-1) ?? { key: "", year: 0, monthNumber: 0, month: "Sin datos", hires: 0, exits: 0, headcountStart: 0, headcountEnd: 0, headcount: 0, turnover: 0, benchmark: 0, employee: 0, company: 0, desert3: 0, desert6: 0 }, [data]);
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
  const desertionPeriods90 = useMemo(() => {
    if (!currentMonth.key) return [];
    const currentValue = currentMonth.year * 12 + currentMonth.monthNumber;
    return monthlyData.filter((row) => {
      const distance = currentValue - (row.year * 12 + row.monthNumber);
      return distance >= 0 && distance < 3;
    });
  }, [monthlyData, currentMonth.key, currentMonth.year, currentMonth.monthNumber]);
  const desertionPeriods180 = useMemo(() => {
    if (!currentMonth.key) return [];
    const currentValue = currentMonth.year * 12 + currentMonth.monthNumber;
    return monthlyData.filter((row) => {
      const distance = currentValue - (row.year * 12 + row.monthNumber);
      return distance >= 0 && distance < 6;
    });
  }, [monthlyData, currentMonth.key, currentMonth.year, currentMonth.monthNumber]);
  const hires90 = desertionPeriods90.reduce((sum, row) => sum + row.hires, 0);
  const desert3Count = desertionPeriods90.reduce((sum, row) => sum + row.desert3, 0);
  const desert3Rate = hires90 ? (desert3Count / hires90) * 100 : 0;
  const hires180 = desertionPeriods180.reduce((sum, row) => sum + row.hires, 0);
  const desert6Count = desertionPeriods180.reduce((sum, row) => sum + row.desert6, 0);
  const desert6Rate = hires180 ? (desert6Count / hires180) * 100 : 0;
  const impactArea = useMemo(() => {
    const selectedPeriods = new Set(data.map((row) => row.key));
    const rows = allUnits.filter((row) => selectedPeriods.has(`${row.y}-${String(row.m).padStart(2, "0")}`) && (area === areas[0] || row.a === area) && (group === groups[0] || row.d === group));
    const byArea = new Map<string, { exits: number; headcount: number }>();
    rows.forEach((row) => { const value = byArea.get(row.a) ?? { exits: 0, headcount: 0 }; value.exits += row.v; value.headcount += ((row.hs ?? row.h) + (row.he ?? row.h)) / 2; byArea.set(row.a, value); });
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
        item.headcount += ((row.hs ?? row.h) + (row.he ?? row.h)) / 2; item.exits += row.v;
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

  const latestPeriod = availablePeriods.filter((key) => key.startsWith(`${currentYear}-`)).at(-1) ?? `${currentYear}-01`;
  const [latestYear, latestMonth] = latestPeriod.split("-").map(Number);
  const heatmapPeriods = period === "Todos los periodos" ? availablePeriods : [period];
  const heatmapPeriodSet = new Set(heatmapPeriods);
  const heatmapPeriodLabel = period === "Todos los periodos"
    ? `Promedio mensual · ${heatmapPeriods.length} periodos`
    : (() => { const [year, month] = period.split("-").map(Number); return monthLabel(year, month); })();
  const geographyRows = allUnits.filter((row) => (area === areas[0] || row.a === area) && (group === groups[0] || row.d === group));
  const geographyMetric = (year: number, month: number, region: string, focusArea: string, city?: string) => {
    const matches = (row: DataRow, targetYear: number, targetMonth: number) => row.y === targetYear && row.m === targetMonth && row.a === focusArea && macroRegionFor(row) === region && (!city || row.r === city);
    const rows = geographyRows.filter((row) => matches(row, year, month));
    if (!rows.length) return null;
    const previousYear = month === 1 ? year - 1 : year;
    const previousMonth = month === 1 ? 12 : month - 1;
    const previousRows = geographyRows.filter((row) => matches(row, previousYear, previousMonth));
    const hasMonthlyBounds = rows.every((row) => typeof row.hs === "number" && typeof row.he === "number");
    const headcountEnd = rows.reduce((sum, row) => sum + (hasMonthlyBounds ? row.he! : row.h), 0);
    const hires = rows.reduce((sum, row) => sum + row.i, 0);
    const exits = rows.reduce((sum, row) => sum + row.c, 0);
    const previousEnd = previousRows.reduce((sum, row) => sum + (typeof row.he === "number" ? row.he : row.h), 0);
    const headcountStart = hasMonthlyBounds
      ? rows.reduce((sum, row) => sum + row.hs!, 0)
      : previousRows.length ? previousEnd : Math.max(0, headcountEnd - hires + exits);
    const headcount = (headcountStart + headcountEnd) / 2;
    const employee = rows.reduce((sum, row) => sum + row.v, 0);
    return { headcount, employee, rate: headcount ? employee / headcount * 100 : 0 };
  };
  const summarizeGeography = (region: string, focusArea: string, city?: string) => {
    const metrics = heatmapPeriods.map((key) => {
      const [year, month] = key.split("-").map(Number);
      return geographyMetric(year, month, region, focusArea, city);
    }).filter((value): value is NonNullable<typeof value> => value !== null);
    if (!metrics.length) return null;
    return {
      headcount: metrics.reduce((sum, value) => sum + value.headcount, 0) / metrics.length,
      employee: metrics.reduce((sum, value) => sum + value.employee, 0),
      rate: metrics.reduce((sum, value) => sum + value.rate, 0) / metrics.length,
      months: metrics.length,
    };
  };
  const heatmapAreas = Array.from(new Set(geographyRows
    .filter((row) => heatmapPeriodSet.has(`${row.y}-${String(row.m).padStart(2, "0")}`))
    .map((row) => row.a))).sort();
  const heatmapMatrix = heatmapAreas.map((focusArea) => ({
    area: focusArea,
    values: MACRO_REGIONS.map((region) => ({ region, metric: summarizeGeography(region, focusArea) })),
  }));
  const cityFocus = heatmapFocus ? Array.from(new Set(geographyRows
    .filter((row) => heatmapPeriodSet.has(`${row.y}-${String(row.m).padStart(2, "0")}`) && row.a === heatmapFocus.area && macroRegionFor(row) === heatmapFocus.region)
    .map((row) => row.r))).sort().map((city) => ({
      city,
      metric: summarizeGeography(heatmapFocus.region, heatmapFocus.area, city),
    })).filter((item) => item.metric).sort((a, b) => (b.metric?.rate ?? 0) - (a.metric?.rate ?? 0)) : [];

  const reset = () => { setPeriod("Todos los periodos"); setArea(areas[0]); setGroup(groups[0]); setHeatmapFocus(null); };
  return <main className="app-shell">
    <div className="dashboard">
      <header className="masthead">
        <div className="masthead-top">
          <div className="brand-line"><span className="brand-mark">N</span> PEOPLE ANALYTICS · NOGASA</div>
          <div className="masthead-actions">
            <a className="header-link" href="/archivos">Archivos y estructura</a>
            <p className="period-label">Periodo disponible · {availablePeriods.length ? `${monthLabel(Number(availablePeriods[0].slice(0,4)), Number(availablePeriods[0].slice(5)))}–${monthLabel(latestYear, latestMonth)}` : "Sin datos"}</p>
          </div>
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
          <label>Periodo<select value={period} onChange={(e) => { setPeriod(e.target.value); setHeatmapFocus(null); }}><option>Todos los periodos</option>{availablePeriods.map((key) => { const [year, month] = key.split("-").map(Number); return <option key={key} value={key}>{monthLabel(year, month)}</option>; })}</select></label>
          <label>Gerencia / área<select value={area} onChange={(e) => { setArea(e.target.value); setHeatmapFocus(null); }}>{areas.map((v) => <option key={v}>{v}</option>)}</select></label>
          <label>Grupo de dotación<select value={group} onChange={(e) => { setGroup(e.target.value); setHeatmapFocus(null); }}>{groups.map((v) => <option key={v}>{v}</option>)}</select></label>
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
        <article><span>Rotación deseada</span><strong>{summaryCompanyRate.toFixed(2)}%</strong><small>{summaryCompany} ceses</small></article>
      </section>

      <section className="evolution-stack">
        <article className="panel">
          <div className="panel-heading"><div><p className="kicker">TENDENCIA INTERANUAL</p><h3>Rotación mensual comparable</h3><p>{hasBenchmark ? `${currentYear} vs. ${comparisonYear}: cada punto enfrenta el mismo mes calendario.` : `La serie ${currentYear} está lista; el comparativo se activará al cargar ${comparisonYear}.`}</p></div><span className="badge">{hasBenchmark ? `${currentYear} vs. ${comparisonYear}` : `Pendiente ${comparisonYear}`}</span></div>
          <div className="comparison-summary">
            <article><span>{currentYear} · último mes común</span><strong>{comparisonLatest ? `${comparisonLatest.turnover.toFixed(2)}%` : "Sin datos"}</strong><small>{comparisonLatest?.month ?? "Pendiente"}</small></article>
            <article><span>{comparisonYear} · mismo mes</span><strong>{hasBenchmark && comparisonLatest ? `${comparisonLatest.benchmark.toFixed(2)}%` : "Pendiente"}</strong><small>{hasBenchmark ? "Base comparable" : "Se activará con la carga"}</small></article>
            <article><span>Brecha interanual</span><strong>{comparisonGap === null ? "Pendiente" : `${comparisonGap >= 0 ? "+" : ""}${comparisonGap.toFixed(2)} pp`}</strong><small>Diferencia en puntos porcentuales</small></article>
          </div>
          <LineChart data={comparisonData} series={hasBenchmark ? [{ key: "turnover", color: "#d6001c", label: String(currentYear), format: "percent" }, { key: "benchmark", color: "#0957c3", label: String(comparisonYear), format: "percent" }] : [{ key: "turnover", color: "#d6001c", label: String(currentYear), format: "percent" }]} />
        </article>
        <article className="panel">
          <div className="panel-heading"><div><p className="kicker">ORIGEN DEL CESE · {currentYear}</p><h3>Rotación no deseada vs. deseada</h3><p>Esta vista conserva únicamente el año actual para evitar mezclar series de años diferentes.</p></div><span className="badge">{currentYear}</span></div>
          <div className="segment"><button aria-pressed={view === "porcentaje"} onClick={() => setView("porcentaje")}>Porcentaje</button><button aria-pressed={view === "eventos"} onClick={() => setView("eventos")}>Eventos</button></div>
          <LineChart data={exitChartData} series={[{ key: "employee", color: "#d6001c", label: "Rotación no deseada", format: view === "porcentaje" ? "percent" : "count" }, { key: "company", color: "#0957c3", label: "Rotación deseada", format: view === "porcentaje" ? "percent" : "count" }]} />
          <div className="split-summary"><span><i className="red" />No deseada <strong>{view === "eventos" ? evolutionTotals.employee : `${evolutionTotals.employeeRate.toFixed(2)}%`}</strong></span><span><i className="blue" />Deseada <strong>{view === "eventos" ? evolutionTotals.company : `${evolutionTotals.companyRate.toFixed(2)}%`}</strong></span></div>
        </article>
      </section>

      <section className="story-card">
        <div><p className="story-label">PANORAMA DEL PERIODO</p><h2>{totals.employee >= totals.company ? "Las salidas por decisión del trabajador concentran la mayor parte de los ceses." : "Las salidas asociadas a la rotación deseada concentran la mayor parte de los ceses."}</h2><p>Los indicadores se recalculan con la ubicación organizacional que tenía cada trabajador en cada mes.</p></div>
        <div className="story-aside"><span>Rotación promedio del periodo</span><strong>{totals.turnover.toFixed(2)}%</strong><small>{area} · {group}</small></div>
      </section>

      <section className="panel table-panel">
        <div className="panel-heading"><div><p className="kicker">DETALLE MENSUAL</p><h3>Rotación total y origen de los ceses</h3><p>La meta se evaluará después, únicamente sobre la rotación no deseada.</p></div><span className="badge">{data.length} {data.length === 1 ? "mes" : "meses"}</span></div>
        <div className="table-wrap"><table><thead><tr><th>Mes</th><th>Ingresos</th><th>Ceses</th><th>Dotación prom.</th><th>Rotación total</th><th>No deseada N°</th><th>No deseada %</th><th>Deseada N°</th><th>Deseada %</th></tr></thead><tbody>{data.map((d) => <tr key={d.key}><td><strong>{d.month}</strong></td><td>{d.hires}</td><td>{d.exits}</td><td>{d.headcount.toLocaleString("es-PE")}</td><td><span className="rate">{d.turnover.toFixed(2)}%</span></td><td>{d.employee}</td><td><span className="worker-rate">{d.headcount ? ((d.employee / d.headcount) * 100).toFixed(2) : "0.00"}%</span></td><td>{d.company}</td><td><span className="company-rate">{d.headcount ? ((d.company / d.headcount) * 100).toFixed(2) : "0.00"}%</span></td></tr>)}</tbody></table></div>
      </section>

      <section className="worker-analysis panel">
        <div className="panel-heading"><div><p className="kicker">ANÁLISIS DE ROTACIÓN NO DESEADA</p><h3>Meta, deserción e impacto organizacional</h3><p>La referencia mensual de 4% se compara exclusivamente con los ceses por decisión del trabajador.</p></div><span className={totals.employeeRate <= MONTHLY_TARGET ? "goal-ok" : "goal-alert"}>{totals.employeeRate <= MONTHLY_TARGET ? "Dentro de meta" : "Supera la meta"}</span></div>
        <div className="worker-analysis-grid">
          <article className="worker-rate-card"><span>Rotación no deseada</span><strong>{totals.employeeRate.toFixed(2)}%</strong><small>Promedio mensual ponderado por dotación · meta ≤ 4%</small></article>
          <article><span>Deserción &lt;3 meses</span><strong>{desert3Count} <small>· {desert3Rate.toFixed(2)}%</small></strong><p>{desert3Count} salidas antes de 3 meses ÷ {hires90} ingresos de los últimos 90 días.</p></article>
          <article><span>Deserción &lt;6 meses</span><strong>{desert6Count} <small>· {desert6Rate.toFixed(2)}%</small></strong><p>{desert6Count} salidas antes de 6 meses ÷ {hires180} ingresos de los últimos 180 días.</p></article>
          <article><span>Área de mayor impacto</span><strong className="impact-name">{impactArea?.name ?? "Sin datos"}</strong><p>{impactArea ? `${impactArea.exits} ceses · ${impactArea.rate.toFixed(2)}% de rotación · ${impactArea.contribution.toFixed(1)}% de los ceses del trabajador` : "No hay ceses por decisión del trabajador en la selección."}</p></article>
        </div>
      </section>

      <section className="review-panel panel">
        <div className="panel-heading"><div><p className="kicker">FOCO DE GESTIÓN</p><h3>Principales áreas a revisar</h3><p>Áreas con más ceses por decisión del trabajador en el último mes mostrado.</p></div><span className="period-chip">{currentMonth.month}</span></div>
        <div className="review-table"><div className="review-head"><span>Área</span><span>Dotación</span><span>Ceses no deseados</span><span>Rotación</span><span>Variación mensual</span></div>{reviewAreas.length ? reviewAreas.map((item) => <article key={item.area} className="review-row"><div><strong>{item.area}</strong><small>{item.group}</small></div><span>{item.headcount.toLocaleString("es-PE")}</span><span>{item.exits}</span><span><b className={item.rate > MONTHLY_TARGET ? "review-alert" : "review-ok"}>{item.rate.toFixed(2)}%</b></span><span>{item.variation === null ? <b className="review-neutral">Sin base</b> : <b className={item.variation > 0 ? "review-alert" : "review-ok"}>{item.variation > 0 ? "↗" : item.variation < 0 ? "↘" : "→"} {Math.abs(item.variation).toFixed(2)} pp</b>}</span></article>) : <p className="empty-review">No hay ceses por decisión del trabajador en el último mes seleccionado.</p>}</div>
      </section>

      <section className="panel heatmap-panel">
        <div className="panel-heading"><div><p className="kicker">FOCO TERRITORIAL Y ORGANIZACIONAL</p><h3>Mapa de calor por región y gerencia</h3><p>{period === "Todos los periodos" ? "Cada celda muestra el promedio de las tasas mensuales del periodo." : "Cada celda muestra la rotación no deseada del mes seleccionado."} Seleccione una celda para revisar sus ciudades.</p></div><span className="badge">{heatmapPeriodLabel}</span></div>
        <div className="heatmap-legend"><span className="legend-good">Dentro de meta ≤ 4%</span><span className="legend-neutral">Sin información</span><span className="legend-alert">Requiere foco &gt; 4%</span></div>
        <div className="heatmap-scroll"><div className="heatmap-grid focus-grid" style={{ gridTemplateColumns: `minmax(250px, 1.5fr) repeat(${MACRO_REGIONS.length}, minmax(115px, 1fr))` }}>
          <div className="heat-corner">Gerencia ↓ / Región →</div>{MACRO_REGIONS.map((region) => <div className="heat-region" key={region}>{region}</div>)}
          {heatmapMatrix.length ? heatmapMatrix.map((item) => <div className="heat-row" key={item.area} style={{ display: "contents" }}><div className="heat-area heat-area-label">{item.area}</div>{item.values.map((value) => <button key={`${item.area}-${value.region}`} type="button" disabled={!value.metric} className={!value.metric ? "heat-cell empty" : value.metric.rate <= MONTHLY_TARGET ? "heat-cell good" : "heat-cell alert"} onClick={() => value.metric && setHeatmapFocus({ area: item.area, region: value.region })}>{value.metric ? `${value.metric.rate.toFixed(2)}%` : "—"}</button>)}</div>) : <div className="heat-cell empty">Sin información</div>}
        </div></div>
        {heatmapFocus && <div className="heat-detail"><div className="heat-detail-heading"><div><p className="kicker">DETALLE POR CIUDAD · {heatmapPeriodLabel.toUpperCase()}</p><h3>{heatmapFocus.area} · Región {heatmapFocus.region}</h3></div><button onClick={() => setHeatmapFocus(null)}>Volver al mapa</button></div><div className="table-wrap"><table><thead><tr><th>Ciudad</th><th>Dotación promedio</th><th>Ceses no deseados</th><th>{period === "Todos los periodos" ? "Rotación promedio" : "Rotación del mes"}</th><th>Evaluación</th></tr></thead><tbody>{cityFocus.length ? cityFocus.map((item) => <tr key={item.city}><td><strong>{item.city}</strong></td><td>{item.metric?.headcount.toLocaleString("es-PE") ?? "—"}</td><td>{item.metric?.employee ?? "—"}</td><td><span className="worker-rate">{item.metric ? `${item.metric.rate.toFixed(2)}%` : "—"}</span></td><td><span className={!item.metric ? "review-neutral" : item.metric.rate <= MONTHLY_TARGET ? "review-ok" : "review-alert"}>{!item.metric ? "Sin información" : item.metric.rate <= MONTHLY_TARGET ? "Dentro de meta" : "Requiere foco"}</span></td></tr>) : <tr><td colSpan={5}>No hay ciudades disponibles para esta selección.</td></tr>}</tbody></table></div></div>}
      </section>

      <details className="methodology"><summary>¿Qué se calcula en cada tasa?</summary><div><p><strong>Dotación promedio mensual:</strong> (dotación al inicio del mes + dotación al cierre del mes) ÷ 2. Si no existe el mes anterior, el inicio se reconstruye con cierre − ingresos + ceses.</p><p><strong>Rotación total:</strong> ceses del periodo ÷ dotación promedio × 100. La rotación no deseada y la rotación deseada usan, respectivamente, sus ceses sobre el mismo denominador.</p><p><strong>Deserción:</strong> salidas tempranas de la ventana ÷ ingresos de la misma ventana × 100. La ventana de 3 meses usa los últimos 90 días y la de 6 meses los últimos 180 días; ambas cambian con el mes analizado.</p></div></details>
      <footer>Fuente: planillas mensuales y términos de contrato · Último periodo: {monthLabel(latestYear, latestMonth)}</footer>
    </div>
  </main>;
}
