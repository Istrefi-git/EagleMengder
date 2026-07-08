import { useStore } from '../store';
import { buildQuantityReport } from '../lib/quantityReport';
import { formatMm } from '../lib/scale';

interface Props {
  tilbudName: string;
}

/** Ren HTML-tabellversjon av mengderapporten. Usynlig i vanlig visning – vises
 * kun via @media print (se styles.css), slik at «Skriv ut / lagre som PDF»
 * (window.print()) gir et rent rapportark uten verktøylinje/lerret. */
export function PrintableReport({ tilbudName }: Props) {
  const lines = useStore((s) => s.lines);
  const symbols = useStore((s) => s.symbols);
  const transitions = useStore((s) => s.transitions);
  const branches = useStore((s) => s.branches);
  const bends = useStore((s) => s.bends);
  const scale = useStore((s) => s.scale);
  const standardLengths = useStore((s) => s.standardLengths);

  const report = buildQuantityReport(lines, symbols, transitions, branches, scale, standardLengths, bends);
  const totalMm = report.rows.reduce((a, r) => a + r.lengdeMm, 0);

  return (
    <div className="printable-report">
      <h1>Mengdeliste – {tilbudName}</h1>
      <p className="printable-meta">
        Målestokk: {scale.label} · Generert {new Date().toLocaleDateString('nb-NO')}
      </p>
      <table>
        <thead>
          <tr>
            <th>System</th>
            <th>Underkategori</th>
            <th>Materiale</th>
            <th>Dimensjon</th>
            <th>Lengde (mm)</th>
            <th>Antall</th>
            <th>Type</th>
          </tr>
        </thead>
        <tbody>
          {report.rows.map((r, i) => (
            <tr key={i}>
              <td>{r.system}</td>
              <td>{r.underkategori}</td>
              <td>{r.materiale}</td>
              <td>{r.dimensjon}</td>
              <td>{r.lengdeMm > 0 ? r.lengdeMm.toLocaleString('nb-NO') : ''}</td>
              <td>{r.antall}</td>
              <td>{r.type}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="printable-total">Total rørlengde: {formatMm(totalMm)}</p>
    </div>
  );
}
