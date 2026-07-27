import { useStore } from '../store';
import { buildQuantityReport } from '../lib/quantityReport';
import { groupQuantity } from '../lib/quantityGroups';
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
  const clamps = useStore((s) => s.clamps);
  const scale = useStore((s) => s.scale);
  const standardLengths = useStore((s) => s.standardLengths);
  const quantityGroupBy = useStore((s) => s.quantityGroupBy);
  const quantitySortBy = useStore((s) => s.quantitySortBy);
  const quantitySortDir = useStore((s) => s.quantitySortDir);
  const printImage = useStore((s) => s.printImage);

  const report = buildQuantityReport(lines, symbols, transitions, branches, scale, standardLengths, bends, clamps);
  // Samme gruppering/sortering som brukeren har valgt i mengdelisten (QuantityPanel)
  // og i Excel-eksporten, slik at skjerm/PDF/Excel alltid stemmer overens.
  const groups = groupQuantity(report, {
    groupBy: quantityGroupBy,
    sortBy: quantitySortBy,
    sortDir: quantitySortDir,
  });
  const totalMm = report.rows.reduce((a, r) => a + r.lengdeMm, 0);

  return (
    <div className="printable-report">
      {printImage && (
        <div className="printable-drawing">
          <h1>Tegning – {tilbudName}</h1>
          <img src={printImage} alt="Tegning med mengdeuttak" />
        </div>
      )}
      <div className="printable-table-page">
        <h1>Mengdeliste – {tilbudName}</h1>
        <p className="printable-meta">
          Målestokk: {scale.label} · Generert {new Date().toLocaleDateString('nb-NO')}
        </p>
        <table>
          <thead>
            <tr>
              <th>Gruppe</th>
              <th>Underkategori</th>
              <th>Materiale</th>
              <th>Dimensjon</th>
              <th>Lengde (mm)</th>
              <th>Antall</th>
              <th>Type</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) =>
              g.rows.map((r, i) => (
                <tr key={`${g.key}-${i}`}>
                  <td>{g.key}</td>
                  <td>{r.underkategori}</td>
                  <td>{r.materiale}</td>
                  <td>{r.dimensjon}</td>
                  <td>{r.lengdeMm > 0 ? r.lengdeMm.toLocaleString('nb-NO') : ''}</td>
                  <td>{r.antall}</td>
                  <td>{r.type}</td>
                </tr>
              )),
            )}
          </tbody>
        </table>
        <p className="printable-total">Total rørlengde: {formatMm(totalMm)}</p>
      </div>
    </div>
  );
}
