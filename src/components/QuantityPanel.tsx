import { ArrowRightLeft, CornerUpRight, GitFork, Link2, Maximize2, Minimize2, Wrench } from 'lucide-react';
import { useStore } from '../store';
import { CATEGORIES, CLAMP_ROD_LABEL, CLAMP_ROD_LENGTH_MM, SYMBOL_DEFS, SYMBOL_TYPE_ORDER, colorFor } from '../types';
import { buildQuantityReport, categoryTotalMm } from '../lib/quantityReport';
import { formatMm } from '../lib/scale';

export function QuantityPanel() {
  const lines = useStore((s) => s.lines);
  const symbols = useStore((s) => s.symbols);
  const transitions = useStore((s) => s.transitions);
  const branches = useStore((s) => s.branches);
  const bends = useStore((s) => s.bends);
  const clamps = useStore((s) => s.clamps);
  const customColors = useStore((s) => s.customColors);
  const scale = useStore((s) => s.scale);
  const standardLengths = useStore((s) => s.standardLengths);
  const focusMode = useStore((s) => s.focusMode);
  const toggleFocusMode = useStore((s) => s.toggleFocusMode);
  const setMultiSelection = useStore((s) => s.setMultiSelection);
  const clearSelection = useStore((s) => s.clearSelection);
  const mpp = scale.metersPerPixel;

  const report = buildQuantityReport(lines, symbols, transitions, branches, scale, standardLengths, bends, clamps);
  const {
    subTotal,
    subCount,
    subDetail,
    totalBends,
    totalJoints,
    symbolCounts,
    symbolDetail,
    bendCounts,
    jointCounts,
    branchCounts,
    transitionCounts,
    clampCounts,
    totalClamps,
    subLineIds,
    subDetailIds,
    symbolDetailIds,
    bendIds,
    jointIds,
    branchIds,
    transitionIds,
    clampIds,
  } = report;

  /** Uthever alt tegnet av samme type på lerretet (gjenbruker multiSelection, som
   * PdfCanvas allerede tegner en oransje glød for), når man klikker en mengdelinje. */
  const highlight = (ids: string[] | undefined) => {
    if (!ids || ids.length === 0) return;
    clearSelection();
    setMultiSelection(ids);
  };

  // Vis kun kategorier/underkategorier som faktisk har noe tegnet – mengdelisten
  // skal speile prosjektet, ikke fungere som en alltid-full katalog.
  const visibleCategories = CATEGORIES.filter((cat) => categoryTotalMm(report, cat.code) > 0);
  const hasAnyData = visibleCategories.length > 0;
  const totalAutoCount = totalBends + totalJoints + branches.length + transitions.length + totalClamps;

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

      {!hasAnyData && (
        <p className="muted qty-empty-note qty-empty-root">
          Ingen mengder registrert ennå. Velg et rør/kanal-verktøy i venstre meny og
          tegn på PDF-en for å se mengder her.
        </p>
      )}

      {visibleCategories.map((cat) => (
        <div key={cat.code} className="qty-block">
          <div className="qty-block-title">
            <span>
              <span className="qty-cat-code">{cat.code}</span> {cat.label}
            </span>
            <span className="qty-total">{formatMm(categoryTotalMm(report, cat.code))}</span>
          </div>
          {cat.subs.filter((sub) => subCount[sub.id] > 0).map((sub) => {
            const detail = subDetail[sub.id];
            const subColor = colorFor(sub, customColors);
            return (
              <div key={sub.id} className="qty-sub">
                <div
                  className="qty-row qty-clickable"
                  title="Klikk for å utheve alt tegnet av denne typen"
                  onClick={() => highlight(subLineIds[sub.id])}
                >
                  <span className="qty-label">
                    <span
                      className="qty-swatch"
                      style={{
                        background: cat.kind === 'duct' ? 'transparent' : subColor,
                        borderColor: subColor,
                        borderStyle: cat.kind === 'duct' ? 'dashed' : 'solid',
                      }}
                    />
                    {sub.label}
                    {subCount[sub.id] > 0 && <span className="qty-count">×{subCount[sub.id]}</span>}
                  </span>
                  <span className="qty-value">{formatMm(subTotal[sub.id] ?? 0)}</span>
                </div>
                {detail &&
                  Object.entries(detail).map(([key, mm]) => (
                    <div
                      key={key}
                      className="qty-detail qty-clickable"
                      title="Klikk for å utheve alt tegnet av denne typen"
                      onClick={() => highlight(subDetailIds[sub.id]?.[key])}
                    >
                      <span>{key}</span>
                      <span className="qty-value">{formatMm(mm)}</span>
                    </div>
                  ))}
              </div>
            );
          })}
        </div>
      ))}

      {totalAutoCount > 0 && (
        <div className="qty-block">
          <div className="qty-block-title">
            <span>Automatisk genererte deler</span>
          </div>
          <div
            className="qty-row"
            title="Telles automatisk ut fra retningsendringer i tegnede rør/kanaler."
          >
            <span className="qty-label">
              <CornerUpRight size={13} className="qty-auto-icon" />
              Bend
            </span>
            <span className="qty-value">{totalBends} stk</span>
          </div>
          {totalBends > 0 &&
            Object.entries(bendCounts).map(([key, count]) => (
              <div
                key={key}
                className="qty-detail bend qty-clickable"
                title="Klikk for å utheve alt tegnet av denne typen"
                onClick={() => highlight(bendIds[key])}
              >
                <span>{key}</span>
                <span className="qty-value">{count} stk</span>
              </div>
            ))}
          <div
            className="qty-row"
            title="Nippel legges til for kanaler over standardlengden, muffe for rør."
          >
            <span className="qty-label">
              <Link2 size={13} className="qty-auto-icon" />
              Skjøter (Nippel/Muffe)
            </span>
            <span className="qty-value">{totalJoints} stk</span>
          </div>
          {totalJoints > 0 &&
            Object.entries(jointCounts).map(([key, count]) => (
              <div
                key={key}
                className="qty-detail joint qty-clickable"
                title="Klikk for å utheve alt tegnet av denne typen"
                onClick={() => highlight(jointIds[key])}
              >
                <span>{key}</span>
                <span className="qty-value">{count} stk</span>
              </div>
            ))}
          <div
            className="qty-row"
            title="Settes inn når du tegner et nytt rør/kanal videre fra et eksisterende."
          >
            <span className="qty-label">
              <GitFork size={13} className="qty-auto-icon" />
              Avgreininger
            </span>
            <span className="qty-value">{branches.length} stk</span>
          </div>
          {branches.length > 0 &&
            Object.entries(branchCounts).map(([key, count]) => (
              <div
                key={key}
                className="qty-detail branch qty-clickable"
                title="Klikk for å utheve alt tegnet av denne typen"
                onClick={() => highlight(branchIds[key])}
              >
                <span>{key}</span>
                <span className="qty-value">{count} stk</span>
              </div>
            ))}
          <div
            className="qty-row"
            title="Legges til når du bytter dimensjon midt i en tegning."
          >
            <span className="qty-label">
              <ArrowRightLeft size={13} className="qty-auto-icon" />
              Overganger
            </span>
            <span className="qty-value">{transitions.length} stk</span>
          </div>
          {transitions.length > 0 &&
            Object.entries(transitionCounts).map(([key, count]) => (
              <div
                key={key}
                className="qty-detail qty-clickable"
                title="Klikk for å utheve alt tegnet av denne typen"
                onClick={() => highlight(transitionIds[key])}
              >
                <span>{key}</span>
                <span className="qty-value">{count} stk</span>
              </div>
            ))}
          {totalClamps > 0 && (
            <>
              <div
                className="qty-row"
                title="Settes inn automatisk ved tegning når «Klammer/gjengestag»-innstillingen er på."
              >
                <span className="qty-label">
                  <Wrench size={13} className="qty-auto-icon" />
                  Klammer
                </span>
                <span className="qty-value">{totalClamps} stk</span>
              </div>
              {Object.entries(clampCounts).map(([key, count]) => (
                <div
                  key={key}
                  className="qty-detail qty-clickable"
                  title="Klikk for å utheve alt tegnet av denne typen"
                  onClick={() => highlight(clampIds[key])}
                >
                  <span>{key}</span>
                  <span className="qty-value">{count} stk</span>
                </div>
              ))}
              <div className="qty-row" title="200 mm gjengestag per klammer.">
                <span className="qty-label">
                  <Wrench size={13} className="qty-auto-icon" />
                  {CLAMP_ROD_LABEL}
                </span>
                <span className="qty-value">{formatMm(totalClamps * CLAMP_ROD_LENGTH_MM)}</span>
              </div>
            </>
          )}
        </div>
      )}

      {symbols.length > 0 && (
        <div className="qty-block">
          <div className="qty-block-title">
            <span>Komponenter</span>
            <span className="qty-total">{symbols.length} stk</span>
          </div>
          {SYMBOL_TYPE_ORDER.filter((t) => symbolCounts[t] > 0).map((t) => (
            <div key={t}>
              <div
                className="qty-row qty-clickable"
                title="Klikk for å utheve alt tegnet av denne typen"
                onClick={() => highlight(Object.values(symbolDetailIds[t] ?? {}).flat())}
              >
                <span className="qty-label">
                  <span className="qty-swatch comp" />
                  {SYMBOL_DEFS[t].label}
                </span>
                <span className="qty-value">{symbolCounts[t]} stk</span>
              </div>
              {Object.entries(symbolDetail[t] ?? {}).map(([key, count]) => (
                <div
                  key={key}
                  className="qty-detail comp qty-clickable"
                  title="Klikk for å utheve alt tegnet av denne typen"
                  onClick={() => highlight(symbolDetailIds[t]?.[key])}
                >
                  <span>{key}</span>
                  <span className="qty-value">{count} stk</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
