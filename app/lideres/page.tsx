// Aggregate snapshot only: no names, document identifiers or personnel records.
const months = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto"];
// Source: approved 142-person roster, company hire/exit dates, cutoff 2026-08-31.
const rows = [
  [116, 112, 1, 5, 4],
  [112, 117, 6, 1, 1],
  [117, 117, 2, 2, 2],
  [117, 116, 0, 1, 1],
  [116, 122, 8, 2, 2],
  [122, 122, 2, 2, 1],
  [122, 124, 7, 5, 4],
  [124, 121, 0, 3, 2],
];
const rate = (count: number, average: number) => average ? `${(count / average * 100).toFixed(2)}%` : "—";

export default function LeadersPage() {
  return <main className="app-shell"><div className="dashboard">
    <header className="masthead">
      <div className="masthead-top"><div className="brand-line"><span className="brand-mark">N</span> PEOPLE ANALYTICS · NOGASA</div><a className="header-link" href="/">Volver al tablero general</a></div>
      <div className="masthead-copy"><div><p className="eyebrow">GESTIÓN DE PERSONAS</p><h1>Rotación de líderes</h1><p className="masthead-subtitle">Rotación mensual y no deseada · Enero–agosto 2026</p></div><div className="source-stamp"><span>LISTADO MAESTRO APROBADO</span><strong>142 personas</strong></div></div>
    </header>
    <section className="panel">
      <div className="panel-heading"><div><p className="kicker">DETALLE MENSUAL</p><h2>Rotación total y no deseada</h2><p>Dotación calculada desde la fecha de ingreso a la empresa hasta el cese.</p></div><span className="badge">Cierre 31/08/2026</span></div>
      <div className="table-wrap"><table><thead><tr><th>Mes</th><th>Inicio</th><th>Ingresos</th><th>Ceses</th><th>Cierre</th><th>Dotación prom.</th><th>Rotación total</th><th>No deseada N°</th><th>No deseada %</th></tr></thead><tbody>
        {rows.map(([start, end, hires, exits, unwanted], i) => {
          const average = (start + end) / 2;
          return <tr key={months[i]}><td><strong>{months[i]}</strong></td><td>{start}</td><td>{hires}</td><td>{exits}</td><td>{end}</td><td>{average.toLocaleString("es-PE")}</td><td><span className="rate">{rate(exits, average)}</span></td><td>{unwanted}</td><td><span className="worker-rate">{rate(unwanted, average)}</span></td></tr>;
        })}
      </tbody></table></div>
    </section>
    <details className="methodology" open><summary>Fuente y criterios de cálculo</summary><div>
      <p><strong>Población:</strong> listado maestro Líderes 2026 y cuatro incorporaciones aprobadas. Las 142 personas no representan una dotación mensual fija.</p>
      <p><strong>Dotación promedio:</strong> (inicio + cierre) ÷ 2. Inicio corresponde al cierre del mes anterior. Los ingresos del primer día se cuentan como ingresos del mes; los ceses del último día se excluyen del cierre. Las tasas conservan el promedio exacto.</p>
      <p><strong>Rotación total:</strong> ceses ÷ dotación promedio × 100. <strong>No deseada:</strong> renuncia y mutuo disenso ÷ la misma dotación promedio × 100.</p>
      <p><strong>Alcance:</strong> corte independiente al 31/08/2026, elaborado con el maestro y la planilla de agosto para las incorporaciones. No incorpora reclasificaciones manuales del tablero general ni se actualiza con sus cargas mensuales. Requiere actualizar esta base para incorporar nuevos periodos o cambios de clasificación.</p>
    </div></details>
  </div></main>;
}
