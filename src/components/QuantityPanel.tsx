import { ArrowDownWideNarrow, ArrowUpNarrowWide, Maximize2, Minimize2 } from 'lucide-react';
import { useStore } from '../store';
import { buildQuantityReport } from '../lib/quantityReport';
import { groupQuantity } from '../lib/quantityGroups';
import type { GroupBy, SortBy } from '../lib/quantityGroups';
import { formatMm } from '../lib/scale';

/** Type-strengene som allerede ikke gir mening å gjenta ved siden av dimensjonen,
 * fordi radens EGEN dimensjonskolonne allerede sier akkurat dette (kanallengde/
 * rørlengde/komponent er «default»-typer – bend/skjøt/avgreining/overgang/klammer/
 * gjengestag er derimot informative og vises). */
const IMPLICIT_TYPES = new Set(['Kanallengde', 'Rørlengde', 'Komponent']);

export function QuantityPanel() {
  const currentPage = useStore((s) => s.currentPage);
  const fileName = useStore((s) => s.fileName);
  const drawingCount = useStore((s) => s.drawings.length);
  // Mengdelisten viser KUN den aktive tegningens egne mengder (med dens egen
  // målestokk, allerede holdt i synk i `s.scale` – se setPage i store.ts). Uten dette
  // filteret ville f.eks. to tegninger i ulik målestokk blitt lagt sammen med kun ÉN
  // av dem sin målestokk, med feil lengder som resultat – se PLAN.md «Flere tegninger».
  const lines = useStore((s) => s.lines.filter((l) => l.page === currentPage));
  const symbols = useStore((s) => s.symbols.filter((sy) => sy.page === currentPage));
  const transitions = useStore((s) => s.transitions.filter((t) => t.page === currentPage));
  const branches = useStore((s) => s.branches.filter((b) => b.page === currentPage));
  const bends = useStore((s) => s.bends.filter((b) => b.page === currentPage));
  const clamps = useStore((s) => s.clamps.filter((c) => c.page === currentPage));
  const customComponents = useStore((s) => s.customComponents);
  const scale = useStore((s) => s.scale);
  const standardLengths = useStore((s) => s.standardLengths);
  const focusMode = useStore((s) => s.focusMode);
  const toggleFocusMode = useStore((s) => s.toggleFocusMode);
  const setMultiSelection = useStore((s) => s.setMultiSelection);
  const clearSelection = useStore((s) => s.clearSelection);
  const groupBy = useStore((s) => s.quantityGroupBy);
  const setGroupBy = useStore((s) => s.setQuantityGroupBy);
  const sortBy = useStore((s) => s.quantitySortBy);
  const setSortBy = useStore((s) => s.setQuantitySortBy);
  const sortDir = useStore((s) => s.quantitySortDir);
  const setSortDir = useStore((s) => s.setQuantitySortDir);
  const mpp = scale.metersPerPixel;

  const report = buildQuantityReport(
    lines,
    symbols,
    transitions,
    branches,
    scale,
    standardLengths,
    bends,
    clamps,
    customComponents,
  );
  const groups = groupQuantity(report, { groupBy, sortBy, sortDir });
  const hasAnyData = report.rows.length > 0;

  /** Uthever alt tegnet av samme type på lerretet (gjenbruker multiSelection, som
   * PdfCanvas allerede tegner en oransje glød for), når man klikker en mengdelinje. */
  const highlight = (ids: string[]) => {
    if (ids.length === 0) return;
    clearSelection();
    setMultiSelection(ids);
  };

  return (
    <section className="quantity-panel">
      <div className="panel-header">
        <h3>
          Mengdeliste
          {/* Kun ved flere tegninger – ellers er navnet støy alle allerede vet. */}
          {drawingCount > 1 && fileName && <span className="panel-subheading"> · {fileName}</span>}
        </h3>
        <div className="panel-header-actions">
          {mpp == null && <span className="badge warn">Sett målestokk</span>}
          <button
            className="btn icon"
            onClick={toggleFocusMode}
            title={focusMode ? 'Vis tegneverktøy igjen (Esc)' : 'Vis kun mengdeliste'}
          >
            {focusMode ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>
      </div>

      {hasAnyData && (
        <div className="qty-controls">
          <label className="qty-control">
            <span>Grupper</span>
            <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)}>
              <option value="system">System</option>
              <option value="dimension">Dimensjon</option>
              <option value="material">Materiale</option>
            </select>
          </label>
          <label className="qty-control">
            <span>Sorter</span>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortBy)}>
              <option value="name">Navn</option>
              <option value="length">Lengde</option>
              <option value="count">Antall</option>
            </select>
          </label>
          <button
            className="btn icon"
            onClick={() => setSortDir(sortDir === 'asc' ? 'desc' : 'asc')}
            title={sortDir === 'asc' ? 'Stigende – klikk for synkende' : 'Synkende – klikk for stigende'}
          >
            {sortDir === 'asc' ? <ArrowUpNarrowWide size={14} /> : <ArrowDownWideNarrow size={14} />}
          </button>
        </div>
      )}

      {!hasAnyData && (
        <p className="muted qty-empty-note qty-empty-root">
          Ingen mengder registrert ennå. Velg et rør/kanal-verktøy i venstre meny og
          tegn på PDF-en for å se mengder her.
        </p>
      )}

      {groups.map((group) => (
        <div key={group.key} className="qty-block">
          <div className="qty-block-title">
            <span>{group.key}</span>
            <span className="qty-total">
              {group.totalLengthMm > 0 ? formatMm(group.totalLengthMm) : `${group.totalCount} stk`}
            </span>
          </div>
          {group.rows.map((row, i) => (
            <div
              key={i}
              className="qty-row qty-clickable"
              title="Klikk for å utheve alt tegnet av denne typen"
              onClick={() => highlight(row.ids)}
            >
              <span className="qty-label">
                {row.underkategori}
                {row.materiale ? ` · ${row.materiale}` : ''}
                {row.dimensjon ? ` · ${row.dimensjon}` : ''}
                {!IMPLICIT_TYPES.has(row.type) ? ` · ${row.type}` : ''}
                <span className="qty-count">×{row.antall}</span>
              </span>
              <span className="qty-value">{row.lengdeMm > 0 ? formatMm(row.lengdeMm) : `${row.antall} stk`}</span>
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}
