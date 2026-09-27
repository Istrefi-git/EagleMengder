import { useStore } from '../store';
import { buildQuantityReportsByDrawing } from '../lib/quantityReport';
import { groupQuantity } from '../lib/quantityGroups';
import type { QuantityGroup } from '../lib/quantityGroups';
import { formatMm } from '../lib/scale';

interface Props {
  tilbudName: string;
}

function QuantityTable({ groups, totalMm }: { groups: QuantityGroup[]; totalMm: number }) {
  return (
    <>
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
    </>
  );
}

/** Ren HTML-tabellversjon av mengderapporten. Usynlig i vanlig visning – vises
 * kun via @media print (se styles.css), slik at «Skriv ut / lagre som PDF»
 * (window.print()) gir et rent rapportark uten verktøylinje/lerret.
 *
 * Viser TOTALEN (alle tegninger slått sammen, se buildQuantityReportsByDrawing i
 * quantityReport.ts) først, deretter én seksjon PER TEGNING med sitt eget fangede
 * bilde (satt av TopBar.printReport rett før utskrift, se store.printSections) og
 * sin egen mengdeliste (egen målestokk). */
export function PrintableReport({ tilbudName }: Props) {
  const lines = useStore((s) => s.lines);
  const symbols = useStore((s) => s.symbols);
  const transitions = useStore((s) => s.transitions);
  const branches = useStore((s) => s.branches);
  const bends = useStore((s) => s.bends);
  const clamps = useStore((s) => s.clamps);
  const customComponents = useStore((s) => s.customComponents);
  const drawings = useStore((s) => s.drawings);
  const standardLengths = useStore((s) => s.standardLengths);
  const quantityGroupBy = useStore((s) => s.quantityGroupBy);
  const quantitySortBy = useStore((s) => s.quantitySortBy);
  const quantitySortDir = useStore((s) => s.quantitySortDir);
  const printSections = useStore((s) => s.printSections);

  const byDrawing = buildQuantityReportsByDrawing(
    drawings,
    lines,
    symbols,
    transitions,
    branches,
    standardLengths,
    bends,
    clamps,
    customComponents,
  );
  const groupOpts = { groupBy: quantityGroupBy, sortBy: quantitySortBy, sortDir: quantitySortDir };
  // Totalen slår sammen RADENE (allerede i mm) fra alle tegningene – riktig selv når
  // de har ulik målestokk, se kommentaren i buildQuantityReportsByDrawing.
  const totalGroups = groupQuantity({ rows: byDrawing.flatMap((d) => d.report.rows) }, groupOpts);
  const totalMm = byDrawing.reduce((a, d) => a + d.report.rows.reduce((b, r) => b + r.lengdeMm, 0), 0);

  return (
    <div className="printable-report">
      <div className="printable-table-page">
        <h1>Mengdeliste – {tilbudName}</h1>
        <p className="printable-meta">
          Totalt for {drawings.length} tegning{drawings.length === 1 ? '' : 'er'} · Generert{' '}
          {new Date().toLocaleDateString('nb-NO')}
        </p>
        <QuantityTable groups={totalGroups} totalMm={totalMm} />
      </div>
      {printSections?.map((section) => {
        const drawing = drawings.find((d) => d.id === section.drawingId);
        const d = byDrawing.find((x) => x.drawingId === section.drawingId);
        const name = drawing?.name ?? d?.drawingName ?? '';
        const groups = d ? groupQuantity(d.report, groupOpts) : [];
        const sectionTotalMm = d ? d.report.rows.reduce((a, r) => a + r.lengdeMm, 0) : 0;
        return (
          <div className="printable-table-page" key={section.drawingId}>
            {section.image && (
              <div className="printable-drawing">
                <h1>Tegning – {name}</h1>
                <img src={section.image} alt={`Tegning ${name}`} />
              </div>
            )}
            <h1>Mengdeliste – {name}</h1>
            <p className="printable-meta">
              Målestokk: {drawing?.scale.label ?? ''} · Generert {new Date().toLocaleDateString('nb-NO')}
            </p>
            <QuantityTable groups={groups} totalMm={sectionTotalMm} />
          </div>
        );
      })}
    </div>
  );
}
