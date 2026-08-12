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
const SMALL_AREA_THRESHOLD = 15;
type DataRow = UnitRow & { y: number; hs?: number; he?: number };
const seedData: DataRow[] = unitData.map((row) => ({ ...row, y: 2026 }));
const MACRO_REGIONS = ["Lima", "Norte", "Sur", "Centro", "Oriente"] as const;
const plain = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
const displayHeadcount = (value: number) => Math.ceil(value).toLocaleString("es-PE");
const macroRegionFor = (row: DataRow) => {
  const named = plain(row.g ?? "");
  const place = plain(row.r);
  if (named.includes("LIMA") || ["LIMA","LOS OLIVOS","SAN LUIS"].some((name) => place.includes(name))) return "Lima";
  if (named.includes("NORTE")) return "Norte";
  if (named.includes("SUR")) return "Sur";
  if (named.includes("ORIENTE") || named.includes("SELVA")) return "Oriente";
  if (named.includes("CENTRO")) return "Centro";
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
  const width = 1180;
  const height = 320;
  const pad = 40;
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
        {[0, 1, 2, 3].map((i) => <line key={i} x1={pad} x2={width - pad} y1={pad + i * 80} y2={pad + i * 80} className="grid-line" />)}
        {showTarget && <g><line x1={pad} x2={width - pad} y1={point(MONTHLY_TARGET, 0).y} y2={point(MONTHLY_TARGET, 0).y} className="target-line" /><text x={width - pad} y={point(MONTHLY_TARGET, 0).y - 7} textAnchor="end" className="target-label">Meta 4%</text></g>}
        {series.map((s) => {
          const pts = data.map((d, i) => point(Number(d[s.key]), i));
          return <g key={String(s.key)}>
            <path d={smoothPath(pts)} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={hoverIndex === i ? 5 : 3} fill="white" stroke={s.color} strokeWidth="2" />)}
          </g>;
        })}
        {data.map((d, i) => <text key={d.month} x={point(0, i).x} y={height - 5} textAnchor="middle" className="axis-label">{d.month}</text>)}
        {hoverIndex !== null && <g className="hover-tooltip"><line x1={hoverX} x2={hoverX} y1={pad} y2={height - pad} /><rect x={Math.min(Math.max(hoverX - 78, 8), width - 164)} y="8" width="156" height={36 + series.length * 20} rx="10" /><text x={Math.min(Math.max(hoverX, 86), width - 86)} y="28" textAnchor="middle" className="hover-title">{data[hoverIndex].month}</text>{series.map((s, index) => { const value = Number(data[hoverIndex][s.key]); const label = s.format === "percent" ? `${value.toFixed(2)}%` : value.toFixed(0); return <text key={String(s.key)} x={Math.min(Math.max(hoverX, 86), width - 86)} y={49 + index * 20} textAnchor="middle" fill={s.color}>{s.label}: {label}</text>; })}</g>}
      </svg>
      <div className="legend">{series.map((s) => <span key={String(s.key)}><i style={{ background: s.color }} />{s.label}</span>)}{showTarget && <span><i className="target-swatch" />Meta mensual 4%</span>}</div>
    </div>
  );
}

type RangeMode = "1m" | "3m" | "6m" | "ytd" | "all";

export default function Home() {
  const [rangeMode, setRangeMode] = useState<RangeMode>("1m");
  const [area, setArea] = useState("Todas las gerencias / áreas");
  const [group, setGroup] = useState("Toda la dotación");
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
  const employeeComparisonData = useMemo(() => currentYearData
    .filter((row) => !hasBenchmark || benchmarkByMonth.has(row.monthNumber))
    .map((row) => {
      const rate = row.headcount ? (row.employee / row.headcount) * 100 : 0;
      const benchmarkRow = benchmarkByMonth.get(row.monthNumber);
      const benchmarkRate = benchmarkRow && benchmarkRow.headcount ? (benchmarkRow.employee / benchmarkRow.headcount) * 100 : 0;
      return { ...row, month: monthNames[row.monthNumber - 1], turnover: rate, benchmark: benchmarkRate };
    }),
  [currentYearData, benchmarkByMonth, hasBenchmark]);
  const employeeComparisonLatest = employeeComparisonData.at(-1);
  const employeeComparisonGap = hasBenchmark && employeeComparisonLatest ? employeeComparisonLatest.turnover - employeeComparisonLatest.benchmark : null;
  const isSingleMonth = rangeMode === "1m";
  const selectedPeriodKeys = useMemo(() => {
    if (!availablePeriods.length) return [];
    if (rangeMode === "all") return availablePeriods;
    if (rangeMode === "ytd") {
      const latestYear = Number(availablePeriods[availablePeriods.length - 1].slice(0, 4));
      return availablePeriods.filter((key) => key.startsWith(`${latestYear}-`));
    }
    const count = rangeMode === "1m" ? 1 : rangeMode === "3m" ? 3 : 6;
    return availablePeriods.slice(-count);
  }, [availablePeriods, rangeMode]);
  const selectedPeriodSet = useMemo(() => new Set(selectedPeriodKeys), [selectedPeriodKeys]);
  const rangeLabelText = useMemo(() => {
    if (!selectedPeriodKeys.length) return "Sin datos";
    const first = selectedPeriodKeys[0].split("-").map(Number);
    const last = selectedPeriodKeys[selectedPeriodKeys.length - 1].split("-").map(Number);
    return selectedPeriodKeys.length === 1 ? monthLabel(first[0], first[1]) : `${monthLabel(first[0], first[1])} a ${monthLabel(last[0], last[1])}`;
  }, [selectedPeriodKeys]);
  const data = useMemo(() => monthlyData.filter((row) => selectedPeriodSet.has(row.key)), [monthlyData, selectedPeriodSet]);
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
  const currentMonth = useMemo(() => data.at(-1) ?? { key: "", year: 0, monthNumber: 0, month: "Sin datos", hires: 0, exits: 0, headcountStart: 0, headcountEnd: 0, headcount: 0, turnover: 0, benchmark: 0, employee: 0, company: 0, desert3: 0, desert6: 0 }, [data]);
  const currentEmployeeRate = currentMonth.headcount ? currentMonth.employee / currentMonth.headcount * 100 : 0;
  const currentCompanyRate = currentMonth.headcount ? currentMonth.company / currentMonth.headcount * 100 : 0;
  const isAllPeriods = !isSingleMonth;
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
  const desertionPeriods90Prior = useMemo(() => {
    if (!currentMonth.key) return [];
    const currentValue = (currentMonth.year - 1) * 12 + currentMonth.monthNumber;
    return monthlyData.filter((row) => {
      const distance = currentValue - (row.year * 12 + row.monthNumber);
      return distance >= 0 && distance < 3;
    });
  }, [monthlyData, currentMonth.key, currentMonth.year, currentMonth.monthNumber]);
  const desertionPeriods180Prior = useMemo(() => {
    if (!currentMonth.key) return [];
    const currentValue = (currentMonth.year - 1) * 12 + currentMonth.monthNumber;
    return monthlyData.filter((row) => {
      const distance = currentValue - (row.year * 12 + row.monthNumber);
      return distance >= 0 && distance < 6;
    });
  }, [monthlyData, currentMonth.key, currentMonth.year, currentMonth.monthNumber]);
  const hires90Prior = desertionPeriods90Prior.reduce((sum, row) => sum + row.hires, 0);
  const desert3CountPrior = desertionPeriods90Prior.reduce((sum, row) => sum + row.desert3, 0);
  const desert3RatePrior = hires90Prior ? (desert3CountPrior / hires90Prior) * 100 : 0;
  const hires180Prior = desertionPeriods180Prior.reduce((sum, row) => sum + row.hires, 0);
  const desert6CountPrior = desertionPeriods180Prior.reduce((sum, row) => sum + row.desert6, 0);
  const desert6RatePrior = hires180Prior ? (desert6CountPrior / hires180Prior) * 100 : 0;
  const hasDesertionPrior90 = desertionPeriods90Prior.length === desertionPeriods90.length && desertionPeriods90.length > 0;
  const hasDesertionPrior180 = desertionPeriods180Prior.length === desertionPeriods180.length && desertionPeriods180.length > 0;
  const rangeLabel = (rows: Month[]) => !rows.length ? "" : rows.length === 1 ? rows[0].month : `${rows[0].month} a ${rows[rows.length - 1].month}`;
  const desertionWindowLabel90 = rangeLabel(desertionPeriods90);
  const desertionWindowLabel180 = rangeLabel(desertionPeriods180);
  const priorYearTotals = useMemo(() => {
    const rows = data.map((row) => benchmarkByMonth.get(row.monthNumber)).filter((row): row is Month => Boolean(row));
    const headcountExposure = rows.reduce((sum, row) => sum + row.headcount, 0);
    const employee = rows.reduce((sum, row) => sum + row.employee, 0);
    return {
      employeeRate: headcountExposure ? (employee / headcountExposure) * 100 : 0,
      hasData: rows.length > 0 && rows.length === data.length,
    };
  }, [data, benchmarkByMonth]);
  const employeeRateGap = priorYearTotals.hasData ? totals.employeeRate - priorYearTotals.employeeRate : null;
  const impactArea = useMemo(() => {
    const selectedPeriods = new Set(data.map((row) => row.key));
    const rows = allUnits.filter((row) => selectedPeriods.has(`${row.y}-${String(row.m).padStart(2, "0")}`) && (area === areas[0] || row.a === area) && (group === groups[0] || row.d === group));
    const byArea = new Map<string, { exits: number; headcountExposure: number }>();
    rows.forEach((row) => {
      const value = byArea.get(row.a) ?? { exits: 0, headcountExposure: 0 };
      value.exits += row.v;
      value.headcountExposure += ((row.hs ?? row.h) + (row.he ?? row.h)) / 2;
      byArea.set(row.a, value);
    });
    const months = Math.max(data.length, 1);
    const scopeExposure = Array.from(byArea.values()).reduce((sum, item) => sum + item.headcountExposure, 0);
    const ranked = Array.from(byArea.entries()).map(([name, item]) => {
      const averageHeadcount = item.headcountExposure / months;
      const rate = item.headcountExposure ? item.exits / item.headcountExposure * 100 : 0;
      const impactPoints = scopeExposure ? item.exits / scopeExposure * 100 : 0;
      const smallBase = averageHeadcount <= SMALL_AREA_THRESHOLD;
      return { name, exits: item.exits, headcount: averageHeadcount, rate, impactPoints, smallBase };
    }).filter((item) => item.exits > 0).sort((a, b) => b.impactPoints - a.impactPoints || b.exits - a.exits || b.rate - a.rate);
    return ranked[0] ?? null;
  }, [data, allUnits, area, group, areas, groups]);
  const reviewAreas = useMemo(() => {
    if (!selectedPeriodKeys.length) return [];
    const currentKeys = selectedPeriodSet;
    const firstIndex = availablePeriods.indexOf(selectedPeriodKeys[0]);
    const previousKeys = new Set(firstIndex >= selectedPeriodKeys.length ? availablePeriods.slice(firstIndex - selectedPeriodKeys.length, firstIndex) : []);
    const aggregate = (keys: Set<string>) => {
      const map = new Map<string, { area: string; group: string; headcount: number; exits: number }>();
      allUnits.filter((row) => keys.has(`${row.y}-${String(row.m).padStart(2, "0")}`) && (area === areas[0] || row.a === area) && (group === groups[0] || row.d === group)).forEach((row) => {
        const item = map.get(row.a) ?? { area: row.a, group: row.d, headcount: 0, exits: 0 };
        item.headcount += ((row.hs ?? row.h) + (row.he ?? row.h)) / 2;
        item.exits += row.v;
        if (item.group !== row.d) item.group = "Varias dotaciones";
        map.set(row.a, item);
      });
      return map;
    };
    const current = aggregate(currentKeys);
    const previous = previousKeys.size ? aggregate(previousKeys) : new Map<string, { area: string; group: string; headcount: number; exits: number }>();
    const months = Math.max(currentKeys.size, 1);
    const scopeHeadcount = Array.from(current.values()).reduce((sum, item) => sum + item.headcount / months, 0);
    return Array.from(current.values()).map((item) => {
      const averageHeadcount = item.headcount / months;
      const rate = item.headcount ? item.exits / item.headcount * 100 : 0;
      const impactPoints = scopeHeadcount ? item.exits / scopeHeadcount * 100 : 0;
      const old = previous.get(item.area);
      const oldRate = old?.headcount ? old.exits / old.headcount * 100 : null;
      const smallBase = averageHeadcount <= SMALL_AREA_THRESHOLD;
      const priority = smallBase
        ? "Base pequeña"
        : rate > MONTHLY_TARGET && item.exits >= 2
          ? "Prioridad alta"
          : item.exits >= 3
            ? "Impacto por volumen"
            : rate > MONTHLY_TARGET
              ? "Vigilar"
              : "Controlado";
      return { ...item, headcount: averageHeadcount, rate, impactPoints, smallBase, priority, variation: oldRate === null ? null : rate - oldRate };
    }).filter((item) => item.exits > 0).sort((a, b) => b.impactPoints - a.impactPoints || b.exits - a.exits || b.rate - a.rate).slice(0, 5);
  }, [selectedPeriodKeys, selectedPeriodSet, availablePeriods, allUnits, area, group, areas, groups]);

  const latestPeriod = availablePeriods.filter((key) => key.startsWith(`${currentYear}-`)).at(-1) ?? `${currentYear}-01`;
  const [latestYear, latestMonth] = latestPeriod.split("-").map(Number);
  const heatmapPeriods = selectedPeriodKeys;
  const heatmapPeriodSet = selectedPeriodSet;
  const heatmapPeriodLabel = isSingleMonth ? rangeLabelText : `Promedio mensual · ${heatmapPeriods.length} periodos`;
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

  const reset = () => { setRangeMode("1m"); setArea(areas[0]); setGroup(groups[0]); setHeatmapFocus(null); };
  return <main className="app-shell">
    <div className="dashboard">
      <header className="masthead">
        <div className="masthead-top">
          <div className="brand-line"><span className="brand-mark">N</span> PEOPLE ANALYTICS · NOGASA</div>
          <div className="masthead-actions">
            <a className="header-link" href="/clasificacion">Clasificación de ceses</a>
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
          <div className="source-stamp"><span>PERIODO MÁS RECIENTE</span><strong>{monthLabel(latestYear, latestMonth)}</strong></div>
        </div>
      </header>

      <section className="hero-metrics">
        <div className="section-heading"><div><p className="kicker">{isAllPeriods ? "DATOS ACUMULADOS DEL RANGO" : "INDICADORES DEL MES"}</p><h2>{rangeLabelText}</h2></div><p>{isAllPeriods ? "Los eventos se acumulan y la dotación corresponde al promedio mensual del rango." : "Último mes cargado. Usa los rangos de abajo para ampliar la vista."}</p></div>
        <div className="range-chips" role="group" aria-label="Rango de meses">
          <button type="button" aria-pressed={rangeMode === "1m"} onClick={() => setRangeMode("1m")}>Último mes</button>
          <button type="button" aria-pressed={rangeMode === "3m"} onClick={() => setRangeMode("3m")}>3 meses</button>
          <button type="button" aria-pressed={rangeMode === "6m"} onClick={() => setRangeMode("6m")}>6 meses</button>
          <button type="button" aria-pressed={rangeMode === "ytd"} onClick={() => setRangeMode("ytd")}>Año {currentYear}</button>
          <button type="button" aria-pressed={rangeMode === "all"} onClick={() => setRangeMode("all")}>Todo</button>
        </div>
        <section className="metric-strip">
          <article><span>Ingresos</span><strong>{summaryHires}</strong><small>{isAllPeriods ? "eventos acumulados" : "eventos del mes"}</small></article>
          <article><span>Ceses</span><strong>{summaryExits}</strong><small>{isAllPeriods ? "eventos acumulados" : "eventos del mes"}</small></article>
          <article><span>Dotación</span><strong>{displayHeadcount(summaryHeadcount)}</strong><small>{isAllPeriods ? "promedio mensual del rango · visual redondeado" : "promedio del mes · visual redondeado"}</small></article>
          <article><span>Rotación total</span><strong>{summaryTurnover.toFixed(2)}%</strong><small>{isAllPeriods ? "promedio mensual del rango" : "resultado del mes"}</small></article>
          <article><span>Rotación no deseada</span><strong>{summaryEmployeeRate.toFixed(2)}%</strong><small>{summaryEmployee} ceses · meta 4%</small></article>
          <article><span>Rotación deseada</span><strong>{summaryCompanyRate.toFixed(2)}%</strong><small>{summaryCompany} ceses · solo referencial</small></article>
        </section>
        <section className="filter-bar" aria-label="Filtros del dashboard">
          <div className="filters">
            <label>Gerencia / área<select value={area} onChange={(e) => { setArea(e.target.value); setHeatmapFocus(null); }}>{areas.map((v) => <option key={v}>{v}</option>)}</select></label>
            <label>Grupo de dotación<select value={group} onChange={(e) => { setGroup(e.target.value); setHeatmapFocus(null); }}>{groups.map((v) => <option key={v}>{v}</option>)}</select></label>
          </div>
          <button className="reset-button" onClick={reset}>Limpiar filtros</button>
        </section>
      </section>

      <section className="evolution-stack">
        <article className="panel">
          <div className="panel-heading"><div><p className="kicker">TENDENCIA GENERAL</p><h3>Rotación total mensual</h3><p>{hasBenchmark ? `${currentYear} vs. ${comparisonYear}: cada punto enfrenta el mismo mes calendario.` : `La serie ${currentYear} está lista; el comparativo se activará al cargar ${comparisonYear}.`}</p></div><span className="badge">{hasBenchmark ? `${currentYear} vs. ${comparisonYear}` : `Pendiente ${comparisonYear}`}</span></div>
          <div className="comparison-summary">
            <article><span>{currentYear} · último mes común</span><strong>{comparisonLatest ? `${comparisonLatest.turnover.toFixed(2)}%` : "Sin datos"}</strong><small>{comparisonLatest?.month ?? "Pendiente"}</small></article>
            <article><span>{comparisonYear} · mismo mes</span><strong>{hasBenchmark && comparisonLatest ? `${comparisonLatest.benchmark.toFixed(2)}%` : "Pendiente"}</strong><small>{hasBenchmark ? "Base comparable" : "Se activará con la carga"}</small></article>
            <article><span>Brecha interanual</span><strong>{comparisonGap === null ? "Pendiente" : `${comparisonGap >= 0 ? "+" : ""}${comparisonGap.toFixed(2)} pp`}</strong><small>Diferencia en puntos porcentuales</small></article>
          </div>
          <LineChart data={comparisonData} series={hasBenchmark ? [{ key: "turnover", color: "#d6001c", label: String(currentYear), format: "percent" }, { key: "benchmark", color: "#0957c3", label: String(comparisonYear), format: "percent" }] : [{ key: "turnover", color: "#d6001c", label: String(currentYear), format: "percent" }]} />
        </article>
        <article className="panel">
          <div className="panel-heading"><div><p className="kicker">TENDENCIA · ROTACIÓN NO DESEADA</p><h3>No deseada, {currentYear} vs. {comparisonYear}</h3><p>{hasBenchmark ? "Mismo mes calendario, solo ceses por decisión del trabajador." : `El comparativo se activará al cargar ${comparisonYear}.`}</p></div><span className="badge">{hasBenchmark ? `${currentYear} vs. ${comparisonYear}` : `Pendiente ${comparisonYear}`}</span></div>
          <div className="comparison-summary">
            <article><span>{currentYear} · último mes común</span><strong>{employeeComparisonLatest ? `${employeeComparisonLatest.turnover.toFixed(2)}%` : "Sin datos"}</strong><small>{employeeComparisonLatest?.month ?? "Pendiente"}</small></article>
            <article><span>{comparisonYear} · mismo mes</span><strong>{hasBenchmark && employeeComparisonLatest ? `${employeeComparisonLatest.benchmark.toFixed(2)}%` : "Pendiente"}</strong><small>{hasBenchmark ? "Base comparable" : "Se activará con la carga"}</small></article>
            <article><span>Brecha interanual</span><strong>{employeeComparisonGap === null ? "Pendiente" : `${employeeComparisonGap >= 0 ? "+" : ""}${employeeComparisonGap.toFixed(2)} pp`}</strong><small>Diferencia en puntos porcentuales</small></article>
          </div>
          <LineChart data={employeeComparisonData} series={hasBenchmark ? [{ key: "turnover", color: "#d6001c", label: String(currentYear), format: "percent" }, { key: "benchmark", color: "#0957c3", label: String(comparisonYear), format: "percent" }] : [{ key: "turnover", color: "#d6001c", label: String(currentYear), format: "percent" }]} showTarget />
        </article>
      </section>

      <section className="worker-analysis panel">
        <div className="panel-heading"><div><p className="kicker">ANÁLISIS DE ROTACIÓN NO DESEADA Y DESERCIÓN</p><h3>Meta, deserción e impacto organizacional</h3><p>La referencia mensual de 4% se compara exclusivamente con los ceses por decisión del trabajador.</p></div><span className={totals.employeeRate <= MONTHLY_TARGET ? "goal-ok" : "goal-alert"}>{totals.employeeRate <= MONTHLY_TARGET ? "Dentro de meta" : "Supera la meta"}</span></div>
        <div className="worker-analysis-grid">
          <article className="worker-rate-card compact">
            <span>Rotación no deseada</span>
            <strong>{totals.employeeRate.toFixed(2)}%</strong>
            {employeeRateGap === null ? <b className="rate-delta neutral">Pendiente {comparisonYear}</b> : <b className={`rate-delta ${employeeRateGap > 0 ? "worse" : "better"}`}>{employeeRateGap >= 0 ? "+" : ""}{employeeRateGap.toFixed(2)} pp vs. {comparisonYear}</b>}
            <small>Meta ≤ 4% · ponderado por dotación</small>
          </article>
          <article>
            <span>Deserción temprana</span>
            <strong>{desert3Count} <small>· {desert3Rate.toFixed(2)}%</small></strong>
            {hasDesertionPrior90 ? <b className={desert3Rate > desert3RatePrior ? "review-alert" : "review-ok"}>{desert3Rate > desert3RatePrior ? "↗" : desert3Rate < desert3RatePrior ? "↘" : "→"} {Math.abs(desert3Rate - desert3RatePrior).toFixed(2)} pp vs. {comparisonYear} ({desert3RatePrior.toFixed(2)}%)</b> : <b className="review-neutral">Pendiente {comparisonYear}</b>}
            <p>{desertionWindowLabel90 || "Sin datos"}. {desert3Count} salidas ÷ {hires90} ingresos.</p>
          </article>
          <article>
            <span>Deserción acumulada</span>
            <strong>{desert6Count} <small>· {desert6Rate.toFixed(2)}%</small></strong>
            {hasDesertionPrior180 ? <b className={desert6Rate > desert6RatePrior ? "review-alert" : "review-ok"}>{desert6Rate > desert6RatePrior ? "↗" : desert6Rate < desert6RatePrior ? "↘" : "→"} {Math.abs(desert6Rate - desert6RatePrior).toFixed(2)} pp vs. {comparisonYear} ({desert6RatePrior.toFixed(2)}%)</b> : <b className="review-neutral">Pendiente {comparisonYear}</b>}
            <p>{desertionWindowLabel180 || "Sin datos"}. {desert6Count} salidas ÷ {hires180} ingresos.</p>
          </article>
          <article>
            <span>Área de mayor impacto</span>
            <strong className="impact-name">{impactArea?.name ?? "Sin datos"}</strong>
            {impactArea ? <b className={impactArea.smallBase ? "review-neutral" : "review-alert"}>{impactArea.rate.toFixed(2)}% · {impactArea.impactPoints.toFixed(2)} pp</b> : <b className="review-neutral">Sin datos</b>}
            <p>{impactArea ? `${impactArea.exits} ceses${impactArea.smallBase ? " · base pequeña" : ""}` : "No hay ceses por decisión del trabajador en la selección."}</p>
          </article>
        </div>
      </section>

      <section className="review-panel panel">
        <div className="panel-heading"><div><p className="kicker">FOCO DE GESTIÓN</p><h3>Principales áreas a revisar</h3><p>Se prioriza el impacto sobre la dotación total y el volumen de ceses, dentro del rango elegido arriba. Las áreas con {SMALL_AREA_THRESHOLD} personas o menos se identifican como base pequeña para evitar sobredimensionar una salida aislada.</p></div><span className="period-chip">{rangeLabelText}</span></div>
        <div className="review-table"><div className="review-head"><span>Área</span><span>Dotación</span><span>Ceses no deseados</span><span>Rotación</span><span>{isSingleMonth ? "Variación mensual" : "Variación vs. rango anterior"}</span></div>{reviewAreas.length ? reviewAreas.map((item) => <article key={item.area} className="review-row"><div><strong>{item.area}</strong><small>{item.group} · {item.priority} · impacto {item.impactPoints.toFixed(2)} pp</small></div><span>{displayHeadcount(item.headcount)}</span><span>{item.exits}</span><span><b className={item.smallBase ? "review-neutral" : item.rate > MONTHLY_TARGET ? "review-alert" : "review-ok"}>{item.rate.toFixed(2)}%</b></span><span>{item.variation === null ? <b className="review-neutral">Sin base</b> : <b className={item.variation > 0 ? "review-alert" : "review-ok"}>{item.variation > 0 ? "↗" : item.variation < 0 ? "↘" : "→"} {Math.abs(item.variation).toFixed(2)} pp</b>}</span></article>) : <p className="empty-review">No hay ceses por decisión del trabajador en el último mes seleccionado.</p>}</div>
      </section>

      <section className="panel heatmap-panel">
        <div className="panel-heading"><div><p className="kicker">FOCO TERRITORIAL Y ORGANIZACIONAL</p><h3>Mapa de calor por región y gerencia</h3><p>{!isSingleMonth ? "Cada celda muestra el promedio de las tasas mensuales del periodo." : "Cada celda muestra la rotación no deseada del mes seleccionado."} Seleccione una celda para revisar sus ciudades.</p></div><span className="badge">{heatmapPeriodLabel}</span></div>
        <div className="heatmap-legend"><span className="legend-good">Dentro de meta ≤ 4%</span><span className="legend-neutral">Sin información</span><span className="legend-alert">Requiere foco &gt; 4%</span></div>
        <div className="heatmap-scroll"><div className="heatmap-grid focus-grid" style={{ gridTemplateColumns: `minmax(250px, 1.5fr) repeat(${MACRO_REGIONS.length}, minmax(115px, 1fr))` }}>
          <div className="heat-corner">Gerencia ↓ / Región →</div>{MACRO_REGIONS.map((region) => <div className="heat-region" key={region}>{region}</div>)}
          {heatmapMatrix.length ? heatmapMatrix.map((item) => <div className="heat-row" key={item.area} style={{ display: "contents" }}><div className="heat-area heat-area-label">{item.area}</div>{item.values.map((value) => <button key={`${item.area}-${value.region}`} type="button" disabled={!value.metric} className={!value.metric ? "heat-cell empty" : value.metric.rate <= MONTHLY_TARGET ? "heat-cell good" : "heat-cell alert"} onClick={() => value.metric && setHeatmapFocus({ area: item.area, region: value.region })}>{value.metric ? `${value.metric.rate.toFixed(2)}%` : "—"}</button>)}</div>) : <div className="heat-cell empty">Sin información</div>}
        </div></div>
        {heatmapFocus && <div className="heat-detail"><div className="heat-detail-heading"><div><p className="kicker">DETALLE POR CIUDAD · {heatmapPeriodLabel.toUpperCase()}</p><h3>{heatmapFocus.area} · Región {heatmapFocus.region}</h3></div><button onClick={() => setHeatmapFocus(null)}>Volver al mapa</button></div><div className="table-wrap"><table><thead><tr><th>Ciudad</th><th>Dotación promedio</th><th>Ceses no deseados</th><th>{!isSingleMonth ? "Rotación promedio" : "Rotación del mes"}</th><th>Evaluación</th></tr></thead><tbody>{cityFocus.length ? cityFocus.map((item) => <tr key={item.city}><td><strong>{item.city}</strong></td><td>{item.metric ? displayHeadcount(item.metric.headcount) : "—"}</td><td>{item.metric?.employee ?? "—"}</td><td><span className="worker-rate">{item.metric ? `${item.metric.rate.toFixed(2)}%` : "—"}</span></td><td><span className={!item.metric ? "review-neutral" : item.metric.headcount <= SMALL_AREA_THRESHOLD && item.metric.employee > 0 ? "review-neutral" : item.metric.rate <= MONTHLY_TARGET ? "review-ok" : "review-alert"}>{!item.metric ? "Sin información" : item.metric.headcount <= SMALL_AREA_THRESHOLD && item.metric.employee > 0 ? "Base pequeña" : item.metric.rate <= MONTHLY_TARGET ? "Dentro de meta" : "Requiere foco"}</span></td></tr>) : <tr><td colSpan={5}>No hay ciudades disponibles para esta selección.</td></tr>}</tbody></table></div></div>}
      </section>

      <section className="panel table-panel">
        <div className="panel-heading"><div><p className="kicker">DETALLE MENSUAL</p><h3>Rotación total y no deseada</h3><p>La meta se evalúa únicamente sobre la rotación no deseada. Columna final: variación vs. el mismo mes de {comparisonYear}.</p></div><span className="badge">{data.length} {data.length === 1 ? "mes" : "meses"}</span></div>
        <div className="table-wrap"><table><thead><tr><th>Mes</th><th>Ingresos</th><th>Ceses</th><th>Dotación prom.</th><th>Rotación total</th><th>No deseada N°</th><th>No deseada %</th><th>vs. {comparisonYear}</th></tr></thead><tbody>{data.map((d) => { const priorRow = benchmarkByMonth.get(d.monthNumber); const priorRate = priorRow && priorRow.headcount ? (priorRow.employee / priorRow.headcount) * 100 : null; const currentRate = d.headcount ? (d.employee / d.headcount) * 100 : 0; const delta = priorRate === null ? null : currentRate - priorRate; return <tr key={d.key}><td><strong>{d.month}</strong></td><td>{d.hires}</td><td>{d.exits}</td><td>{displayHeadcount(d.headcount)}</td><td><span className="rate">{d.turnover.toFixed(2)}%</span></td><td>{d.employee}</td><td><span className="worker-rate">{currentRate.toFixed(2)}%</span></td><td>{delta === null ? <span className="review-neutral">Sin base</span> : <b className={delta > 0 ? "review-alert" : "review-ok"}>{delta > 0 ? "↗" : delta < 0 ? "↘" : "→"} {Math.abs(delta).toFixed(2)} pp</b>}</td></tr>; })}</tbody></table></div>
      </section>

      <MonthlyUploader onUploaded={refreshUploaded} />

      <details className="methodology"><summary>¿Qué se calcula en cada tasa?</summary><div><p><strong>Dotación promedio mensual:</strong> (dotación al inicio del mes + dotación al cierre del mes) ÷ 2. Para el cálculo de tasas se conserva el promedio exacto; en la visualización la dotación se redondea siempre al entero superior para expresarla como personas completas.</p><p><strong>Rotación total:</strong> ceses del periodo ÷ dotación promedio × 100. La rotación no deseada usa sus ceses por decisión del trabajador sobre el mismo denominador; la rotación deseada se muestra solo como referencia en el bloque de indicadores.</p><p><strong>Prioridad de gestión:</strong> el ranking considera el impacto de los ceses sobre la dotación total y el volumen de salidas. Una dotación promedio de {SMALL_AREA_THRESHOLD} personas o menos se marca como base pequeña: conserva su tasa real, pero no se interpreta con el mismo nivel de dolor que un área grande.</p><p><strong>Deserción:</strong> salidas tempranas de la ventana ÷ ingresos de la misma ventana × 100. La ventana temprana toma los 3 meses más recientes al cierre y la acumulada los 6 más recientes; ambas se comparan contra el mismo periodo del año anterior.</p></div></details>
      <footer>Fuente: planillas mensuales y términos de contrato · Último periodo: {monthLabel(latestYear, latestMonth)}</footer>
    </div>
  </main>;
}
