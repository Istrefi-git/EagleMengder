import { ArrowDownWideNarrow, ArrowUpNarrowWide, Maximize2, Minimize2 } from 'lucide-react';
import { useState } from 'react';
import { useStore } from '../store';
import { buildQuantityReportsByDrawing } from '../lib/quantityReport';
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
  const drawings = useStore((s) => s.drawings);
  const lines = useStore((s) => s.lines);
  const symbols = useStore((s) => s.symbols);
  const transitions = useStore((s) => s.transitions);
  const branches = useStore((s) => s.branches);
  const bends = useStore((s) => s.bends);
  const clamps = useStore((s) => s.clamps);
  // Hvilke tegninger mengdelista viser. `null` = følg den aktive tegningen (standard).
  // Klikk på et tegningsnavn slår den av/på; flere kan være valgt samtidig, og «Alle»
  // gir totalen for hele tilbudet.
  const [picked, setPicked] = useState<number[] | null>(null);
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

  const validPicked = picked?.filter((id) => drawings.some((d) => d.id === id)) ?? null;
  const shownIds = validPicked && validPicked.length > 0 ? validPicked : [currentPage];
  const allShown = drawings.length > 0 && drawings.every((d) => shownIds.includes(d.id));
  const toggleDrawing = (id: number) => {
    const next = shownIds.includes(id) ? shownIds.filter((x) => x !== id) : [...shownIds, id];
    setPicked(next.length > 0 ? next : null);
  };

  // Én rapport per tegning (med tegningens EGEN målestokk), og radene – allerede i mm –
  // slås sammen for de valgte tegningene. Riktig også når tegningene har ulik målestokk.
  const byDrawing = buildQuantityReportsByDrawing(
    drawings.filter((d) => shownIds.includes(d.id)),
    lines,
    symbols,
    transitions,
    branches,
    standardLengths,
    bends,
    clamps,
    customComponents,
  );
  // Uten noen tegning (ingen PDF lastet) finnes det ingen DrawingEntity – vis da alt
  // på gjeldende side med gjeldende målestokk, som før.
  const rows =
    drawings.length > 0
      ? byDrawing.flatMap((d) => d.report.rows)
      : buildQuantityReportsByDrawing(
          [{ id: currentPage, name: '', scale }],
          lines,
          symbols,
          transitions,
          branches,
          standardLengths,
          bends,
          clamps,
          customComponents,
        )[0].report.rows;
  const groups = groupQuantity({ rows }, { groupBy, sortBy, sortDir });
  const hasAnyData = rows.length > 0;

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
        <h3>Mengdeliste</h3>
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

      {drawings.length > 1 && (
        <div className="qty-drawings">
          <button
            className={`qty-drawing-chip ${allShown ? 'active' : ''}`}
            onClick={() => setPicked(allShown ? null : drawings.map((d) => d.id))}
            title="Vis totalen for alle tegningene"
          >
            Alle
          </button>
          {drawings.map((d) => (
            <button
              key={d.id}
              className={`qty-drawing-chip ${shownIds.includes(d.id) ? 'active' : ''}`}
              onClick={() => toggleDrawing(d.id)}
              title={d.name}
            >
              {d.name}
            </button>
          ))}
        </div>
      )}

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
